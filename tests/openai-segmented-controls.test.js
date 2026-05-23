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

describe('OpenAI segmented controls', () => {
    test('startup settings can sync segmented controls before initOpenAI binds events', () => {
        const source = read('public/scripts/openai.js');
        const helperIndex = source.indexOf('function syncSegmentedFromSelect');
        const loadSettingsIndex = source.indexOf('function loadOpenAISettings');

        expect(helperIndex).toBeGreaterThan(-1);
        expect(loadSettingsIndex).toBeGreaterThan(-1);
        expect(helperIndex).toBeLessThan(loadSettingsIndex);
    });

    test('reasoning effort falls back to high for invalid or unselectable values', () => {
        const source = read('public/scripts/openai.js');

        expect(source).toContain('function normalizeReasoningEffort(value)');
        expect(source).toContain('case reasoning_effort_types.min:');
        expect(source).toContain('case reasoning_effort_types.max:');
        expect(source).toContain('return reasoning_effort_types.high;');
        expect(source).toContain('settings.reasoning_effort = normalizeReasoningEffort(settings.reasoning_effort);');
        expect(source).toContain('oai_settings.reasoning_effort = normalizeReasoningEffort($(this).val());');
    });
});
