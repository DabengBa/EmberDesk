import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('secrets input map', () => {
    test('Workers AI uses the key manager instead of a missing autocomplete input', () => {
        const secretsSource = read('public/scripts/secrets.js');
        const stableDiffusionSettings = read('public/scripts/extensions/stable-diffusion/settings.html');

        expect(stableDiffusionSettings).toContain('data-key="api_key_workers_ai"');
        expect(secretsSource).not.toMatch(/\[SECRET_KEYS\.WORKERS_AI\]: '#api_key_workers_ai'/);
    });

    test('fallback OpenAI provider has a dedicated secret and input mapping', () => {
        const frontendSecrets = read('public/scripts/secrets.js');
        const backendSecrets = read('src/endpoints/secrets.js');

        expect(frontendSecrets).toContain("OPENAI_FALLBACK: 'api_key_openai_fallback'");
        expect(backendSecrets).toContain("OPENAI_FALLBACK: 'api_key_openai_fallback'");
        expect(frontendSecrets).toContain("[SECRET_KEYS.OPENAI_FALLBACK]: 'Fallback OpenAI-compatible'");
        expect(frontendSecrets).toContain("[SECRET_KEYS.OPENAI_FALLBACK]: '#api_key_openai_fallback'");
        expect(frontendSecrets).not.toContain("[SECRET_KEYS.OPENAI_FALLBACK]: '#api_key_openai'");
    });

    test('fallback key controls write and clear only the dedicated fallback secret', () => {
        const openaiSource = read('public/scripts/openai.js');

        expect(openaiSource).toContain("$('#fallback_provider_save_key').on('click', onFallbackProviderSaveKeyClick);");
        expect(openaiSource).toContain("$('#fallback_provider_clear_key').on('click', onFallbackProviderClearKeyClick);");
        expect(openaiSource).toContain('writeSecret(SECRET_KEYS.OPENAI_FALLBACK, value);');
        expect(openaiSource).toContain('deleteSecret(SECRET_KEYS.OPENAI_FALLBACK);');
        expect(openaiSource).not.toMatch(/oai_settings\.[a-zA-Z0-9_]*key/i);
    });
});
