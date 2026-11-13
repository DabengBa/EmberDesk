import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('select chat popup React surface', () => {
    test('history import is dispatched through React commands', () => {
        const component = readRepoFile('app/components/select-chat/SelectChatPopup.tsx');
        expect(component).toContain('onImportFile');
        expect(component).toContain('onClick={() => importInput.current?.click()}');
        expect(readRepoFile('public/scripts/dom-handlers.js')).toContain('importFiles: importHistoryFiles');
    });
    test('React history close invokes the explicit close command', () => {
        const component = readRepoFile('app/components/select-chat/SelectChatPopup.tsx');
        const script = readRepoFile('public/script.js');
        expect(component).toContain('onClick={onClose}');
        expect(script).toContain("runHistoryRowCommand('close')");
    });
    test('React history new chat invokes the explicit command', () => {
        expect(readRepoFile('app/components/select-chat/SelectChatPopup.tsx')).toContain('onClick={onNewChat}');
        expect(readRepoFile('public/script.js')).toContain("runHistoryRowCommand('newChat')");
    });
    const indexHtml = readRepoFile('public/index.html');
    const popup = readRepoFile('app/components/select-chat/SelectChatPopup.tsx');
    const script = readRepoFile('public/script.js');

    test('popup shells stay in index.html while inner markup is React-owned', () => {
        expect(indexHtml).toContain('id="shadow_select_chat_popup"');
        expect(indexHtml).toContain('id="select_chat_popup"');
        expect(indexHtml).not.toContain('id="select_chat_div"');
        expect(indexHtml).not.toContain('id="chat_import_button"');
    });

    test('React component preserves contract IDs', () => {
        const ids = [
            'select_chat_import', 'form_import_chat', 'chat_import_file',
            'chat_import_file_type', 'chat_import_avatar_url',
            'chat_import_character_name', 'selectChatPopupHeaderText',
            'ChatHistoryCharName', 'newChatFromManageScreenButton',
            'chat_import_button', 'select_chat_search', 'select_chat_cross',
            'select_chat_div',
        ];
        for (const id of ids) {
            expect(popup).toContain(`id="${id}"`);
        }
    });

    test('history rows dispatch React bridge actions directly when supplied', () => {
        const list = readRepoFile('app/components/select-chat/SelectChatList.tsx');
        for (const action of ['openChat', 'renameChat', 'exportChat', 'deleteChat']) {
            expect(list).toContain(`bridge.${action}?.`);
        }
    });

    test('the mounted history bridge invokes explicit row commands', () => {
        const handlers = readRepoFile('public/scripts/dom-handlers.js');
        expect(handlers).toContain('export function runHistoryRowCommand');
        for (const action of ['openChat', 'renameChat', 'exportChat', 'deleteChat']) {
            expect(script).toContain(`runHistoryRowCommand('${action}'`);
        }
    });

    test('history highlights are committed by the React list after rows render', () => {
        const list = readRepoFile('app/components/select-chat/SelectChatList.tsx');
        expect(list).toContain('useLayoutEffect');
        expect(list).toContain('bridge.highlightRow');
        expect(list).toContain('state.highlightNames');
        expect(script).not.toContain("$('#select_chat_div .select_chat_block_wrapper')");
    });

    test('mounted history rows subscribe to the typed history snapshot', () => {
        const list = readRepoFile('app/components/select-chat/SelectChatList.tsx');
        const mounts = readRepoFile('app/workspace-panels.tsx');
        expect(list).toContain('useSyncExternalStore(controller.subscribe, controller.getSnapshot)');
        expect(mounts).toContain('<LiveSelectChatList');
    });

    test('explicit command adapters preserve arguments and reject calls before binding', () => {
        const handlers = readRepoFile('public/scripts/dom-handlers.js');
        const start = handlers.indexOf('let historyRowCommands;');
        const end = handlers.indexOf('\nconst state = ', start);
        const adapter = runInNewContext(`(() => { const installWorkspaceInteractionCommands = () => {}; ${handlers.slice(start, end).replaceAll('export function', 'function')}
            return { runHistoryRowCommand, runOptionsMenuCommand, runDialoguePopupCommand,
                install(history, options, dialogue) { historyRowCommands = history; optionsMenuCommand = options; dialoguePopupCommands = dialogue; } };
        })()`);
        expect(() => adapter.runHistoryRowCommand('deleteChat', 'a')).toThrow('History command unavailable');
        const calls = [];
        adapter.install({ deleteChat: (...args) => calls.push(['delete', ...args]) },
            (...args) => calls.push(['options', ...args]), { confirmDialoguePopup: () => calls.push(['confirm']) });
        adapter.runHistoryRowCommand('deleteChat', 'a', { fromSlashCommand: true });
        adapter.runOptionsMenuCommand('option_delete_mes', { fromSlashCommand: true });
        adapter.runDialoguePopupCommand('confirmDialoguePopup');
        expect(calls).toEqual([['delete', 'a', { fromSlashCommand: true }], ['options', 'option_delete_mes', { fromSlashCommand: true }], ['confirm']]);
    });

    test('mount is wired before the ready-callback button bindings', () => {
        expect(script).toContain('async function mountSelectChatPopup()');
        expect(script).toContain('module.mountSelectChatPopup(host, controller,');
        const mountIdx = script.indexOf('measureStartupStage(\'mountSelectChatPopup\'');
        const legacyBindIdx = script.indexOf('await bindLegacyShellHandlers()');
        const domHandlersSource = readRepoFile('public/scripts/dom-handlers.js');
        expect(domHandlersSource).toContain('$(\'#select_chat_cross\').on(\'click\'');
        expect(mountIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(legacyBindIdx);
    });

    test('React list replicates the past_chat_template row contract', () => {
        const list = readRepoFile('app/components/select-chat/SelectChatList.tsx');
        for (const cls of [
            'select_chat_block_wrapper', 'select_chat_block', 'select_chat_block_filename',
            'select_chat_block_mes', 'chat_file_size', 'chat_messages_num',
            'chat_messages_date', 'select_chat_actions', 'renameChatButton',
            'exportRawChatButton', 'exportChatButton', 'PastChat_cross',
        ]) {
            expect(list).toContain(cls);
        }
        // Row + delete button both carry the file_name attribute contract.
        expect(list.match(/file_name/g)?.length).toBeGreaterThanOrEqual(2);
        expect(list).toContain('highlight: \'true\'');
        // Empty states: no chats vs no search matches + clear-search action.
        expect(list).toContain('No saved chats yet.');
        expect(list).toContain('No chats match your search.');
        expect(list).toContain('Clear search');
    });

    test('displayChats is data/sort only; React owns #select_chat_div rows', () => {
        const service = readRepoFile('public/scripts/chat-ops-service.js');
        const displayChatsBody = service.match(/export async function displayChats[\s\S]*?\n}/)?.[0] ?? '';
        expect(displayChatsBody).toContain('displayHistoryCompat');
        expect(displayChatsBody).not.toContain('$(\'#past_chat_template');
        expect(displayChatsBody).not.toContain('$(\'#select_chat_div\').append');
        // Stale responses must not overwrite newer searches.
        expect(readRepoFile('app/lib/history-panel-service.ts')).toContain('current !== generation');
        // The bridge is registered on the chat-ops shell context.
        expect(script).toContain('renderSelectChatListReact: (...args) => renderSelectChatListReact(...args)');
    });

    test('past_chat_template stays for the chat list; popup never empties the React list', () => {
        expect(indexHtml).toContain('id="past_chat_template"');
        const displayPastChatsBody = script.match(/export async function displayPastChats[\s\S]*?\n}/)?.[0] ?? '';
        expect(displayPastChatsBody).not.toContain('$(\'#select_chat_div\').empty()');
    });
});
