/** Storage is injected so quota, account isolation and recovery can be tested. */
export interface RecoveryStorage {
    getItem(key: string): Promise<unknown>;
    setItem(key: string, value: unknown): Promise<unknown>;
    keys(): Promise<string[]>;
}

export interface RecoveryDraft {
    version: 1;
    id: string;
    identity: { avatar: string; chat: string };
    updatedAt: number;
    snapshot: unknown;
    restoreRequest?: RecoveryRestoreRequest;
}

export interface RecoveryRestoreRequest {
    avatar_url: string;
    file_name: string;
    create: true;
    operationId: string;
    chat: unknown[];
}

export function getRecoveryUnsentText(snapshot: unknown): Array<{ kind: 'composer' | 'message' | 'reasoning'; messageId?: string; text: string }> {
    if (!snapshot || typeof snapshot !== 'object') return [];
    const value = snapshot as { composer?: { value?: unknown }; editor?: unknown };
    const result: Array<{ kind: 'composer' | 'message' | 'reasoning'; messageId?: string; text: string }> = [];
    if (typeof value.composer?.value === 'string' && value.composer.value) result.push({ kind: 'composer', text: value.composer.value });
    if (Array.isArray(value.editor)) for (const entry of value.editor) {
        if (!Array.isArray(entry) || entry.length < 2 || !entry[1] || typeof entry[1] !== 'object') continue;
        const state = entry[1] as { editing?: unknown; editText?: unknown; reasoningEditing?: unknown; reasoningEditText?: unknown };
        const messageId = String(entry[0]);
        if (state.editing && typeof state.editText === 'string') result.push({ kind: 'message', messageId, text: state.editText });
        if (state.reasoningEditing && typeof state.reasoningEditText === 'string') result.push({ kind: 'reasoning', messageId, text: state.reasoningEditText });
    }
    return result;
}

interface StoredDelete {
    done: boolean;
    request: { avatar_url: string; chatfile: string; version: string; operationId: string };
}

/** Atomic operations use the same IndexedDB object store as recovery storage. */
export function createIndexedDbDeleteAtomic(database: string, storeName: string, ready: () => Promise<void>) {
    async function transact<T>(key: string, change: (value: StoredDelete | undefined) => { value?: StoredDelete; result: T }): Promise<T> {
        await ready();
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(database);
            request.onupgradeneeded = () => request.transaction?.abort();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('Recovery database unavailable'));
            request.onblocked = () => reject(new Error('Recovery database is blocked'));
        });
        try {
            return await new Promise<T>((resolve, reject) => {
                const transaction = db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                let result: T;
                let failure: unknown;
                const read = store.get(key);
                read.onsuccess = () => {
                    try {
                        const next = change(read.result as StoredDelete | undefined);
                        result = next.result;
                        if (next.value) store.put(next.value, key);
                    } catch (error) {
                        failure = error;
                        transaction.abort();
                    }
                };
                transaction.oncomplete = () => resolve(result);
                transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Recovery transaction aborted'));
                transaction.onerror = () => {};
            });
        } finally { db.close(); }
    }
    return {
        ready,
        select(key: string, candidate: StoredDelete) {
            return transact(key, current => {
                if (current && (typeof current.done !== 'boolean' || !current.request?.operationId)) throw new Error('Invalid saved deletion operation');
                return current && !current.done ? { result: current } : { value: candidate, result: candidate };
            });
        },
        confirm(key: string, operationId: string) {
            return transact(key, current => {
                if (!current) throw new Error('Deletion operation not found');
                if (!operationId || current.request?.operationId !== operationId) throw new Error('Deletion operation changed');
                return { value: { ...current, done: true }, result: undefined };
            });
        },
    };
}

export function createChatRecoveryDrafts(ports: { storage: RecoveryStorage; newId(): string; now(): number }) {
    const prefix = (account: string) => `recovery-v1:${encodeURIComponent(account)}:`;
    const keyFor = (account: string, id: string) => `${prefix(account)}${encodeURIComponent(id)}`;
    const writes = new Map<string, Promise<unknown>>();

    async function create(account: string, identity: RecoveryDraft['identity'], snapshot: unknown): Promise<RecoveryDraft> {
        const draft: RecoveryDraft = { version: 1, id: ports.newId(), identity: structuredClone(identity), updatedAt: ports.now(), snapshot: structuredClone(snapshot) };
        const key = keyFor(account, draft.id);
        if (await ports.storage.getItem(key) !== null) throw new Error('Recovery draft ID already exists');
        await ports.storage.setItem(key, draft);
        return draft;
    }

    async function update(account: string, id: string, snapshot: unknown): Promise<void> {
        const key = keyFor(account, id);
        const copy = structuredClone(snapshot);
        const write = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
            const draft = await ports.storage.getItem(key) as RecoveryDraft | null;
            if (!draft || draft.version !== 1 || draft.id !== id) throw new Error('Recovery draft not found');
            await ports.storage.setItem(key, { ...draft, updatedAt: ports.now(), snapshot: copy });
        });
        writes.set(key, write);
        try { await write; } finally { if (writes.get(key) === write) writes.delete(key); }
    }

    async function list(account: string): Promise<RecoveryDraft[]> {
        const keys = (await ports.storage.keys()).filter(key => key.startsWith(prefix(account)));
        const drafts = await Promise.all(keys.map(key => ports.storage.getItem(key)));
        return drafts.filter((draft): draft is RecoveryDraft => Boolean(draft && typeof draft === 'object' && (draft as RecoveryDraft).version === 1));
    }

    async function prepareRestore(account: string, id: string): Promise<RecoveryRestoreRequest> {
        const key = keyFor(account, id);
        const write = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
            const draft = await ports.storage.getItem(key) as RecoveryDraft | null;
            if (!draft || draft.version !== 1 || draft.id !== id) throw new Error('Recovery draft not found');
            if (draft.restoreRequest) return draft.restoreRequest;
            const snapshot = draft.snapshot as { messages?: unknown; metadata?: unknown } | null;
            if (!snapshot || !Array.isArray(snapshot.messages) || !snapshot.metadata || typeof snapshot.metadata !== 'object') throw new Error('Recovery draft has no valid chat snapshot');
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid recovery operation ID');
            const request: RecoveryRestoreRequest = {
                avatar_url: draft.identity.avatar,
                file_name: `Recovered-${id}`,
                create: true,
                operationId: id,
                chat: [{ user_name: 'unused', character_name: 'unused', chat_metadata: snapshot.metadata }, ...snapshot.messages],
            };
            await ports.storage.setItem(key, { ...draft, restoreRequest: structuredClone(request) });
            return request;
        });
        writes.set(key, write);
        try { return await write; } finally { if (writes.get(key) === write) writes.delete(key); }
    }

    return { create, update, list, prepareRestore };
}

export async function restoreChatRecoveryDraft(
    drafts: ReturnType<typeof createChatRecoveryDrafts>, account: string, id: string,
    send: (request: RecoveryRestoreRequest) => Promise<{ ok: boolean }>,
): Promise<string> {
    const request = await drafts.prepareRestore(account, id);
    const response = await send(request);
    if (!response.ok) throw new Error('Recovery copy could not be created');
    return request.file_name;
}

export function createConditionalHistoryDelete(ports: {
    storage: RecoveryStorage;
    newId(): string;
    runExclusive?<T>(key: string, operation: () => Promise<T>): Promise<T>;
    atomic?: { ready?(): Promise<void>; select(key: string, candidate: StoredDelete): Promise<StoredDelete>; confirm(key: string, operationId: string): Promise<void> };
    readVersion(identity: RecoveryDraft['identity']): Promise<string>;
    send(request: { avatar_url: string; chatfile: string; version: string; operationId: string }, context: { replay: boolean; versionLocked: boolean; account: string }): Promise<{ ok: boolean; status: number }>;
}) {
    const running = new Map<string, Promise<string>>();
    const keyFor = (account: string, identity: RecoveryDraft['identity']) => `delete-v1:${encodeURIComponent(account)}:${encodeURIComponent(identity.avatar)}:${encodeURIComponent(identity.chat)}`;
    function deleteHistory(account: string, identity: RecoveryDraft['identity'], withVersion?: (remove: (version: string) => Promise<void>) => Promise<void>, deferConfirmation = false): Promise<string> {
        const key = keyFor(account, identity);
        const current = running.get(key);
        if (current) return current;
        const execute = async () => {
            await ports.atomic?.ready?.();
            let stored = await ports.storage.getItem(key) as StoredDelete | null;
            let operationId = '';
            const send = async (value: StoredDelete, replay: boolean, versionLocked: boolean) => {
                const response = await ports.send(value.request, { replay, versionLocked, account });
                if (!response.ok) throw new Error(`Chat deletion failed (${response.status})`);
                if (!deferConfirmation) {
                    if (ports.atomic) await ports.atomic.confirm(key, value.request.operationId);
                    else await ports.storage.setItem(key, { ...value, done: true });
                }
                operationId = value.request.operationId;
            };
            if (stored && !stored.done) {
                await send(stored, true, false);
                return operationId;
            }
            const createAndSend = async (version: string, versionLocked: boolean) => {
                if (!version) throw new Error('Chat version is unavailable');
                const fresh: StoredDelete = { done: false, request: { avatar_url: identity.avatar, chatfile: `${identity.chat}.jsonl`, version, operationId: ports.newId() } };
                const selected = ports.atomic ? await ports.atomic.select(key, fresh) : fresh;
                if (!ports.atomic) await ports.storage.setItem(key, fresh);
                await send(selected, selected.request.operationId !== fresh.request.operationId, versionLocked);
            };
            if (withVersion) await withVersion(version => createAndSend(version, true));
            else await createAndSend(await ports.readVersion(identity), false);
            return operationId;
        };
        const operation = ports.runExclusive ? ports.runExclusive(key, execute) : execute();
        running.set(key, operation);
        void operation.finally(() => { if (running.get(key) === operation) running.delete(key); }).catch(() => {});
        return operation;
    }
    async function listPending(account: string): Promise<RecoveryDraft['identity'][]> {
        const prefix = `delete-v1:${encodeURIComponent(account)}:`;
        const keys = (await ports.storage.keys()).filter(key => key.startsWith(prefix));
        const entries = await Promise.all(keys.map(async key => ({ key, value: await ports.storage.getItem(key) as { done?: boolean; request?: { avatar_url?: string; chatfile?: string; version?: string; operationId?: string } } | null })));
        return entries.flatMap(({ key, value }) => {
            const request = value?.request;
            if (value?.done !== false || typeof request?.avatar_url !== 'string' || typeof request.chatfile !== 'string' || !request.chatfile.endsWith('.jsonl') || !request.version || !request.operationId) return [];
            const chat = request.chatfile.slice(0, -6);
            if (key !== `${prefix}${encodeURIComponent(request.avatar_url)}:${encodeURIComponent(chat)}`) return [];
            return [{ avatar: request.avatar_url, chat }];
        });
    }
    async function confirm(account: string, identity: RecoveryDraft['identity'], operationId: string): Promise<void> {
        const key = keyFor(account, identity);
        if (ports.atomic) return ports.atomic.confirm(key, operationId);
        const execute = async () => {
            const value = await ports.storage.getItem(key) as { done: boolean; request: { operationId: string } } | null;
            if (!value) throw new Error('Deletion operation not found');
            if (!operationId || value.request.operationId !== operationId) throw new Error('Deletion operation changed');
            await ports.storage.setItem(key, { ...value, done: true });
        };
        if (ports.runExclusive) await ports.runExclusive(key, execute);
        else await execute();
    }
    async function hasPending(account: string, identity: RecoveryDraft['identity']): Promise<boolean> {
        const value = await ports.storage.getItem(keyFor(account, identity)) as { done?: boolean } | null;
        return value?.done === false;
    }
    return Object.assign(deleteHistory, { listPending, confirm, hasPending });
}

/** Tracks the loaded session independently of the selected-character pointer. */
export function createPendingChatRecovery(ports: {
    account?(): string;
    create(identity: RecoveryDraft['identity'], snapshot: unknown, account: string | undefined): Promise<string>;
    update(id: string, snapshot: unknown, account: string | undefined): Promise<void>;
    snapshot(): unknown;
}) {
    let active: { identity: RecoveryDraft['identity']; account: string | undefined; ready: Promise<string>; detached: boolean; saved: string; writing: Promise<void> | null } | null = null;

    async function begin(identity: RecoveryDraft['identity']) {
        if (active) {
            if (active.identity.avatar !== identity.avatar || active.identity.chat !== identity.chat) throw new Error('A chat recovery operation is already active');
            const pending = active;
            await checkpoint();
            return { id: await pending.ready, identity: structuredClone(pending.identity) };
        }
        const copy = structuredClone(identity);
        const snapshot = structuredClone(ports.snapshot());
        const account = ports.account?.();
        const pending = { identity: copy, account, ready: ports.create(copy, snapshot, account), detached: false, saved: JSON.stringify(snapshot), writing: null as Promise<void> | null };
        active = pending;
        try {
            return { id: await pending.ready, identity: copy };
        } catch (error) {
            if (active === pending) active = null;
            throw error;
        }
    }

    async function checkpoint() {
        const pending = active;
        if (!pending || pending.detached) return;
        if (pending.writing) return pending.writing;
        const writing = writeCheckpoint(pending);
        pending.writing = writing;
        try { await writing; } finally { if (pending.writing === writing) pending.writing = null; }
    }

    async function writeCheckpoint(pending: NonNullable<typeof active>) {
        if (ports.account && ports.account() !== pending.account) throw new Error('Recovery account changed; return to the original account before clearing');
        const id = await pending.ready;
        // The user can keep editing while IndexedDB is committing. Recheck the
        // live state before allowing the caller to discard the loaded session.
        for (;;) {
            const snapshot = structuredClone(ports.snapshot());
            const serialized = JSON.stringify(snapshot);
            if (ports.account && ports.account() !== pending.account) throw new Error('Recovery account changed; return to the original account before clearing');
            await ports.update(id, snapshot, pending.account);
            pending.saved = serialized;
            if (ports.account && ports.account() !== pending.account) throw new Error('Recovery account changed; return to the original account before clearing');
            if (serialized === JSON.stringify(ports.snapshot())) break;
        }
    }

    async function checkpointIfChanged() {
        const pending = active;
        if (!pending || pending.detached) return;
        if (ports.account && ports.account() !== pending.account) throw new Error('Recovery account changed; return to the original account before clearing');
        if (pending.writing || JSON.stringify(ports.snapshot()) !== pending.saved) await checkpoint();
    }

    async function beforeClear() {
        const pending = active;
        if (!pending || pending.detached) return;
        await checkpoint();
        pending.detached = true;
        if (active === pending) active = null;
    }

    function release() { active = null; }
    function isActive(identity: RecoveryDraft['identity']) {
        return !!active && !active.detached && active.account === ports.account?.()
            && active.identity.avatar === identity.avatar && active.identity.chat === identity.chat;
    }
    return { begin, checkpoint, checkpointIfChanged, beforeClear, release, isActive };
}
