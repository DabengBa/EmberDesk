import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

async function importContextModule() {
    return import(`../public/scripts/world-info-shell-context.js?worldInfoShellContext=${Date.now()}-${Math.random()}`);
}

afterEach(async () => {
    try {
        const module = await importContextModule();
        module.clearWorldInfoShellContext();
    } catch {
        // Module may not exist yet during red proof.
    }
});

describe('world info shell context', () => {
    test('requires an explicit shell context before shell-owned world-info paths run', async () => {
        const module = await importContextModule();

        expect(() => module.requireWorldInfoShellContext()).toThrow('World Info shell context is not registered.');

        const shellContext = {
            saveSettings: () => {},
            substituteParams: value => String(value),
            getRequestHeaders: () => ({}),
            getChatMetadata: () => ({}),
            getCurrentCharacterId: () => 0,
            getCharacters: () => [],
            saveCharacterDebounced: () => {},
            getMenuType: () => 'view',
            eventSource: { on() {}, emit() {} },
            eventTypes: { CHAT_CHANGED: 'chat_changed' },
            getExtensionPromptByName: async () => '',
            saveMetadata: async () => {},
            getCurrentChatId: () => 'chat-1',
            extensionPromptRoles: { SYSTEM: 'system' },
            getCreateSave: () => ({}),
            createOrEditCharacter: async () => {},
            getName1: () => 'User',
            getOneCharacter: async () => {},
            selectSelectedCharacter: () => {},
        };

        module.registerWorldInfoShellContext(shellContext);

        expect(module.getWorldInfoShellContext()).toBe(shellContext);
        expect(module.requireWorldInfoShellContext()).toBe(shellContext);
    });

    test('routes world-info shell dependencies through the dedicated context seam', () => {
        const worldInfoSource = read('public/scripts/world-info.js');
        const scriptSource = read('public/script.js');

        expect(worldInfoSource).toContain("from './world-info-shell-context.js'");
        expect(worldInfoSource).not.toContain("from '../script.js'");
        expect(worldInfoSource).toContain('requireWorldInfoShellContext');
        expect(worldInfoSource).toContain('function getWorldInfoShell()');
        expect(scriptSource).toContain('registerWorldInfoShellContext({');
        expect(scriptSource).toContain('getChatMetadata: () => chat_metadata');
        expect(scriptSource).toContain('getCurrentCharacterId: () => this_chid');
        expect(scriptSource).toContain('getCharacters: () => characters');
    });
});
