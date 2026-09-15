import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    const sourcePath = relativePath === 'public/index.html' && process.env.U002_INDEX_SOURCE
        ? process.env.U002_INDEX_SOURCE
        : path.join(repoRoot, relativePath);
    return fs.readFileSync(sourcePath, 'utf8');
}

function exists(relativePath) {
    return fs.existsSync(path.join(repoRoot, relativePath));
}

describe('retired legacy background and expressions surfaces', () => {
    test('removes retired modules and extension assets', () => {
        expect(exists('public/scripts/backgrounds.js')).toBe(false);
        expect(exists('public/scripts/background-domain.js')).toBe(false);
        expect(exists('public/scripts/background-library-service.js')).toBe(false);
        expect(exists('public/scripts/extensions/expressions')).toBe(false);
    });

    test('removes legacy background and expressions integration without removing group sprite semantics', () => {
        const script = read('public/script.js');
        const powerUser = read('public/scripts/power-user.js');
        const slashCommands = read('public/scripts/slash-commands.js');
        const extensions = read('public/scripts/extensions.js');
        const index = read('public/index.html');

        expect(script).not.toMatch(/backgroundLibrary|background-domain|backgrounds\.js|openBackgrounds|initBackgrounds|deferredBackgroundTask/);
        expect(script).toContain('background_settings');
        expect(script).toContain('loadBackgroundSettings(settings);');
        expect(script).toContain('background: background_settings,');
        expect(powerUser).not.toContain('from \'./backgrounds.js\'');
        expect(powerUser).not.toContain('name: \'bgcol\'');
        expect(slashCommands).not.toContain('from \'./backgrounds.js\'');
        expect(slashCommands).not.toMatch(/setBackgroundCallback|name: ['"]background['"]/);
        expect(extensions).not.toMatch(/expressionOverrides|\bexpressions\s*:/);
        expect(index).not.toContain('id="Backgrounds"');
        expect(index).not.toContain('backgrounds-drawer-toggle');
        expect(index).not.toContain('id="expressions_container"');
        expect(index).not.toContain('background_thumbnails_animation');
        expect(index).not.toContain('id="background_template"');
        expect(index).not.toContain('id="bg_folder_tile_template"');
        expect(index).not.toContain('id="bg_new_folder_template"');
        expect(script).toContain('hideMutedSprites');
        expect(index).toContain('id="rm_group_hidemutedsprites"');
    });

    test('does not leave retired sprite endpoint or extension imports in the frontend shell', () => {
        const files = [
            'public/script.js',
            'public/scripts/power-user.js',
            'public/scripts/slash-commands.js',
            'public/scripts/extensions.js',
            'public/index.html',
        ];

        for (const file of files) {
            expect(read(file)).not.toMatch(/api\/sprites|extensions\/expressions/);
        }
    });
});
