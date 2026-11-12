import { describe, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

describe('world info confirmed persistence', () => {
    test('same-book field and bulk mutations read the preceding confirmed write', async () => {
        const { createWorldInfoRepository } = await import('../public/scripts/world-info-repository.js');
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        let stored = { entries: { 1: { uid: 1, comment: 'old', disable: false, key: [] } } };
        const gate = deferred();
        let writes = 0;
        const repository = createWorldInfoRepository({
            cache: new Map(), headers: () => ({}), emitUpdated: () => {},
            fetch: async (url, options) => {
                if (url.endsWith('/get')) return { ok: true, json: async () => structuredClone(stored) };
                if (++writes === 1) await gate.promise;
                stored = JSON.parse(options.body).data;
                return { ok: true };
            },
        });
        const session = createWorldInfoWorkbenchSession({ worldNames: ['A'], loadWorldInfo: repository.load, saveWorldInfo: repository.save, runWorldInfoMutation: repository.mutate });
        await session.selectWorldName('A');
        const first = session.updateEntryFields('1', { comment: 'edited' });
        const second = session.setEntriesEnabled(['1'], false);
        gate.resolve();
        await Promise.all([first, second]);
        expect(stored.entries[1]).toMatchObject({ comment: 'edited', disable: true });
    });

    test('different books do not cancel each other and failed writes do not publish or block retry', async () => {
        const { createWorldInfoRepository } = await import('../public/scripts/world-info-repository.js');
        const gate = deferred();
        const events = [];
        const cache = new Map();
        const requests = [];
        let failed = false;
        const repository = createWorldInfoRepository({ cache, headers: () => ({}), emitUpdated: (...args) => events.push(args), fetch: async (_url, options) => {
            const { name, data } = JSON.parse(options.body);
            requests.push(name);
            if (name === 'A' && !failed) { failed = true; await gate.promise; return { ok: false, status: 500 }; }
            return { ok: true, data };
        } });
        const first = repository.save('A', { value: 1 });
        const second = repository.save('B', { value: 2 });
        await second;
        expect(requests).toEqual(['A', 'B']);
        gate.resolve();
        await expect(first).rejects.toThrow('HTTP 500');
        expect(cache.has('A')).toBe(false);
        expect(events.map(event => event[0])).toEqual(['B']);
        await repository.save('A', { value: 3 });
        expect(cache.get('A')).toEqual({ value: 3 });
        expect(events.map(event => event[0])).toEqual(['B', 'A']);
    });

    test('a failed field save rejects and a later retry writes the still-pending fields', async () => {
        const { createWorldInfoRepository } = await import('../public/scripts/world-info-repository.js');
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        let stored = { entries: { 1: { uid: 1, comment: 'old', key: [] } } };
        let fail = true;
        const events = [];
        const repository = createWorldInfoRepository({ cache: new Map(), headers: () => ({}), emitUpdated: (...args) => events.push(args), fetch: async (url, options) => {
            if (url.endsWith('/get')) return { ok: true, json: async () => structuredClone(stored) };
            if (fail) { fail = false; return { ok: false, status: 500 }; }
            stored = JSON.parse(options.body).data;
            return { ok: true };
        } });
        const session = createWorldInfoWorkbenchSession({ worldNames: ['A'], loadWorldInfo: repository.load, saveWorldInfo: repository.save, runWorldInfoMutation: repository.mutate });
        await session.selectWorldName('A');
        const pending = { comment: 'retry value' };
        await expect(session.updateEntryFields('1', pending)).rejects.toThrow('HTTP 500');
        expect(stored.entries[1].comment).toBe('old');
        expect(events).toHaveLength(0);
        await session.updateEntryFields('1', pending);
        expect(stored.entries[1].comment).toBe('retry value');
        expect(events).toHaveLength(1);
    });

    test('queued commands snapshot mutable field input and UID lists', async () => {
        const { createWorldInfoRepository } = await import('../public/scripts/world-info-repository.js');
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        let stored = { entries: { 1: { uid: 1, key: ['old'], disable: false }, 2: { uid: 2, key: [], disable: false } } };
        const gate = deferred();
        const repo = createWorldInfoRepository({ cache: new Map(), headers: () => ({}), emitUpdated: () => {}, fetch: async (url, options) => {
            if (url.endsWith('/get')) return { ok: true, json: async () => structuredClone(stored) };
            stored = JSON.parse(options.body).data;
            return { ok: true };
        } });
        const session = createWorldInfoWorkbenchSession({ worldNames: ['A'], loadWorldInfo: repo.load, saveWorldInfo: repo.save, runWorldInfoMutation: repo.mutate });
        await session.selectWorldName('A');
        const blocked = repo.mutate('A', async () => gate.promise);
        const fields = { key: ['captured'] };
        const uids = ['1'];
        const edit = session.updateEntryFields('1', fields);
        const bulk = session.setEntriesEnabled(uids, false);
        fields.key.push('later');
        uids.push('2');
        gate.resolve();
        await Promise.all([blocked, edit, bulk]);
        expect(stored.entries[1]).toMatchObject({ key: ['captured'], disable: true });
        expect(stored.entries[2].disable).toBe(false);
    });
});
