export interface DialogueState {
    open: boolean;
    type: string;
    input: string;
    rows: number;
}

export interface DialoguePresentationPorts {
    show(): void;
    fadeIn(): void;
    fadeOut(): void;
    hide(kind: 'confirm' | 'cancel'): void;
    schedule(callback: () => void): void;
}

export function createDialoguePresentationController(ports: DialoguePresentationPorts) {
    let state: { content: unknown; revision: number } = { content: undefined, revision: 0 };
    let generation = 0;
    const listeners = new Set<() => void>();
    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        open(content: unknown) {
            generation++;
            state = { content, revision: state.revision + 1 };
            listeners.forEach(listener => listener());
            ports.show();
            ports.fadeIn();
        },
        close(kind: 'confirm' | 'cancel') {
            const closingGeneration = ++generation;
            ports.fadeOut();
            ports.schedule(() => {
                if (generation === closingGeneration) ports.hide(kind);
            });
        },
    };
}

export interface BulkDeleteState {
    active: boolean;
    selected: number | null;
    busy: boolean;
    summary: string;
    ariaLabel: string;
}

export function createBulkDeleteController() {
    let state: BulkDeleteState = { active: false, selected: null, busy: false, summary: '', ariaLabel: 'Delete' };
    const listeners = new Set<() => void>();
    function update(patch: Partial<BulkDeleteState>) {
        const snapshot = state = { ...state, ...patch };
        listeners.forEach(listener => listener());
        return snapshot;
    }
    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        open(summary: string) { if (!state.active) update({ active: true, selected: null, busy: false, summary, ariaLabel: 'Delete' }); },
        select(selected: number, summary: string, ariaLabel: string) {
            if (state.active && !state.busy) update({ selected, summary, ariaLabel });
        },
        async confirm(summary: string, operation: (selected: number) => unknown) {
            if (!state.active || state.busy || state.selected === null) return;
            const selected = state.selected;
            const confirming = update({ busy: true, summary });
            try {
                await operation(selected);
            } finally {
                if (state === confirming) update({ active: false, selected: null, busy: false });
            }
        },

        finish() { update({ active: false, selected: null, busy: false }); },
    };
}

let workspaceBulkDeleteController: ReturnType<typeof createBulkDeleteController> | undefined;
export function getWorkspaceBulkDeleteController() {
    return workspaceBulkDeleteController ??= createBulkDeleteController();
}

/** The DOM adapter supplies popup text and chrome; this owns its result. */
export function createDialogueController() {
    let state: DialogueState = { open: false, type: '', input: '', rows: 1 };
    let resolve: ((value: string | boolean) => void) | null = null;
    const listeners = new Set<() => void>();
    function update(patch: Partial<DialogueState>) {
        state = { ...state, ...patch };
        listeners.forEach(listener => listener());
    }
    function callPopup(type?: string, input = '', rows = 1): Promise<string | boolean> {
        return new Promise(done => {
            resolve = done;
            update({ open: true, type: type || state.type, input, rows });
        });
    }
    function confirmDialoguePopup() {
        const value = state.type === 'input' ? state.input : true;
        const done = resolve;
        resolve = null;
        update({ open: false, ...(state.type === 'input' ? { input: '' } : {}) });
        done?.(value);
    }
    function cancelDialoguePopup() {
        const done = resolve;
        resolve = null;
        update({ open: false, type: '' });
        done?.(false);
    }
    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        callPopup,
        setInput(input: string) { update({ input }); },
        confirmDialoguePopup,
        cancelDialoguePopup,
    };
}
