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

test('reasoning delegates legacy row actions without jQuery and leaves React-owned rows to React', async () => {
    const source = readFileSync(new URL('../public/scripts/reasoning.js', import.meta.url), 'utf8');
    const helper = source.slice(source.indexOf('function getMessageFromElement('), source.indexOf('\n/**', source.indexOf('function getMessageFromElement(')));
    const handlers = source.slice(source.indexOf('function isReactMainChatMessageRow('), source.indexOf('\n/**', source.indexOf('function isReactMainChatMessageRow(')));
    const listeners = {};
    let react = false;
    const document = { addEventListener: (name, fn) => (listeners[name] ??= []).push(fn), getElementById: () => ({ dataset: { reactMainChatOwner: react ? 'react' : '' } }) };
    const commands = { setMessageReasoningOpen: jest.fn(() => true), startMessageReasoningEdit: jest.fn(), updateMessageReasoningEdit: jest.fn(), commitMessageReasoningEdit: jest.fn(), cancelMessageReasoningEdit: jest.fn(), deleteMessageReasoning: jest.fn(), collapseAllMessageReasoning: jest.fn(), copyMessageReasoning: jest.fn() };
    class Element {
        constructor(selectors, parent = null) { this.selectors = selectors; this.parentElement = parent; this.nodeType = 1; }
        matches(selector) { return selector.split(', ').some(part => this.selectors.includes(part)); }
        closest(selector) { return this.selectors.includes(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    }
    const row = new Element(['.mes']);
    row.getAttribute = () => '2';
    row.querySelector = selector => selector === '.mes_reasoning_details' ? { open: false } : selector === '#curEditTextarea' ? {} : selector === '.reasoning_edit_textarea' ? { value: 'draft' } : null;
    const fire = (type, selector) => {
        const button = new Element([selector, '[data-main-chat-message-row-owner="react"]'], row);
        const child = new Element([], button);
        const event = { target: child, preventDefault: jest.fn(), stopPropagation: jest.fn(function () { this.cancelBubble = true; }), cancelBubble: false };
        for (const handler of listeners[type] ?? []) handler(event);
        return event;
    };
    const init = new Function('document', 'Element', 'requireMessageShellContext', 'getChatMessageCommands', '$', `${helper}\n${handlers}\nreturn setReasoningEventHandlers;`)(document, Element, () => ({ state: { chat: [] } }), () => commands, () => { throw Error('reasoning must not use jQuery'); });
    init();
    fire('click', '.mes_reasoning_header');
    expect(commands.setMessageReasoningOpen).toHaveBeenCalledWith(2, true);
    expect(commands.startMessageReasoningEdit).toHaveBeenCalledWith(2);
    fire('click', '.mes_reasoning_edit_done');
    expect(commands.updateMessageReasoningEdit).toHaveBeenCalledWith(2, 'draft');
    expect(commands.commitMessageReasoningEdit).toHaveBeenCalledWith(2);
    fire('click', '.mes_reasoning_edit_cancel');
    fire('click', '.mes_reasoning_delete');
    fire('click', '.mes_reasoning_close_all');
    fire('click', '.mes_reasoning_edit');
    expect(commands.cancelMessageReasoningEdit).toHaveBeenCalledWith(2);
    expect(commands.deleteMessageReasoning).toHaveBeenCalledWith(2);
    expect(commands.collapseAllMessageReasoning).toHaveBeenCalledTimes(1);
    expect(commands.startMessageReasoningEdit).toHaveBeenCalledTimes(2);
    expect(fire('click', '.mes_reasoning_copy').stopPropagation).toHaveBeenCalled();
    fire('pointerup', '.mes_reasoning_copy');
    expect(commands.copyMessageReasoning).toHaveBeenCalledWith(2);
    react = true;
    fire('click', '.mes_reasoning_header');
    fire('pointerup', '.mes_reasoning_copy');
    await Promise.resolve();
    expect(commands.setMessageReasoningOpen).toHaveBeenCalledTimes(1);
    expect(commands.copyMessageReasoning).toHaveBeenCalledTimes(1);
});
