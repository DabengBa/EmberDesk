import { extractFinalStepText, formatPipelineTagMarkup, normalizeReplyPipeline, PIPELINE_FALLBACK_PROMPT, pipelineModelRemovesTools } from '../public/scripts/reply-pipeline-core.js';
import { DEFAULT_PIPELINE_ACTION, normalizeToolBindings } from '../public/scripts/tool-bindings-core.js';
import { buildGenerationLifecycleAttempts, getFallbackOpenAIModel, isRecoverableGenerationFailure } from '../app/lib/generation/shared-state.ts';
import { assembleServerPrompt, type ServerPromptCommand, type ServerPromptRuntime, type ServerPromptSnapshot } from './server-prompt.ts';
import { record, ServerPromptError } from './server-prompt/snapshot.ts';
import { streamServerModel, type ModelToolCall } from './server-generation-model-transport.ts';
import type { ExecuteGeneration, PipelineInvocation } from './server-generation-service.ts';

function pipelineFor(snapshot: ServerPromptSnapshot, command: ServerPromptCommand) {
    if (command.action !== 'send') return null;
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
    const pipeline = pipelineFor(snapshot, command);
    const prompt = await assembleServerPrompt(snapshot, command, pipeline ? {
        ...runtime, pipeline: { step: pipeline.steps[0], index: 0, total: pipeline.steps.length },
    } : runtime);
    return { prompt, pipeline };
}

const forcedTool = (name: string) => ({ type: 'function', function: { name } });
const reasoningFor = (step: { reasoningEffort?: string | null }) => step.reasoningEffort === 'auto' ? undefined : step.reasoningEffort ?? undefined;

export async function previewServerGeneration(snapshot: ServerPromptSnapshot, command: ServerPromptCommand, runtime: ServerPromptRuntime, requestedRound: number) {
    const { prompt, pipeline } = await prepareServerGeneration(snapshot, command, runtime);
    if (!pipeline) return prompt;
    const total = pipeline.steps.length;
    const round = Math.min(requestedRound, total);
    const step = pipeline.steps[round];
    const active = round === 0 ? prompt : await assembleServerPrompt(snapshot, command,
        { ...runtime, pipeline: step ? { step, index: round, total } : { fallback: true } });
    const rounds = pipeline.steps.map(({ id, tool, display }, index) => ({ index, id, tool, display }));
    return { ...active, tools: step ? active.pipeline?.tools : prompt.pipeline?.tools,
        toolChoice: step ? forcedTool(step.tool) : 'none', maxTokens: step?.maxTokens ?? active.connection.responseTokens,
        reasoningEffort: step ? reasoningFor(step) : undefined,
        previewPipeline: { round, total, fallback: !step, step: step ? rounds[round] : null, rounds } };
}

type ExecutionPorts = Pick<Parameters<ExecuteGeneration<unknown>>[0], 'run' | 'signal' | 'emit' | 'waitForStep' | 'emitInvocation'>;

async function runPipelineRound(input: Parameters<typeof streamServerModel>[0], fallbackModel: string, clearDraft?: () => void) {
    const attempts = buildGenerationLifecycleAttempts({ fallbackReady: Boolean(fallbackModel) });
    for (const [index, attempt] of attempts.entries()) {
        input.signal.throwIfAborted();
        const model = attempt.fallbackProvider ? fallbackModel : input.model;
        if (input.toolChoice !== 'none' && pipelineModelRemovesTools({ chat_completion_source: 'openai', model })) {
            throw new ServerPromptError('invalid_config', 'Reply pipeline model does not support tools');
        }
        let streamed = false;
        try {
            let calls: ModelToolCall[] = [];
            const text = await streamServerModel({ ...input, model, emit(text) { streamed = true; input.emit(text); },
                onTools: input.toolChoice === 'none' ? undefined : value => { calls = value; } });
            if (text.trim() || calls.length) return { text, calls };
            throw Object.assign(new Error('Empty pipeline reply'), { emptyReply: true });
        } catch (error) {
            if (input.signal.aborted || index === attempts.length - 1 || !isRecoverableGenerationFailure(error)) throw error;
            if (streamed) clearDraft?.();
        }
    }
    throw new Error('Missing pipeline attempts');
}

export async function runServerPipeline({ prepared, snapshot, command, runtime, apiKey, run, signal, emit, waitForStep, emitInvocation }:
    ExecutionPorts & { prepared: Awaited<ReturnType<typeof prepareServerGeneration>>; snapshot: ServerPromptSnapshot;
        command: ServerPromptCommand; runtime: ServerPromptRuntime; apiKey?: string }) {
    const { pipeline, prompt } = prepared;
    if (!pipeline || !prompt.pipeline) throw new Error('Missing pipeline plan');
    const fallbackModel = getFallbackOpenAIModel(record(snapshot.settings.oai_settings));
    const transcript: object[] = [...prompt.pipeline.baseMessages];
    const callIds = new Set<string>();
    const invocations: PipelineInvocation[] = [];
    for (const [index, step] of pipeline.steps.entries()) {
        const round = index === 0 ? prompt : await assembleServerPrompt(snapshot, command,
            { ...runtime, pipeline: { step, index, total: pipeline.steps.length } });
        transcript.push(...round.pipeline!.tail);
        const { text: raw, calls } = await runPipelineRound({ ...round.connection, messages: transcript, apiKey, signal, emit() {},
            maxTokens: step.maxTokens ?? round.connection.responseTokens, tools: round.pipeline!.tools,
            toolChoice: forcedTool(step.tool), reasoningEffort: reasoningFor(step) }, fallbackModel);
        let result = raw;
        let parameters = JSON.stringify({ content: raw });
        let id = `pipeline-text-${run.id}-${index}`;
        if (calls.length) {
            const [call] = calls;
            if (calls.length !== 1 || call.function.name !== step.tool || !call.id || callIds.has(call.id)) throw new Error('Invalid pipeline tool call');
            callIds.add(call.id);
            id = call.id;
            parameters = call.function.arguments;
            const args = record(JSON.parse(parameters));
            if (typeof args.content !== 'string') throw new Error('Invalid pipeline tool content');
            result = step.actionBody === undefined ? args.content : await waitForStep({ name: step.tool, args, actionBody: step.actionBody });
            transcript.push({ role: 'assistant', content: raw || null, tool_calls: calls },
                { role: 'tool', tool_call_id: id, content: step.actionBody === undefined ? '已收到。' : result });
        } else if (raw.trim()) {
            transcript.push({ role: 'assistant', content: raw });
        } else {
            throw new Error('Empty pipeline step');
        }
        const invocation = { id, name: 'submit_story', displayName: step.tool, parameters, result, error: false,
            pipeline: { runId: run.id, stepId: step.id, stepIndex: index, tool: step.tool, display: step.display } };
        invocations.push(invocation);
        emitInvocation(invocation);
    }
    let reply = extractFinalStepText(invocations.slice(-1), { tool: 'submit_story' }, pipeline.resultField);
    if (!reply) {
        const last = invocations.at(-1)!;
        invocations[invocations.length - 1] = { ...last, pipeline: { ...last.pipeline, display: 'summary' } };
        const { connection } = await assembleServerPrompt(snapshot, command, runtime);
        ({ text: reply } = await runPipelineRound({ ...connection, messages: [...transcript, { role: 'system', content: PIPELINE_FALLBACK_PROMPT }],
            maxTokens: connection.responseTokens, apiKey, signal, emit, tools: prompt.pipeline.tools, toolChoice: 'none' }, fallbackModel, () => emit('', true)));
    } else {
        emit(reply);
    }
    if (!reply.trim()) throw new Error('Empty pipeline reply');
    return { text: formatPipelineTagMarkup(invocations, reply), invocations };
}
