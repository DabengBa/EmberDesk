import { describe, expect, jest, test } from '@jest/globals';

import { hasFallbackProviderSettings } from '../public/scripts/chat-generation-auto-recovery.js';
import {
    clearProviderSecretField,
    getFallbackProviderStatus,
    getUnifiedKeyFieldState,
    resolveProviderSecretKeyForSettings,
    saveProviderSecretField,
    toggleSecretInputMask,
} from '../public/scripts/provider-secret-field-state.js';

const fallbackSettings = {
    fallback_provider_model: 'fallback-model',
};

describe('provider secret field state', () => {
    test('fallback status follows the configured fallback model only', () => {
        const ready = getFallbackProviderStatus(fallbackSettings);

        expect(ready).toEqual({ state: 'ready', text: 'Ready', ready: true });
        expect(ready.ready).toBe(hasFallbackProviderSettings(fallbackSettings));

        expect(getFallbackProviderStatus({ fallback_provider_model: '' }))
            .toMatchObject({ state: 'disabled', text: 'Disabled', ready: false });
        expect(getFallbackProviderStatus({}))
            .toMatchObject({ state: 'disabled', text: 'Disabled', ready: false });
    });

    test('resolves unified key field state for saved and empty secret modes', () => {
        expect(getUnifiedKeyFieldState({
            source: 'openai',
            secretKey: 'api_key_openai',
            secretState: { api_key_openai: [{ label: 'main-key', active: true }] },
            chatCompletionSources: { OPENAI: 'openai' },
        })).toMatchObject({ placeholder: 'Saved (main-key)', value: '' });

        expect(getUnifiedKeyFieldState({
            source: 'openai',
            secretKey: 'api_key_openai',
            secretState: {},
            chatCompletionSources: { OPENAI: 'openai' },
        })).toMatchObject({ placeholder: 'sk-...', value: '' });
    });

    test('resolves the provider secret key directly for the single-key contract', () => {
        expect(resolveProviderSecretKeyForSettings({ secretKey: 'api_key_openai' })).toBe('api_key_openai');
        expect(resolveProviderSecretKeyForSettings({ secretKey: null })).toBeNull();
    });

    test('saves provider secrets only when a value exists and preserves input on failure', async () => {
        const writeSecret = jest.fn(async () => 'secret-id');

        await expect(saveProviderSecretField({
            key: 'api_key_openai',
            value: ' provider-key ',
            writeSecret,
        })).resolves.toEqual({ status: 'saved', id: 'secret-id', shouldClearInput: true });
        expect(writeSecret).toHaveBeenCalledWith('api_key_openai', 'provider-key');

        await expect(saveProviderSecretField({
            key: 'api_key_openai',
            value: '   ',
            writeSecret,
        })).resolves.toEqual({ status: 'empty', id: null, shouldClearInput: false });

        await expect(saveProviderSecretField({
            key: 'api_key_openai',
            value: 'bad-key',
            writeSecret: jest.fn(async () => null),
        })).resolves.toEqual({ status: 'failed', id: null, shouldClearInput: false });
    });

    test('clears provider secret fields through the provided secret key only', async () => {
        const deleteSecret = jest.fn(async () => undefined);

        await expect(clearProviderSecretField({
            key: 'api_key_openai',
            deleteSecret,
        })).resolves.toEqual({ status: 'cleared', shouldClearInput: true });

        expect(deleteSecret).toHaveBeenCalledWith('api_key_openai');
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
