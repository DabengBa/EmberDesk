import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('legacy message collection and selector reach reasoning without jQuery', () => {
    const source = readFileSync(new URL('../public/scripts/reasoning.js', import.meta.url), 'utf8');
    const method = source.slice(source.indexOf('    initHandleMessage('), source.indexOf('\n    /**', source.indexOf('    initHandleMessage(')));
    const row = { getAttribute: () => '0' };
    const collection = { 0: row, jquery: '3.5.1' };
    const $ = () => { throw Error('reasoning input must not use jQuery'); };
    const document = { querySelector: jest.fn(() => row) };
    class HTMLElement {}
    const handler = new Function('requireMessageShellContext', 'HTMLElement', 'ReasoningState', '$', 'document', `return new class { #isHiddenReasoningModel = false; state = 'none'; updateDom = () => {}; ${method} };`)(
        () => ({ state: { chat: [{ extra: { reasoning: 'draft' } }] } }), HTMLElement, { Done: 'done', Hidden: 'hidden', None: 'none', Thinking: 'thinking' }, $, document,
    );
    handler.initHandleMessage(collection);
    expect(handler.messageDom).toBe(row);
    expect(handler.reasoning).toBe('draft');
    handler.initHandleMessage([row]);
    expect(handler.messageDom).toBe(row);
    handler.initHandleMessage('#chat .mes');
    expect(document.querySelector).toHaveBeenCalledWith('#chat .mes');
    expect(handler.messageDom).toBe(row);
});

test('reasoning actions are owned by React rows rather than delegated handlers', () => {
    const reasoning = readFileSync(new URL('../public/scripts/reasoning.js', import.meta.url), 'utf8');
    const row = readFileSync(new URL('../app/components/main-chat/MainChatMessageRow.tsx', import.meta.url), 'utf8');
    expect(reasoning).not.toContain('setReasoningEventHandlers');
    expect(row).toContain('startMessageReasoningEdit');
    expect(row).toContain('commitMessageReasoningEdit');
    expect(row).toContain('cancelMessageReasoningEdit');
    expect(row).toContain('deleteMessageReasoning');
    expect(row).toContain('copyMessageReasoning');
    expect(row).toContain('collapseAllMessageReasoning');
});
