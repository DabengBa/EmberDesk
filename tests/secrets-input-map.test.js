import { describe, expect, test } from '@jest/globals';

import {
    expectContainsMarkers,
    expectNotContainsMarkers,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

describe('secrets input map', () => {
    test('Workers AI uses the key manager instead of a missing autocomplete input', () => {
        const secretsSource = readRepoFile('public/scripts/secrets.js');
        const stableDiffusionSettings = readRepoFile('public/scripts/extensions/stable-diffusion/settings.html');

        expect(stableDiffusionSettings).toContain('data-key="api_key_workers_ai"');
        expect(secretsSource).not.toMatch(/\[SECRET_KEYS\.WORKERS_AI\]: '#api_key_workers_ai'/);
    });

    test('fallback OpenAI provider has a dedicated secret and input mapping', () => {
        const frontendSecrets = readRepoFile('public/scripts/secrets.js');
        const backendSecrets = readRepoFile('src/endpoints/secrets.js');

        expectContainsMarkers(frontendSecrets, [
            "OPENAI_FALLBACK: 'api_key_openai_fallback'",
            "[SECRET_KEYS.OPENAI_FALLBACK]: 'Fallback OpenAI-compatible'",
            "[SECRET_KEYS.OPENAI_FALLBACK]: '#fallback_provider_api_key'",
        ], { contractName: 'fallback frontend secret mapping' });
        expectContainsMarkers(backendSecrets, [
            "OPENAI_FALLBACK: 'api_key_openai_fallback'",
        ], { contractName: 'fallback backend secret mapping' });
        expectNotContainsMarkers(frontendSecrets, [
            "[SECRET_KEYS.OPENAI_FALLBACK]: '#api_key_openai'",
        ], { contractName: 'fallback frontend secret mapping' });
        expect(readRepoFile('public/index.html')).toContain('id="fallback_provider_api_key"');
    });

    test('fallback key controls write and clear only the dedicated fallback secret', () => {
        const openaiSource = readRepoFile('public/scripts/openai.js');

        expectContainsMarkers(openaiSource, [
            "$('#fallback_provider_save_key').on('click', onFallbackProviderSaveKeyClick);",
            "$('#fallback_provider_clear_key').on('click', onFallbackProviderClearKeyClick);",
            'saveProviderSecretField({',
            'clearProviderSecretField({',
            'key: SECRET_KEYS.OPENAI_FALLBACK',
            'writeSecret,',
            'deleteSecret,',
        ], { contractName: 'fallback key control wiring' });
        expect(openaiSource).not.toMatch(/oai_settings\.[a-zA-Z0-9_]*key/i);
    });
});
