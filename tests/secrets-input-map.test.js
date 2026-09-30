import { describe, expect, test } from '@jest/globals';

import {
    expectContainsMarkers,
    expectNotContainsMarkers,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

describe('secrets input map', () => {
    test('retired fallback secret is removed from both secret maps', () => {
        const frontendSecrets = readRepoFile('public/scripts/secrets.js');
        const backendSecrets = readRepoFile('src/endpoints/secrets.js');

        expectNotContainsMarkers(frontendSecrets, [
            'OPENAI_FALLBACK',
            'api_key_openai_fallback',
            'fallback_provider_api_key',
        ], { contractName: 'fallback frontend secret mapping' });
        expectNotContainsMarkers(backendSecrets, [
            'OPENAI_FALLBACK',
            'api_key_openai_fallback',
        ], { contractName: 'fallback backend secret mapping' });
        expect(readRepoFile('app/components/api/ApiConnectionsPanel.tsx')).not.toContain('id="fallback_provider_api_key"');
    });

    test('the retired fallback secret is lazily cleaned up at boot', () => {
        const openaiSource = readRepoFile('public/scripts/openai.js');

        expectContainsMarkers(openaiSource, [
            'secret_state.api_key_openai_fallback',
            "deleteSecret('api_key_openai_fallback')",
        ], { contractName: 'retired fallback secret cleanup' });
        expect(openaiSource).not.toMatch(/oai_settings\.[a-zA-Z0-9_]*key/i);
    });

    test('unified provider key keeps saved state and key history reachable', () => {
        const apiPanel = readRepoFile('app/components/api/ApiConnectionsPanel.tsx');
        const openaiSource = readRepoFile('public/scripts/openai.js');

        expectContainsMarkers(apiPanel, [
            'id="api_key_unified_manage"',
            'className="menu_button menu_button_icon manage-api-keys"',
            'label="Manage API keys"',
            'title="Manage API keys"',
        ], { contractName: 'unified provider key manager entry' });
        expectContainsMarkers(openaiSource, [
            'resolveProviderSecretKeyForSettings({',
            '.toggle(Boolean(secretKey))',
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
