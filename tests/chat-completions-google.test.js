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
                VERTEXAI: 'api_key_vertexai',
                VERTEXAI_SERVICE_ACCOUNT: 'vertexai_service_account_json',
                OPENAI: 'api_key_openai',
                CLAUDE: 'api_key_claude',
            },
            readSecret: jest.fn((_directories, key, id) => {
                if (key === 'api_key_makersuite') return 'studio-key';
                if (key === 'api_key_vertexai' && id === 'profile-secret') return 'profile-vertex-key';
                if (key === 'api_key_vertexai') return 'vertex-key';
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

    test('routes Vertex AI generation through Vertex URL and API key header', async () => {
        fetchMock.mockResolvedValue(createGoogleResponse({
            candidates: [{ content: { parts: [{ text: 'hello back' }] } }],
        }));

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'vertexai',
                    secret_id: 'profile-secret',
                    vertexai_auth_mode: 'express',
                    vertexai_region: 'europe-west4',
                    vertexai_express_project_id: 'project-one',
                    model: 'gemini-2.5-flash',
                    messages: [{ role: 'user', content: 'hello' }],
                    stream: false,
                    max_tokens: 128,
                }),
            });

            expect(response.status).toBe(200);
            await response.text();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=profile-vertex-key');
        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
            'Content-Type': 'application/json',
        });
    });

    test('adds SSE parameter to Vertex AI streaming generation URL', async () => {
        fetchMock.mockResolvedValue(createGoogleResponse({}));

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'vertexai',
                    vertexai_auth_mode: 'express',
                    vertexai_region: 'us-central1',
                    vertexai_express_project_id: 'project-one',
                    model: 'gemini-2.5-flash',
                    messages: [{ role: 'user', content: 'hello' }],
                    stream: true,
                }),
            });
            await response.text();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?key=vertex-key&alt=sse');
    });

    test('validates Vertex AI status through countTokens', async () => {
        fetchMock.mockResolvedValue(createGoogleResponse({
            totalTokens: 1,
        }));

        await withServer(createApp(router), async url => {
            const response = await fetch(`${url}/api/backends/chat-completions/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_completion_source: 'vertexai',
                    vertexai_auth_mode: 'express',
                    vertexai_region: 'us-central1',
                    vertexai_express_project_id: 'project-one',
                    model: 'gemini-2.5-flash',
                }),
            });

            expect(response.status).toBe(200);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:countTokens?key=vertex-key');
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
            'Content-Type': 'application/json',
        });
    });
});
