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
});
