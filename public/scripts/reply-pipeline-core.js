/**
 * Reply pipeline — pure logic.
 *
 * A reply pipeline turns one user turn into a deterministic sequence of
 * controlled tool calls (analyze → review → respond …). The preset carries the
 * pipeline definition; this module owns normalization, step resolution,
 * per-round step prompts, and final-message extraction. Side effects
 * (generation, chat writes, tool_choice overrides) stay in the runtime layer.
 */

const DISPLAY_MODES = new Set(['summary', 'full', 'hidden']);
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
// Mirrors reasoning_effort_types in openai.js; kept local to stay import-free.
const REASONING_EFFORTS = new Set(['auto', 'low', 'medium', 'high', 'min', 'max']);

/**
 * Prompt-trigger vocabulary for pipeline rounds: a preset prompt tagged
 * `pipeline:<tool>` is injected only during the round driven by that step's
 * tool. `all`/`normal` triggers keep firing on every pipeline round.
 * @param {string} tool Step tool name
 * @returns {string} Trigger tag stored in `injection_trigger`
 */
export function pipelineTriggerTag(tool) {
    return `pipeline:${String(tool ?? '').trim()}`;
}

/**
 * Hard cap on runnable steps. Must stay aligned with ToolManager.RECURSE_LIMIT:
 * pipeline rounds are recursive generations, so a plan longer than the
 * recursion budget would strand its tail steps.
 */
export const MAX_PIPELINE_STEPS = 5;

function normalizeStep(raw, index) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const tool = String(raw.tool ?? '').trim();
    if (!TOOL_NAME_PATTERN.test(tool)) {
        return null;
    }
    const maxTokens = Number(raw.max_tokens);
    return {
        id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `step-${index + 1}`,
        tool,
        prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
        // Resolved to a display default after the final step is known.
        rawDisplay: DISPLAY_MODES.has(raw.display) ? raw.display : null,
        display: 'summary',
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : null,
        reasoningEffort: REASONING_EFFORTS.has(raw.reasoning_effort) ? raw.reasoning_effort : null,
    };
}

/**
 * Normalizes a preset-carried reply pipeline definition.
 * @param {*} raw Raw `oai_settings.reply_pipeline` value
 * @returns {{enabled: boolean, enforceMode: 'auto'|'forced', resultField: string, final: string, steps: object[]}}
 */
export function normalizeReplyPipeline(raw) {
    const empty = { enabled: false, enforceMode: 'auto', resultField: '', final: '', steps: [] };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return empty;
    }
    const requestedFinal = typeof raw.final === 'string' ? raw.final.trim() : '';
    let steps = Array.isArray(raw.steps)
        ? raw.steps.map((step, index) => normalizeStep(step, index)).filter(Boolean)
        : [];
    // `final` names the reply-producing tool. The plan is truncated there —
    // steps after it are unreachable once the run ends at the final step.
    // Unknown/missing values resolve to the last declared step.
    const foundIndex = steps.findIndex(step => step.tool === requestedFinal);
    const finalIndex = foundIndex >= 0 ? foundIndex : steps.length - 1;
    if (steps.length > 0) {
        steps = steps.slice(0, Math.min(finalIndex + 1, MAX_PIPELINE_STEPS));
    }
    const final = steps.at(-1)?.tool ?? '';
    // The final step's content becomes the assistant message, so its card
    // defaults to hidden; earlier steps stay visible as collapsed rows.
    for (const step of steps) {
        step.display = DISPLAY_MODES.has(step.rawDisplay)
            ? step.rawDisplay
            : (step.tool === final ? 'hidden' : 'summary');
        delete step.rawDisplay;
    }
    return {
        enabled: Boolean(raw.enabled),
        enforceMode: raw.enforce_mode === 'forced' ? 'forced' : 'auto',
        resultField: typeof raw.result_field === 'string' ? raw.result_field.trim() : '',
        final,
        steps,
    };
}

/**
 * Keeps only the steps whose tools exist among the available (enabled) bindings.
 * @param {ReturnType<typeof normalizeReplyPipeline>} pipeline Normalized pipeline
 * @param {string[]} availableToolNames Enabled binding names
 * @returns {object[]} Runnable steps
 */
export function resolvePipelineSteps(pipeline, availableToolNames) {
    const available = new Set(Array.isArray(availableToolNames) ? availableToolNames : []);
    return (pipeline?.steps ?? []).filter(step => available.has(step.tool));
}

/**
 * Builds the per-round instruction injected for a pipeline step.
 * @param {{tool: string, prompt?: string}} step Current step
 * @param {number} index Zero-based step index
 * @param {number} total Total runnable steps
 * @returns {string} Instruction text
 */
export function buildStepPrompt(step, index, total) {
    const header = `[Reply pipeline ${index + 1}/${total}] This round you must call the ${step.tool} tool exactly once.`;
    const detail = typeof step?.prompt === 'string' && step.prompt.trim().length > 0 ? ` ${step.prompt.trim()}` : '';
    return header + detail;
}

/**
 * Finds the furthest pipeline step the just-finished invocations complete.
 *
 * Forward-progress semantics: a round may complete the current step, several
 * steps at once (the model batched calls), or a later step early — the plan
 * advances to just after the furthest matched step. Calls to already-finished
 * steps are recorded on the card but never rewind the plan.
 *
 * @param {object[]} steps Runnable steps
 * @param {Array<{name: string, error?: boolean}>} invocations Completed invocations
 * @returns {{step: object, index: number, isFinal: boolean, errored: boolean}|null}
 */
export function findStepCompletion(steps, invocations) {
    if (!Array.isArray(invocations) || invocations.length === 0) {
        return null;
    }
    let furthestIndex = -1;
    for (let index = 0; index < steps.length; index++) {
        if (invocations.some(invocation => invocation?.name === steps[index].tool)) {
            furthestIndex = index;
        }
    }
    if (furthestIndex < 0) {
        return null;
    }
    const step = steps[furthestIndex];
    const match = invocations.find(invocation => invocation?.name === step.tool);
    return {
        step,
        index: furthestIndex,
        isFinal: furthestIndex === steps.length - 1,
        errored: match.error === true,
    };
}

function readDotPath(value, path) {
    return String(path).split('.').reduce((current, key) => (
        current && typeof current === 'object' ? current[key] : undefined
    ), value);
}

/**
 * Extracts the user-visible reply text from the completed final step.
 *
 * Contract: a plain string result is used as the message; JSON object results
 * are only used through an explicit `result_field` dot path (so `{"ok":true}`
 * is never rendered as the reply). Returns null when the pipeline must fall
 * back to a closing round.
 *
 * @param {Array<{name: string, result: string, error?: boolean}>} invocations Completed invocations
 * @param {{tool: string}} finalStep Final step definition
 * @param {string} resultField Optional dot path into a JSON result
 * @returns {string|null}
 */
export function extractFinalStepText(invocations, finalStep, resultField) {
    const invocation = (invocations ?? []).find(item => item?.name === finalStep?.tool);
    if (!invocation || invocation.error === true) {
        return null;
    }
    const result = invocation.result;
    if (typeof result !== 'string' || result.trim().length === 0) {
        return null;
    }
    let parsed = null;
    try {
        parsed = JSON.parse(result);
    } catch {
        return result;
    }
    // A JSON-encoded string ("\"hello\"") unwraps to its value; other scalars
    // render as the raw result text.
    if (typeof parsed === 'string') {
        return parsed.trim().length > 0 ? parsed : null;
    }
    if (parsed === null || typeof parsed !== 'object') {
        return result;
    }
    if (!resultField) {
        return null;
    }
    const extracted = readDotPath(parsed, resultField);
    if (typeof extracted === 'string' && extracted.trim().length > 0) {
        return extracted;
    }
    return null;
}
