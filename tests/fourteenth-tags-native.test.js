import { expect, jest, test } from '@jest/globals';

const save = jest.fn();
const show = jest.fn();
jest.unstable_mockModule('../public/script.js', () => ({ main_api: 'openai', saveSettingsDebounced: save }));
jest.unstable_mockModule('../public/scripts/templates.js', () => ({ renderTemplateAsync: async () => '<button id="resetSelectedSamplers"></button>' }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ Popup: class { constructor(...args) { show(...args); } show() { return Promise.resolve(); } }, POPUP_TYPE: { TEXT: 'text' } }));

const { initCustomSelectedSamplers, validateDisabledSamplers } = await import('../public/scripts/samplerSelect.js');

test('sampler popup binds once, shows native content and resets without jQuery', async () => {
    const old = { document: globalThis.document, $: globalThis.$ };
    class Node extends EventTarget {
        constructor() { super(); this.style = {}; this.children = []; this.className = ''; this.innerHTML = ''; }
        append(node) { this.children.push(node); }
        querySelectorAll() { return []; }
    }
    const button = new Node(), reset = new Node(), priority = new Node();
    const nodes = { samplerSelectButton: button, resetSelectedSamplers: reset, prioritizeManuallySelectedSamplers: priority };
    globalThis.document = { createElement: () => new Node(), getElementById: id => nodes[id] ?? null };
    globalThis.$ = () => { throw new Error('sampler must not use jQuery'); };
    try {
        await initCustomSelectedSamplers();
        await initCustomSelectedSamplers();
        button.dispatchEvent(new Event('click'));
        await new Promise(resolve => setImmediate(resolve));
        expect(show).toHaveBeenCalledTimes(1);
        expect(show.mock.calls[0][0].id).toBe('sampler_view_list');
        expect(show.mock.calls[0][0].children[0].id).toBe('apiSamplersList');
        expect(priority.style.display).toBe('none');
        save.mockClear();
        reset.dispatchEvent(new Event('click'));
        await new Promise(resolve => setImmediate(resolve));
        expect(save).toHaveBeenCalledTimes(1);
        await validateDisabledSamplers();
        expect(save).toHaveBeenCalledTimes(2);
    } finally { globalThis.document = old.document; globalThis.$ = old.$; }
});
