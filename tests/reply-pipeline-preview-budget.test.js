import fs from 'node:fs';
import { expect, jest, test } from '@jest/globals';

// Same minimally-boundary mock set as the other generation-service tests: the
// module under test is the real one, only the shell/provider edges are stubbed.
globalThis.localStorage = { getItem: () => null };
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: jest.fn() }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ getComposerValue: jest.fn(), clearComposerValue: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }] } } }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const { derivePreviewBudget } = await import('../public/scripts/generation-service.js');
const serviceSource = fs.readFileSync(new URL('../public/scripts/generation-service.js', import.meta.url), 'utf8');

/**
 * The slice of ChatCompletion the preview reads: base assembly consumed
 * `baseTokens`, then step materials consumed `stepTokens`.
 */
function completionWithStepMaterials(baseTokens, stepTokens, { context = 5000, response = 100 } = {}) {
    return {
        tokenBudget: context - response - baseTokens - stepTokens,
        getTotalTokenCount: () => stepTokens,
        error: undefined,
    };
}

test('preview budget follows the appended step materials', () => {
    // Short material: the budget shrinks by exactly its own tokens.
    const short = completionWithStepMaterials(1, 2);
    const shortPreview = derivePreviewBudget({ chatCompletion: short, contextTokens: 5000, responseTokens: 100 });
    expect(shortPreview.warning).toBeNull();
    expect(shortPreview.budget).toEqual({ context: 5000, response: 100, remaining: 4897, used: 3, totalTokens: 2 });

    // Same base, long material: the remaining budget goes negative, and the
    // difference is the material itself — not a stale constant.
    const long = completionWithStepMaterials(1, 6001);
    const longPreview = derivePreviewBudget({ chatCompletion: long, contextTokens: 5000, responseTokens: 100 });
    expect(longPreview.budget.remaining).toBe(4900 - 1 - 6001);
    expect(longPreview.budget.totalTokens).toBe(6001);
    expect(longPreview.budget.used).toBe(6002);
    expect(longPreview.warning).toBe('budget-exceeded');
});

test('assembly failures keep their own warning and unassembled previews have no budget', () => {
    const budgetError = completionWithStepMaterials(1, 1);
    budgetError.error = Object.assign(new Error('budget'), { name: 'TokenBudgetExceeded' });
    expect(derivePreviewBudget({ chatCompletion: budgetError, contextTokens: 5000, responseTokens: 100 }).warning).toBe('budget-exceeded');

    const otherError = completionWithStepMaterials(1, 1);
    otherError.error = Object.assign(new Error('boom'), { name: 'IdentifierNotFoundError' });
    expect(derivePreviewBudget({ chatCompletion: otherError, contextTokens: 5000, responseTokens: 100 }).warning).toBe('assembly-error');

    expect(derivePreviewBudget({ chatCompletion: null, contextTokens: 5000, responseTokens: 100 })).toEqual({ budget: null, warning: null });
});

test('the preview result is built from that budget so the inspector sees the overflow', () => {
    const start = serviceSource.indexOf('const previewBudget = derivePreviewBudget(');
    const end = serviceSource.indexOf('warnings = [...warnings, previewBudget.warning];', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = `${serviceSource.slice(start, end)}warnings = [...warnings, previewBudget.warning];\n}`;
    const runPreviewResult = new Function('derivePreviewBudget', 'chatCompletion', 'contextTokens', 'responseTokens', 'warnings',
        `${slice}\nreturn { budget, warnings };`);
    // Overflow only exists as a negative remainder: the step materials are
    // appended after assembly, so the completion carries no error of its own.
    const chatCompletion = { tokenBudget: 4900 - 1 - 6001, getTotalTokenCount: () => 6001, error: undefined };
    const { budget, warnings } = runPreviewResult(derivePreviewBudget, chatCompletion, 5000, 100, []);
    expect(budget).toEqual({ context: 5000, response: 100, remaining: -1102, used: 6002, totalTokens: 6001 });
    expect(warnings).toEqual(['budget-exceeded']);
    // A fitting request stays quiet, and an assembly failure keeps its own label.
    expect(runPreviewResult(derivePreviewBudget, completionWithStepMaterials(1, 2), 5000, 100, []).warnings).toEqual([]);
    const failed = completionWithStepMaterials(1, 2);
    failed.error = Object.assign(new Error('boom'), { name: 'IdentifierNotFoundError' });
    expect(runPreviewResult(derivePreviewBudget, failed, 5000, 100, []).warnings).toEqual(['assembly-error']);
});
