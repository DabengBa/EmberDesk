import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { findRegenerateTurnStart } from '../app/lib/generation/shared-state.ts';
import { withCanonicalTransaction } from './canonical-sqlite.ts';
import { getCanonicalChatSession } from './endpoints/canonical-chat-store.ts';
import { readCanonicalChatPayload } from './endpoints/canonical-chat-read-service.ts';
import type { CanonicalChatLocator } from './endpoints/canonical-chat-read-service.ts';
import { stageCanonicalChatPayloadWrite } from './endpoints/canonical-chat-write-service.ts';
import { ChatGenerationBusyError, generationDatabaseIdentity, isChatGenerationActive, isLiveChatGeneration, trackLiveChatGeneration } from './server-generation-lock.ts';

type Kind = 'send' | 'regenerate' | 'continue';
type Status = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
type RunRow = {
    id: string; chatId: string; requestId: string; kind: Kind; status: Status; version: string;
    error: string | null; createdAtMs: number; finishedAtMs: number | null;
};
export type GenerationRun = Readonly<RunRow & { temporary?: true; user?: object; assistant?: object }>;
export type BrowserGenerationStep = { id: string; name: string; args: object; actionBody: string };
export type PipelineInvocation = {
    id: string; name: string; displayName: string; parameters: string; result: string; error: boolean;
    pipeline: { runId: string; stepId: string; stepIndex: number; tool: string; display: string };
};
export class ServerGenerationExecutionError extends Error {
    readonly code: 'source_not_found' | 'invalid_config' | 'budget_exceeded';
    constructor(code: ServerGenerationExecutionError['code']) {
        super(code);
        this.code = code;
    }
}
export type GenerationChat = Readonly<{
    locator: CanonicalChatLocator; chatId: string; version: string; kind: Kind;
    payload: readonly object[]; original: object | null;
}>;
export type GenerationEvent =
    | { type: 'snapshot'; run: GenerationRun; text: string; step?: BrowserGenerationStep; invocations?: PipelineInvocation[] }
    | { type: 'delta'; text: string; reset?: true }
    | { type: 'step'; step: BrowserGenerationStep }
    | { type: 'invocation'; invocation: PipelineInvocation }
    | { type: 'terminal'; run: GenerationRun };
type Listener = (event: GenerationEvent) => void;
type Change = Exclude<GenerationEvent, { type: 'snapshot' }>;
type Projection = Pick<Parameters<typeof stageCanonicalChatPayloadWrite>[0], 'projection' | 'projectJsonl' | 'onProjectionFailure' | 'onAuthorityCommitted'>;
type UserMessage = object | ((db: DatabaseSync, header: object) => object);
export type CreateGeneration<T> = {
    locator: CanonicalChatLocator;
    requestId: string;
    capturePrompt: (db: DatabaseSync, chat: GenerationChat) => T;
    projection?: Projection;
} & (
    | { kind: 'send'; userMessage: UserMessage; version: string }
    | { kind: 'send'; userMessage: UserMessage; header: object; version?: undefined }
    | { kind: 'regenerate' | 'continue'; version: string }
);
export type ExecuteGeneration<T> = (input: {
    run: GenerationRun; chat: Pick<GenerationChat, 'kind' | 'original'>; prompt: T; signal: AbortSignal; emit: (text: string, reset?: boolean) => void;
    waitForStep: (step: Omit<BrowserGenerationStep, 'id'>) => Promise<string>;
    emitInvocation: (invocation: PipelineInvocation) => void;
}) => Promise<object>;

type Live = {
    database: string | DatabaseSync;
    untrack: () => void;
    controller: AbortController;
    text: string;
    sequence: number;
    pending: { sequence: number; event: Change }[];
    delivering: boolean;
    listeners: Map<Listener, number>;
    step?: { message: BrowserGenerationStep; resolve: (result: string) => void };
    invocations?: PipelineInvocation[];
};
const columns = 'id, chat_id AS chatId, request_id AS requestId, kind, status, version, error, created_at_ms AS createdAtMs, finished_at_ms AS finishedAtMs';

function getRun(db: DatabaseSync, id: string): GenerationRun | null {
    // The SELECT aliases match RunRow and SQLite constrains kind/status.
    return db.prepare(`SELECT ${columns} FROM chat_generation_runs WHERE id = ?`).get(id) as RunRow | undefined ?? null;
}

function transition(db: DatabaseSync, id: string, status: Exclude<Status, 'running'>, error: string | null = null) {
    return db.prepare("UPDATE chat_generation_runs SET status = ?, error = ?, finished_at_ms = ? WHERE id = ? AND status = 'running'")
        .run(status, error, Date.now(), id).changes !== 0;
}

function deliver(listener: Listener, event: GenerationEvent) {
    try {
        listener(event);
    } catch {
        // One disconnected/broken sink must not interrupt upstream or other sinks.
        return false;
    }
    return true;
}

function publish(live: Live, event: Change) {
    live.pending.push({ sequence: ++live.sequence, event });
    if (live.delivering) return;
    live.delivering = true;
    while (live.pending.length) {
        const next = live.pending.shift();
        if (!next) break;
        for (const [listener, seen] of live.listeners) {
            if (seen < next.sequence && !deliver(listener, next.event)) live.listeners.delete(listener);
        }
        if (next.event.type === 'terminal') live.listeners.clear();
    }
    live.delivering = false;
}

const active = new Map<string, Live>();

export function getRegenerateChatPrefix(payload: readonly object[]) {
    return payload.slice(0, 1 + findRegenerateTurnStart(payload.slice(1)));
}

/** One instance per server process, using DB handles from the authenticated user's canonical manager. */
export function createServerGenerationService<T>({ execute }: { execute: ExecuteGeneration<T> }) {
    const temporary = new Map<string, { database: Live['database']; run: GenerationRun }>();
    const cancelledRequests = new Map<Live['database'], Set<string>>();

    function findTemporaryRequest(database: Live['database'], requestId: string) {
        return [...temporary.values()].find(entry => entry.database === database && entry.run.requestId === requestId);
    }

    function temporaryFor(db: DatabaseSync, id: string) {
        const entry = temporary.get(id);
        return entry?.database === generationDatabaseIdentity(db) ? entry : undefined;
    }

    function finishTemporary(id: string, status: 'completed' | 'failed' | 'cancelled', error: string | null = null, assistant?: object) {
        const entry = temporary.get(id)!;
        if (entry.run.status !== 'running') return entry.run;
        entry.run = { ...entry.run, status, error, assistant, finishedAtMs: Date.now() };
        setTimeout(() => temporary.delete(id), 60_000).unref();
        notifyTerminal(entry.run);
        return entry.run;
    }
    function recoverInTransaction(db: DatabaseSync) {
        for (const row of db.prepare("SELECT id FROM chat_generation_runs WHERE status = 'running'").all()) {
            const id = String(row.id);
            if (!isLiveChatGeneration(db, id)) transition(db, id, 'interrupted');
        }
    }

    function query(db: DatabaseSync, id: string): GenerationRun | null {
        const scratch = temporaryFor(db, id);
        if (scratch) return scratch.run;
        return withCanonicalTransaction(db, txn => {
            recoverInTransaction(txn);
            return getRun(txn, id);
        });
    }

    function find(db: DatabaseSync, locator: CanonicalChatLocator): (GenerationRun & { chatVersion: string | null }) | null {
        return withCanonicalTransaction(db, txn => {
            recoverInTransaction(txn);
            const session = getCanonicalChatSession(txn, locator);
            if (!session) return null;
            const run = txn.prepare(`SELECT ${columns} FROM chat_generation_runs WHERE chat_id = ? ORDER BY rowid DESC LIMIT 1`).get(session.id) as RunRow | undefined;
            return run ? { ...run, chatVersion: session.concurrency_token } : null;
        });
    }

    function subscribe(db: DatabaseSync, id: string, listener: Listener): (() => void) | null {
        const run = query(db, id);
        if (!run) return null;
        const live = run.status === 'running' ? active.get(id) : undefined;
        // Each attachment has its own identity even when a caller reuses a sink.
        const sink: Listener = event => listener(event);
        live?.listeners.set(sink, live.sequence);
        if (!deliver(sink, { type: 'snapshot', run, text: live?.text ?? '', step: live?.step?.message,
            ...(live?.invocations ? { invocations: [...live.invocations] } : {}) })) live?.listeners.delete(sink);
        return () => { live?.listeners.delete(sink); };
    }

    function notifyTerminal(run: GenerationRun) {
        const live = active.get(run.id);
        if (!live) return;
        active.delete(run.id);
        live.untrack();
        if (run.status === 'cancelled') live.controller.abort();
        publish(live, { type: 'terminal', run });
    }

    function cancel(db: DatabaseSync, id: string): GenerationRun | null {
        if (temporaryFor(db, id)) return finishTemporary(id, 'cancelled');
        const result = withCanonicalTransaction(db, txn => {
            recoverInTransaction(txn);
            const changed = transition(txn, id, 'cancelled');
            return { changed, run: getRun(txn, id) };
        });
        if (result.changed && result.run) notifyTerminal(result.run);
        return result.run;
    }

    function cancelTemporaryRequest(db: DatabaseSync, requestId: string) {
        const database = generationDatabaseIdentity(db);
        const existing = findTemporaryRequest(database, requestId);
        if (existing) {
            finishTemporary(existing.run.id, 'cancelled');
            return;
        }
        // A keepalive cancellation can arrive before its /create request.
        const cancelled = cancelledRequests.get(database) ?? new Set<string>();
        if (cancelled.has(requestId)) return;
        cancelled.add(requestId);
        cancelledRequests.set(database, cancelled);
        setTimeout(() => {
            cancelled.delete(requestId);
            if (!cancelled.size) cancelledRequests.delete(database);
        }, 60_000).unref();
    }

    function pendingStep(db: DatabaseSync, id: string) {
        return active.get(id)?.database === generationDatabaseIdentity(db) ? active.get(id)?.step : undefined;
    }

    function submitStep(db: DatabaseSync, id: string, stepId: string, result: string) {
        const run = query(db, id);
        if (!run) return 'missing';
        const step = pendingStep(db, id);
        if (!step || step.message.id !== stepId) return 'stale';
        delete active.get(id)?.step;
        step.resolve(result);
        return 'accepted';
    }

    function fail(db: DatabaseSync, id: string, error: string) {
        const run = withCanonicalTransaction(db, txn => transition(txn, id, 'failed', error) ? getRun(txn, id) : null);
        if (run) notifyTerminal(run);
    }

    function complete(db: DatabaseSync, id: string, chat: GenerationChat, assistant: object, projection: Projection) {
        const completion = withCanonicalTransaction(db, txn => {
            // Taking the terminal state frees this chat's write lock within this
            // transaction only. A failed history write rolls the transition back.
            if (!transition(txn, id, 'completed')) return null;
            const history = chat.kind === 'continue' ? chat.payload.slice(0, -1) : chat.payload;
            const staged = stageCanonicalChatPayloadWrite({
                ...projection, db: txn, locator: chat.locator, payload: [...history, assistant],
                condition: { version: chat.version },
            });
            if (!staged.version) throw new Error('chat_commit_failed');
            txn.prepare('UPDATE chat_generation_runs SET version = ? WHERE id = ?').run(staged.version, id);
            return { run: getRun(txn, id), finish: staged.finish };
        });
        if (!completion?.run) return;
        finishProjection(completion.finish);
        notifyTerminal(completion.run);
    }

    function finishProjection(finish: () => unknown) {
        try {
            finish();
        } catch (error) {
            console.warn('Generation chat post-commit callback failed:', error);
        }
    }

    function create(db: DatabaseSync, input: CreateGeneration<T>): GenerationRun {
        // Recovery is its own committed transaction, including when this command is rejected.
        withCanonicalTransaction(db, recoverInTransaction);
        const projection: Projection = input.projection ?? { projection: 'off', projectJsonl() {} };
        const { locator } = input;
        const created = withCanonicalTransaction(db, txn => {
            const session = getCanonicalChatSession(txn, locator);
            if (session) {
                const replay = txn.prepare(`SELECT ${columns} FROM chat_generation_runs WHERE chat_id = ? AND request_id = ?`)
                    .get(session.id, input.requestId) as RunRow | undefined;
                if (replay) return { run: replay };
                if (isChatGenerationActive(txn, session.id)) throw new ChatGenerationBusyError();
            }
            if (session ? !input.version || input.version !== session.concurrency_token : input.version !== undefined || input.kind !== 'send') {
                throw new Error('chat_conflict');
            }
            const stored = readCanonicalChatPayload(txn, locator);
            const id = randomUUID();
            let staged: ReturnType<typeof stageCanonicalChatPayloadWrite> | undefined;
            let payload: object[];
            let original: object | null = null;
            if (input.kind === 'send') {
                if (!stored && !('header' in input)) throw new Error('chat_conflict');
                const history = stored ?? [('header' in input) ? input.header : {}];
                const userMessage = typeof input.userMessage === 'function' ? input.userMessage(txn, history[0]) : input.userMessage;
                payload = [...history, userMessage];
                staged = stageCanonicalChatPayloadWrite({
                    ...projection, db: txn, locator, payload,
                    condition: input.version === undefined ? { create: true } : { version: input.version },
                });
                if (!staged.version) throw new Error('chat_commit_failed');
            } else if (input.kind === 'regenerate') {
                if (!stored || stored.length < 2) throw new Error('assistant_reply_required');
                payload = getRegenerateChatPrefix(stored);
            } else {
                const tail = stored?.at(-1);
                if (!stored || stored.length < 2 || !tail || !('is_user' in tail) || tail.is_user !== false || ('is_system' in tail && tail.is_system)) {
                    throw new Error('assistant_reply_required');
                }
                original = tail;
                payload = stored;
            }
            const chatRow = getCanonicalChatSession(txn, locator);
            if (!chatRow?.concurrency_token) throw new Error('chat_commit_failed');
            const chat: GenerationChat = {
                locator: { ...locator }, chatId: chatRow.id, version: chatRow.concurrency_token,
                kind: input.kind, payload, original,
            };
            const prompt = structuredClone(input.capturePrompt(txn, chat));
            txn.prepare(`
                INSERT INTO chat_generation_runs (id, chat_id, request_id, kind, status, version, created_at_ms)
                VALUES (?, ?, ?, ?, 'running', ?, ?)
            `).run(id, chat.chatId, input.requestId, input.kind, chat.version, Date.now());
            const run = getRun(txn, id);
            if (!run) throw new Error('generation_create_failed');
            return { run, chat, prompt, finish: staged?.finish };
        });
        if (!created.chat) return created.run;
        const { run, chat, prompt, finish } = created;
        const untrack = trackLiveChatGeneration(db, run.id);
        if (finish) finishProjection(finish);
        launch(db, run, chat, prompt, untrack,
            assistant => complete(db, run.id, chat, assistant, projection), error => fail(db, run.id, error));
        return run;
    }

    function createTemporary(db: DatabaseSync, requestId: string, kind: Kind, original: object | null, prompt: T, user?: object) {
        const database = generationDatabaseIdentity(db);
        const replay = findTemporaryRequest(database, requestId);
        if (replay) return replay.run;
        const id = randomUUID();
        const run: GenerationRun = { id, requestId, kind, status: 'running', temporary: true, user,
            chatId: '', version: '', error: null, createdAtMs: Date.now(), finishedAtMs: null };
        temporary.set(id, { database, run });
        if (cancelledRequests.get(database)?.has(requestId)) return finishTemporary(id, 'cancelled');
        const timeout = setTimeout(() => finishTemporary(id, 'cancelled'), 600_000).unref();
        launch(db, run, { kind, original }, prompt, () => clearTimeout(timeout),
            assistant => finishTemporary(id, 'completed', null, assistant), error => finishTemporary(id, 'failed', error));
        return run;
    }

    function launch(db: DatabaseSync, run: GenerationRun, chat: Parameters<ExecuteGeneration<T>>[0]['chat'], prompt: T,
        untrack: () => void, onComplete: (assistant: object) => void, onFailed: (error: string) => void) {
        const live: Live = { database: generationDatabaseIdentity(db), untrack, controller: new AbortController(), text: '', sequence: 0, pending: [], delivering: false, listeners: new Map() };
        active.set(run.id, live);
        const emit = (text: string, reset = false) => {
            if (active.get(run.id) !== live || (!text && !reset)) return;
            live.text = reset ? text : live.text + text;
            publish(live, reset ? { type: 'delta', text, reset: true } : { type: 'delta', text });
        };
        function waitForStep(input: Omit<BrowserGenerationStep, 'id'>): Promise<string> {
            const signal = live.controller.signal;
            signal.throwIfAborted();
            return new Promise((resolve, reject) => {
                const onAbort = () => reject(signal.reason);
                const message = { ...input, id: randomUUID() };
                signal.addEventListener('abort', onAbort, { once: true });
                live.step = { message, resolve(result) { signal.removeEventListener('abort', onAbort); resolve(result); } };
                publish(live, { type: 'step', step: message });
            });
        }
        async function start() {
            if (live.controller.signal.aborted) return;
            let assistant: object;
            try {
                assistant = await execute({ run, chat, prompt, signal: live.controller.signal, emit, waitForStep,
                    emitInvocation(invocation) {
                        if (!live.controller.signal.aborted) {
                            (live.invocations ??= []).push(invocation);
                            publish(live, { type: 'invocation', invocation });
                        }
                    } });
            } catch (error) {
                if (active.get(run.id) === live) onFailed(error instanceof ServerGenerationExecutionError ? error.code : 'generation_failed');
                return;
            }
            if (active.get(run.id) !== live) return;
            try {
                onComplete(assistant);
            } catch {
                onFailed('chat_commit_failed');
            }
        }
        void Promise.resolve().then(start).catch(() => {
            // The user database itself could not commit even the failure state.
            active.delete(run.id);
            live.untrack();
            console.error('Could not persist generation terminal state:', run.id);
        });
    }

    return { create, createTemporary, query, find, subscribe, cancel, cancelTemporaryRequest, submitStep, getStep: (db: DatabaseSync, id: string) => pendingStep(db, id)?.message };
}
