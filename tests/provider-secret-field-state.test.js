import { describe, expect, jest, test } from '@jest/globals';

import { hasFallbackProviderSettings } from '../public/scripts/chat-generation-auto-recovery.js';
import {
    canUseDirectProviderSecret,
    clearProviderSecretField,
    getFallbackProviderStatus,
    getUnifiedKeyFieldState,
    resolveProviderSecretKeyForSettings,
    saveProviderSecretField,
    toggleSecretInputMask,
} from '../public/scripts/provider-secret-field-state.js';

const fallbackSettings = {
    fallback_provider_enabled: true,
    fallback_provider_base_url: 'https://fallback.example/v1',
    fallback_provider_model: 'fallback-model',
};

describe('provider secret field state', () => {
    test('resolves fallback readiness from the shared auto recovery helper', () => {
        const secretState = { api_key_openai_fallback: [{ id: 'secret-1', active: true }] };
        const ready = getFallbackProviderStatus(fallbackSettings, secretState, 'api_key_openai_fallback');

        expect(ready).toEqual({ state: 'ready', text: 'Ready', ready: true });
        expect(ready.ready).toBe(hasFallbackProviderSettings(fallbackSettings, secretState, 'api_key_openai_fallback'));

        expect(getFallbackProviderStatus({ ...fallbackSettings, fallback_provider_enabled: false }, secretState, 'api_key_openai_fallback'))
            .toMatchObject({ state: 'disabled', text: 'Disabled', ready: false });
        expect(getFallbackProviderStatus({ ...fallbackSettings, fallback_provider_model: '' }, secretState, 'api_key_openai_fallback'))
            .toMatchObject({ state: 'needs_setup', text: 'Needs setup', ready: false });
    });

    test('resolves unified key field state for proxy, saved secret, and empty secret modes', () => {
        expect(getUnifiedKeyFieldState({
            settings: { reverse_proxy: 'https://proxy.example', proxy_password: 'proxy-password', chat_completion_source: 'openai' },
            source: 'openai',
            secretKey: 'api_key_openai',
            secretState: {},
            chatCompletionSources: { OPENAI: 'openai', CLAUDE: 'claude', MAKERSUITE: 'makersuite' },
        })).toEqual({
            placeholder: 'Proxy password',
            value: 'proxy-password',
            vertexAiActive: false,
        });

        expect(getUnifiedKeyFieldState({
            settings: { chat_completion_source: 'openai' },
            source: 'openai',
            secretKey: 'api_key_openai',
            secretState: { api_key_openai: [{ label: 'main-key', active: true }] },
            chatCompletionSources: { OPENAI: 'openai', CLAUDE: 'claude', MAKERSUITE: 'makersuite' },
        })).toMatchObject({ placeholder: 'Saved (main-key)', value: '' });

        expect(getUnifiedKeyFieldState({
            settings: { chat_completion_source: 'claude' },
            source: 'claude',
            secretKey: 'api_key_claude',
            secretState: {},
            chatCompletionSources: { OPENAI: 'openai', CLAUDE: 'claude', MAKERSUITE: 'makersuite' },
        })).toMatchObject({ placeholder: 'sk-ant-...', value: '' });

        expect(getUnifiedKeyFieldState({
            settings: {
                chat_completion_source: 'makersuite',
                use_vertexai: true,
                vertexai_auth_mode: 'express',
            },
            source: 'makersuite',
            secretKey: 'api_key_makersuite',
            secretState: {},
            chatCompletionSources: { OPENAI: 'openai', CLAUDE: 'claude', MAKERSUITE: 'makersuite' },
        })).toMatchObject({ placeholder: 'AIza...', value: '', vertexAiActive: true });
    });

    test('resolves React settings provider secret keys for Vertex AI express and full modes', () => {
        const sources = { OPENAI: 'openai', CLAUDE: 'claude', MAKERSUITE: 'makersuite' };

        const expressSecretKey = resolveProviderSecretKeyForSettings({
            settings: {
                reverse_proxy: '',
                use_vertexai: true,
                vertexai_auth_mode: 'express',
            },
            source: 'makersuite',
            secretKey: 'api_key_makersuite',
            chatCompletionSources: sources,
        });
        expect(expressSecretKey).toBe('api_key_vertexai');
        expect(canUseDirectProviderSecret({
            settings: {
                reverse_proxy: '',
                use_vertexai: true,
                vertexai_auth_mode: 'express',
            },
            secretKey: expressSecretKey,
        })).toBe(true);

        const fullSecretKey = resolveProviderSecretKeyForSettings({
            settings: {
                reverse_proxy: '',
                use_vertexai: true,
                vertexai_auth_mode: 'full',
            },
            source: 'makersuite',
            secretKey: 'api_key_makersuite',
            chatCompletionSources: sources,
        });
        expect(fullSecretKey).toBeNull();
        expect(canUseDirectProviderSecret({
            settings: {
                reverse_proxy: '',
                use_vertexai: true,
                vertexai_auth_mode: 'full',
            },
            secretKey: fullSecretKey,
        })).toBe(false);

        const proxySecretKey = resolveProviderSecretKeyForSettings({
            settings: {
                reverse_proxy: 'https://proxy.example',
                use_vertexai: true,
                vertexai_auth_mode: 'express',
            },
            source: 'openai',
            secretKey: 'api_key_openai',
            chatCompletionSources: sources,
        });
        expect(proxySecretKey).toBeNull();
        expect(canUseDirectProviderSecret({
            settings: {
                reverse_proxy: 'https://proxy.example',
                use_vertexai: true,
                vertexai_auth_mode: 'express',
            },
            secretKey: proxySecretKey,
        })).toBe(false);
    });

    test('saves fallback secrets only when a value exists and preserves input on failure', async () => {
        const writeSecret = jest.fn(async () => 'secret-id');

        await expect(saveProviderSecretField({
            key: 'api_key_openai_fallback',
            value: ' fallback-key ',
            writeSecret,
        })).resolves.toEqual({ status: 'saved', id: 'secret-id', shouldClearInput: true });
        expect(writeSecret).toHaveBeenCalledWith('api_key_openai_fallback', 'fallback-key');

        await expect(saveProviderSecretField({
            key: 'api_key_openai_fallback',
            value: '   ',
            writeSecret,
        })).resolves.toEqual({ status: 'empty', id: null, shouldClearInput: false });

        await expect(saveProviderSecretField({
            key: 'api_key_openai_fallback',
            value: 'bad-key',
            writeSecret: jest.fn(async () => null),
        })).resolves.toEqual({ status: 'failed', id: null, shouldClearInput: false });
    });

    test('clears fallback secret fields through the provided secret key only', async () => {
        const deleteSecret = jest.fn(async () => undefined);

        await expect(clearProviderSecretField({
            key: 'api_key_openai_fallback',
            deleteSecret,
        })).resolves.toEqual({ status: 'cleared', shouldClearInput: true });

        expect(deleteSecret).toHaveBeenCalledWith('api_key_openai_fallback');
    });

    test('toggles masked input and trigger icon classes', () => {
        const inputClasses = new Set(['api-key-masked']);
        const triggerClasses = new Set(['fa-eye-slash']);
        const input = {
            classList: {
                toggle: className => inputClasses.has(className) ? inputClasses.delete(className) : inputClasses.add(className),
                contains: className => inputClasses.has(className),
            },
        };
        const trigger = {
            classList: {
                toggle: className => triggerClasses.has(className) ? triggerClasses.delete(className) : triggerClasses.add(className),
                contains: className => triggerClasses.has(className),
            },
        };

        toggleSecretInputMask(input, trigger);
        expect(input.classList.contains('api-key-masked')).toBe(false);
        expect(trigger.classList.contains('fa-eye')).toBe(true);

        toggleSecretInputMask(input, trigger);
        expect(input.classList.contains('api-key-masked')).toBe(true);
        expect(trigger.classList.contains('fa-eye-slash')).toBe(true);
    });
});
