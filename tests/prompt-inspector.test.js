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
        expect(forced.tool_choice).toEqual({ type: 'function', function: { name: 'analyze' } });

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
        expect(data.tools).toBeUndefined();
        expect(data.tool_choice).toBeUndefined();
        expect(data.messages).toEqual([{ role: 'system', content: 'close it out' }]);
    });
});

describe('prompt inspector wiring (structure)', () => {
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
        // Wire format unchanged: getChat still returns plain messages.
        expect(openai).toContain('prompt.identifier = `chatHistory-${messages.length - index}`');
    });

    test('preview mode assembles the pending message without writing chat state', () => {
        const service = read('public/scripts/generation-service.js');
        expect(service).toContain('preview = null');
        expect(service).toContain('const isPreview = Boolean(preview');
        expect(service).toContain('previewPendingMessage = await buildUserMessage(');
        expect(service).toContain('emitSettingsReady: false');
        expect(service).toContain('previewPipelineRequestShaping(requestBody');
        // Preview must return before sendGenerationRequest runs.
        const previewBlock = service.indexOf('if (isPreview) {\n        return await buildPreviewRequestResult');
        const sendCall = service.indexOf('await sendGenerationRequest(');
        expect(previewBlock).toBeGreaterThan(-1);
        expect(sendCall).toBeGreaterThan(previewBlock);
    });

    test('preview disables prompt bookkeeping and forces squashing', () => {
        const service = read('public/scripts/generation-service.js');
        expect(service).toContain('squash: isPreview ? true : null, bookkeep: !isPreview');
        expect(service).toContain('getPreviewPipelineTriggerTag(Number(preview?.round ?? 0))');
    });

    test('preview never emits CHAT_COMPLETION_SETTINGS_READY', () => {
        const service = read('public/scripts/generation-service.js');
        // SETTINGS_READY listeners (TempResponseLength, live pipeline shaping)
        // mutate settings — the preview builds the body with emitSettingsReady: false.
        expect(service).not.toContain('event_types.CHAT_COMPLETION_SETTINGS_READY');
        expect(service).not.toContain('eventSource.emit(event_types.CHAT_COMPLETION_SETTINGS_READY');
    });

    test('extension_prompts are snapshotted and restored around a preview', () => {
        const service = read('public/scripts/generation-service.js');
        expect(service).toContain('const extensionPromptSnapshot = { ...(state.extension_prompts ?? {}) };');
        expect(service).toContain('delete state.extension_prompts[key]');
    });

    test('sendMessageAsUser delegates message construction to buildUserMessage', () => {
        const script = read('public/script.js');
        expect(script).toContain('export async function buildUserMessage(');
        const sendFn = script.slice(script.indexOf('export async function sendMessageAsUser'));
        expect(sendFn).toContain('await buildUserMessage(messageText, messageBias, { compact, name })');
        expect(sendFn).toContain('await populateFileAttachment(message)');
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
        expect(script).toContain('openPromptInspector()');
        expect(script).toContain('previewNextGenerationRequest({ round })');
    });
});
