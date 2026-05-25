import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractFunctionSource(source, functionName) {
    const functionStart = source.indexOf(`function ${functionName}`);
    expect(functionStart).toBeGreaterThanOrEqual(0);

    const bodyStart = source.indexOf('{', functionStart);
    expect(bodyStart).toBeGreaterThanOrEqual(0);

    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        if (depth === 0) {
            return source.slice(functionStart, i + 1);
        }
    }

    throw new Error(`Could not extract function source for ${functionName}`);
}

function expectElementWithId(source, id) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(source).toMatch(new RegExp(`<[a-z][^>]*\\bid="${escapedId}"[^>]*>`, 'i'));
}

describe('character list structure', () => {
    test('keeps the character library panel skeleton stable', () => {
        const indexHtml = read('public/index.html');

        [
            'id="rm_characters_block"',
            'id="charListFixedTop"',
            'id="rm_button_bar"',
            'id="rm_button_create"',
            'id="character_import_button"',
            'id="external_import_button"',
            'id="rm_button_group_chats"',
            'id="rm_buttons_container"',
            'id="character_sort_order"',
            'id="rm_button_search"',
            'id="charListGridToggle"',
            'id="bulkEditButton"',
            'id="bulkSelectedCount"',
            'id="bulkSelectAllButton"',
            'id="bulkDeleteButton"',
            'id="form_character_search_form"',
            'id="character_search_bar"',
            'class="tags rm_tag_filter"',
            'class="tags rm_tag_bogus_drilldown"',
            'id="rm_print_characters_pagination"',
            'id="rm_print_characters_block"',
        ].forEach(marker => expect(indexHtml).toContain(marker));

        [
            'rm_characters_block',
            'charListFixedTop',
            'rm_button_bar',
            'rm_buttons_container',
            'character_sort_order',
            'form_character_search_form',
            'character_search_bar',
            'rm_print_characters_pagination',
            'rm_print_characters_block',
        ].forEach(id => expectElementWithId(indexHtml, id));
    });

    test('keeps generated character row selectors and active-state hooks stable', () => {
        const scriptSource = read('public/script.js');
        const rowSource = extractFunctionSource(scriptSource, 'buildCharacterRowHtml');

        expect(rowSource).toMatch(/return `<div class="character_select entity_block flex-container wide100p alignitemsflexstart\$\{isFav \? ' is_fav' : ''\}\$\{isActive \? ' is_active' : ''\}" data-chid="\$\{id\}" chid="\$\{id\}" id="CharID\$\{id\}">/);
        expect(rowSource).toMatch(/const isFav = item\.fav \|\| item\.fav == 'true';/);
        expect(rowSource).toMatch(/const isActive = !selected_group && this_chid !== undefined && String\(this_chid\) === String\(id\);/);
        expect(rowSource).toMatch(/<input class="ch_fav" value="\$\{isFav\}" hidden \/>/);
        expect(rowSource).toMatch(/<div class="tags tags_inline">\$\{tagsHtml\}<\/div>/);
        expect(scriptSource).toContain("$('#rm_print_characters_block .character_select').removeClass('is_active')");
        expect(scriptSource).toContain('$(`#CharID${chid}`).addClass(\'is_active\')');
    });

    test('keeps empty, hidden, and tag-overflow list states wired to the character list', () => {
        const scriptSource = read('public/script.js');
        const printCharactersSource = extractFunctionSource(scriptSource, 'printCharacters');
        const rowSource = extractFunctionSource(scriptSource, 'buildCharacterRowHtml');

        expect(printCharactersSource).toMatch(/if \(!data\.length\) \{\s+const emptyBlock = await getEmptyBlock\(\);\s+\$\(listId\)\.append\(emptyBlock\);/);
        expect(printCharactersSource).toMatch(/const hidden = \(characters\.length \+ groups\.length\) - displayCount;/);
        expect(printCharactersSource).toMatch(/const hiddenBlock = await getHiddenBlock\(hidden\);\s+\$\(listId\)\.append\(hiddenBlock\);/);
        expect(rowSource).toMatch(/const DEFAULT_TAGS_LIMIT = 50;/);
        expect(rowSource).toMatch(/let tagsSkipped = 0;/);
        expect(rowSource).toMatch(/tagsHtml \+= `<span class="tag tag_placeholder"><span class="tag_name">\+\$\{tagsSkipped\}<\/span><\/span>`;/);
    });

    test('keeps bulk selection mounted on generated character rows', () => {
        const bulkEditSource = read('public/scripts/bulk-edit.js');
        const enableBulkSelectSource = extractFunctionSource(bulkEditSource, 'enableBulkSelect');
        const disableBulkSelectSource = extractFunctionSource(bulkEditSource, 'disableBulkSelect');

        expect(enableBulkSelectSource).toMatch(/\$\(\'#rm_print_characters_block \.character_select\'\)\.each/);
        expect(enableBulkSelectSource).toMatch(/const checkbox = \$\('<input type=\\'checkbox\\' class=\\'bulk_select_checkbox\\'>'\);/);
        expect(enableBulkSelectSource).toContain("$('#rm_print_characters_block').addClass('bulk_select')");
        expect(disableBulkSelectSource).toContain("$('.bulk_select_checkbox').remove()");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block').removeClass('bulk_select')");
    });
});
