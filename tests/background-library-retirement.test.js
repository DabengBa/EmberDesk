import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectSourceFiles(relativeDirectory) {
    const root = path.join(repoRoot, relativeDirectory);
    const files = [];

    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectSourceFiles(relativePath));
        } else if (/\.(?:css|html|js|mjs|ts|tsx|yaml)$/.test(entry.name)) {
            files.push(relativePath);
        }
    }

    return files;
}

const executableProductFiles = [
    'server.js',
    'public/index.html',
    'public/script.js',
    'default/config.yaml',
    'doctor.config.js',
    ...['app', 'public/css', 'public/scripts', 'scripts', 'src'].flatMap(collectSourceFiles),
];

const retiredManagementMarkers = [
    'backgroundLibrary',
    'BackgroundLibrary',
    'background-library',
    'backgroundsRouter',
    '/api/backgrounds',
    '/getbackgrounds',
    '/delbackground',
    '/renamebackground',
    '/downloadbackground',
    '/lockbg',
    '/unlockbg',
    '/autobg',
    '#Backgrounds',
    'backgrounds-button',
    'openBackgrounds',
    'background-domain',
    'background-library-service',
    'bg_example',
    'bg_tabs',
    'bg_menu_content',
    'bg_folder_grid',
    'backgrounds-drawer-toggle',
    'emberdesk:background-library-state-change',
    'deferred.getBackgrounds',
    '/api/image-metadata/folders',
];

describe('Background Library retirement baseline', () => {
    test('removes the server route module and all legacy route registrations', () => {
        expect(fs.existsSync(path.join(repoRoot, 'src/endpoints/backgrounds.js'))).toBe(false);

        const startupSource = read('src/server-startup.js');
        expect(startupSource).not.toContain("import { router as backgroundsRouter } from './endpoints/backgrounds.js';");
        expect(startupSource).not.toContain("app.use('/api/backgrounds', backgroundsRouter);");
        for (const route of ['/getbackgrounds', '/delbackground', '/renamebackground', '/downloadbackground']) {
            expect(startupSource).not.toContain(`redirect('${route}'`);
        }
    });

    test('removes React, legacy, feature, store, command, and bridge management references', () => {
        for (const relativePath of executableProductFiles) {
            const source = read(relativePath);
            for (const marker of retiredManagementMarkers) {
                expect(source).not.toContain(marker);
            }
        }

        expect(fs.existsSync(path.join(repoRoot, 'public/scripts/backgrounds.js'))).toBe(false);

        const slashCommandsSource = read('public/scripts/slash-commands.js');
        const powerUserSource = read('public/scripts/power-user.js');
        for (const command of ['lockbg', 'unlockbg', 'autobg', 'bgcol']) {
            expect(slashCommandsSource).not.toContain(`name: '${command}'`);
            expect(powerUserSource).not.toContain(`name: '${command}'`);
        }
    });

    test('retires the /bg and /background slash commands with the management surface', () => {
        const slashCommandsSource = read('public/scripts/slash-commands.js');

        expect(slashCommandsSource).not.toContain("name: 'bg'");
        expect(slashCommandsSource).not.toContain("name: 'background'");
        expect(slashCommandsSource).not.toContain('setBackgroundCallback');
        expect(slashCommandsSource).not.toContain('enumProvider: commonEnumProviders.backgrounds');
    });

    test('preserves background static reads, rendering, and settings', () => {
        const usersSource = read('src/users.js');
        const indexSource = read('public/index.html');
        const scriptSource = read('public/script.js');

        expect(usersSource).toContain("router.use('/backgrounds/*filePath'");
        expect(indexSource).toContain('<div id="bg1"></div>');
        expect(scriptSource).toContain('export let background_settings');
        expect(scriptSource).toContain('export function loadBackgroundSettings(settings)');
        expect(scriptSource).toContain('settings?.background');
        expect(scriptSource).toContain('export function resolveActiveBackgroundUrl(metadata, globalUrl)');
        expect(scriptSource).toContain("$('#bg1')");
    });

    test('preserves canonical managed-media references, tombstones, repair, and chat attachments', () => {
        const mediaStoreSource = read('src/endpoints/canonical-managed-media-store.js');
        const mediaWriteSource = read('src/endpoints/canonical-managed-media-write-service.js');
        const mediaImportSource = read('src/canonical-managed-media-shadow-import.js');
        const chatStoreSource = read('src/endpoints/canonical-chat-store.js');

        expect(mediaStoreSource).toContain('export function listCanonicalManagedMediaReferences');
        expect(mediaWriteSource).toContain('export async function deleteCanonicalManagedMediaReference');
        expect(mediaWriteSource).toContain("lifecycle_state = 'tombstoned'");
        expect(mediaWriteSource).toContain('export async function repairCanonicalManagedMediaProjection');
        expect(mediaImportSource).toContain("export const MANAGED_MEDIA_AUDIT_SCOPE = 'managed_media'");
        expect(chatStoreSource).toContain('attachments');
    });
});
