import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chats.js', import.meta.url), 'utf8');
const stylesSource = source.slice(source.indexOf('async function openGlobalStylesPreferenceDialog()'), source.indexOf('/**\n * Extracts the contents of all style elements'));

function setup({ stored = 'false', result = 1001 } = {}) {
    let value = stored;
    const navigate = jest.fn();
    const toggle = jest.fn();
    const radios = ['global_styles_allowed', 'global_styles_forbidden'].map(id => ({ id, checked: false, addEventListener(_type, fn) { this.change = fn; } }));
    const textarea = { value: '' };
    const templates = [];
    const document = {
        getElementById: id => id === 'creators_note_styles_button' ? { classList: { toggle } } : null,
        createElement: () => {
            const template = { querySelector: selector => selector === 'textarea' ? textarea : radios.find(radio => `#${radio.id}` === selector), querySelectorAll: () => radios };
            templates.push(template);
            return { innerHTML: '', firstElementChild: template };
        },
    };
    class StylesPreference {
        exists() { return value !== null; }
        get() { return value === 'true'; }
        set(next) { value = String(next); }
    }
    const popup = jest.fn(async () => result);
    const env = {
        document, StylesPreference, getCurrentEntityId: () => 'avatar', DOMPurify: { sanitize: html => html },
        renderTemplateAsync: async name => `<div>${name}</div>`, callGenericPopup: popup,
        POPUP_TYPE: { TEXT: 1 }, POPUP_RESULT: { AFFIRMATIVE: 1, CUSTOM1: 1001, CANCELLED: null },
        t: strings => strings[0], this_chid: 0, runCharacterNavigation: navigate,
        characters: [{ avatar: 'avatar', data: { creator_notes: '<style>.x{}</style>' } }],
        getStyleContentsFromMarkdown: () => '.x{}',
        $: () => { throw Error('creator styles must not depend on jQuery'); },
    };
    const api = new Function(...Object.keys(env), `${stylesSource}; return { openGlobalStylesPreferenceDialog, checkForCreatorNotesStyles };`)(...Object.values(env));
    return { ...api, radios, textarea, templates, popup, navigate, toggle, getValue: () => value };
}

test('preference dialog selects current radio and applies a changed preference without jQuery', async () => {
    const h = setup();
    h.popup.mockImplementationOnce(async content => {
        expect(content).toBe(h.templates[0]);
        expect(h.radios[1].checked).toBe(true);
        h.radios[0].change.call(h.radios[0]);
    });
    await h.openGlobalStylesPreferenceDialog();
    expect(h.getValue()).toBe('true');
    expect(h.navigate.mock.calls).toEqual([['current'], ['current']]);
    expect(h.toggle).toHaveBeenCalledWith('allowed', true);
});

test.each([[1001, 'true'], [1, 'false'], [null, 'false']])('initial creator CSS decision %s saves preference and updates preview', async (result, expected) => {
    const h = setup({ stored: null, result });
    await h.checkForCreatorNotesStyles();
    expect(h.popup).toHaveBeenCalledWith(h.templates[0], 1, '', expect.objectContaining({ okButton: false, cancelButton: false }));
    expect(h.textarea.value).toBe('.x{}');
    expect(h.getValue()).toBe(expected);
    expect(h.navigate).toHaveBeenCalledWith('current');
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.toggle).toHaveBeenCalledWith('allowed', expected === 'true');
});

test('existing creator CSS preference skips the prompt', async () => {
    const h = setup({ stored: 'true' });
    await h.checkForCreatorNotesStyles();
    expect(h.popup).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.toggle).toHaveBeenCalledWith('allowed', true);
});
