import { expect, jest, test } from '@jest/globals';
import { createWorkspaceGeneration } from '../public/scripts/server-generation-workspace.js';

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
