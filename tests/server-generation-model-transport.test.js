import http from 'node:http';
import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { ProxyAgent } from 'proxy-agent';
import { PrivateRequestAgent } from '../src/private-request-filter.ts';
import { streamServerModel } from '../src/server-generation-model-transport.ts';

let server;
let baseUrl;
const received = [];
const toolCall = { id: 'call_1', type: 'function', function: { name: 'submit_story', arguments: '{"content":"你好"}' } };
beforeAll(async () => {
    server = http.createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        const parameters = JSON.parse(body);
        received.push({ url: request.url, authorization: request.headers.authorization, body: parameters });
        if (parameters.model === 'o3' && ('max_tokens' in parameters || 'temperature' in parameters)) {
            response.writeHead(400).end();
            return;
        }
        if (['o1', 'o1-2024-12-17', 'json-tool', 'json-error'].includes(parameters.model)) {
            const message = parameters.model === 'json-tool' ? { content: null, tool_calls: [toolCall] } : { content: '你好' };
            const completion = parameters.model === 'json-error' ? { error: { message: 'Failed' } } : { choices: [{ message }] };
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(completion));
            return;
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write('data: {"choices":[{"delta":{"content":"hel');
        response.end('lo"}}]}\n\ndata: [DONE]\n\n');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});
afterAll(async () => new Promise(resolve => server.close(resolve)));

test('streams a configured no-key local model and forwards server-assembled messages', async () => {
    const chunks = [];
    const text = await streamServerModel({
        baseUrl, model: 'local', messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 12, signal: new AbortController().signal, emit: chunk => chunks.push(chunk),
    });
    expect(text).toBe('hello');
    expect(chunks).toEqual(['hello']);
    expect(received.at(-1)).toMatchObject({ url: '/v1/chat/completions', authorization: undefined,
        body: { model: 'local', stream: true, messages: [{ role: 'user', content: 'hello' }], max_tokens: 12 } });
});

test('builds the wire request from the model of each attempt, including a fallback o3', async () => {
    const tools = [{ type: 'function', function: { name: 'submit_story' } }];
    const toolChoice = tools[0];
    const input = { baseUrl, messages: [{ role: 'system', content: 'prompt' }], maxTokens: 112, temperature: 0.7,
        topP: 0.8, frequencyPenalty: 0.2, presencePenalty: 0.3, tools, toolChoice,
        signal: new AbortController().signal, emit() {} };
    await streamServerModel({ ...input, model: 'local' });
    expect(received.at(-1).body).toEqual({ model: 'local', messages: input.messages, stream: true, max_tokens: 112,
        temperature: 0.7, top_p: 0.8, frequency_penalty: 0.2, presence_penalty: 0.3, tools, tool_choice: toolChoice });
    await expect(streamServerModel({ ...input, model: 'o3', reasoningEffort: 'low' })).resolves.toBe('hello');
    expect(received.at(-1).body).toEqual({ model: 'o3', messages: input.messages, stream: true, max_completion_tokens: 112,
        tools, tool_choice: toolChoice, reasoning_effort: 'low' });
});

test.each([
    ['o4-mini', undefined, {}],
    ['gpt-5', undefined, {}],
    ['gpt-5.4', undefined, { temperature: 0.7, top_p: 0.8 }],
    ['gpt-5.4', 'medium', { reasoning_effort: 'medium' }],
    ['gpt-5-chat-latest', undefined, { temperature: 0.7, top_p: 0.8, frequency_penalty: 0.2, presence_penalty: 0.3 }],
])('matches legacy token and sampling rules for %s (effort %s)', async (model, reasoningEffort, expected) => {
    await streamServerModel({ baseUrl, model, reasoningEffort, messages: [], maxTokens: 42, temperature: 0.7,
        topP: 0.8, frequencyPenalty: 0.2, presencePenalty: 0.3, signal: new AbortController().signal, emit() {} });
    expect(received.at(-1).body).toEqual({ model, messages: [], stream: true, max_completion_tokens: 42, ...expected });
});

test.each(['o1', 'o1-2024-12-17'])('requests a single JSON completion for %s without changing the input transcript', async model => {
    const chunks = [];
    const messages = [{ role: 'system', content: 'prompt' }];
    const text = await streamServerModel({ baseUrl, model, messages, maxTokens: 12, temperature: 0.7,
        tools: [{ type: 'function', function: { name: 'submit_story' } }], toolChoice: 'none',
        signal: new AbortController().signal, emit: chunk => chunks.push(chunk) });
    expect(text).toBe('你好');
    expect(chunks).toEqual(['你好']);
    expect(received.at(-1).body).toEqual({ model, stream: false, messages: [{ role: 'user', content: 'prompt' }], max_completion_tokens: 12 });
    expect(messages).toEqual([{ role: 'system', content: 'prompt' }]);
});

test('accepts a JSON tool-only completion even when streaming was requested', async () => {
    const calls = [];
    const chunks = [];
    const input = { baseUrl, model: 'json-tool', messages: [], maxTokens: 12,
        signal: new AbortController().signal, emit: chunk => chunks.push(chunk) };
    await expect(streamServerModel({ ...input, onTools: value => calls.push(value) })).resolves.toBe('');
    expect(received.at(-1).body.stream).toBe(true);
    expect(calls).toEqual([[toolCall]]);
    expect(chunks).toEqual([]);
    await expect(streamServerModel(input)).rejects.toThrow('Unexpected model tool calls');
});

test('does not treat a JSON payload without a completion as an empty successful reply', async () => {
    await expect(streamServerModel({ baseUrl, model: 'json-error', messages: [], maxTokens: 12,
        signal: new AbortController().signal, emit() {} })).rejects.toThrow('Invalid model completion');
});

test('never forwards the configured key to a redirected origin', async () => {
    const redirect = http.createServer((_request, response) => {
        response.writeHead(307, { location: `${baseUrl}/chat/completions` });

        response.end();
    });
    await new Promise(resolve => redirect.listen(0, '127.0.0.1', resolve));
    try {
        const url = `http://127.0.0.1:${redirect.address().port}/v1`;
        await streamServerModel({ baseUrl: url, model: 'local', messages: [], maxTokens: 12,
            signal: new AbortController().signal, emit() {}, apiKey: 'private-key' });
        expect(received.at(-1).authorization).toBeUndefined();
    } finally {
        await new Promise(resolve => redirect.close(resolve));
    }
});

test('rejects an upstream stream that ends before its completion marker', async () => {
    const broken = http.createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
    });
    await new Promise(resolve => broken.listen(0, '127.0.0.1', resolve));
    try {
        await expect(streamServerModel({ baseUrl: `http://127.0.0.1:${broken.address().port}/v1`, model: 'local',
            messages: [], maxTokens: 12, signal: new AbortController().signal, emit() {} })).rejects.toThrow('incomplete');
    } finally {
        await new Promise(resolve => broken.close(resolve));
    }
});

test.each([false, true])('uses the configured address policy on every model hop (proxy bypass: %s)', async bypass => {
    const blocked = http.createServer((_request, response) => response.writeHead(403).end());
    await new Promise(resolve => blocked.listen(0, '127.0.0.2', resolve));
    const blockedUrl = `http://127.0.0.2:${blocked.address().port}`;
    const redirect = http.createServer((_request, response) => response.writeHead(307, {
        location: _request.url.startsWith('/allowed/') ? `${baseUrl}/chat/completions` : `${blockedUrl}/chat/completions`,
    }).end());
    await new Promise(resolve => redirect.listen(0, '127.0.0.1', resolve));
    const redirectUrl = `http://127.0.0.1:${redirect.address().port}`;
    const original = http.globalAgent;
    const filtering = new PrivateRequestAgent({ privateAddressWhitelist: ['127.0.0.1/32'], logBlocked: false });
    const proxy = bypass ? new ProxyAgent({ httpAgent: filtering, getProxyForUrl: () => '' }) : null;
    http.globalAgent = proxy ?? filtering;
    const input = { model: 'local', messages: [], maxTokens: 12, signal: new AbortController().signal, emit() {} };
    try {
        await expect(streamServerModel({ ...input, baseUrl })).resolves.toBe('hello');
        await expect(streamServerModel({ ...input, baseUrl: `${redirectUrl}/allowed` })).resolves.toBe('hello');
        expect(received.at(-1).authorization).toBeUndefined();
        await expect(streamServerModel({ ...input, baseUrl: blockedUrl })).rejects.toThrow('Blocked request to private IP address');
        await expect(streamServerModel({ ...input, baseUrl: `${redirectUrl}/blocked` })).rejects.toThrow('Blocked request to private IP address');
    } finally {
        http.globalAgent = original;
        proxy?.destroy();
        filtering.destroy();
        await Promise.all([blocked, redirect].map(server => new Promise(resolve => server.close(resolve))));
    }
});
