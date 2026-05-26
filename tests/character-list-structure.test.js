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
            'class="character-list-action-label"',
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
            ['rm_button_create', 'Create'],
            ['character_import_button', 'Import'],
            ['external_import_button', 'Import URL'],
            ['rm_button_group_chats', 'Group'],
            ['rm_button_search', 'Search'],
            ['charListGridToggle', 'Grid'],
            ['bulkEditButton', 'Bulk Edit'],
            ['bulkSelectAllButton', 'Select All'],
            ['bulkDeleteButton', 'Delete'],
        ].forEach(([id, label]) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[\\s\\S]*?<span class="character-list-action-label" data-i18n="${label}">${label}<\\/span>`));
        });

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
        expect(rowSource).toMatch(/<small class="entity_type_badge character_type_badge" data-i18n="Character">Character<\/small>/);
        expect(rowSource).toMatch(/const isFav = item\.fav \|\| item\.fav == 'true';/);
        expect(rowSource).toMatch(/const isActive = !selected_group && this_chid !== undefined && String\(this_chid\) === String\(id\);/);
        expect(rowSource).toMatch(/<input class="ch_fav" value="\$\{isFav\}" hidden \/>/);
        expect(rowSource).toMatch(/<div class="tags tags_inline">\$\{tagsHtml\}<\/div>/);
        expect(scriptSource).toContain("$('#rm_print_characters_block .character_select').removeClass('is_active')");
        expect(scriptSource).toContain('$(`#CharID${chid}`).addClass(\'is_active\')');

        const indexHtml = read('public/index.html');
        expect(indexHtml).toMatch(/<small class="entity_type_badge group_type_badge" data-i18n="Group">Group<\/small>/);
    });

    test('keeps empty, hidden, and tag-overflow list states wired to the character list', () => {
        const scriptSource = read('public/script.js');
        const printCharactersSource = extractFunctionSource(scriptSource, 'printCharacters');
        const rowSource = extractFunctionSource(scriptSource, 'buildCharacterRowHtml');
        const emptyBlockTemplate = read('public/scripts/templates/emptyBlock.html');

        expect(printCharactersSource).toMatch(/if \(!data\.length\) \{\s+const emptyBlock = await getEmptyBlock\(\);\s+\$\(listId\)\.append\(emptyBlock\);/);
        expect(printCharactersSource).toMatch(/const hidden = \(characters\.length \+ groups\.length\) - displayCount;/);
        expect(printCharactersSource).toMatch(/const hiddenBlock = await getHiddenBlock\(hidden\);\s+\$\(listId\)\.append\(hiddenBlock\);/);
        expect(scriptSource).toMatch(/const hasActiveCharacterListFilter = entitiesFilter\.hasAnyFilter\(\);/);
        expect(scriptSource).toMatch(/const searchQuery = entitiesFilter\.getFilterData\(FILTER_TYPES\.SEARCH\);/);
        expect(scriptSource).toMatch(/\.find\('\.clear_character_filters'\)\.on\('click'/);
        expect(scriptSource).toContain("$('#character_search_bar').val('').trigger('input')");
        expect(scriptSource).toContain("$('.rm_tag_filter .clearAllFilters').trigger('click')");
        expect(emptyBlockTemplate).toContain('class="empty_block_message"');
        expect(emptyBlockTemplate).toContain('class="menu_button clear_character_filters"');
        expect(emptyBlockTemplate).toContain('data-i18n="Clear search and filters"');
        expect(rowSource).toMatch(/const DEFAULT_TAGS_LIMIT = 50;/);
        expect(rowSource).toMatch(/let tagsSkipped = 0;/);
        expect(rowSource).toMatch(/tagsHtml \+= `<span class="tag tag_placeholder"><span class="tag_name">\+\$\{tagsSkipped\}<\/span><\/span>`;/);
    });

    test('keeps character list controls readable on narrow screens', () => {
        const styleSource = read('public/style.css');

        expect(styleSource).toMatch(/#rm_button_bar \.character-list-action/);
        expect(styleSource).toMatch(/#rm_button_bar \.character-list-action-label/);
        expect(styleSource).toMatch(/#rm_print_characters_block \.entity_type_badge/);
        expect(styleSource).toMatch(/@media screen and \(max-width: 600px\)[\s\S]*#rm_button_bar[\s\S]*flex-wrap: wrap/);
        expect(styleSource).toMatch(/@media screen and \(max-width: 600px\)[\s\S]*#character_sort_order[\s\S]*flex-basis: 100%/);
    });

    test('keeps character list pagination state synchronized after page-size changes', () => {
        const scriptSource = read('public/script.js');
        const printCharactersSource = extractFunctionSource(scriptSource, 'printCharacters');

        expect(printCharactersSource).toMatch(/let pageSize = Number\(accountStorage\.getItem\(storageKey\)\) \|\| per_page_default;/);
        expect(printCharactersSource).toMatch(/const getCurrentPageSize = \(\) => pageSize;/);
        expect(printCharactersSource).toMatch(/const getPaginationRangeLabel = \(currentPage, totalNumber\) => \{/);
        expect(printCharactersSource).toMatch(/const currentPageSize = getCurrentPageSize\(\);/);
        expect(printCharactersSource).toMatch(/return `\$\{rangeStart\}-\$\{rangeEnd\} \/ \$\{actualTotal\}`;/);
        expect(printCharactersSource).toMatch(/formatNavigator: function \(currentPage, _totalPage, totalNumber\) \{\s+return getPaginationRangeLabel\(currentPage, totalNumber\);/);
        expect(printCharactersSource).toMatch(/formatSizeChanger: function \(\) \{\s+return renderPaginationDropdown\(getCurrentPageSize\(\), sizeChangerOptions\);/);
        expect(printCharactersSource).toMatch(/beforeSizeSelectorChange: function \(_e, size\) \{\s+pageSize = Number\(size\) \|\| per_page_default;\s+saveCharactersPage = 1;/);
        expect(printCharactersSource).toMatch(/afterSizeSelectorChange: function \(e, size\) \{\s+accountStorage\.setItem\(storageKey, String\(pageSize\)\);/);
    });

    test('keeps search feedback, grid labels, and bulk selection semantics wired', () => {
        const indexHtml = read('public/index.html');
        const scriptSource = read('public/script.js');
        const bulkEditSource = read('public/scripts/bulk-edit.js');
        const overlaySource = read('public/scripts/BulkEditOverlay.js');
        const styleSource = read('public/style.css');
        const zhCnLocale = read('public/locales/zh-cn.json');

        expect(indexHtml).toContain('id="character_search_status"');
        expect(indexHtml).toContain('data-i18n="Filtering characters…"');
        expect(indexHtml).toContain('aria-live="polite"');
        expect(indexHtml).toContain('data-i18n="Import URL">Import URL</span>');
        expect(indexHtml).toContain('data-i18n="Group">Group</span>');
        expect(indexHtml).toContain('data-i18n="Bulk Edit">Bulk Edit</span>');
        expect(scriptSource).toContain("setCharacterSearchBusy(true)");
        expect(scriptSource).toContain("setCharacterSearchBusy(false)");
        expect(scriptSource).toContain("updateCharListGridToggleLabel()");
        expect(scriptSource).toContain("data-i18n', power_user.charListGrid ? 'List' : 'Grid'");
        expect(bulkEditSource).toMatch(/const checkbox = \$\('<input type=\\'checkbox\\' class=\\'bulk_select_checkbox\\' aria-label=\\'Select character for bulk edit\\'>'\);/);
        expect(overlaySource).toContain("character.setAttribute('aria-selected', 'true')");
        expect(overlaySource).toContain("character.setAttribute('aria-selected', 'false')");
        expect(overlaySource).toContain('if (!selectedCount)');
        expect(overlaySource).toMatch(/selectedCount\.textContent = String\(count\);/);
        expect(overlaySource).toContain("selectedCount.setAttribute('aria-label',");
        expect(styleSource).toMatch(/#character_search_status/);
        expect(styleSource).toMatch(/#rm_print_characters_block \.character_select\.character_selected/);
        expect(styleSource).toMatch(/#rm_print_characters_block \.character_select\.character_selected::after/);
        expect(zhCnLocale).toContain('"Import URL": "网址导入"');
        expect(zhCnLocale).toContain('"Group": "群组"');
        expect(zhCnLocale).toContain('"Bulk Edit": "批量编辑"');
        expect(zhCnLocale).toContain('"List": "列表"');
        expect(zhCnLocale).toContain('"Filtering characters…": "正在筛选角色…"');
    });

    test('keeps bulk selection mounted on generated character rows', () => {
        const bulkEditSource = read('public/scripts/bulk-edit.js');
        const enableBulkSelectSource = extractFunctionSource(bulkEditSource, 'enableBulkSelect');
        const disableBulkSelectSource = extractFunctionSource(bulkEditSource, 'disableBulkSelect');

        expect(enableBulkSelectSource).toMatch(/\$\(\'#rm_print_characters_block \.character_select\'\)\.each/);
        expect(enableBulkSelectSource).toMatch(/const checkbox = \$\('<input type=\\'checkbox\\' class=\\'bulk_select_checkbox\\' aria-label=\\'Select character for bulk edit\\'>'\);/);
        expect(enableBulkSelectSource).toContain("$(el).attr('aria-selected', 'false')");
        expect(enableBulkSelectSource).toContain("$('#rm_print_characters_block').addClass('bulk_select')");
        expect(disableBulkSelectSource).toContain("$('.bulk_select_checkbox').remove()");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block .character_select').removeAttr('aria-selected')");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block').removeClass('bulk_select')");
    });
});
