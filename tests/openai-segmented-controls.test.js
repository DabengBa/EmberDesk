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
    test('segmented controls read the service snapshot and write through it', () => {
        const panel = read('app/components/ai-config/AiConfigPanel.tsx');
        const source = read('public/scripts/openai.js');
        expect(panel).toContain('useSyncExternalStore(presetService.subscribe');
        expect(panel).toContain("radio('reasoning_effort', 'high')");
        expect(panel).toContain("radio('verbosity', 'high')");
        expect(source).not.toContain("$(document).on('change', '.segmented-control");
        expect(source).toContain('refreshOpenAIPresetService();');
    });

    test('reasoning effort falls back to high for invalid or unselectable values', () => {
        const source = read('public/scripts/openai.js');

        expect(source).toContain('function normalizeReasoningEffort(value)');
        expect(source).toContain('case reasoning_effort_types.min:');
        expect(source).toContain('case reasoning_effort_types.max:');
        expect(source).toContain('return reasoning_effort_types.high;');
        expect(source).toContain('settings.reasoning_effort = normalizeReasoningEffort(settings.reasoning_effort);');
        expect(source).not.toContain('oai_settings.reasoning_effort = normalizeReasoningEffort($(this).val());');
    });
});
