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
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

describe('OpenAI-compatible fallback chat completions backend', () => {
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
                OPENAI_FALLBACK: 'api_key_openai_fallback',
                CLAUDE: 'api_key_claude',
                MAKERSUITE: 'api_key_makersuite',
            },
            readSecret: readSecretMock,
        }));

        ({ router } = await import('../src/endpoints/backends/chat-completions.js'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('resolves the fallback marker only to the dedicated fallback OpenAI secret', async () => {
        readSecretMock.mockImplementation((_directories, key) => {
            if (key === 'api_key_openai') return 'primary-key';
            if (key === 'api_key_openai_fallback') return 'fallback-key';
            return '';
        });
        fetchMock.mockResolvedValue(createOpenAIResponse({ choices: [{ message: { content: 'fallback reply' } }] }));

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: 'https://fallback.example/v1',
                    openai_secret_marker: 'openai_fallback_provider',
                    model: 'fallback-model',
                    messages: [{ role: 'user', content: 'hello' }],
                    stream: false,
                    max_tokens: 64,
                }),
            });

            expect(response.status).toBe(200);
            await response.text();
        });

        expect(readSecretMock).toHaveBeenCalledWith({ root: 'unused' }, 'api_key_openai_fallback', undefined);
        expect(readSecretMock).not.toHaveBeenCalledWith({ root: 'unused' }, 'api_key_openai', undefined);
        expect(fetchMock.mock.calls[0][0]).toBe('https://fallback.example/v1/chat/completions');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer fallback-key');
    });

    test('rejects arbitrary OpenAI secret markers from browser payloads', async () => {
        readSecretMock.mockReturnValue('primary-key');

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    custom_url: 'https://fallback.example/v1',
                    openai_secret_marker: 'api_key_openai',
                    model: 'fallback-model',
                    messages: [{ role: 'user', content: 'hello' }],
                    stream: false,
                }),
            });

            expect(response.status).toBe(400);
        });

        expect(readSecretMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
