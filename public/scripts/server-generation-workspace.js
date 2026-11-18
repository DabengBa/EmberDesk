/** Owns only the currently selected chat's transient subscription. */
export function createWorkspaceGeneration({ request, subscribe, changed, finished, executeStep, lockStep = (_id, run) => run() }) {
    let selection;
    const results = new Map();

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
            if (!results.has(step.id)) results.set(step.id, Promise.resolve(executeStep(current.step)));
            view.stepId = step.id;
            const result = await results.get(step.id);
            await request(`${route}/step`, { stepId: step.id, result });
            results.delete(step.id);
        });
    }
    const close = () => {
        selection?.detach?.();
        selection = undefined;
        changed();
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
            const view = { target, text: '', pendingText: command.text, creating: true };
            selection = view;
            changed();
            try {
                const run = await request('/create', { ...target, ...command });
                if (selection === view) attach(view, run);
                return run;
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
