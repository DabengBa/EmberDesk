import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('provider owns the original defaults and live generation settings', () => {
    const source = readFileSync(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
    const root = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export let amount_gen');
    const end = source.indexOf('export function installOpenAIContext', start);
    expect(start).toBeGreaterThan(-1);
    const scope = vm.createContext({});
    vm.runInContext(source.slice(start, end).replaceAll('export ', '') + '\nglobalThis.api = { get amount() { return amount_gen; }, get context() { return max_context; }, get api() { return main_api; }, setAmountGen, setMaxContext, setMainApi };', scope);
    expect([scope.api.amount, scope.api.context, scope.api.api]).toEqual([80, 2048, undefined]);
    scope.api.setAmountGen(13);
    scope.api.setMaxContext(4096);
    scope.api.setMainApi('openai');
    expect([scope.api.amount, scope.api.context, scope.api.api]).toEqual([13, 4096, 'openai']);
    expect(root).toContain('export { amount_gen, max_context, main_api };');
    expect(root).toContain('setAmountGen(settings.amount_gen)');
    expect(root).toContain('setMaxContext(parseInt(settings.max_context))');
    expect(root).toContain('setMainApi(selectedVal)');
});

test('provider initialization leaves textarea sizing to React and does not bind retired Azure inputs', () => {
    const source = readFileSync(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
    const initialization = source.slice(source.indexOf('export function initOpenAI()'));
    expect(/\$\(['"]#azure_(?:base_url|deployment_name|api_version)['"]\)/.test(initialization)).toBe(false);
    expect(initialization).not.toContain("'#openai_settings .autoSetHeight'");
    const panel = readFileSync(new URL('../app/components/ai-config/AiConfigPanel.tsx', import.meta.url), 'utf8');
    expect(panel).toContain('autoHeightText');
    expect(initialization).toContain("deleteSecret('api_key_openai_fallback')");
});

test('retired provider feature flag elements are not written; capability APIs remain exported', () => {
    const source = readFileSync(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
    expect(source.includes('element.dataset.ccToggle')).toBe(false);
    expect(source).toContain('export function isImageInliningSupported()');
    expect(source).toContain('export function isAudioInliningSupported()');
    expect(source).toContain('export function isVideoInliningSupported()');
});

test('the provider runtime uses the currently installed shell state, including a replaced abort controller', async () => {
    const source = readFileSync(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
    expect(/from\s+['"]\.\.\/script\.js['"]/.test(source)).toBe(false);
    const contextStart = source.indexOf('let openAIContext;');
    const contextEnd = source.indexOf('const presetDialogs', contextStart);
    expect(contextStart).toBeGreaterThan(-1);
    const start = source.indexOf('let providerConnectionService;');
    const end = source.indexOf('/**\n * Check if the model supports image inlining', start);
    const scope = vm.createContext({
        oai_settings: { custom_url: 'http://saved/v1', openai_model: 'saved', chat_completion_source: 'openai' },
        secret_state: {}, SECRET_KEYS: { OPENAI: 'openai' }, getRequestHeaders: () => ({}),
        fetch: jest.fn(), model_list: [], console,
    });
    vm.runInContext(source.slice(contextStart, contextEnd).replaceAll('export ', '')
        + source.slice(start, end).replaceAll('export ', '')
        + '\nglobalThis.api = { installOpenAIContext, installProviderConnectionService, connectProviderConnection, reconnectOpenAi };', scope);
    let controller = new AbortController();
    let mainApi = 'other';
    const setOnlineStatus = jest.fn();
    scope.api.installOpenAIContext({
        get abortStatusCheck() { return controller; },
        get main_api() { return mainApi; },
        setOnlineStatus, displayOnlineStatus: jest.fn(),
    });
    const connectProvider = jest.fn().mockResolvedValue({ status: 'online', models: [] });
    scope.api.installProviderConnectionService({ connectProvider });
    await scope.api.connectProviderConnection();
    expect(connectProvider.mock.calls[0][1].signal).toBe(controller.signal);
    controller = new AbortController();
    await scope.api.connectProviderConnection();
    expect(connectProvider.mock.calls[1][1].signal).toBe(controller.signal);
    scope.api.reconnectOpenAi();
    expect(connectProvider).toHaveBeenCalledTimes(2);
    mainApi = 'openai';
    scope.api.reconnectOpenAi();
    expect(connectProvider).toHaveBeenCalledTimes(3);
});
