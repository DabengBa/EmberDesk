import { describe, expect, jest, test } from '@jest/globals';

// Isolate the browser-dependent translation module; these tests exercise
// session identity, not translation or the domain module's import safety.
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

async function fixture() {
    const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
    const books = {
        Alpha: { entries: { 1: { uid: 1, comment: 'Alpha', key: [], content: '' } } },
        Beta: { entries: { 1: { uid: 1, comment: 'Beta', key: [], content: '' } } },
    };
    let delay = null;
    const saves = [];
    const session = createWorldInfoWorkbenchSession({
        worldNames: Object.keys(books),
        loadWorldInfo: async name => {
            const data = structuredClone(books[name]);
            if (delay) {
                const wait = delay;
                delay = null;
                await wait.promise;
            }
            return data;
        },
        saveWorldInfo: async (name, data) => { saves.push({ name, data }); },
    });
    return { session, saves, delayNext: () => (delay = deferred()) };
}

describe('workbench async identity', () => {
    test.each(['selectWorldName', 'selectWorldIndex'])('slow %s keeps the old book until it can switch without losing a draft', async method => {
        const { session, saves, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        let dirty = false;
        session.setSelectionBlocked(() => dirty);
        const gate = delayNext();
        const pending = session[method](method === 'selectWorldIndex' ? '1' : 'Beta');
        dirty = true;
        expect(session.getSelectedWorldName()).toBe('Alpha');
        expect(await session.updateEntryFields('1', { content: 'draft' }, 'Alpha')).toBe(true);
        gate.resolve();
        expect(await pending).toBe(false);
        expect(session.getSelectedWorldName()).toBe('Alpha');
        expect(session.getSelectedEntryUid()).toBe('1');
        expect(saves[0].data.entries['1'].content).toBe('draft');
        dirty = false;
        await session.selectWorldName('Beta');
        expect(session.getSelectedWorldName()).toBe('Beta');
    });

    test('a later selection cancels a slow switch, and a failed load leaves the current book intact', async () => {
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        const gate = deferred();
        const session = createWorldInfoWorkbenchSession({
            worldNames: ['Alpha', 'Beta', 'Missing'],
            loadWorldInfo: async name => {
                if (name === 'Beta') await gate.promise;
                return name === 'Missing' ? null : { entries: {} };
            },
        });
        await session.selectWorldName('Alpha');
        const pending = session.selectWorldName('Beta');
        expect(await session.selectWorldName('Alpha')).toBe(true);
        gate.resolve();
        expect(await pending).toBe(false);
        expect(await session.selectWorldName('Missing')).toBe(false);
        expect(session.getSelectedWorldName()).toBe('Alpha');
    });

    test('snapshot retains a filtered selection but clears an entry removed from the underlying book', async () => {
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        const data = { entries: { 1: { uid: 1, comment: 'Alpha', key: [], content: '' } } };
        const session = createWorldInfoWorkbenchSession({ worldNames: ['Alpha'], loadWorldInfo: async () => structuredClone(data) });
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        session.applySearchQuery('not a match');
        const filtered = await session.getFacadeSnapshot();
        expect(filtered.entrySummaries).toHaveLength(0);
        expect(filtered.selectedEntryUid).toBe('1');
        expect(filtered.selectedEntry?.comment).toBe('Alpha');
        delete data.entries[1];
        const removed = await session.getFacadeSnapshot();
        expect(removed.selectedEntryUid).toBe('');
        expect(removed.selectedEntry).toBeNull();
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test('a failed book read is not evidence that the selected entry was deleted', async () => {
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        let failed = false;
        const session = createWorldInfoWorkbenchSession({ worldNames: ['Alpha'], loadWorldInfo: async () => failed ? null : { entries: { 1: { uid: 1, key: [] } } } });
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        failed = true;
        expect((await session.getFacadeSnapshot()).selectedEntryUid).toBe('1');
        expect(session.getSelectedEntryUid()).toBe('1');
    });

    test('an entry missing from a successful read remains selected while its draft is dirty', async () => {
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        const data = { entries: { 1: { uid: 1, key: [] } } };
        const session = createWorldInfoWorkbenchSession({ worldNames: ['Alpha'], loadWorldInfo: async () => structuredClone(data) });
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        let dirty = true;
        session.setSelectionBlocked(() => dirty);
        delete data.entries[1];
        const blocked = await session.getFacadeSnapshot();
        expect(blocked.selectedEntryUid).toBe('1');
        expect(blocked.selectedEntry).toBeNull();
        dirty = false;
        expect((await session.getFacadeSnapshot()).selectedEntryUid).toBe('');
    });

    test('destructive operation locks editing until failure and refuses dirty or concurrent operations', async () => {
        const { session } = await fixture();
        await session.selectWorldName('Alpha');
        const states = [];
        session.setOperationListener(busy => states.push(busy));
        session.setSelectionBlocked(() => true);
        expect(await session.runDestructiveOperation(['Alpha'], async () => true)).toBe(false);
        session.setSelectionBlocked(null);
        const gate = deferred();
        const pending = session.runDestructiveOperation(['Alpha'], async () => { await gate.promise; throw new Error('write failed'); });
        expect(states.at(-1)).toBe(true);
        expect(await session.runDestructiveOperation(['Beta'], async () => true)).toBe(false);
        gate.resolve();
        await expect(pending).rejects.toThrow('write failed');
        expect(states.at(-1)).toBe(false);
        expect(await session.runDestructiveOperation(['Alpha'], async () => true)).toBe(true);
    });
    test('a list refresh missing the selected book cannot discard a guarded draft', async () => {
        const { session } = await fixture();
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        session.setSelectionBlocked(() => true);
        session.setWorldNames(['Beta']);
        expect(session.getSelectedWorldName()).toBe('Alpha');
        expect(session.getSelectedEntryUid()).toBe('1');
        expect((await session.getFacadeSnapshot()).selectedEntry?.comment).toBe('Alpha');
    });

    test('same indexed book and rejected missing entry leave selection intact', async () => {
        const { session } = await fixture();
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        session.setSelectionBlocked(() => true);
        expect(await session.selectWorldIndex('0')).not.toBe(false);
        session.setSelectionBlocked(null);
        expect(await session.selectEntry('missing')).toBe(false);
        expect(session.getSelectedEntryUid()).toBe('1');
    });

    test('queued deletion cannot delete a selected entry that became dirty while loading', async () => {
        const { session, saves, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        const gate = delayNext();
        const pending = session.deleteEntries(['1']);
        session.setSelectionBlocked(() => true);
        gate.resolve();
        expect(await pending).toBe(0);
        expect(saves).toHaveLength(0);
        expect(session.getSelectedEntryUid()).toBe('1');
    });
    test('mounts complete in request order even when a snapshot is delayed', async () => {
        const { createWorldInfoMountScheduler } = await import('../public/scripts/world-info-workbench-service.js');
        const gate = deferred();
        const mounted = [];
        const schedule = createWorldInfoMountScheduler(async value => {
            if (value === 'old') await gate.promise;
            mounted.push(value);
        });
        const old = schedule('old');
        const next = schedule('new');
        gate.resolve();
        await Promise.all([old, next]);
        expect(mounted).toEqual(['old', 'new']);
    });

    test('late entry selection cannot select same UID in a different book', async () => {
        const { session, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        const gate = delayNext();
        const pending = session.selectEntry('1');
        await session.selectWorldName('Beta');
        gate.resolve();
        await pending;
        expect(session.getSelectedWorldName()).toBe('Beta');
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test('late field edit never saves Alpha data into Beta', async () => {
        const { session, saves, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        const gate = delayNext();
        const pending = session.updateEntryFields('1', { comment: 'edited' });
        await session.selectWorldName('Beta');
        gate.resolve();
        await pending;
        expect(saves.every(save => save.name === 'Alpha')).toBe(true);
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test('late entry selection cannot revive a cleared book', async () => {
        const { session, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        const gate = delayNext();
        const pending = session.selectEntry('1');
        await session.selectWorldIndex('');
        gate.resolve();
        await pending;
        expect(session.getSelectedWorldName()).toBe('');
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test('selection guard rejects a return to the same book after another selection', async () => {
        const { session } = await fixture();
        await session.selectWorldName('Alpha');
        const isCurrent = session.captureSelectionGuard();
        await session.selectWorldName('Beta');
        await session.selectWorldName('Alpha');
        expect(isCurrent()).toBe(false);
    });

    test('snapshot stays on the captured book despite a later selection', async () => {
        const { session, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        await session.selectEntry('1');
        const gate = delayNext();
        const pending = session.getFacadeSnapshot();
        await session.selectWorldName('Beta');
        gate.resolve();
        const snapshot = await pending;
        expect(snapshot.entrySummaries.every(entry => entry.title === snapshot.editorWorldName)).toBe(true);
        expect(snapshot.selectedEntry?.comment ?? snapshot.editorWorldName).toBe(snapshot.editorWorldName);
        expect(session.getSelectedWorldName()).toBe('Beta');
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test('explicit old book identity is not interpreted as the current book', async () => {
        const { session, saves } = await fixture();
        await session.selectWorldName('Beta');
        await session.updateEntryFields('1', { comment: 'edited' }, 'Alpha');
        expect(saves.every(save => save.name === 'Alpha')).toBe(true);
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test('late save completion does not change selection in another book', async () => {
        const gate = deferred();
        const started = deferred();
        const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
        const session = createWorldInfoWorkbenchSession({
            worldNames: ['Alpha', 'Beta'],
            loadWorldInfo: async () => ({ entries: { 1: { uid: 1, comment: 'entry' } } }),
            saveWorldInfo: async () => { started.resolve(); return gate.promise; },
        });
        await session.selectWorldName('Alpha');
        const pending = session.updateEntryFields('1', { comment: 'edited' });
        await started.promise;
        await session.selectWorldName('Beta');
        gate.resolve();
        await pending;
        expect(session.getSelectedWorldName()).toBe('Beta');
        expect(session.getSelectedEntryUid()).toBe('');
    });

    test.each([
        ['sorting', session => session.applySortingAsOrder(10)],
        ['delete', session => session.deleteEntries(['1'])],
        ['enable', session => session.setEntriesEnabled(['1'], false)],
    ])('late %s never writes a different selected book', async (_label, action) => {
        const { session, saves, delayNext } = await fixture();
        await session.selectWorldName('Alpha');
        const gate = delayNext();
        const pending = action(session);
        await session.selectWorldName('Beta');
        gate.resolve();
        await pending;
        expect(saves).toHaveLength(1);
        expect(saves[0].name).toBe('Alpha');
    });
});
