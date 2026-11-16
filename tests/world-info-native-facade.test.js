import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/scripts/world-info.js', import.meta.url), 'utf8');

test('runtime updates every chat lorebook button without jQuery', () => {
    const start = source.indexOf('const ensureWorldInfoRuntimeInitialized =');
    const end = source.indexOf('\nexport function rehydrateWorldInfoPanel', start);
    const toggles = [jest.fn(), jest.fn()];
    const context = {
        createWorldInfoRuntimeInitializer: options => options,
        document: { querySelectorAll: () => toggles.map(toggle => ({ classList: { toggle } })) },
        eventSource: {}, event_types: {}, getSortedEntries: () => {},
    };
    const options = runInNewContext(`(() => { ${source.slice(start, end)}; return ensureWorldInfoRuntimeInitialized; })()`, context);
    options.setChatWorldActive(true);
    options.setChatWorldActive(false);
    for (const toggle of toggles) expect(toggle.mock.calls).toEqual([['world_set', true], ['world_set', false]]);
});

test('opening a selected world only opens the drawer when needed', async () => {
    const start = source.indexOf('export async function openWorldInfoEditor(');
    const end = source.indexOf('\nexport const initWorldInfo', start);
    const open = jest.fn(async () => {});
    let isOpen = false;
    const context = {
        world_names: ['A'], selectWorldInfoEditorName: jest.fn(async () => true),
        document: { querySelector: () => ({ classList: { contains: () => isOpen } }) },
        getWorldInfoShell: () => ({ openWorldInfoPanel: open }), console,
    };
    const fn = runInNewContext(`(${source.slice(start, end).replace('export ', '')})`, context);
    expect(await fn('A')).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    isOpen = true;
    expect(await fn('A')).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(await fn('missing')).toBe(false);
});
