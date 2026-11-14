import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));
const state = await import('../public/scripts/world-info-state.js');
const { createWorldInfoWorkbenchSession } = await import('../public/scripts/world-info-workbench-service.js');
const { createWorldInfoBookSync } = await import('../public/scripts/world-info-book-sync.js');
beforeEach(() => { state.setWorldNames(['A', 'B']); state.setSelectedWorldInfo(['A']); });
const originalFetch = globalThis.fetch;
const originalDollar = globalThis.$;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.$ = originalDollar; });
async function fixture() {
    const session = createWorldInfoWorkbenchSession({ worldNames: ['A', 'B'], selectedWorldInfo: ['A'], loadWorldInfo: async () => ({ entries: {} }) });
    await session.selectWorldName('B');
    const hide = jest.fn(async () => session.selectWorldName(''));
    const sync = createWorldInfoBookSync({ getRequestHeaders: () => ({}), getSelectedWorldInfoEditorName: () => session.getSelectedWorldName(), getWorldInfoWorkbenchSession: () => session, hideWorldEditor: hide });
    return { session, hide, ...sync };
}
test('successful list refresh updates session without DOM, removes deleted activation and clears invalid editor', async () => {
    const f = await fixture();
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ world_names: ['C'] }) }));
    await f.updateWorldInfoList();
    expect(state.world_names).toEqual(['C']);
    expect(state.selected_world_info).toEqual([]);
    expect(f.session.getSelectorSnapshot()).toEqual({ worldNames: ['C'], globalActiveNames: [], editorWorldName: '' });
});
test.each(['http', 'reject'])('failed %s refresh preserves the same snapshot and all live lists', async kind => {
    const f = await fixture(), before = f.session.getSelectorSnapshot();
    globalThis.fetch = jest.fn(async () => { if (kind === 'reject') throw new Error('offline'); return { ok: false }; });
    if (kind === 'reject') await expect(f.updateWorldInfoList()).rejects.toThrow('offline');
    else expect(await f.updateWorldInfoList()).toBe(false);
    expect(f.session.getSelectorSnapshot()).toBe(before);
    expect(state.world_names).toEqual(['A', 'B']);
    expect(state.selected_world_info).toEqual(['A']);
    expect(f.hide).not.toHaveBeenCalled();
});

test.each(['http', 'reject'])('confirmed deletion still cleans up references when list refresh fails: %s', async kind => {
    const session = createWorldInfoWorkbenchSession({ worldNames: ['A', 'B'], selectedWorldInfo: ['A'], loadWorldInfo: async () => ({ entries: {} }) });
    await session.selectWorldName('A');
    state.worldInfoCache.set('A', { entries: {} });
    let characterWorld = 'A';
    const change = jest.fn();
    globalThis.$ = selector => {
        expect(selector).toBe('#character_world');
        return { val: (...args) => {
            if (!args.length) return characterWorld;
            characterWorld = args[0];
            return { trigger: change };
        } };
    };
    const saveCharacter = jest.fn(), saveSettings = jest.fn();
    const sync = createWorldInfoBookSync({
        getRequestHeaders: () => ({}), getSelectedWorldInfoEditorName: () => session.getSelectedWorldName(),
        getWorldInfoWorkbenchSession: () => session,
        hideWorldEditor: async () => session.selectWorldName(''),
        setWorldInfoButtonClass: jest.fn(), getCurrentShellMenuType: () => 'edit',
        saveCharacterDebounced: saveCharacter, saveSettingsDebounced: saveSettings,
    });
    globalThis.fetch = jest.fn(async () => { if (kind === 'reject') throw new Error('offline'); return { ok: false }; });
    await expect(sync.flushDeletedWorldsFromUI(['A'])).resolves.toBeUndefined();
    expect(session.getSelectorSnapshot()).toEqual({ worldNames: ['B'], globalActiveNames: [], editorWorldName: '' });
    expect(state.world_names).toEqual(['B']);
    expect(state.worldInfoCache.has('A')).toBe(false);
    expect(characterWorld).toBe('');
    expect(change).toHaveBeenCalledWith('change');
    expect(saveCharacter).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledTimes(1);
});
