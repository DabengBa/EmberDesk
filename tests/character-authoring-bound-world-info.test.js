import { describe, expect, test } from '@jest/globals';

import {
    openBoundWorldInfoBook,
    resolveBoundWorldInfoBookName,
} from '../public/scripts/world-info-bound-book.js';
import { readRepoFile } from './helpers/frontend-structure-contract.js';

function sliceCommand(scriptSource, commandName, length = 1200) {
    const start = scriptSource.indexOf(`${commandName}:`);
    if (start === -1) {
        throw new Error(`missing authoring command ${commandName}`);
    }
    return scriptSource.slice(start, start + length);
}

describe('bound World Info book resolution', () => {
    test('resolves the bound book when it is a real book in the world list', () => {
        expect(resolveBoundWorldInfoBookName('Colony Lore', ['Colony Lore', 'Orbital Archive'])).toBe('Colony Lore');
        expect(resolveBoundWorldInfoBookName('  Colony Lore  ', ['Colony Lore'])).toBe('Colony Lore');
        // Integer-named books stay resolvable: names win over indexes.
        expect(resolveBoundWorldInfoBookName('1', ['1', '2'])).toBe('1');
    });

    test('resolves to nothing when no book is bound', () => {
        expect(resolveBoundWorldInfoBookName('', ['Colony Lore'])).toBe('');
        expect(resolveBoundWorldInfoBookName('   ', ['Colony Lore'])).toBe('');
        expect(resolveBoundWorldInfoBookName(undefined, ['Colony Lore'])).toBe('');
        expect(resolveBoundWorldInfoBookName(null, ['Colony Lore'])).toBe('');
        expect(resolveBoundWorldInfoBookName(42, ['Colony Lore'])).toBe('');
    });

    test('resolves to nothing when the bound name is not an available book', () => {
        // A dangling link must disable the action instead of opening anything else.
        expect(resolveBoundWorldInfoBookName('Missing Book', ['Colony Lore'])).toBe('');
        expect(resolveBoundWorldInfoBookName('Colony Lore', [])).toBe('');
        expect(resolveBoundWorldInfoBookName('Colony Lore', undefined)).toBe('');
    });
});

describe('opening the bound book', () => {
    test('opens exactly the selected book and reports it', async () => {
        const opened = [];
        const result = await openBoundWorldInfoBook({
            boundName: 'Orbital Archive',
            worldNames: ['Colony Lore', 'Orbital Archive'],
            openEditor: name => {
                opened.push(name);
            },
        });

        expect(opened).toEqual(['Orbital Archive']);
        expect(result).toBe('Orbital Archive');
    });

    test('opens nothing and does not fall back when the binding is missing or dangling', async () => {
        const opened = [];
        const openEditor = name => {
            opened.push(name);
        };

        await expect(openBoundWorldInfoBook({ boundName: '', worldNames: ['Colony Lore'], openEditor }))
            .resolves.toBe('');
        await expect(openBoundWorldInfoBook({ boundName: 'Deleted Book', worldNames: ['Colony Lore'], openEditor }))
            .resolves.toBe('');
        await expect(openBoundWorldInfoBook({ boundName: 'Colony Lore', worldNames: [], openEditor }))
            .resolves.toBe('');
        await expect(openBoundWorldInfoBook({ boundName: undefined, worldNames: undefined, openEditor }))
            .resolves.toBe('');

        expect(opened).toEqual([]);
    });
});

describe('character authoring opens the currently bound World Info book', () => {
    test('the authoring command opens that book directly instead of the general panel', () => {
        const scriptSource = readRepoFile('public/script.js');
        const command = sliceCommand(scriptSource, 'openBoundWorldInfo');

        expect(command).toContain('boundName: payload?.draft?.characterWorld');
        expect(command).toContain('worldNames: world_names');
        expect(command).toContain('openEditor: openWorldInfoEditor');
        // No generic-drawer fallback and no world-binding popup: an absent or
        // dangling binding must not open something other than the bound book.
        expect(command).not.toContain('openWorkspaceShellWorldInfo');
        expect(command).not.toContain('openCharacterWorldPopup');
        expect(command).not.toContain('openWorldInfo()');
        expect(command).toContain('return false;');
    });

    test('the opened book is selected, not just revealed', () => {
        const worldInfoSource = readRepoFile('public/scripts/world-info.js');
        const opener = worldInfoSource.match(/export async function openWorldInfoEditor\(worldName\)[\s\S]*?\n\}/)?.[0] ?? '';

        expect(opener).toContain('await getWorldInfoShell().openWorldInfoPanel();');
        // The focused editor selection is what makes this "that book", not "the panel".
        expect(opener).toContain('await selectWorldInfoEditorName(worldName);');
        // Selection happens after the shell is open, and an unavailable book
        // returns without selecting anything else.
        expect(opener.indexOf('openWorldInfoPanel()')).toBeLessThan(opener.indexOf('selectWorldInfoEditorName(worldName)'));
        expect(opener).toContain('Lorebook \'${worldName}\' is not available in the world list.');
    });

    test('the mounted workbench repaints onto the opened book', () => {
        const scriptSource = readRepoFile('public/script.js');
        const command = sliceCommand(scriptSource, 'openBoundWorldInfo', 1600);

        // Selection lives in workbench session state, which the mounted React
        // host only reads on mount: without the remount the drawer opens on the
        // empty option while the session points at the bound book.
        expect(command).toContain('const openedBookName = await openBoundWorldInfoBook(');
        expect(command).toMatch(/if \(openedBookName\) \{[\s\S]*await mountReactWorldInfoPanel\(\);/);
        expect(command.indexOf('openBoundWorldInfoBook')).toBeLessThan(command.indexOf('mountReactWorldInfoPanel'));
    });

    test('the bound-world field owns the button and disables it without a valid binding', () => {
        const panels = readRepoFile('app/workspace-panels.tsx');
        const fieldStart = panels.indexOf('data-react-authoring-field="characterWorld"');
        expect(fieldStart).toBeGreaterThan(-1);
        const field = panels.slice(fieldStart, fieldStart + 3400);

        expect(field).toContain('data-react-authoring-action="openBoundWorldInfo"');
        expect(field).toContain('disabled={!boundWorldInfoBookName || isActionPending}');
        expect(field).toContain('commands?.openBoundWorldInfo?.(characterToolActionPayload)');
        expect(panels).toContain('resolveBoundWorldInfoBookName(stringDraft(\'characterWorld\'), worldNames)');
    });

    test('the command is declared on the authoring bridge contract', () => {
        const commands = readRepoFile('app/compat/workspace-commands.ts');
        expect(commands).toContain('openBoundWorldInfo?(payload?: Record<string, unknown>): CommandResult;');
    });

    test('the button label is translated', () => {
        const zh = JSON.parse(readRepoFile('public/locales/zh-cn.json'));
        expect(zh['Open bound World Info book']).toMatch(/[\u4e00-\u9fff]/);
        expect(zh['No bound world book to open']).toMatch(/[\u4e00-\u9fff]/);
    });
});
