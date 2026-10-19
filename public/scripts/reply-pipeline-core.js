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

function normalizeStep(raw, index, { defaultDisplay = 'summary' } = {}) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const tool = String(raw.tool ?? '').trim();
    if (!TOOL_NAME_PATTERN.test(tool)) {
        return null;
    }
    const display = DISPLAY_MODES.has(raw.display) ? raw.display : defaultDisplay;
    const maxTokens = Number(raw.max_tokens);
    return {
        id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `step-${index + 1}`,
        tool,
        prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
        display,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : null,
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
    const final = typeof raw.final === 'string' ? raw.final.trim() : '';
    // The final step's content becomes the assistant message, so its card
    // defaults to hidden; earlier steps stay visible as collapsed rows.
    const steps = Array.isArray(raw.steps)
        ? raw.steps
            .map((step, index) => normalizeStep(step, index, {
                defaultDisplay: step?.tool === final ? 'hidden' : 'summary',
            }))
            .filter(Boolean)
        : [];
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
 * Finds which pipeline step the just-finished invocations complete.
 * @param {object[]} steps Runnable steps
 * @param {Array<{name: string, error?: boolean}>} invocations Completed invocations
 * @returns {{step: object, index: number, isFinal: boolean, errored: boolean}|null}
 */
export function findStepCompletion(steps, invocations) {
    if (!Array.isArray(invocations) || invocations.length === 0) {
        return null;
    }
    for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        const match = invocations.find(invocation => invocation?.name === step.tool);
        if (match) {
            return {
                step,
                index,
                isFinal: index === steps.length - 1,
                errored: match.error === true,
            };
        }
    }
    return null;
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
