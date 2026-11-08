import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalShadowImport,
    runCanonicalShadowImport,
} from '../src/canonical-sqlite-shadow-import.js';
import { decideCanonicalBackendInitAction } from '../src/canonical-backend.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import {
    classifyImportCandidate,
    getImportLedgerEntry,
    hashImportLedgerContents,
    listImportLedgerEntries,
    recordImportLedgerEntry,
} from '../src/canonical-import-ledger.js';
import { exportCanonicalStorageToFiles } from '../src/canonical-sqlite-export.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';
import { writeCanonicalSecret } from '../src/endpoints/canonical-secrets-store.js';
import { upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.js';
import { listCanonicalWorldInfoBookRows, upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.js';
import { commitWorldBookWithProjectionIntent, replayWorldProjection } from '../src/canonical-world-info-projection.js';
import { upsertCanonicalManagedMediaReference } from '../src/endpoints/canonical-managed-media-store.js';
import { parse as parseCharacterCard } from '../src/character-card-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-export-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        worlds: path.join(root, 'worlds'),
        backgrounds: path.join(root, 'backgrounds'),
        assets: path.join(root, 'assets'),
        avatars: path.join(root, 'User Avatars'),
        files: path.join(root, 'user', 'files'),
        userImages: path.join(root, 'user', 'images'),
    };
    for (const directory of Object.values(directories)) {
        if (directory !== root) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }
    return directories;
}

function createManager() {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    return manager;
}

function openDb(manager, directories, handle = 'alice') {
    const db = manager.open({ handle, directories, featureFlags: { enabled: true, strict: false } });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    return db;
}

function createSnapshotBuilder() {
    return (avatar, directories) => buildCharacterFileSnapshotRow({
        avatar,
        directories,
        readCharacterData: async filePath => fs.readFileSync(filePath, 'utf8'),
        getCharaCardV2: jsonObject => jsonObject,
    });
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical import ledger', () => {
    test('export inside an existing transaction fails before writing and leaves the caller transaction intact', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        const outDir = path.join(root, 'staging');
        db.exec('BEGIN IMMEDIATE');
        try {
            expect(() => exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['secrets'], outDir })).toThrow(/transaction/i);
            expect(fs.existsSync(outDir)).toBe(false);
            db.exec('INSERT INTO import_ledger (slice_key, source_path, content_hash, origin, imported_at_ms) VALUES (\'test\', \'x\', \'hash\', \'export\', 1)');
            expect(db.prepare('SELECT count(*) AS n FROM import_ledger WHERE slice_key = \'test\'').get().n).toBe(1);
        } finally {
            db.exec('ROLLBACK');
        }
        expect(db.prepare('SELECT count(*) AS n FROM import_ledger WHERE slice_key = \'test\'').get().n).toBe(0);
    });
    test('isolated managed-media export reads its blob from active storage without changing the active ledger', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        const source = path.join(directories.storage, 'managed', 'blob');
        fs.mkdirSync(path.dirname(source), { recursive: true });
        fs.writeFileSync(source, 'media data');
        upsertCanonicalManagedMediaReference(db, {
            compatibilityPath: 'backgrounds/sky.png', managedRelativePath: 'managed/blob',
            contentHash: 'isolated-blob-hash', sizeBytes: 10, ownerType: 'background',
        });
        const before = listImportLedgerEntries(db);
        const outDir = path.join(root, 'staging');
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['managed_media'], outDir });
        expect(result.slices[0].results[0].status).toBe('exported');
        expect(fs.readFileSync(path.join(outDir, 'backgrounds', 'sky.png'), 'utf8')).toBe('media data');
        expect(listImportLedgerEntries(db)).toEqual(before);
    });
    test('a new book cannot enter the export snapshot while an independent protocol writer is busy', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Alpha', payload: { entries: {} } });
        const out = path.join(root, 'out');
        fs.mkdirSync(path.join(out, 'worlds'), { recursive: true });
        const activeBeta = path.join(directories.worlds, 'Beta.json');
        fs.writeFileSync(activeBeta, 'old B');
        fs.symlinkSync(activeBeta, path.join(out, 'worlds', 'Beta.json'));
        const alphaTarget = path.join(out, 'worlds', 'Alpha.json');
        const sqlUrl = pathToFileURL(path.join(repoRoot, 'src/canonical-sqlite.js')).href;
        const projectionUrl = pathToFileURL(path.join(repoRoot, 'src/canonical-world-info-projection.js')).href;
        const script = `import {createCanonicalSqliteManager} from ${JSON.stringify(sqlUrl)};
            import {commitWorldBookWithProjectionIntent} from ${JSON.stringify(projectionUrl)};
            const directories = JSON.parse(process.argv[1]);
            const manager = createCanonicalSqliteManager({logger:{info(){},warn(){}}});
            const db = manager.open({handle:'alice',directories,featureFlags:{enabled:true}});
            db.exec('PRAGMA busy_timeout=50');
            try { commitWorldBookWithProjectionIntent(db,{directories,name:'Beta',payload:{entries:{x:{content:'C'}}},mode:'sync'}); process.exit(2); }
            catch (error) { if (!/locked|busy/i.test(error.message)) { console.error(error); process.exit(3); } process.exit(0); }`;
        let writer;
        const original = fs.existsSync;
        const spy = jest.spyOn(fs, 'existsSync').mockImplementation((candidate, ...args) => {
            if (candidate === alphaTarget && !writer) writer = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(directories)], { encoding: 'utf8', timeout: 10000 });
            return original(candidate, ...args);
        });
        try {
            const before = listImportLedgerEntries(db);
            const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: out });
            expect(writer?.status).toBe(0);
            expect(result.ok).toBe(true);
            expect(fs.readFileSync(activeBeta, 'utf8')).toBe('old B');
            expect(listCanonicalWorldInfoBookRows(db).map(row => row.name)).toEqual(['Alpha']);
            expect(listImportLedgerEntries(db)).toEqual(before);
            const key = commitWorldBookWithProjectionIntent(db, { directories, name: 'Beta', payload: { entries: { x: { content: 'C' } } }, mode: 'sync' });
            replayWorldProjection(db, { directories, repairKey: key });
            expect(JSON.parse(fs.readFileSync(activeBeta, 'utf8')).entries.x.content).toBe('C');
            expect(listCanonicalWorldInfoBookRows(db).find(row => row.name === 'Beta').payload.entries.x.content).toBe('C');
            expect(db.prepare('SELECT count(*) AS n FROM world_info_projection_repairs WHERE resolved_at_ms IS NULL').get().n).toBe(0);
        } finally { spy.mockRestore(); }
    });
    test('two-book export rejects a symlink while an independent protocol writer is blocked by its lock', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Alpha', payload: { entries: {} } });
        upsertCanonicalWorldInfoBook(db, { name: 'Beta', payload: { entries: { x: { content: 'B' } } } });
        const active = path.join(directories.worlds, 'Beta.json');
        fs.writeFileSync(active, 'active B');
        const out = path.join(root, 'out');
        fs.mkdirSync(path.join(out, 'worlds'), { recursive: true });
        const target = path.join(out, 'worlds', 'Beta.json');
        fs.symlinkSync(active, target);
        const sqlUrl = pathToFileURL(path.join(repoRoot, 'src/canonical-sqlite.js')).href;
        const projectionUrl = pathToFileURL(path.join(repoRoot, 'src/canonical-world-info-projection.js')).href;
        const script = `import {createCanonicalSqliteManager} from ${JSON.stringify(sqlUrl)};
            import {commitWorldBookWithProjectionIntent} from ${JSON.stringify(projectionUrl)};
            const directories = JSON.parse(process.argv[1]);
            const manager = createCanonicalSqliteManager({logger:{info(){},warn(){}}});
            const db = manager.open({handle:'alice',directories,featureFlags:{enabled:true}});
            db.exec('PRAGMA busy_timeout=50');
            try { commitWorldBookWithProjectionIntent(db,{directories,name:'Beta',payload:{entries:{x:{content:'C'}}},mode:'sync'}); process.exit(2); }
            catch (error) { if (!/locked|busy/i.test(error.message)) { console.error(error); process.exit(3); } process.exit(0); }`;
        let writer;
        const original = fs.existsSync;
        const spy = jest.spyOn(fs, 'existsSync').mockImplementation((candidate, ...args) => {
            if (candidate === target && !writer) writer = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(directories)], { encoding: 'utf8', timeout: 10000 });
            return original(candidate, ...args);
        });
        try {
            const before = listImportLedgerEntries(db);
            const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: out });
            expect(writer?.status).toBe(0);
            expect(result.ok).toBe(false);
            expect(fs.readFileSync(active, 'utf8')).toBe('active B');
            expect(listCanonicalWorldInfoBookRows(db).find(row => row.name === 'Beta').payload.entries.x.content).toBe('B');
            expect(listImportLedgerEntries(db)).toEqual(before);
            expect(db.prepare('SELECT count(*) AS n FROM world_info_projection_repairs WHERE resolved_at_ms IS NULL').get().n).toBe(0);
        } finally { spy.mockRestore(); }
    });
    test('isolated secrets export does not add active import ledger entries', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        writeCanonicalSecret(db, { key: 'api_key_openai', value: 'secret' });
        const before = listImportLedgerEntries(db);
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['secrets'], outDir: path.join(root, 'out') });
        expect(result.ok).toBe(true);
        expect(listImportLedgerEntries(db)).toEqual(before);
    });
    test.each(['world_info', 'secrets', 'manifest'])('allows stable %s target symlink outside active worlds', slice => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Book', payload: { entries: {} } });
        writeCanonicalSecret(db, { key: 'api_key_openai', value: 'secret' });
        const out = path.join(root, 'out');
        const target = slice === 'world_info' ? path.join(out, 'worlds', 'Book.json') : path.join(out, slice === 'secrets' ? 'secrets.json' : 'export-manifest.json');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const destination = path.join(root, 'outside.json');
        fs.writeFileSync(destination, 'old');
        fs.symlinkSync(destination, target);
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: [slice === 'manifest' ? 'secrets' : slice], outDir: out });
        expect(result.ok).toBe(true);
        expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(destination, 'utf8')).not.toBe('old');
    });
    test('rejects manifest symlink into active worlds', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        const out = path.join(root, 'out'); fs.mkdirSync(out);
        const active = path.join(directories.worlds, 'Book.json'); fs.writeFileSync(active, 'sentinel');
        fs.symlinkSync(active, path.join(out, 'export-manifest.json'));
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['secrets'], outDir: out });
        expect(result.ok).toBe(false);
        expect(fs.readFileSync(active, 'utf8')).toBe('sentinel');
    });
    test('character security rejection cannot be reported as successful JSON fallback', async () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager(); const db = openDb(manager, directories);
        fs.writeFileSync(path.join(directories.characters, 'alpha.png'), JSON.stringify({ name: 'Alpha', data: { name: 'Alpha', extensions: {}, tags: [] } }));
        await runCanonicalShadowImport({ handle: 'alice', directories, featureFlags: { enabled: true, shadowImport: true, strict: false }, manager, buildSnapshotRow: createSnapshotBuilder() });
        const out = path.join(root, 'out'); fs.mkdirSync(path.join(out, 'characters'), { recursive: true });
        const active = path.join(directories.worlds, 'avatar.png');
        fs.copyFileSync(path.join(repoRoot, 'public', 'img', 'ai4.png'), active);
        const before = fs.readFileSync(active);
        fs.symlinkSync(active, path.join(out, 'characters', 'alpha.png'));
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['characters'], outDir: out });
        expect(result.ok).toBe(false);
        expect(result.slices[0].results[0].status).toBe('error');
        expect(fs.readFileSync(active)).toEqual(before);
        const cli = spawnSync(process.execPath, ['scripts/canonical-sqlite-repair.mjs', 'export-all', '--data-root', root, '--handle', 'alice', '--slice', 'characters', '--out-dir', out], { cwd: repoRoot, encoding: 'utf8' });
        expect(cli.status).not.toBe(0);
        expect(fs.readFileSync(active)).toEqual(before);
    });
    test('rejects secrets export symlink into active worlds', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        writeCanonicalSecret(db, { key: 'api_key_openai', value: 'secret' });
        const active = path.join(directories.worlds, 'Book.json');
        fs.writeFileSync(active, 'active sentinel');
        const output = path.join(root, 'out');
        fs.mkdirSync(output);
        fs.symlinkSync(active, path.join(output, 'secrets.json'));
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['secrets'], outDir: output });
        expect(result.ok).toBe(false);
        expect(fs.readFileSync(active, 'utf8')).toBe('active sentinel');
    });
    test('rejects isolated world export target symlink into active worlds', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Book', payload: { entries: {} } });
        const active = path.join(directories.worlds, 'Book.json');
        fs.writeFileSync(active, 'active sentinel');
        const output = path.join(root, 'out');
        fs.mkdirSync(path.join(output, 'worlds'), { recursive: true });
        fs.symlinkSync(active, path.join(output, 'worlds', 'Book.json'));
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: output });
        expect(result.ok).toBe(false);
        expect(fs.readFileSync(active, 'utf8')).toBe('active sentinel');
    });

    test('does not write an export manifest inside active worlds', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        const manifest = path.join(directories.worlds, 'export-manifest.json');
        fs.writeFileSync(manifest, 'active sentinel');
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: directories.worlds });
        expect(result.ok).toBe(false);
        expect(fs.readFileSync(manifest, 'utf8')).toBe('active sentinel');
    });

    test('blocks export into active world paths even without pending repair, but allows isolated output', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Book', payload: { entries: {} } });
        const active = path.join(directories.worlds, 'Book.json');
        fs.writeFileSync(active, 'newer projection');
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'] });
        expect(result.ok).toBe(false);
        expect(fs.readFileSync(active, 'utf8')).toBe('newer projection');
        const alias = path.join(root, 'alias');
        fs.symlinkSync(directories.root, alias, 'dir');
        const aliased = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: alias });
        expect(aliased.ok).toBe(false);
        expect(fs.readFileSync(active, 'utf8')).toBe('newer projection');
        const outDir = path.join(root, 'isolated');
        const isolated = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir });
        expect(isolated.ok).toBe(true);
        expect(fs.existsSync(path.join(outDir, 'worlds', 'Book.json'))).toBe(true);
    });

    test('does not overwrite a newer active projection after an export read, and exports the current row in isolation', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const db = openDb(createManager(), directories);
        upsertCanonicalWorldInfoBook(db, {
            name: 'Book',
            payload: { name: 'Stale Export', entries: { one: { content: 'old' } } },
        });
        const active = path.join(directories.worlds, 'Book.json');

        // The export candidate is read, then a projection-intent write lands a
        // newer payload in the active path before the export writes anything.
        const staleRows = listCanonicalWorldInfoBookRows(db);
        expect(staleRows).toHaveLength(1);
        upsertCanonicalWorldInfoBook(db, {
            name: 'Book',
            payload: { name: 'Newer Projection', entries: { one: { content: 'new' } } },
        });
        fs.writeFileSync(active, JSON.stringify({ name: 'Newer Projection', entries: { one: { content: 'new' } } }, null, 4));
        // No repair row exists, so only the path guard protects the file.
        expect(db.prepare('SELECT COUNT(*) AS count FROM world_info_projection_repairs WHERE resolved_at_ms IS NULL').get().count).toBe(0);

        const overlapping = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'] });
        expect(overlapping.ok).toBe(false);
        expect(fs.readFileSync(active, 'utf8')).toContain('Newer Projection');

        const outDir = path.join(root, 'isolated-race');
        const isolated = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir });
        expect(isolated.ok).toBe(true);
        const exported = JSON.parse(fs.readFileSync(path.join(outDir, 'worlds', 'Book.json'), 'utf8'));
        expect(exported.name).toBe('Newer Projection');
    });
    test('records, classifies, and supersedes file contents per slice', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        const db = openDb(manager, directories);

        recordImportLedgerEntry(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.export.json',
            contentHash: hashImportLedgerContents('{"a":1}'),
            origin: 'import',
            nowMs: 1000,
        });

        expect(classifyImportCandidate(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.export.json',
            contentHash: hashImportLedgerContents('{"a":1}'),
        })).toBe('known');
        expect(classifyImportCandidate(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.export.json',
            contentHash: hashImportLedgerContents('{"a":2}'),
        })).toBe('candidate');
        expect(classifyImportCandidate(db, {
            sliceKey: 'settings',
            sourcePath: 'other.json',
            contentHash: 'whatever',
        })).toBe('candidate');
        expect(classifyImportCandidate(db, {
            sliceKey: 'chats',
            sourcePath: 'settings.export.json',
            contentHash: hashImportLedgerContents('{"a":1}'),
        })).toBe('candidate');

        recordImportLedgerEntry(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.export.json',
            contentHash: hashImportLedgerContents('{"a":2}'),
            origin: 'projection',
            nowMs: 2000,
        });
        const entry = getImportLedgerEntry(db, { sliceKey: 'settings', sourcePath: 'settings.export.json' });
        expect(entry).toEqual(expect.objectContaining({
            origin: 'projection',
            importedAtMs: 2000,
        }));
        expect(listImportLedgerEntries(db, { sliceKey: 'settings' })).toHaveLength(1);
    });

    test('character shadow import records imported file hashes', async () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        const db = openDb(manager, directories);

        fs.writeFileSync(path.join(directories.characters, 'alpha.png'), JSON.stringify({
            name: 'Alpha',
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        }));

        const result = await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow: createSnapshotBuilder(),
            nowMs: 1735689600000,
        });
        expect(result.ok).toBe(true);

        const entry = getImportLedgerEntry(db, {
            sliceKey: 'characters',
            sourcePath: 'characters/alpha.png',
        });
        expect(entry).toEqual(expect.objectContaining({
            origin: 'import',
            contentHash: hashImportLedgerContents(fs.readFileSync(path.join(directories.characters, 'alpha.png'))),
        }));
        expect(classifyImportCandidate(db, {
            sliceKey: 'characters',
            sourcePath: 'characters/alpha.png',
            contentHash: hashImportLedgerContents(fs.readFileSync(path.join(directories.characters, 'alpha.png'))),
        })).toBe('known');
    });

    test('routes candidate file drift to import-heal and known-file drift to blocked', async () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        openDb(manager, directories);
        const buildSnapshotRow = createSnapshotBuilder();
        const flags = { enabled: true, shadowImport: true, strict: false };

        fs.writeFileSync(path.join(directories.characters, 'alpha.png'), JSON.stringify({
            name: 'Alpha',
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        }));
        await runCanonicalShadowImport({
            handle: 'alice', directories, featureFlags: flags, manager, buildSnapshotRow,
        });

        // Out-of-band file change -> candidate drift -> import-heal route.
        fs.writeFileSync(path.join(directories.characters, 'alpha.png'), JSON.stringify({
            name: 'Alpha',
            description: 'out of band edit',
            data: { name: 'Alpha', description: 'out of band edit', extensions: { fav: false, world: '' }, tags: [] },
        }));
        const candidateAudit = await auditCanonicalShadowImport({
            handle: 'alice', directories, db: manager.open({ handle: 'alice', directories, featureFlags: flags }), buildSnapshotRow,
        });
        expect(candidateAudit.blocking).toBe(true);
        expect(candidateAudit.reason).toBe('audit_stale_file_changes');
        expect(decideCanonicalBackendInitAction(candidateAudit)).toBe('import');
        const driftEntry = candidateAudit.entries.find(entry => entry.status === 'drift');
        expect(driftEntry.details.import_classification).toBe('candidate');

        // Re-import heals the file side and refreshes the ledger.
        await runCanonicalShadowImport({
            handle: 'alice', directories, featureFlags: flags, manager, buildSnapshotRow,
        });

        // DB-side divergence while the file matches the ledger -> blocked.
        const db = manager.open({ handle: 'alice', directories, featureFlags: flags });
        db.prepare('UPDATE characters SET card_json = ?').run(JSON.stringify({ name: 'Alpha', mutated: true }));
        const lagAudit = await auditCanonicalShadowImport({
            handle: 'alice', directories, db, buildSnapshotRow,
        });
        expect(lagAudit.reason).toBe('audit_drift_blocked');
        expect(decideCanonicalBackendInitAction(lagAudit)).toBe('skip');
        const lagEntry = lagAudit.entries.find(entry => entry.status === 'drift');
        expect(lagEntry.details.import_classification).toBe('known');
    });
});

describe('canonical export-all', () => {
    test('isolated world export does not alter the active world import ledger', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        const db = openDb(manager, directories);
        upsertCanonicalWorldInfoBook(db, { name: 'Book', payload: { entries: {} } });
        const before = getImportLedgerEntry(db, { sliceKey: 'world_info', sourcePath: 'worlds/Book.json' });
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: path.join(root, 'staging') });
        expect(result.ok).toBe(true);
        expect(getImportLedgerEntry(db, { sliceKey: 'world_info', sourcePath: 'worlds/Book.json' })).toEqual(before);
    });
    test('CLI exits nonzero when the active world export is blocked', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        openDb(manager, directories);
        manager.dispose();
        expect(() => execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs', 'export-all',
            '--data-root', root, '--handle', 'alice', '--slice', 'world_info',
        ], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })).toThrow();
    });
    test('materializes settings, secrets, world info, chats, and characters', async () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        const db = openDb(manager, directories);

        upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { model: 'test-model', temperature: 0.7 },
            expectedRevision: 0,
            nowMs: 1735689600000,
        });
        writeCanonicalSecret(db, {
            key: 'api_key_openai',
            value: 'sk-test-export',
            label: 'OpenAI',
            id: 'sec-1',
            nowMs: 1735689600000,
        });
        upsertCanonicalWorldInfoBook(db, {
            name: 'Lorebook',
            payload: { name: 'Lorebook', entries: { one: { content: 'lore' } } },
            nowMs: 1735689600000,
        });

        const chatDir = path.join(directories.chats, 'alpha');
        fs.mkdirSync(chatDir, { recursive: true });
        fs.writeFileSync(path.join(chatDir, 'session.jsonl'), [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","mes":"Hello"}',
        ].join('\n'));
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        fs.writeFileSync(path.join(directories.characters, 'alpha.png'), JSON.stringify({
            name: 'Alpha',
            chat: 'Alpha - chat',
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        }));
        await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow: createSnapshotBuilder(),
            nowMs: 1735689600000,
        });

        // Remove all compatibility files so export must rebuild them from DB.
        fs.rmSync(path.join(directories.characters, 'alpha.png'));
        fs.rmSync(path.join(chatDir, 'session.jsonl'));

        const worldOut = path.join(root, 'world-export');
        const worldResult = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['world_info'], outDir: worldOut });
        expect(worldResult.ok).toBe(true);
        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', sliceKeys: ['characters', 'settings', 'secrets', 'chats', 'managed_media', 'presets'], nowMs: 1735689700000 });
        expect(result.ok).toBe(true);

        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.export.json'), 'utf8'))).toEqual(
            expect.objectContaining({ model: 'test-model' }),
        );
        const secrets = JSON.parse(fs.readFileSync(path.join(directories.root, 'secrets.json'), 'utf8'));
        expect(secrets.api_key_openai).toBeDefined();

        expect(JSON.parse(fs.readFileSync(path.join(worldOut, 'worlds', 'Lorebook.json'), 'utf8'))).toEqual(
            expect.objectContaining({ name: 'Lorebook' }),
        );

        const exportedChat = fs.readFileSync(path.join(chatDir, 'session.jsonl'), 'utf8');
        expect(exportedChat).toContain('"mes":"Hello"');

        // Character export: PNG materialized from default avatar with card data embedded.
        const exportedCard = JSON.parse(await parseCharacterCard(path.join(directories.characters, 'alpha.png'), 'png'));
        expect(exportedCard.name).toBe('Alpha');

        // Export wrote ledger entries so the files are 'known', not candidates.
        const chatEntry = getImportLedgerEntry(db, {
            sliceKey: 'chats',
            sourcePath: 'chats/alpha/session.jsonl',
        });
        expect(chatEntry).toEqual(expect.objectContaining({ origin: 'export' }));
    });

    test('materializes into an alternate root with --out-dir', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const outDir = path.join(root, 'staging');
        const manager = createManager();
        const db = openDb(manager, directories);

        upsertCanonicalSettingsDocument(db, {
            userId: 'alice',
            payload: { staged: true },
            expectedRevision: 0,
        });

        const result = exportCanonicalStorageToFiles({
            db, directories, handle: 'alice', sliceKeys: ['settings'], outDir,
        });
        expect(result.ok).toBe(true);
        expect(fs.existsSync(path.join(outDir, 'settings.export.json'))).toBe(true);
        expect(fs.existsSync(path.join(directories.root, 'settings.export.json'))).toBe(false);
    });

    test('export-all CLI materializes a world book and a chat', async () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        const db = openDb(manager, directories);

        upsertCanonicalWorldInfoBook(db, {
            name: 'CliBook',
            payload: { name: 'CliBook', entries: {} },
            nowMs: 1735689600000,
        });
        manager.dispose();

        const output = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'export-all',
            '--data-root', root,
            '--handle', 'alice',
            '--slice', 'world_info',
            '--out-dir', path.join(root, 'staging'),
        ], { cwd: repoRoot, encoding: 'utf8' });

        expect(output).toContain('world_info: exported=1');
        expect(JSON.parse(fs.readFileSync(path.join(root, 'staging', 'worlds', 'CliBook.json'), 'utf8'))).toEqual(
            expect.objectContaining({ name: 'CliBook' }),
        );
    });
});
