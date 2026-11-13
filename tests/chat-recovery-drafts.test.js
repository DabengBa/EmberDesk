import { describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

describe('chat recovery drafts', () => {
    test('extracts unsent composer, message and reasoning drafts without inventing edits', async () => {
        const { getRecoveryUnsentText } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        expect(getRecoveryUnsentText({ composer: { value: 'typed' }, editor: [['2', { editing: true, editText: 'edit' }], ['5', { reasoningEditing: true, reasoningEditText: 'thought' }], ['7', { editText: null }]] })).toEqual([
            { kind: 'composer', text: 'typed' }, { kind: 'message', messageId: '2', text: 'edit' }, { kind: 'reasoning', messageId: '5', text: 'thought' },
        ]);
        expect(getRecoveryUnsentText(null)).toEqual([]);
    });
    test('an existing pending delete is not sent if atomic storage is unavailable', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let sends = 0;
        const pending = { done: false, request: { avatar_url: 'a', chatfile: 'c.jsonl', version: 'v', operationId: 'op' } };
        const storage = { getItem: async () => pending, setItem: async () => {}, keys: async () => [] };
        const atomic = { ready: async () => { throw new Error('IndexedDB unavailable'); }, select: async () => pending, confirm: async () => {} };
        const deletion = createConditionalHistoryDelete({ storage, atomic, newId: () => 'unused', readVersion: async () => 'v', send: async () => { sends++; return { ok: true, status: 200 }; } });
        await expect(deletion('alice', { avatar: 'a', chat: 'c' })).rejects.toThrow('IndexedDB unavailable');
        expect(sends).toBe(0);
    });
    test('atomic pending selection shares one operation across independent callers without Web Locks', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map(), requests = [];
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, structuredClone(value)); }, keys: async () => [...data.keys()] };
        const atomic = {
            select: async (key, candidate) => {
                const old = data.get(key);
                if (old && !old.done) return structuredClone(old);
                data.set(key, structuredClone(candidate));
                return structuredClone(candidate);
            },
            confirm: async (key, id) => {
                const value = data.get(key);
                if (value?.request.operationId !== id) throw new Error('Deletion operation changed');
                data.set(key, { ...value, done: true });
            },
        };
        const make = id => createConditionalHistoryDelete({ storage, atomic, newId: () => id, readVersion: async () => 'v1', send: async request => { requests.push(structuredClone(request)); throw new Error('lost'); } });
        const identity = { avatar: 'a', chat: 'same' };
        await Promise.allSettled([make('one')('alice', identity), make('two')('alice', identity)]);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        expect([...data.values()][0].request).toEqual(requests[0]);
    });
    test('a delayed checkpoint cannot confirm a newer deletion operation for the same chat', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map();
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, structuredClone(value)); }, keys: async () => [...data.keys()] };
        let last = Promise.resolve(), id = 0;
        const runExclusive = (_key, fn) => { const next = last.catch(() => {}).then(fn); last = next; return next; };
        const deletion = createConditionalHistoryDelete({ storage, runExclusive, newId: () => `op-${++id}`, readVersion: async () => 'v', send: async () => ({ ok: true, status: 200 }) });
        const identity = { avatar: 'a', chat: 'c' };
        const first = await deletion('alice', identity, undefined, true);
        await deletion.confirm('alice', identity, first);
        const second = await deletion('alice', identity, undefined, true);
        expect(second).not.toBe(first);
        await expect(deletion.confirm('alice', identity, first)).rejects.toThrow('Deletion operation changed');
        expect(await deletion.listPending('alice')).toEqual([identity]);
    });
    test('two independent tabs do not overwrite an uncertain deletion operation', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map(), requests = [];
        const storage = {
            getItem: async key => data.get(key) ?? null,
            setItem: async (key, value) => { data.set(key, structuredClone(value)); },
            keys: async () => [...data.keys()],
        };
        let last = Promise.resolve();
        const runExclusive = (_key, operation) => {
            const next = last.catch(() => {}).then(operation);
            last = next;
            return next;
        };
        const make = id => createConditionalHistoryDelete({ storage, runExclusive, newId: () => id, readVersion: async () => 'v1', send: async request => { requests.push(structuredClone(request)); throw new Error('response lost'); } });
        const identity = { avatar: 'a', chat: 'same' };
        await Promise.allSettled([make('tab-one')('alice', identity), make('tab-two')('alice', identity)]);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        expect([...data.values()][0].request).toEqual(requests[0]);
    });
    test('distinguishes a persisted unconfirmed delete from a live recovery session', async () => {
        const { createConditionalHistoryDelete, createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map();
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, keys: async () => [...data.keys()] };
        const deletion = createConditionalHistoryDelete({ storage, newId: () => 'op', readVersion: async () => 'v', send: async () => { throw new Error('lost'); } });
        const recovery = createPendingChatRecovery({ account: () => 'alice', create: async () => 'draft', update: async () => {}, snapshot: () => ({}) });
        const identity = { avatar: 'a', chat: 'c' };
        await expect(deletion('alice', identity)).rejects.toThrow('lost');
        expect(await deletion.hasPending('alice', identity)).toBe(true);
        expect(recovery.isActive(identity)).toBe(false);
        await recovery.begin(identity);
        expect(recovery.isActive(identity)).toBe(true);
    });
    test('confirmed current deletion remains replayable until the recovery checkpoint is finalized', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map(), requests = [];
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, structuredClone(value)); }, keys: async () => [...data.keys()] };
        const deletion = createConditionalHistoryDelete({ storage, newId: () => 'op', readVersion: async () => 'fresh', send: async request => { requests.push(structuredClone(request)); return { ok: true, status: 200 }; } });
        const identity = { avatar: 'a', chat: 'c' };
        const operationId = await deletion('alice', identity, async remove => remove('loaded'), true);
        expect(await deletion.listPending('alice')).toEqual([identity]);
        await deletion('alice', identity, async () => { throw new Error('must not reload'); }, true);
        expect(requests[1]).toEqual(requests[0]);
        await deletion.confirm('alice', identity, operationId);
        expect(await deletion.listPending('alice')).toEqual([]);
    });
    test('current deletion obtains the queued loaded version once and replays it after an unknown outcome', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const map = new Map(), requests = [];
        const storage = { getItem: async key => map.get(key) ?? null, setItem: async (key, value) => { map.set(key, structuredClone(value)); }, keys: async () => [...map.keys()] };
        let locks = 0;
        const deletion = createConditionalHistoryDelete({ storage, newId: () => 'op-current', readVersion: async () => { throw new Error('fresh version forbidden'); }, send: async request => { requests.push(structuredClone(request)); if (requests.length === 1) throw new Error('lost'); return { ok: true, status: 200 }; } });
        const queued = async remove => { locks++; return remove('loaded-version'); };
        const identity = { avatar: 'a', chat: 'c' };
        await expect(deletion('alice', identity, queued)).rejects.toThrow('lost');
        await deletion('alice', identity, queued);
        expect(locks).toBe(1);
        expect(requests).toEqual([{ avatar_url: 'a', chatfile: 'c.jsonl', version: 'loaded-version', operationId: 'op-current' }, { avatar_url: 'a', chatfile: 'c.jsonl', version: 'loaded-version', operationId: 'op-current' }]);
    });
    test('unconfirmed history deletions remain discoverable only to their account until confirmed', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const map = new Map();
        const storage = { getItem: async key => map.get(key) ?? null, setItem: async (key, value) => { map.set(key, structuredClone(value)); }, keys: async () => [...map.keys()] };
        let fail = true;
        const deletion = createConditionalHistoryDelete({ storage, newId: () => 'op', readVersion: async () => 'v1', send: async () => { if (fail) throw new Error('lost'); return { ok: true, status: 200 }; } });
        await expect(deletion('alice', { avatar: 'a', chat: 'c' })).rejects.toThrow('lost');
        expect(await deletion.listPending('bob')).toEqual([]);
        expect(await deletion.listPending('alice')).toEqual([{ avatar: 'a', chat: 'c' }]);
        fail = false;
        await deletion('alice', { avatar: 'a', chat: 'c' });
        expect(await deletion.listPending('alice')).toEqual([]);
    });
    test('pending recovery refuses to checkpoint a session under a different account', async () => {
        const { createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let account = 'alice', updates = 0;
        const recovery = createPendingChatRecovery({
            account: () => account, create: async () => 'draft',
            update: async () => { updates++; }, snapshot: () => ({ messages: ['secret'] }),
        });
        await recovery.begin({ avatar: 'a', chat: 'c' });
        account = 'bob';
        await expect(recovery.beforeClear()).rejects.toThrow('account');
        expect(updates).toBe(0);
        account = 'alice';
        await recovery.beforeClear();
        expect(updates).toBe(1);
    });
    test('history deletion does not send when durable operation storage fails', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let sends = 0;
        const send = async () => { sends++; return { ok: true, status: 200 }; };
        const deletion = createConditionalHistoryDelete({
            storage: { getItem: async () => null, setItem: async () => { throw new Error('storage unavailable'); }, keys: async () => [] },
            newId: () => 'operation-1', readVersion: async () => 'v1', send,
        });
        await expect(deletion('alice', { avatar: 'a.png', chat: 'old' })).rejects.toThrow('storage unavailable');
        expect(sends).toBe(0);
    });
    test('retrying an ambiguous deletion retains the original draft and checkpoints late edits', async () => {
        const { createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let value = 'first', creates = 0;
        const updates = [];
        const recovery = createPendingChatRecovery({
            create: async () => { creates++; return 'one'; },
            update: async (_id, snapshot) => updates.push(snapshot),
            snapshot: () => ({ messages: [value] }),
        });
        const identity = { avatar: 'a', chat: 'b' };
        await recovery.begin(identity);
        value = 'late';
        expect((await recovery.begin(identity)).id).toBe('one');
        expect(creates).toBe(1);
        expect(updates.at(-1).messages).toEqual(['late']);
        await expect(recovery.begin({ avatar: 'a', chat: 'other' })).rejects.toThrow();
    });
    test('background checkpoint saves changed drafts and coalesces with a simultaneous clear', async () => {
        const { createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let value = 'initial', finish;
        const writes = [];
        const wait = new Promise(resolve => { finish = resolve; });
        const recovery = createPendingChatRecovery({
            create: async () => 'draft', snapshot: () => ({ value }),
            update: async (_id, snapshot) => { writes.push(snapshot.value); if (writes.length === 1) await wait; },
        });
        await recovery.begin({ avatar: 'a', chat: 'c' });
        value = 'first late';
        const watching = recovery.checkpointIfChanged();
        await Promise.resolve();
        value = 'last late';
        const clearing = recovery.beforeClear();
        finish();
        await Promise.all([watching, clearing]);
        expect(writes.at(-1)).toBe('last late');
        await recovery.checkpointIfChanged();
        expect(writes.at(-1)).toBe('last late');
    });

    test('history deletion retries an uncertain result using the exact stored version and operation ID', async () => {
        const { createConditionalHistoryDelete } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const records = new Map(), requests = [];
        let reads = 0;
        const deletion = createConditionalHistoryDelete({
            storage: { getItem: async key => records.get(key) ?? null, setItem: async (key, value) => { records.set(key, structuredClone(value)); }, keys: async () => [...records.keys()] },
            newId: () => 'operation-1', readVersion: async () => { reads++; return 'v1'; },
            send: async request => { requests.push(request); if (requests.length === 1) throw new Error('lost'); return { ok: true, status: 200 }; },
        });
        await expect(deletion('alice', { avatar: 'a.png', chat: 'old' })).rejects.toThrow('lost');
        await deletion('alice', { avatar: 'a.png', chat: 'old' });
        expect(reads).toBe(1);
        expect(requests).toEqual([{ avatar_url: 'a.png', chatfile: 'old.jsonl', version: 'v1', operationId: 'operation-1' }, { avatar_url: 'a.png', chatfile: 'old.jsonl', version: 'v1', operationId: 'operation-1' }]);
    });
    test('restore creates a new chat and retries a lost response with the same persisted operation and payload', async () => {
        const { createChatRecoveryDrafts, restoreChatRecoveryDraft } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map();
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, structuredClone(value)); }, keys: async () => [...data.keys()] };
        const drafts = createChatRecoveryDrafts({ storage, newId: () => 'unique-draft', now: () => 100 });
        const item = await drafts.create('alice', { avatar: 'a.png', chat: 'original' }, { messages: [{ mes: 'saved' }], metadata: { topic: 'x' } });
        const requests = [];
        const send = async body => { requests.push(structuredClone(body)); if (requests.length === 1) throw new Error('response lost'); return { ok: true }; };
        await expect(restoreChatRecoveryDraft(drafts, 'alice', item.id, send)).rejects.toThrow('response lost');
        await drafts.update('alice', item.id, { messages: [{ mes: 'later' }], metadata: {} });
        await restoreChatRecoveryDraft(drafts, 'alice', item.id, send);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        expect(requests[0]).toMatchObject({ avatar_url: 'a.png', create: true, operationId: 'unique-draft', chat: [{ chat_metadata: { topic: 'x' } }, { mes: 'saved' }] });
        expect(requests[0].file_name).not.toBe('original');
        expect((await drafts.list('alice'))[0].snapshot.messages[0].mes).toBe('later');
    });
    test('preserves independent account and session snapshots across service instances', async () => {
        const { createChatRecoveryDrafts } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map();
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, keys: async () => [...data.keys()] };
        let next = 0;
        const drafts = createChatRecoveryDrafts({ storage, newId: () => String(++next), now: () => 100 });
        const first = await drafts.create('alice', { avatar: 'a', chat: 'chat' }, { messages: ['before'] });
        await drafts.create('alice', { avatar: 'a', chat: 'other' }, { messages: ['other'] });
        await drafts.create('bob', { avatar: 'a', chat: 'chat' }, { messages: ['private'] });
        await drafts.update('alice', first.id, { messages: ['edited during deletion'] });
        const reloaded = createChatRecoveryDrafts({ storage, newId: () => 'unused', now: () => 101 });
        const alice = await reloaded.list('alice');
        expect(alice).toHaveLength(2);
        expect(alice.find(item => item.id === first.id).snapshot.messages).toEqual(['edited during deletion']);
        expect((await reloaded.list('bob'))[0].snapshot.messages).toEqual(['private']);
    });

    test('rejects failed persistence without destroying the last durable copy', async () => {
        const { createChatRecoveryDrafts } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map();
        let fail = false;
        const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { if (fail) throw new Error('quota'); data.set(key, value); }, keys: async () => [...data.keys()] };
        const drafts = createChatRecoveryDrafts({ storage, newId: () => 'one', now: () => 100 });
        const item = await drafts.create('alice', { avatar: 'a', chat: 'chat' }, { messages: ['safe'] });
        fail = true;
        await expect(drafts.update('alice', item.id, { messages: ['new'] })).rejects.toThrow('quota');
        expect((await drafts.list('alice'))[0].snapshot.messages).toEqual(['safe']);
    });

    test('serializes overlapping writes and captures each snapshot at invocation', async () => {
        const { createChatRecoveryDrafts } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const data = new Map();
        let release;
        let block = false;
        const storage = {
            getItem: async key => data.get(key) ?? null,
            setItem: async (key, value) => {
                if (block) { block = false; await new Promise(resolve => { release = resolve; }); }
                data.set(key, value);
            },
            keys: async () => [...data.keys()],
        };
        const drafts = createChatRecoveryDrafts({ storage, newId: () => 'one', now: () => 100 });
        await drafts.create('alice', { avatar: 'a', chat: 'chat' }, { messages: ['initial'] });
        block = true;
        const old = drafts.update('alice', 'one', { messages: ['first'] });
        while (!release) await Promise.resolve();
        const later = { messages: ['latest'] };
        const newer = drafts.update('alice', 'one', later);
        later.messages[0] = 'mutated after call';
        release();
        await Promise.all([old, newer]);
        expect((await drafts.list('alice'))[0].snapshot.messages).toEqual(['latest']);
    });

    test('protects a deletion before the request and captures later edits before clearing', async () => {
        const { createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        const stored = [];
        let value = 'before';
        const recovery = createPendingChatRecovery({
            create: async (identity, snapshot) => { stored.push([identity, snapshot]); return 'draft-1'; },
            update: async (id, snapshot) => { stored.push([id, snapshot]); },
            snapshot: () => ({ messages: [value] }),
        });
        const identity = { avatar: 'a', chat: 'original' };
        const pending = await recovery.begin(identity);
        value = 'edited while request was pending';
        await recovery.beforeClear();
        expect(stored).toEqual([[identity, { messages: ['before'] }], ['draft-1', { messages: ['edited while request was pending'] }]]);
        expect(pending.id).toBe('draft-1');
    });

    test('a storage failure blocks the protected operation and leaves it retryable', async () => {
        const { createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let fails = true;
        const recovery = createPendingChatRecovery({
            create: async () => { if (fails) throw new Error('quota'); return 'one'; },
            update: async () => {}, snapshot: () => ({ messages: ['unsaved'] }),
        });
        await expect(recovery.begin({ avatar: 'a', chat: 'b' })).rejects.toThrow('quota');
        fails = false;
        expect((await recovery.begin({ avatar: 'a', chat: 'b' })).id).toBe('one');
    });

    test('retries the snapshot if another edit arrives during an asynchronous write', async () => {
        const { createPendingChatRecovery } = await loadTsModule('app/lib/chat-recovery-drafts.ts');
        let value = 'one', release;
        const writes = [];
        const recovery = createPendingChatRecovery({
            create: async () => 'one', snapshot: () => ({ messages: [value] }),
            update: async (_id, snapshot) => {
                writes.push(snapshot);
                if (writes.length === 1) await new Promise(resolve => { release = resolve; });
            },
        });
        await recovery.begin({ avatar: 'a', chat: 'b' });
        const clear = recovery.beforeClear();
        while (!release) await Promise.resolve();
        value = 'late edit';
        release();
        await clear;
        expect(writes.at(-1).messages).toEqual(['late edit']);
    });
});
