import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function runtime() {
    const source = readFileSync(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
    const start = source.indexOf('let providerConnectionService;');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('/**\n * Check if the model supports image inlining', start);
    const settings = { custom_url: 'http://saved/v1', openai_model: 'saved', chat_completion_source: 'openai' };
    const status = jest.fn();
    const scope = vm.createContext({
        oai_settings: settings, secret_state: {}, SECRET_KEYS: { OPENAI: 'openai' },
        getRequestHeaders: () => ({}), fetch: jest.fn(),
        openAIContext: { abortStatusCheck: new AbortController(), main_api: 'openai', setOnlineStatus: status, displayOnlineStatus: jest.fn() },
        model_list: [], console,
    });
    vm.runInContext(source.slice(start, end).replaceAll('export ', '') + '\nglobalThis.api = { installProviderConnectionService, connectProviderConnection, testProviderConnection };', scope);
    const connectProvider = jest.fn();
    const testProviderConnection = jest.fn();
    scope.api.installProviderConnectionService({ connectProvider, testProviderConnection });
    return { ...scope.api, settings, status, scope, connect: connectProvider, test: testProviderConnection };
}

describe('provider runtime projection', () => {
    test('probes a draft without publishing its models or changing committed configuration', async () => {
        const r = runtime();
        const input = { customUrl: 'http://draft/v1', openaiModel: 'draft', hasSavedSecret: false };
        r.connect.mockResolvedValue({ status: 'online', models: [{ id: 'different' }] });
        await r.connectProviderConnection(input);
        expect(r.connect).toHaveBeenCalledWith(input, expect.any(Object));
        expect(r.settings.openai_model).toBe('saved');
        expect(r.scope.model_list).toEqual([]);
        expect(r.status).not.toHaveBeenCalled();
    });
    test('publishes matching results without auto-selecting a model', async () => {
        const r = runtime();
        r.connect.mockResolvedValue({ status: 'online', models: [{ id: 'other' }] });
        await r.connectProviderConnection();
        expect(r.settings.openai_model).toBe('saved');
        expect(r.scope.model_list).toEqual([{ id: 'other' }]);
        expect(r.status).toHaveBeenCalledWith('online');
    });
    test('does not publish a stale result after committed settings change', async () => {
        const r = runtime();
        let finish;
        r.connect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const pending = r.connectProviderConnection();
        r.settings.custom_url = 'http://changed';
        finish({ status: 'online', models: [{ id: 'old' }] });
        await pending;
        expect(r.status).not.toHaveBeenCalled();
        expect(r.scope.model_list).toEqual([]);
    });
    test('rejects failures while only updating matching committed status', async () => {
        const r = runtime();
        r.test.mockRejectedValue(new Error('test failed'));
        await expect(r.testProviderConnection()).rejects.toThrow('test failed');
        expect(r.status).toHaveBeenCalledWith('no_connection');
        r.status.mockClear();
        await expect(r.testProviderConnection({ customUrl: 'http://draft', openaiModel: 'draft', hasSavedSecret: false })).rejects.toThrow('test failed');
        expect(r.status).not.toHaveBeenCalled();
    });
});
