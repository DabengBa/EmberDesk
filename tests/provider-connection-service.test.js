import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { jest } from '@jest/globals';

let service;
beforeAll(async () => {
    const source = await readFile(new URL('../app/lib/provider-connection-service.ts', import.meta.url), 'utf8');
    service = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
});

const draft = { customUrl: '  http://localhost:8000/api  ', openaiModel: '  draft-model  ', hasSavedSecret: false };
const response = (data, ok = true) => ({ ok, json: async () => data });
const setup = data => {
    const fetch = jest.fn().mockResolvedValue(response(data));
    return { fetch, requestHeaders: async () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'token' }) };
};

test('connect uses trimmed draft URL, preserves path and returns models', async () => {
    const dependencies = setup({ data: [{ id: 'draft-model' }] });
    expect(await service.connectProvider(draft, dependencies)).toEqual({ status: 'online', models: [{ id: 'draft-model' }] });
    expect(JSON.parse(dependencies.fetch.mock.calls[0][1].body)).toEqual({ chat_completion_source: 'openai', custom_url: 'http://localhost:8000/api' });
});

test('calls the injected browser fetch without a foreign receiver', async () => {
    const dependencies = setup({});
    dependencies.fetch = function () {
        if (this !== undefined) throw new TypeError('Illegal invocation');
        return Promise.resolve(response({ data: [] }));
    };
    await expect(service.connectProvider(draft, dependencies)).resolves.toEqual({ status: 'online', models: [] });
});

test('default endpoint needs saved secret; invalid URLs are rejected without request', async () => {
    const dependencies = setup({ data: [] });
    await expect(service.connectProvider({ ...draft, customUrl: '', hasSavedSecret: false }, dependencies)).rejects.toThrow();
    await expect(service.connectProvider({ ...draft, customUrl: 'file:///secret' }, dependencies)).rejects.toThrow();
    await expect(service.connectProvider({ ...draft, customUrl: 'not a url' }, dependencies)).rejects.toThrow();
    expect(dependencies.fetch).not.toHaveBeenCalled();
    await service.connectProvider({ ...draft, customUrl: ' ', hasSavedSecret: true }, dependencies);
    expect(JSON.parse(dependencies.fetch.mock.calls[0][1].body)).toEqual({ chat_completion_source: 'openai' });
});

test('test uses draft model and accepts a structurally valid empty reply', async () => {
    const dependencies = setup({ choices: [{ message: { role: 'assistant', content: '' } }] });
    expect(await service.testProviderConnection(draft, dependencies)).toEqual({ status: 'online', models: null });
    expect(JSON.parse(dependencies.fetch.mock.calls[0][1].body)).toMatchObject({ custom_url: 'http://localhost:8000/api', model: 'draft-model', max_tokens: 1, stream: false });
    await expect(service.testProviderConnection({ ...draft, openaiModel: ' ' }, dependencies)).rejects.toThrow();
});

test.each([
    ['http failure', response({ data: [] }, false)],
    ['error payload', response({ error: { message: 'secret credential' } })],
])('connect rejects %s without leaking server details', async (_name, reply) => {
    const dependencies = setup({});
    dependencies.fetch.mockResolvedValue(reply);
    await expect(service.connectProvider(draft, dependencies)).rejects.not.toThrow('secret credential');
    await expect(service.connectProvider(draft, dependencies)).rejects.toThrow();
});

test.each([{}, { choices: [] }, { error: { message: 'secret credential' } }])('test rejects missing reply or error payload', async data => {
    await expect(service.testProviderConnection(draft, setup(data))).rejects.toThrow();
});

test.each([
    { choices: [{ text: '' }] },
    { text: '' },
    { content: [{ type: 'text', text: '' }] },
    { message: { content: [{ text: '' }] } },
    { message: { tool_plan: '' } },
    '',
])('accepts existing compatible reply shapes without demanding nonempty text', async data => {
    await expect(service.testProviderConnection(draft, setup(data))).resolves.toEqual({ status: 'online', models: null });
});

test('test rejects an HTTP failure and does not expose its details', async () => {
    const dependencies = setup({});
    dependencies.fetch.mockResolvedValue(response({ error: 'secret credential' }, false));
    await expect(service.testProviderConnection(draft, dependencies)).rejects.toThrow(/Test request failed/);
});

test('forwards an external abort to fetch', async () => {
    const controller = new AbortController();
    const dependencies = setup({});
    dependencies.signal = controller.signal;
    dependencies.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('private network details')));
    }));
    const pending = service.connectProvider(draft, dependencies);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow(/Connection failed/);
    expect(dependencies.fetch.mock.calls[0][1].signal.aborted).toBe(true);
});

test('test aborts at 15 seconds and reports a safe error', async () => {
    jest.useFakeTimers();
    try {
        const dependencies = setup({});
        dependencies.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('secret credential')));
        }));
        const pending = service.testProviderConnection(draft, dependencies);
        const assertion = expect(pending).rejects.toThrow(/timed out/i);
        await jest.advanceTimersByTimeAsync(15000);
        await assertion;
        expect(dependencies.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
        jest.useRealTimers();
    }
});
