import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from '@jest/globals';
import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { writeCanonicalChatPayload, renameCanonicalChat, deleteCanonicalChat } from '../src/endpoints/canonical-chat-write-service.js';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-stats-atomic-'));
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    cleanups.push(() => { manager.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
    const db = manager.open({ handle: 'alice', directories: { root, storage: path.join(root, 'storage') }, featureFlags: { enabled: true, strict: true } });
    runCanonicalMigrations(db);
    db.prepare(`INSERT INTO characters (id, avatar_filename, internal_name, display_name, card_json, shallow_json, created_at_ms, updated_at_ms)
        VALUES ('character-a', 'alice.png', 'alice', 'Alice', '{}', '{}', 1, 1)`).run();
    db.exec("INSERT INTO character_chat_stats VALUES ('character-a', 0, 0, 0, 1)");
    const reader = new DatabaseSync(path.join(root, 'storage', 'emberdesk.sqlite'), { readOnly: true });
    cleanups.push(() => reader.close());
    return { db, reader };
}
const locator = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/one.jsonl' };
const payload = [{ chat_metadata: {} }, { mes: 'hello' }];
const bytes = value => Buffer.byteLength(value.map(line => JSON.stringify(line)).join('\n'));
const stats = db => db.prepare('SELECT chat_count, chat_size_bytes, date_last_chat_ms FROM character_chat_stats WHERE character_id = ?').get('character-a');
function save(db, options = {}) {
    return writeCanonicalChatPayload({ db, locator, payload, nowMs: 100, projection: 'off', projectJsonl() { throw new Error('unexpected projection'); }, ...options });
}

test('the first post-commit side effect observes matching sessions and stats through a second connection', () => {
    const { db, reader } = fixture();
    let observed;
    save(db, { onAuthorityCommitted() {
        observed = { count: reader.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n, stats: stats(reader) };
    } });
    expect(observed).toEqual({ count: 1, stats: { chat_count: 1, chat_size_bytes: bytes(payload), date_last_chat_ms: 100 } });
});

test('a real statistics trigger failure rolls back the session and its messages', () => {
    const { db, reader } = fixture();
    db.exec("CREATE TRIGGER reject_stats BEFORE INSERT ON character_chat_stats BEGIN SELECT RAISE(ABORT, 'stats rejected'); END");
    expect(() => save(db)).toThrow('stats rejected');
    expect(reader.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n).toBe(0);
    expect(reader.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n).toBe(0);
    expect(stats(reader)).toEqual({ chat_count: 0, chat_size_bytes: 0, date_last_chat_ms: 0 });
});

test('overwrite, identical save, rename and last deletion preserve source timestamp semantics', () => {
    const { db, reader } = fixture();
    save(db);
    const changed = [{ chat_metadata: {} }, { mes: 'longer content' }];
    save(db, { payload: changed, nowMs: 200 });
    save(db, { payload: changed, nowMs: 300 });
    const nextLocator = { ...locator, sourcePath: 'chats/alice/renamed.jsonl' };
    renameCanonicalChat({ db, locator, nextLocator, nowMs: 400, projection: 'off', projectRename() {} });
    expect(stats(reader)).toEqual({ chat_count: 1, chat_size_bytes: bytes(changed), date_last_chat_ms: 200 });
    let observed;
    deleteCanonicalChat({ db, locator: nextLocator, projection: 'off', projectDelete() { observed = stats(reader); } });
    expect(observed).toEqual({ chat_count: 0, chat_size_bytes: 0, date_last_chat_ms: 0 });
});

test('each imported item commits independently and a later failure leaves the first stats intact', () => {
    const { db, reader } = fixture();
    save(db, { operation: 'import' });
    db.exec("CREATE TRIGGER reject_stats BEFORE INSERT ON character_chat_stats BEGIN SELECT RAISE(ABORT, 'stats rejected'); END");
    expect(() => save(db, { operation: 'import', locator: { ...locator, sourcePath: 'chats/alice/two.jsonl' } })).toThrow('stats rejected');
    expect(reader.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n).toBe(1);
    expect(stats(reader)).toEqual({ chat_count: 1, chat_size_bytes: bytes(payload), date_last_chat_ms: 100 });
});

test('group, orphan and deleted-character chats remain writable without changing active stats', () => {
    const { db, reader } = fixture();
    for (const ownerType of ['group', 'character']) {
        expect(save(db, { locator: { ownerType, ownerId: ownerType === 'group' ? 'alice' : 'missing', sourcePath: `${ownerType}/one.jsonl` } }).ok).toBe(true);
    }
    db.exec('UPDATE characters SET deleted_at_ms = 10');
    expect(save(db).ok).toBe(true);
    expect(stats(reader)).toEqual({ chat_count: 0, chat_size_bytes: 0, date_last_chat_ms: 0 });
});

test('another user database and sync projection retain their separate statistics', () => {
    const first = fixture();
    const second = fixture();
    save(first.db);
    expect(stats(second.reader).chat_count).toBe(0);
    save(second.db, { projection: 'sync', projectJsonl() {} });
    expect(stats(second.reader)).toEqual({ chat_count: 0, chat_size_bytes: 0, date_last_chat_ms: 0 });
    expect(stats(first.reader).chat_count).toBe(1);
});

test.each(['overwrite', 'rename', 'delete'])('%s rolls back to the previous session and statistics on stats failure', operation => {
    const { db, reader } = fixture();
    save(db);
    const before = reader.prepare('SELECT * FROM chat_sessions').all();
    db.exec("CREATE TRIGGER reject_stats BEFORE INSERT ON character_chat_stats BEGIN SELECT RAISE(ABORT, 'stats rejected'); END");
    expect(() => {
        if (operation === 'overwrite') save(db, { payload: [{ chat_metadata: {} }, { mes: 'changed' }] });
        if (operation === 'rename') renameCanonicalChat({ db, locator, nextLocator: { ...locator, sourcePath: 'chats/alice/new.jsonl' }, projection: 'off', projectRename() {} });
        if (operation === 'delete') deleteCanonicalChat({ db, locator, projection: 'off', projectDelete() {} });
    }).toThrow('stats rejected');
    expect(reader.prepare('SELECT * FROM chat_sessions').all()).toEqual(before);
    expect(stats(reader)).toEqual({ chat_count: 1, chat_size_bytes: bytes(payload), date_last_chat_ms: 100 });
});

test('missing stats are initialized, and moving an owner updates both existing active characters', () => {
    const { db, reader } = fixture();
    db.exec("DELETE FROM character_chat_stats; INSERT INTO characters SELECT 'character-b', 'bob.png', 'bob', 'Bob', card_json, shallow_json, world_name, created_at_ms, updated_at_ms, NULL FROM characters WHERE id = 'character-a'");
    save(db);
    expect(stats(reader).chat_count).toBe(1);
    renameCanonicalChat({ db, locator, nextLocator: { ownerType: 'character', ownerId: 'bob', sourcePath: 'chats/bob/one.jsonl' }, projection: 'off', projectRename() {} });
    expect(stats(reader).chat_count).toBe(0);
    expect(reader.prepare("SELECT chat_count, date_last_chat_ms FROM character_chat_stats WHERE character_id = 'character-b'").get()).toEqual({ chat_count: 1, date_last_chat_ms: 100 });
});

test('post-commit backup and stale-file cleanup failures leave committed statistics intact', () => {
    const { db, reader } = fixture();
    expect(save(db, { onAuthorityCommitted() { throw new Error('backup unavailable'); } }).ok).toBe(true);
    expect(stats(reader).chat_count).toBe(1);
    expect(deleteCanonicalChat({ db, locator, projection: 'off', projectDelete() { throw new Error('cleanup unavailable'); } }).ok).toBe(true);
    expect(stats(reader)).toEqual({ chat_count: 0, chat_size_bytes: 0, date_last_chat_ms: 0 });
});
