/**
 * Guards the default-content seeding contract after the legacy content types
 * (workflow, kobold_preset, novel_preset, moving_ui, quick_replies) were
 * retired from default/content/index.json and content-manager.
 *
 * Covered:
 * - new users no longer receive the 34 retired default files
 * - active default content still seeds (character/world/avatar/
 *   openai_preset plus global stylesheet and error pages; settings no longer
 *   seeds a file — canonical storage owns defaults)
 * - pre-existing user files in retired-type directories are left byte-identical
 * - repeated seeding is idempotent via content.log
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ORIGINAL_DATA_ROOT = globalThis.DATA_ROOT;

const RETIRED_DEFAULT_FILES = [
    'Default_Comfy_Workflow.json',
    'Char_Avatar_Comfy_Workflow.json',
];

function walkFiles(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }
    const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter(entry => entry.isFile())
        .map(entry => path.join(entry.parentPath ?? entry.path, entry.name));
}

function walkNames(dir) {
    return walkFiles(dir).map(file => path.basename(file));
}

describe('default content seeding', () => {
    let dataRoot;
    let checkForNewContent;
    let getUserDirectories;

    beforeAll(async () => {
        dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-content-seed-'));
        globalThis.DATA_ROOT = dataRoot;

        const { setConfigFilePath } = await import('../src/util.js');
        const configPath = path.join(dataRoot, 'config.yaml');
        fs.writeFileSync(configPath, 'port: 8000\n', 'utf8');
        setConfigFilePath(configPath);

        const contentManager = await import('../src/endpoints/content-manager.js');
        const userDirectories = await import('../src/user-directories.js');
        checkForNewContent = contentManager.checkForNewContent;
        getUserDirectories = userDirectories.getUserDirectories;
    });

    afterAll(() => {
        globalThis.DATA_ROOT = ORIGINAL_DATA_ROOT;
        fs.rmSync(dataRoot, { recursive: true, force: true });
    });

    test('index.json registers no retired content types', async () => {
        const { serverDirectory } = await import('../src/server-directory.js');
        const index = JSON.parse(fs.readFileSync(path.join(serverDirectory, 'default/content/index.json'), 'utf8'));
        const types = new Set(index.map(item => item.type));

        for (const retired of ['workflow', 'kobold_preset', 'novel_preset', 'moving_ui', 'quick_replies']) {
            expect(types.has(retired)).toBe(false);
        }
    });

    test('new user gets active defaults but none of the retired files', async () => {
        const directories = getUserDirectories('seed-fresh-user');
        await checkForNewContent([directories], [], { freshUser: true });

        // settings.json no longer seeds: canonical storage is authoritative
        // and lazily creates the defaults document on first read.
        expect(fs.existsSync(path.join(directories.root, 'settings.json'))).toBe(false);
        expect(fs.existsSync(path.join(directories.characters, 'default_Seraphina.png'))).toBe(true);
        expect(fs.existsSync(path.join(directories.worlds, 'Eldoria.json'))).toBe(true);
        expect(fs.existsSync(path.join(directories.avatars, 'user-default.png'))).toBe(true);
        // openai_preset seeds into canonical preset_documents, never as a file.
        expect(fs.existsSync(path.join(directories.openAI_Settings, 'Default.json'))).toBe(false);
        const seededDb = new DatabaseSync(path.join(directories.storage, 'emberdesk.sqlite'));
        try {
            const row = seededDb.prepare(
                'SELECT payload_json, source FROM preset_documents WHERE api_id = ? AND name = ?',
            ).get('openai', 'Default');
            expect(row).toBeTruthy();
            expect(row.source).toBe('seed');
            expect(JSON.parse(String(row.payload_json))).toEqual(
                JSON.parse(fs.readFileSync(new URL('../default/content/presets/openai/Default.json', import.meta.url), 'utf8')),
            );
        } finally {
            seededDb.close();
        }

        // Retired-type target directories are not part of the template and receive nothing.
        for (const key of ['koboldAI_Settings', 'novelAI_Settings', 'movingUI', 'quickreplies', 'comfyWorkflows']) {
            expect(directories).not.toHaveProperty(key);
        }

        // No retired default filename appears anywhere under the user root.
        const seededNames = walkNames(directories.root);
        for (const name of RETIRED_DEFAULT_FILES) {
            expect(seededNames).not.toContain(name);
        }

        // Global-scoped content still lands.
        expect(fs.existsSync(path.join(dataRoot, '_css', 'user.css'))).toBe(true);
        const errorPages = walkNames(path.join(dataRoot, '_errors'));
        expect(errorPages).toEqual(expect.arrayContaining([
            'forbidden-by-whitelist.html',
            'host-not-allowed.html',
            'unauthorized.html',
            'url-not-found.html',
        ]));
    });

    test('pre-existing files in retired-type directories are left untouched', async () => {
        const directories = getUserDirectories('seed-legacy-user');
        const legacyDir = path.join(directories.root, 'KoboldAI Settings');
        const legacyFile = path.join(legacyDir, 'Legacy-Custom.json');
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.writeFileSync(legacyFile, '{"sentinel":"keep-me"}', 'utf8');

        await checkForNewContent([directories]);

        expect(fs.readFileSync(legacyFile, 'utf8')).toBe('{"sentinel":"keep-me"}');
        // Only the pre-existing file is present; nothing new was added.
        expect(walkNames(legacyDir)).toEqual(['Legacy-Custom.json']);
    });

    test('repeated seeding is idempotent', async () => {
        const directories = getUserDirectories('seed-fresh-user');
        await checkForNewContent([directories]);
        const firstRun = walkFiles(directories.root).sort();

        await checkForNewContent([directories]);
        const secondRun = walkFiles(directories.root).sort();

        expect(secondRun).toEqual(firstRun);
    });

    test('seed does not resurrect a deleted world tombstone', async () => {
        const directories = getUserDirectories('seed-tombstone-user');
        await checkForNewContent([directories], [], { freshUser: true });
        const target = path.join(directories.worlds, 'Eldoria.json');
        expect(fs.existsSync(target)).toBe(true);

        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const { runCanonicalMigrations } = await import('../src/canonical-sqlite-migrations.js');
        const { upsertCanonicalWorldInfoBook, markCanonicalWorldInfoBookDeleted } = await import('../src/endpoints/world-info-store.js');
        const db = canonicalSqliteManager.open({
            handle: 'seed-tombstone-user',
            directories,
            featureFlags: { enabled: true, strict: false },
        });


        runCanonicalMigrations(db);
        upsertCanonicalWorldInfoBook(db, { name: 'Eldoria', payload: { entries: {} }, nowMs: 1 });
        markCanonicalWorldInfoBookDeleted(db, { name: 'Eldoria', nowMs: 2 });
        canonicalSqliteManager.close(directories);

        fs.rmSync(target, { force: true });
        fs.writeFileSync(path.join(directories.root, 'content.log'), '', 'utf8');
        await checkForNewContent([directories]);

        expect(fs.existsSync(target)).toBe(false);
        const reopened = new DatabaseSync(path.join(directories.storage, 'emberdesk.sqlite'));
        try {
            const row = reopened.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Eldoria');
            expect(row.deleted_at_ms).not.toBeNull();
        } finally {
            reopened.close();
        }
    });

    test('seed does not publish over an existing canonical world without a file', async () => {
        const directories = getUserDirectories('seed-live-authority');
        await checkForNewContent([directories], [], { freshUser: true });
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const { upsertCanonicalWorldInfoBook } = await import('../src/endpoints/world-info-store.js');
        const db = canonicalSqliteManager.open({ handle: 'seed-live-authority', directories, featureFlags: { enabled: true, strict: false } });
        upsertCanonicalWorldInfoBook(db, { name: 'Eldoria', payload: { entries: { one: { content: 'authority' } } } });
        canonicalSqliteManager.close(directories);
        fs.rmSync(path.join(directories.worlds, 'Eldoria.json'), { force: true });
        fs.writeFileSync(path.join(directories.root, 'content.log'), '');
        await checkForNewContent([directories]);
        expect(fs.existsSync(path.join(directories.worlds, 'Eldoria.json'))).toBe(false);
    });


    test('seed blocks safely when the canonical database cannot be opened and keeps the log entry', async () => {
        const directories = getUserDirectories('seed-unavailable-user');
        fs.mkdirSync(directories.worlds, { recursive: true });
        fs.mkdirSync(directories.storage, { recursive: true });
        // A directory where the database file belongs makes SQLite open fail.
        fs.mkdirSync(path.join(directories.storage, 'emberdesk.sqlite'), { recursive: true });
        const contentLogPath = path.join(directories.root, 'content.log');

        await checkForNewContent([directories]);

        expect(fs.existsSync(path.join(directories.worlds, 'Eldoria.json'))).toBe(false);
        const log = fs.existsSync(contentLogPath) ? fs.readFileSync(contentLogPath, 'utf8') : '';
        expect(log).not.toContain('Eldoria.json');
    });

    test('seed waits for a concurrent delete transaction and does not publish after its tombstone commits', async () => {
        const directories = getUserDirectories('seed-delete-race-user');
        await checkForNewContent([directories], [], { freshUser: true });
        const target = path.join(directories.worlds, 'Eldoria.json');
        expect(fs.existsSync(target)).toBe(true);

        // Reset the world so only this test decides whether it comes back.
        const { canonicalSqliteManager } = await import('../src/canonical-sqlite.js');
        const { upsertCanonicalWorldInfoBook } = await import('../src/endpoints/world-info-store.js');
        const seededDb = canonicalSqliteManager.open({
            handle: 'seed-delete-race-user',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        upsertCanonicalWorldInfoBook(seededDb, { name: 'Eldoria', payload: { entries: {} }, nowMs: 1 });
        canonicalSqliteManager.close(directories);
        fs.rmSync(target, { force: true });
        fs.writeFileSync(path.join(directories.root, 'content.log'), '', 'utf8');

        const dbPath = path.join(directories.storage, 'emberdesk.sqlite');
        const readyPath = path.join(directories.root, 'delete-holds-lock');
        const script = `
            import fs from 'node:fs';
            import { DatabaseSync } from 'node:sqlite';
            const [dbPath, readyPath] = JSON.parse(process.argv[1]);
            const db = new DatabaseSync(dbPath);
            db.exec('PRAGMA busy_timeout = 5000');
            db.exec('BEGIN IMMEDIATE');
            db.prepare('UPDATE world_books SET deleted_at_ms = ?, updated_at_ms = ? WHERE name = ?').run(2000, 2000, 'Eldoria');
            fs.writeFileSync(readyPath, 'ready');
            await new Promise(resolve => setTimeout(resolve, 600));
            db.exec('COMMIT');
            db.close();
        `;
        const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([dbPath, readyPath])], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const exit = new Promise((resolve, reject) => {
            let stderr = '';
            child.stderr.on('data', chunk => { stderr += chunk; });
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve() : reject(new Error(`delete child exited ${code}: ${stderr}`)));
        });

        const waitUntil = (deadline) => {
            while (!fs.existsSync(readyPath)) {
                if (Date.now() > deadline) {
                    throw new Error('delete child did not take the writer lock in time');
                }
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
            }
        };
        waitUntil(Date.now() + 5000);

        // This seed must block on the writer lock and then observe the tombstone.
        await checkForNewContent([directories]);
        await exit;

        expect(fs.existsSync(target)).toBe(false);
        const reopened = new DatabaseSync(dbPath);
        try {
            const row = reopened.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get('Eldoria');
            expect(row.deleted_at_ms).not.toBeNull();
        } finally {
            reopened.close();
        }
    });
});
