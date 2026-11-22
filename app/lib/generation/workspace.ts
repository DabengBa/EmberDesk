type Run = { id: string; status: string; temporary?: boolean; kind?: string; requestId?: string; step?: Step } & Record<string, unknown>;
type Step = { id: string } & Record<string, unknown>;
type Target = { temporary?: boolean } & Record<string, unknown>;
type Command = { action: string; text?: string; requestId: string } & Record<string, unknown>;
type Discovery = { discovered: boolean; reconciledChatVersion?: unknown };
type View = { target: Target; kind?: string; text: string; pendingText: string; requestId?: string; run?: Run; stepId?: string; detach?: () => void; waitTimer?: ReturnType<typeof setTimeout>; waiting?: boolean; invocations?: unknown[]; discovered?: boolean; reconciling?: boolean; preparing?: boolean; creating?: boolean; cancellation?: Promise<Run>; stopRequested?: boolean };
type RunningView = View & { run: Run };
type Event = { type: string; text: string; reset?: boolean; run: Run; invocations?: unknown[]; invocation: unknown; step?: Step };
interface Ports {
    request(route: string, body?: unknown, options?: { keepalive?: boolean }): Promise<Run | null | undefined>;
    subscribe(id: string, listener: (event: Event) => void): () => void;
    changed(): void;
    finished(run: Run, discovery?: Discovery): Promise<unknown> | void;
    executeStep?(step: Step): Promise<unknown>;
    stepFailed?(error: unknown): void;
    lockStep?(id: string, run: () => Promise<void>): Promise<void>;
}

type WorldActivation = {
    world?: unknown; uid?: unknown; content?: unknown; position?: unknown; depth?: unknown;
    role?: unknown; order?: unknown; useProbability?: unknown; probability?: unknown;
};

/** Capture the active world entries and scan-enabled extension prompts for a request. */
export async function captureWorkspaceWorldRuntime(
    activations: Iterable<readonly [unknown, WorldActivation]>,
    extensionPrompts: Record<string, { scan?: unknown }>,
    getPrompt: (key: string, prompts: Record<string, { scan?: unknown }>) => Promise<string>,
) {
    const worldInfo = Array.from(activations, ([, { world, uid, content, position, depth, role, order, useProbability, probability }]) =>
        ({ world, uid, content, position, depth, role, order, useProbability, probability }));
    const promptMap = { ...extensionPrompts };
    const scanPrompts: string[] = [];
    for (const key of Object.keys(promptMap)) {
        if (!promptMap[key].scan) continue;
        const text = await getPrompt(key, promptMap);
        if (text) scanPrompts.push(text);
    }
    return { worldInfo, scanPrompts };
}

/** Transport for workspace generation; the shell supplies its current request headers. */
export function createWorkspaceGenerationRequest(getRequestHeaders: () => HeadersInit) {
    return async function workspaceGenerationRequest(route: string, body?: unknown, { keepalive = false } = {}) {
        const response = await fetch(`/api/chats/generation${route}`, {
            method: body === undefined ? 'GET' : 'POST', headers: getRequestHeaders(), body: JSON.stringify(body), keepalive,
        });
        if (response.status === 204) return;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Generation request failed');
        return result;
    };
}

type ComposerSnapshot = { contextKey: string; contextRevision: unknown };
type Activation = readonly [unknown, WorldActivation];
type AttachmentCapture = { attachments: unknown; clearFiles(): void };
type PreviewResponse = {
    connection: { model: unknown }; messages: { role: string }[];
    budget: { responseTokens: number; contextTokens: number; promptTokens: number };
    tools?: unknown[]; toolChoice?: unknown; maxTokens?: number; reasoningEffort?: unknown; previewPipeline?: unknown;
};
type HistoryMessage = { is_system?: boolean; is_user?: boolean; mes?: unknown; extra?: { files?: unknown; media?: unknown; tool_invocations?: unknown } };

/** Snapshot the temporary-chat history while leaving persistent target lookup in the shell. */
export function getWorkspaceGenerationTargetSnapshot(ports: {
    characterSelected: boolean; characterName: string; neutralName: string; preview: boolean;
    hasDraft(): boolean; history: HistoryMessage[]; current(): Target | null | undefined;
}) {
    if (!ports.characterSelected && (ports.characterName === ports.neutralName || (ports.preview && ports.hasDraft()))) {
        return { temporary: true, history: ports.history.filter(message => !message.is_system).map(({ is_user, mes, extra }) => ({
            is_user, mes, extra: { files: extra?.files, media: extra?.media, tool_invocations: extra?.tool_invocations },
        })) };
    }
    return ports.current();
}

interface PreparationPorts {
    generation: ReturnType<typeof createWorkspaceGeneration>;
    target(options?: { preview?: boolean }): Target | null | undefined;
    snapshot(): ComposerSnapshot;
    ownsComposer(snapshot: ComposerSnapshot): boolean;
    text(): string;
    requestId(): string;
    activations(): Activation[];
    captureWorld(activations: Activation[]): ReturnType<typeof captureWorkspaceWorldRuntime>;
    consumeActivations(activations: Activation[]): void;
    hasAttachments(): boolean;
    captureAttachments(owns: () => boolean, isCurrent: () => boolean): Promise<AttachmentCapture | null>;
    stageAttachments(isCurrent: () => boolean): Promise<unknown[]>;
    flushSettings(): Promise<unknown>;
    locale(): string;
    preview(body: unknown): Promise<PreviewResponse>;
    userName(): string;
    clearViewport(): void;
    beginViewport(action: string, requestId: string, composer: ComposerSnapshot): void;
    scrollForPreparation(): void;
    missingTarget(): void;
    error(error: unknown): void;
}

/** Prepare sends and previews against shell state without owning it. */
export function createWorkspaceGenerationPreparation(ports: PreparationPorts) {
    const { generation } = ports;
    async function start(action: string, text?: string) {
        if (generation.busy()) return false;
        const target = ports.target();
        if (!target) { ports.missingTarget(); return false; }
        const activations = ports.activations();
        const composer = ports.snapshot();
        const isCurrent = () => ports.ownsComposer(composer);
        const requestId = ports.requestId();
        ports.clearViewport();
        const prepared = action === 'continue' ? undefined : generation.prepare(target, { action, text, requestId });
        ports.beginViewport(action, requestId, composer);
        const ownsPreparation = () => Boolean(isCurrent() && (!prepared || generation.ownsPreparation(prepared)));
        if (prepared && action !== 'send') ports.scrollForPreparation();
        let creating = false;
        try {
            let attachmentCapture: AttachmentCapture | undefined;
            if (action === 'send' && ports.hasAttachments()) {
                const captured = await ports.captureAttachments(ownsPreparation, isCurrent);
                if (!captured) return false;
                attachmentCapture = captured;
            }
            const worldRuntime = await ports.captureWorld(activations);
            if (!ownsPreparation()) return false;
            await ports.flushSettings();
            if (!ownsPreparation() || (!prepared && generation.busy())) return false;
            creating = true;
            const run = await generation.create(target, { action, text, attachments: attachmentCapture?.attachments, ...worldRuntime, requestId, locale: ports.locale() }, prepared);
            if (!run) return false;
            attachmentCapture?.clearFiles();
            ports.consumeActivations(activations);
            return true;
        } catch (error) {
            if (ownsPreparation() || (creating && isCurrent())) ports.error(error);
            return false;
        } finally {
            generation.releasePreparation(prepared);
        }
    }
    async function preview(round = 0) {
        const target = ports.target({ preview: true });
        if (!target) return { kind: 'prompt-preview-empty', reason: 'No chat selected', warnings: [] };
        const text = ports.text();
        const composer = ports.snapshot();
        const draftAttachments = ports.hasAttachments() ? await ports.stageAttachments(() => ports.ownsComposer(composer)) : [];
        const worldRuntime = await ports.captureWorld(ports.activations());
        if (!ports.ownsComposer(composer)) return { kind: 'prompt-preview-empty', reason: 'Selected chat changed', warnings: [] };
        await ports.flushSettings();
        if (!ports.ownsComposer(composer)) return { kind: 'prompt-preview-empty', reason: 'Selected chat changed', warnings: [] };
        const { connection, messages, budget, tools, toolChoice, maxTokens, reasoningEffort, previewPipeline } = await ports.preview({
            ...target, action: 'send', text: text || undefined, locale: ports.locale(), round,
            ...worldRuntime, ...(draftAttachments.length ? { draftAttachments } : {}),
        });
        return {
            kind: 'prompt-preview', type: 'normal', model: connection.model, stream: true,
            request: { model: connection.model, messages, max_tokens: maxTokens ?? budget.responseTokens, stream: true,
                ...(tools?.length ? { tools, tool_choice: toolChoice } : {}), ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}) },
            entries: [], dropped: [], summarized: [], pipeline: previewPipeline ?? null, warnings: [],
            pendingMessage: text ? { name: ports.userName(), mes: text } : null, pendingEntryIdentifier: null,
            messagesInContext: messages.filter(message => ['user', 'assistant'].includes(message.role)).length,
            budget: { context: budget.contextTokens, response: budget.responseTokens, used: budget.promptTokens,
                remaining: budget.contextTokens - budget.responseTokens - budget.promptTokens, totalTokens: budget.promptTokens + budget.responseTokens },
        };
    }
    return { start, preview };
}

/** Owns only the currently selected chat's transient subscription. */
export function createWorkspaceGeneration({ request, subscribe, changed, finished, executeStep, stepFailed, lockStep = (_id, run) => run() }: Ports) {
    let selection: View | undefined;
    const results = new Map<string | undefined, Promise<unknown>>();

    async function runTemporaryStep(view: RunningView, route: string, step: Step) {
        if (view.stepId === step.id) return;
        view.stepId = step.id;
        try {
            // handleStep only dispatches temporary steps when executeStep is installed.
            const result = await (executeStep as NonNullable<typeof executeStep>)(step);
            if (selection === view) await request(`${route}/step`, { stepId: step.id, result });
        } catch (error) {
            if (selection !== view || view.run.status !== 'running') return;
            try {
                stepFailed?.(error);
            } finally {
                await request(`${route}/cancel`, {});
            }
        }
    }

    async function handleStep(view: RunningView, step: Step | undefined) {
        if (!step || !executeStep) return;
        await lockStep(step.id, async () => {
            if (selection !== view) return;
            const route = `/${view.run.id}`;
            // The run-detail endpoint returns the current run, including its pending step.
            const current = await request(route, undefined) as Run;
            if (selection !== view || current.step?.id !== step.id) {
                if (current.step?.id !== step.id) results.delete(step.id);
                return;
            }
            if (view.target.temporary) return runTemporaryStep(view, route, current.step);
            if (!results.has(step.id)) results.set(step.id, Promise.resolve(executeStep(current.step)));
            view.stepId = step.id;
            const result = await results.get(step.id);
            await request(`${route}/step`, { stepId: step.id, result });
            results.delete(step.id);
        });
    }
    function detach() {
        const view = selection;
        selection = undefined;
        view?.detach?.();
        clearTimeout(view?.waitTimer);

        changed();
    }

    function leaveTemporary() {
        const view = selection;
        if (!view?.target.temporary) return false;
        detach();
        if (view.creating || view.run?.status === 'running' || view.run?.status === 'interrupted') {
            // The request ID exists even before /create returns a run ID.
            void request('/cancel', { temporary: true, requestId: view.requestId }, { keepalive: true }).catch(() => {});
        }
        return true;
    }

    const close = () => {
        if (!leaveTemporary()) detach();
    };

    const current = () => selection?.run?.status === 'running' ? selection : null;
    const pending = () => selection && selection.kind !== 'continue' && (selection.preparing || selection.creating) && !selection.run;

    function startWaiting(view: View) {
        if (view.kind !== 'send' || view.waitTimer !== undefined || view.waiting) return;
        view.waitTimer = setTimeout(() => {
            if (selection !== view || view.text) return;
            view.waiting = true;
            changed();
        }, 250);
    }

    function settle(view: RunningView, discovery?: Discovery) {
        results.delete(view.stepId);
        view.detach?.();
        view.detach = undefined;
        clearTimeout(view.waitTimer);
        view.waiting = false;
        const reconcile = finished(view.run, discovery);
        if (!discovery && !view.run.temporary && reconcile && (view.kind === 'send' || (view.kind === 'regenerate' && view.run.status === 'completed'))) {
            view.reconciling = true;
            const release = () => { if (selection === view) detach(); };
            void reconcile.then(release, release);
        } else if (view.kind === 'regenerate' && !['failed', 'interrupted'].includes(view.run.status) && selection === view) {
            selection = undefined;
        }
        changed();
    }

    function attach(view: View, run: Run, discovery?: Discovery) {
        view.run = run;
        const runningView = view as RunningView;
        view.kind = run.kind ?? view.kind;
        view.discovered = Boolean(discovery);
        if (run.status !== 'running') {
            settle(runningView, discovery);
            return;
        }
        startWaiting(view);
        changed();
        view.detach = subscribe(run.id, event => {
            if (selection !== view) return;
            if (event.type === 'snapshot') {
                view.text = event.text;
                view.run = event.run;
                view.invocations = event.invocations;
            } else if (event.type === 'delta') {
                view.text = event.reset ? event.text : view.text + event.text;
            } else if (event.type === 'invocation') {
                (view.invocations ??= []).push(event.invocation);
            } else if (event.type === 'terminal') {
                view.run = event.run;
            } else if (event.type === 'disconnected' && runningView.run.temporary) {
                runningView.run = { ...runningView.run, status: 'interrupted' };
            }
            if (runningView.run.status !== 'running') {
                settle(runningView);
                return;
            }
            if (view.text) clearTimeout(view.waitTimer);
            if (runningView.run.status === 'running' && (event.type === 'step' || event.type === 'snapshot')) {
                // A reconnect repeats the pending step but never an accepted result.
                void handleStep(runningView, event.step).catch(() => {});
            }
            changed();
        });
    }

    function begin(target: Target, { action, text = '', requestId }: Command) {
        close();
        const view: View = { target, kind: action, text: '', pendingText: text, requestId };
        selection = view;
        return view;
    }

    function cancelRun(view: View, run: Run) {
        if (run.status !== 'running') return run;
        // The per-run cancellation endpoint returns the resulting run.
        return view.cancellation ??= (request(`/${run.id}/cancel`, {}) as Promise<Run>).catch(error => {
            view.cancellation = undefined;
            throw error;
        });
    }

    return {
        current,
        display: () => current() ?? (pending() || selection?.reconciling ? selection : null),
        failedReply: () => selection?.run?.status === 'failed' ? selection.run : undefined,
        canStop: () => Boolean(current() || pending()),
        busy: () => Boolean(selection?.preparing || selection?.creating || selection?.reconciling || current()),
        close,
        leaveTemporary,
        prepare(target: Target, command: Command) {
            const view = begin(target, command);
            view.preparing = true;
            startWaiting(view);
            changed();
            return view;
        },
        ownsPreparation: (view: View) => selection === view && view.preparing,
        releasePreparation(view?: View) {
            if (view && selection === view && view.preparing) detach();
        },
        async select(target: Target | null | undefined, reconciledChatVersion?: unknown) {
            close();
            if (!target) return;
            const view: View = { target, text: '', pendingText: '' };
            selection = view;
            const run = await request('/find', target);
            if (selection === view && run) attach(view, run, { discovered: true, reconciledChatVersion });
        },
        async create(target: Target, command: Command, prepared?: View) {
            if (prepared && selection !== prepared) return;
            const view = prepared ?? begin(target, command);
            view.preparing = false;
            view.creating = true;
            changed();
            try {
                // The create endpoint returns the created run.
                let run = await request('/create', { ...target, ...command }) as Run;
                if (view.stopRequested) {
                    try {
                        run = await cancelRun(view, run);
                    } catch (error) {
                        if (selection === view) attach(view, run);
                        throw error;
                    }
                }
                view.creating = false;
                if (selection === view) attach(view, run);
                else if (target.temporary) return;
                return run;
            } catch (error) {
                if (selection === view || !target.temporary) throw error;
            } finally {
                view.creating = false;
                if (selection === view && !view.run) detach();
            }
        },
        async cancel() {
            // Both branches below are entered only when the selected view exists.
            const view = selection as View;
            if (current()) {
                await cancelRun(view, (view as RunningView).run);
            } else if (pending()) {
                if (view.preparing) return detach();
                if (view.stopRequested) return;
                view.stopRequested = true;
                try {
                    if (view.target.temporary) {
                        await request('/cancel', { temporary: true, requestId: view.requestId });
                        return;
                    }
                    const run = await request('/find', view.target);
                    if (run?.requestId !== view.requestId) return;
                    // Keep the existing request-ID comparison and cancellation behavior.
                    const terminal = await cancelRun(view, run as Run);
                    if (selection === view && !view.run) {
                        view.creating = false;
                        attach(view, terminal);
                    }
                } catch (error) {
                    if (selection === view && !view.run) view.stopRequested = false;
                    throw error;
                }
            }
        },
    };
}
