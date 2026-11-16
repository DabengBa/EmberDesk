import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('actual create handlers run selection and remount before clearing the selected tab', () => {
    const handlers = readFileSync(new URL('../public/scripts/dom-handlers.js', import.meta.url), 'utf8');
    const ross = readFileSync(new URL('../public/scripts/RossAscends-mods.js', import.meta.url), 'utf8');
    const button = new EventTarget(), calls = [];
    const heading = { set textContent(value) { calls.push(`heading:${value}`); }, set innerHTML(value) { calls.push(`heading:${value}`); } };
    const tab = { querySelectorAll: selector => { expect(selector).toBe(':scope > h2'); return [heading]; } };
    const state = {};
    const context = { document: { getElementById: id => id === 'rm_button_create' ? button : null }, SelectedCharacterTab: tab,
        state, select_rm_create: () => calls.push(`select:${state.selected_button}`), queueReactCharacterAuthoringRemount: () => calls.push('remount'),
        $: () => { throw new Error('Ross create handler must not bind with jQuery'); } };
    const handlerStart = handlers.indexOf("document.getElementById('rm_button_create')"), handlerEnd = handlers.indexOf('\n    });', handlerStart) + '\n    });'.length;
    const marker = '//when "+New Character" is clicked', rossStart = ross.indexOf(marker), rossEnd = ross.indexOf('//when any input', rossStart);
    expect(handlerStart).toBeGreaterThan(-1); expect(rossStart).toBeGreaterThan(-1);
    runInNewContext(handlers.slice(handlerStart, handlerEnd), context);
    runInNewContext(ross.slice(rossStart, rossEnd), context);
    button.dispatchEvent(new Event('click'));
    expect(calls).toEqual(['select:create', 'remount', 'heading:']);
});
