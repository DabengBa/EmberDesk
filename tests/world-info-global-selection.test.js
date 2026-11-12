import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, jest, test } from '@jest/globals';

test('global activation synchronizes the sole workbench session and emits the existing event', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const source = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    const start = source.indexOf('export function setWorldInfoGlobalActiveNames(names)');
    const end = source.indexOf('\n/**', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const sync = jest.fn();
    const emit = jest.fn();
    let selected = [];
    const operation = new Function('world_names', 'onSet', 'getSelected', 'getWorldInfoWorkbenchSession', 'saveSettingsDebounced', 'eventSource', 'event_types',
        `let selected_world_info; function setSelectedWorldInfo(value) { selected_world_info = value; onSet(value); } ${source.slice(start, end).replace('export function', 'function')}; return names => { selected_world_info = getSelected(); return setWorldInfoGlobalActiveNames(names); };`)(
        ['A', 'B'], value => { selected = value; }, () => selected,
        () => ({ setSelectedWorldInfo: sync }), jest.fn(), { emit }, { WORLDINFO_SETTINGS_UPDATED: 'updated' },
    );
    expect(operation(['A', 'A', 'missing'])).toEqual(['A']);
    expect(sync).toHaveBeenCalledWith(['A']);
    expect(emit).toHaveBeenCalledWith('updated');
});
