import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';

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
import { upsertCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.js';
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
    test('records, classifies, and supersedes file contents per slice', () => {
        const root = makeRoot();
        const directories = createDirectories(path.join(root, 'alice'));
        const manager = createManager();
        const db = openDb(manager, directories);

        recordImportLedgerEntry(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.json',
            contentHash: hashImportLedgerContents('{"a":1}'),
            origin: 'import',
            nowMs: 1000,
        });

        expect(classifyImportCandidate(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.json',
            contentHash: hashImportLedgerContents('{"a":1}'),
        })).toBe('known');
        expect(classifyImportCandidate(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.json',
            contentHash: hashImportLedgerContents('{"a":2}'),
        })).toBe('candidate');
        expect(classifyImportCandidate(db, {
            sliceKey: 'settings',
            sourcePath: 'other.json',
            contentHash: 'whatever',
        })).toBe('candidate');
        expect(classifyImportCandidate(db, {
            sliceKey: 'chats',
            sourcePath: 'settings.json',
            contentHash: hashImportLedgerContents('{"a":1}'),
        })).toBe('candidate');

        recordImportLedgerEntry(db, {
            sliceKey: 'settings',
            sourcePath: 'settings.json',
            contentHash: hashImportLedgerContents('{"a":2}'),
            origin: 'projection',
            nowMs: 2000,
        });
        const entry = getImportLedgerEntry(db, { sliceKey: 'settings', sourcePath: 'settings.json' });
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

        const result = exportCanonicalStorageToFiles({ db, directories, handle: 'alice', nowMs: 1735689700000 });
        expect(result.ok).toBe(true);

        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'settings.json'), 'utf8'))).toEqual(
            expect.objectContaining({ model: 'test-model' }),
        );
        const secrets = JSON.parse(fs.readFileSync(path.join(directories.root, 'secrets.json'), 'utf8'));
        expect(secrets.api_key_openai).toBeDefined();

        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual(
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
        expect(fs.existsSync(path.join(outDir, 'settings.json'))).toBe(true);
        expect(fs.existsSync(path.join(directories.root, 'settings.json'))).toBe(false);
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
        ], { cwd: repoRoot, encoding: 'utf8' });

        expect(output).toContain('world_info: exported=1');
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'CliBook.json'), 'utf8'))).toEqual(
            expect.objectContaining({ name: 'CliBook' }),
        );
    });
});
