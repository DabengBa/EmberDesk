import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/world-info-state.js', () => ({ world_names: ['Book'] }));
const { createWorldInfoReferenceUi } = await import('../public/scripts/world-info-reference-ui.js');

test('character world button classes use the live world and explicit override', () => {
    const previousDocument = globalThis.document;
    const toggles = [jest.fn(), jest.fn()];
    globalThis.document = { querySelectorAll: () => toggles.map(toggle => ({ classList: { toggle } })) };
    try {
        const ui = createWorldInfoReferenceUi({ characters: [{ data: { extensions: { world: 'Book' } } }, { data: {} }] });

        ui.setWorldInfoButtonClass(undefined);
        ui.setWorldInfoButtonClass(0);
        ui.setWorldInfoButtonClass(1);
        ui.setWorldInfoButtonClass(undefined, true);
        for (const toggle of toggles) expect(toggle.mock.calls).toEqual([['world_set', true], ['world_set', false], ['world_set', true]]);
    } finally { globalThis.document = previousDocument; }
});

test('checking an unselected character hides the embedded import control without jQuery', () => {
    const previousDocument = globalThis.document;
    const control = { style: {} };
    globalThis.document = { querySelector: () => control };
    try {
        const ui = createWorldInfoReferenceUi({ characters: [] });
        expect(ui.checkEmbeddedWorld(undefined)).toBe(false);
        expect(control.style.display).toBe('none');
        globalThis.document = { querySelector: () => null };
        expect(ui.checkEmbeddedWorld(undefined)).toBe(false);
    } finally { globalThis.document = previousDocument; }
});
