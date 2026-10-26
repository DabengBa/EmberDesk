import { expect, jest, test } from '@jest/globals';

const worldInfo = jest.fn(() => { throw new Error('WI must not be re-evaluated'); });
const attempts = jest.fn(async () => undefined);
jest.unstable_mockModule('../public/scripts/world-info-service.js', () => ({ getWorldInfoPrompt: worldInfo }));
jest.unstable_mockModule('../public/scripts/main-chat-composer-service.js', () => ({ getComposerValue: jest.fn(), clearComposerValue: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-memory-service.js', () => ({ applyChatMemoryToCoreChat: jest.fn() }));
jest.unstable_mockModule('../public/scripts/chat-generation-command-service.js', () => ({
    executeGenerationAttempts: attempts, createGenerationCommandPlan: () => ({ attempts: [] }), createGenerationRequestEnvelope: jest.fn(),
}));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings[0] }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: { reply_pipeline: { enabled: true, steps: [{ tool: 'analyze' }] } } }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: { tool_bindings: [{ name: 'analyze', enabled: true }] } }));
jest.unstable_mockModule('../public/scripts/tool-bindings.js', () => ({ syncPipelineToolBindings: jest.fn() }));
const { registerGenerationShellContext } = await import('../public/scripts/generation-shell-context.js');
const { getPipelineRunState } = await import('../public/scripts/reply-pipeline-core.js');
const runtime = await import('../public/scripts/reply-pipeline.js');
const { executeGenerationRequestInShell } = await import('../public/scripts/generation-service.js');
globalThis.localStorage = { getItem: () => null };

function setup() {
    runtime.endPipelineRun(); runtime.beginPipelineRun();
    const run = getPipelineRunState();
    run.messages = [{ role: 'user', content: 'once-captured base' }];
    const base = jest.fn(() => { throw new Error('base assembly must not run'); });
    const prepare = jest.fn(async () => [structuredClone(run.messages)]);
    const context = { state: {
        main_api: 'openai', online_status: 'connected', characters: [], chat: [], chat_metadata: {},
        PromptReasoning: class {},
        ToolManager: { canPerformToolCalls: () => true, RECURSE_LIMIT: 10 }, oai_settings: { send_if_empty: '' },
    }, getBiasStrings: () => ({ messageBias: '', promptBias: '' }), pingServer: async () => true,
    getCharacterCardFields: base, substituteParams: base, prepareOpenAIMessages: prepare };
    registerGenerationShellContext(new Proxy(context, { get: (obj, key) => obj[key] ?? jest.fn() }));
    return { base, prepare, context };
}

test('existing owner continuation bypasses every base WI/macro/card assembly entry', async () => {
    const { base, prepare } = setup();
    await executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(base).not.toHaveBeenCalled();
    expect(worldInfo).not.toHaveBeenCalled();
});

test.each(['Reply pipeline: invalid tool batch', 'Generation was aborted.'])('existing owner cleans up failed/aborted run: %s', async message => {
    const { context } = setup();
    context.unblockGeneration = jest.fn();
    globalThis.toastr = { error: jest.fn() };
    attempts.mockRejectedValueOnce(new Error(message));
    await expect(executeGenerationRequestInShell({ type: 'normal', options: { depth: 1 }, dryRun: false, command: {} })).rejects.toThrow(message);
    expect(getPipelineRunState()).toBeNull();
    expect(context.state.streamingProcessor).toBeNull();
    expect(context.unblockGeneration).toHaveBeenCalled();
    if (message.startsWith('Reply pipeline:')) expect(globalThis.toastr.error).toHaveBeenCalled();
});
