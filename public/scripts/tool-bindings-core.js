/**
 * Pure helpers for user-defined tool bindings.
 *
 * This module is dependency-free on purpose: it is unit-tested directly in a
 * Node environment and consumed by tool-bindings.js (loader + UI wiring) and
 * tool-calling.js (capability gate) in the browser.
 */

/**
 * OpenAI-compatible tool name: 1-64 chars of [a-zA-Z0-9_-].
 */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const EMPTY_SCHEMA = Object.freeze({ type: 'object', properties: {} });

/**
 * @typedef {object} ToolBinding
 * @property {string} id Stable identifier inside feature_settings.tool_bindings.
 * @property {boolean} enabled Disabled bindings stay persisted but are not registered.
 * @property {string} name Tool name sent to the API (tools[].function.name).
 * @property {string} displayName Optional UI label; falls back to name.
 * @property {string} description Model-facing tool description.
 * @property {object} parameters JSON Schema for the tool parameters.
 * @property {string} actionBody JavaScript body run as `async (args) => result`.
 * @property {string} formatMessageBody Optional JS body formatting the call toast.
 * @property {boolean} stealth Hide the call in chat and skip follow-up generation.
 */

/**
 * Checks whether a tool name is acceptable for the OpenAI tools schema.
 * @param {unknown} name Candidate name
 * @returns {boolean}
 */
export function isValidToolName(name) {
    return typeof name === 'string' && TOOL_NAME_PATTERN.test(name);
}

/**
 * Normalizes a parameters value into a JSON Schema object. Anything that is
 * not a plain object falls back to an empty object schema.
 * @param {unknown} raw Raw stored value (or textarea-parsed JSON)
 * @returns {object}
 */
export function sanitizeToolParameters(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...EMPTY_SCHEMA };
    }
    return raw;
}

function createBindingId() {
    return globalThis.crypto?.randomUUID?.() ?? `tb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Normalizes one raw binding entry. Returns null for entries that cannot be
 * registered (missing/invalid name).
 * @param {unknown} raw Stored entry
 * @returns {ToolBinding|null}
 */
export function normalizeToolBinding(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!isValidToolName(name)) {
        return null;
    }
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : createBindingId(),
        enabled: raw.enabled !== false,
        name,
        displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
        description: typeof raw.description === 'string' ? raw.description : '',
        parameters: sanitizeToolParameters(raw.parameters),
        actionBody: typeof raw.actionBody === 'string' ? raw.actionBody : '',
        formatMessageBody: typeof raw.formatMessageBody === 'string' ? raw.formatMessageBody : '',
        stealth: raw.stealth === true,
    };
}

/**
 * Normalizes the stored binding list. Non-array input yields an empty list.
 * @param {unknown} list Raw feature_settings.tool_bindings value
 * @returns {ToolBinding[]}
 */
export function normalizeToolBindings(list) {
    if (!Array.isArray(list)) {
        return [];
    }

    return list.map(normalizeToolBinding).filter(Boolean);
}

/** Add missing pipeline carriers; only explicit authoring activates existing bindings. */
export function ensurePipelineToolBindings(store, names, { activate = false, registeredNames = [] } = {}) {
    let changed = false;
    for (const rawName of names) {
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        if (!isValidToolName(name)) continue;
        const existing = store.find(binding => typeof binding?.name === 'string' && binding.name.trim() === name);
        if (existing) {
            if (activate && (existing.enabled !== true || existing.stealth !== false)) {
                existing.enabled = true;
                existing.stealth = false;
                changed = true;
            }
            continue;
        }
        if (registeredNames.includes(name)) continue;
        store.push(normalizeToolBinding({
            name,
            description: 'Return the model-authored text for this reply pipeline step in content.',
            parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
            actionBody: 'if (typeof args.content !== "string" || !args.content.trim()) return ""; return JSON.stringify(args.content);',
        }));
        changed = true;
    }
    return changed;
}
/**
 * Capability gate: tool calling is on when at least one binding is enabled.
 * @param {unknown} list Raw or normalized binding list
 * @returns {boolean}
 */
export function hasEnabledToolBindings(list) {
    return Array.isArray(list) && list.some(binding => binding?.enabled === true && isValidToolName(binding?.name));
}

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

function toErrorPayload(error) {
    return JSON.stringify({ ok: false, error: String(error?.message ?? error) });
}

/**
 * Compiles a stored action body into the tool action function. The user code
 * receives exactly one parameter (`args`); runtime and syntax errors are
 * returned as an `{ok:false}` payload so the model sees a failed tool result
 * instead of a broken generation loop.
 * @param {string} actionBody JavaScript body executed as `async (args) => result`
 * @returns {(args: object) => Promise<any>}
 */
export function createToolAction(actionBody) {
    const source = typeof actionBody === 'string' && actionBody.trim() ? actionBody : 'return { ok: true };';
    let compiled;
    try {
        compiled = new AsyncFunction('args', source);
    } catch (error) {
        return async () => toErrorPayload(error);
    }
    return async (args) => {
        try {
            return await compiled(args ?? {});
        } catch (error) {
            return toErrorPayload(error);
        }
    };
}

/**
 * Compiles an optional formatMessage body into the ToolDefinition callback.
 * Returns null when no body is stored. Failures degrade to a null-ish string
 * so a bad formatter never breaks invocation.
 * @param {string} formatMessageBody JavaScript body executed as `async (parameters) => string`
 * @returns {((parameters: object) => Promise<string|null>)|null}
 */
export function createToolFormatMessage(formatMessageBody) {
    if (typeof formatMessageBody !== 'string' || !formatMessageBody.trim()) {
        return null;
    }
    let compiled;
    try {
        compiled = new AsyncFunction('parameters', formatMessageBody);
    } catch {
        return async () => null;
    }
    return async (parameters) => {
        try {
            const result = await compiled(parameters ?? {});
            return typeof result === 'string' ? result : JSON.stringify(result);
        } catch {
            return null;
        }
    };
}
