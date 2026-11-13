import { loadTsModule } from './helpers/load-ts-module.mjs';
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

const { createAuxiliaryPanelController } = await loadTsModule('app/lib/auxiliary-panel-service.ts');
const { createPromptTokenRecount } = await loadTsModule('app/lib/prompt-panel-service.ts');

test('typed prompt domain normalizes presets and creates compatible prompt collections', async () => {
    const { createPromptManagerDomain } = await loadTsModule('app/lib/prompt-manager.ts');
    const defaults = { prompts: [
        { identifier: 'worldInfo', marker: true },
        { identifier: 'charDescription', marker: true },
        { identifier: 'chatHistory', marker: true },
    ] };
    const { Prompt, PromptCollection, PromptManager } = createPromptManagerDomain({
        defaults, defaultOrder: defaults.prompts.map(p => ({ identifier: p.identifier, enabled: true })),
        removeRetiredExamples(settings) {
            settings.prompts = settings.prompts.filter(p => p.identifier !== 'dialogueExamples');
            for (const bucket of settings.prompt_order) bucket.order = bucket.order.filter(p => p.identifier !== 'dialogueExamples');
        },
        subscribe() {}, eventTypes: {}, substitute: text => text.replace('{{x}}', 'expanded'), uuid: () => 'uuid',
        createTokenHandler: () => ({ resetCounts() {}, getCounts: () => ({}), getTotal: () => 0 }),
    });


    const manager = new PromptManager();
    manager.serviceSettings = {
        prompts: [{ identifier: 'worldInfoBefore', marker: true }, { identifier: 'dialogueExamples' }, { identifier: 'custom', content: '{{x}}', injection_trigger: ['pipeline:review'] }],
        prompt_order: [{ character_id: 100000, order: [{ identifier: 'worldInfoBefore', enabled: false }, { identifier: 'worldInfoAfter', enabled: true }, { identifier: 'dialogueExamples', enabled: true }, { identifier: 'custom', enabled: true }] }],
    };
    manager.activeCharacter = { id: 100000 };
    manager.sanitizeServiceSettings();
    expect(manager.serviceSettings.prompt_order[0].order).toEqual([{ identifier: 'worldInfo', enabled: true }, { identifier: 'custom', enabled: true }]);
    expect(manager.getPromptCollection('normal').has('custom')).toBe(false);
    const selected = manager.getPromptCollection('normal', ['pipeline:review']);
    expect(selected.get('custom')).toBeInstanceOf(Prompt);
    expect(selected.get('custom').content).toBe('expanded');
    expect(() => new PromptCollection({})).toThrow('Only Prompt instances can be added to PromptCollection');
    expect(() => new PromptCollection(new Prompt({ identifier: 'test' }))).not.toThrow();
});

test('typed manager initialization retains lifecycle persistence and token bookkeeping', async () => {
    const { createPromptManagerDomain } = await loadTsModule('app/lib/prompt-manager.ts');
    const listeners = new Map();
    const counts = {};
    const tokenHandler = { resetCounts: jest.fn(), getCounts: () => counts, getTotal: () => 7 };
    const { PromptManager } = createPromptManagerDomain({
        defaults: { prompts: [{ identifier: 'chatHistory' }] },
        defaultOrder: [{ identifier: 'chatHistory', enabled: true }],
        removeRetiredExamples() {},
        subscribe: (name, listener) => listeners.set(name, listener),
        eventTypes: { CHAT_LOADED: 'load', CHARACTER_EDITED: 'edit', CHARACTER_DELETED: 'delete', OAI_PRESET_CHANGED_AFTER: 'preset' },
        substitute: text => text, uuid: () => 'uuid', createTokenHandler: () => tokenHandler,
    });
    const manager = new PromptManager();
    expect(manager.serviceSettings).toBeNull();
    expect(manager.tokenHandler).toBeNull();
    manager.saveServiceSettings = jest.fn();
    const settings = { prompts: [], prompt_order: [] };
    manager.init({}, settings);
    expect([...listeners.keys()]).toEqual(['load', 'edit', 'delete', 'preset']);
    listeners.get('load')({ detail: { id: 1, character: {} } });
    listeners.get('edit')({ detail: { id: 1, character: {} } });
    listeners.get('delete')({ detail: { id: 1, character: {} } });
    expect(manager.saveServiceSettings).toHaveBeenCalledTimes(3);
    listeners.get('preset')();
    expect(manager.saveServiceSettings).toHaveBeenCalledTimes(3);
    manager.setChatCompletion({ getMessages: () => ({ getCollection: () => [{ identifier: 'chatHistory', getTokens: () => 7 }] }) });
    expect(tokenHandler.resetCounts).toHaveBeenCalledTimes(1);
    expect(counts).toEqual({ chatHistory: 7 });
});
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test.each(['memory', 'wire'])('runtime %s close cannot unmount a reopened overlay', async panel => {
    const script = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = script.indexOf('\nfunction closePromptInspectorOverlay()');
    const end = script.indexOf('\n/**\n * Renders the React-owned chat rows', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const pendingClose = deferred();
    let loads = 0;
    let active;
    class Element {
        constructor() { this.isConnected = true; }
        remove() { this.isConnected = false; }
        focus() { document.activeElement = this; }
        closest() { return null; }
        getClientRects() { return [1]; }
    }
    const module = {
        createAuxiliaryPanelController,
        mountChatMemoryPanel: host => { active = host; },
        unmountChatMemoryPanel: () => { active = null; },
        mountWireLogPanel: host => { active = host; },
        unmountWireLogPanel: () => { active = null; },
    };
    const document = { activeElement: new Element(), createElement: () => new Element(), body: { appendChild() {} }, getElementById: () => null };
    const load = () => ++loads === 2 ? pendingClose.promise : Promise.resolve(module);
    const runtime = new Function('document', 'HTMLElement', 'loadWorkspacePanelsModule', 'getContext', 'toastr', 'getCurrentChatId', 'feature_settings', 'workspace',
        `${script.slice(start, end)}\nif (typeof initializeAuxiliaryPanelControllers === 'function') initializeAuxiliaryPanelControllers(workspace);\nreturn { openChatMemoryPanel, closeChatMemoryPanel, openWireLogPanel, closeWireLogPanel };`)(
        document, Element, load, () => ({ chatMemory: { getView: () => ({}) } }), { info() {}, warning() {}, error() {} }, () => null, {}, module);
    const open = panel === 'memory' ? runtime.openChatMemoryPanel : runtime.openWireLogPanel;
    const close = panel === 'memory' ? runtime.closeChatMemoryPanel : runtime.closeWireLogPanel;
    await open();
    const first = active;
    close();
    await open();
    const reopened = active;
    expect(reopened).not.toBe(first);
    pendingClose.resolve(module);
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(reopened);
});

test.each(['memory', 'wire'])('runtime %s returns focus to the menu trigger rather than a disappearing menu item', async panel => {
    const script = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = script.indexOf('\nfunction closePromptInspectorOverlay()');
    const end = script.indexOf('\n/**\n * Renders the React-owned chat rows', start);
    class Element {
        constructor(inMenu = false) { this.inMenu = inMenu; this.isConnected = true; }
        closest(selector) { return this.inMenu && selector === '#options' ? this : null; }
        focus() { document.activeElement = this; }
        getClientRects() { return [1]; }
        remove() { this.isConnected = false; }
    }
    const trigger = new Element();
    const item = new Element(true);
    const document = { activeElement: item, createElement: () => new Element(), body: { appendChild() {} }, getElementById: id => id === 'options_button' ? trigger : null };
    const workspace = { createAuxiliaryPanelController, mountChatMemoryPanel() {}, unmountChatMemoryPanel() {}, mountWireLogPanel() {}, unmountWireLogPanel() {} };
    const runtime = new Function('document', 'HTMLElement', 'getContext', 'toastr', 'getCurrentChatId', 'feature_settings', 'workspace',
        `${script.slice(start, end)}\ninitializeAuxiliaryPanelControllers(workspace);\nreturn { openChatMemoryPanel, closeChatMemoryPanel, openWireLogPanel, closeWireLogPanel };`)(
        document, Element, () => ({ chatMemory: { getView: () => ({}) } }), { info() {}, warning() {}, error() {} }, () => null, {}, workspace);
    await (panel === 'memory' ? runtime.openChatMemoryPanel() : runtime.openWireLogPanel());
    (panel === 'memory' ? runtime.closeChatMemoryPanel : runtime.closeWireLogPanel)();
    expect(document.activeElement).toBe(trigger);
});

function fixture(load) {
    let active = null;
    const restored = [];
    let focus = 'original';
    const errors = [];
    const controller = createAuxiliaryPanelController({
        load,
        createHost: () => ({ connected: true }),
        isConnected: host => host.connected,
        mount: (_module, host) => { active = host; },
        unmount: () => { active = null; },
        remove: host => { host.connected = false; },
        captureFocus: () => focus,
        restoreFocus: target => { restored.push(target); },
        onError: error => errors.push(error),
    });
    return { controller, getActive: () => active, restored, setFocus: value => { focus = value; }, errors };
}

test('closing an inspector cannot unmount a later reopening', async () => {
    const f = fixture(() => Promise.resolve({}));
    await f.controller.open();
    const first = f.getActive();
    f.controller.close();
    await f.controller.open();
    const reopened = f.getActive();
    expect(reopened).not.toBe(first);
    await Promise.resolve();
    expect(f.getActive()).toBe(reopened);
});

test('a close while loading invalidates the pending open', async () => {
    const pending = deferred();
    const f = fixture(() => pending.promise);
    const opening = f.controller.open();
    f.controller.close();
    pending.resolve({});
    await opening;
    expect(f.getActive()).toBeNull();
    expect(f.restored).toEqual([]);
});

test('closing a mounted panel restores its captured focus and reports mount errors', async () => {
    const f = fixture(() => Promise.resolve({}));
    await f.controller.open();
    f.setFocus('inside panel');
    f.controller.close();
    expect(f.restored).toEqual(['original']);
    const failure = new Error('load failed');
    const broken = fixture(() => Promise.reject(failure));
    await broken.controller.open();
    expect(broken.errors).toEqual([failure]);
    expect(broken.getActive()).toBeNull();
});

test('preset change invalidates an already-running recount immediately', async () => {
    jest.useFakeTimers();
    const count = deferred();
    let identity = 'A';
    const changed = jest.fn();
    const recount = createPromptTokenRecount({
        identity: () => identity,
        snapshot: () => ({ identity, prompts: [{ identifier: 'same', content: identity }], order: [{ identifier: 'same' }], lastRunCounts: {} }),
        count: () => count.promise,
        changed,
    });
    recount.schedule();
    jest.advanceTimersByTime(400);
    identity = 'B';
    recount.schedule();
    count.resolve(9);
    await count.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(recount.getCounts().same).not.toBe(9);
    expect(changed).not.toHaveBeenCalled();
    recount.dispose();
    jest.useRealTimers();
});

test('token recount debounces, preserves marker counts and tolerates failures', async () => {
    jest.useFakeTimers();
    const count = jest.fn().mockRejectedValue(new Error('offline'));
    const changed = jest.fn();
    const recount = createPromptTokenRecount({
        identity: () => 'A',
        snapshot: () => ({ identity: 'A', order: ['marker', 'empty', 'ordinary', 'missing'].map(identifier => ({ identifier })), prompts: [{ identifier: 'marker', marker: true }, { identifier: 'empty', marker: true }, { identifier: 'ordinary', content: 'hello' }], lastRunCounts: { marker: 12, empty: 0 } }),
        count, changed,
    });
    recount.schedule();
    jest.advanceTimersByTime(399);
    expect(count).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(count).toHaveBeenCalledWith({ role: 'system', content: 'hello' });
    expect(recount.getCounts()).toEqual({ marker: 12, empty: null, ordinary: null, missing: null });
    expect(changed).toHaveBeenCalledTimes(1);
    recount.schedule();
    await jest.advanceTimersByTimeAsync(400);
    expect(changed).toHaveBeenCalledTimes(1);
    recount.dispose();
    jest.useRealTimers();
});

test('identity change or disposal rejects pending recount results', async () => {
    jest.useFakeTimers();
    let identity = 'A';
    let pending = deferred();
    const changed = jest.fn();
    const recount = createPromptTokenRecount({
        identity: () => identity,
        snapshot: () => ({ identity, order: [{ identifier: 'one' }], prompts: [{ identifier: 'one' }], lastRunCounts: {} }),
        count: () => pending.promise,
        changed,
    });
    recount.schedule();
    jest.advanceTimersByTime(400);
    identity = 'B';
    pending.resolve(1);
    await jest.advanceTimersByTimeAsync(0);
    expect(recount.getCounts()).toEqual({});
    pending = deferred();
    recount.schedule();
    jest.advanceTimersByTime(400);
    recount.dispose();
    pending.resolve(2);
    await jest.advanceTimersByTimeAsync(0);
    expect(recount.getCounts()).toEqual({});
    expect(changed).not.toHaveBeenCalled();
    jest.useRealTimers();
});

test('prompt panel service guards stale edits and keeps pipeline final and tool sync', async () => {
    const { createPromptPanelService } = await loadTsModule('app/lib/prompt-panel-service.ts');
    const settings = { preset_settings_openai: 'A', prompts: [{ identifier: 'one', name: 'A', content: 'old' }], reply_pipeline: { enabled: false, steps: [] } };
    const order = [{ identifier: 'one', enabled: true }];
    const save = jest.fn();
    const syncTools = jest.fn();
    const service = createPromptPanelService({
        settings: () => settings, order: () => order, ensureOrder: () => order,
        save, syncTools, uuid: () => 'new-uuid', dirty: () => false,
        normalizePipeline: pipeline => pipeline, triggerTag: name => `pipeline:${name}`,
        toolNames: () => ['review'], modelNames: () => [], count: async () => 1,
        lastRunCounts: () => ({}), bindEvents: () => {}, openInspector: () => {},
    });
    const old = service.getState();
    expect(service.getState()).toBe(old);
    service.updatePrompt('one', { name: 'edited', injection_trigger: ['retired', 'pipeline:review'] }, { presetName: 'A' });
    expect(settings.prompts[0]).toMatchObject({ name: 'edited', injection_trigger: ['pipeline:review'] });
    expect(service.getState().order).toBe(old.order);
    settings.preset_settings_openai = 'B';
    service.updatePrompt('one', { content: 'stale' }, { presetName: 'A' });
    expect(settings.prompts[0].content).toBe('old');
    service.addPipelineStep();
    service.updatePipelineStep(0, { tool: 'review', model: 'model', prompt: 'hello' });
    expect(settings.reply_pipeline).toMatchObject({ enabled: true, final: 'review', steps: [{ tool: 'review', model: 'model', prompt: 'hello' }] });
    service.commitPipelineStepTool(0, 'other', { presetName: 'A', id: 'step-new-uuid', tool: 'review' });
    expect(syncTools).not.toHaveBeenCalled();
    service.commitPipelineStepTool(0, ' review ', { presetName: 'B', id: 'step-new-uuid', tool: 'review' });
    expect(syncTools).toHaveBeenCalledWith(['review'], { activate: true });
    service.deletePipelineStep(0);
    expect(settings.reply_pipeline.final).toBe('');
    expect(save).toHaveBeenCalledTimes(5);
});

test('prompt service edits the live order once and preserves advanced pipeline fields', async () => {
    jest.useFakeTimers();
    const { createPromptPanelService } = await loadTsModule('app/lib/prompt-panel-service.ts');
    const settings = { preset_settings_openai: 'A', prompts: [{ identifier: 'marker', marker: true }], reply_pipeline: { enabled: true, steps: [{ id: 'x', tool: 'first', max_tokens: 17 }, { id: 'y', tool: 'last' }] } };
    const order = [{ identifier: 'marker', enabled: true }];
    const save = jest.fn();
    let changed;
    const listener = jest.fn();
    const service = createPromptPanelService({
        settings: () => settings, order: () => order, ensureOrder: () => order, save,
        syncTools: jest.fn(), uuid: () => 'unique', dirty: () => false,
        normalizePipeline: pipeline => pipeline, triggerTag: name => `pipeline:${name}`,
        toolNames: () => [], modelNames: () => [], count: async () => 0,
        lastRunCounts: () => ({}), bindEvents: callback => { changed = callback; }, openInspector: () => {},
    });
    const unsubscribe = service.subscribe(listener);
    expect(service.addPrompt()).toBe('unique');
    expect(order).toEqual([{ identifier: 'marker', enabled: true }, { identifier: 'unique', enabled: true }]);
    service.movePrompt('unique', 0);
    service.setPromptEnabled('unique', false);
    service.updatePipelineStep(0, { model: 'm' });
    service.movePipelineStep(0, 1);
    expect(settings.reply_pipeline.steps[1]).toMatchObject({ id: 'x', model: 'm', max_tokens: 17 });
    expect(settings.reply_pipeline.final).toBe('first');
    service.deletePrompt('marker');
    expect(settings.prompts).toHaveLength(2);
    service.deletePrompt('unique');
    expect(order).toEqual([{ identifier: 'marker', enabled: true }]);
    expect(save).toHaveBeenCalledTimes(6);
    expect(listener).toHaveBeenCalledTimes(6);
    unsubscribe();
    changed();
    expect(listener).toHaveBeenCalledTimes(6);
    jest.clearAllTimers();
    jest.useRealTimers();
});
