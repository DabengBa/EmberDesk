import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ throttle: fn => fn }));
jest.unstable_mockModule('../public/scripts/constants.js', () => ({ debounce_timeout: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: { on: jest.fn() }, event_types: {} }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ renameComposerDraftContext: jest.fn(), setComposerDraftContext: jest.fn(), requestComposerFocus: jest.fn() }));
jest.unstable_mockModule('../public/scripts/workspace-interaction-commands.js', () => ({ installWorkspaceInteractionCommands: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-ui-motion.js', () => ({ transitionOpacity: jest.fn() }));

const { registerDomHandlersShellContext } = await import('../public/scripts/dom-handlers-shell-context.js');
const { bindLegacyShellHandlers } = await import('../public/scripts/dom-handlers.js');

test('real hotswap delegated handler reads the selected avatar identity without wrapping it in jQuery', async () => {
    const original = { document: globalThis.document, $: globalThis.$, CSS: globalThis.CSS, Element: globalThis.Element };
    const stop = new Error('binding reached after selection delegates');
    const select = jest.fn(async () => {});
    registerDomHandlersShellContext(new Proxy({ state: {}, selectCharacterById: select }, {
        get: (target, key) => key in target ? target[key] : jest.fn(),
    }));
    const document = { getElementById: () => null, addEventListener: (_type, handler) => { if (handler.name === 'onCharacterSelect') handlers.set('.character_select', handler); } };
    const handlers = new Map();
    class Element { constructor(value) { this.value = value; } closest(selector) { return selector === '.character_select' ? this : null; } getAttribute() { return this.value; } }
    const chain = { on: (event, selector, handler) => { if (typeof selector === 'string') handlers.set(selector, handler); return chain; } };
    globalThis.document = document;
    globalThis.Element = Element;
    globalThis.CSS = { supports: () => { throw stop; } };
    globalThis.$ = value => {
        if (value && typeof value === 'object' && value !== document) throw new Error('hotswap identity must not use jQuery');
        return chain;
    };
    try {
        await expect(bindLegacyShellHandlers()).rejects.toBe(stop);
        const click = handlers.get('.character_select');
        expect(typeof click).toBe('function');
        await click({ target: new Element('7'), button: 0 });
        await click({ target: new Element(null), button: 0 });
        await click({ target: new Element('9'), button: 2 });
        expect(select).toHaveBeenCalledTimes(2);
        expect(select).toHaveBeenNthCalledWith(1, 7);
        expect(Number.isNaN(select.mock.calls[1][0])).toBe(true);
    } finally {
        globalThis.document = original.document; globalThis.$ = original.$; globalThis.CSS = original.CSS; globalThis.Element = original.Element;
    }
});
