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

async function importFreshCore() {
    return import(`../public/scripts/reply-pipeline-core.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('pipeline request shaping shared by live send and preview', () => {
    test('applyStepRequestOverrides pins tool_choice only in forced mode with tools present', async () => {
        const { applyStepRequestOverrides } = await importFreshCore();

        const forced = { messages: [], tools: [{ type: 'function' }] };
        applyStepRequestOverrides(forced, { tool: 'analyze' }, { enforceMode: 'forced' });
        expect(forced.tool_choice).toEqual({ type: 'function', function: { name: 'submit_story' } });

        const soft = { messages: [], tools: [{ type: 'function' }] };
        applyStepRequestOverrides(soft, { tool: 'analyze' }, { enforceMode: 'soft' });
        expect(soft.tool_choice).toBeUndefined();

        const noTools = { messages: [] };
        applyStepRequestOverrides(noTools, { tool: 'analyze' }, { enforceMode: 'forced' });
        expect(noTools.tool_choice).toBeUndefined();
    });

    test('applyStepRequestOverrides applies per-step token cap and reasoning effort', async () => {
        const { applyStepRequestOverrides } = await importFreshCore();

        const data = { messages: [], max_tokens: 4000 };
        applyStepRequestOverrides(data, { tool: 'analyze', maxTokens: 1200, reasoningEffort: 'high' }, { reasoningEffort: 'high' });
        expect(data.max_tokens).toBe(1200);
        expect(data.reasoning_effort).toBe('high');

        // Reasoning 'auto' resolves to undefined and drops out like the live path.
        const auto = { messages: [], reasoning_effort: 'medium' };
        applyStepRequestOverrides(auto, { tool: 'analyze', reasoningEffort: 'auto' }, { reasoningEffort: undefined });
        expect('reasoning_effort' in auto).toBe(true);
        expect(auto.reasoning_effort).toBeUndefined();
    });

    test('applyFallbackRequestShape strips tool wiring and appends the closing prompt', async () => {
        const { applyFallbackRequestShape } = await importFreshCore();

        const data = {
            messages: [],
            tools: [{ type: 'function' }],
            tool_choice: { type: 'function', function: { name: 'analyze' } },
        };
        applyFallbackRequestShape(data, 'close it out');
        expect(data.tools).toEqual([{ type: 'function' }]);
        expect(data.tool_choice).toBe('none');
        expect(data.messages).toEqual([{ role: 'system', content: 'close it out' }]);
    });
});

describe('prompt inspector wiring (structure)', () => {
    test('live attempts and preview resolve model before request assembly', () => {
        const service = read('public/scripts/generation-service.js');
        const openai = read('public/scripts/openai.js');
        expect(service).toContain('resolvePipelineModel(');
        expect(service).toContain('resolvePreviewPipelineModel(');
        expect(service).toContain('previewModel: resolvePreviewPipelineModel');
        expect(service).toContain('liveModel: resolvePipelineModel');
        expect(service).toContain('isOpenAIStreaming: (model, generationType) => isChatCompletionStreaming(shell().state.oai_settings, model, generationType)');
        expect(service).toContain('getGenerationLifecycleService().runGenerationDispatch({');
        expect(read('app/lib/generation/attempt-executor.ts')).toContain('runTransportAttempt({');
        expect(openai).toContain('model: requestedModel');
    });
    test('attempt model is used for message provenance and not attributed to pipeline progress cards', () => {
        const service = read('public/scripts/generation-service.js');
        const script = read('public/script.js');
        const tools = read('public/scripts/tool-calling.js');
        expect(service).toContain('setAttemptModel: model => { shell().state.generatingAttemptModel = model; }');
        expect(service).toContain('getGenerationLifecycleService().runGenerationDispatch({');
        expect(read('app/lib/generation/attempt-executor.ts')).toContain('runTransportAttempt({');
        expect(script).toContain('generatingAttemptModel ?? getChatCompletionModel()');
        expect(tools).toContain('model: pipelineMeta ? null : getGeneratingModel()');
    });
    test('non-chat-completion streaming keeps the existing consumer decision', () => {
        const service = read('public/scripts/generation-service.js');
        expect(service).toContain('isStreaming: isStreamingEnabled');
        expect(service).toContain('getGenerationLifecycleService().runGenerationDispatch({');
        const typed = read('app/lib/generation/attempt-executor.ts');
        expect(typed).toContain('ports.isStreaming() && input.type !== \'quiet\'');
    });
    test('preview validates provider tool metadata against its resolved step model', () => {
        const service = read('public/scripts/generation-service.js');
        expect(read('app/lib/generation/attempt-executor.ts')).toContain('pipeline && !pipeline.fallback && !ports.canUseTools(requestBody.model)');
        expect(service).toContain('canUseTools: model => shell().state.ToolManager.canPerformToolCalls(type, shell().state.oai_settings, model)');
    });
    test('keeps prompt inspector controls discoverable by accessible name', () => {
        const inspector = read('app/components/prompt-panel/PromptInspector.tsx');
        const panel = read('app/components/prompt-panel/PromptPanel.tsx');
        expect(inspector).toContain('aria-label={translate(\'Close\')}');
        expect(panel).toMatch(/<textarea\s+className="text_pole prompt-content-modal-textarea"[\s\S]*?aria-label=\{translate\('Edit \$\{0\} content'\)\.replace\('\$\{0\}', state\.promptsById\[contentPopup\.id\]\?\.name \?\? contentPopup\.id\)\}/);
    });

    test('sendOpenAIRequest delegates request building and emits SETTINGS_READY itself', () => {
        const openai = read('public/scripts/openai.js');
        expect(openai).toContain('export async function buildChatCompletionRequest');
        expect(openai).toContain('emitSettingsReady: true');
        expect(openai).toMatch(/buildChatCompletionRequest[\s\S]*?CHAT_COMPLETION_SETTINGS_READY/);
        // The send path must not emit the event a second time.
        const sendFn = openai.slice(openai.indexOf('async function sendOpenAIRequest'));
        expect(sendFn.split('CHAT_COMPLETION_SETTINGS_READY')).toHaveLength(1);
    });

    test('prepareOpenAIMessages supports squash/bookkeep overrides and returns the completion', () => {
        const openai = read('public/scripts/openai.js');
        expect(openai).toContain('{ squash = null, bookkeep = true } = {}');
        expect(openai).toContain('if (bookkeep) {\n        openai_messages_count');
        expect(openai).toContain('if (bookkeep) {\n            promptManager.setChatCompletion(chatCompletion);');
        expect(openai).toContain('chatCompletion.error = error');
    });

    test('ChatCompletion exposes entries + dropped entries for the inspector', () => {
        const openai = read('public/scripts/openai.js');
        expect(openai).toContain('getChatEntries()');
        expect(openai).toContain('setDroppedEntries(entries)');
        expect(openai).toContain('getDroppedEntries()');
        // Wire format unchanged: getChat still returns plain messages. Turn
        // summaries keep their own identifiers (single + grouped variants).
        expect(openai).toContain('`chatHistory-${messages.length - index}`');
        expect(openai).toContain('`chatSummary-turn-');
        expect(openai).toContain('`chatSummary-turns-');
    });

    test('preview mode assembles the pending message without writing chat state', () => {
        const service = read('public/scripts/generation-service.js');
        expect(service).toContain('preview = null');
        const typed = read('app/lib/generation/attempt-executor.ts');
        expect(service).toContain('getGenerationLifecycleService().prepareOwnedGeneration({');
        expect(typed).toContain('const entry = createRequestEntry(input, ports.entry)');
        expect(typed).toContain('const isPreview = Boolean(input.preview && typeof input.preview === \'object\')');
        expect(typed).toContain('const userInput = await assembleUserInput({');
        expect(service).toContain('buildUser: (text, bias) => buildUserMessage(text, bias)');
        expect(service).toContain('const previewPendingMessage = prepared.pending');
        expect(typed).toContain('pending = await ports.buildUser(text, bias)');
        expect(service).toContain('emitSettingsReady: false');
        expect(service).toContain('shape: (body, index) => previewPipelineRequestShaping(body, { round: index })');
        // Preview must return before sendGenerationRequest runs.
        expect(typed).toContain('if (input.preview) return { kind: \'terminal\', value: await ports.preview(data, completion, summarized) }');
        expect(service).toContain('preview: (data, chatCompletion, summarized) => buildPreviewRequestResult({');
        const previewBlock = typed.indexOf('if (assembly.stages.kind === \'terminal\') return assembly.stages.value;');
        const sendCall = typed.indexOf('return ports.dispatch(prepared.state, assembly);', previewBlock);
        expect(previewBlock).toBeGreaterThan(-1);
        expect(sendCall).toBeGreaterThan(previewBlock);
    });

    test('preview disables prompt bookkeeping and forces squashing', () => {
        const service = read('public/scripts/generation-service.js');
        const typed = read('app/lib/generation/attempt-executor.ts');
        expect(service).toContain('getGenerationLifecycleService().assemblePromptContent({');
        expect(typed).toContain('assembleOpenAI: messages => assembleOpenAIRequest({');
        expect(service).toContain('round: Number(preview?.round ?? 0)');
        expect(service).toContain('previewTag: getPreviewPipelineTriggerTag');
        expect(service).toContain('prepare: prepareOpenAIMessages');
        expect(typed).toContain('{ squash: isPreview ? true : null, bookkeep: !isPreview }');
        expect(typed).toContain('pipelineStepTag: isPreview ? ports.previewTag(round) : ports.liveTag(type)');
    });

    test('preview never emits CHAT_COMPLETION_SETTINGS_READY', () => {
        const service = read('public/scripts/generation-service.js');
        // SETTINGS_READY listeners (TempResponseLength, live pipeline shaping)
        // mutate settings — the preview builds the body with emitSettingsReady: false.
        expect(service).not.toContain('event_types.CHAT_COMPLETION_SETTINGS_READY');
        expect(service).not.toContain('eventSource.emit(event_types.CHAT_COMPLETION_SETTINGS_READY');
    });

    test('preview prompt writes use the typed request-local map without a global snapshot', () => {
        const service = read('public/scripts/generation-service.js');
        const typed = read('app/lib/generation/attempt-executor.ts');
        expect(service).toContain('getGenerationLifecycleService().prepareOwnedGeneration({');
        expect(typed).toContain('createPromptContext({ ...ports.promptContext, isolated: entry.isPreview })');
        expect(service).toContain('promptContext.requestPrompts()');
        expect(service).not.toContain('preview.promptScope.mutate(work)');
        expect(typed).toContain('if (!isolatedPrompts) isolatedPrompts = snapshotPrompts()');
    });

    test('sendMessageAsUser delegates message construction to buildUserMessage', () => {
        const script = read('public/script.js');
        expect(script).toContain('export async function buildUserMessage(');
        const sendFn = script.slice(script.indexOf('export async function sendMessageAsUser'));
        expect(sendFn).toContain('await buildUserMessage(messageText, messageBias, { compact, name })');
        expect(sendFn).toContain('await populateFileAttachment(message, \'file_form_input\', { isCurrent })');
        // Regex + macro semantics live in the shared builder only.
        const buildFn = script.slice(script.indexOf('export async function buildUserMessage'));
        expect(buildFn).toContain('getRegexedString(messageText, regex_placement.USER_INPUT)');
        expect(buildFn).toContain('substituteParams(messageText)');
    });

    test('pipeline preview shaping never touches runState', () => {
        const pipeline = read('public/scripts/reply-pipeline.js');
        const previewFn = pipeline.slice(
            pipeline.indexOf('export function previewPipelineRequestShaping'),
            pipeline.indexOf('export function initReplyPipeline'),
        );
        expect(previewFn).not.toContain('runState');
        expect(previewFn).toContain('getRunnablePipeline()');
        expect(previewFn).toContain('buildStepPrompt(');
        expect(previewFn).toContain('applyStepRequestOverrides(');
        expect(previewFn).toContain('applyFallbackRequestShape(');
        // Live shaping still routes through the shared core helpers.
        const liveFn = pipeline.slice(
            pipeline.indexOf('export function applyPipelineRequestShaping'),
            pipeline.indexOf('function resolveStepReasoningEffort'),
        );
        expect(liveFn).toContain('applyStepRequestOverrides(');
    });

    test('shell context exposes the shared builders', () => {
        const script = read('public/script.js');
        expect(script).toContain('buildUserMessage: (...args) => buildUserMessage(...args)');
        expect(script).toContain('buildChatCompletionRequest: (...args) => buildChatCompletionRequest(...args)');
    });

    test('prompt drawer header exposes the inspector entry point', () => {
        const panels = read('app/workspace-panels.tsx');
        expect(panels).toContain('mountPromptInspector');
        expect(panels).toContain('unmountPromptInspector');
        expect(panels).toContain('<PromptInspectorButton bridge={bridge} />');
        expect(panels).toContain('<PromptInspector bridge={bridge} />');

        const script = read('public/script.js');
        expect(script).toContain('__emberDeskPromptInspectorBridge');
        expect(script).toContain('promptInspectorController.open()');
        expect(script).toContain('previewNextGenerationRequest({ round })');
    });
});
