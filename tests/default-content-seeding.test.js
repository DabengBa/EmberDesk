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
        await checkForNewContent([directories]);

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
});
