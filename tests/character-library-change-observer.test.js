import { afterEach, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { createCharacterLibraryChangeObserver } from '../src/character-library-change-observer.js';

const cleanup = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition) {
    for (let i = 0; i < 100; i++) { if (condition()) return; await pause(10); }
    throw new Error('Timed out waiting for observer');
}
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-observer-'));
    fs.mkdirSync(path.join(root, 'storage'));
    cleanup.push(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, 'storage', 'emberdesk.sqlite');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE changes (value TEXT)');
    cleanup.push(() => { if (db.isOpen) db.close(); });
    return { root, file, db };
}
function observer(options = {}) {
    const instance = createCharacterLibraryChangeObserver({ pollMs: 10, lifetimeMs: 1000, ...options });
    cleanup.push(() => instance.dispose());
    return instance;
}

test('same-process and real child commits invalidate, rollback and other users do not', async () => {
    const a = fixture(); const b = fixture(); const service = observer();
    let changes = 0; let other = 0;
    service.subscribe(a, { invalidate: () => changes++, close() {} });
    service.subscribe(b, { invalidate: () => other++, close() {} });
    a.db.exec("INSERT INTO changes VALUES ('local')");
    await until(() => changes === 1);
    a.db.exec("BEGIN; INSERT INTO changes VALUES ('rollback'); ROLLBACK");
    await pause(40);
    expect(changes).toBe(1);
    execFileSync(process.execPath, ['--input-type=module', '-e', "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec(\"INSERT INTO changes VALUES ('child')\"); db.close();", a.file]);
    await until(() => changes === 2);
    expect(other).toBe(0);
});

test('shared read-only connection, unsubscribe, quotas, disposal and polling errors release resources', async () => {
    const a = fixture(); const opened = []; let closed = 0;
    const service = observer({ maxPerUser: 2, maxTotal: 2, openDatabase(file) {
        const db = new DatabaseSync(file, { readOnly: true }); opened.push(db); return db;
    } });
    const off = service.subscribe(a, { invalidate() {}, close() { closed++; } });
    service.subscribe(a, { invalidate() {}, close() { closed++; } });
    expect(opened).toHaveLength(1);
    expect(() => opened[0].exec("INSERT INTO changes VALUES ('forbidden')")).toThrow();
    expect(() => service.subscribe(a, {})).toThrow(/limit/i);
    off(); off();
    expect(opened[0].isOpen).toBe(true);
    opened[0].close(); // Real connection failure on the next poll.
    await until(() => closed === 1);
    const last = service.subscribe(a, { invalidate() {}, close() { closed++; } });
    last();
    expect(opened[1].isOpen).toBe(false);
    service.subscribe(a, { invalidate() {}, close() { closed++; } });
    service.dispose(); service.dispose();
    expect(opened[2].isOpen).toBe(false);
    expect(() => service.subscribe(a, {})).toThrow();
});

test('rotation closes every subscriber despite later joins and reconnect observes replaced database', async () => {
    const a = fixture(); const replacement = fixture(); const opened = []; let closed = 0;
    const service = observer({ lifetimeMs: 120, openDatabase(file) {
        const db = new DatabaseSync(file, { readOnly: true }); opened.push(db); return db;
    } });
    service.subscribe(a, { invalidate() {}, close() { closed++; } });
    await pause(60);
    service.subscribe(a, { invalidate() {}, close() { closed++; } });
    // Replace a real database file while the old observer still owns its inode.
    a.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); a.db.close();
    replacement.db.exec("INSERT INTO changes VALUES ('replacement'); PRAGMA wal_checkpoint(TRUNCATE)"); replacement.db.close();
    fs.renameSync(replacement.file, a.file);
    await until(() => closed === 2);
    expect(opened[0].isOpen).toBe(false);
    service.subscribe(a, { invalidate() {}, close() {} });
    expect(opened).toHaveLength(2);
    expect(opened[1].prepare('SELECT value FROM changes').get().value).toBe('replacement');
});

test('missing database is not created or initialized', () => {
    const a = fixture(); a.db.close(); fs.rmSync(a.file);
    expect(() => observer().subscribe(a, {})).toThrow();
    expect(fs.existsSync(a.file)).toBe(false);
});

test('commits before baseline are queryable and commits immediately after registration notify', async () => {
    const a = fixture();
    a.db.exec("INSERT INTO changes VALUES ('before')");
    let changes = 0;
    const service = observer();
    service.subscribe(a, { invalidate() { changes++; }, close() {} });
    expect(a.db.prepare('SELECT COUNT(*) AS n FROM changes').get().n).toBe(1);
    a.db.exec("INSERT INTO changes VALUES ('after')");
    await until(() => changes === 1);
    expect(a.db.prepare('SELECT COUNT(*) AS n FROM changes').get().n).toBe(2);
});

test('process quota covers different users and becomes available on unsubscribe', () => {
    const a = fixture(); const b = fixture();
    const service = observer({ maxPerUser: 8, maxTotal: 1 });
    const off = service.subscribe(a, {});
    expect(() => service.subscribe(b, {})).toThrow(/limit/i);
    off();
    expect(() => service.subscribe(b, {})).not.toThrow();
});
