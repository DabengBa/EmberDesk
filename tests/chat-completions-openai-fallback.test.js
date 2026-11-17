import express from 'express';
import realFetch from 'node-fetch';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { once } from 'node:events';

const fetchMock = jest.fn();
const readSecretMock = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
    default: (...args) => {
        if (String(args[0]).startsWith('http://127.0.0.1:')) {
            return realFetch(...args);
        }
        return fetchMock(...args);
    },
}));

function createApp(router) {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = { directories: { root: 'unused' } };
        next();
    });
    app.use('/api/backends/chat-completions', router);
    return app;
}

async function listen(app) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    return { server, url: `http://127.0.0.1:${address.port}` };
}

async function withServer(app, callback) {
    const { server, url } = await listen(app);
    try {
        return await callback(url);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}

function createOpenAIResponse(body) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { raw: () => ({}) },
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function generateBody(overrides = {}) {
    return {
        chat_completion_source: 'openai',
        custom_url: 'https://endpoint.example/v1',
        model: 'primary-model',
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
        max_tokens: 64,
        ...overrides,
    };
}

describe('single-endpoint OpenAI-compatible chat completions backend', () => {
    let router;

    beforeEach(async () => {
        jest.resetModules();
        fetchMock.mockReset();
        readSecretMock.mockReset();

        const { setConfigFilePath } = await import('../src/util.js');
        setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));

        jest.unstable_mockModule('../src/endpoints/secrets.js', () => ({
            SECRET_KEYS: {
                OPENAI: 'api_key_openai',
            },
            readSecret: readSecretMock,
        }));

        ({ router } = await import('../src/endpoints/backends/chat-completions.js'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('primary and fallback requests share one URL and the primary API key', async () => {
        readSecretMock.mockImplementation((_directories, key) => (key === 'api_key_openai' ? 'shared-key' : ''));
        fetchMock.mockResolvedValue(createOpenAIResponse({ choices: [{ message: { content: 'reply' } }] }));

        await withServer(createApp(router), async url => {
            const primary = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateBody()),
            });
            expect(primary.status).toBe(200);
            await primary.text();

            const fallback = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateBody({ model: 'fallback-model' })),
            });
            expect(fallback.status).toBe(200);
            await fallback.text();
        });

        expect(readSecretMock).toHaveBeenCalledTimes(2);
        expect(readSecretMock).toHaveBeenNthCalledWith(1, { root: 'unused' }, 'api_key_openai', undefined);
        expect(readSecretMock).toHaveBeenNthCalledWith(2, { root: 'unused' }, 'api_key_openai', undefined);
        expect(fetchMock.mock.calls[0][0]).toBe('https://endpoint.example/v1/chat/completions');
        expect(fetchMock.mock.calls[1][0]).toBe('https://endpoint.example/v1/chat/completions');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer shared-key');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer shared-key');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('primary-model');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('fallback-model');
    });

    test('legacy secret markers and proxy fields are ignored entirely', async () => {
        readSecretMock.mockImplementation((_directories, key) => (key === 'api_key_openai' ? 'shared-key' : 'x'));
        fetchMock.mockResolvedValue(createOpenAIResponse({ choices: [{ message: { content: 'reply' } }] }));

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateBody({
                    openai_secret_marker: 'openai_fallback_provider',
                    reverse_proxy: 'https://legacy-proxy.example',
                    proxy_password: 'proxy-secret',
                })),
            });

            expect(response.status).toBe(200);
            await response.text();
        });

        // The retired marker/keys never reroute the endpoint or the credential.
        expect(readSecretMock).toHaveBeenCalledWith({ root: 'unused' }, 'api_key_openai', undefined);
        expect(fetchMock.mock.calls[0][0]).toBe('https://endpoint.example/v1/chat/completions');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer shared-key');
    });

    test('missing key still fails closed unless a custom endpoint is configured', async () => {
        readSecretMock.mockReturnValue('');

        await withServer(createApp(router), async url => {
            const noEndpoint = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateBody({ custom_url: undefined })),
            });
            expect(noEndpoint.status).toBe(400);

            fetchMock.mockResolvedValue(createOpenAIResponse({ choices: [{ message: { content: 'ok' } }] }));
            const keylessEndpoint = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateBody()),
            });
            expect(keylessEndpoint.status).toBe(200);
            await keylessEndpoint.text();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('status forwards models and rejects unsupported providers without an upstream request', async () => {
        readSecretMock.mockReturnValue('shared-key');
        fetchMock.mockResolvedValue(createOpenAIResponse({ data: [{ id: 'model-a' }] }));
        await withServer(createApp(router), async url => {
            const status = await fetch(`${url}/api/backends/chat-completions/status`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_completion_source: 'openai', custom_url: 'https://endpoint.example/v1' }),
            });
            expect(await status.json()).toEqual({ data: [{ id: 'model-a' }] });
            const unsupported = await fetch(`${url}/api/backends/chat-completions/status`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_completion_source: 'retired' }),
            });
            expect(unsupported.status).toBe(400);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://endpoint.example/v1/models');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer shared-key');
    });

    test('generation retains reasoning, schema, stop and tool payloads', async () => {
        readSecretMock.mockReturnValue('shared-key');
        fetchMock.mockResolvedValue(createOpenAIResponse({ choices: [] }));
        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generateBody({
                    model: 'gpt-5', reasoning_effort: 'min', verbosity: 'low',
                    json_schema: { name: 'result', value: { type: 'object' } },
                    stop: ['end'], tools: [{ type: 'function', function: { name: 'lookup' } }], tool_choice: 'auto',
                })),
            });
            expect(response.status).toBe(200);
            await response.text();
        });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            reasoning_effort: 'minimal', verbosity: 'low', stop: ['end'], tool_choice: 'auto',
            tools: [{ type: 'function', function: { name: 'lookup' } }],
            response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: { type: 'object' } } },
        });
    });
});
