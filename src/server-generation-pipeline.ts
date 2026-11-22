import { extractFinalStepText, formatPipelineTagMarkup, normalizeReplyPipeline, pipelineModelRemovesTools } from '../public/scripts/reply-pipeline-core.js';
import { DEFAULT_PIPELINE_ACTION, normalizeToolBindings } from '../public/scripts/tool-bindings-core.js';
import { buildGenerationLifecycleAttempts, getFallbackOpenAIModel, isRecoverableGenerationFailure } from '../app/lib/generation/shared-state.ts';
import { assembleServerPipelineTail, assembleServerPrompt, type ServerPromptCommand, type ServerPromptRuntime, type ServerPromptSnapshot } from './server-prompt.ts';
import { record, ServerPromptError } from './server-prompt/snapshot.ts';
import { InvalidModelReply, ModelResponseStatusError, streamServerModel, type ModelToolCall } from './server-generation-model-transport.ts';
import type { ExecuteGeneration, PipelineInvocation } from './server-generation-service.ts';

function pipelineFor(snapshot: ServerPromptSnapshot) {
    const settings = record(snapshot.settings.oai_settings);
    const pipeline = normalizeReplyPipeline(settings.reply_pipeline);
    if (!pipeline.enabled) return null;
    const feature = record(snapshot.settings.feature_settings ?? snapshot.settings.extension_settings);
    const bindings = normalizeToolBindings(feature.tool_bindings);
    const steps = pipeline.steps.flatMap(step => {
        const binding = bindings.find(binding => binding.name === step.tool);
        return binding && (!binding.enabled || binding.stealth) ? [] : [{ ...step,
            actionBody: binding && binding.actionBody !== DEFAULT_PIPELINE_ACTION ? binding.actionBody : undefined }];
    });
    return steps.length ? { ...pipeline, steps } : null;
}

export async function prepareServerGeneration(snapshot: ServerPromptSnapshot, command: ServerPromptCommand, runtime: ServerPromptRuntime) {
    const pipeline = pipelineFor(snapshot);
    const prompt = await assembleServerPrompt(snapshot, command, pipeline ? {
        ...runtime, pipeline: { step: pipeline.steps[0], steps: pipeline.steps, index: 0, total: pipeline.steps.length },
    } : runtime);
    return { prompt, pipeline };
}

const forcedTool = (name: string) => ({ type: 'function', function: { name } });
const reasoningFor = (step: { reasoningEffort?: string | null }) => step.reasoningEffort === 'auto' ? undefined : step.reasoningEffort ?? undefined;

export async function previewServerGeneration(snapshot: ServerPromptSnapshot, command: ServerPromptCommand, runtime: ServerPromptRuntime, requestedRound: number) {
    const { prompt, pipeline } = await prepareServerGeneration(snapshot, command, runtime);
    if (!pipeline || !prompt.pipeline) return prompt;
    const total = pipeline.steps.length;
    const round = Math.min(requestedRound, total);
    const step = pipeline.steps[round];
    const active = round === 0 ? { ...prompt, tools: prompt.pipeline.tools, promptTokens: prompt.budget.promptTokens }
        : await assembleServerPipelineTail(snapshot,
            { ...runtime, pipeline: step ? { step, steps: pipeline.steps, index: round, total, currentInput: prompt.pipeline.currentInput } : { fallback: true, steps: pipeline.steps } },
            prompt.messages, prompt.pipeline.mediaCosts, messageCallIds(prompt.messages), command);
    const rounds = pipeline.steps.map(({ id, tool, display }, index) => ({ index, id, tool, display }));
    const { contextTokens, responseTokens } = active.connection;
    return { messages: active.messages, connection: active.connection, budget: { contextTokens, responseTokens,
        promptTokens: active.promptTokens, omittedHistory: prompt.budget.omittedHistory }, tools: active.tools,
        toolChoice: step ? forcedTool(step.tool) : 'none', maxTokens: step?.maxTokens ?? active.connection.responseTokens,
        reasoningEffort: step ? reasoningFor(step) : undefined,
        previewPipeline: { round, total, fallback: !step, step: step ? rounds[round] : null, rounds } };
}

function messageCallIds(messages: Awaited<ReturnType<typeof assembleServerPrompt>>['messages']) {
    return new Set(messages.flatMap(message => 'tool_calls' in message ? message.tool_calls.map(call => call.id) : []));
}

type ExecutionPorts = Pick<Parameters<ExecuteGeneration<unknown>>[0], 'run' | 'signal' | 'emit' | 'waitForStep' | 'emitInvocation'>;


export function runGenerationRound(input: Parameters<typeof streamServerModel>[0], snapshot: ServerPromptSnapshot, clearDraft: () => void): Promise<string>;
export function runGenerationRound<T>(input: Parameters<typeof streamServerModel>[0], snapshot: ServerPromptSnapshot,
    clearDraft: () => void, validate: (text: string, calls: ModelToolCall[]) => T): Promise<T>;
export async function runGenerationRound<T>(input: Parameters<typeof streamServerModel>[0], snapshot: ServerPromptSnapshot,
    clearDraft: () => void, validate?: (text: string, calls: ModelToolCall[]) => T): Promise<T | string> {
    const configuredFallback = getFallbackOpenAIModel(record(snapshot.settings.oai_settings));
    const fallback = input.tools?.length && pipelineModelRemovesTools({ chat_completion_source: 'openai', model: configuredFallback }) ? '' : configuredFallback;
    const attempts = buildGenerationLifecycleAttempts({ fallbackReady: Boolean(fallback && fallback !== input.model) });
    for (const [index, attempt] of attempts.entries()) {
        input.signal.throwIfAborted();
        const model = attempt.fallbackProvider ? fallback : input.model;
        if (input.tools?.length && pipelineModelRemovesTools({ chat_completion_source: 'openai', model })) {
            throw new ServerPromptError('invalid_config', 'Reply pipeline model does not support tools');
        }
        let streamed = false;
        try {
            let calls: ModelToolCall[] = [];
            const text = await streamServerModel({ ...input, model, emit(text) { streamed = true; input.emit(text); },
                onTools: value => { calls = value; } });
            if (validate) return validate(text, calls);
            if (!text.trim() || calls.length) throw new InvalidModelReply('Expected a non-empty text reply without tool calls');
            return text;
        } catch (error) {
            const recoverable = error instanceof ModelResponseStatusError ? error.status >= 500 || [408, 429].includes(error.status)
                : error instanceof InvalidModelReply || isRecoverableGenerationFailure(error);
            if (input.signal.aborted || index === attempts.length - 1 || !recoverable) throw error;
            if (streamed) clearDraft();
        }
    }
    throw new Error('Missing generation attempts');
}

function requireStepCall(calls: ModelToolCall[], name: string, usedIds: ReadonlySet<string>) {
    const [call] = calls;
    if (calls.length !== 1 || call?.function?.name !== name || !call.id || usedIds.has(call.id)) {
        throw new InvalidModelReply('Expected exactly one matching pipeline tool call');
    }
    let args;
    try { args = record(JSON.parse(call.function.arguments)); }
    catch { throw new InvalidModelReply('Invalid pipeline tool arguments'); }
    if (typeof args.content !== 'string') throw new InvalidModelReply('Invalid pipeline tool content');
    return { call, args, content: args.content };
}

export async function runServerPipeline({ prepared, snapshot, runtime, apiKey, run, signal, emit, waitForStep, emitInvocation }:
    ExecutionPorts & { prepared: Awaited<ReturnType<typeof prepareServerGeneration>>; snapshot: ServerPromptSnapshot;
        runtime: ServerPromptRuntime; apiKey?: string }) {
    const { pipeline, prompt } = prepared;
    if (!pipeline || !prompt.pipeline) throw new Error('Missing pipeline plan');

    const command = { action: run.kind, temporary: run.temporary };
    const transcript: object[] = [...prompt.pipeline.baseMessages];
    const callIds = messageCallIds(prompt.pipeline.baseMessages);
    const invocations: PipelineInvocation[] = [];
    for (const [index, step] of pipeline.steps.entries()) {
        const round = index === 0 ? { connection: prompt.connection, ...prompt.pipeline } : await assembleServerPipelineTail(snapshot,
            { ...runtime, pipeline: { step, steps: pipeline.steps, index, total: pipeline.steps.length, currentInput: prompt.pipeline.currentInput } },
            transcript, prompt.pipeline.mediaCosts, callIds, command);
        transcript.push(...round.tail);
        for (const message of round.tail) {
            if ('tool_calls' in message) for (const call of message.tool_calls) callIds.add(call.id);
        }
        const { raw, call, args, content } = await runGenerationRound({ ...round.connection, messages: transcript, apiKey, signal, emit() {},
            maxTokens: step.maxTokens ?? round.connection.responseTokens, tools: round.tools,
            toolChoice: forcedTool(step.tool), reasoningEffort: reasoningFor(step) }, snapshot, () => {},
        (raw, calls) => ({ raw, ...requireStepCall(calls, step.tool, callIds) }));
        const { id } = call;
        callIds.add(id);
        const result = step.actionBody === undefined ? content : await waitForStep({ name: step.tool, args, actionBody: step.actionBody });
        transcript.push({ role: 'assistant', content: raw || null, tool_calls: [call] },
            { role: 'tool', tool_call_id: id, content: step.actionBody === undefined ? 'OK' : result });
        const invocation = { id, name: 'submit_story', displayName: step.tool, parameters: call.function.arguments, result, error: false,
            pipeline: { runId: run.id, stepId: step.id, stepIndex: index, tool: step.tool, display: step.display } };
        invocations.push(invocation);
        emitInvocation(invocation);
    }
    let reply = extractFinalStepText(invocations.slice(-1), { tool: 'submit_story' }, pipeline.resultField);
    if (!reply) {
        const last = invocations.at(-1)!;
        invocations[invocations.length - 1] = { ...last, pipeline: { ...last.pipeline, display: 'summary' } };
        const { connection, messages, tools } = await assembleServerPipelineTail(snapshot,
            { ...runtime, pipeline: { fallback: true, steps: pipeline.steps } }, transcript, prompt.pipeline.mediaCosts, callIds, command);
        reply = await runGenerationRound({ ...connection, messages,
            maxTokens: connection.responseTokens, apiKey, signal, emit, tools, toolChoice: 'none' }, snapshot, () => emit('', true));
    } else {
        emit(reply);
    }
    if (!reply.trim()) throw new Error('Empty pipeline reply');
    return { text: formatPipelineTagMarkup(invocations, reply), invocations };
}
