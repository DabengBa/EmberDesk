export function mergeAttachmentFiles<T>(existing: Iterable<T>, incoming: Iterable<T>, isSame: (a: T, b: T) => boolean): T[] {
    const files = Array.from(existing);
    for (const file of incoming) if (!files.some(current => isSame(current, file))) files.push(file);
    return files;
}

export function createExportPopupDismissal(ports: { isOpen(): boolean; close(restoreFocus: boolean): void }) {
    return {
        key(key: string) {
            if (!ports.isOpen() || key !== 'Escape') return false;
            ports.close(true);
            return true;
        },
        pointer(inTrigger: boolean, inPopup: boolean) {
            if (!ports.isOpen() || inTrigger || inPopup) return false;
            ports.close(false);
            return true;
        },
    };
}

export function createExportPopupController<T>(ports: {
    position(trigger: T): void; show(): void; hide(): void; update(): void;
    focusFirst(): void; restoreFocus(trigger: T): void;
}) {
    let open = false;
    let trigger: T;
    function close(restoreFocus = true) {
        ports.hide();
        open = false;
        ports.update();
        if (restoreFocus && trigger !== undefined) ports.restoreFocus(trigger);
    }
    return {
        isOpen: () => open,
        close,
        toggle(reference: T) {
            ports.position(reference);
            trigger = reference;
            if (open) return close();
            open = true;
            ports.show();
            ports.update();
            ports.focusFirst();
        },
    };
}

export function createHistoryRenameCommand(oldName: string, ports: {
    invalid(): void; busy(value: boolean): void; rename(name: string): Promise<boolean>; failed(): void;
}) {
    let renaming = false;
    return async (affirmative: boolean, input: string) => {
        if (renaming) return false;
        if (!affirmative) return true;
        const name = input.trim();
        if (!name) { ports.invalid(); return false; }
        if (name === oldName) return true;
        renaming = true;
        ports.busy(true);
        try {
            if (!await ports.rename(name)) { ports.failed(); return false; }
            return true;
        } finally {
            renaming = false;
            ports.busy(false);
        }
    };
}

export async function deleteHistoryChat(file: string, slash: boolean, ports: {
    confirm(): Promise<boolean>; close(): void; showLoader(): { hide(): Promise<void> };
    remove(file: string): Promise<unknown>; hideMenu(): void; reopen(): void;
    schedule(callback: () => Promise<void>): void;
}) {
    if (!slash && !await ports.confirm()) return;
    ports.close();
    const loader = ports.showLoader();
    try { await ports.remove(`${file}.jsonl`); }
    catch (error) {
        await loader.hide();
        if (!slash) ports.reopen();
        throw error;
    }
    if (slash) {
        ports.hideMenu();
        await loader.hide();
    } else {
        ports.schedule(async () => { ports.reopen(); ports.hideMenu(); await loader.hide(); });
    }
}

export async function exportHistoryChat(format: string, alreadySaved: boolean, ports: {
    save(): Promise<unknown>; request(): Promise<{ ok: boolean; data: { message: string; result?: unknown } }>;
    wait(): Promise<unknown>; success(data: { message: string; result?: unknown }): void;
    failure(message: string): void; download(data: unknown, mime: string): void; log(data: unknown): void;
}) {
    if (!alreadySaved) await ports.save();
    try {
        const { ok, data } = await ports.request();
        ports.log(ok ? data : data.message);
        await ports.wait();
        if (!ok) { ports.failure(data.message); return; }
        ports.success(data);
        ports.download(data.result, format === 'txt' ? 'text/plain' : 'application/octet-stream');
    } catch (error) {
        const message = (error as Error).message;
        ports.log(`An error has occurred: ${message}`);
        await ports.wait();
        ports.failure(message);
    }
}

export async function runHistoryMenuAction(id: string, slash: boolean, ports: {
    hasCharacter(): boolean; isSending(): boolean; canRegenerate(): boolean;
    history(slash: boolean): Promise<void>; confirmNew(): Promise<boolean | null>; newChat(remove: boolean): Promise<void>;
    newAssistant(): Promise<void>; deleteMessages(slash: boolean): void; regenerate(): void;
    closeChat(): Promise<void>; memory(): Promise<void>; wireLog(): Promise<void>; backToMain(): void; attachFile(): void; closeMenu(): void;
}) {
    if (id === 'option_select_chat') {
        if ((ports.hasCharacter() && !ports.isSending()) || slash) await ports.history(slash);
    } else if (id === 'option_start_new_chat') {
        if (ports.hasCharacter() && !ports.isSending()) {
            const remove = await ports.confirmNew();
            if (remove === null) return;
            await ports.newChat(remove);
        }
        if (!ports.hasCharacter() && !ports.isSending()) await ports.newAssistant();
    } else if (id === 'option_back_to_main') ports.backToMain();
    else if (id === 'attachFile') ports.attachFile();
    else if (id === 'option_delete_mes') ports.deleteMessages(slash);
    else if (id === 'option_regenerate') { if (ports.canRegenerate()) ports.regenerate(); }
    else if (id === 'option_close_chat') await ports.closeChat();
    else if (id === 'option_chat_memory') await ports.memory();
    else if (id === 'option_wire_log') await ports.wireLog();
    ports.closeMenu();
}

export async function exportCharacter<T>(format: string, ports: {
    close(): void;
    save(): Promise<unknown>;
    request(format: string): Promise<{ ok: boolean; data: T }>;
    download(data: T): void | Promise<void>;
    failure(error?: unknown): void;
}) {
    if (!format) return;
    ports.close();
    try {
        await ports.save();
        const response = await ports.request(format);
        if (!response.ok) return ports.failure();
        await ports.download(response.data);
    } catch (error) {
        ports.failure(error);
    }
}

export function createOptionsMenuController(ports: { show(): void; hide(): void; focus(): void }) {
    let visible = false;
    function close(restoreFocus = false) {
        if (!visible) return;
        visible = false;
        ports.hide();
        if (restoreFocus) ports.focus();
    }
    const controller = {
        getSnapshot: () => visible,
        toggle() {
            if (visible) return close();
            visible = true;
            ports.show();
        },
        close,
        attach(button: EventTarget, documentTarget: EventTarget, inside: () => boolean) {
            const click = () => controller.toggle();
            const outside = () => { if (visible && !inside()) close(); };
            const keydown = (event: Event) => {
                const keyEvent = event as KeyboardEvent;
                if (keyEvent.key === 'Escape' && !keyEvent.isComposing) close(true);
            };
            button.addEventListener('click', click);
            documentTarget.addEventListener('click', outside);
            documentTarget.addEventListener('keydown', keydown);
            return () => {
                button.removeEventListener('click', click);
                documentTarget.removeEventListener('click', outside);
                documentTarget.removeEventListener('keydown', keydown);
            };
        },
    };
    return controller;
}

export async function importHistoryFiles<T extends { name: string }>(files: Iterable<T>, ports: { invalid(file: T): void; importFile(file: T, format: string): Promise<string[]>; complete(names: string[]): Promise<void> }) {
    const names: string[] = [];
    for (const file of files) {
        const format = file.name.match(/\.(\w+)$/)?.[1]?.toLowerCase();
        if (!format || !['json', 'jsonl'].includes(format)) {
            ports.invalid(file);
            continue;
        }
        names.push(...await ports.importFile(file, format));
    }
    await ports.complete(names);
    return names;
}

export interface HistoryChatRecord {
    file_name?: unknown;
    file_size?: unknown;
    message_count?: unknown;
    preview_message?: unknown;
    last_mes?: unknown;
}

export function createHistoryDisplayCommand<T>(ports: {
    load(query: unknown): Promise<T[]>;
    render(state: { searchQuery: string; currentChat: string; avatarImg: string; highlightNames: string[]; items: T[] }): Promise<unknown>;
    error(error: unknown): void;
}) {
    let generation = 0;
    return async (query: unknown, currentChat: string, avatarImg: string, highlightNames: string[]) => {
        const current = ++generation;
        try {
            const items = await ports.load(query);
            if (current !== generation) return;
            await ports.render({ searchQuery: String(query ?? ''), currentChat, avatarImg, highlightNames, items });
        } catch (error) {
            ports.error(error);
        }
    };
}

export function projectHistoryChats(records: HistoryChatRecord[], compareDates: (a: unknown, b: unknown) => number, formatDate: (value: unknown) => string) {
    return [...records].sort((a, b) => compareDates(a.last_mes, b.last_mes)).map(chat => ({
        fileName: String(chat.file_name ?? ''),
        fileSize: String(chat.file_size ?? ''),
        messageCount: Number(chat.message_count) || 0,
        preview: String(chat.preview_message ?? ''),
        dateLabel: formatDate(chat.last_mes),
    }));
}

/** Data and side effects remain supplied by the chat-operations adapter. */
export interface HistoryPanelPorts<T> {
    load(query: unknown, highlightNames: string[]): Promise<T[]>;
    focusSearch(): void;
    restoreFocus(): void;
    openChat?(fileName: string): Promise<void>;
    saveChat?(): Promise<void>;
    exportChat?(fileName: string, format: 'jsonl' | 'txt'): Promise<void>;
    renameChat?(fileName: string): Promise<void>;
    deleteChat?(fileName: string): Promise<void>;
}

export interface HistoryPanelState<T> {
    items: T[];
    searchQuery: string;
    highlightNames: string[];
    loading: boolean;
    busy: boolean;
    error: unknown;
    open: boolean;
}

export function createHistoryPanelController<T>(ports: HistoryPanelPorts<T>) {
    let generation = 0;
    let session = 0;
    let operation = 0;
    let renderedSelection: string | null = null;
    let state: HistoryPanelState<T> = { items: [], searchQuery: '', highlightNames: [], loading: false, busy: false, error: null, open: false };
    const listeners = new Set<() => void>();
    function update(patch: Partial<HistoryPanelState<T>>) {
        state = { ...state, ...patch };
        listeners.forEach(listener => listener());
    }
    async function displayChats(searchQuery = '', highlightNames: string[] = [], options?: { rawQuery: unknown }) {
        const current = ++generation;
        update({ open: true, loading: true, error: null, searchQuery, highlightNames });
        try {
            const items = await ports.load(options ? options.rawQuery : searchQuery, highlightNames);
            if (current !== generation) return false;
            update({ items, loading: false });
            return true;
        } catch (error) {
            if (current === generation) update({ error, loading: false });
            return false;
        }
    }
    function endSession() {
        generation++;
        session++;
        operation++;
        renderedSelection = null;
        update({ open: false, loading: false, busy: false });
    }
    function closeSelectChatPopup() {
        endSession();
        ports.restoreFocus();
    }
    async function runAction(action: () => Promise<void>, closeOnSuccess = false) {
        if (state.busy) return;
        const currentSession = session;
        const currentOperation = ++operation;
        update({ busy: true, error: null });
        try {
            await action();
            if (currentSession === session && currentOperation === operation && closeOnSuccess) closeSelectChatPopup();
        } catch (error) {
            if (currentSession === session && currentOperation === operation) update({ error });
        } finally {
            if (currentSession === session && currentOperation === operation) update({ busy: false });
        }
    }
    function openChat(fileName: string) {
        return runAction(async () => {
            if (!ports.openChat) throw new Error('History openChat port is not installed');
            await ports.openChat(fileName);
        }, true);
    }
    function exportChat(fileName: string, format: 'jsonl' | 'txt') {
        return runAction(async () => {
            if (!ports.saveChat || !ports.exportChat) throw new Error('History export ports are not installed');
            await ports.saveChat();
            await ports.exportChat(fileName, format);
        });
    }
    function project(items: T[], searchQuery: string, highlightNames: string[] = []) {
        update({ items, searchQuery, highlightNames, open: true, loading: false });
    }
    function renameChat(fileName: string) {
        return runAction(async () => {
            if (!ports.renameChat) throw new Error('History renameChat port is not installed');
            await ports.renameChat(fileName);
        });
    }
    function deleteChat(fileName: string) {
        return runAction(async () => {
            if (!ports.deleteChat) throw new Error('History deleteChat port is not installed');
            await ports.deleteChat(fileName);
        });
    }
    return {
        getSnapshot: () => state,
        getRenderedSelection: () => renderedSelection,
        commitRenderedSelection(fileName: string | null) { renderedSelection = fileName || null; },
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        displayChats,
        closeSelectChatPopup,
        endSession,
        project,
        setSearchQuery(searchQuery: string) {
            if (state.searchQuery === searchQuery) return;
            generation++;
            update({ searchQuery, loading: false });
        },
        openChat,
        exportChat,
        renameChat,
        deleteChat,
        focusSearch: ports.focusSearch,
    };
}
