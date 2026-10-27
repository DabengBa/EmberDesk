import { eventSource, event_types } from './events.js';
import { getRequestHeaders } from './request-context.js';
import { requireGenerationShellContext } from './generation-shell-context.js';
import { buildChatCompletionRequest, getChatCompletionModel } from './openai.js';
import { getFallbackOpenAIModel } from './chat-generation-auto-recovery.js';
import { uuidv4 } from './utils.js';
import {
    CHAT_MEMORY_METADATA_KEY,
    CHAT_MEMORY_MAX_AUTO_ATTEMPTS,
    CHAT_MEMORY_ROLES,
    getDefaultChatMemoryPrompt,
    getDefaultChatMemoryWrap,
    TURN_SUMMARY_STATUS,
    applySummariesToCoreChat,
    appendChatMemoryHistory,
    computeTurnHash,
    ensureChatMessageIds,
    extractTurnSourceText,
    getChatMemoryMetadata,
    partitionChatTurns,
    reconcileChatMemory,
    resolveChatMemorySettings,
} from './chat-memory-core.js';

/**
 * Chat memory service — schedules background turn summaries, owns the serial
 * job queue, writes results back into `chat_metadata.chat_memory`, and hooks
 * the projection into prompt assembly. Summaries are always a display/prompt
 * projection; the canonical `state.chat` array stays untouched.
 *
 * Background work deliberately bypasses `Generate('quiet')`: the summarization
 * request must not run the full card/WI/pipeline assembly, emit generation
 * lifecycle events, or fight the foreground abort controller. It sends a
 * minimal two-message chat-completion body through the same backend route,
 * on the configured background model (the renamed fallback model field),
 * falling back to the primary model when unset.
 */

const MEMORY_REQUEST_TYPE = 'chat_memory';

const shell = () => requireGenerationShellContext();
const state = new Proxy({}, {
    get(_, key) { return shell().state[key]; },
    set(_, key, value) { shell().state[key] = value; return true; },
});

/** Active maintenance loop state for the current chat only. */
const maintenance = {
    running: false,
    queue: [],
    abort: null,
    chatId: null,
    retryTimer: null,
};
const listeners = new Set();
let sessionGeneration = 0;
let actionRunning = null;
let foregroundStarting = false;
let mutationQueue = Promise.resolve();

function serializeMutation(token, operation) {
    const task = mutationQueue.then(() => ownsSession(token) ? operation() : { ok: false, error: 'Chat changed before operation started' });
    mutationQueue = task.catch(() => {});
    return task;
}

function snapshotMemory() {
    const present = Object.hasOwn(state.chat_metadata, CHAT_MEMORY_METADATA_KEY);
    const value = present ? structuredClone(state.chat_metadata[CHAT_MEMORY_METADATA_KEY]) : undefined;
    return () => {
        if (present) state.chat_metadata[CHAT_MEMORY_METADATA_KEY] = value;
        else delete state.chat_metadata[CHAT_MEMORY_METADATA_KEY];
    };
}

function notify() {
    for (const listener of listeners) { try { listener(); } catch { /* observer isolation */ } }
}

function sessionToken() {
    return { chat: state.chat, metadata: state.chat_metadata, chatId: getCurrentChatId(), character: state.this_chid, generation: sessionGeneration };
}

function ownsSession(token) {
    return token.chat === state.chat && token.metadata === state.chat_metadata && token.chatId === getCurrentChatId() && token.character === state.this_chid && token.generation === sessionGeneration;
}

function recordHistory(action, turnKey, status, error) {
    const memory = getChatMemoryMetadata(state.chat_metadata);
    state.chat_metadata[CHAT_MEMORY_METADATA_KEY] = { ...memory, history: appendChatMemoryHistory(memory, { action, turnKey, status, ...(error ? { error } : {}), at: Date.now() }) };
}

async function saveMutation(action, turnKey, status = 'success', rollback = () => {}) {
    const token = sessionToken();
    recordHistory(action, turnKey, status, status === 'failed' ? 'Operation failed' : undefined);
    try {
        const saved = await shell().saveChatConditional(() => ownsSession(token));
        if (saved === false || saved == null) throw new Error('Could not save chat memory changes');
        if (!ownsSession(token)) return { ok: false, error: 'Chat changed before save completed' };
        shell().scheduleMainChatMessageListPanelRefresh?.();
        notify();
        return { ok: true };
    } catch (error) {
        if (!ownsSession(token)) return { ok: false, error: 'Chat changed before save completed' };
        rollback();

        notify();
        return { ok: false, error: 'Could not save chat memory changes' };
    }
}

function getCurrentChatId() {
    return state.characters?.[state.this_chid]?.chat ?? null;
}

function isMemoryEligibleChat() {
    return Boolean(state.chat?.length && getCurrentChatId() && state.main_api === 'openai');
}

function getSettings() {
    return resolveChatMemorySettings(state.oai_settings, state.chat_metadata);
}

export function subscribeChatMemory(listener) { listeners.add(listener); return () => listeners.delete(listener); }

export function updateChatMemorySettings(overrides = {}) {
    if (!state.chat_metadata || !overrides || typeof overrides !== 'object') return { ok: false, error: 'No active chat' };
    const token = sessionToken();
    return serializeMutation(token, async () => {
        const rollback = snapshotMemory();
        const memory = getChatMemoryMetadata(state.chat_metadata);
        const next = { ...memory };
        const keys = { enabled: 'disabled', keepTurns: 'keepTurns', role: 'role', prompt: 'prompt', wrap: 'wrap', maxTokens: 'maxTokens' };
        for (const [key, stored] of Object.entries(keys)) {
            if (!Object.hasOwn(overrides, key)) continue;
            if (overrides[key] === null) delete next[stored];
            else next[stored] = key === 'enabled' ? !overrides[key] : overrides[key];
        }
        state.chat_metadata[CHAT_MEMORY_METADATA_KEY] = next;
        return saveMutation('settings', null, 'success', rollback);
    });
}

export function setChatMemoryPinned(turnKey, pinned) {
    const token = sessionToken();
    return serializeMutation(token, async () => {
        const turn = partitionChatTurns(state.chat).turns.find(item => item.key === turnKey);
        if (!turn || !ownsSession(token)) return { ok: false, error: 'Turn is no longer available' };
        const rollbackMemory = snapshotMemory();
        const previous = turn.items.map(item => ({ extra: state.chat[item.index].extra, present: Object.hasOwn(state.chat[item.index].extra, 'pinned'), value: state.chat[item.index].extra.pinned }));
        for (const item of turn.items) state.chat[item.index].extra.pinned = !!pinned;
        reconcileActiveChatMemory(); notify();
        return saveMutation('pin', turnKey, 'success', () => {
            rollbackMemory();
            for (const item of previous) { if (item.present) item.extra.pinned = item.value; else delete item.extra.pinned; }
        });
    });
}

export function regenerateChatMemoryTurn(turnKey) { return enqueueTurnAction(turnKey, 'regenerate'); }
export function retryChatMemoryTurn(turnKey) { return enqueueTurnAction(turnKey, 'retry'); }

function enqueueTurnAction(turnKey, action) {
    const token = sessionToken();
    return new Promise(resolve => {
        const firstAuto = maintenance.queue.findIndex(job => !job.action);
        maintenance.queue.splice(firstAuto < 0 ? maintenance.queue.length : firstAuto, 0, { token, turnKey, action, resolve });
        notify();
        kickQueue();
    });
}

async function runTurnAction(turnKey, action) {
    const token = sessionToken();
    const eligibleTurn = (checkRetry = true) => {
        if (!ownsSession(token) || !isMemoryEligibleChat() || !getSettings().enabled) return null;
        const result = reconcileChatMemory(state.chat, getChatMemoryMetadata(state.chat_metadata), getSettings().keepTurns);
        const turn = result.summarizableTurns.find(item => item.key === turnKey);
        if (checkRetry && action === 'retry' && result.summaries.find(item => item.turnKey === turnKey)?.status !== TURN_SUMMARY_STATUS.FAILED) return null;
        return turn ?? null;
    };
    const turn = eligibleTurn();
    if (!turn) return { ok: false, error: 'Turn is no longer eligible' };
    const sourceHash = computeTurnHash(token.chat, turn);
    const sourceText = extractTurnSourceText(token.chat, turn);
    if (!sourceText.trim()) return { ok: false, error: 'Turn has no summarizable content' };
    try {
        const signal = maintenance.abort.signal;
        const summaryText = await requestTurnSummary({ sourceText }, signal, () => {
            const current = eligibleTurn();
            return !!current && !foregroundStarting && !state.is_send_press && !state.generationPending && computeTurnHash(state.chat, current) === sourceHash && JSON.stringify(current.messageIds) === JSON.stringify(turn.messageIds);
        });
        const current = eligibleTurn();
        if (signal.aborted || foregroundStarting || state.is_send_press || state.generationPending || !current || computeTurnHash(state.chat, current) !== sourceHash || JSON.stringify(current.messageIds) !== JSON.stringify(turn.messageIds)) return { ok: false, error: 'Turn changed before summary completed' };
        return await serializeMutation(token, async () => {
            const latest = eligibleTurn();
            if (signal.aborted || !latest || computeTurnHash(state.chat, latest) !== sourceHash || JSON.stringify(latest.messageIds) !== JSON.stringify(turn.messageIds)) return { ok: false, error: 'Turn changed before summary completed' };
            const rollback = snapshotMemory();
            upsertSummaryRecord({ id: uuidv4(), turnKey, turnIndex: turn.index, firstIndex: turn.startIndex, messageIds: turn.messageIds, contentHash: sourceHash, text: summaryText, status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0, manual: false, stale: false, createdAt: Date.now(), updatedAt: Date.now() });
            const saved = await saveMutation(action, turnKey, 'success', rollback);
            if (saved.ok && !eligibleTurn(false)) return { ok: false, error: 'Turn changed before save completed' };
            return saved;
        });
    } catch {
        if (ownsSession(token) && !maintenance.abort?.signal.aborted) await serializeMutation(token, () => saveMutation(action, turnKey, 'failed', snapshotMemory()));
        return { ok: false, error: 'Could not generate summary' };
    }
}

function writeBackSummaries(summaries) {
    const memory = getChatMemoryMetadata(state.chat_metadata);
    state.chat_metadata[CHAT_MEMORY_METADATA_KEY] = { ...memory, summaries };
}

/**
 * Recomputes summary statuses for the live chat and persists them into
 * `chat_metadata.chat_memory`. Returns the reconcile result (with a
 * `changed` flag comparing persisted summaries) for further use.
 */
export function reconcileActiveChatMemory({ persist = true, ensureIds = false } = {}) {
    if (!isMemoryEligibleChat() || !getSettings().enabled) {
        return null;
    }
    if (ensureIds) {
        ensureChatMessageIds(state.chat, uuidv4);
    }
    const memory = getChatMemoryMetadata(state.chat_metadata);
    const result = reconcileChatMemory(state.chat, memory, getSettings().keepTurns);
    result.changed = JSON.stringify(memory.summaries) !== JSON.stringify(result.summaries);
    if (persist) {
        writeBackSummaries(result.summaries);
    }
    return result;
}

/**
 * Prompt-assembly hook. Collapses turns covered by active summaries into
 * pseudo messages before regex/WorldInfo/oai mapping. In dry runs (prompt
 * preview) nothing is persisted and no ids are assigned.
 * @param {object[]} coreChat
 * @param {{chat?: object[], dryRun?: boolean}} options
 * @returns {{items: object[], summarized: object[]}}
 */
export function applyChatMemoryToCoreChat(coreChat, { chat = null, dryRun = false } = {}) {
    const settings = getSettings();
    if (!settings.enabled || state.main_api !== 'openai' || !Array.isArray(coreChat)) {
        return { items: coreChat, summarized: [] };
    }
    const assemblyChat = Array.isArray(chat) ? chat : state.chat;
    // extra.id backfill is idempotent identity, not chat-state mutation — even
    // preview runs need it so turn keys resolve and the inspector shows the
    // real assembly shape.
    ensureChatMessageIds(assemblyChat, uuidv4);
    const memory = getChatMemoryMetadata(state.chat_metadata);
    if (!memory.summaries.length) {
        return { items: coreChat, summarized: [] };
    }
    const result = reconcileChatMemory(assemblyChat, memory, settings.keepTurns);
    if (!dryRun) {
        writeBackSummaries(result.summaries);
    }
    return applySummariesToCoreChat(coreChat, result.activeSummaries, {
        role: settings.role,
        wrap: settings.wrap,
        name1: state.name1,
        name2: state.name2,
    });
}

/**
 * Builds and sends the minimal summarization request. Two messages only —
 * configured summary prompt + the turn's cleaned source text — never the
 * character card, world info, or other turns. Uses the background model
 * (`fallback_provider_model`, user-facing "后台模型") when configured.
 * @param {{sourceText: string}} job
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
async function requestTurnSummary(job, signal, shouldSend = () => true) {
    const trace = { type: MEMORY_REQUEST_TYPE, chatId: getCurrentChatId(), charName: state.name2 };
    const settings = structuredClone(state.oai_settings);
    settings.stream_openai = false;
    const memorySettings = getSettings();
    settings.openai_max_tokens = memorySettings.maxTokens;
    const model = getFallbackOpenAIModel(settings) || getChatCompletionModel(settings);
    const substitute = text => String(text ?? '')
        .split('{{char}}').join(String(state.name2 ?? ''))
        .split('{{user}}').join(String(state.name1 ?? ''));
    const { generate_data } = await buildChatCompletionRequest({
        type: MEMORY_REQUEST_TYPE,
        messages: [
            { role: 'system', content: substitute(memorySettings.prompt || getDefaultChatMemoryPrompt()) },
            { role: 'user', content: substitute(job.sourceText) },
        ],
        settings,
        model,
        emitSettingsReady: false,
    });
    if (signal.aborted || !shouldSend()) throw new DOMException('Summary canceled', 'AbortError');
    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ ...generate_data, _trace: trace }),
        signal,
    });
    if (!response.ok) {
        throw new Error(`Chat memory summary request failed: HTTP ${response.status}`);
    }
    const data = await response.json();
    const text = shell().extractMessageFromData(data);
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Chat memory summary request returned empty content');
    }
    return text.trim();
}

function upsertSummaryRecord(next) {
    const memory = getChatMemoryMetadata(state.chat_metadata);
    const summaries = memory.summaries.filter(record => record.turnKey !== next.turnKey);
    summaries.push(next);
    summaries.sort((a, b) => (a.firstIndex ?? 0) - (b.firstIndex ?? 0));
    state.chat_metadata[CHAT_MEMORY_METADATA_KEY] = { ...memory, summaries };
}

function flushMemorySave() {
    // While a foreground generation streams, the next saveChatConditional on
    // that path picks up the mutated chat_metadata — never POST a competing
    // save mid-stream.
    if (!state.is_send_press) {
        const token = sessionToken();
        shell().saveChatConditional(() => ownsSession(token));
    }
    shell().scheduleMainChatMessageListPanelRefresh?.();
}

/**
 * Re-arms the queue while foreground generation is active. GENERATION_ENDED
 * can fire before `is_send_press` clears (and may not fire at all when a
 * generation dies before the stop button shows), so events alone cannot be
 * relied on to resume work — a bounded poll closes the gap.
 */
function scheduleRetryKick() {
    if (maintenance.retryTimer) {
        return;
    }
    maintenance.retryTimer = setTimeout(() => {
        maintenance.retryTimer = null;
        if (maintenance.queue.length) {
            kickQueue();
        }
    }, 1500);
}

function clearRetryKick() {
    if (maintenance.retryTimer) {
        clearTimeout(maintenance.retryTimer);
        maintenance.retryTimer = null;
    }
}

async function runMaintenanceLoop() {
    while (maintenance.queue.length) {
        // Foreground generation always wins; the retry kick resumes the
        // queue once it unblocks regardless of which event path fired.
        if (foregroundStarting || state.is_send_press || state.generationPending) {
            scheduleRetryKick();
            return;
        }
        const job = maintenance.queue.shift();
        if (job.action) {
            if (!ownsSession(job.token)) { job.resolve({ ok: false, error: 'Chat changed before summary started' }); continue; }
            actionRunning = { token: job.token, turnKey: job.turnKey };
            maintenance.abort = new AbortController();
            notify();
            try { job.resolve(await runTurnAction(job.turnKey, job.action)); } catch { job.resolve({ ok: false, error: 'Could not generate summary' }); } finally { actionRunning = null; maintenance.abort = null; notify(); }
            continue;
        }
        if (!ownsSession(job.token)) continue;
        if (!isMemoryEligibleChat() || !getSettings().enabled) continue;
        const token = sessionToken();
        const memory = getChatMemoryMetadata(state.chat_metadata);
        const result = reconcileChatMemory(state.chat, memory, getSettings().keepTurns);
        writeBackSummaries(result.summaries);

        const turn = result.partition.turns.find(candidate => candidate.key === job.turnKey);
        if (!turn || !result.summarizableTurns.includes(turn)) {
            continue;
        }
        const record = result.summaries.find(item => item.turnKey === job.turnKey) ?? null;
        const currentHash = computeTurnHash(state.chat, turn);
        if (record?.status === TURN_SUMMARY_STATUS.ACTIVE && record.contentHash === currentHash) {
            continue; // summary already fresh for this exact content
        }
        const sourceText = extractTurnSourceText(state.chat, turn);
        if (!sourceText.trim()) {
            continue;
        }

        maintenance.abort = new AbortController();
        try {
            const signal = maintenance.abort.signal;
            const shouldSend = () => {
                if (!ownsSession(token) || !isMemoryEligibleChat() || !getSettings().enabled || foregroundStarting || state.is_send_press || state.generationPending) return false;
                const current = reconcileChatMemory(state.chat, getChatMemoryMetadata(state.chat_metadata), getSettings().keepTurns);
                const candidate = current.summarizableTurns.find(item => item.key === job.turnKey);
                return !!candidate && computeTurnHash(state.chat, candidate) === currentHash && JSON.stringify(candidate.messageIds) === JSON.stringify(turn.messageIds);
            };
            const text = await requestTurnSummary({ sourceText }, signal, shouldSend);
            // CAS write-back: chat unchanged and fingerprint still matching —
            // otherwise the result is discarded and reconcile re-queues.
            if (!ownsSession(token) || signal.aborted || foregroundStarting || state.is_send_press || state.generationPending) {
                continue;
            }
            const verify = reconcileChatMemory(state.chat, getChatMemoryMetadata(state.chat_metadata), getSettings().keepTurns);
            const verifyTurn = verify.partition.turns.find(candidate => candidate.key === job.turnKey);
            if (!verifyTurn || !verify.summarizableTurns.includes(verifyTurn) || JSON.stringify(verifyTurn.messageIds) !== JSON.stringify(turn.messageIds)) {
                continue;
            }
            const verifyHash = computeTurnHash(state.chat, verifyTurn);
            if (verifyHash !== currentHash) {
                continue;
            }
            await serializeMutation(token, async () => {
                const latest = reconcileActiveChatMemory({ persist: false });
                const eligible = latest?.summarizableTurns.find(item => item.key === job.turnKey);
                if (signal.aborted || !eligible || computeTurnHash(state.chat, eligible) !== currentHash || JSON.stringify(eligible.messageIds) !== JSON.stringify(turn.messageIds)) return;
                const rollback = snapshotMemory();
                upsertSummaryRecord({
                    id: record?.id ?? uuidv4(),
                    turnKey: job.turnKey,
                    turnIndex: verifyTurn.index,
                    firstIndex: verifyTurn.startIndex,
                    messageIds: verifyTurn.messageIds,
                    contentHash: verifyHash,
                    lastAttemptHash: verifyHash,
                    text,
                    status: TURN_SUMMARY_STATUS.ACTIVE,
                    retries: 0,
                    manual: false,
                    stale: false,
                    createdAt: record?.createdAt ?? Date.now(),
                    updatedAt: Date.now(),
                });
                await saveMutation('automatic', job.turnKey, 'success', rollback);
            });
        } catch (error) {
            if (!ownsSession(token)) continue;
            if (error?.name === 'AbortError') {
                continue;
            }
            const currentTurn = partitionChatTurns(state.chat).turns.find(item => item.key === job.turnKey);
            if (!currentTurn || computeTurnHash(state.chat, currentTurn) !== currentHash || JSON.stringify(currentTurn.messageIds) !== JSON.stringify(turn.messageIds)) continue;
            console.error('Chat memory summary failed');
            await serializeMutation(token, async () => {
                const latest = reconcileActiveChatMemory({ persist: false });
                const eligible = latest?.summarizableTurns.find(item => item.key === job.turnKey);
                if (!eligible || computeTurnHash(state.chat, eligible) !== currentHash || JSON.stringify(eligible.messageIds) !== JSON.stringify(turn.messageIds)) return;
                const rollback = snapshotMemory();
                const target = getChatMemoryMetadata(state.chat_metadata).summaries
                    .find(item => item.turnKey === job.turnKey) ?? {
                    id: uuidv4(),
                    turnKey: job.turnKey,
                    turnIndex: turn.index,
                    firstIndex: turn.startIndex,
                    messageIds: turn.messageIds,
                    contentHash: currentHash,
                    text: '',
                    manual: false,
                    createdAt: Date.now(),
                };
                const retries = target.lastAttemptHash === currentHash ? (target.retries ?? 0) + 1 : 1;
                upsertSummaryRecord({
                    ...target,
                    lastAttemptHash: currentHash,
                    retries,
                    status: retries >= CHAT_MEMORY_MAX_AUTO_ATTEMPTS ? TURN_SUMMARY_STATUS.FAILED : TURN_SUMMARY_STATUS.STALE,
                    stale: true,
                    updatedAt: Date.now(),
                });
                await saveMutation('automatic', job.turnKey, 'failed', rollback);
            });
        }
    }
}

function kickQueue() {
    if (maintenance.running) {
        return;
    }
    maintenance.running = true;
    notify();
    runMaintenanceLoop()
        .catch(error => console.error('Chat memory maintenance loop failed', error))
        .finally(() => {
            maintenance.running = false;
            maintenance.abort = null;
            notify();
            if (maintenance.queue.length && !maintenance.retryTimer) kickQueue();
        });
}

/**
 * Reconciles the active chat and queues turns that need (re)generation.
 * @param {{immediate?: boolean}} options `immediate` also revives FAILED records (panel "整理现在").
 */
export function scheduleMemoryMaintenance({ immediate = false } = {}) {
    if (!isMemoryEligibleChat() || !getSettings().enabled) {
        return;
    }
    ensureChatMessageIds(state.chat, uuidv4);
    const chatId = getCurrentChatId();
    if (maintenance.chatId !== chatId) {
        for (const job of maintenance.queue.splice(0)) {
            if (job.action && ownsSession(job.token)) maintenance.queue.push(job);
            else job.resolve?.({ ok: false, error: 'Chat changed before summary started' });
        }
        maintenance.chatId = chatId;
    }
    const result = reconcileActiveChatMemory({ persist: true });
    if (!result) {
        return;
    }
    if (result.changed) {
        // Status flips (e.g. deletion pulling an old turn back into the
        // window) persist even when no new job was queued.
        flushMemorySave();
    }
    const queued = new Set(maintenance.queue.map(job => job.turnKey));
    let dirty = false;
    for (const job of result.pending) {
        if (queued.has(job.turn.key)) {
            continue;
        }
        maintenance.queue.push({ turnKey: job.turn.key, token: sessionToken() });
        queued.add(job.turn.key);
        if (job.record) {
            job.record.status = TURN_SUMMARY_STATUS.PENDING;
        } else {
            // Placeholder record so the queued state survives a reload.
            upsertSummaryRecord({
                id: uuidv4(),
                turnKey: job.turn.key,
                turnIndex: job.turn.index,
                firstIndex: job.turn.startIndex,
                messageIds: job.turn.messageIds,
                contentHash: job.contentHash,
                lastAttemptHash: job.contentHash,
                text: '',
                status: TURN_SUMMARY_STATUS.PENDING,
                retries: 0,
                manual: false,
                stale: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
        dirty = true;
    }
    if (immediate) {
        // Retry failed records: clear their attempt budget and re-queue.
        const memory = getChatMemoryMetadata(state.chat_metadata);
        for (const record of memory.summaries) {
            if (record.status !== TURN_SUMMARY_STATUS.FAILED || queued.has(record.turnKey)) {
                continue;
            }
            const turn = result.partition.turns.find(candidate => candidate.key === record.turnKey);
            if (!turn || !result.summarizableTurns.includes(turn)) {
                continue;
            }
            record.retries = 0;
            record.status = TURN_SUMMARY_STATUS.PENDING;
            maintenance.queue.push({ turnKey: record.turnKey, token: sessionToken() });
            queued.add(record.turnKey);
            dirty = true;
        }
    }
    if (dirty) {
        flushMemorySave();
    }
    kickQueue();
}

/** Manual "summarize now" — immediate maintenance pass over the active chat. */
export function runImmediateMemoryConsolidation() {
    scheduleMemoryMaintenance({ immediate: true });
}

/**
 * Display projection for the React main-chat list: each ACTIVE summary yields
 * a card anchored at the covered range's first visible message index
 * (messageIds are positional ids used by the store's messagesById).
 * @returns {object[]}
 */
export function getChatMemoryDisplayItems() {
    if (!getSettings().enabled || state.main_api !== 'openai' || !Array.isArray(state.chat) || !state.chat.length) {
        return [];
    }
    ensureChatMessageIds(state.chat, uuidv4);
    const memory = getChatMemoryMetadata(state.chat_metadata);
    if (!memory.summaries.length) {
        return [];
    }
    const result = reconcileChatMemory(state.chat, memory, getSettings().keepTurns);
    const idToIndex = new Map();
    state.chat.forEach((message, index) => {
        const id = message?.extra?.id;
        if (id !== undefined && id !== null) {
            idToIndex.set(id, index);
        }
    });
    return result.summaries
        .filter(record => record.status === TURN_SUMMARY_STATUS.ACTIVE)
        .map(record => {
            const covered = (Array.isArray(record.messageIds) ? record.messageIds : [])
                .map(id => idToIndex.get(id))
                .filter(index => index !== undefined)
                .map(String);
            if (!covered.length) {
                return null;
            }
            return {
                summaryId: String(record.id ?? ''),
                turnKey: String(record.turnKey ?? ''),
                turnIndex: Number.isInteger(record.turnIndex) ? record.turnIndex : 0,
                anchorMessageId: covered[0],
                coveredMessageIds: covered,
                text: String(record.text ?? ''),
                stale: record.stale === true,
                manual: record.manual === true,
            };
        })
        .filter(Boolean);
}

/** Read-only snapshot for the (P3) memory panel and Inspector. */
export function getChatMemoryView() {
    if (!isMemoryEligibleChat()) {
        return null;
    }
    ensureChatMessageIds(state.chat, uuidv4);
    const memory = getChatMemoryMetadata(state.chat_metadata);
    const result = reconcileChatMemory(state.chat, memory, getSettings().keepTurns);
    const settings = getSettings();
    const overrides = {};
    for (const key of ['keepTurns', 'role', 'prompt', 'wrap', 'maxTokens']) {
        if (Object.hasOwn(memory, key)) overrides[key] = memory[key];
    }
    if (typeof memory.disabled === 'boolean') overrides.enabled = !memory.disabled;
    return {
        settings,
        overrides,
        globalSettings: resolveChatMemorySettings(state.oai_settings, {}),
        history: memory.history ?? [],
        turns: result.partition.turns.map(turn => {
            const summary = result.summaries.find(record => record.turnKey === turn.key) ?? null;
            return { key: turn.key, index: turn.index, pinned: turn.pinned, eligible: result.summarizableTurns.includes(turn), status: summary?.status ?? null, summary, running: !!actionRunning && ownsSession(actionRunning.token) && actionRunning.turnKey === turn.key };
        }),
        enabled: getSettings().enabled,
        keepTurns: getSettings().keepTurns,
        summaries: result.summaries,
        notes: memory.notes,
        stats: result.stats,
        partition: result.partition,
        queueDepth: maintenance.queue.filter(job => ownsSession(job.token)).length,
        running: maintenance.running,
    };
}

function handleChatTeardown() {
    sessionGeneration++;
    foregroundStarting = false;
    clearRetryKick();
    maintenance.abort?.abort();
    for (const job of maintenance.queue.splice(0)) job.resolve?.({ ok: false, error: 'Chat changed before summary started' });
    maintenance.chatId = null;
    notify();
}

function handleChatLoaded() {
    handleChatTeardown();
    // scheduleMemoryMaintenance reconciles, persists changed statuses,
    // queues pending jobs, and kicks the loop — one entry point covers all.
    scheduleMemoryMaintenance();
}

function handleGenerationEnded() {
    foregroundStarting = false;
    scheduleMemoryMaintenance();
    kickQueue();
}

function handleGenerationStarted() {
    // Foreground always wins: abort any in-flight summary request — the
    // aborted turn reverts to STALE and is re-queued by the reconcile inside
    // scheduleMemoryMaintenance (its retry budget is not consumed).
    foregroundStarting = true;
    maintenance.abort?.abort();
    // GENERATION_STARTED fires a few statements before is_send_press flips —
    // defer the kick so the loop's gate observes the pressed state.
    setTimeout(() => { foregroundStarting = false; scheduleMemoryMaintenance(); kickQueue(); }, 0);
}

function handleHistoryMutation() {
    // Cheap status refresh: expansion/invalidation is authoritative at the
    // next assembly anyway; this keeps persisted metadata and the (P3) panel
    // accurate between sends.
    scheduleMemoryMaintenance();
}

/** Called once from script.js startup after shell context registration. */
export function initChatMemory() {
    eventSource.on(event_types.CHAT_LOADED, handleChatLoaded);
    eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
    eventSource.on(event_types.GENERATION_STARTED, handleGenerationStarted);
    eventSource.on(event_types.GENERATION_STOPPED, handleGenerationEnded);
    eventSource.on(event_types.MESSAGE_DELETED, handleHistoryMutation);
    eventSource.on(event_types.MESSAGE_EDITED, handleHistoryMutation);
    eventSource.on(event_types.MESSAGE_UPDATED, handleHistoryMutation);
    eventSource.on(event_types.CHAT_CHANGED, handleChatTeardown);
}

export { CHAT_MEMORY_ROLES, getDefaultChatMemoryPrompt, getDefaultChatMemoryWrap };
