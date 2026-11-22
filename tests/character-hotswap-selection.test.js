import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('hotswap selection reads native identity and ignores disabled or non-primary clicks', async () => {
    const source = readFileSync(new URL('../public/scripts/RossAscends-mods.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function favsToHotswap()');
    const end = source.indexOf('\n//changes input bar', start);
    const listeners = [];
    const nodes = ['7', null].map(id => ({ getAttribute: () => id, addEventListener: (_type, handler) => listeners.push(handler) }));
    const container = { querySelectorAll: () => nodes };
    const selectCharacterById = jest.fn(), setActiveCharacter = jest.fn(), saveSettingsDebounced = jest.fn();
    const context = { document: { querySelectorAll: () => [container] },
        getEntitiesList: () => [{ type: 'character', item: { fav: true } }],
        buildAvatarList: jest.fn(), selectCharacterById, setActiveCharacter, saveSettingsDebounced,
        $: () => { throw new Error('hotswap selection must not use jQuery'); } };
    const refresh = runInNewContext(`(${source.slice(start, end).replace('export ', '')})`, context);
    await refresh();
    listeners[0]({ button: 0 });
    listeners[1]({ button: 0 });
    listeners[0]({ button: 2 });
    nodes[0].disabled = true;
    listeners[0]({ button: 0 });
    expect(selectCharacterById).toHaveBeenCalledTimes(2);
    expect(selectCharacterById.mock.calls[0][0]).toBe(7);
    expect(Number.isNaN(selectCharacterById.mock.calls[1][0])).toBe(true);
    expect(setActiveCharacter).toHaveBeenCalledTimes(2);
    expect(saveSettingsDebounced).toHaveBeenCalledTimes(2);
});
