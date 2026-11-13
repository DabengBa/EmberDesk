import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager, withCanonicalTransaction } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    commitWorldBookWithProjectionIntent,
    recordWorldProjectionIntent,
    replayWorldProjection,
    resolveWorldProjectionPath,
    WORLD_PROJECTION_INTENT_PREFIX,
} from '../src/canonical-world-info-projection.js';
import {
    getCanonicalWorldInfoBook,
    markCanonicalWorldInfoBookDeleted,
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from '../src/endpoints/world-info-store.js';
import { explainCanonicalRolloutBlockers, getCanonicalStorageControlPlaneStatus } from '../src/canonical-sqlite-operator.js';
import { runCanonicalWorldInfoAudit, repairCanonicalWorldInfoProjection } from '../src/canonical-sqlite-operator.js';
import { runCharacterTextReplace } from '../src/endpoints/character-text-replace-service.js';
import * as characterStore from '../src/endpoints/character-store.js';
import { runCanonicalWorldInfoShadowImport } from '../src/canonical-world-info-shadow-import.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqliteUrl = pathToFileURL(path.join(repoRoot, 'src/canonical-sqlite.js')).href;
const storeUrl = pathToFileURL(path.join(repoRoot, 'src/endpoints/world-info-store.js')).href;
const projectionUrl = pathToFileURL(path.join(repoRoot, 'src/canonical-world-info-projection.js')).href;

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-world-recovery-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        worlds: path.join(root, 'worlds'),
        characters: path.join(root, 'characters'),
    };
    fs.mkdirSync(directories.worlds, { recursive: true });
    return directories;
}

function openDb(directories) {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: false } });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    return db;
}

function payload(name, marker) {
    return { name, entries: { one: { content: marker } } };
}

function worldFile(directories, name) {
    return path.join(directories.worlds, `${name}.json`);
}

function openIntent(db, name) {
    return db.prepare(
        'SELECT repair_key, details_json, resolved_at_ms FROM world_info_projection_repairs WHERE world_name = ? ORDER BY updated_at_ms DESC LIMIT 1',
    ).get(name);
}

function runChild(script, args) {
    return spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(args)], { encoding: 'utf8' });
}

function childPrelude() {
    return `
        import { createCanonicalSqliteManager, withCanonicalTransaction } from ${JSON.stringify(sqliteUrl)};
        import { upsertCanonicalWorldInfoBookInTransaction, markCanonicalWorldInfoBookDeleted } from ${JSON.stringify(storeUrl)};
        import { recordWorldProjectionIntent, replayWorldProjection, commitWorldBookWithProjectionIntent } from ${JSON.stringify(projectionUrl)};
        const [directories, extras] = JSON.parse(process.argv[1]);
        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: false } });
    `;
}

beforeEach(() => {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES = 'true';
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT = 'false';
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SHADOWIMPORT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_READS;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_WRITES;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_STRICT;
    delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_PROJECTION;
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('world info projection recovery protocol', () => {
    test('character conditional write rejects a stale card after a concurrent edit', () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        const other = openDb(directories);
        const write = (connection, description) => characterStore.upsertCanonicalCharacter(connection, {
            id: 'alice', avatarFilename: 'alice.png', fullPayload: { name: 'Alice', description },
            shallowPayload: { name: 'Alice', description }, createdAtMs: 1, updatedAtMs: 2,
        });
        write(db, 'old');
        const expected = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json;
        write(other, 'concurrent edit');
        expect(() => withCanonicalTransaction(db, txn => {
            characterStore.assertCanonicalCharacterCardCurrent(txn, 'alice.png', expected);
            write(txn, 'replacement');
        })).toThrow('character_card_conflict');
        expect(JSON.parse(db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ?').get('alice.png').card_json).description).toBe('concurrent edit');
    });
    test('cross-device quarantine never unlinks a replacement at the original path', () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        const source = worldFile(directories, 'Lore');
        fs.writeFileSync(source, 'old bytes');
        const key = commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'off' });
        const realRename = fs.renameSync.bind(fs);
        const realUnlink = fs.unlinkSync.bind(fs);
        const rename = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (String(to).startsWith(directories.storage)) { const error = new Error('cross device'); error.code = 'EXDEV'; throw error; }
            const result = realRename(from, to);
            if (from === source) fs.writeFileSync(source, 'replacement bytes');
            return result;
        });
        const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(p => {
            if (p === source) { realUnlink(source); fs.writeFileSync(source, 'replacement bytes'); }
            return realUnlink(p);
        });
        try {
            replayWorldProjection(db, { directories, repairKey: key });
            expect(fs.readFileSync(source, 'utf8')).toBe('replacement bytes');
        } finally { rename.mockRestore(); unlink.mockRestore(); }
    });
    test.each(['delete', 'write'])('uppercase independent file survives blocked %s intent and replay', async action => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'old') });
        const key = action === 'delete'
            ? withCanonicalTransaction(db, txn => {
                markCanonicalWorldInfoBookDeleted(txn, { name: 'Lore' });
                return recordWorldProjectionIntent(txn, { directories, name: 'Lore', action, mode: 'sync' });
            })
            : commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'sync' });
        const legacy = path.join(directories.worlds, 'Lore.JSON');
        const independent = JSON.stringify(payload('Lore', 'independent'));
        fs.writeFileSync(legacy, independent);
        const result = await runCanonicalWorldInfoShadowImport({ handle: 'alice', directories, manager: managers.at(-1), featureFlags: { enabled: true, shadowImport: true } });
        expect(result.ok).toBe(false);
        expect(fs.readFileSync(legacy, 'utf8')).toBe(independent);
        expect(() => replayWorldProjection(db, { directories, repairKey: key })).toThrow('world_projection_filename_alias');
        expect(fs.readFileSync(legacy, 'utf8')).toBe(independent);
    });

    test('off quarantine survives cross-device rename and interrupted relocation', () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        const source = worldFile(directories, 'Lore');
        fs.writeFileSync(source, 'independent bytes');
        const key = commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'off' });
        const realRename = fs.renameSync.bind(fs);
        let interrupted = false;
        const rename = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (String(to).startsWith(directories.storage)) { const e = new Error('cross device'); e.code = 'EXDEV'; throw e; }
            if (!interrupted) { interrupted = true; throw new Error('interrupted'); }
            return realRename(from, to);
        });
        try {
            expect(() => replayWorldProjection(db, { directories, repairKey: key })).toThrow('interrupted');
            expect(fs.readFileSync(source, 'utf8')).toBe('independent bytes');
            replayWorldProjection(db, { directories, repairKey: key });
            expect(fs.existsSync(source)).toBe(false);
            const saved = fs.readdirSync(directories.worlds).filter(name => name.startsWith('.world-info-quarantine-')).flatMap(dir => {
                const batch = path.join(directories.worlds, dir);
                return fs.readdirSync(batch).map(name => fs.readFileSync(path.join(batch, name), 'utf8'));
            });
            expect(saved.length).toBeGreaterThanOrEqual(1);
            expect(saved.every(bytes => bytes === 'independent bytes')).toBe(true);
            replayWorldProjection(db, { directories, repairKey: key });
        } finally { rename.mockRestore(); }
    });
    test('off write quarantines unverified bytes outside the import directory', () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        fs.writeFileSync(worldFile(directories, 'Lore'), 'unverified legacy data');
        const key = commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'off' });
        replayWorldProjection(db, { directories, repairKey: key });
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);
        const quarantine = path.join(directories.storage, 'world-info-quarantine');
        const dirs = fs.readdirSync(quarantine);
        expect(dirs).toHaveLength(1);
        expect(fs.readFileSync(path.join(quarantine, dirs[0], 'Lore.json'), 'utf8')).toBe('unverified legacy data');
        replayWorldProjection(db, { directories, repairKey: key });
        expect(fs.readdirSync(quarantine)).toHaveLength(1);
    });
    test('an invalid projection intent mode cannot authorize a delete', () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'before') });
        fs.writeFileSync(worldFile(directories, 'Lore'), 'preserve file');
        const key = withCanonicalTransaction(db, txn => {
            markCanonicalWorldInfoBookDeleted(txn, { name: 'Lore' });
            return recordWorldProjectionIntent(txn, { directories, name: 'Lore', action: 'delete', mode: 'sync' });
        });
        const intent = openIntent(db, 'Lore');
        const details = JSON.parse(intent.details_json);
        details.mode = 'unrecognized';
        db.prepare('UPDATE world_info_projection_repairs SET details_json = ? WHERE repair_key = ?').run(JSON.stringify(details), key);

        expect(() => replayWorldProjection(db, { directories, repairKey: key })).toThrow('unsupported_world_projection_intent');
        expect(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).toBe('preserve file');
        expect(openIntent(db, 'Lore').resolved_at_ms).toBeNull();
    });

    test('a selected old worker resumes after another process reuses the path and cannot delete the new book', async () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'old') });
        const key = withCanonicalTransaction(db, txn => {
            markCanonicalWorldInfoBookDeleted(txn, { name: 'Lore' });
            return recordWorldProjectionIntent(txn, { directories, name: 'Lore', action: 'delete', mode: 'sync' });
        });
        const ready = path.join(directories.root, 'selected');
        const resume = path.join(directories.root, 'resume');
        const script = `${childPrelude()}
            import fs from 'node:fs';
            const selected = db.prepare('SELECT repair_key FROM world_info_projection_repairs WHERE repair_key = ? AND resolved_at_ms IS NULL').get(extras.key);
            if (!selected) process.exit(12);
            fs.writeFileSync(extras.ready, 'selected');
            while (!fs.existsSync(extras.resume)) await new Promise(resolve => setTimeout(resolve, 10));
            replayWorldProjection(db, { directories, repairKey: selected.repair_key });
        `;
        const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([directories, { key, ready, resume }])], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk; });
        const done = new Promise(resolve => child.on('close', status => resolve(status)));
        try {
            for (let i = 0; i < 300 && !fs.existsSync(ready); i++) await new Promise(resolve => setTimeout(resolve, 10));
            expect(fs.existsSync(ready)).toBe(true);
            const newKey = commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'sync' });
            expect(newKey).toBe(key);
            replayWorldProjection(db, { directories, repairKey: newKey });
            fs.writeFileSync(resume, 'continue');
            expect({ status: await done, stderr }).toEqual({ status: 0, stderr: '' });
            expect(getCanonicalWorldInfoBook(db, 'Lore').entries.one.content).toBe('new');
            expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('new');
            expect(openIntent(db, 'Lore').resolved_at_ms).not.toBeNull();
            expect(db.prepare('SELECT count(*) AS n FROM import_ledger WHERE slice_key = \'world_info\'').get().n).toBe(1);
        } finally { if (child.exitCode === null) { child.kill(); await done; } }
    });

    test('a process holding the writer lock causes busy, then its exit rolls back and permits a new write', async () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        const ready = path.join(directories.root, 'locked');
        const script = `${childPrelude()}
            import fs from 'node:fs';
            db.exec('BEGIN IMMEDIATE');
            upsertCanonicalWorldInfoBookInTransaction(db, { name: 'Lore', payload: { entries: { one: { content: 'uncommitted' } } } });
            fs.writeFileSync(extras.ready, 'locked');
            setInterval(() => {}, 1000);
        `;
        const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([directories, { ready }])], { stdio: ['ignore', 'ignore', 'pipe'] });
        const done = new Promise(resolve => child.on('close', resolve));
        try {
            for (let i = 0; i < 300 && !fs.existsSync(ready); i++) await new Promise(resolve => setTimeout(resolve, 10));
            expect(fs.existsSync(ready)).toBe(true);
            db.exec('PRAGMA busy_timeout = 50');
            expect(() => commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'sync' })).toThrow(/locked|busy/i);
            child.kill('SIGKILL');
            await done;
            expect(getCanonicalWorldInfoBook(db, 'Lore')).toBeNull();
            expect(openIntent(db, 'Lore')).toBeUndefined();
            expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);
            expect(db.prepare('SELECT count(*) AS n FROM import_ledger WHERE slice_key = \'world_info\'').get().n).toBe(0);
            const key = commitWorldBookWithProjectionIntent(db, { directories, name: 'Lore', payload: payload('Lore', 'new'), mode: 'sync' });
            replayWorldProjection(db, { directories, repairKey: key });
            expect(getCanonicalWorldInfoBook(db, 'Lore').entries.one.content).toBe('new');
            expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('new');
            expect(openIntent(db, 'Lore').resolved_at_ms).not.toBeNull();
            expect(db.prepare('SELECT count(*) AS n FROM import_ledger WHERE slice_key = \'world_info\'').get().n).toBe(1);
        } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; } }
    });
    test('a process exit before commit rolls back both authority and intent', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'original') });
        const original = getCanonicalWorldInfoBook(db, 'Lore');
        const script = `${childPrelude()}
            db.function('exit_now', () => process.exit(71));
            db.exec("CREATE TEMP TRIGGER crash_before_commit BEFORE INSERT ON world_info_projection_repairs BEGIN SELECT exit_now(); END");
            withCanonicalTransaction(db, txn => {
                upsertCanonicalWorldInfoBookInTransaction(txn, { name: 'Lore', payload: { name: 'Lore', entries: { one: { content: 'changed' } } } });
                recordWorldProjectionIntent(txn, { directories, name: 'Lore', action: 'write', mode: 'sync' });
            });
        `;
        const child = runChild(script, [directories, {}]);
        expect({ status: child.status, stderr: child.stderr }).toEqual({ status: 71, stderr: '' });

        expect(getCanonicalWorldInfoBook(db, 'Lore')).toEqual(expect.objectContaining({ entries: original.entries }));
        expect(openIntent(db, 'Lore')).toBeUndefined();
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);
    });

    test('a committed intent left before the file write stays pending, then converges on replay', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'original') });
        const script = `${childPrelude()}
            commitWorldBookWithProjectionIntent(db, {
                directories,
                name: 'Lore',
                payload: { name: 'Lore', entries: { one: { content: 'committed' } } },
                mode: 'sync',
            });
            process.exit(0);
        `;
        const child = runChild(script, [directories, {}]);
        expect(child.status).toBe(0);

        const pending = openIntent(db, 'Lore');
        expect(pending.resolved_at_ms).toBeNull();
        expect(pending.repair_key.startsWith(WORLD_PROJECTION_INTENT_PREFIX)).toBe(true);
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);

        expect(replayWorldProjection(db, { directories, repairKey: pending.repair_key })).toEqual(
            expect.objectContaining({ status: 'repaired', operation: 'write' }),
        );
        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('committed');
        expect(openIntent(db, 'Lore').resolved_at_ms).not.toBeNull();
    });

    test('a process exit after the file write but before resolution converges on repeated replay', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'original') });
        const key = commitWorldBookWithProjectionIntent(db, {
            directories,
            name: 'Lore',
            payload: payload('Lore', 'projected'),
            mode: 'sync',
        });
        const script = `${childPrelude()}
            db.function('exit_now', () => process.exit(71));
            db.exec("CREATE TEMP TRIGGER crash_before_resolve BEFORE UPDATE ON world_info_projection_repairs WHEN NEW.resolved_at_ms IS NOT NULL BEGIN SELECT exit_now(); END");
            replayWorldProjection(db, { directories, repairKey: extras.key });
        `;
        const child = runChild(script, [directories, { key }]);
        expect({ status: child.status, stderr: child.stderr }).toEqual({ status: 71, stderr: '' });

        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('projected');
        expect(openIntent(db, 'Lore').resolved_at_ms).toBeNull();
        const ledgerWhilePending = db.prepare('SELECT COUNT(*) AS n FROM import_ledger WHERE slice_key = \'world_info\'').get().n;
        expect(ledgerWhilePending).toBe(0);

        const started = process.hrtime.bigint();
        replayWorldProjection(db, { directories, repairKey: key });
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        expect(elapsedMs).toBeLessThan(1000);
        expect(openIntent(db, 'Lore').resolved_at_ms).not.toBeNull();
        expect(db.prepare('SELECT COUNT(*) AS n FROM import_ledger WHERE slice_key = \'world_info\'').get().n).toBe(1);
        expect(replayWorldProjection(db, { directories, repairKey: key }).status).toBe('repaired');
        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('projected');
    });

    test('two processes replay the same intent while the writer lock is held and both converge', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'original') });
        const key = commitWorldBookWithProjectionIntent(db, {
            directories,
            name: 'Lore',
            payload: payload('Lore', 'race'),
            mode: 'sync',
        });
        const script = `${childPrelude()}
            replayWorldProjection(db, { directories, repairKey: extras.key });
            process.exit(0);
        `;

        db.exec('BEGIN IMMEDIATE');
        const children = [0, 1].map(() => new Promise(resolve => {
            const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([directories, { key }])], { stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            child.stderr.on('data', chunk => { stderr += chunk; });
            child.on('exit', status => resolve({ status, stderr }));
        }));
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        db.exec('COMMIT');

        const results = await Promise.all(children);
        expect(results).toEqual([{ status: 0, stderr: '' }, { status: 0, stderr: '' }]);
        expect(openIntent(db, 'Lore').resolved_at_ms).not.toBeNull();
        expect(db.prepare('SELECT COUNT(*) AS n FROM import_ledger WHERE slice_key = \'world_info\'').get().n).toBe(1);
        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('race');
    });

    test('an old delete intent cannot delete a path reused by a newer book, and legacy delete keys stay blocked', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'first') });
        const key = withCanonicalTransaction(db, txn => {
            markCanonicalWorldInfoBookDeleted(txn, { name: 'Lore', nowMs: 1735689600000 });
            return recordWorldProjectionIntent(txn, { directories, name: 'Lore', action: 'delete', mode: 'sync' });
        });
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);

        // A newer authority reuses the name and writes its own file before the
        // stale delete intent is replayed.
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'reused') });
        fs.writeFileSync(worldFile(directories, 'Lore'), JSON.stringify(payload('Lore', 'reused')), 'utf8');
        expect(() => replayWorldProjection(db, { directories, repairKey: key })).toThrow('world_projection_authority_conflict');
        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('reused');

        const writeKey = recordWorldProjectionIntent(db, { directories, name: 'Lore', action: 'write', mode: 'sync' });
        replayWorldProjection(db, { directories, repairKey: writeKey });
        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Lore'), 'utf8')).entries.one.content).toBe('reused');

        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lore:delete',
            worldName: 'Lore',
            reason: 'projection_failed',
            details: { operation: 'delete' },
            nowMs: 1735689601000,
        });
        expect(() => replayWorldProjection(db, { directories, repairKey: 'world_info:Lore:delete' }))
            .toThrow('legacy_world_projection_repair_blocked');
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(true);
    });

    test('off advances generation and resolves a pending sync write without projecting, while explicit delete still cleans', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'original') });
        fs.writeFileSync(worldFile(directories, 'Lore'), '{"legacy":true}', 'utf8');
        const syncKey = commitWorldBookWithProjectionIntent(db, {
            directories,
            name: 'Lore',
            payload: payload('Lore', 'sync pending'),
            mode: 'sync',
        });
        expect(openIntent(db, 'Lore').resolved_at_ms).toBeNull();
        const offKey = commitWorldBookWithProjectionIntent(db, {
            directories,
            name: 'Lore',
            payload: payload('Lore', 'off value'),
            mode: 'off',
        });
        expect(offKey).toBe(syncKey);
        expect(openIntent(db, 'Lore').resolved_at_ms).toBeNull();
        replayWorldProjection(db, { directories, repairKey: offKey });
        expect(openIntent(db, 'Lore').resolved_at_ms).not.toBeNull();
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);
        expect(replayWorldProjection(db, { directories, repairKey: offKey }).status).toBe('repaired');
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);

        replayWorldProjection(db, { directories, repairKey: offKey });
        const deleteKey = withCanonicalTransaction(db, txn => {
            markCanonicalWorldInfoBookDeleted(txn, { name: 'Lore', nowMs: 1735689602000 });
            return recordWorldProjectionIntent(txn, { directories, name: 'Lore', action: 'delete', mode: 'off' });
        });
        fs.writeFileSync(worldFile(directories, 'Lore'), '{"stale":true}', 'utf8');
        replayWorldProjection(db, { directories, repairKey: deleteKey });
        expect(fs.existsSync(worldFile(directories, 'Lore'))).toBe(false);
    });

    test('rejects long, aliased, symlinked, and ownership-conflicting projection paths', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'x') });

        expect(() => resolveWorldProjectionPath(db, directories, 'lore')).toThrow('world_projection_ownership_conflict');
        fs.writeFileSync(path.join(directories.worlds, 'lore.json'), '{}');
        expect(() => resolveWorldProjectionPath(db, directories, 'Lore')).toThrow('world_projection_filename_alias');
        fs.rmSync(path.join(directories.worlds, 'lore.json'));

        fs.writeFileSync(path.join(directories.worlds, 'Other.json'), '{}');
        fs.rmSync(path.join(directories.worlds, 'Other.json'));
        fs.symlinkSync(path.join(root, 'missing-target.json'), path.join(directories.worlds, 'Lore.json'));
        expect(() => resolveWorldProjectionPath(db, directories, 'Lore')).toThrow('world_projection_symlink');
        fs.rmSync(path.join(directories.worlds, 'Lore.json'));

        const longName = 'a'.repeat(300);
        expect(() => resolveWorldProjectionPath(db, directories, longName)).toThrow('unsafe_world_projection_name');

        const aliasRoot = path.join(root, 'alias-worlds');
        fs.symlinkSync(directories.worlds, aliasRoot, 'dir');
        expect(() => resolveWorldProjectionPath(db, { ...directories, worlds: aliasRoot }, 'Lore'))
            .toThrow('unsafe_world_projection_directory');
    });

    test('renaming a world as two independent requests leaves only the new projection', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Old Lore', payload: payload('Old Lore', 'old') });
        fs.writeFileSync(worldFile(directories, 'Old Lore'), JSON.stringify(payload('Old Lore', 'old')), 'utf8');

        const newKey = commitWorldBookWithProjectionIntent(db, {
            directories,
            name: 'New Lore',
            payload: payload('New Lore', 'renamed'),
            mode: 'sync',
        });
        replayWorldProjection(db, { directories, repairKey: newKey });
        const deleteKey = withCanonicalTransaction(db, txn => {
            markCanonicalWorldInfoBookDeleted(txn, { name: 'Old Lore', nowMs: 1735689603000 });
            return recordWorldProjectionIntent(txn, { directories, name: 'Old Lore', action: 'delete', mode: 'sync' });
        });
        replayWorldProjection(db, { directories, repairKey: deleteKey });

        expect(fs.existsSync(worldFile(directories, 'New Lore'))).toBe(true);
        expect(fs.existsSync(worldFile(directories, 'Old Lore'))).toBe(false);
        expect(openIntent(db, 'New Lore').resolved_at_ms).not.toBeNull();
        expect(openIntent(db, 'Old Lore').resolved_at_ms).not.toBeNull();
    });

    test('audit accepts an in-flight v1 intent as expected drift while status and downgrade admission remain blocked', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Lore', payload: payload('Lore', 'pending') });
        const key = commitWorldBookWithProjectionIntent(db, {
            directories,
            name: 'Lore',
            payload: payload('Lore', 'pending'),
            mode: 'sync',
        });

        const audit = await runCanonicalWorldInfoAudit({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689605000,
        });
        expect(audit.ok).toBe(true);
        expect(audit.blocking).toBe(false);
        expect(audit.entries).toEqual([
            expect.objectContaining({
                drift_types: ['missing_projection_file'],
                details: expect.objectContaining({ expected_projection_pending: true }),
            }),
        ]);

        const flags = { enabled: true, shadowImport: true, reads: true, writes: true, chatStats: false, strict: false };
        const strict = explainCanonicalRolloutBlockers({ db, featureFlags: flags, phase: 'writes', sliceKey: 'world_info' });
        expect(strict.ok).toBe(false);
        expect(strict.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'open_world_info_projection_repairs' }),
        ]));
        const status = getCanonicalStorageControlPlaneStatus({ handle: 'alice', directories, db });
        const worldInfo = status.slices.find(slice => slice.key === 'world_info');
        expect(worldInfo.ready).toBe(false);
        expect(worldInfo.openRepairCount).toBe(1);

        replayWorldProjection(db, { directories, repairKey: key });
        await runCanonicalWorldInfoAudit({ handle: 'alice', directories, db, auditedAtMs: 1735689606000 });
        expect(explainCanonicalRolloutBlockers({ db, featureFlags: flags, phase: 'writes', sliceKey: 'world_info' }).ok).toBe(true);
    });

    test('character text replace commits authority and intent together and leaves a replayable pending intent when the file is blocked', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Bound Lore', payload: payload('Bound Lore', 'Seraphina rules') });
        // A directory at the projection path makes the atomic file write fail.
        fs.mkdirSync(worldFile(directories, 'Bound Lore'));
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_WORLDINFO_PROJECTION = 'sync';

        const cardJson = JSON.stringify({
            name: 'Seraphina',
            data: { extensions: { world: 'Bound Lore' }, character_book: { entries: [] } },
        });
        const result = await runCharacterTextReplace({
            request: {
                body: {
                    avatar_url: 'Seraphina.png',
                    areas: { card: false, worldBook: true, chats: 'off' },
                    query: 'Seraphina',
                    replacement: '塞拉菲娜',
                    options: { caseSensitive: false, wholeWord: false, regex: false },
                },
                user: { profile: { handle: 'alice' }, directories },
            },
            apply: true,
            dependencies: {
                getCanonicalCharacterCardJson: async () => cardJson,
                getCharacterWriteDependencies: () => ({ getCardJson: () => undefined }),
                getWorldInfoWriteState: async () => ({ ok: true, db }),
                getCanonicalWorldInfoBook: (txn, name) => getCanonicalWorldInfoBook(txn, name),
                listCanonicalCharactersBoundToWorld: () => [],
                getCharacterFeatureFlags: () => ({ enabled: true }),
                editCharacterCard: async () => ({ ok: true }),
            },
        });

        expect(result.ok).toBe(true);
        expect(result.applied.worldBook).toBe(true);
        expect(result.areas.worldBook.projectionFailed).toBe(true);
        expect(result.warnings).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'world_book_projection_failed' }),
        ]));
        const book = getCanonicalWorldInfoBook(db, 'Bound Lore');
        expect(book.entries.one.content).toBe('塞拉菲娜 rules');
        const intent = openIntent(db, 'Bound Lore');
        expect(intent.repair_key).toMatch(/^world-path-v1:/);
        expect(intent.resolved_at_ms).toBeNull();
        expect(db.prepare('SELECT COUNT(*) AS count FROM world_info_projection_repairs WHERE repair_key LIKE ?').get('world_info:%').count).toBe(0);

        fs.rmdirSync(worldFile(directories, 'Bound Lore'));
        const replay = await repairCanonicalWorldInfoProjection({ db, directories, repairKeys: [intent.repair_key] });
        expect(replay.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(worldFile(directories, 'Bound Lore'), 'utf8')).entries.one.content).toBe('塞拉菲娜 rules');
        expect(openIntent(db, 'Bound Lore').resolved_at_ms).not.toBeNull();
    });

    test('text replacement stops on a concurrent world edit without overwriting it or writing the card', async () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        const other = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Bound Lore', payload: payload('Bound Lore', 'old text') });
        const editCharacterCard = jest.fn();
        const result = await runCharacterTextReplace({
            request: {
                body: { avatar_url: 'Alice.png', areas: { card: true, worldBook: true, chats: 'off' }, query: 'old', replacement: 'new' },
                user: { profile: { handle: 'alice' }, directories },
            },
            apply: true,
            dependencies: {
                getCanonicalCharacterCardJson: async () => JSON.stringify({ data: { description: 'old', extensions: { world: 'Bound Lore' } } }),
                getCharacterWriteDependencies: () => ({}),
                getWorldInfoWriteState: async () => ({ ok: true, db }),
                commitWorldBookWithProjectionIntent(txn, options) {
                    upsertCanonicalWorldInfoBook(other, { name: 'Bound Lore', payload: payload('Bound Lore', 'concurrent edit') });
                    return commitWorldBookWithProjectionIntent(txn, options);
                },
                editCharacterCard,
            },
        });
        expect(getCanonicalWorldInfoBook(db, 'Bound Lore').entries.one.content).toBe('concurrent edit');
        expect(result).toMatchObject({ ok: false, status: 409, reason: 'world_book_conflict', partial: false });
        expect(editCharacterCard).not.toHaveBeenCalled();
    });

    test('reports a committed world book and stops before chat when the card write fails', async () => {
        const directories = createDirectories(makeRoot());
        const db = openDb(directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Bound Lore', payload: payload('Bound Lore', 'old text') });
        const writeChatSession = jest.fn();
        const result = await runCharacterTextReplace({
            request: {
                body: { avatar_url: 'Alice.png', areas: { card: true, worldBook: true, chats: 'current' }, chatFileName: 'one', query: 'old', replacement: 'new' },
                user: { profile: { handle: 'alice' }, directories },
            },
            apply: true,
            dependencies: {
                getCanonicalCharacterCardJson: async () => JSON.stringify({ data: { description: 'old', extensions: { world: 'Bound Lore' } } }),
                getCharacterWriteDependencies: () => ({}),
                getWorldInfoWriteState: async () => ({ ok: true, db }),
                openChatSession: async () => ({ ok: true, db }),
                editCharacterCard: async () => ({ ok: false, reason: 'card_write_failed' }),
                writeChatSession,
            },
        });
        expect(getCanonicalWorldInfoBook(db, 'Bound Lore').entries.one.content).toBe('new text');
        expect(result).toMatchObject({ ok: false, status: 500, partial: true, applied: { worldBook: true, card: false, chat: false } });
        expect(result.areas.chats.status).toBe('skipped');
        expect(writeChatSession).not.toHaveBeenCalled();
    });

    test('quantifies writer-lock time spent writing a projection file', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const db = openDb(directories);
        const large = { name: 'Huge', entries: { one: { content: 'x'.repeat(8 * 1024 * 1024) } } };
        upsertCanonicalWorldInfoBook(db, { name: 'Huge', payload: large });
        const key = recordWorldProjectionIntent(db, { directories, name: 'Huge', action: 'write', mode: 'sync' });
        const started = process.hrtime.bigint();
        replayWorldProjection(db, { directories, repairKey: key });
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        console.info(`[u004] 8 MiB projection replay holds the SQLite writer lock for ${elapsedMs.toFixed(1)} ms`);
        expect(fs.statSync(worldFile(directories, 'Huge')).size).toBeGreaterThan(8 * 1024 * 1024);
        expect(elapsedMs).toBeLessThan(5000);
    });
});
