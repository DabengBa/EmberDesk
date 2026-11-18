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

    function attach(view, run, discovery) {
        view.run = run;
        changed();
        if (run.status !== 'running') {
            finished(run, discovery);
            return;
        }
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
                results.delete(view.stepId);
                view.detach?.();
                view.text = '';
                view.pendingText = '';
                finished(view.run);
            }
            if (view.run.status === 'running' && (event.type === 'step' || event.type === 'snapshot')) {
                // A reconnect repeats the pending step but never an accepted result.
                void handleStep(view, event.step).catch(() => {});
            }
            changed();
        });
    }

    return {
        current: () => selection?.run?.status === 'running' ? selection : null,
        busy: () => Boolean(selection?.creating || selection?.run?.status === 'running'),
        close,
        leaveTemporary,
        async select(target, reconciledChatVersion) {
            close();
            if (!target) return;
            const view = { target, text: '', pendingText: '' };
            selection = view;
            const run = await request('/find', target);
            if (selection === view && run) attach(view, run, { discovered: true, reconciledChatVersion });
        },
        async create(target, command) {
            close();
            const view = { target, text: '', pendingText: command.text, creating: true, requestId: command.requestId };
            selection = view;
            changed();
            try {
                const run = await request('/create', { ...target, ...command });
                if (selection === view) attach(view, run);
                else if (target.temporary) return;
                return run;
            } catch (error) {
                if (selection === view || !target.temporary) throw error;
            } finally {
                view.creating = false;
                if (selection === view) changed();
            }
        },
        async cancel() {
            const view = selection;
            if (view?.run?.status === 'running') await request(`/${view.run.id}/cancel`, {});
        },
    };
}
