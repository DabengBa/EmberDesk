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
    });

    test('the retired fallback secret is lazily cleaned up at boot', () => {
        const openaiSource = readRepoFile('public/scripts/openai.js');

        expectContainsMarkers(openaiSource, [
            'secret_state.api_key_openai_fallback',
            "deleteSecret('api_key_openai_fallback')",
        ], { contractName: 'retired fallback secret cleanup' });
        expect(openaiSource).not.toMatch(/oai_settings\.[a-zA-Z0-9_]*key/i);
    });

    test('legacy drawer secret inputs are retired; the React Providers tab owns the key field', () => {
        const frontendSecrets = readRepoFile('public/scripts/secrets.js');
        const settingsSurface = readRepoFile('app/components/settings/SettingsSurface.tsx');
        const indexHtml = readRepoFile('public/index.html');

        // The drawer INPUT_MAP, its key-manager popup entry point, and the
        // datalist autosuggest plumbing were removed with the drawer.
        expectNotContainsMarkers(frontendSecrets, [
            'INPUT_MAP',
            'updateSecretDisplay',
            'updateInputDataLists',
            'openKeyManagerDialog',
            'manage-api-keys',
            'secrets_datalists',
        ], { contractName: 'retired drawer secret plumbing' });
        expect(indexHtml).not.toContain('secrets_datalists');

        // React Providers owns the single provider key input and writes through
        // the secrets API directly — never into settings JSON.
        expectContainsMarkers(settingsSurface, [
            'provider-secret-input',
            "fetch('/api/secrets/write'",
        ], { contractName: 'React provider secret field' });
    });
});
