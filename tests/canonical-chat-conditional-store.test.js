import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from '@jest/globals';
import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { CANONICAL_SQLITE_MIGRATIONS, runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import * as store from '../src/endpoints/canonical-chat-store.js';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.js';
import { deleteCanonicalChat, renameCanonicalChat, writeCanonicalChatPayload } from '../src/endpoints/canonical-chat-write-service.js';
import { auditCanonicalChatShadowImport, reconcileCanonicalChatSources, runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const locator = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/one.jsonl' };

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-conditional-'));
    const directories = { root, storage: path.join(root, 'storage'), chats: path.join(root, 'chats'), groupChats: path.join(root, 'group chats') };
    const managers = Array.from({ length: 2 }, () => createCanonicalSqliteManager({ logger: { info() {}, warn() {} } }));
    const [a, b] = managers.map(manager => manager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: false } }));
    runCanonicalMigrations(a);
    cleanups.push(() => { managers.forEach(manager => manager.dispose()); fs.rmSync(root, { recursive: true, force: true }); });
    const record = (db, text) => store.createCanonicalChatSessionRecord(db, { locator, payload: [{ chat_metadata: {} }, { mes: text }], nowMs: 100 });
    const version = db => store.getCanonicalChatSession(db, locator)?.concurrency_token;
    const payload = db => readCanonicalChatPayload(db, locator);
    return { a, b, record, version, payload, directories };
}

test('a late save conflicts after deletion, even if a new chat reuses the same locator and contents', () => {
    const { a, b, record, version, payload } = fixture();
    expect(store.createCanonicalChatSession(a, record(a, 'original')).status).toBe('imported');
    const stale = version(b);
    expect(typeof stale).toBe('string');
    const pending = record(b, 'late edit');
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, stale).status).toBe('deleted');
    expect(store.saveCanonicalChatSessionIfCurrent(b, pending, stale).status).toBe('conflict');
    expect(payload(a)).toBeNull();
    expect(store.createCanonicalChatSession(a, record(a, 'original')).status).toBe('imported');
    expect(version(a)).not.toBe(stale);
    expect(store.saveCanonicalChatSessionIfCurrent(b, pending, stale).status).toBe('conflict');
    expect(payload(a)[1].mes).toBe('original');
});

test('a stale delete conflicts after a second connection saves, and a current delete succeeds', () => {
    const { a, b, record, version, payload } = fixture();
    store.createCanonicalChatSession(a, record(a, 'original'));
    const observed = version(a);
    const saved = store.saveCanonicalChatSessionIfCurrent(b, record(b, 'other tab edit'), observed);
    expect(saved.status).toBe('updated');
    expect(saved.version).toBe(version(b));
    expect(saved.version).not.toBe(observed);
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, observed).status).toBe('conflict');
    expect(payload(a)[1].mes).toBe('other tab edit');
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, saved.version).status).toBe('deleted');
    expect(payload(b)).toBeNull();
});

test('explicit creation refuses to overwrite and legacy saves invalidate an observed version', () => {
    const { a, b, record, version, payload } = fixture();
    const created = store.createCanonicalChatSession(a, record(a, 'original'));
    expect(created.version).toBe(version(a));
    expect(store.createCanonicalChatSession(b, record(b, 'overwrite')).status).toBe('conflict');
    expect(payload(a)[1].mes).toBe('original');
    expect(store.upsertCanonicalChatSession(b, record(b, 'legacy edit')).status).toBe('updated');
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, created.version).status).toBe('conflict');
    expect(payload(a)[1].mes).toBe('legacy edit');
});

test('unchanged save keeps version, conflict does not invoke persistence callback, and invalid tokens throw', () => {
    const { a, record, version } = fixture();
    store.createCanonicalChatSession(a, record(a, 'same'));
    const v = version(a);
    expect(store.saveCanonicalChatSessionIfCurrent(a, record(a, 'same'), v)).toEqual(expect.objectContaining({ status: 'unchanged', version: v }));
    let invoked = false;
    expect(store.saveCanonicalChatSessionIfCurrent(a, record(a, 'later'), 'stale', { onPersist() { invoked = true; } }).status).toBe('conflict');
    expect(invoked).toBe(false);
    expect(() => store.saveCanonicalChatSessionIfCurrent(a, record(a, 'later'), null)).toThrow();
    expect(() => store.deleteCanonicalChatSessionIfCurrent(a, locator, '')).toThrow();
});

test('a pre-existing version-14 chat is backfilled without changing its payload', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-migration-'));
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    const db = manager.open({ handle: 'alice', directories: { root, storage: path.join(root, 'storage') }, featureFlags: { enabled: true, strict: false } });
    cleanups.push(() => { manager.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
    expect(runCanonicalMigrations(db, { migrations: CANONICAL_SQLITE_MIGRATIONS.slice(0, 14) }).ok).toBe(true);
    const record = store.createCanonicalChatSessionRecord(db, { locator, payload: [{ chat_metadata: {} }, { mes: 'before migration' }] });
    store.upsertCanonicalChatSession(db, record);
    expect(runCanonicalMigrations(db).ok).toBe(true);
    const version = store.getCanonicalChatSession(db, locator).concurrency_token;
    expect(version).toMatch(/^[0-9a-f]{32}$/);
    expect(readCanonicalChatPayload(db, locator)[1].mes).toBe('before migration');
    expect(runCanonicalMigrations(db).ok).toBe(true);
    expect(store.getCanonicalChatSession(db, locator).concurrency_token).toBe(version);
});

test('direct session mutation invalidates the version, and failed persistence rolls it back', () => {
    const { a, record, version, payload } = fixture();
    store.createCanonicalChatSession(a, record(a, 'original'));
    const old = version(a);
    a.prepare('UPDATE chat_sessions SET display_name = ? WHERE source_path = ?').run('renamed', locator.sourcePath);
    const current = version(a);
    expect(current).not.toBe(old);
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, old).status).toBe('conflict');
    expect(() => store.saveCanonicalChatSessionIfCurrent(a, record(a, 'not committed'), current, { onPersist() { throw new Error('rollback proof'); } })).toThrow('rollback proof');
    expect(version(a)).toBe(current);
    expect(payload(a)[1].mes).toBe('original');
});

test('renaming away and back invalidates old versions even with unchanged content', () => {
    const { a, record, version, payload } = fixture();
    store.createCanonicalChatSession(a, record(a, 'original'));
    const observed = version(a);
    const nextLocator = { ...locator, sourcePath: 'chats/alice/two.jsonl' };
    store.renameCanonicalChatSession(a, { locator, nextLocator });
    store.renameCanonicalChatSession(a, { locator: nextLocator, nextLocator: locator });
    expect(version(a)).not.toBe(observed);
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, observed).status).toBe('conflict');
    expect(payload(a)[1].mes).toBe('original');
});

test('a renamed chat and a new chat at its old path retain independent identities and messages', () => {
    const { a, b, record, version } = fixture();
    store.createCanonicalChatSession(a, record(a, 'before rename'));
    const oldVersion = version(a);
    const destination = { ...locator, sourcePath: 'chats/alice/two.jsonl' };
    expect(store.renameCanonicalChatSession(a, { locator, nextLocator: destination, version: oldVersion }).version).toBeTruthy();
    expect(store.createCanonicalChatSession(b, record(b, 'new chat')).status).toBe('imported');
    expect(readCanonicalChatPayload(a, locator)[1].mes).toBe('new chat');
    expect(readCanonicalChatPayload(a, destination)[1].mes).toBe('before rename');
    expect(store.getCanonicalChatSession(a, locator).id).not.toBe(store.getCanonicalChatSession(a, destination).id);
    expect(store.deleteCanonicalChatSessionIfCurrent(a, locator, oldVersion).status).toBe('conflict');
});
test('text replacement does not overwrite a concurrent chat edit', async () => {
    const { a, b, record, directories } = fixture();
    store.createCanonicalChatSession(a, record(a, 'old text'));
    const { runCharacterTextReplace } = await import('../src/endpoints/character-text-replace-service.js');
    const { writeCanonicalChatForTextReplace } = await import('../src/endpoints/chats.js');
    const request = {
        body: { avatar_url: 'alice.png', areas: { chats: 'current' }, chatFileName: 'one', query: 'old', replacement: 'new' },
        user: { profile: { handle: 'alice' }, directories },
    };
    const result = await runCharacterTextReplace({ request, apply: true, dependencies: {
        getCanonicalCharacterCardJson: async () => null,
        openChatSession: async () => ({ ok: true, db: a, locator, filePath: path.join(directories.root, locator.sourcePath), cardName: 'alice' }),
        writeChatSession(req, options) {
            store.upsertCanonicalChatSession(b, record(b, 'concurrent edit'));
            return writeCanonicalChatForTextReplace(req, options);
        },
    } });
    expect(result.applied.chat).toBe(false);
    expect(result).toMatchObject({ ok: false, status: 409, reason: 'chat_write_failed', partial: false });
    expect(result.areas.chats.reason).toBe('conflict');
    expect(readCanonicalChatPayload(a, locator)[1].mes).toBe('concurrent edit');
});

test('failed delete side effects roll back the deletion and the observed version', () => {
    const { a, record, version, payload } = fixture();
    store.createCanonicalChatSession(a, record(a, 'original'));
    const observed = version(a);
    expect(() => store.deleteCanonicalChatSessionIfCurrent(a, locator, observed, { onPersist() { throw new Error('delete rollback proof'); } })).toThrow('delete rollback proof');
    expect(version(a)).toBe(observed);
    expect(payload(a)[1].mes).toBe('original');
    expect(store.hasCanonicalChatProjectionTombstone(a, locator)).toBe(false);
});

test('a retained old projection cannot be reimported after deletion or overwrite a new generation', async () => {
    const { a, record, payload, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"chat_metadata":{}}\n{"mes":"stale projection"}\n');
    store.createCanonicalChatSession(a, record(a, 'canonical old'));
    const deleted = deleteCanonicalChat({ db: a, locator, projection: 'off', projectDelete() { throw new Error('simulated cleanup failure'); } });
    expect(deleted.ok).toBe(true);
    expect(reconcileCanonicalChatSources({ db: a, directories, ownerType: 'character', ownerId: 'alice' }).imported).toBe(0);
    await runCanonicalChatShadowImport({ db: a, directories, handle: 'alice', featureFlags: { enabled: true, shadowImport: true } });
    expect(payload(a)).toBeNull();
    expect(store.createCanonicalChatSession(a, record(a, 'explicit new generation')).status).toBe('imported');
    await runCanonicalChatShadowImport({ db: a, directories, handle: 'alice', featureFlags: { enabled: true, shadowImport: true } });
    expect(payload(a)[1].mes).toBe('explicit new generation');
});

test('projection-off rename cannot remove a newly recreated chat projection', () => {
    const { a, b, record, version, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    const nextLocator = { ...locator, sourcePath: 'chats/alice/two.jsonl' };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    store.createCanonicalChatSession(a, record(a, 'old'));
    fs.writeFileSync(file, 'old projection');
    let injected = false;
    const intercepted = new Proxy(a, {
        get(target, property) {
            if (property === 'exec') return sql => {
                const result = target.exec(sql);
                if (sql === 'COMMIT' && !injected) {
                    injected = true;
                    expect(store.createCanonicalChatSession(b, record(b, 'new')).status).toBe('imported');
                    fs.writeFileSync(file, 'new projection');
                }
                return result;
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    expect(renameCanonicalChat({ db: intercepted, locator, nextLocator, version: version(a), projection: 'off', projectRename() {}, onAuthorityCommitted() { fs.rmSync(file); } }).ok).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('new projection');
    expect(readCanonicalChatPayload(a, locator)[1].mes).toBe('new');
    expect(readCanonicalChatPayload(a, nextLocator)[1].mes).toBe('old');
});

test('projection-off delete cannot remove a newly recreated chat projection', () => {
    const { a, b, record, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    store.createCanonicalChatSession(a, record(a, 'old'));
    fs.writeFileSync(file, 'old projection');
    let injected = false;
    const intercepted = new Proxy(a, {
        get(target, property) {
            if (property === 'exec') return sql => {
                const result = target.exec(sql);
                if (sql === 'COMMIT' && !injected) {
                    injected = true;
                    expect(store.createCanonicalChatSession(b, record(b, 'new')).status).toBe('imported');
                    fs.writeFileSync(file, 'new projection');
                }
                return result;
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    expect(deleteCanonicalChat({ db: intercepted, locator, projection: 'off', projectDelete() { fs.rmSync(file); } }).ok).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('new projection');
    expect(readCanonicalChatPayload(a, locator)[1].mes).toBe('new');
});

test('an unrelated legacy on-disk chat still imports normally', () => {
    const { a, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"chat_metadata":{}}\n{"mes":"legacy import"}\n');
    expect(reconcileCanonicalChatSources({ db: a, directories, ownerType: 'character', ownerId: 'alice' }).imported).toBe(1);
    expect(readCanonicalChatPayload(a, locator)[1].mes).toBe('legacy import');
});

test('audit does not treat a retained deleted projection as unregistered data', async () => {
    const { a, record, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"chat_metadata":{}}\n{"mes":"stale"}\n');
    store.createCanonicalChatSession(a, record(a, 'old'));
    store.deleteCanonicalChatSession(a, locator);
    const audit = await auditCanonicalChatShadowImport({ db: a, directories, handle: 'alice' });
    expect(audit.blocking).toBe(false);
});

test('explicit product import can create a new generation at a deleted path', async () => {
    const { a, record, payload, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"chat_metadata":{}}\n{"mes":"stale"}\n');
    store.createCanonicalChatSession(a, record(a, 'old'));
    store.deleteCanonicalChatSession(a, locator);
    const result = writeCanonicalChatPayload({ db: a, locator, payload: [{ chat_metadata: {} }, { mes: 'explicit import' }], operation: 'import', projection: 'off', projectJsonl() {} });
    expect(result.ok).toBe(true);
    await runCanonicalChatShadowImport({ db: a, directories, handle: 'alice', featureFlags: { enabled: true, shadowImport: true } });
    expect(payload(a)[1].mes).toBe('explicit import');
});

test('an already prepared passive import is rejected after another connection deletes', () => {
    const { a, b, record, payload } = fixture();
    store.createCanonicalChatSession(a, record(a, 'old'));
    const prepared = record(b, 'stale projection');
    store.deleteCanonicalChatSession(a, locator);
    expect(store.importCanonicalChatProjection(b, prepared).status).toBe('suppressed');
    expect(payload(a)).toBeNull();
});

test('a moved chat leaves its previous projection suppressed', async () => {
    const { a, record, directories } = fixture();
    const file = path.join(directories.root, locator.sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"chat_metadata":{}}\n{"mes":"stale"}\n');
    store.createCanonicalChatSession(a, record(a, 'old'));
    const nextLocator = { ...locator, sourcePath: 'chats/alice/two.jsonl' };
    store.renameCanonicalChatSession(a, { locator, nextLocator });
    await runCanonicalChatShadowImport({ db: a, directories, handle: 'alice', featureFlags: { enabled: true, shadowImport: true } });
    expect(readCanonicalChatPayload(a, locator)).toBeNull();
    expect(readCanonicalChatPayload(a, nextLocator)[1].mes).toBe('old');
});
