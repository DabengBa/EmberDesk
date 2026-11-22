/* eslint-disable */
// Generated from app/lib/generation/workspace.ts; run pnpm run build:generation-state.























/** Capture the active world entries and scan-enabled extension prompts for a request. */
export async function captureWorkspaceWorldRuntime(
    activations                                               ,
    extensionPrompts                                    ,
    getPrompt                                                                               ,
) {
    const worldInfo = Array.from(activations, ([, { world, uid, content, position, depth, role, order, useProbability, probability }]) =>
        ({ world, uid, content, position, depth, role, order, useProbability, probability }));
    const promptMap = { ...extensionPrompts };
    const scanPrompts           = [];
    for (const key of Object.keys(promptMap)) {
        if (!promptMap[key].scan) continue;
        const text = await getPrompt(key, promptMap);
        if (text) scanPrompts.push(text);
    }
    return { worldInfo, scanPrompts };
}

/** Transport for workspace generation; the shell supplies its current request headers. */
export function createWorkspaceGenerationRequest(getRequestHeaders                   ) {
    return async function workspaceGenerationRequest(route        , body          , { keepalive = false } = {}) {
        const response = await fetch(`/api/chats/generation${route}`, {
            method: body === undefined ? 'GET' : 'POST', headers: getRequestHeaders(), body: JSON.stringify(body), keepalive,
        });
        if (response.status === 204) return;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Generation request failed');
        return result;
    };
}











/** Snapshot the temporary-chat history while leaving persistent target lookup in the shell. */
export function getWorkspaceGenerationTargetSnapshot(ports


 ) {
    if (!ports.characterSelected && (ports.characterName === ports.neutralName || (ports.preview && ports.hasDraft()))) {
        return { temporary: true, history: ports.history.map(({ is_user, is_system, mes, extra }) => ({
            is_user: is_user === true, is_system, mes: String(mes ?? ''), extra: { api: extra?.api, type: extra?.type, files: extra?.files, media: extra?.media, tool_invocations: extra?.tool_invocations },
        })) };
    }
    return ports.current();
}

























/** Prepare sends and previews against shell state without owning it. */
export function createWorkspaceGenerationPreparation(ports                  ) {
    const { generation } = ports;
    async function start(action        , text         ) {
        if (generation.busy()) return false;
        const target = ports.target();
        if (!target) { ports.missingTarget(); return false; }
        const activations = ports.activations();
        const composer = ports.snapshot();
        const isCurrent = () => ports.ownsComposer(composer);
        const requestId = ports.requestId();
        ports.clearViewport();
        const prepared = generation.prepare(target, { action, text, requestId });
        ports.beginViewport(action, requestId, composer);
        const ownsPreparation = () => Boolean(isCurrent() && generation.ownsPreparation(prepared));
        if (action !== 'send') ports.scrollForPreparation();
        let creating = false;
        try {
            let attachmentCapture                               ;
            if (action === 'send' && ports.hasAttachments()) {
                const captured = await ports.captureAttachments(ownsPreparation, isCurrent);
                if (!captured) return false;
                attachmentCapture = captured;
            }
            const worldRuntime = await ports.captureWorld(activations);
            if (!ownsPreparation()) return false;
            await ports.flushSettings();
            if (!ownsPreparation()) return false;
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
    async function preview(round = 0, action = 'send') {
        const send = action === 'send';
        const target = ports.target({ preview: send });
        if (!target) return { kind: 'prompt-preview-empty', reason: 'No chat selected', warnings: [] };
        const text = send ? ports.text() : '';
        const composer = ports.snapshot();
        const draftAttachments = send && ports.hasAttachments() ? await ports.stageAttachments(() => ports.ownsComposer(composer)) : [];
        const worldRuntime = await ports.captureWorld(ports.activations());
        if (!ports.ownsComposer(composer)) return { kind: 'prompt-preview-empty', reason: 'Selected chat changed', warnings: [] };
        await ports.flushSettings();
        if (!ports.ownsComposer(composer)) return { kind: 'prompt-preview-empty', reason: 'Selected chat changed', warnings: [] };
        const { connection, messages, budget, tools, toolChoice, maxTokens, reasoningEffort, previewPipeline } = await ports.preview({
            ...target, action, text: text || undefined, locale: ports.locale(), round,
            ...worldRuntime, ...(draftAttachments.length ? { draftAttachments } : {}),
        });
        return {
            kind: 'prompt-preview', type: send ? 'normal' : action, model: connection.model, stream: true,
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
export function createWorkspaceGeneration({ request, subscribe, changed, finished, executeStep, stepFailed, lockStep = (_id, run) => run() }       ) {
    let selection                  ;
    const results = new Map                                      ();

    async function runTemporaryStep(view             , route        , step      ) {
        if (view.stepId === step.id) return;
        view.stepId = step.id;
        try {
            // handleStep only dispatches temporary steps when executeStep is installed.
            const result = await (executeStep                                   )(step);
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

    async function handleStep(view             , step                  ) {
        if (!step || !executeStep) return;
        await lockStep(step.id, async () => {
            if (selection !== view) return;
            const route = `/${view.run.id}`;
            // The run-detail endpoint returns the current run, including its pending step.
            const current = await request(route, undefined)       ;
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
    const pending = () => selection && (selection.preparing || selection.creating) && !selection.run;

    function startWaiting(view      ) {
        if (view.kind !== 'send' || view.waitTimer !== undefined || view.waiting) return;
        view.waitTimer = setTimeout(() => {
            if (selection !== view || view.text) return;
            view.waiting = true;
            changed();
        }, 250);
    }

    function settle(view             , discovery            ) {
        results.delete(view.stepId);
        view.detach?.();
        view.detach = undefined;
        clearTimeout(view.waitTimer);
        view.waiting = false;
        const reconcile = finished(view.run, discovery);
        if (!discovery && !view.run.temporary && reconcile && (view.kind === 'send' || view.run.status === 'completed')) {
            view.reconciling = true;
            const release = () => { if (selection === view) detach(); };
            void reconcile.then(release, release);
        } else if (view.kind === 'regenerate' && !['failed', 'interrupted'].includes(view.run.status) && selection === view) {
            selection = undefined;
        }
        changed();
    }

    function attach(view      , run     , discovery            ) {
        view.run = run;
        const runningView = view               ;
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

    function begin(target        , { action, text = '', requestId }         ) {
        close();
        const view       = { target, kind: action, text: '', pendingText: text, requestId };
        selection = view;
        return view;
    }

    function cancelRun(view      , run     ) {
        if (run.status !== 'running') return run;
        // The per-run cancellation endpoint returns the resulting run.
        return view.cancellation ??= (request(`/${run.id}/cancel`, {})                ).catch(error => {
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
        prepare(target        , command         ) {
            const view = begin(target, command);
            view.preparing = true;
            startWaiting(view);
            changed();
            return view;
        },
        ownsPreparation: (view      ) => selection === view && view.preparing,
        releasePreparation(view       ) {
            if (view && selection === view && view.preparing) detach();
        },
        async select(target                           , reconciledChatVersion          ) {
            close();
            if (!target) return;
            const view       = { target, text: '', pendingText: '' };
            selection = view;
            const run = await request('/find', target);
            if (selection === view && run) attach(view, run, { discovered: true, reconciledChatVersion });
        },
        async create(target        , command         , prepared       ) {
            if (prepared && selection !== prepared) return;
            const view = prepared ?? begin(target, command);
            view.preparing = false;
            view.creating = true;
            changed();
            try {
                // The create endpoint returns the created run.
                let run = await request('/create', { ...target, ...command })       ;
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
            const view = selection        ;
            if (current()) {
                await cancelRun(view, (view               ).run);
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
                    const terminal = await cancelRun(view, run       );
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
