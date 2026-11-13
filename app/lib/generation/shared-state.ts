/** Synchronous generation state shared by the shell and the typed lifecycle. */
export let generation_started = new Date();
export let generatingAttemptModel: string | null = null;
export let scrollLock = false;
export let streamingProcessor: unknown = null;
export let is_send_press = false;
export let abortController: AbortController | null = new AbortController();

export function setGenerationStarted(value: Date): void { generation_started = value; }
export function setGeneratingAttemptModel(value: string | null): void { generatingAttemptModel = value; }
export function setScrollLock(value: boolean): void { scrollLock = value; }
export function setStreamingProcessor(value: unknown): void { streamingProcessor = value; }
export function setSending(value: boolean): void { is_send_press = value; }
export function setAbortController(value: AbortController | null): void { abortController = value; }

/** Synchronous stop classification is also needed before the lifecycle bundle loads. */
export function isUserStoppedGenerationError(exception: unknown, aborted: boolean): boolean {
    if (aborted) return true;
    const message = String((exception as { message?: unknown } | null | undefined)?.message ?? '').toLowerCase();
    return message.includes('generation was aborted') || message.includes('clicked stop button');
}

export function withGeneratingModel<T>(model: string | null | undefined, callback: () => T): T {
    const previous = generatingAttemptModel;
    generatingAttemptModel = model ?? previous;
    try {
        return callback();
    } finally {
        generatingAttemptModel = previous;
    }
}

/** Synchronous admission policy, available before the asynchronous runtime bootstrap. */
export function derivePreviewBudget({ chatCompletion, contextTokens, responseTokens }: {
    chatCompletion: { tokenBudget: number; getTotalTokenCount(): number; error?: { name?: string } | null } | null;
    contextTokens: number;
    responseTokens: number;
}): { budget: { context: number; response: number; remaining: number; used: number; totalTokens: number } | null; warning: string | null } {
    if (!chatCompletion) return { budget: null, warning: null };
    const budget = {
        context: contextTokens,
        response: responseTokens,
        remaining: chatCompletion.tokenBudget,
        used: contextTokens - responseTokens - chatCompletion.tokenBudget,
        totalTokens: chatCompletion.getTotalTokenCount(),
    };
    const errorName = chatCompletion.error?.name;
    const warning = errorName === 'TokenBudgetExceeded' || budget.remaining < 0
        ? 'budget-exceeded'
        : (errorName ? 'assembly-error' : null);
    return { budget, warning };
}

type GenerationEntryIdentity = { chatId: unknown; chatReference: unknown; contextRevision: unknown };
type GenerationEntryOptions = { preview?: unknown; regenerate?: boolean; depth?: number; backgroundGeneration?: boolean; quietToLoud?: boolean; signal?: AbortSignal };

interface QuietGenerationInput {
    quietPrompt: string | null; quietToLoud: boolean | null; skipWIAN: boolean | null;
    quietImage: string | null; quietName: string | null; responseLength: number | null;
    jsonSchema: object | null; backgroundGeneration: boolean | null;
    removeReasoning: boolean; trimToSentence: boolean;
    onOwnedCompletion?: (result: string, ownsRun: () => boolean) => Promise<void>;
}

/** Own quiet request configuration, result transformation and temporary settings cleanup. */
export async function runQuietGeneration(input: QuietGenerationInput, ports: {
    snapshot(kind: string, quietToLoud: boolean, background: boolean): Record<string, unknown>;
    remember(snapshot: Record<string, unknown>): void;
    saveLength(length: number): void;
    setupLengthHook(): () => void;
    isLengthCustomized(): boolean;
    restoreLength(): void;
    removeLengthHook(hook: () => void): void;
    generate(options: Record<string, unknown>): Promise<string>;
    trim(value: string): string;
    removeReasoning(value: string): string;
    isStopped(error: unknown): boolean;
}): Promise<string> {
    const quietToLoud = input.quietToLoud ?? false;
    const background = input.backgroundGeneration ?? false;
    const customized = typeof input.responseLength === 'number' && input.responseLength > 0;
    const snapshot = { ...ports.snapshot(background ? 'backgroundGeneration' : quietToLoud ? 'quietToLoud' : 'quietPrompt', quietToLoud, background), error: '' };
    const transform = (value: string) => {
        let result = input.trimToSentence ? ports.trim(value) : value;
        result = input.removeReasoning ? ports.removeReasoning(result) : result;
        return result;
    };
    let eventHook = () => {};
    try {
        const options = {
            quiet_prompt: input.quietPrompt ?? '', quietToLoud, backgroundGeneration: background,
            skipWIAN: input.skipWIAN ?? false, force_name2: true, quietImage: input.quietImage ?? null,
            quietName: input.quietName ?? null, jsonSchema: input.jsonSchema ?? null,
            onOwnedCompletion: input.onOwnedCompletion ? async (result: string, ownsRun: () => boolean) => {
                await input.onOwnedCompletion?.(transform(result), ownsRun);
            } : undefined,
        };
        ports.remember({ ...snapshot, phase: 'running' });
        if (customized) {
            ports.saveLength(input.responseLength as number);
            eventHook = ports.setupLengthHook();
        }
        const result = transform(await ports.generate(options));
        ports.remember({ ...snapshot, phase: 'completed' });
        return result;
    } catch (error) {
        ports.remember({
            ...snapshot, phase: ports.isStopped(error) ? 'stopped' : 'error',
            error: ports.isStopped(error) ? '' : String((error as { message?: unknown } | null)?.message ?? error ?? ''),
        });
        throw error;
    } finally {
        if (customized && ports.isLengthCustomized()) {
            ports.restoreLength();
            ports.removeLengthHook(eventHook);
        }
    }
}

/** Own bootstrap admission, request identity, dispatch and regenerate failure cleanup. */
export async function runGenerationEntry<Options extends GenerationEntryOptions, Envelope, Snapshot, Result>(
    type: string, inputOptions: Options, dryRun: boolean,
    ports: {
        greetingPending(): boolean;
        captureComposer(options: Options): Options;
        envelope(type: string, options: Options, dryRun: boolean, regenerate: boolean): Envelope;
        enter(): { signal: AbortSignal; release(): void } | null;
        setPending(value: boolean): void;
        clearRestore(): void;
        identity(): GenerationEntryIdentity;
        bootstrap(): Promise<void>;
        execute(envelope: Envelope): Promise<Result>;
        takeRestore(): Snapshot | null;
        isStopped(error: unknown): boolean;
        restore(snapshot: Snapshot): Promise<boolean>;
        reportRestore(restored: boolean): void;
        endPipeline(): void;
        unblock(type: string): void;
    },
): Promise<Result | undefined> {
    if (ports.greetingPending()) return;
    const policy = prepareGenerationEnvelope(type, inputOptions, dryRun);
    const options = policy.captureComposer ? ports.captureComposer(inputOptions) : inputOptions;
    const envelope = ports.envelope(type, options, dryRun, policy.regenerate);
    const entry = policy.foreground ? ports.enter() : null;
    if (policy.foreground && !entry) return;
    if (policy.foreground) ports.setPending(true);
    if (policy.regenerate) ports.clearRestore();
    let target: GenerationEntryIdentity | undefined;
    const ownsIdentity = () => {
        if (!target) return false;
        const current = ports.identity();
        return current.chatId === target.chatId && current.chatReference === target.chatReference
            && current.contextRevision === target.contextRevision;
    };
    try {
        target = ports.identity();
        await ports.bootstrap();
        if (entry?.signal.aborted || options.signal?.aborted || !ownsIdentity()) return;
        return await ports.execute(envelope);
    } catch (error) {
        const snapshot = policy.regenerate && ownsIdentity() ? ports.takeRestore() : null;
        if (snapshot) {
            if (!ports.isStopped(error)) {
                const restored = await ports.restore(snapshot);
                if (!ownsIdentity()) throw error;
                ports.reportRestore(restored);
            }
            ports.endPipeline();
            ports.unblock(type);
        }
        throw error;
    } finally {
        if (policy.foreground) {
            ports.setPending(false);
            entry?.release();
        }
    }
}

export function prepareGenerationEnvelope(type: unknown, options: {
    composerSubmission?: unknown; depth?: unknown; regenerate?: unknown; preview?: unknown;
    quietToLoud?: unknown; backgroundGeneration?: unknown;
} = {}, dryRun = false): { captureComposer: boolean; regenerate: boolean; foreground: boolean } {
    const quiet = String(type ?? '') === 'quiet';
    return {
        captureComposer: !options.composerSubmission && type !== 'quiet' && !options.depth && !options.regenerate && (!dryRun || Boolean(options.preview)),
        regenerate: options.regenerate === true && type === 'normal' && !options.depth && !dryRun && !options.preview,
        foreground: !dryRun && !options.depth && !options.preview && (!quiet || (!options.backgroundGeneration && Boolean(options.quietToLoud))),
    };
}

export interface RegenerateMessage {
    is_user?: boolean;
    is_system?: boolean;
    extra?: { type?: string; api?: string; tool_invocations?: unknown };
}

export function isRegenerateRemovableMessage(message: unknown, { narratorType = 'narrator' }: { narratorType?: string } = {}): boolean {
    if (!message || typeof message !== 'object') return false;
    const row = message as RegenerateMessage;
    if (row.is_user) return false;
    if (row.is_system) return Array.isArray(row.extra?.tool_invocations);
    return row.extra?.type !== narratorType && row.extra?.api !== 'manual';
}

export function findRegenerateTurnStart(chat: unknown, options: { narratorType?: string } = {}): number {
    if (!Array.isArray(chat)) return 0;
    let start = chat.length;
    while (start > 0 && isRegenerateRemovableMessage(chat[start - 1], options)) start--;
    return start;
}

export function collectRegenerateTurn(chat: unknown, { chatId = null, narratorType = 'narrator' }: { chatId?: string | null; narratorType?: string } = {}) {
    const insertIndex = findRegenerateTurnStart(chat, { narratorType });
    const messages = Array.isArray(chat) ? chat.slice(insertIndex).map(message => structuredClone(message)) : [];
    return { chatId: chatId ?? null, insertIndex, messages };
}

export function canRegenerateLastReply(input: { busy: boolean; connected: boolean; hasCharacter: boolean; chat: unknown }): boolean {
    return !input.busy && input.connected && input.hasCharacter && Array.isArray(input.chat) && input.chat.length > 0;
}

// Synchronous generation policies shared by the typed lifecycle and browser facades.
interface GenerationPolicyInput {
    kind?: string; mainApi?: string; dryRun?: boolean; depth?: number;
    quietPrompt?: boolean; quietToLoud?: boolean; backgroundGeneration?: boolean;
}
interface GenerationPolicyOptions {
    fallbackReady?: boolean;
    statusLabels?: { primaryRetry?: string; fallback?: string };
}
interface GenerationPolicyAttempt { label: string; status: string; fallbackProvider: boolean }
type GenerationFallbackSettings = { fallback_provider_model?: unknown } | null | undefined;

/**
 * The fallback attempt reuses the primary URL and API key; the model is the only
 * override. A non-empty fallback model means fallback is enabled.
 * @param {object} settings Chat completion settings
 * @returns {string} Configured fallback model name, or '' when fallback is off
 */
export function getFallbackOpenAIModel(settings: GenerationFallbackSettings) {
    return String(settings?.fallback_provider_model ?? '').trim();
}

export function hasFallbackProviderSettings(settings: GenerationFallbackSettings) {
    return Boolean(getFallbackOpenAIModel(settings));
}

export function isRecoverableGenerationFailure(failure: unknown) {
    const detail = failure as { code?: unknown; message?: unknown; error?: { message?: unknown }; emptyReply?: boolean; name?: string } | null | undefined;
    if (detail?.code === 'REPLY_PIPELINE_TOOLS_UNSUPPORTED') return false;
    const message = String(
        detail?.message
        ?? detail?.error?.message
        ?? failure
        ?? '',
    ).toLowerCase();

    if (!message && detail?.emptyReply !== true) {
        return false;
    }

    if (detail?.emptyReply === true) {
        return true;
    }

    const nonRecoverablePatterns = [
        'generation was aborted',
        'clicked stop button',
        'unsupported api',
        'no character selected',
        'server unreachable',
    ];

    if (nonRecoverablePatterns.some(pattern => message.includes(pattern))) {
        return false;
    }

    if (detail?.name === 'AbortError') {
        return true;
    }

    const recoverablePatterns = [
        'failed to fetch',
        'network',
        'provider',
        'stream',
        'unexpected token',
        'got response status',
        'timeout',
        'connection closed',
        '502',
        '503',
        '429',
    ];

    return recoverablePatterns.some(pattern => message.includes(pattern)) || Boolean(detail?.error);
}

export function isMainChatVisibleGeneration({ type, mainApi, dryRun, depth }: { type?: string; mainApi?: string; dryRun?: boolean; depth?: number } = {}) {
    if (mainApi !== 'openai' || dryRun || (depth !== undefined && depth > 0)) {
        return false;
    }

    return ['normal', undefined].includes(type);
}


const PRIMARY_ATTEMPT = Object.freeze({
    label: 'primary',
    status: '',
    fallbackProvider: false,
});

function cloneAttempt(attempt: GenerationPolicyAttempt): GenerationPolicyAttempt {
    return { ...attempt };
}

function createAttemptTrace(attempts: GenerationPolicyAttempt[]) {
    return attempts.map((attempt, index) => ({
        index,
        label: attempt.label,
        fallbackProvider: Boolean(attempt.fallbackProvider),
        recovery: index > 0,
    }));
}

export function hasFallbackProviderForGeneration({ settings }: { settings?: GenerationFallbackSettings } = {}) {
    return hasFallbackProviderSettings(settings);
}

export function buildGenerationLifecycleAttempts({ fallbackReady = false, statusLabels = {} }: GenerationPolicyOptions = {}) {
    const attempts = [
        cloneAttempt(PRIMARY_ATTEMPT),
        {
            label: 'primary_retry',
            status: statusLabels.primaryRetry ?? '',
            fallbackProvider: false,
        },
    ];

    if (fallbackReady) {
        attempts.push({
            label: 'fallback',
            status: statusLabels.fallback ?? '',
            fallbackProvider: true,
        });
    }

    return attempts;
}

export function createGenerationLifecyclePlan({
    type,
    mainApi,
    dryRun = false,
    depth = 0,
    fallbackReady = false,
    statusLabels = {},
}: GenerationPolicyOptions & { type?: string; mainApi?: string; dryRun?: boolean; depth?: number } = {}) {
    const shouldAutoRecover = isMainChatVisibleGeneration({ type, mainApi, dryRun, depth });
    const attempts = shouldAutoRecover
        ? buildGenerationLifecycleAttempts({ fallbackReady, statusLabels })
        : [cloneAttempt(PRIMARY_ATTEMPT)];

    return {
        shouldAutoRecover,
        attempts,
        trace: createAttemptTrace(attempts),
    };
}

export function createQuietGenerationLifecycleContract({
    quietToLoud = false,
    backgroundGeneration = false,
}: { quietToLoud?: boolean; backgroundGeneration?: boolean } = {}) {
    return {
        requestFamily: backgroundGeneration
            ? 'backgroundGeneration'
            : quietToLoud
                ? 'quietToLoud'
                : 'quietPrompt',
        autoRecover: false,
        usesStreamingTransport: false,
        bindsVisibleMessageRow: false,
        finalizationStrategy: 'return-generated-text',
        rollbackStrategy: 'caller-owned',
    };
}

export function getGenerationFailureDecision({
    shouldAutoRecover = false,
    failure,
    isIntermediateAttempt = false,
}: { shouldAutoRecover?: boolean; failure?: unknown; isIntermediateAttempt?: boolean } = {}) {
    const recoverable = Boolean(shouldAutoRecover && isRecoverableGenerationFailure(failure));

    if (recoverable && isIntermediateAttempt) {
        return {
            action: 'retry',
            recoverable,
            shouldEnsureRecoveryMessage: true,
            shouldRestoreAttemptMessage: true,
            shouldShowFailureRecovery: false,
            shouldThrow: false,
        };
    }

    if (recoverable) {
        return {
            action: 'final_recovery',
            recoverable,
            shouldEnsureRecoveryMessage: true,
            shouldRestoreAttemptMessage: true,
            shouldShowFailureRecovery: true,
            shouldThrow: true,
        };
    }

    return {
        action: 'propagate',
        recoverable,
        shouldEnsureRecoveryMessage: false,
        shouldRestoreAttemptMessage: false,
        shouldShowFailureRecovery: false,
        shouldThrow: true,
    };
}

export function getGenerationSuccessFinalization({
    hasActiveRecoveryMessage = false,
    type,
}: { hasActiveRecoveryMessage?: boolean; type?: string } = {}) {
    if (hasActiveRecoveryMessage) {
        return {
            action: 'replace_recovery_message',
            type,
        };
    }

    return {
        action: 'save_reply',
        type,
    };
}


/**
 * Framework-neutral Main Chat generation command matrix and lifecycle planning.
 *
 * Owns request-kind classification, capability contracts, and attempt planning for
 * every visible and non-visible generation family. Does not assemble provider
 * payloads, call network endpoints, or touch DOM.
 */


export const GENERATION_SERVICE_OWNER = 'generation-service';

/** Visible React composer / message-action command kinds. */
export const GENERATION_VISIBLE_COMMAND_KINDS = Object.freeze([
    'submitComposer',
    'regenerate',
]);

/** Non-visible automation / helper command kinds. */
export const GENERATION_NON_VISIBLE_COMMAND_KINDS = Object.freeze([
    'quietPrompt',
    'quietToLoud',
    'backgroundGeneration',
]);

export const GENERATION_COMMAND_KINDS = Object.freeze([
    ...GENERATION_VISIBLE_COMMAND_KINDS,
    ...GENERATION_NON_VISIBLE_COMMAND_KINDS,
]);

export const GENERATION_COMMAND_VISIBILITY = Object.freeze({
    VISIBLE: 'visible',
    NON_VISIBLE: 'non-visible',
});

export const GENERATION_COMMAND_STATUSES = Object.freeze({
    SERVICE_OWNED: 'service-owned',
    UNSUPPORTED_WITH_REASON: 'unsupported-with-reason',
});

export const GENERATION_COMMAND_PATHS = Object.freeze({
    STANDARD_OPENAI_VISIBLE_DIRECT_CHAT: 'standard-openai-visible-direct-chat',
    NON_OPENAI_PROVIDER: 'non-openai-provider',
    DRY_RUN: 'dry-run',
    NESTED_VISIBLE_GENERATION: 'nested-visible-generation',
    QUIET_GENERATION: 'quiet-generation',
    BACKGROUND_GENERATION: 'background-generation',
    QUIET_NON_VISIBLE_HELPER: 'quiet-non-visible-helper',
    QUIET_TO_LOUD_NON_VISIBLE_HELPER: 'quiet-to-loud-non-visible-helper',
    BACKGROUND_NON_VISIBLE_HELPER: 'background-non-visible-helper',
    UNKNOWN_GENERATION_KIND: 'unknown-generation-kind',
});

export const GENERATION_COMMAND_REASONS = Object.freeze({
    SUPPORTED_KIND: 'supported-kind',
    NON_OPENAI_PROVIDER: 'non-openai-provider',
    DRY_RUN: 'dry-run',
    NESTED_GENERATION: 'nested-generation',
    QUIET_GENERATION: 'quiet-generation',
    BACKGROUND_GENERATION: 'background-generation',
    QUIET_TO_LOUD: 'quiet-to-loud',
    UNSUPPORTED_KIND: 'unsupported-kind',
});

const visibleKindSet = new Set<string>(GENERATION_VISIBLE_COMMAND_KINDS);
const nonVisibleKindSet = new Set<string>(GENERATION_NON_VISIBLE_COMMAND_KINDS);
const allKindSet = new Set<string>(GENERATION_COMMAND_KINDS);

/**
 * Map the public shell generation type to the stable command vocabulary.
 * Existing callers may continue using Generate(type, options); the service
 * normalizes those names before routing or lifecycle decisions.
 *
 * @param {string} type
 * @param {object} [options]
 * @returns {string}
 */
export function mapLegacyGenerationTypeToCommandKind(type: string | null | undefined, options: GenerationEntryOptions = {}) {
    switch (String(type ?? '')) {
        case 'quiet':
            if (options.backgroundGeneration) {
                return 'backgroundGeneration';
            }
            return options.quietToLoud ? 'quietToLoud' : 'quietPrompt';
        case 'normal':
        default:
            return 'submitComposer';
    }
}

export function isForegroundGenerationEntry(type: string, options: GenerationEntryOptions = {}, dryRun = false) {
    return prepareGenerationEnvelope(type, options, dryRun).foreground;
}

/**
 * Map public command kind to the Generate()/lifecycle `type` used for recovery baselines.
 * @param {string} kind
 * @returns {string}
 */
export function mapGenerationCommandKindToLifecycleType(kind: string | null | undefined) {
    switch (String(kind ?? '')) {
        case 'quietPrompt':
        case 'quietToLoud':
        case 'backgroundGeneration':
            return 'quiet';
        case 'submitComposer':
        case 'regenerate':
        default:
            return 'normal';
    }
}

/**
 * @param {string} kind
 * @returns {'visible'|'non-visible'|''}
 */
export function getGenerationCommandVisibility(kind: string | null | undefined) {
    const normalized = String(kind ?? '');
    if (visibleKindSet.has(normalized)) {
        return GENERATION_COMMAND_VISIBILITY.VISIBLE;
    }
    if (nonVisibleKindSet.has(normalized)) {
        return GENERATION_COMMAND_VISIBILITY.NON_VISIBLE;
    }
    return '';
}

/**
 * Build capability contract for a classified command.
 * @param {object} input
 */
export function buildGenerationCommandCapabilities({
    kind = '',
    mainApi = '',
    dryRun = false,
    depth = 0,
    quietPrompt = false,
    quietToLoud = false,
    backgroundGeneration = false,
}: GenerationPolicyInput = {}) {
    const visibility = getGenerationCommandVisibility(kind);
    const isNonVisible = visibility === GENERATION_COMMAND_VISIBILITY.NON_VISIBLE
        || quietPrompt
        || quietToLoud
        || backgroundGeneration
        || String(kind).startsWith('quiet')
        || kind === 'backgroundGeneration';

    if (isNonVisible) {
        const quietContract = createQuietGenerationLifecycleContract({
            quietToLoud: quietToLoud || kind === 'quietToLoud',
            backgroundGeneration: backgroundGeneration || kind === 'backgroundGeneration',
        });
        return {
            visibility: GENERATION_COMMAND_VISIBILITY.NON_VISIBLE,
            autoRecover: false,
            usesStreamingTransport: false,
            bindsVisibleMessageRow: false,
            producesVisibleRow: false,
            returnsGeneratedText: true,
            finalizationStrategy: quietContract.finalizationStrategy,
            rollbackStrategy: quietContract.rollbackStrategy,
            allowsNestedDepth: true,
            allowsDryRun: true,
            allowsNonOpenAI: true,
        };
    }

    const nested = Number(depth) > 0;
    const isDryRun = dryRun === true;
    // Bounded auto-recovery stays limited to visible top-level OpenAI-compatible generations.
    // Nested, dry-run, quiet/background, and non-OpenAI remain single-attempt (R4/R5).
    const autoRecover = mainApi === 'openai' && !isDryRun && !nested;

    return {
        visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
        autoRecover,
        usesStreamingTransport: !isDryRun,
        bindsVisibleMessageRow: !isDryRun && !nested,
        producesVisibleRow: !isDryRun,
        returnsGeneratedText: isDryRun || nested,
        finalizationStrategy: isDryRun || nested ? 'return-without-persisting-error-row' : 'save-or-replace-message-row',
        rollbackStrategy: autoRecover ? 'lifecycle-baseline' : 'caller-owned',
        allowsNestedDepth: true,
        allowsDryRun: true,
        allowsNonOpenAI: true,
        mainApi: String(mainApi ?? ''),
        dryRun: isDryRun,
        depth: Number(depth) || 0,
    };
}

/**
 * Classify any generation request into an explicit service-owned command.
 * Never returns a legacy transport owner or unsupported→legacy branch (R1).
 *
 * @param {object} input
 */
export function createGenerationCommand({
    kind = '',
    mainApi = '',
    dryRun = false,
    depth = 0,
    quietPrompt = false,
    quietToLoud = false,
    backgroundGeneration = false,
}: GenerationPolicyInput = {}) {
    const normalizedKind = String(kind ?? '');
    let effectiveKind = normalizedKind;

    // Allow callers that only set quiet/background flags without a dedicated kind.
    if (!allKindSet.has(effectiveKind)) {
        if (backgroundGeneration) {
            effectiveKind = 'backgroundGeneration';
        } else if (quietToLoud) {
            effectiveKind = 'quietToLoud';
        } else if (quietPrompt) {
            effectiveKind = 'quietPrompt';
        }
    }

    if (!allKindSet.has(effectiveKind)) {
        return {
            owner: GENERATION_SERVICE_OWNER,
            kind: normalizedKind,
            lifecycleType: mapGenerationCommandKindToLifecycleType(normalizedKind),
            visibility: '',
            status: GENERATION_COMMAND_STATUSES.UNSUPPORTED_WITH_REASON,
            path: GENERATION_COMMAND_PATHS.UNKNOWN_GENERATION_KIND,
            reason: GENERATION_COMMAND_REASONS.UNSUPPORTED_KIND,
            mainApi: String(mainApi ?? ''),
            dryRun: Boolean(dryRun),
            depth: Number(depth) || 0,
            capabilities: {
                visibility: '',
                autoRecover: false,
                usesStreamingTransport: false,
                bindsVisibleMessageRow: false,
                producesVisibleRow: false,
                returnsGeneratedText: false,
                finalizationStrategy: 'reject',
                rollbackStrategy: 'caller-owned',
                allowsNestedDepth: false,
                allowsDryRun: false,
                allowsNonOpenAI: false,
            },
            // Explicit rejection — never route unknown kinds through a legacy owner.
            executable: false,
        };
    }

    const visibility = getGenerationCommandVisibility(effectiveKind);
    const isQuietFamily = visibility === GENERATION_COMMAND_VISIBILITY.NON_VISIBLE;
    let path: string = GENERATION_COMMAND_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT;
    let reason: string = GENERATION_COMMAND_REASONS.SUPPORTED_KIND;

    if (isQuietFamily) {
        if (effectiveKind === 'backgroundGeneration' || backgroundGeneration) {
            path = GENERATION_COMMAND_PATHS.BACKGROUND_NON_VISIBLE_HELPER;
            reason = GENERATION_COMMAND_REASONS.BACKGROUND_GENERATION;
        } else if (effectiveKind === 'quietToLoud' || quietToLoud) {
            path = GENERATION_COMMAND_PATHS.QUIET_TO_LOUD_NON_VISIBLE_HELPER;
            reason = GENERATION_COMMAND_REASONS.QUIET_TO_LOUD;
        } else {
            path = GENERATION_COMMAND_PATHS.QUIET_NON_VISIBLE_HELPER;
            reason = GENERATION_COMMAND_REASONS.QUIET_GENERATION;
        }
    } else if (quietPrompt || quietToLoud) {
        path = GENERATION_COMMAND_PATHS.QUIET_GENERATION;
        reason = GENERATION_COMMAND_REASONS.QUIET_GENERATION;
    } else if (backgroundGeneration) {
        path = GENERATION_COMMAND_PATHS.BACKGROUND_GENERATION;
        reason = GENERATION_COMMAND_REASONS.BACKGROUND_GENERATION;
    } else if (Number(depth) > 0) {
        path = GENERATION_COMMAND_PATHS.NESTED_VISIBLE_GENERATION;
        reason = GENERATION_COMMAND_REASONS.NESTED_GENERATION;
    } else if (dryRun) {
        path = GENERATION_COMMAND_PATHS.DRY_RUN;
        reason = GENERATION_COMMAND_REASONS.DRY_RUN;
    } else if (mainApi && mainApi !== 'openai') {
        path = GENERATION_COMMAND_PATHS.NON_OPENAI_PROVIDER;
        reason = GENERATION_COMMAND_REASONS.NON_OPENAI_PROVIDER;
    }

    const capabilities = buildGenerationCommandCapabilities({
        kind: effectiveKind,
        mainApi,
        dryRun,
        depth,
        quietPrompt: quietPrompt || isQuietFamily,
        quietToLoud: quietToLoud || effectiveKind === 'quietToLoud',
        backgroundGeneration: backgroundGeneration || effectiveKind === 'backgroundGeneration',
    });

    return {
        owner: GENERATION_SERVICE_OWNER,
        kind: effectiveKind,
        lifecycleType: mapGenerationCommandKindToLifecycleType(effectiveKind),
        visibility: capabilities.visibility,
        status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
        path,
        reason,
        mainApi: String(mainApi ?? ''),
        dryRun: Boolean(dryRun),
        depth: Number(depth) || 0,
        capabilities,
        executable: true,
    };
}

/**
 * Preserve shell/provider inputs in an opaque envelope while adding the stable
 * service command used for routing and lifecycle ownership.
 *
 * @param {object} input
 * @returns {object}
 */
export function createGenerationRequestEnvelope({
    type = 'normal',
    options = {},
    dryRun = false,
    mainApi = '',
    kind = '',
}: { type?: string; options?: GenerationEntryOptions; dryRun?: boolean; mainApi?: string; kind?: string } = {}) {
    const effectiveKind = kind || mapLegacyGenerationTypeToCommandKind(type, options);
    const depth = Number(options?.depth) || 0;
    const command = createGenerationCommand({
        kind: effectiveKind,
        mainApi,
        dryRun,
        depth,
        quietPrompt: type === 'quiet',
        quietToLoud: options?.quietToLoud === true,
        backgroundGeneration: options?.backgroundGeneration === true,
    });

    return {
        owner: GENERATION_SERVICE_OWNER,
        type: String(type ?? 'normal'),
        kind: effectiveKind,
        options,
        dryRun: Boolean(dryRun),
        mainApi: String(mainApi ?? ''),
        command,
    };
}

/**
 * Create a lifecycle plan for a generation command.
 * Quiet/background/dry-run/nested/non-OpenAI stay single-attempt; visible OpenAI gets bounded recovery.
 *
 * @param {object} commandOrInput - result of createGenerationCommand or raw input fields
 * @param {{ fallbackReady?: boolean, statusLabels?: object }} [options]
 */
export function createGenerationCommandPlan(commandOrInput: ReturnType<typeof createGenerationCommand> | GenerationPolicyInput = {}, options: GenerationPolicyOptions = {}) {
    const command = (commandOrInput as ReturnType<typeof createGenerationCommand> | null | undefined)?.owner === GENERATION_SERVICE_OWNER
        ? commandOrInput as ReturnType<typeof createGenerationCommand>
        : createGenerationCommand(commandOrInput);

    const { fallbackReady = false, statusLabels = {} } = options;
    const lifecyclePlan = createGenerationLifecyclePlan({
        type: command.lifecycleType,
        mainApi: command.mainApi,
        dryRun: command.dryRun,
        depth: command.depth,
        fallbackReady,
        statusLabels,
    });

    // Capability contract is authoritative for auto-recovery (quiet/non-visible force single attempt).
    const shouldAutoRecover = Boolean(command.capabilities?.autoRecover && lifecyclePlan.shouldAutoRecover);
    const attempts = shouldAutoRecover
        ? lifecyclePlan.attempts
        : [{ label: 'primary', status: '', fallbackProvider: false }];
    const trace = attempts.map((attempt, index) => ({
        index,
        label: attempt.label,
        fallbackProvider: Boolean(attempt.fallbackProvider),
        recovery: index > 0,
    }));

    return {
        command,
        owner: GENERATION_SERVICE_OWNER,
        shouldAutoRecover,
        attempts,
        trace,
        baselineStrategy: command.capabilities?.rollbackStrategy ?? 'caller-owned',
        finalizationStrategy: command.capabilities?.finalizationStrategy ?? 'save-or-replace-message-row',
        producesVisibleRow: Boolean(command.capabilities?.producesVisibleRow),
        usesStreamingTransport: Boolean(command.capabilities?.usesStreamingTransport),
    };
}

/**
 * Execute a planned generation attempt sequence without knowing about DOM,
 * provider payloads, React, or the browser shell.
 *
 * @param {object} input
 * @returns {Promise<unknown>}
 */
let installedAttemptExecutor: ((input: unknown) => Promise<unknown>) | null = null;

/** Install the bundle-owned executor before browser generation starts. */
export function installGenerationAttemptExecutor(executor: unknown) {
    if (typeof executor !== 'function') throw new TypeError('Generation attempt executor must be a function.');
    if (installedAttemptExecutor && installedAttemptExecutor !== executor) throw new Error('Generation attempt executor already installed.');
    installedAttemptExecutor = executor as (input: unknown) => Promise<unknown>;
}

export async function executeGenerationAttempts(input: unknown = {}) {
    if (!installedAttemptExecutor) throw new Error('Generation attempt executor is not installed.');
    return installedAttemptExecutor(input);
}

/**
 * Pure success/failure/abort outcome simulation used by unit matrix proof (PM).
 * Does not perform network I/O.
 *
 * @param {object} plan - createGenerationCommandPlan result
 * @param {{ outcome: 'success'|'failure'|'abort', attemptIndex?: number, failure?: unknown, hasActiveRecoveryMessage?: boolean }} scenario
 */
export function simulateGenerationCommandOutcome(plan: ReturnType<typeof createGenerationCommandPlan>, scenario: { outcome?: 'success' | 'failure' | 'abort'; attemptIndex?: number; failure?: unknown; hasActiveRecoveryMessage?: boolean } = {}) {
    const {
        outcome = 'success',
        attemptIndex = 0,
        failure = null,
        hasActiveRecoveryMessage = false,
    } = scenario;
    const attempts = Array.isArray(plan?.attempts) ? plan.attempts : [];
    const attempt = attempts[attemptIndex] ?? attempts[0] ?? { label: 'primary', status: '', fallbackProvider: false };
    const isLastAttempt = attemptIndex >= attempts.length - 1;

    if (outcome === 'success') {
        const finalization = getGenerationSuccessFinalization({
            hasActiveRecoveryMessage,
            type: plan?.command?.lifecycleType,
        });
        return {
            owner: GENERATION_SERVICE_OWNER,
            outcome: 'success',
            attempt,
            attemptIndex,
            shouldAutoRecover: Boolean(plan?.shouldAutoRecover),
            producesVisibleRow: Boolean(plan?.producesVisibleRow),
            finalization,
            failureDecision: null,
        };
    }

    const effectiveFailure = outcome === 'abort'
        ? (failure ?? new Error('Generation was aborted.'))
        : (failure ?? new TypeError('Failed to fetch'));

    const failureDecision = getGenerationFailureDecision({
        shouldAutoRecover: Boolean(plan?.shouldAutoRecover),
        failure: effectiveFailure,
        isIntermediateAttempt: !isLastAttempt,
    });

    return {
        owner: GENERATION_SERVICE_OWNER,
        outcome,
        attempt,
        attemptIndex,
        shouldAutoRecover: Boolean(plan?.shouldAutoRecover),
        producesVisibleRow: Boolean(plan?.producesVisibleRow),
        finalization: null,
        failureDecision,
        nextAttemptIndex: failureDecision.action === 'retry' ? attemptIndex + 1 : null,
    };
}
