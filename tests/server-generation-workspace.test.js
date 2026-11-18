import { expect, test } from '@jest/globals';
import { createWorkspaceGeneration } from '../public/scripts/server-generation-workspace.js';

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
        changed() {}, finished() {},
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
});
