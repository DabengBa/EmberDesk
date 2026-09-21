import express from 'express';
import realFetch from 'node-fetch';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { once } from 'node:events';

const fetchMock = jest.fn();

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

function createGoogleResponse(body) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

describe('Google chat completions backend', () => {
    let router;

    beforeEach(async () => {
        jest.resetModules();
        fetchMock.mockReset();

        const { setConfigFilePath } = await import('../src/util.js');
        setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));

        jest.unstable_mockModule('../src/endpoints/secrets.js', () => ({
            SECRET_KEYS: {
                MAKERSUITE: 'api_key_makersuite',
                OPENAI: 'api_key_openai',
            },
            readSecret: jest.fn((_directories, key, id) => {
                if (key === 'api_key_makersuite') return 'studio-key';
                return '';
            }),
        }));

        ({ router } = await import('../src/endpoints/backends/chat-completions.js'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('adds streaming parameters as a separate Google AI Studio query parameter', async () => {
        fetchMock.mockResolvedValue(createGoogleResponse({}));

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'makersuite',
                    model: 'gemini-2.5-flash',
                    messages: [{ role: 'user', content: 'hello' }],
                    stream: true,
                }),
            });
            await response.text();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=studio-key&alt=sse');
    });
});
