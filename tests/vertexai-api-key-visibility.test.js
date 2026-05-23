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

function getApiKeySectionMarkup(indexSource) {
    const match = indexSource.match(/<div id="api_key_section">([\s\S]*?)<\/div>\s*<\/div>/);
    expect(match).not.toBeNull();
    return match[0];
}

describe('Vertex AI API key setup', () => {
    test('Vertex Express keeps the unified API key input visible', () => {
        const styleSource = read('public/style.css');
        const indexSource = read('public/index.html');
        const apiKeySection = getApiKeySectionMarkup(indexSource);

        expect(apiKeySection).toContain('id="api_key_unified"');
        expect(styleSource).not.toMatch(/body\.vertexai-active\s+#api_key_section\s*\{[^}]*display\s*:\s*none\b/i);
    });
});
