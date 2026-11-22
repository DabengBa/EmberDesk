/** Owns only the currently selected chat's transient subscription. */
export function createWorkspaceGeneration({ request, subscribe, changed, finished, executeStep, stepFailed, lockStep = (_id, run) => run() }) {
    let selection;
    const results = new Map();

    async function runTemporaryStep(view, route, step) {
        if (view.stepId === step.id) return;
        view.stepId = step.id;
        try {
            const result = await executeStep(step);
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

    async function handleStep(view, step) {
        if (!step || !executeStep) return;
        await lockStep(step.id, async () => {
            if (selection !== view) return;
            const route = `/${view.run.id}`;
            const current = await request(route, undefined);
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

    function startWaiting(view) {
        if (view.kind !== 'send' || view.waitTimer !== undefined || view.waiting) return;
        view.waitTimer = setTimeout(() => {
            if (selection !== view || view.text) return;
            view.waiting = true;
            changed();
        }, 250);
    }

    function settle(view, discovery) {
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

    function attach(view, run, discovery) {
        view.run = run;
        view.kind = run.kind ?? view.kind;
        view.discovered = Boolean(discovery);
        if (run.status !== 'running') {
            settle(view, discovery);
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
            } else if (event.type === 'disconnected' && view.run.temporary) {
                view.run = { ...view.run, status: 'interrupted' };
            }
            if (view.run.status !== 'running') {
                settle(view);
                return;
            }
            if (view.text) clearTimeout(view.waitTimer);
            if (view.run.status === 'running' && (event.type === 'step' || event.type === 'snapshot')) {
                // A reconnect repeats the pending step but never an accepted result.
                void handleStep(view, event.step).catch(() => {});
            }
            changed();
        });
    }

    function begin(target, { action, text = '', requestId }) {
        close();
        const view = { target, kind: action, text: '', pendingText: text, requestId };
        selection = view;
        return view;
    }

    function cancelRun(view, run) {
        if (run.status !== 'running') return run;
        return view.cancellation ??= request(`/${run.id}/cancel`, {}).catch(error => {
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
        prepare(target, command) {
            const view = begin(target, command);
            view.preparing = true;
            startWaiting(view);
            changed();
            return view;
        },
        ownsPreparation: view => selection === view && view.preparing,
        releasePreparation(view) {
            if (view && selection === view && view.preparing) detach();
        },
        async select(target, reconciledChatVersion) {
            close();
            if (!target) return;
            const view = { target, text: '', pendingText: '' };
            selection = view;
            const run = await request('/find', target);
            if (selection === view && run) attach(view, run, { discovered: true, reconciledChatVersion });
        },
        async create(target, command, prepared) {
            if (prepared && selection !== prepared) return;
            const view = prepared ?? begin(target, command);
            view.preparing = false;
            view.creating = true;
            changed();
            try {
                let run = await request('/create', { ...target, ...command });
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
            const view = selection;
            if (current()) {
                await cancelRun(view, view.run);
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
                    const terminal = await cancelRun(view, run);
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
