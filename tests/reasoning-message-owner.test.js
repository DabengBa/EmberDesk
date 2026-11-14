import { describe, expect, jest, test } from '@jest/globals';

describe('reasoning message owner', () => {
    test('uses live message context for API, formatting and async save after chat switches', async () => {
        let chat = [{ mes: '<think> first </think> answer' }];
        let api = 'openai';
        let settledSaves = 0;
        let prefix = 'A';
        const events = new Map();
        const calls = [];
        const finishSaves = [];
        const save = jest.fn(() => {
            calls.push('save');
            return new Promise(resolve => { finishSaves.push(() => { settledSaves++; resolve(); }); });
        });
        const update = jest.fn(() => calls.push('update'));
        const context = {
            state: { get chat() { return chat; }, get main_api() { return api; } },
            substituteParams: value => value.replaceAll('{{name}}', prefix),
            saveChatDebounced: save,
            getChatMessageCommands: () => ({}),
        };
        const mock = (path, factory) => jest.unstable_mockModule(path, factory);
        const anchor = { getAttribute: () => '_blank', relList: { add: jest.fn() } };
        const fragment = { querySelectorAll: () => [anchor] };
        const sanitize = jest.fn(() => fragment);
        mock('../public/lib.js', () => ({ moment: {}, DOMPurify: { sanitize } }));
        mock('../public/script.js', () => ({ chat: [], main_api: '', messageFormatting: jest.fn(), saveChatDebounced: jest.fn(), substituteParams: x => x, updateMessageBlock: jest.fn() }));
        mock('../public/scripts/message-service.js', () => ({ messageFormatting: jest.fn(), updateMessageBlock: update }));

        mock('../public/scripts/events.js', () => ({ eventSource: { on: (name, handler) => events.set(name, handler) }, event_types: { MESSAGE_RECEIVED: 'received', MESSAGE_UPDATED: 'updated', GENERATION_STOPPED: 'stopped', GENERATION_ENDED: 'ended', CHAT_CHANGED: 'changed' } }));
        mock('../public/scripts/extensions/regex/engine.js', () => ({ getRegexedString: x => `regex:${x}`, regex_placement: { REASONING: 5 } }));
        const tag = (strings, ...values) => strings.reduce((s, part, i) => s + part + (values[i] ?? ''), '');
        mock('../public/scripts/i18n.js', () => ({ getCurrentLocale: jest.fn(), t: tag, translate: x => x }));
        mock('../public/scripts/macros/macro-system.js', () => ({ macros: { register: jest.fn() }, MacroCategory: {} }));
        mock('../public/scripts/openai.js', () => ({ chat_completion_sources: { OPENAI: 'openai' }, getChatCompletionModel: () => 'o1', oai_settings: { show_thoughts: true, chat_completion_source: 'openai' } }));
        mock('../public/scripts/utils.js', () => ({ escapeRegex: x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), setDatasetProperty: jest.fn(), trimSpaces: x => x.trim() }));
        const previousDocument = globalThis.document;
        const previousDollar = globalThis.$;
        const display = {
            replaceChildren: jest.fn(),
            set innerHTML(_value) { throw new Error('Reasoning must mount a sanitized DOM fragment'); },
        };
        const row = {
            getAttribute: () => '0',
            classList: { toggle: jest.fn() },
            querySelector: selector => ({ '.mes_reasoning_details': {}, '.mes_reasoning': display, '.mes_reasoning_header_title': {}, '.mes_edit_add_reasoning': {} })[selector],
        };
        globalThis.document = { querySelector: selector => selector.startsWith('#chat') ? row : {}, getElementById: () => ({ dataset: {} }) };
        globalThis.$ = () => ({ on: jest.fn() });
        try {
            const reasoning = await import('../public/scripts/reasoning.js');
            const { registerMessageShellContext, clearMessageShellContext } = await import('../public/scripts/message-shell-context.js');
            expect(reasoning.extractReasoningFromData({ choices: [{ message: { reasoning: 'explicit' } }] }, { mainApi: 'openai' })).toBe('explicit');
            registerMessageShellContext(context);
            reasoning.initReasoning();
            const response = { choices: [{ message: { reasoning: 'thought' } }], responseContent: { parts: [{ text: 'x', thoughtSignature: 'sig' }] } };
            expect(reasoning.extractReasoningFromData(response)).toBe('thought');
            expect(reasoning.extractReasoningSignatureFromData(response)).toBe('sig');
            expect(reasoning.isHiddenReasoningModel()).toBe(true);
            const template = { prefix: '{{name}}[', suffix: ']', separator: ' ' };
            expect(reasoning.formatReasoning('think', 'answer', template).formatted).toBe('A[think] answer');
            events.get('updated')(0);
            const first = chat[0];
            expect(first).toMatchObject({ mes: 'answer', extra: { reasoning: 'regex:first', reasoning_type: 'parsed' } });
            expect(calls).toEqual(['save', 'update']);
            expect(settledSaves).toBe(0);
            expect(update).toHaveBeenCalledWith(0, first);
            const handler = new reasoning.ReasoningHandler();
            handler.updateReasoning(0, '  live  ', { persist: true });
            expect(first.extra).toMatchObject({ reasoning: 'regex:live', reasoning_type: 'model' });
            chat = [{ mes: '<think> second </think> next' }];
            api = 'other';
            prefix = 'B';
            expect(reasoning.extractReasoningFromData(response)).toBe('');
            expect(reasoning.extractReasoningSignatureFromData(response)).toBeNull();
            expect(reasoning.isHiddenReasoningModel()).toBe(false);
            expect(reasoning.formatReasoning('think', 'answer', template).formatted).toBe('B[think] answer');
            events.get('updated')(0);
            expect(chat[0]).toMatchObject({ mes: 'next', extra: { reasoning: 'regex:second', reasoning_type: 'parsed' } });
            handler.updateReasoning(0, 'switched', { persist: true });
            expect(chat[0].extra.reasoning).toBe('regex:switched');
            const { messageFormatting } = await import('../public/scripts/message-service.js');
            const formatted = '<div data-message-style-scope="reasoning-0"><strong>switched</strong><style>.scoped { color: red; }</style></div>';
            messageFormatting.mockReturnValue(formatted);
            handler.updateDom(0);
            expect(messageFormatting).toHaveBeenCalledWith('regex:switched', '', false, false, 0, {}, true);
            expect(sanitize).toHaveBeenCalledWith(formatted, {
                RETURN_DOM_FRAGMENT: true,
                ADD_TAGS: ['style'],
                ADD_ATTR: ['target'],
            });
            expect(display.replaceChildren).toHaveBeenCalledWith(fragment);
            expect(anchor.relList.add).toHaveBeenCalledWith('noopener');
            expect(first.mes).toBe('answer');
            expect(save).toHaveBeenCalledTimes(2);
            finishSaves.forEach(resolve => resolve());
            await Promise.resolve();
            expect(settledSaves).toBe(2);
            clearMessageShellContext();
        } finally {
            globalThis.document = previousDocument;
            globalThis.$ = previousDollar;
        }
    });
});
