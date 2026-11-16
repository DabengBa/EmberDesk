import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const extract = (start, end, context) => {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return runInNewContext(`(${source.slice(from, to).replace(/\/\*\*[\s\S]*?\*\/\s*$/, '')})`, context);
};

test('create mode resets each greeting identity to the minus-one sentinel', () => {
    const controls = [{ dataset: { chid: '3' } }, { dataset: { chid: '8' } }];
    const stop = new Error('reached world control');
    const chain = new Proxy({}, { get: () => () => chain });
    const context = {
        selected_button: '', create_save: {}, default_avatar: 'default.png',
        document: { querySelectorAll: () => controls, getElementById: () => { throw stop; } },
        $: selector => { if (selector === '.open_alternate_greetings') throw new Error('create greeting identity must not use jQuery'); return chain; },
        formatCreatorNotes: () => '', setCharacterSelectionVisibility: jest.fn(),
    };
    const create = extract('function select_rm_create(', 'function select_rm_characters(', context);
    expect(() => create({ switchMenu: false })).toThrow(stop);
    expect(controls.map(control => control.dataset.chid)).toEqual(['-1', '-1']);
});

test('greetings popup reads the current editor identity and preserves the missing-identity guard', async () => {
    const unshallowCharacter = jest.fn(async () => { throw new Error('loaded requested identity'); });
    const error = jest.fn();
    const control = { dataset: { chid: '0' } };
    const context = {
        document: { querySelector: () => control }, menu_type: 'edit', unshallowCharacter,
        toastr: { error }, $: () => { throw new Error('popup greeting identity must not use jQuery'); },
    };
    const open = extract('async function openAlternateGreetings()', 'function addAlternateGreeting(', context);
    await expect(open()).rejects.toThrow('loaded requested identity');
    expect(unshallowCharacter).toHaveBeenCalledWith('0');
    delete control.dataset.chid;
    await open();
    expect(error).toHaveBeenCalledWith('Does not have an Id for this character in editor menu.');
    expect(unshallowCharacter).toHaveBeenCalledTimes(1);
});
