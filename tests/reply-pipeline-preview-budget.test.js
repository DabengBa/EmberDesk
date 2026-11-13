import { expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

// Same minimally-boundary mock set as the other generation-service tests: the
// module under test is the real one, only the shell/provider edges are stubbed.
globalThis.localStorage = { getItem: () => null };
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: jest.fn() }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ getComposerValue: jest.fn(), getComposerSnapshot: jest.fn(() => ({ value: '', contextKey: null, revision: 0 })), clearComposerValue: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }] } } }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const { derivePreviewBudget } = await import('../public/scripts/generation-service.js');
const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');

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

test('the synchronous preview budget facade is the installed typed lifecycle policy', async () => {
    const { createGenerationLifecycleService: createBrowserLifecycle } = await import('../public/scripts/generation-typed-runtime.js');
    const lifecycle = createBrowserLifecycle(() => ({ chatId: 'chat', contextRevision: 0 }));
    expect(lifecycle.derivePreviewBudget).toBe(derivePreviewBudget);
});

test('the typed preview result includes the real budget and warning for the inspector', async () => {
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 0 }));
    const runPreviewResult = chatCompletion => lifecycle.buildPreviewResult({
        type: 'normal', isOpenAI: true, data: { prompt: [] }, round: 0, warnings: [],
        pending: null, pendingIdentifier: null, summarized: [], completion: chatCompletion,
    }, {
        ownsRun: () => true, previewModel: () => 'model',
        build: async () => ({ generate_data: {}, stream: false }), shape: () => null,
        canUseTools: () => false, responseTokens: () => 100, maxPromptTokens: () => 4900,
        budget: (completion, contextTokens, responseTokens) => derivePreviewBudget({ chatCompletion: completion, contextTokens, responseTokens }),
    });
    // Overflow only exists as a negative remainder: the step materials are
    // appended after assembly, so the completion carries no error of its own.
    const chatCompletion = { tokenBudget: 4900 - 1 - 6001, getTotalTokenCount: () => 6001, error: undefined };
    const { budget, warnings } = await runPreviewResult(chatCompletion);
    expect(budget).toEqual({ context: 5000, response: 100, remaining: -1102, used: 6002, totalTokens: 6001 });
    expect(warnings).toEqual(['budget-exceeded']);
    // A fitting request stays quiet, and an assembly failure keeps its own label.
    expect((await runPreviewResult(completionWithStepMaterials(1, 2))).warnings).toEqual([]);
    const failed = completionWithStepMaterials(1, 2);
    failed.error = Object.assign(new Error('boom'), { name: 'IdentifierNotFoundError' });
    expect((await runPreviewResult(failed)).warnings).toEqual(['assembly-error']);
});
