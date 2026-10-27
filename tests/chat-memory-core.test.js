import { describe, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/constants.js', () => ({ IGNORE_SYMBOL: 'ignore' }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({
    translate: value => value === 'Turn ${0}: ${1}' ? '第${0}轮：${1}' : value,
}));
const { IGNORE_SYMBOL } = await import('../public/scripts/constants.js');

const {
    CHAT_MEMORY_MAX_AUTO_ATTEMPTS,
    CHAT_MEMORY_METADATA_KEY,
    TURN_SUMMARY_STATUS,
    applySummariesToCoreChat,
    computeMemoryWindow,
    computeTurnHash,
    ensureChatMessageIds,
    extractTurnSourceText,
    filterMemoryForBranch,
    getChatMemoryMetadata,
    partitionChatTurns,
    reconcileChatMemory,
    renderSummaryWrap,
    resolveChatMemorySettings,
    stripMarkupForSummary,
} = await import('../public/scripts/chat-memory-core.js');

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

function makeMessage({ is_user = false, is_system = false, mes = 'text', extra = {}, name = null } = {}) {
    return { is_user, is_system, mes, name: name ?? (is_user ? 'User' : 'Char'), send_date: 'now', extra: { id: nextId(), ...extra } };
}

/** greeting + N closed turns (user + assistant each) */
function makeChat(turnCount, { greeting = true } = {}) {
    const chat = [];
    if (greeting) {
        chat.push(makeMessage({ mes: 'greeting', is_user: false }));
    }
    for (let i = 0; i < turnCount; i++) {
        chat.push(makeMessage({ is_user: true, mes: `user-${i}` }));
        chat.push(makeMessage({ is_user: false, mes: `char-${i}` }));
    }
    return chat;
}

describe('ensureChatMessageIds', () => {
    test('backfills missing ids without touching existing ones', () => {
        const chat = [{ mes: 'a' }, { mes: 'b', extra: { id: 'keep' } }, { mes: 'c', extra: {} }];
        const assigned = ensureChatMessageIds(chat, nextId);
        expect(assigned).toBe(2);
        expect(chat[0].extra.id).toBeTruthy();
        expect(chat[1].extra.id).toBe('keep');
        expect(chat[2].extra.id).toBeTruthy();
    });
});

describe('partitionChatTurns', () => {
    test('leading group + closed turns + open tail', () => {
        const chat = makeChat(3);
        chat.push(makeMessage({ is_user: true, mes: 'open question' }));
        const { leading, turns } = partitionChatTurns(chat);
        expect(leading.items).toHaveLength(1);
        expect(turns).toHaveLength(4);
        expect(turns[0].closed).toBe(true);
        expect(turns[3].closed).toBe(false);
        expect(turns[0].key).toBe(chat[1].extra.id);
        expect(turns[0].messageIds).toEqual([chat[1].extra.id, chat[2].extra.id]);
    });

    test('no user messages → everything is leading', () => {
        const chat = [makeMessage({ mes: 'a' }), makeMessage({ mes: 'b' })];
        const { leading, turns } = partitionChatTurns(chat);
        expect(leading.items).toHaveLength(2);
        expect(turns).toHaveLength(0);
    });

    test('pinned message pins its whole turn', () => {
        const chat = makeChat(2);
        chat[2].extra.pinned = true; // assistant of turn 0
        const { turns } = partitionChatTurns(chat);
        expect(turns[0].pinned).toBe(true);
        expect(turns[1].pinned).toBe(false);
    });
});

describe('computeMemoryWindow', () => {
    test('keeps the newest N closed turns verbatim; open tail never summarized', () => {
        const chat = makeChat(6);
        chat.push(makeMessage({ is_user: true, mes: 'open' }));
        const partition = partitionChatTurns(chat);
        const { verbatimTurnKeys, summarizableTurns } = computeMemoryWindow(partition, 5);
        expect(verbatimTurnKeys.size).toBe(5);
        // 7 turns total: 5 verbatim + 1 open tail + 1 summarizable (turn 0)
        expect(summarizableTurns.map(t => t.index)).toEqual([0]);
    });

    test('pinned turns are excluded from summarizable set', () => {
        const chat = makeChat(7);
        chat[1].extra.pinned = true; // user msg of turn 0
        const partition = partitionChatTurns(chat);
        const { summarizableTurns } = computeMemoryWindow(partition, 5);
        expect(summarizableTurns.map(t => t.index)).toEqual([1]);
    });

    test('fewer closed turns than N → nothing summarizable', () => {
        const chat = makeChat(3);
        const partition = partitionChatTurns(chat);
        expect(computeMemoryWindow(partition, 5).summarizableTurns).toHaveLength(0);
    });
});

describe('stripMarkupForSummary / extractTurnSourceText', () => {
    test('strips earlier pipeline step blocks but keeps last step inner text', () => {
        const invocations = [{ name: 'analyze' }, { name: 'respond' }];
        const content = '<analyze>scratch</analyze><respond>final reply</respond>';
        expect(stripMarkupForSummary(content, invocations)).toBe('final reply');
    });

    test('extract skips hidden/system records and ignored messages', () => {
        const chat = makeChat(1);
        chat.push(makeMessage({ is_user: true, mes: 'visible' }));
        chat.push(makeMessage({ is_system: true, mes: 'tool card' }));
        chat.push(makeMessage({ is_user: false, mes: 'hidden-ish', extra: { [IGNORE_SYMBOL]: true } }));
        const { turns } = partitionChatTurns(chat);
        const text = extractTurnSourceText(chat, turns[1]);
        expect(text).toContain('visible');
        expect(text).not.toContain('tool card');
        expect(text).not.toContain('hidden-ish');
    });
});

describe('computeTurnHash', () => {
    test('changes when covered content or role flags change', () => {
        const chat = makeChat(1);
        const turn = partitionChatTurns(chat).turns[0];
        const before = computeTurnHash(chat, turn);
        chat[2].mes = 'edited reply';
        expect(computeTurnHash(chat, turn)).not.toBe(before);
        chat[2].mes = 'char-0';
        chat[2].is_system = true;
        expect(computeTurnHash(chat, turn)).not.toBe(before);
    });
});

describe('reconcileChatMemory', () => {
    test('fresh summarizable turns get queued with empty record', () => {
        const chat = makeChat(7);
        const memory = { summaries: [], notes: [] };
        const result = reconcileChatMemory(chat, memory, 5);
        // 7 closed turns, 5 verbatim → turns 0 and 1 are eligible
        expect(result.pending).toHaveLength(2);
        expect(result.pending[0].turn.index).toBe(0);
        expect(result.pending[0].record).toBeNull();
    });

    test('active summary masks its turn; verbatim flip expands it', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const hash = computeTurnHash(chat, turn0);
        const memory = {
            summaries: [{
                id: 's1', turnKey: turn0.key, turnIndex: 0,
                messageIds: turn0.messageIds, contentHash: hash,
                text: 'summary', status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0,
            }],
            notes: [],
        };
        let result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.ACTIVE);
        expect(result.activeSummaries).toHaveLength(1);

        // Keep all 7 verbatim → turn 0 slides into the window → expanded (raw sent)
        result = reconcileChatMemory(chat, memory, 7);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.EXPANDED);
        expect(result.activeSummaries).toHaveLength(0);
    });

    test('deleting newest turns refills older summarized turns to expanded', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const memory = {
            summaries: [{
                id: 's1', turnKey: turn0.key, turnIndex: 0,
                messageIds: turn0.messageIds, contentHash: computeTurnHash(chat, turn0),
                text: 'summary', status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0,
            }],
            notes: [],
        };
        // Delete the two newest turns (4 messages) → only 3 closed turns remain
        chat.splice(-4);
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.EXPANDED);
    });

    test('editing covered content marks stale and re-queues with retry budget', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const memory = {
            summaries: [{
                id: 's1', turnKey: turn0.key, turnIndex: 0,
                messageIds: turn0.messageIds, contentHash: 'old-hash',
                lastAttemptHash: 'old-hash', text: 'summary',
                status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        const record = result.summaries[0];
        expect(record.status).toBe(TURN_SUMMARY_STATUS.STALE);
        expect(record.stale).toBe(true);
        // turn 0 stale re-queue + turn 1 fresh (7 turns, 5 verbatim)
        expect(result.pending).toHaveLength(2);
        expect(result.pending[0].record).toBe(record);
    });

    test('orphaned records (all covered ids gone) are dropped', () => {
        const chat = makeChat(7);
        const memory = {
            summaries: [{
                id: 'ghost', turnKey: 'gone', messageIds: ['gone', 'gone2'],
                contentHash: 'x', text: 't', status: TURN_SUMMARY_STATUS.ACTIVE,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries).toHaveLength(0);
    });

    test('PENDING records with matching hash get re-queued after reload', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const hash = computeTurnHash(chat, turn0);
        const memory = {
            summaries: [{
                id: 'p1', turnKey: turn0.key, messageIds: turn0.messageIds,
                contentHash: hash, lastAttemptHash: hash,
                status: TURN_SUMMARY_STATUS.PENDING, retries: 0,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        const requeued = result.pending.filter(job => job.record?.id === 'p1');
        expect(requeued).toHaveLength(1);
    });

    test('failed records stay dormant for the same content version', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const hash = computeTurnHash(chat, turn0);
        const memory = {
            summaries: [{
                id: 'f1', turnKey: turn0.key, messageIds: turn0.messageIds,
                contentHash: 'prev', lastAttemptHash: hash,
                status: TURN_SUMMARY_STATUS.FAILED, retries: CHAT_MEMORY_MAX_AUTO_ATTEMPTS,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.FAILED);
        expect(result.pending.filter(job => job.record?.id === 'f1')).toHaveLength(0);
    });

    test('a failed attempt (STALE, same hash) is re-queued until the attempt cap', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const hash = computeTurnHash(chat, turn0);
        // Shape the worker writes after attempt 1 fails: STALE, same content
        // hash, retries=1. It must be re-queued — not parked forever.
        const memory = {
            summaries: [{
                id: 'w1', turnKey: turn0.key, messageIds: turn0.messageIds,
                contentHash: hash, lastAttemptHash: hash, text: '',
                status: TURN_SUMMARY_STATUS.STALE, retries: 1,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.STALE);
        const requeued = result.pending.filter(job => job.record?.id === 'w1');
        expect(requeued).toHaveLength(1);

        // After the attempt budget is exhausted the record caps at FAILED.
        memory.summaries[0].retries = CHAT_MEMORY_MAX_AUTO_ATTEMPTS;
        const capped = reconcileChatMemory(chat, memory, 5);
        expect(capped.summaries[0].status).toBe(TURN_SUMMARY_STATUS.FAILED);
        expect(capped.pending.filter(job => job.record?.id === 'w1')).toHaveLength(0);
    });

    test('content reverting to a summarized version reactivates the summary', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const hash = computeTurnHash(chat, turn0);
        const memory = {
            summaries: [{
                id: 'r1', turnKey: turn0.key, messageIds: turn0.messageIds,
                contentHash: hash, lastAttemptHash: hash, text: 'summary',
                status: TURN_SUMMARY_STATUS.STALE, retries: 1,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.ACTIVE);
        expect(result.activeSummaries).toHaveLength(1);
        expect(result.pending.filter(job => job.record?.id === 'r1')).toHaveLength(0);
    });

    test('hiding a user message (is_system) drifts the turn hash and re-queues', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const hash = computeTurnHash(chat, turn0);
        const memory = {
            summaries: [{
                id: 'h1', turnKey: turn0.key, messageIds: turn0.messageIds,
                contentHash: hash, lastAttemptHash: hash, text: 'summary',
                status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0,
            }],
            notes: [],
        };
        chat[turn0.items[0].index].is_system = true; // hidden user message
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.STALE);
        expect(result.summaries[0].stale).toBe(true);
        expect(result.pending.some(job => job.record?.id === 'h1')).toBe(true);
        // Hidden content must not feed the summary source either.
        const freshTurn = partitionChatTurns(chat).turns[0];
        expect(extractTurnSourceText(chat, freshTurn)).not.toContain('user-0');
    });

    test('manual records anchored to the leading group survive reconciliation', () => {
        const chat = makeChat(7);
        const { leading } = partitionChatTurns(chat);
        const leadingIds = leading.items.map(item => item.id);
        const memory = {
            summaries: [{
                id: 'm1', turnKey: leadingIds[0], messageIds: leadingIds,
                contentHash: 'any', text: '开场白摘要', manual: true,
                status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries.map(r => r.id)).toContain('m1');
        expect(result.summaries[0].status).toBe(TURN_SUMMARY_STATUS.ACTIVE);
        // Leading group is never auto-summarized — no pending job for it.
        expect(result.pending.every(job => job.turn.key !== leadingIds[0])).toBe(true);
    });

    test('record turnIndex/firstIndex refresh to the resolved turn', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const memory = {
            summaries: [{
                id: 'i1', turnKey: turn0.key, turnIndex: 42, firstIndex: 99,
                messageIds: turn0.messageIds, contentHash: computeTurnHash(chat, turn0),
                text: 'summary', status: TURN_SUMMARY_STATUS.ACTIVE, retries: 0,
            }],
            notes: [],
        };
        const result = reconcileChatMemory(chat, memory, 5);
        expect(result.summaries[0].turnIndex).toBe(0);
        expect(result.summaries[0].firstIndex).toBe(turn0.startIndex);
    });

    test('keepTurns 0 summarizes every closed unpinned turn except the tail', () => {
        const chat = makeChat(3);
        const result = reconcileChatMemory(chat, { summaries: [], notes: [] }, 0);
        // The tail turn is always excluded — its content can still change.
        expect(result.summarizableTurns.map(t => t.index)).toEqual([0, 1]);
        expect(result.pending).toHaveLength(2);
    });

    test('two records resolving to one merged turn keep only the first claim', () => {
        const chat = makeChat(7);
        const partition = partitionChatTurns(chat);
        const turn0 = partition.turns[0];
        const turn1 = partition.turns[1];
        const memory = {
            summaries: [
                { id: 'a', turnKey: turn0.key, messageIds: turn0.messageIds, contentHash: 'x', status: TURN_SUMMARY_STATUS.ACTIVE, text: 'a' },
                { id: 'b', turnKey: turn1.key, messageIds: [...turn1.messageIds], contentHash: 'y', status: TURN_SUMMARY_STATUS.ACTIVE, text: 'b' },
            ],
            notes: [],
        };
        // Delete turn1's user message → turn1's assistant merges into turn0's
        // turn; turn0's anchor id survives so record 'a' claims the merged
        // turn and record 'b' resolves to the same turn — dropped.
        chat.splice(turn1.startIndex, 1);
        const result = reconcileChatMemory(chat, memory, 5);
        const ids = result.summaries.map(r => r.id);
        expect(ids).toContain('a');
        expect(ids).not.toContain('b');
    });
});

describe('applySummariesToCoreChat', () => {
    test('replaces covered range in place with a wrapped pseudo message', () => {
        const chat = makeChat(7);
        const turn0 = partitionChatTurns(chat).turns[0];
        const active = [{
            id: 's1', turnKey: turn0.key, turnIndex: 0,
            messageIds: turn0.messageIds, text: 'They argued.',
        }];
        const { items, summarized } = applySummariesToCoreChat(chat, active, {
            role: 'system', wrap: '【早前剧情回顾】\n{{summary}}', name1: 'User', name2: 'Char',
        });
        expect(items).toHaveLength(chat.length - 1); // 2 msgs → 1 summary
        expect(items[1].extra.chatMemorySummary.turnIndex).toBe(0);
        expect(items[1].mes).toBe('【早前剧情回顾】\nThey argued.');
        expect(items[0]).toBe(chat[0]); // greeting untouched
        expect(items[2]).toBe(chat[3]); // next turn untouched
        expect(summarized).toHaveLength(1);
        expect(summarized[0]).toMatchObject({ identifier: 'chatSummary-turn-0', coveredCount: 2 });
    });

    test('adjacent covered turns aggregate into one wrapped pseudo message', () => {
        const chat = makeChat(7);
        const turns = partitionChatTurns(chat).turns;
        const active = [
            { id: 's1', turnKey: turns[0].key, turnIndex: 0, messageIds: turns[0].messageIds, text: 'one' },
            { id: 's2', turnKey: turns[1].key, turnIndex: 1, messageIds: turns[1].messageIds, text: 'two' },
            { id: 's5', turnKey: turns[5].key, turnIndex: 5, messageIds: turns[5].messageIds, text: 'six' },
        ];
        const { items, summarized } = applySummariesToCoreChat(chat, active, {
            role: 'system', wrap: '【早前剧情回顾】\n{{summary}}',
        });
        const injected = items.filter(i => i?.extra?.chatMemorySummary);
        // turns 0+1 adjacent → one message; turn 5 isolated → another
        expect(injected).toHaveLength(2);
        expect(injected[0].mes).toBe('【早前剧情回顾】\n第1轮：one\n第2轮：two');
        expect(injected[0].extra.chatMemorySummary.turnIndices).toEqual([0, 1]);
        expect(injected[1].mes).toBe('【早前剧情回顾】\nsix');
        // Per-turn inspector entries survive; they share the group wire id
        expect(summarized).toHaveLength(3);
        expect(summarized[0].identifier).toBe('chatSummary-turns-0-1');
        expect(summarized[0].grouped).toBe(true);
        expect(summarized[2].identifier).toBe('chatSummary-turn-5');
    });

    test('overlapping coverage never injects twice', () => {
        const chat = makeChat(7);
        const turns = partitionChatTurns(chat).turns;
        const active = [
            { id: 's1', turnKey: turns[0].key, turnIndex: 0, messageIds: turns[0].messageIds, text: 'one' },
            // overlaps turn0 + turn1 — must be skipped entirely
            { id: 's2', turnKey: 'dup', turnIndex: 1, messageIds: [...turns[0].messageIds, ...turns[1].messageIds], text: 'two' },
        ];
        const { items, summarized } = applySummariesToCoreChat(chat, active, { role: 'system', wrap: '{{summary}}' });
        expect(summarized).toHaveLength(1);
        expect(items.filter(i => i?.extra?.chatMemorySummary)).toHaveLength(1);
    });
});

describe('filterMemoryForBranch', () => {
    test('drops summaries whose covered ids do not all survive the cut', () => {
        const chat = makeChat(4, { greeting: false });
        const turns = partitionChatTurns(chat).turns;
        const memory = {
            summaries: [
                { id: 'a', turnKey: turns[0].key, messageIds: turns[0].messageIds },
                { id: 'b', turnKey: turns[2].key, messageIds: turns[2].messageIds },
            ],
            notes: [{ id: 'n1', text: 'note' }],
        };
        // Branch at end of turn 1 → turn0 summary survives, turn2 does not
        const filtered = filterMemoryForBranch(memory, chat, turns[1].items.at(-1).index);
        expect(filtered.summaries.map(r => r.id)).toEqual(['a']);
        expect(filtered.notes).toHaveLength(1);
        expect(filterMemoryForBranch({ ...memory, role: 'assistant' }, chat, turns[1].items.at(-1).index).role).toBe('assistant');
        // Cut before everything: summaries all drop, notes still carry over
        const none = filterMemoryForBranch(memory, chat, -1);
        expect(none.summaries).toEqual([]);
        expect(none.notes).toHaveLength(1);
        expect(filterMemoryForBranch({ summaries: memory.summaries }, chat, -1)).toBeNull();
    });
});

describe('resolveChatMemorySettings / renderSummaryWrap / getChatMemoryMetadata', () => {
    test('summarization defaults on while explicit global and chat choices are preserved', () => {
        expect(resolveChatMemorySettings({}, {}).enabled).toBe(true);
        expect(resolveChatMemorySettings({ chat_memory_enabled: null }, {}).enabled).toBe(true);
        expect(resolveChatMemorySettings({ chat_memory_enabled: false }, {}).enabled).toBe(false);
        expect(resolveChatMemorySettings({}, { chat_memory: { disabled: true } }).enabled).toBe(false);
    });

    test('defaults and per-chat overrides', () => {
        const oai = { chat_memory_enabled: true, chat_memory_keep_turns: '7' };
        const resolved = resolveChatMemorySettings(oai, {});
        expect(resolved).toMatchObject({ enabled: true, keepTurns: 7, role: 'system' });
        expect(resolveChatMemorySettings(oai, { [CHAT_MEMORY_METADATA_KEY]: { disabled: true } }).enabled).toBe(false);
        expect(resolveChatMemorySettings(oai, { [CHAT_MEMORY_METADATA_KEY]: { keepTurns: 2 } }).keepTurns).toBe(2);
    });

    test('chat-local settings override global defaults and can explicitly enable the feature', () => {
        const globalSettings = {
            chat_memory_enabled: false,
            chat_memory_keep_turns: 7,
            chat_memory_role: 'system',
            chat_memory_prompt: 'global prompt',
            chat_memory_wrap: 'global {{summary}}',
            chat_memory_max_tokens: 400,
        };
        const overrides = {
            disabled: false,
            keepTurns: 2,
            role: 'assistant',
            prompt: 'local prompt',
            wrap: 'local {{summary}}',
            maxTokens: 128,
        };

        expect(resolveChatMemorySettings(globalSettings, { chat_memory: overrides })).toEqual({
            enabled: true,
            keepTurns: 2,
            role: 'assistant',
            prompt: 'local prompt',
            wrap: 'local {{summary}}',
            maxTokens: 128,
        });
        expect(resolveChatMemorySettings(globalSettings, {})).toMatchObject({ enabled: false, keepTurns: 7, role: 'system' });
    });

    test('wrap renders {{summary}}, {{turnIndex}}, {{user}} and {{char}}', () => {
        expect(renderSummaryWrap('[T{{turnIndex}}] {{summary}}', { summary: 'X', turnIndex: 3 })).toBe('[T3] X');
        expect(renderSummaryWrap('', { summary: 'X', turnIndex: 0 })).toContain('X');
        expect(renderSummaryWrap('{{user}} 与 {{char}} 早前：{{summary}}', {
            summary: 'X', turnIndex: 0, name1: 'Allen', name2: 'Ember',
        })).toBe('Allen 与 Ember 早前：X');
    });

    test('metadata reader tolerates missing/garbage shapes', () => {
        expect(getChatMemoryMetadata(null)).toEqual({ summaries: [], notes: [] });
        expect(getChatMemoryMetadata({ [CHAT_MEMORY_METADATA_KEY]: 'x' }).summaries).toEqual([]);
        expect(getChatMemoryMetadata({ [CHAT_MEMORY_METADATA_KEY]: { summaries: 'x' } }).notes).toEqual([]);
    });

    test('metadata reader returns operation history without accepting malformed records', () => {
        expect(getChatMemoryMetadata({ chat_memory: { history: [{ id: 'run-1', status: 'success' }] } }).history)
            .toEqual([{ at: 0, action: 'unknown', turnKey: null, status: 'success' }]);
        expect(getChatMemoryMetadata({ chat_memory: { history: 'not an array' } }).history).toEqual([]);
    });

    test('metadata normalization bounds history and branch copies settings but never operation history', () => {
        const history = Array.from({ length: 55 }, (_, index) => ({ id: index }));
        const metadata = getChatMemoryMetadata({ chat_memory: { history } });
        expect(metadata.history).toHaveLength(50);
        expect(metadata.history[0]).not.toHaveProperty('id');
        const branch = filterMemoryForBranch({ disabled: false, keepTurns: 3, history, summaries: [], notes: [] }, makeChat(1), 2);
        expect(branch).toMatchObject({ disabled: false, keepTurns: 3 });
        expect(branch).not.toHaveProperty('history');
    });
});
