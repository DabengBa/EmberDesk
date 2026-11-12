import { describe, expect, jest, test } from '@jest/globals';
import { createChatMessageReasoningCommands } from '../public/scripts/chat-message-reasoning-commands.js';

function fixture() {
    let chat = [{ mes: 'body', extra: { reasoning: 'old', reasoning_type: 'model', reasoning_duration: 42 } }];
    let chatId = 'a';
    const ui = new Map();
    const deps = {
        getChat: () => chat,
        getChatId: () => chatId,
        getUiState: id => ui.get(String(id)),
        setUiState: (id, patch) => ui.set(String(id), { ...ui.get(String(id)), ...patch }),
        isBlocked: jest.fn(() => false),
        processReasoning: jest.fn(text => text.replace('{{name}}', 'Alice').replace('match', 'replaced')),
        save: jest.fn(async () => {}),
        emit: jest.fn(async () => {}),
        refresh: jest.fn(),
        copyText: jest.fn(async () => {}),
        notifyCopied: jest.fn(),
        confirmReasoningDelete: jest.fn(async () => true),
        commitMessageEdit: jest.fn(async () => true),
        cancelMessageEdit: jest.fn(async () => true),
    };
    return { deps, ui, commands: createChatMessageReasoningCommands(deps), get chat() { return chat; }, switchChat: next => { chatId = 'b'; chat = next; } };
}

describe('reasoning command state', () => {
    test('UI edit processes macros and regex, saves then emits before committing body', async () => {
        const f = fixture();
        f.deps.setUiState(0, { editing: true });


        expect(f.commands.startMessageReasoningEdit(0)).toBe(true);
        f.commands.updateMessageReasoningEdit(0, '{{name}} match');
        expect(await f.commands.commitMessageReasoningEdit(0)).toBe(true);
        expect(f.chat[0].extra).toEqual({ reasoning: 'Alice replaced', reasoning_type: 'edited', reasoning_duration: 42 });
        expect(f.deps.processReasoning).toHaveBeenCalledWith('{{name}} match');
        expect(f.deps.save.mock.invocationCallOrder[0]).toBeLessThan(f.deps.emit.mock.invocationCallOrder[0]);
        expect(f.deps.emit).toHaveBeenCalledWith('MESSAGE_REASONING_EDITED', 0);
        expect(f.deps.emit.mock.invocationCallOrder[0]).toBeLessThan(f.deps.commitMessageEdit.mock.invocationCallOrder[0]);
    });

    test('unchanged edit ends editing and refreshes without saving', async () => {
        const f = fixture();
        f.commands.startMessageReasoningEdit(0);
        f.deps.refresh.mockClear();
        expect(await f.commands.commitMessageReasoningEdit(0)).toBe(true);
        expect(f.ui.get('0').reasoningEditing).toBe(false);
        expect(f.deps.refresh).toHaveBeenCalled();
        expect(f.deps.save).not.toHaveBeenCalled();
    });

    test('slash-style set preserves literal macros and regex matches, marks manual and emits no edit event', async () => {
        const f = fixture();
        expect(await f.commands.setMessageReasoning(0, '{{name}} match', { applyRegex: false })).toBe(true);
        expect(f.chat[0].extra.reasoning).toBe('{{name}} match');
        expect(f.chat[0].extra.reasoning_type).toBe('manual');
        expect(f.deps.processReasoning).not.toHaveBeenCalled();
        expect(f.deps.emit).not.toHaveBeenCalled();
        expect(f.deps.save).toHaveBeenCalledTimes(1);
        expect(f.deps.refresh).toHaveBeenCalled();
    });

    test('explicit slash collapse state is retained even when reasoning is empty', async () => {
        const f = fixture();
        await f.commands.setMessageReasoning(0, '', { applyRegex: false });
        expect(f.commands.setMessageReasoningOpen(0, true)).toBe(true);
        expect(f.ui.get('0').reasoningOpen).toBe(true);
    });

    test('cancel preserves reasoning and delegates body cancel', async () => {
        const f = fixture();
        f.deps.setUiState(0, { editing: true });
        f.commands.startMessageReasoningEdit(0);
        f.commands.updateMessageReasoningEdit(0, 'draft');
        expect(await f.commands.cancelMessageReasoningEdit(0)).toBe(true);
        expect(f.chat[0].extra.reasoning).toBe('old');
        expect(f.deps.cancelMessageEdit).toHaveBeenCalledWith(0);
        expect(f.deps.save).not.toHaveBeenCalled();
    });

    test('delete preserves body, clears reasoning metadata and emits after save', async () => {
        const f = fixture();
        expect(await f.commands.deleteMessageReasoning(0)).toBe(true);
        expect(f.chat[0]).toEqual({ mes: 'body', extra: { reasoning: '' } });
        expect(f.deps.emit).toHaveBeenCalledWith('MESSAGE_REASONING_DELETED', 0);
        expect(f.deps.save.mock.invocationCallOrder[0]).toBeLessThan(f.deps.emit.mock.invocationCallOrder[0]);
    });

    test.each(['switch', 'move'])('confirmation cannot delete wrong message after %s', async mode => {
        const f = fixture();
        let resolve;
        f.deps.confirmReasoningDelete.mockReturnValue(new Promise(r => { resolve = r; }));
        const original = f.chat[0];
        const pending = f.commands.deleteMessageReasoning(0);
        if (mode === 'switch') f.switchChat([{ extra: { reasoning: 'other' } }]);
        else f.chat.unshift({ extra: { reasoning: 'other' } });
        resolve(true);
        expect(await pending).toBe(false);
        expect(original.extra.reasoning).toBe('old');
        expect(f.chat[0].extra.reasoning).toBe('other');
        expect(f.deps.save).not.toHaveBeenCalled();
    });

    test('rejected confirmation and save failure do not emit', async () => {
        const f = fixture();
        f.deps.confirmReasoningDelete.mockResolvedValue(false);
        expect(await f.commands.deleteMessageReasoning(0)).toBe(false);
        f.deps.save.mockRejectedValue(new Error('save failed'));
        f.commands.startMessageReasoningEdit(0);
        f.commands.updateMessageReasoningEdit(0, 'new');
        await expect(f.commands.commitMessageReasoningEdit(0)).rejects.toThrow('save failed');
        expect(f.deps.emit).not.toHaveBeenCalled();
        expect(f.deps.refresh).toHaveBeenCalled();
    });

    test('switching chats while saving does not emit or commit another message editor', async () => {
        const f = fixture();
        let resolve;
        f.deps.save.mockReturnValue(new Promise(r => { resolve = r; }));
        f.deps.setUiState(0, { editing: true });
        f.commands.startMessageReasoningEdit(0);
        f.commands.updateMessageReasoningEdit(0, 'new');
        const pending = f.commands.commitMessageReasoningEdit(0);
        f.switchChat([{ mes: 'other', extra: { reasoning: 'other' } }]);
        resolve();
        expect(await pending).toBe(false);
        expect(f.deps.emit).not.toHaveBeenCalled();
        expect(f.deps.commitMessageEdit).not.toHaveBeenCalled();
        expect(f.chat[0].extra.reasoning).toBe('other');
    });

    test('copy, disclosure toggle, collapse all and blocked edit', async () => {
        const f = fixture();
        expect(await f.commands.copyMessageReasoning(0)).toBe(true);
        expect(f.deps.copyText).toHaveBeenCalledWith('old');
        expect(f.deps.notifyCopied).toHaveBeenCalled();
        expect(f.commands.setMessageReasoningOpen(0, true)).toBe(true);
        expect(f.commands.setMessageReasoningOpen(0)).toBe(true);
        expect(f.ui.get('0').reasoningOpen).toBe(false);
        f.commands.setMessageReasoningOpen(0, true);
        expect(f.commands.collapseAllMessageReasoning()).toBe(true);
        expect(f.ui.get('0').reasoningOpen).toBe(false);
        f.deps.isBlocked.mockReturnValue(true);
        expect(f.commands.startMessageReasoningEdit(0)).toBe(false);
    });
});

describe('reasoning slash compatibility entry points', () => {
    test('set keeps literal text, closes the editor and applies collapse; range toggle uses state', async () => {
        const f = fixture();
        const registered = new Map();
        const closeEditor = jest.fn();
        const command = { fromProps: value => value };
        const tag = (strings, ...values) => strings.reduce((s, part, i) => s + part + (values[i] ?? ''), '');
        const mock = (path, factory) => jest.unstable_mockModule(path, factory);
        mock('../public/lib.js', () => ({ moment: {} }));
        mock('../public/script.js', () => ({ chat: f.chat, closeMessageEditor: closeEditor, main_api: '', messageFormatting: jest.fn(), saveChatDebounced: jest.fn(), substituteParams: x => x, updateMessageBlock: jest.fn() }));
        mock('../public/scripts/message-shell-context.js', () => ({ requireMessageShellContext: () => ({ getChatMessageCommands: () => f.commands }) }));
        mock('../public/scripts/events.js', () => ({ eventSource: { on: jest.fn() }, event_types: {} }));
        mock('../public/scripts/extensions/regex/engine.js', () => ({ getRegexedString: x => x, regex_placement: {} }));
        mock('../public/scripts/i18n.js', () => ({ getCurrentLocale: jest.fn(), t: tag, translate: x => x }));
        mock('../public/scripts/macros/macro-system.js', () => ({ macros: { register: jest.fn() }, MacroCategory: {} }));
        mock('../public/scripts/openai.js', () => ({ chat_completion_sources: {}, getChatCompletionModel: jest.fn(), oai_settings: {} }));
        mock('../public/scripts/slash-commands/SlashCommand.js', () => ({ SlashCommand: command }));
        mock('../public/scripts/slash-commands/SlashCommandArgument.js', () => ({ ARGUMENT_TYPE: {}, SlashCommandArgument: command, SlashCommandNamedArgument: command }));
        mock('../public/scripts/slash-commands/SlashCommandCommonEnumsProvider.js', () => ({ commonEnumProviders: { messages: () => () => [], boolean: () => () => [] }, enumIcons: {} }));
        mock('../public/scripts/slash-commands/SlashCommandEnumValue.js', () => ({ enumTypes: {}, SlashCommandEnumValue: class {} }));
        mock('../public/scripts/slash-commands/SlashCommandParser.js', () => ({ SlashCommandParser: { addCommandObject: value => registered.set(value.name, value.callback) } }));
        mock('../public/scripts/utils.js', () => ({ escapeRegex: x => x, isFalseBoolean: x => x === 'false', isTrueBoolean: x => x === 'true', setDatasetProperty: jest.fn(), stringToRange: value => ({ start: Number(value), end: Number(value) }), trimSpaces: x => x }));
        const previousDocument = globalThis.document;
        const previousDollar = globalThis.$;
        globalThis.document = {};
        const handlers = new Map();
        globalThis.$ = () => ({ on: (_event, selector, handler) => handlers.set(selector, handler) });
        try {
            const { initReasoning } = await import('../public/scripts/reasoning.js');
            initReasoning();
            expect(await registered.get('reasoning-set')({ at: 0, collapse: 'false' }, '{{name}} match')).toBe('{{name}} match');
            expect(f.chat[0].extra.reasoning_type).toBe('manual');
            expect(f.deps.processReasoning).not.toHaveBeenCalled();
            expect(closeEditor).toHaveBeenCalledWith('reasoning');
            expect(f.ui.get('0').reasoningOpen).toBe(true);
            expect(registered.get('reasoning-toggle')({}, '0')).toBe('');
            expect(f.ui.get('0').reasoningOpen).toBe(false);
            registered.get('reasoning-expand')({}, '0');
            expect(f.ui.get('0').reasoningOpen).toBe(true);
            registered.get('reasoning-collapse')({}, '0');
            expect(f.ui.get('0').reasoningOpen).toBe(false);
            const start = jest.spyOn(f.commands, 'startMessageReasoningEdit');

            const previousElement = globalThis.Element;
            globalThis.Element = class { closest() { return {}; } };
            globalThis.document.getElementById = () => ({ dataset: { reactMainChatOwner: 'react' } });
            try {
                handlers.get('.mes_reasoning_edit, .mes_edit_add_reasoning').call(new globalThis.Element(), { preventDefault: jest.fn(), stopPropagation: jest.fn() });
                expect(start).not.toHaveBeenCalled();
            } finally {
                globalThis.Element = previousElement;
            }
        } finally {
            globalThis.document = previousDocument;
            globalThis.$ = previousDollar;
        }
    });
});
