import { IGNORE_SYMBOL } from './constants.js';
import { translate } from './i18n.js';

/**
 * Chat memory core — pure logic for conversation-round summarization.
 *
 * The summary is a projection over raw chat messages: the canonical `chat`
 * array is never rewritten. This module contains no DOM, network, or shell
 * dependencies so every function is unit-testable in isolation.
 */

export const CHAT_MEMORY_METADATA_KEY = 'chat_memory';
export const CHAT_MEMORY_HISTORY_LIMIT = 50;

export const TURN_SUMMARY_STATUS = Object.freeze({
    /** Masking the covered turn in prompt assembly and (later) display. */
    ACTIVE: 'active',
    /** Turn is inside the recent-verbatim window (or pinned): raw text stays. */
    EXPANDED: 'expanded',
    /** Covered content changed since the summary was generated. */
    STALE: 'stale',
    /** Queued for or currently in background generation. */
    PENDING: 'pending',
    /** Auto attempts exhausted; dormant until manual re-trigger or content change. */
    FAILED: 'failed',
});

/** Maximum automatic attempts per summary content version. */
export const CHAT_MEMORY_MAX_AUTO_ATTEMPTS = 2;

export function getDefaultChatMemoryPrompt() {
    return [
        translate('You are a chat-log summarizer. Below is one full session turn of a role-playing conversation.'),
        translate('Summarize what happened in this turn concisely: main actions, key decisions, emotional shifts, and unresolved threads.'),
        translate('Output only the summary body. Do not restate the original text, do not add a title or prefix, and keep the same language as the conversation.'),
    ].join('\n');
}

export function getDefaultChatMemoryWrap() {
    return translate('[Earlier story recap]\n{{summary}}');
}

export const CHAT_MEMORY_ROLES = Object.freeze(['system', 'user', 'assistant']);

/**
 * Backfills a durable per-message id (`extra.id`) for messages lacking one.
 * The canonical chat store (`canonical-chat-store.js`) already prefers
 * `extra.id` for row identity, so this also stabilizes DB rows across edits.
 * @param {object[]} chat
 * @param {() => string} idFactory
 * @returns {number} How many ids were assigned.
 */
export function ensureChatMessageIds(chat, idFactory) {
    if (!Array.isArray(chat)) {
        return 0;
    }
    let assigned = 0;
    for (const message of chat) {
        if (!message || typeof message !== 'object') {
            continue;
        }
        if (!message.extra || typeof message.extra !== 'object') {
            message.extra = {};
        }
        if (typeof message.extra.id !== 'string' || message.extra.id.length === 0) {
            message.extra.id = idFactory();
            assigned++;
        }
    }
    return assigned;
}

/**
 * Splits the chat into the leading group (messages before the first user
 * message — e.g. greetings) and conversation turns. A turn starts at a user
 * message and runs until the next user message; it is "closed" once it
 * contains at least one reply (any non-user message).
 * @param {object[]} chat
 * @returns {{leading: {items: object[]}, turns: object[]}}
 */
export function partitionChatTurns(chat) {
    const leading = { items: [] };
    const turns = [];
    let current = null;
    const list = Array.isArray(chat) ? chat : [];

    for (let index = 0; index < list.length; index++) {
        const message = list[index];
        if (!message || typeof message !== 'object') {
            continue;
        }
        const item = {
            index,
            id: typeof message?.extra?.id === 'string' && message.extra.id.length > 0 ? message.extra.id : null,
            isUser: !!message.is_user,
            isSystem: !!message.is_system,
            pinned: !!message?.extra?.pinned,
        };
        if (item.isUser) {
            if (current) {
                turns.push(current);
            }
            current = { items: [item], replyCount: 0 };
        } else if (current) {
            current.items.push(item);
            current.replyCount++;
        } else {
            leading.items.push(item);
        }
    }
    if (current) {
        turns.push(current);
    }

    turns.forEach((turn, turnIndex) => {
        turn.index = turnIndex;
        turn.startIndex = turn.items[0].index;
        turn.key = turn.items[0].id;
        turn.messageIds = turn.items.map(item => item.id);
        turn.closed = turn.replyCount > 0;
        turn.pinned = turn.items.some(item => item.pinned);
    });
    leading.pinned = leading.items.some(item => item.pinned);
    leading.indices = leading.items.map(item => item.index);

    return { leading, turns };
}

/**
 * Computes which turns stay verbatim and which are eligible for summarization.
 * Only closed turns count toward the `keepTurns` verbatim window; the open
 * tail turn (last turn still awaiting a reply) is never summarized.
 * @param {{turns: object[]}} partition
 * @param {number} keepTurns
 * @returns {{verbatimTurnKeys: Set<string>, summarizableTurns: object[]}}
 */
export function computeMemoryWindow(partition, keepTurns) {
    const turns = partition?.turns ?? [];
    const closed = turns.filter(turn => turn.closed);
    // keepTurns <= 0 means "nothing stays verbatim" — slice(-0) would keep all.
    const verbatim = keepTurns > 0
        ? new Set(closed.slice(-keepTurns).map(turn => turn.key))
        : new Set();
    const tail = turns.length ? turns[turns.length - 1] : null;
    const summarizableTurns = turns.filter(turn =>
        !verbatim.has(turn.key)
        && turn !== tail
        && !turn.pinned
        && turn.key !== null,
    );
    return { verbatimTurnKeys: verbatim, summarizableTurns };
}

/**
 * Removes Reply Pipeline / tool markup that must never reach a summary source
 * (mirrors the stripping done in `setOpenAIMessages`): earlier pipeline steps
 * drop whole tagged blocks, the last step keeps its inner text, chip rows and
 * `<section data-pipeline-card>` markers are removed.
 * @param {string} content
 * @param {Array|undefined} invocations `extra.tool_invocations`
 * @returns {string}
 */
export function stripMarkupForSummary(content, invocations) {
    let text = typeof content === 'string' ? content : '';
    if (!Array.isArray(invocations)) {
        return text;
    }
    invocations.forEach((invocation, index) => {
        const name = String(invocation?.name ?? '');
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
            return;
        }
        const isLast = index === invocations.length - 1;
        text = isLast
            ? text
                .replace(new RegExp(`&lt;/?${name}&gt;`, 'g'), '')
                .replace(new RegExp(`</?${name}>`, 'g'), '')
            : text
                .replace(new RegExp(`&lt;${name}&gt;[\\s\\S]*?&lt;/${name}&gt;`, 'g'), '')
                .replace(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, 'g'), '');
    });
    return text
        .replace(/<div data-respond-options[^>]*>[\s\S]*?<\/div><\/div>/g, '')
        .replace(/^\s*<section data-pipeline-card\b[\s\S]*?<\/section>\s*/, '')
        .replace(/\s*<section data-pipeline-card\b[\s\S]*$/, '');
}

/**
 * Extracts the source text a summary is generated from: user and assistant
 * messages only, ignore-flagged and system/tool-card records skipped,
 * pipeline markup stripped. Reasoning (`extra.reasoning`) is never part of
 * `mes` and therefore never included.
 * @param {object[]} chat
 * @param {object} turn
 * @returns {string}
 */
export function extractTurnSourceText(chat, turn) {
    const parts = [];
    for (const item of turn?.items ?? []) {
        const message = chat[item.index];
        if (!message || typeof message !== 'object') {
            continue;
        }
        if (message.extra?.[IGNORE_SYMBOL]) {
            continue;
        }
        if (message.is_system) {
            continue;
        }
        const text = stripMarkupForSummary(message.mes, message.extra?.tool_invocations).trim();
        if (!text) {
            continue;
        }
        const name = String(message.name ?? '').trim();
        parts.push(name ? `${name}: ${text}` : text);
    }
    return parts.join('\n\n');
}

/** FNV-1a 32-bit hash rendered as hex — cheap, stable content fingerprint. */
function fnv1aHex(value) {
    let hash = 0x811c9dc5;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * Content fingerprint of a turn: covered ids, cleaned text, message role flag
 * and name. Any edit, swipe switch, or covered-message change alters it.
 * @param {object[]} chat
 * @param {object} turn
 * @returns {string}
 */
export function computeTurnHash(chat, turn) {
    const pieces = [];
    for (const item of turn?.items ?? []) {
        const message = chat[item.index];
        if (!message || typeof message !== 'object') {
            continue;
        }
        const flag = message.extra?.[IGNORE_SYMBOL]
            ? 'i'
            : message.is_system ? 's' : message.is_user ? 'u' : 'a';
        const text = flag === 's' || flag === 'i'
            ? ''
            : stripMarkupForSummary(message.mes, message.extra?.tool_invocations);
        pieces.push([
            item.id ?? `#${item.index}`,
            flag,
            String(message.name ?? ''),
            text,
        ].join('\u0000'));
    }
    return fnv1aHex(pieces.join('\u0001'));
}

/**
 * Resolves the effective memory settings: global oai_settings defaults,
 * overridable per chat via `chat_metadata.chat_memory`.
 * @param {object} oaiSettings
 * @param {object} chatMetadata
 * @returns {{enabled: boolean, keepTurns: number, prompt: string, wrap: string, role: string, maxTokens: number}}
 */
export function resolveChatMemorySettings(oaiSettings, chatMetadata) {
    const overrides = chatMetadata?.[CHAT_MEMORY_METADATA_KEY] ?? {};
    const keepTurnsRaw = overrides.keepTurns ?? oaiSettings?.chat_memory_keep_turns;
    const keepTurns = Number.isInteger(Number(keepTurnsRaw)) && Number(keepTurnsRaw) >= 1
        ? Number(keepTurnsRaw)
        : 5;
    const role = CHAT_MEMORY_ROLES.includes(overrides.role)
        ? overrides.role
        : CHAT_MEMORY_ROLES.includes(oaiSettings?.chat_memory_role)
            ? oaiSettings.chat_memory_role
            : 'system';
    const globalPrompt = String(oaiSettings?.chat_memory_prompt ?? '') || getDefaultChatMemoryPrompt();
    const globalWrap = String(oaiSettings?.chat_memory_wrap ?? '') || getDefaultChatMemoryWrap();
    const globalMaxTokens = Number.isInteger(Number(oaiSettings?.chat_memory_max_tokens)) && Number(oaiSettings.chat_memory_max_tokens) > 0
        ? Number(oaiSettings.chat_memory_max_tokens)
        : 400;
    return {
        enabled: typeof overrides.disabled === 'boolean'
            ? !overrides.disabled
            : !!(oaiSettings?.chat_memory_enabled ?? true),
        keepTurns,
        prompt: String(overrides.prompt ?? globalPrompt) || getDefaultChatMemoryPrompt(),
        wrap: String(overrides.wrap ?? globalWrap) || getDefaultChatMemoryWrap(),
        role,
        maxTokens: Number.isInteger(Number(overrides.maxTokens ?? globalMaxTokens)) && Number(overrides.maxTokens ?? globalMaxTokens) > 0
            ? Number(overrides.maxTokens ?? globalMaxTokens)
            : globalMaxTokens,
    };
}

/**
 * Reads (and normalizes the shape of) `chat_metadata.chat_memory`.
 * @param {object} chatMetadata
 * @returns {{summaries: object[], notes: object[], history: object[], disabled?: boolean, keepTurns?: number}}
 */
export function getChatMemoryMetadata(chatMetadata) {
    const memory = chatMetadata?.[CHAT_MEMORY_METADATA_KEY];
    if (!memory || typeof memory !== 'object') {
        return { summaries: [], notes: [] };
    }
    return {
        ...memory,
        summaries: Array.isArray(memory.summaries) ? memory.summaries : [],
        notes: Array.isArray(memory.notes) ? memory.notes : [],
        history: appendChatMemoryHistory(memory),
    };
}

/** Appends a bounded, per-chat operation record without retaining source text. */
export function appendChatMemoryHistory(memory, entry) {
    const history = Array.isArray(memory?.history) ? memory.history : [];
    return [...history, ...(entry ? [entry] : [])].filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .slice(-CHAT_MEMORY_HISTORY_LIMIT).map(item => ({
            at: Number.isFinite(item.at) ? item.at : 0,
            action: ['settings', 'pin', 'regenerate', 'retry', 'automatic'].includes(item.action) ? item.action : 'unknown',
            turnKey: typeof item.turnKey === 'string' && /^[\w-]{1,128}$/.test(item.turnKey) ? item.turnKey : null,
            status: item.status === 'success' ? 'success' : 'failed',
            ...(item.error ? { error: 'Operation failed' } : {}),
        }));
}

/**
 * Reconciles stored summaries against the current chat: drops orphan records,
 * flags content drift as stale, flips active/expanded with the window, and
 * lists turns that need (re)generation. Pure — callers decide whether to
 * persist the returned `summaries`.
 * @param {object[]} chat
 * @param {object} memory Normalized memory metadata (from getChatMemoryMetadata)
 * @param {number} keepTurns
 * @returns {{
 *   partition: object,
 *   summaries: object[],
 *   activeSummaries: object[],
 *   pending: {turn: object, contentHash: string, retries: number, record: object|null}[],
 *   stats: {totalTurns: number, verbatimTurns: number, summarizedTurns: number},
 * }}
 */
export function reconcileChatMemory(chat, memory, keepTurns) {
    const partition = partitionChatTurns(chat);
    const { verbatimTurnKeys, summarizableTurns } = computeMemoryWindow(partition, keepTurns);
    const summarizableKeys = new Set(summarizableTurns.map(turn => turn.key));

    // id → turn, for orphan / partial-coverage detection. Leading-group
    // messages (before the first user message) resolve to a synthetic turn so
    // manually-created leading summaries are anchored rather than destroyed.
    const turnById = new Map();
    for (const turn of partition.turns) {
        for (const id of turn.messageIds) {
            if (id !== null) {
                turnById.set(id, turn);
            }
        }
    }
    const leadingItems = partition.leading?.items ?? [];
    if (leadingItems.length) {
        const leadingTurn = {
            items: leadingItems,
            index: -1,
            startIndex: leadingItems[0].index,
            key: leadingItems[0].id,
            messageIds: leadingItems.map(item => item.id),
            closed: true,
            pinned: partition.leading.pinned === true,
        };
        for (const id of leadingTurn.messageIds) {
            if (id !== null) {
                turnById.set(id, leadingTurn);
            }
        }
    }

    const summaries = [];
    const pending = [];
    const resolvedTurnKeys = new Set();
    const hashCache = new Map();
    const hashOf = turn => {
        if (!hashCache.has(turn)) {
            hashCache.set(turn, computeTurnHash(chat, turn));
        }
        return hashCache.get(turn);
    };

    for (const record of memory.summaries) {
        if (!record || typeof record !== 'object') {
            continue;
        }
        const coveredIds = Array.isArray(record.messageIds) ? record.messageIds : [];
        const turn = turnById.get(record.turnKey)
            ?? turnById.get(coveredIds.find(id => turnById.has(id)))
            ?? null;
        if (!turn || turn.messageIds.some(id => id === null)) {
            continue; // anchored turn gone entirely
        }
        if (resolvedTurnKeys.has(turn.key)) {
            continue; // another record already claimed this (merged) turn
        }
        resolvedTurnKeys.add(turn.key);
        // Positional bookkeeping drifts on every merge/delete — refresh from
        // the resolved turn so identifiers and {{turnIndex}} stay honest.
        const next = { ...record, turnIndex: turn.index, firstIndex: turn.startIndex };
        const turnHash = hashOf(turn);
        const sameContent = turnHash === record.contentHash;
        // Attempts are counted per content version: `lastAttemptHash` is the
        // hash of the content the worker last tried to summarize.
        const attempts = record.lastAttemptHash === turnHash && Number.isInteger(record.retries)
            ? record.retries
            : 0;
        next.stale = !sameContent;
        if (next.manual) {
            // User-edited text is never auto-overwritten; it keeps masking with
            // a `stale` flag the UI can surface.
            next.status = verbatimTurnKeys.has(turn.key) || turn.pinned ? TURN_SUMMARY_STATUS.EXPANDED : TURN_SUMMARY_STATUS.ACTIVE;
            summaries.push(next);
            continue;
        }
        if (!sameContent) {
            if (record.status === TURN_SUMMARY_STATUS.FAILED && record.lastAttemptHash === turnHash) {
                // Attempts already exhausted for this exact content version.
                summaries.push(next);
                continue;
            }
            if (record.status === TURN_SUMMARY_STATUS.FAILED || attempts >= CHAT_MEMORY_MAX_AUTO_ATTEMPTS) {
                // Content moved past the failed version: drop so the fresh
                // version gets a clean budget. Attempt-cap reaches here when
                // retries already hit the limit under the same hash.
                if (record.status !== TURN_SUMMARY_STATUS.FAILED) {
                    next.status = TURN_SUMMARY_STATUS.FAILED;
                    summaries.push(next);
                }
                continue;
            }
            next.status = TURN_SUMMARY_STATUS.STALE;
            next.retries = attempts;
            summaries.push(next);
            if (summarizableKeys.has(turn.key)) {
                pending.push({ turn, contentHash: turnHash, retries: attempts, record: next });
            }
            continue;
        }
        next.stale = false;
        const hasText = typeof record.text === 'string' && record.text.trim().length > 0;
        if (hasText && record.status !== TURN_SUMMARY_STATUS.FAILED) {
            // A usable summary for this exact content — mask or expand per
            // the window. Covers content that reverted to a summarized version.
            next.status = verbatimTurnKeys.has(turn.key) || turn.pinned
                ? TURN_SUMMARY_STATUS.EXPANDED
                : TURN_SUMMARY_STATUS.ACTIVE;
        } else if (record.status === TURN_SUMMARY_STATUS.PENDING) {
            next.status = TURN_SUMMARY_STATUS.PENDING; // re-queued in pass 2
        } else if (record.status === TURN_SUMMARY_STATUS.FAILED || attempts >= CHAT_MEMORY_MAX_AUTO_ATTEMPTS) {
            next.status = TURN_SUMMARY_STATUS.FAILED;
        } else {
            // Failed attempt (or textless record) with retry budget left.
            next.status = TURN_SUMMARY_STATUS.STALE;
            next.retries = attempts;
            if (summarizableKeys.has(turn.key)) {
                pending.push({ turn, contentHash: turnHash, retries: attempts, record: next });
            }
        }
        summaries.push(next);
    }

    // Turns in the summarizable range without a usable record need generation.
    const recordsByKey = new Map(summaries.map(record => [record.turnKey, record]));
    for (const turn of summarizableTurns) {
        const existing = recordsByKey.get(turn.key);
        const turnHash = hashOf(turn);
        if (!existing) {
            pending.push({ turn, contentHash: turnHash, retries: 0, record: null });
        } else if (existing.status === TURN_SUMMARY_STATUS.PENDING && existing.contentHash === turnHash) {
            // PENDING survives reloads but the queue does not — re-queue.
            pending.push({ turn, contentHash: turnHash, retries: existing.retries ?? 0, record: existing });
        }
        // Stale records were already queued (or failed-capped) in the first
        // pass — nothing further to do for them here.
    }

    const activeSummaries = summaries.filter(record => record.status === TURN_SUMMARY_STATUS.ACTIVE);
    return {
        partition,
        summarizableTurns,
        verbatimTurnKeys,
        summaries,
        activeSummaries,
        pending,
        stats: {
            totalTurns: partition.turns.length,
            verbatimTurns: partition.turns.filter(turn => verbatimTurnKeys.has(turn.key)).length,
            summarizedTurns: activeSummaries.length,
        },
    };
}

/**
 * Renders the wrap template around a summary body. Supported macros:
 * {{summary}}, {{turnIndex}}, {{user}}, {{char}}.
 * @param {string} template
 * @param {{summary: string, turnIndex: number, name1?: string, name2?: string}} values
 * @returns {string}
 */
export function renderSummaryWrap(template, { summary, turnIndex, name1 = '', name2 = '' }) {
    const source = String(template ?? '') || getDefaultChatMemoryWrap();
    const replaced = source.includes('{{summary}}')
        ? source.split('{{summary}}').join(String(summary ?? ''))
        : `${source}\n${String(summary ?? '')}`;
    return replaced
        .split('{{turnIndex}}').join(String(turnIndex ?? ''))
        .split('{{char}}').join(String(name2 ?? ''))
        .split('{{user}}').join(String(name1 ?? ''));
}

/**
 * Collapses coreChat items covered by active summaries into single pseudo
 * messages, in place of the original range (in-position replacement). Runs on
 * the assembly copy — canonical chat items are never touched.
 * @param {object[]} coreChat Assembly-stage items (post system-record filter)
 * @param {object[]} activeSummaries Records with status ACTIVE
 * @param {{role: string, wrap: string, name1: string, name2: string}} options
 * @returns {{items: object[], summarized: object[]}}
 */
export function applySummariesToCoreChat(coreChat, activeSummaries, { role = 'system', wrap = '', name1 = '', name2 = '' } = {}) {
    const items = Array.isArray(coreChat) ? coreChat : [];
    if (!items.length || !Array.isArray(activeSummaries) || !activeSummaries.length) {
        return { items, summarized: [] };
    }

    const replacements = [];
    for (const summary of activeSummaries) {
        const covered = new Set(Array.isArray(summary.messageIds) ? summary.messageIds : []);
        if (!covered.size) {
            continue;
        }
        let lo = -1;
        let hi = -1;
        const matchedIds = [];
        for (let i = 0; i < items.length; i++) {
            const id = items[i]?.extra?.id;
            if (id !== undefined && id !== null && covered.has(id)) {
                if (lo === -1) {
                    lo = i;
                }
                hi = i;
                matchedIds.push(id);
            }
        }
        if (lo === -1) {
            continue; // every covered message filtered out this send
        }
        replacements.push({ lo, hi, summary, matchedIds });
    }
    if (!replacements.length) {
        return { items, summarized: [] };
    }
    replacements.sort((a, b) => a.lo - b.lo);
    // Drop overlapping coverage before grouping (e.g. two records anchoring
    // one merged turn) — reconcile converges the records later.
    const cleanReplacements = [];
    let claimCursor = 0;
    for (const rep of replacements) {
        if (rep.lo >= claimCursor) {
            cleanReplacements.push(rep);
            claimCursor = rep.hi + 1;
        }
    }

    // Merge adjacent covered ranges into ONE aggregated wire message: a run
    // of back-to-back summarized turns (no verbatim message between them)
    // collapses into a single pseudo message with per-turn labels inside a
    // single wrap — saves per-message framing and repeat wrap overhead.
    const groups = [];
    for (const rep of cleanReplacements) {
        const last = groups.at(-1);
        if (last && rep.lo === last.hi + 1) {
            last.members.push(rep);
            last.hi = rep.hi;
        } else {
            groups.push({ lo: rep.lo, hi: rep.hi, members: [rep] });
        }
    }

    const roleName = role === 'assistant' ? name2 : role === 'user' ? name1 : '';
    const summarized = [];
    const next = [];
    let cursor = 0;
    for (const group of groups) {
        for (let i = cursor; i < group.lo; i++) {
            next.push(items[i]);
        }
        const members = group.members;
        const single = members.length === 1;
        const turnIndices = members.map(m => m.summary.turnIndex ?? 0);
        const wireId = single
            ? `chatSummary-turn-${turnIndices[0]}`
            : `chatSummary-turns-${turnIndices[0]}-${turnIndices.at(-1)}`;
        const body = single
            ? String(members[0].summary.text ?? '')
            : members.map(m => translate('Turn ${0}: ${1}')
                .replace('${0}', String((m.summary.turnIndex ?? 0) + 1))
                .replace('${1}', String(m.summary.text ?? ''))).join('\n');
        const coveredIds = members.flatMap(m => m.matchedIds);
        const meta = {
            summaryId: single ? members[0].summary.id : null,
            summaryIds: members.map(m => m.summary.id),
            turnKey: single ? members[0].summary.turnKey : null,
            turnKeys: members.map(m => m.summary.turnKey),
            turnIndex: turnIndices[0],
            turnIndices,
            coveredIds,
        };
        next.push({
            name: roleName,
            is_user: role === 'user',
            is_system: false,
            // Assistant-role summaries get the character avatar + name prefix
            // under DEFAULT names_behavior, matching a real assistant row.
            force_avatar: role === 'assistant',
            mes: renderSummaryWrap(wrap, { summary: body, turnIndex: meta.turnIndex, name1, name2 }),
            send_date: items[group.lo]?.send_date,
            extra: {
                ...(role === 'system' ? { type: 'narrator' } : {}),
                chatMemorySummary: meta,
            },
        });
        for (const { summary, matchedIds } of members) {
            summarized.push({
                identifier: wireId,
                role,
                turnIndex: summary.turnIndex ?? 0,
                turnKey: summary.turnKey,
                summaryId: summary.id,
                text: String(summary.text ?? ''),
                coveredCount: matchedIds.length,
                stale: !!summary.stale,
                manual: !!summary.manual,
                grouped: !single,
            });
        }
        cursor = group.hi + 1;
    }
    for (let i = cursor; i < items.length; i++) {
        next.push(items[i]);
    }
    return { items: next, summarized };
}

/**
 * Copies memory metadata for a branch so only summaries whose covered
 * messages all survive into `chat.slice(0, upToIndex + 1)` are carried over.
 * @param {object} memory Normalized memory metadata
 * @param {object[]} chat Canonical chat of the source chat
 * @param {number} upToIndex Branch cut index (inclusive)
 * @returns {object|null} Filtered memory object, or null when nothing remains.
 */
export function filterMemoryForBranch(memory, chat, upToIndex) {
    if (!memory || typeof memory !== 'object') {
        return null;
    }
    const survivingIds = new Set();
    const list = Array.isArray(chat) ? chat : [];
    for (let i = 0; i <= Math.min(upToIndex, list.length - 1); i++) {
        const id = list[i]?.extra?.id;
        if (id !== undefined && id !== null) {
            survivingIds.add(id);
        }
    }
    const summaries = (Array.isArray(memory.summaries) ? memory.summaries : []).filter(record =>
        Array.isArray(record?.messageIds)
        && record.messageIds.length > 0
        && record.messageIds.every(id => survivingIds.has(id)),
    );
    const settingKeys = ['disabled', 'keepTurns', 'role', 'prompt', 'wrap', 'maxTokens'];
    const settings = Object.fromEntries(settingKeys
        .filter(key => Object.hasOwn(memory, key))
        .map(key => [key, memory[key]]));
    if (!summaries.length && !(Array.isArray(memory.notes) && memory.notes.length) && !Object.keys(settings).length) {
        return null;
    }
    return {
        ...settings,
        summaries,
        notes: Array.isArray(memory.notes) ? memory.notes : [],
    };
}
