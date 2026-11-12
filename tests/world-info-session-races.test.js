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
