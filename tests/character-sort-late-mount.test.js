import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from '@jest/globals';
import { runInNewContext } from 'node:vm';

test('sort change reaches the handler when the right panel mounts after ready', () => {
    const source = readFileSync(new URL('../public/scripts/power-user.js', import.meta.url), 'utf8');
    const binding = source.slice(source.indexOf('    // Settings that go into the settings document'), source.indexOf('    SlashCommandParser.addCommandObject', source.indexOf('    // Settings that go into the settings document')));
    const document = {};
    const handlers = [];
    let selector;
    const power_user = { sort_field: 'name', sort_order: 'asc', sort_rule: 'string' };
    let prints = 0;
    let saves = 0;
    let changes = 0;
    function $(target) {
        if (target === document || target === '#character_sort_order') {
            return { on(event, selectorOrHandler, delegatedHandler) {
                const delegated = typeof selectorOrHandler === 'string';
                if (target === document || selector) handlers.push({ target, event, delegated, selector: selectorOrHandler, callback: delegatedHandler ?? selectorOrHandler });
            } };
        }
        return { find() { return { data(key) { return target.selected[key]; } }; } };
    }
    runInNewContext(binding, { $, document, power_user, markCharacterSortChanged: () => changes++, printCharactersDebounced: () => prints++, saveSettingsDebounced: () => saves++ });
    // React creates the select after the ready callback has registered handlers.
    selector = { selected: { field: 'name', order: 'desc', rule: 'string' } };
    function change() {
        for (const handler of handlers) {
            if (handler.event === 'change' && (handler.target === selector || (handler.delegated && handler.target === document && handler.selector === '#character_sort_order'))) handler.callback.call(selector);
        }
    }
    change();
    assert.deepEqual(power_user, { sort_field: 'name', sort_order: 'desc', sort_rule: 'string' });
    assert.equal(prints, 1);
    assert.equal(saves, 1);
    assert.equal(changes, 1);
    selector.selected = { field: 'search' };
    change();
    assert.equal(power_user.sort_order, 'desc', 'temporary search sorting must not replace saved sort');
    assert.equal(prints, 2);
    assert.equal(saves, 2);
    assert.equal(changes, 1);
});
