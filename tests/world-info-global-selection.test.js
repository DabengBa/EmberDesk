import { expect, jest, test } from '@jest/globals';
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));
const { createWorldInfoWorkbenchSession, createWorldInfoWorkbenchCommands } = await import('../public/scripts/world-info-workbench-service.js');

test('selector snapshots are stable, replay notifies, and opening never changes activation', async () => {
    const load = jest.fn(async () => ({ entries: {} }));
    const session = createWorldInfoWorkbenchSession({ worldNames: [], loadWorldInfo: load });
    const changes = jest.fn();
    const unsubscribe = session.subscribeSelectors(changes);
    const initial = session.getSelectorSnapshot();
    expect(session.getSelectorSnapshot()).toBe(initial);
    session.setWorldNames(['Alpha', '1']);
    session.setSelectedWorldInfo(['Alpha']);
    expect(session.getSelectorSnapshot()).toEqual({ worldNames: ['Alpha', '1'], globalActiveNames: ['Alpha'], editorWorldName: '' });
    const replayed = session.getSelectorSnapshot();
    session.setWorldNames(['Alpha', '1']);
    session.setSelectedWorldInfo(['Alpha']);
    expect(session.getSelectorSnapshot()).toBe(replayed);
    expect(changes).toHaveBeenCalledTimes(2);
    await session.selectWorldIndex('1');
    expect(session.getSelectorSnapshot().editorWorldName).toBe('1');
    expect(session.getSelectorSnapshot().globalActiveNames).toEqual(['Alpha']);
    await session.selectWorldName('1');
    expect(load).toHaveBeenCalledTimes(1);
    session.setWorldNames(['Alpha']);
    expect(session.getSelectorSnapshot().editorWorldName).toBe('');
    expect(changes).toHaveBeenCalledTimes(4);
    unsubscribe();
    session.setSelectedWorldInfo([]);
    expect(changes).toHaveBeenCalledTimes(4);
});

test('global activation filters and deduplicates through the existing command, save and event once', async () => {
    let selected = [];
    const session = createWorldInfoWorkbenchSession({ worldNames: ['A', 'B'], loadWorldInfo: async () => ({ entries: {} }) });
    await session.selectWorldName('B');
    const save = jest.fn(), emitUpdated = jest.fn();
    const commands = createWorldInfoWorkbenchCommands({ getWorldNames: () => ['A', 'B'], getSelectedNames: () => selected, setSelectedNames: value => { selected = value; }, getSession: () => session, save, emitUpdated });
    expect(commands.setGlobalActiveNames(['A', 'A', 'missing'])).toEqual(['A']);
    expect(session.getSelectorSnapshot()).toMatchObject({ globalActiveNames: ['A'], editorWorldName: 'B' });
    expect(save).toHaveBeenCalledTimes(1);
    expect(emitUpdated).toHaveBeenCalledTimes(1);
});

test('late book loads do not overwrite a newer selector snapshot or revive a clear', async () => {
    let resolve;
    const gate = new Promise(r => { resolve = r; });
    const session = createWorldInfoWorkbenchSession({ worldNames: ['A', 'B'], loadWorldInfo: name => name === 'A' ? gate : Promise.resolve({ entries: {} }) });
    const pending = session.selectWorldName('A');
    await session.selectWorldName('B');
    const latest = session.getSelectorSnapshot();
    resolve({ entries: {} });
    await pending;
    expect(session.getSelectorSnapshot()).toBe(latest);
    await session.selectWorldName('');
    expect(session.getSelectorSnapshot().editorWorldName).toBe('');
});
