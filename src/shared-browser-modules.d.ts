// Declarations inferred from the existing shared browser JavaScript modules.
// Runtime imports continue to use the original JavaScript files.

declare module '*/public/scripts/ui-locale.js' {
    /**
     * UI locale authority.
     *
     * One storage key, one supported-locale list, one fallback rule. Lives under
     * `public/scripts/` because that is the only directory the browser shell serves
     * as static assets; both the legacy shell (`public/scripts/i18n.js`) and the
     * React surfaces import this single module, so neither side keeps its own copy
     * of the list or the default.
     */
    export const UI_LOCALE_STORAGE_KEY = "language";
    export const DEFAULT_UI_LOCALE = "zh-cn";
    /** @type {{ id: string, label: string }[]} */
    export const uiLocaleOptions: {
        id: string;
        label: string;
    }[];
    /**
     * Resolves a saved language value to a supported locale id. Missing, empty, and
     * unknown values (including languages retired before this contract) fall back
     * to Simplified Chinese.
     * @param {string|null|undefined} language Saved language value
     * @returns {string} Supported locale id
     */
    export function resolveUiLocale(language: string | null | undefined): string;
    /**
     * Reads the saved UI locale.
     * @returns {string} Supported locale id
     */
    export function readStoredUiLocale(): string;
    /**
     * Persists the UI language and reloads so every surface re-initializes against
     * the new locale data.
     * @param {string} language Locale id
     * @returns {void}
     */
    export function setUiLocale(language: string): void;

}

declare module '*/public/scripts/world-info-import-placement.js' {
    /** Route imported entries through the preset's World Info marker by default. */
    export function setImportedWorldInfoPositions(entries: any): void;

}

declare module '*/public/scripts/chat-memory-shared.js' {
    /** Browser-independent chat memory rules; translations and ignore key are supplied by the caller. */
    export function createChatMemoryCore(translate: any, IGNORE_SYMBOL: any): {
        CHAT_MEMORY_METADATA_KEY: string;
        CHAT_MEMORY_HISTORY_LIMIT: number;
        TURN_SUMMARY_STATUS: Readonly<{
            /** Masking the covered turn in prompt assembly and (later) display. */
            ACTIVE: "active";
            /** Turn is inside the recent-verbatim window (or pinned): raw text stays. */
            EXPANDED: "expanded";
            /** Covered content changed since the summary was generated. */
            STALE: "stale";
            /** Queued for or currently in background generation. */
            PENDING: "pending";
            /** Auto attempts exhausted; dormant until manual re-trigger or content change. */
            FAILED: "failed";
        }>;
        CHAT_MEMORY_MAX_AUTO_ATTEMPTS: number;
        getDefaultChatMemoryPrompt: () => string;
        getDefaultChatMemoryWrap: () => any;
        CHAT_MEMORY_ROLES: readonly string[];
        ensureChatMessageIds: (chat: object[], idFactory: () => string) => number;
        partitionChatTurns: (chat: object[]) => {
            leading: {
                items: object[];
            };
            turns: object[];
        };
        computeMemoryWindow: (partition: {
            turns: object[];
        }, keepTurns: number) => {
            verbatimTurnKeys: Set<string>;
            summarizableTurns: object[];
        };
        stripMarkupForSummary: (content: string, invocations: any[] | undefined) => string;
        extractTurnSourceText: (chat: object[], turn: object) => string;
        computeTurnHash: (chat: object[], turn: object) => string;
        resolveChatMemorySettings: (oaiSettings: object, chatMetadata: object) => {
            enabled: boolean;
            keepTurns: number;
            prompt: string;
            wrap: string;
            role: string;
            maxTokens: number;
        };
        getChatMemoryMetadata: (chatMetadata: object) => {
            summaries: object[];
            notes: object[];
            history: object[];
            disabled?: boolean;
            keepTurns?: number;
        };
        appendChatMemoryHistory: (memory: any, entry: any) => {
            at: any;
            action: any;
            turnKey: any;
            status: string;
            error?: string | undefined;
        }[];
        reconcileChatMemory: (chat: object[], memory: object, keepTurns: number) => {
            partition: object;
            summaries: object[];
            activeSummaries: object[];
            pending: {
                turn: object;
                contentHash: string;
                retries: number;
                record: object | null;
            }[];
            stats: {
                totalTurns: number;
                verbatimTurns: number;
                summarizedTurns: number;
            };
        };
        renderSummaryWrap: (template: string, { summary, turnIndex, name1, name2 }: {
            summary: string;
            turnIndex: number;
            name1?: string;
            name2?: string;
        }) => string;
        applySummariesToCoreChat: (coreChat: object[], activeSummaries: object[], { role, wrap, name1, name2, includeTurns }?: {
            role: string;
            wrap: string;
            name1: string;
            name2: string;
            includeTurns?: boolean;
        }) => {
            items: object[];
            summarized: object[];
        };
        filterMemoryForBranch: (memory: object, chat: object[], upToIndex: number) => object | null;
    };

}

declare module '*/public/scripts/openai-provider-capabilities.js' {
    export const CHAT_COMPLETION_SOURCES: {
        OPENAI: string;
    };
    /** @param {unknown} source */
    export function isLegacyOpenAICompletionSource(source: unknown): boolean;
    export function getChatCompletionModelFromSettings(settings?: {}): any;
    /** The same per-attempt stream decision is used by request and consumer. */
    export function isChatCompletionStreaming(settings: any, model: any, type: any): boolean;
    export function resolveVerbosity(settings?: {}): any;
    export function resolveReasoningEffort(settings?: {}, model?: null): any;
    export function isImageInliningSupportedForSettings(settings?: {}, { mainApi }?: {
        mainApi?: string | undefined;
    }): any;
    export function isVideoInliningSupportedForSettings(settings?: {}, { mainApi }?: {
        mainApi?: string | undefined;
    }): boolean;
    export function isAudioInliningSupportedForSettings(settings?: {}, { mainApi }?: {
        mainApi?: string | undefined;
    }): any;
    export function resolveChatCompletionModel(settings?: {}, { mainApi }?: {
        mainApi?: string | undefined;
    }): {
        source: any;
        model: any;
        capabilities: {
            vision: any;
            video: boolean;
            audio: any;
            reasoning: boolean;
        };
    };

}

declare module '*/public/scripts/reply-pipeline-core.js' {
    /**
     * Reply pipeline — pure logic.
     *
     * A reply pipeline turns one user turn into a deterministic sequence of
     * controlled tool calls (analyze → review → respond …). The preset carries the
     * pipeline definition; this module owns normalization, step resolution,
     * per-round step prompts, and final-message extraction. Side effects
     * (generation, chat writes, tool_choice overrides) stay in the runtime layer.
     */
    /**
     * Prompt-trigger vocabulary for pipeline rounds: a preset prompt tagged
     * `pipeline:<tool>` is injected only during the round driven by that step's
     * tool. `all`/`normal` triggers keep firing on every pipeline round.
     * @param {string} tool Step tool name
     * @returns {string} Trigger tag stored in `injection_trigger`
     */
    export function pipelineTriggerTag(tool: string): string;
    export function stripPipelineMarkup(content: string, invocations: readonly unknown[]): string;
    /**
     * Hard cap on runnable steps. Must stay aligned with ToolManager.RECURSE_LIMIT:
     * pipeline rounds are recursive generations, so a plan longer than the
     * recursion budget would strand its tail steps.
     */
    export const MAX_PIPELINE_STEPS = 5;
    export const PIPELINE_STORY_TOOL: {
        type: string;
        function: {
            name: string;
            description: string;
            parameters: {
                type: string;
                properties: {
                    content: {
                        type: string;
                    };
                };
                required: string[];
            };
        };
    };
    function normalizeStep(raw: any, index: any): {
        id: any;
        tool: string;
        prompt: any;
        model: any;
        rawDisplay: any;
        display: string;
        maxTokens: number | null;
        reasoningEffort: any;
    } | null;
    /**
     * Normalizes a preset-carried reply pipeline definition.
     * @param {*} raw Raw `oai_settings.reply_pipeline` value
     * @returns {{enabled: boolean, enforceMode: 'auto'|'forced', resultField: string, final: string, steps: NonNullable<ReturnType<typeof normalizeStep>>[]}}
     */
    export function normalizeReplyPipeline(raw: any): {
        enabled: boolean;
        enforceMode: 'auto' | 'forced';
        resultField: string;
        final: string;
        steps: NonNullable<ReturnType<typeof normalizeStep>>[];
    };
    /**
     * Keeps only the steps whose tools exist among the available (enabled) bindings.
     * @param {ReturnType<typeof normalizeReplyPipeline>} pipeline Normalized pipeline
     * @param {string[]} availableToolNames Enabled binding names
     * @returns {object[]} Runnable steps
     */
    export function resolvePipelineSteps(pipeline: ReturnType<typeof normalizeReplyPipeline>, availableToolNames: string[]): object[];
    /**
     * Builds the per-round instruction injected for a pipeline step.
     * @param {{tool: string, prompt?: string}} step Current step
     * @param {number} index Zero-based step index
     * @param {number} total Total runnable steps
     * @param {string} [historyGuidance] First-round guidance for the transcript format
     * @returns {string} Instruction text
     */
    export function buildStepPrompt(step: {
        tool: string;
        prompt?: string;
    }, index: number, total: number, historyGuidance?: string): string;
    /**
     * Closing-round instruction: no tools, write the final reply from step results.
     */
    export const PIPELINE_FALLBACK_PROMPT = "[Reply pipeline] All pipeline steps are complete. Write the final user-facing reply now, based on the step results above. Do not call any tools in this round.";
    /** Format a settled pipeline reply identically in the browser and on the server. */
    export function formatPipelineTagMarkup(invocations: any, finalText?: string): any;
    /** Create the same step-specific schema for request shaping and token budgeting. */
    export function pipelineStepTool(step: any): {
        type: string;
        function: {
            description: string;
            parameters: {
                type: string;
                properties: {
                    content: {
                        type: string;
                    };
                };
                required: string[];
            };
            name: any;
        };
    };
    /**
     * Applies a pipeline step's request overrides (forced tool_choice, token cap,
     * reasoning effort) onto a request body. Shared by the live CHAT_COMPLETION_SETTINGS_READY
     * shaping and the prompt-inspector preview so both stay in lockstep.
     *
     * Does NOT push the step instruction message — callers control message
     * mutation (the live path owns the append-only run transcript).
     *
     * @param {object} data Request body (generate_data), mutated in place
     * @param {object} step Runnable pipeline step
     * @param {object} [options] Options
     * Legacy enforce modes are accepted but do not change the forced choice.
     * @param {*} [options.reasoningEffort] Pre-resolved reasoning effort; assigned
     *        verbatim when the step declares one, so 'auto' resolves to undefined
     *        and drops out of the serialized body exactly like the live path.
     * @returns {object} The mutated request body
     */
    export function applyStepRequestOverrides(data: object, step: object, { reasoningEffort }?: {
        reasoningEffort?: any;
    }): object;
    /**
     * Applies the closing-round shape: strip tool wiring and append the fallback
     * instruction. Caller controls message dedup.
     * @param {object} data Request body, mutated in place
     * @param {string} [fallbackPrompt] Instruction text
     * @returns {object} The mutated request body
     */
    export function applyFallbackRequestShape(data: object, fallbackPrompt?: string): object;
    export function setPipelineRunStateProvider(provider: any): void;
    export function getPipelineRunState(): any;
    /** Models whose existing OpenAI request branches explicitly remove tools. */
    export function pipelineModelRemovesTools(data: any): boolean;
    export function createPipelineToolCompatibilityError(model: any): Error;
    /** Apply o1 role restrictions only to the outgoing request, never the stored prefix. */
    export function applyPipelineModelMessageRoles(data: any): void;
    /** Validate the entire batch before formatters or actions can have side effects. */
    export function validatePipelineToolCalls(calls: any, assistantMessage?: null): void;
    /**
     * Rejects a response that carries tool calls for an active run when dispatch is
     * disabled (recursion exhausted). The legality check must not depend on whether
     * the calls would be executed, otherwise the closing round silently accepts them.
     * @param {number} callCount Number of tool calls in the response
     * @param {{canPerformToolCalls?: boolean}} [options]
     */
    export function assertPipelineResponseAllowed(callCount: number, { canPerformToolCalls }?: {
        canPerformToolCalls?: boolean;
    }): void;
    /**
     * @param {() => string|null} provider Returns the in-flight run id, or null
     */
    export function setActivePipelineRunIdProvider(provider: () => string | null): void;
    /**
     * @returns {string|null} In-flight pipeline run id, or null when no run is active
     */
    export function getActivePipelineRunId(): string | null;
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
    export function findStepCompletion(steps: object[], invocations: Array<{
        name: string;
        error?: boolean;
    }>): {
        step: object;
        index: number;
        isFinal: boolean;
        errored: boolean;
    } | null;
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
    export function extractFinalStepText(invocations: Array<{
        name: string;
        result: string;
        error?: boolean;
    }>, finalStep: {
        tool: string;
    }, resultField: string): string | null;

}

declare module '*/public/scripts/tool-bindings-core.js' {
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
    export const TOOL_NAME_PATTERN: RegExp;
    export const DEFAULT_PIPELINE_ACTION = "if (typeof args.content !== \"string\" || !args.content.trim()) return \"\"; return args.content;";
    export type ToolBinding = {
        /**
         * Stable identifier inside feature_settings.tool_bindings.
         */
        id: string;
        /**
         * Disabled bindings stay persisted but are not registered.
         */
        enabled: boolean;
        /**
         * Tool name sent to the API (tools[].function.name).
         */
        name: string;
        /**
         * Optional UI label; falls back to name.
         */
        displayName: string;
        /**
         * Model-facing tool description.
         */
        description: string;
        /**
         * JSON Schema for the tool parameters.
         */
        parameters: object;
        /**
         * JavaScript body run as `async (args) => result`.
         */
        actionBody: string;
        /**
         * Optional JS body formatting the call toast.
         */
        formatMessageBody: string;
        /**
         * Hide the call in chat and skip follow-up generation.
         */
        stealth: boolean;
    };
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
    export function isValidToolName(name: unknown): boolean;
    /**
     * Normalizes a parameters value into a JSON Schema object. Anything that is
     * not a plain object falls back to an empty object schema.
     * @param {unknown} raw Raw stored value (or textarea-parsed JSON)
     * @returns {object}
     */
    export function sanitizeToolParameters(raw: unknown): object;
    /**
     * Normalizes one raw binding entry. Returns null for entries that cannot be
     * registered (missing/invalid name).
     * @param {unknown} raw Stored entry
     * @returns {ToolBinding|null}
     */
    export function normalizeToolBinding(raw: unknown): ToolBinding | null;
    /**
     * Normalizes the stored binding list. Non-array input yields an empty list.
     * @param {unknown} list Raw feature_settings.tool_bindings value
     * @returns {ToolBinding[]}
     */
    export function normalizeToolBindings(list: unknown): ToolBinding[];
    /** Add missing pipeline carriers; only explicit authoring activates existing bindings. */
    /** @param {any[]} store @param {string[]} names @param {{activate?: boolean, registeredNames?: string[]}} [options] */
    export function ensurePipelineToolBindings(store: any[], names: string[], { activate, registeredNames }?: {
        activate?: boolean;
        registeredNames?: string[];
    }): boolean;
    /**
     * Capability gate: tool calling is on when at least one binding is enabled.
     * @param {unknown} list Raw or normalized binding list
     * @returns {boolean}
     */
    export function hasEnabledToolBindings(list: unknown): boolean;
    /**
     * Compiles a stored action body into the tool action function. The user code
     * receives exactly one parameter (`args`); runtime and syntax errors are
     * returned as an `{ok:false}` payload so the model sees a failed tool result
     * instead of a broken generation loop.
     * @param {string} actionBody JavaScript body executed as `async (args) => result`
     * @returns {(args: object) => Promise<any>}
     */
    export function createToolAction(actionBody: string): (args: object) => Promise<any>;
    /**
     * Compiles an optional formatMessage body into the ToolDefinition callback.
     * Returns null when no body is stored. Failures degrade to a null-ish string
     * so a bad formatter never breaks invocation.
     * @param {string} formatMessageBody JavaScript body executed as `async (parameters) => string`
     * @returns {((parameters: object) => Promise<string|null>)|null}
     */
    export function createToolFormatMessage(formatMessageBody: string): ((parameters: object) => Promise<string | null>) | null;

}

declare module '*/public/scripts/util/primitives.js' {
    /**
     * Leaf-level pure utilities with zero module dependencies.
     * Safe to import from domain modules without pulling the utils.js graph.
     */
    /**
     * cyrb53 (c) 2018 bryc ({@link https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js|github.com/bryc})
     * License: Public domain (or MIT if needed). Attribution appreciated.
     * A fast and simple 53-bit string hash function with decent collision resistance.
     * Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
     * @param {string} str The string to hash.
     * @param {number} [seed=0] The seed to use for the hash.
     * @returns {number} The hash code.
     */
    export function getStringHash(str: string, seed?: number): number;
    /**
     * Sets a value in a nested object at the given dot-separated path.
     * @param {object} obj Object to set the value on
     * @param {string} path Dot-separated key path (e.g. "data.extensions.myKey")
     * @param {any} value The value to set
     */
    export function setValueByPath(obj: object, path: string, value: any): void;
    /**
     * Generates a stable id for an option from its text/value.
     * @param {string|object} option Option or option text
     * @returns {string} Option id
     */
    export function getOptionId(option: string | object): string;
    /**
     * Escapes a string for use in a regular expression.
     * @param {string} string The string to escape.
     * @returns {string} The escaped string.
     * @example
     * escapeRegex('^Hello$'); // '\\^Hello\\$'
     */
    export function escapeRegex(string: string): string;

}

declare module '*/public/scripts/world-info-keywords.js' {
    /**
     * Gets a real regex object from a slash-delimited regex string.
     * Delimiter is `/` and each occurrence inside the regex has to be escaped.
     * Flags are optional and limited to JavaScript's `RegExp` flags (`g`, `i`, `m`, `s`, `u`, `y`).
     * @param {string} input - A delimited regex string
     * @returns {RegExp|null} The regex object, or null if not a valid regex
     */
    export function parseRegexFromString(input: string): RegExp | null;
    /**
     * Validates if a string is a valid slash-delimited regex.
     * @param {string} input - A delimited regex string
     * @returns {boolean} Whether this would be a valid regex that can be parsed and executed
     */
    export function isValidRegex(input: string): boolean;
    /**
     * Tokenizer parsing input and splitting it into keywords and regexes.
     * @param {{_type: string, term: string}} input - The typed input
     * @param {{options: object}|undefined} _selection - The selection event object
     * @param {(item: {id: string, text: string}) => void} callback - Callback for each parsed item
     * @returns {{term: string}} - The remaining part that is untokenized in the textbox
     */
    export function customTokenizer(input: {
        _type: string;
        term: string;
    }, _selection: {
        options: object;
    } | undefined, callback: (item: {
        id: string;
        text: string;
    }) => void): {
        term: string;
    };
    /**
     * Splits a given input string that contains one or more keywords or regexes, separated by commas.
     * @param {string} input - One or multiple keywords or regexes, separated by commas
     * @returns {string[]} An array of keywords and regexes
     */
    export function splitKeywordsAndRegexes(input: string): string[];

}

declare module '*/server.js' {}
