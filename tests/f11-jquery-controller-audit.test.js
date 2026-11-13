import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('F11 React-owned panel compatibility bridges', () => {
    test('uses native DOM visibility writes for the character shell compatibility nodes', () => {
        const source = read('public/script.js');

        expect(source).toContain('setLegacyCharacterShellVisibility');
        expect(source).not.toContain("$('#result_info').toggle(");
        expect(source).not.toContain("$('#rm_button_selected_ch h2').toggle(");
        expect(source).not.toContain('$(menu).css(');
        expect(source).not.toContain('$(menu).transition(');
    });

    test('uses native input events for the React character search bridge', () => {
        const source = read('public/script.js');

        expect(source).toContain('input.dispatchEvent(new Event(\'input\', { bubbles: true }))');
        expect(source).not.toContain("$('#character_search_bar').val(normalizedQuery).trigger('input')");
        expect(read('public/scripts/dom-handlers.js')).not.toContain("$('#character_search_bar').val('').trigger('input')");
    });
});
