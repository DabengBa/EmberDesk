import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('options menu + character context menu React surfaces', () => {
    const indexHtml = readRepoFile('public/index.html');
    const options = readRepoFile('app/components/options-menu/OptionsMenu.tsx');
    const ctxMenu = readRepoFile('app/components/context-menu/CharacterContextMenu.tsx');
    const script = readRepoFile('public/script.js');

    test('options shell stays legacy-owned; items are React-owned', () => {
        const block = indexHtml.match(/<div id="options"[^>]*>([\s\S]*?)<\/div>/)?.[0] ?? '';
        expect(block).toContain('id="options"');
        expect(block).toContain('style="display: none;"');
        expect(block).not.toContain('options-content');
    });

    test('options component preserves item IDs', () => {
        const ids = [
            'option_back_to_main',
            'option_start_new_chat', 'option_close_chat', 'option_select_chat', 'option_regenerate', 'option_delete_mes',
        ];
        for (const id of ids) {
            expect(options).toContain(`id="${id}"`);
        }
    });

    test('current-chat memory is a Wire Log peer with lazy panel lifecycle and chat-change cleanup', () => {
        const domHandlers = readRepoFile('public/scripts/dom-handlers.js');
        const panels = readRepoFile('app/workspace-panels.tsx');
        expect(options).toContain('id="option_chat_memory"');
        expect(options.indexOf('id="option_chat_memory"')).toBeLessThan(options.indexOf('id="option_wire_log"'));
        expect(domHandlers).toContain("id == 'option_chat_memory'");
        expect(domHandlers).toContain('await openChatMemoryPanel()');
        expect(script).toContain('openChatMemoryPanel: (...args) => openChatMemoryPanel(...args)');
        expect(script).toContain('eventSource.on(event_types.CHAT_CHANGED, closeChatMemoryPanel)');
        expect(script).toContain('if (openId !== chatMemoryPanelOpenId) return');
        expect(script).toContain('module.mountChatMemoryPanel(chatMemoryPanelHost, {');
        expect(script).toContain('onDraftDiscarded: () => toastr.warning(');
        expect(script).toContain('module.unmountChatMemoryPanel(host)');
        expect(panels).toContain('export function mountChatMemoryPanel');
        expect(panels).toContain('export function unmountChatMemoryPanel');
    });

    test('regenerate availability is a React state projection with a shell sync point', () => {
        const domHandlers = readRepoFile('public/scripts/dom-handlers.js');
        expect(options).toContain('canRegenerate');
        expect(script).toContain('export function setOptionsMenuRegenerateAvailability');
        expect(script).toContain('export function canRegenerateLastReply');
        expect(script).toContain('export async function regenerateLastReply');
        // The delegated click path re-checks eligibility before dispatching —
        // a stale menu state can never trigger a second generation.
        expect(domHandlers).toContain('option_regenerate');
        expect(domHandlers).toContain('canRegenerateLastReply()');
        // Availability is synced every time the menu opens.
        expect(domHandlers).toContain('setOptionsMenuRegenerateAvailability(canRegenerateLastReply())');
    });

    test('character context menu items are React-owned with shell preserved', () => {
        expect(indexHtml).toContain('id="character_context_menu"');
        expect(indexHtml).not.toContain('id="character_context_menu_favorite"');
        const ids = [
            'character_context_menu_favorite', 'character_context_menu_tag',
            'character_context_menu_duplicate',
            'character_context_menu_delete',
        ];
        for (const id of ids) {
            expect(ctxMenu).toContain(`id="${id}"`);
        }
    });

    test('branch-chat visibility is a React state projection, not jQuery writes', () => {
        const chatBranch = readRepoFile('public/scripts/chat-branch.js');
        expect(chatBranch).toContain('setOptionsMenuBranchVisibility');
        expect(script).toContain('export function setOptionsMenuBranchVisibility');
        expect(script).toContain('updateOptionsMenuState');
        // Menu keeps the item mounted and toggles via React-driven style.
        expect(options).toContain('showBackToMain');
        expect(options).toContain('display: \'none\'');
    });

    test('destructive action is marked and Escape closes the menu', () => {
        expect(options).toContain('options-menu-danger');
        const domHandlers = readRepoFile('public/scripts/dom-handlers.js');
        expect(domHandlers).toContain('e.key === \'Escape\' && isOptionsMenuVisible');
    });

    test('both mounts run before registerCoreModules', () => {
        const coreIdx = script.indexOf('measureStartupStage(\'registerCoreModules\'');
        const optIdx = script.indexOf('measureStartupStage(\'mountOptionsMenu\'');
        const ctxIdx = script.indexOf('measureStartupStage(\'mountCharacterContextMenu\'');
        expect(optIdx).toBeGreaterThan(-1);
        expect(ctxIdx).toBeGreaterThan(-1);
        expect(optIdx).toBeLessThan(coreIdx);
        expect(ctxIdx).toBeLessThan(coreIdx);
    });
});
