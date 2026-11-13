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

export interface BulkDeleteEffectPorts {
    chat: { length: number };
    metadata: { tainted?: boolean };
    prepare(): void;
    isReactOwner(): boolean;
    getIdentity(): unknown;
    removeLegacyRows(index: number): void;
    truncateUi(index: number): void;
    save(): Promise<unknown>;
    scrollLegacy(): void;
    emitDeleted(index: number): Promise<unknown>;
    refreshReact(identity: unknown): Promise<unknown>;
    markLegacyLast(): void;
    invalidSelection(): void;
    cleanup(): void;
}

export async function runBulkDeleteEffects(deletedFrom: number, ports: BulkDeleteEffectPorts) {
    ports.prepare();
    try {
        if (!(deletedFrom >= 0)) {
            ports.invalidSelection();
            return;
        }
        const reactOwner = ports.isReactOwner();
        const identity = reactOwner ? ports.getIdentity() : null;
        if (!reactOwner) ports.removeLegacyRows(deletedFrom);
        ports.chat.length = deletedFrom;
        if (reactOwner) ports.truncateUi(deletedFrom);
        ports.metadata.tainted = true;
        await ports.save();
        if (!reactOwner) ports.scrollLegacy();
        await ports.emitDeleted(deletedFrom);
        if (reactOwner) await ports.refreshReact(identity);
        else ports.markLegacyLast();
    } finally {
        ports.cleanup();
    }
}

export function selectLegacyDeleteRange(index: number, count: number, ports: {
    clear(): void; markClicked(): void; announce(index: number): void; select(index: number): void;
}) {
    ports.clear();
    ports.markClicked();
    ports.announce(index);
    for (let current = index; current < count; current++) ports.select(current);
}

export function createBulkDeleteController() {
    let state: BulkDeleteState = { active: false, selected: null, busy: false, summary: '', ariaLabel: 'Delete' };
    let selectHandler: ((selected: number) => void) | undefined;
    const listeners = new Set<() => void>();
    function update(patch: Partial<BulkDeleteState>) {
        state = { ...state, ...patch };
        listeners.forEach(listener => listener());
    }
    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        open(summary: string) { update({ active: true, selected: null, busy: false, summary, ariaLabel: 'Delete' }); },
        setSelectionHandler(handler: (selected: number) => void) { selectHandler = handler; },
        choose(selected: number) { if (state.active && !state.busy) selectHandler?.(selected); },
        select(selected: number, summary: string, ariaLabel: string) {
            if (!state.busy) update({ selected, summary, ariaLabel });
        },
        begin(summary: string) {
            if (state.busy || state.selected === null) return false;
            update({ busy: true, summary });
            return true;
        },
        async confirm(summary: string, operation: (selected: number) => void | Promise<void>) {
            if (state.busy || state.selected === null) return;
            const selected = state.selected;
            update({ busy: true, summary });
            try {
                await operation(selected);
            } finally {
                update({ active: false, selected: null, busy: false });
            }
        },
        runEffects: runBulkDeleteEffects,
        selectLegacyRange: selectLegacyDeleteRange,
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
