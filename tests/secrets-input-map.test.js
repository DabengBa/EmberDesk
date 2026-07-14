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
            'OPENAI_FALLBACK: \'api_key_openai_fallback\'',
            '[SECRET_KEYS.OPENAI_FALLBACK]: \'Fallback OpenAI-compatible\'',
            '[SECRET_KEYS.OPENAI_FALLBACK]: \'#fallback_provider_api_key\'',
        ], { contractName: 'fallback frontend secret mapping' });
        expectContainsMarkers(backendSecrets, [
            'OPENAI_FALLBACK: \'api_key_openai_fallback\'',
        ], { contractName: 'fallback backend secret mapping' });
        expectNotContainsMarkers(frontendSecrets, [
            '[SECRET_KEYS.OPENAI_FALLBACK]: \'#api_key_openai\'',
        ], { contractName: 'fallback frontend secret mapping' });
        expect(readRepoFile('public/index.html')).toContain('id="fallback_provider_api_key"');
    });

    test('fallback key controls write and clear only the dedicated fallback secret', () => {
        const openaiSource = readRepoFile('public/scripts/openai.js');

        expectContainsMarkers(openaiSource, [
            '$(\'#fallback_provider_save_key\').on(\'click\', onFallbackProviderSaveKeyClick);',
            '$(\'#fallback_provider_clear_key\').on(\'click\', onFallbackProviderClearKeyClick);',
            'saveProviderSecretField({',
            'clearProviderSecretField({',
            'key: SECRET_KEYS.OPENAI_FALLBACK',
            'writeSecret,',
            'deleteSecret,',
        ], { contractName: 'fallback key control wiring' });
        expect(openaiSource).not.toMatch(/oai_settings\.[a-zA-Z0-9_]*key/i);
    });

    test('unified provider key keeps saved state and key history reachable', () => {
        const indexHtml = readRepoFile('public/index.html');
        const openaiSource = readRepoFile('public/scripts/openai.js');

        expectContainsMarkers(indexHtml, [
            'id="api_key_unified_manage"',
            'class="menu_button menu_button_icon manage-api-keys"',
            'aria-label="Manage API keys"',
            'data-i18n="[title][aria-label]Manage API keys"',
        ], { contractName: 'unified provider key manager entry' });
        expectContainsMarkers(openaiSource, [
            'resolveProviderSecretKeyForSettings({',
            'canUseDirectProviderSecret({ settings: oai_settings, secretKey })',
            '$(\'#api_key_unified_manage\')',
            '.attr(\'data-key\', secretKey ?? \'\')',
            '.data(\'key\', secretKey ?? \'\')',
            'event_types.SETTINGS_LOADED',
            'event_types.SECRET_WRITTEN',
            'event_types.SECRET_DELETED',
            'event_types.SECRET_ROTATED',
            'event_types.SECRET_EDITED',
            'updateUnifiedKeyField();',
        ], { contractName: 'unified provider key state refresh' });
    });
});
