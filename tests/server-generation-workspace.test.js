import { expect, jest, test } from '@jest/globals';
import { captureWorkspaceWorldRuntime, createWorkspaceGeneration, createWorkspaceGenerationPreparation, getWorkspaceGenerationTargetSnapshot } from '../public/scripts/server-generation-workspace.js';

test('temporary request target preserves system history and generation metadata', () => {
    const current = jest.fn();
    const target = getWorkspaceGenerationTargetSnapshot({ characterSelected: false, characterName: 'neutral', neutralName: 'neutral', preview: false,
        hasDraft: () => false, current, history: [{ is_system: true, mes: null }, { is_user: true, mes: 'hi', extra: { api: 'openai', type: 'note', files: ['a'], ignored: 1 } }] });
    expect(target).toEqual({ temporary: true, history: [
        { is_user: false, is_system: true, mes: '', extra: { api: undefined, type: undefined, files: undefined, media: undefined, tool_invocations: undefined } },
        { is_user: true, is_system: undefined, mes: 'hi', extra: { api: 'openai', type: 'note', files: ['a'], media: undefined, tool_invocations: undefined } },
    ] });
    expect(current).not.toHaveBeenCalled();
});

test.each(['regenerate', 'continue'])('preview %s ignores the composer and stages no attachments', async action => {
    const target = jest.fn(() => ({ version: 'v' }));
    const stageAttachments = jest.fn();
    const preview = jest.fn(async () => ({ connection: { model: 'm' }, messages: [], budget: { contextTokens: 100, responseTokens: 20, promptTokens: 30 } }));
    const preparation = createWorkspaceGenerationPreparation({ generation: {}, target, text: () => 'draft',
        snapshot: () => ({ contextKey: 'chat' }), hasAttachments: () => true, stageAttachments,
        activations: () => [], captureWorld: async () => ({ worldInfo: [], scanPrompts: [] }), ownsComposer: () => true,
        flushSettings: async () => {}, locale: () => 'en', preview });
    const result = await preparation.preview(3, action);
    expect(target).toHaveBeenCalledWith({ preview: false });
    expect(stageAttachments).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith({ version: 'v', action, text: undefined, locale: 'en', round: 3, worldInfo: [], scanPrompts: [] });
    expect(result).toMatchObject({ kind: 'prompt-preview', type: action, pendingMessage: null });
});

test('continue preparation is cancellable before creation', async () => {
    const world = Promise.withResolvers();
    const request = jest.fn();
    const generation = createWorkspaceGeneration({ request, subscribe() {}, changed() {}, finished() {} });
    const preparation = createWorkspaceGenerationPreparation({ generation, target: () => ({ version: 'v' }), snapshot: () => ({ contextKey: 'c' }),
        ownsComposer: () => true, requestId: () => 'r', clearViewport() {}, beginViewport() {}, scrollForPreparation() {},
        activations: () => [], captureWorld: () => world.promise, flushSettings: async () => {}, locale: () => 'en' });
    const starting = preparation.start('continue');
    expect(generation.canStop()).toBe(true);
    await generation.cancel();
    world.resolve({ worldInfo: [], scanPrompts: [] });
    expect(await starting).toBe(false);
    expect(request).not.toHaveBeenCalled();
});

test('send preparation preserves attachment, world, settings and creation order', async () => {
    const calls = [];
    const prepared = {};
    const generation = { busy: () => false, prepare: () => prepared, ownsPreparation: () => true,
        create: async (_target, command, view) => { calls.push('create'); expect(view).toBe(prepared); expect(command.attachments).toEqual({ files: ['a'] }); return {}; },
        releasePreparation: () => calls.push('release') };
    const preparation = createWorkspaceGenerationPreparation({ generation, target: () => ({ version: 'v' }), snapshot: () => ({ contextKey: 'c' }),
        ownsComposer: () => true, requestId: () => 'r', clearViewport() {}, beginViewport() {}, hasAttachments: () => true,
        activations: () => [['key', {}]], captureAttachments: async () => { calls.push('attachment'); return { attachments: { files: ['a'] }, clearFiles: () => calls.push('clear') }; },
        captureWorld: async () => { calls.push('world'); return { worldInfo: [], scanPrompts: [] }; },
        flushSettings: async () => calls.push('flush'), locale: () => 'en', consumeActivations: () => calls.push('consume') });
    expect(await preparation.start('send', 'hello')).toBe(true);
    expect(calls).toEqual(['attachment', 'world', 'flush', 'create', 'clear', 'consume', 'release']);
});

test('preview stops after a changed composer and does not issue a request', async () => {
    const preview = jest.fn();
    const preparation = createWorkspaceGenerationPreparation({ generation: {}, target: () => ({ temporary: true }), text: () => 'draft',
        snapshot: () => ({ contextKey: 'old' }), hasAttachments: () => false, activations: () => [],
        captureWorld: async () => ({ worldInfo: [], scanPrompts: [] }), ownsComposer: () => false, preview });
    expect(await preparation.preview()).toEqual({ kind: 'prompt-preview-empty', reason: 'Selected chat changed', warnings: [] });
    expect(preview).not.toHaveBeenCalled();
});

test('preview carries staged files and world snapshot into the request and maps its budget', async () => {
    const preview = jest.fn(async () => ({ connection: { model: 'm' }, messages: [{ role: 'user' }, { role: 'system' }],
        budget: { contextTokens: 100, responseTokens: 20, promptTokens: 30 }, tools: [{ name: 't' }], toolChoice: 'auto' }));
    const preparation = createWorkspaceGenerationPreparation({ generation: {}, target: () => ({ temporary: true }), text: () => 'draft',
        snapshot: () => ({ contextKey: 'chat' }), hasAttachments: () => true, stageAttachments: async () => ['file'],
        activations: () => [], captureWorld: async () => ({ worldInfo: [], scanPrompts: ['world'] }), ownsComposer: () => true,
        flushSettings: async () => {}, locale: () => 'en', preview, userName: () => 'User' });
    const result = await preparation.preview(2);
    expect(preview).toHaveBeenCalledWith({ temporary: true, action: 'send', text: 'draft', locale: 'en', round: 2,
        worldInfo: [], scanPrompts: ['world'], draftAttachments: ['file'] });
    expect(result).toMatchObject({ kind: 'prompt-preview', pendingMessage: { name: 'User', mes: 'draft' }, messagesInContext: 1,
        request: { model: 'm', max_tokens: 20, tool_choice: 'auto' }, budget: { remaining: 50, totalTokens: 50 } });
});

test('world runtime captures active entries and only non-empty scan prompts in order', async () => {
    const activations = [['id', { world: 'book', uid: 4, content: 'entry', ignored: true }]];
    const prompts = { first: { scan: true }, skipped: { scan: false }, empty: { scan: true }, last: { scan: true } };
    const seen = [];
    const result = await captureWorkspaceWorldRuntime(activations, prompts, async (key, snapshot) => {
        seen.push(key);
        expect(snapshot).not.toBe(prompts);
        return key === 'empty' ? '' : key;
    });
    expect(seen).toEqual(['first', 'empty', 'last']);
    expect(result.scanPrompts).toEqual(['first', 'last']);
    expect(result.worldInfo).toEqual([{ world: 'book', uid: 4, content: 'entry', position: undefined, depth: undefined, role: undefined, order: undefined, useProbability: undefined, probability: undefined }]);
});

test.each(['fast', 'slow', 'stop'])('a prepared send only shows waiting after the delay (%s)', async outcome => {
    jest.useFakeTimers();
    try {
        const run = { id: 'send', status: 'running', kind: 'send' };
        let deliver;
        const workspace = createWorkspaceGeneration({
            async request() { return run; },
            subscribe(_id, listener) { deliver = listener; return () => {}; },
            changed() {}, finished() {},
        });
        const target = { file_name: 'one' };
        const command = { action: 'send', text: 'question', requestId: 'request-one' };
        const view = workspace.prepare(target, command);
        expect(workspace.display().pendingText).toBe('question');
        expect(workspace.canStop()).toBe(true);
        expect(workspace.display().waiting).toBeFalsy();
        if (outcome === 'stop') {
            await workspace.cancel();
            expect(await workspace.create(target, command, view)).toBeUndefined();
        } else {
            await workspace.create(target, command, view);
            jest.advanceTimersByTime(249);
            expect(workspace.display().waiting).toBeFalsy();
            if (outcome === 'slow') {
                jest.advanceTimersByTime(1);
                expect(workspace.display().waiting).toBe(true);
            }
            deliver({ type: 'terminal', run: { ...run, status: 'completed' } });
        }
        jest.advanceTimersByTime(250);
        expect(workspace.display()).toBeNull();
        expect(jest.getTimerCount()).toBe(0);
    } finally {
        jest.useRealTimers();
    }
});

test.each(['regenerate', 'continue'])('stopping prepared %s releases the view before create', async action => {
    const requests = [];
    const workspace = createWorkspaceGeneration({
        request: route => requests.push(route), subscribe() {}, changed() {}, finished() {},
    });
    const view = workspace.prepare({ file_name: 'one' }, { action, requestId: 'request-one' });
    expect(workspace.canStop()).toBe(true);
    expect(workspace.display().kind).toBe(action);
    await workspace.cancel();
    expect(workspace.busy()).toBe(false);
    expect(workspace.display()).toBeNull();
    expect(await workspace.create(view.target, { action, requestId: 'request-one' }, view)).toBeUndefined();
    expect(requests).toEqual([]);
});

test.each([['regenerate', 'resolve'], ['regenerate', 'reject'], ['continue', 'resolve']])('releases streamed %s when reconciliation can %s', async (kind, settle) => {
    const reload = Promise.withResolvers();
    const run = { id: 'replacement', status: 'running', kind };
    let deliver;
    const workspace = createWorkspaceGeneration({
        async request() { return run; },
        subscribe(_id, listener) { deliver = listener; return () => {}; },
        changed() {}, finished: () => reload.promise,
    });
    await workspace.create({ file_name: 'one' }, { action: kind, requestId: 'request-one' });
    deliver({ type: 'delta', text: 'new reply' });
    deliver({ type: 'terminal', run: { ...run, status: 'completed' } });
    expect(workspace.canStop()).toBe(false);
    expect(workspace.busy()).toBe(true);
    expect(workspace.display().text).toBe('new reply');
    reload[settle](false);
    await new Promise(setImmediate);
    expect(workspace.display()).toBeNull();
    expect(workspace.busy()).toBe(false);
});

test('switching chats detaches without cancelling and resumes from the server snapshot', async () => {
    const listeners = [];
    const requests = [];
    const run = { id: 'run-one', status: 'running', kind: 'send' };
    const workspace = createWorkspaceGeneration({
        async request(route, body) { requests.push([route, body]); return body.file_name === 'one' ? run : null; },
        subscribe(id, listener) {
            const entry = { id, listener, closed: false };
            listeners.push(entry);
            return () => { entry.closed = true; };
        },
        changed() {}, finished() {},
    });
    await workspace.select({ avatar_url: 'a.png', file_name: 'one' });
    listeners[0].listener({ type: 'snapshot', run, text: 'hello' });
    listeners[0].listener({ type: 'delta', text: ' world' });
    expect(workspace.current().text).toBe('hello world');
    await workspace.select({ avatar_url: 'a.png', file_name: 'two' });
    listeners[0].listener({ type: 'delta', text: ' wrong' });
    expect(listeners[0].closed).toBe(true);
    expect(workspace.current()).toBeNull();
    await workspace.select({ avatar_url: 'a.png', file_name: 'one' });
    listeners[1].listener({ type: 'snapshot', run, text: 'hello world!' });
    expect(workspace.current().text).toBe('hello world!');
    expect(requests.map(([route]) => route)).toEqual(['/find', '/find', '/find']);
});

test('a reattached workspace retries the result without rerunning the browser step', async () => {
    const run = { id: 'pending-run', status: 'running' };
    const step = { id: 'pending-step', name: 'custom', args: { content: 'input' }, actionBody: 'return args.content;' };
    const listeners = [];
    const submitted = [];
    const feedback = [];
    let executions = 0;
    const workspace = createWorkspaceGeneration({
        async request(route, body) {
            if (route === '/find') return run;
            if (route === '/pending-run') return { ...run, step };
            submitted.push(body);
            if (submitted.length === 1) throw new Error('disconnected');
        },
        subscribe(_id, listener) { listeners.push(listener); return () => {}; },
        async executeStep() { executions++; return 'browser'; },
        changed() {}, finished() {}, stepFailed: error => feedback.push(error),
    });
    await workspace.select({ file_name: 'one' });
    listeners[0]({ type: 'step', step });
    await new Promise(setImmediate);
    workspace.close();
    await workspace.select({ file_name: 'one' });
    listeners[1]({ type: 'snapshot', run, text: '', step });
    await new Promise(setImmediate);
    expect(executions).toBe(1);
    expect(submitted).toEqual([{ stepId: step.id, result: 'browser' }, { stepId: step.id, result: 'browser' }]);
    expect(feedback).toEqual([]);
});

test.each(['creating', 'running'])('intentional exit cancels a %s temporary run by request ID and ignores late results', async state => {
    const creation = Promise.withResolvers();
    const run = { id: 'temporary-run', temporary: true, status: 'running' };
    const cancellations = [];
    const listeners = [];
    const finished = [];
    const workspace = createWorkspaceGeneration({
        async request(route, body, options) {
            if (route === '/create') return creation.promise;
            cancellations.push([route, body, options]);
        },
        subscribe(_id, listener) { listeners.push(listener); return () => {}; },
        changed() {}, finished: result => finished.push(result),
    });
    const creating = workspace.create({ temporary: true }, { requestId: 'temporary-request', text: 'question' });
    if (state === 'running') { creation.resolve(run); await creating; }
    workspace.close();
    creation.resolve(run);
    await creating;
    listeners[0]?.({ type: 'terminal', run: { ...run, status: 'completed' } });
    expect(cancellations).toEqual([['/cancel', { temporary: true, requestId: 'temporary-request' }, { keepalive: true }]]);
    expect(workspace.busy()).toBe(false);
    expect(listeners).toHaveLength(state === 'running' ? 1 : 0);
    expect(finished).toEqual([]);
});

test.each(['execution', 'submission'])('temporary browser step %s failure reports once and cancels', async stage => {
    const run = { id: 'temporary-run', temporary: true, status: 'running' };
    const step = { id: 'temporary-step' };
    const error = new Error('browser step failed');
    const requests = [];
    const feedback = [];
    let online = false;
    let listener;
    const workspace = createWorkspaceGeneration({
        async request(route) {
            requests.push(route);
            if (route === '/create') return run;
            if (route === '/temporary-run') {
                if (!online) throw new Error('disconnected before the step could be validated');
                return { ...run, step };
            }
            if (route.endsWith('/step')) throw error;
        },
        subscribe(_id, callback) { listener = callback; return () => {}; },
        changed() {}, finished() {}, stepFailed: value => feedback.push(value),
        async executeStep() {
            if (stage === 'execution') throw error;
            return 'result';
        },
    });
    await workspace.create({ temporary: true }, { requestId: 'temporary-request' });
    listener({ type: 'step', step });
    await new Promise(setImmediate);
    expect(feedback).toEqual([]);
    expect(requests).toEqual(['/create', '/temporary-run']);
    online = true;
    listener({ type: 'step', step });
    listener({ type: 'snapshot', run, step });
    await new Promise(setImmediate);
    expect(feedback).toEqual([error]);
    expect(requests.filter(route => route === '/temporary-run/cancel')).toHaveLength(1);
});


test('a permanently disconnected temporary stream releases the workspace', async () => {
    const run = { id: 'temporary', temporary: true, status: 'running' };
    let deliver;
    let detached = false;
    const terminal = [];
    const requests = [];
    const workspace = createWorkspaceGeneration({
        async request(route) { requests.push(route); return run; },
        subscribe(_id, listener) { deliver = listener; return () => { detached = true; }; },
        changed() {}, finished(result) { terminal.push(result); },
    });
    await workspace.create({ temporary: true }, { text: 'hello', requestId: 'temporary-request' });
    deliver({ type: 'disconnected' });
    expect(workspace.busy()).toBe(false);
    expect(detached).toBe(true);
    expect(terminal).toEqual([{ ...run, status: 'interrupted' }]);
    expect(requests).toEqual(['/create']);
    workspace.close();
    expect(requests).toEqual(['/create', '/cancel']);
});
