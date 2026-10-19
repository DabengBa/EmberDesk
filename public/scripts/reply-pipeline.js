/**
 * Reply pipeline — runtime layer.
 *
 * Drives a preset-carried step plan (`oai_settings.reply_pipeline`) over the
 * existing tool-call recursion. Each round the pipeline injects a step
 * instruction, optionally pins `tool_choice` to the step's function, and the
 * step results travel back as `role:"tool"` messages — so later steps see
 * earlier outputs. The runtime only decides; generation-service performs the
 * chat writes and generation continuation.
 */
import { eventSource, event_types } from './events.js';
import { feature_settings } from './feature-settings.js';
import { oai_settings } from './openai.js';
import {
    buildStepPrompt,
    extractFinalStepText,
    findStepCompletion,
    normalizeReplyPipeline,
    resolvePipelineSteps,
} from './reply-pipeline-core.js';
import { normalizeToolBindings } from './tool-bindings-core.js';

const FALLBACK_PROMPT = '[Reply pipeline] All pipeline steps are complete. Write the final user-facing reply now, based on the step results above. Do not call any tools in this round.';

let runState = null;
let initialized = false;

function getEnabledToolNames() {
    return normalizeToolBindings(feature_settings.tool_bindings)
        .filter(binding => binding.enabled)
        .map(binding => binding.name);
}

/**
 * Reads and resolves the preset-carried pipeline for the current bindings.
 * @returns {{pipeline: object, steps: object[]}|null} Runnable pipeline or null
 */
export function getRunnablePipeline() {
    const pipeline = normalizeReplyPipeline(oai_settings?.reply_pipeline);
    if (!pipeline.enabled) {
        return null;
    }
    const steps = resolvePipelineSteps(pipeline, getEnabledToolNames());
    if (steps.length === 0) {
        return null;
    }
    return { pipeline, steps };
}

/**
 * Starts a pipeline run for a generation. Called on GENERATION_STARTED.
 * @returns {boolean} Whether a run began
 */
export function beginPipelineRun() {
    const runnable = getRunnablePipeline();
    if (!runnable) {
        runState = null;
        return false;
    }
    runState = {
        runId: `pipeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        steps: runnable.steps,
        pipeline: runnable.pipeline,
        index: 0,
        fallbackRound: false,
    };
    return true;
}

/**
 * Ends the current run (finalize, fallback, or abandonment).
 */
export function endPipelineRun() {
    runState = null;
}

/**
 * Whether a pipeline run is currently driving the recursion.
 * @returns {boolean}
 */
export function isReplyPipelineRunActive() {
    return runState !== null;
}

/**
 * The step the next request must produce.
 * @returns {object|null}
 */
export function getCurrentPipelineStep() {
    if (!runState) {
        return null;
    }
    return runState.steps[runState.index] ?? null;
}

/**
 * Metadata stamped onto invocations for the current step.
 * @returns {{runId: string, stepId: string, stepIndex: number, display: string}|null}
 */
export function getPipelineStepMeta() {
    const step = getCurrentPipelineStep();
    if (!runState || !step) {
        return null;
    }
    return {
        runId: runState.runId,
        stepId: step.id,
        stepIndex: runState.index,
        display: step.display,
    };
}

/**
 * Processes a completed tool round: stamps invocations with step metadata,
 * advances the plan, and decides what generation-service must do next.
 * Call this BEFORE saveFunctionToolInvocations so the card renders the meta.
 * @param {object[]} invocations Completed invocations (mutated with step meta)
 * @returns {{action: 'continue'}|{action: 'final', text: string, step: object, meta: object}|{action: 'fallback', step: object, meta: object}|null}
 */
export function preparePipelineRound(invocations) {
    if (!runState) {
        return null;
    }
    const completion = findStepCompletion(runState.steps, invocations);
    if (!completion) {
        return { action: 'continue' };
    }
    const meta = {
        runId: runState.runId,
        stepId: completion.step.id,
        stepIndex: completion.index,
        display: completion.step.display,
    };
    for (const invocation of invocations) {
        if (invocation?.name === completion.step.tool) {
            invocation.pipeline = meta;
        }
    }
    if (!completion.isFinal) {
        runState.index = completion.index + 1;
        return { action: 'continue' };
    }
    const text = extractFinalStepText(invocations, completion.step, runState.pipeline.resultField);
    if (text) {
        return { action: 'final', text, step: completion.step, meta };
    }
    runState.fallbackRound = true;
    return { action: 'fallback', step: completion.step, meta };
}

/**
 * Marks the next request as the closing fallback round (no tools, closing prompt).
 */
export function markPipelineFallbackRound() {
    if (runState) {
        runState.fallbackRound = true;
    }
}

/**
 * Whether the next request is the closing fallback round.
 * @returns {boolean}
 */
export function isPipelineFallbackRound() {
    return Boolean(runState?.fallbackRound);
}

/**
 * Applies pipeline request-shaping to the final request body.
 * @param {object} data Request body (generate_data)
 */
export function applyPipelineRequestShaping(data) {
    if (!runState || !data || typeof data !== 'object') {
        return;
    }
    if (runState.fallbackRound) {
        delete data.tools;
        delete data.tool_choice;
        if (Array.isArray(data.messages)) {
            data.messages.push({ role: 'system', content: FALLBACK_PROMPT });
        }
        return;
    }
    const step = getCurrentPipelineStep();
    if (!step) {
        return;
    }
    if (Array.isArray(data.messages)) {
        data.messages.push({ role: 'system', content: buildStepPrompt(step, runState.index, runState.steps.length) });
    }
    if (runState.pipeline.enforceMode === 'forced' && Array.isArray(data.tools)) {
        data.tool_choice = { type: 'function', function: { name: step.tool } };
    }
    if (step.maxTokens && Number.isFinite(Number(data.max_tokens))) {
        data.max_tokens = step.maxTokens;
    }
}

/**
 * Wires pipeline event hooks. Idempotent.
 */
export function initReplyPipeline() {
    if (initialized) {
        return;
    }
    initialized = true;

    eventSource.on(event_types.GENERATION_STARTED, (type, options, dryRun) => {
        if (dryRun || type !== 'normal') {
            return;
        }
        // Recursion rounds (depth > 0) re-emit GENERATION_STARTED; the active
        // plan must survive them. Only a fresh turn starts a new run.
        if (Number(options?.depth) > 0) {
            return;
        }
        beginPipelineRun();
    });

    eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, data => {
        applyPipelineRequestShaping(data);
    });

    document.documentElement.setAttribute('data-reply-pipeline-init', 'true');
}
