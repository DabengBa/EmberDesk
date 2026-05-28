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
    const functionStart = Math.max(
        source.indexOf(`function ${functionName}(`),
        source.indexOf(`const ${functionName} =`),
    );
    expect(functionStart).toBeGreaterThanOrEqual(0);

    let bodyStart = -1;
    let parenDepth = 0;
    for (let i = functionStart; i < source.length; i++) {
        if (source[i] === '(') parenDepth++;
        if (source[i] === ')') parenDepth--;
        if (source[i] === '{' && parenDepth === 0) {
            bodyStart = i;
            break;
        }
    }
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
            'class="character-list-tool-group character-list-create-group"',
            'class="character-list-tool-group character-list-sort-group"',
            'class="character-list-tool-group character-list-view-group"',
            'class="character-list-tool-group character-list-bulk-actions"',
            'class="character-list-sort-label"',
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
            ['rm_button_create', 'Character Toolbar New', 'New', 'Create New Character'],
            ['character_import_button', 'Character Toolbar File', 'File', 'Import Character from File'],
            ['external_import_button', 'Character Toolbar URL', 'URL', 'Import content from external URL'],
            ['rm_button_group_chats', 'Character Toolbar Group', 'Group', 'Create New Chat Group'],
            ['rm_button_search', 'Character Toolbar Find', 'Find', 'Toggle search bar'],
            ['charListGridToggle', 'Character Toolbar Grid', 'Grid', 'Toggle character grid view'],
            ['bulkEditButton', 'Character Toolbar Bulk', 'Bulk', 'Bulk edit characters'],
            ['bulkSelectAllButton', 'Character Toolbar All', 'All', 'Bulk select all characters'],
            ['bulkDeleteButton', 'Character Toolbar Delete', 'Del', 'Bulk delete characters'],
        ].forEach(([id, key, label, ariaLabel]) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[\\s\\S]*?<span class="character-list-action-label" data-i18n="${key}">${label}<\\/span>`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\baria-label="${ariaLabel}"`));
        });

        [
            ['rm_button_create', 'Create New Character'],
            ['character_import_button', 'Import Character from File'],
            ['external_import_button', 'Import content from external URL'],
            ['rm_button_group_chats', 'Create New Chat Group'],
            ['rm_button_search', 'Toggle search bar'],
            ['charListGridToggle', 'Toggle character grid view'],
            ['bulkSelectAllButton', 'Bulk select all characters'],
            ['bulkDeleteButton', 'Bulk delete characters'],
        ].forEach(([id, title]) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\btitle="${title}"`));
        });
        expect(indexHtml).toMatch(/id="bulkEditButton"[^>]*\btitle="Bulk edit characters&#13;&#13;/);

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
        const renderCharacterListPageSource = extractFunctionSource(scriptSource, 'renderCharacterListPage');
        const rowSource = extractFunctionSource(scriptSource, 'buildCharacterRowHtml');
        const renderStateSource = read('public/scripts/character-list-render-state.js');
        const emptyBlockTemplate = read('public/scripts/templates/emptyBlock.html');

        expect(printCharactersSource).toContain('let pendingInitialFullRefresh = fullRefresh;');
        expect(printCharactersSource).toContain('const useFullRefresh = pendingInitialFullRefresh;');
        expect(printCharactersSource).toContain('pendingInitialFullRefresh = false;');
        expect(printCharactersSource).toContain('await renderCharacterListPage(data, { fullRefresh: useFullRefresh });');
        expect(renderCharacterListPageSource).toContain('createCharacterListPageRenderPlan({');
        expect(scriptSource).toContain('createCharacterListPageReconcilePlan');
        expect(scriptSource).toContain('applyCharacterListPageRenderPlan({');
        expect(scriptSource).toContain('let currentCharacterListPageEntities = [];');
        expect(scriptSource).toMatch(/if \(fullRefresh \|\| reconcilePlan\.mode !== 'incremental'\) \{\s+await renderCharacterListPageFull\(renderPlan\);/);
        expect(scriptSource).toMatch(/if \(renderPlan\.showEmptyBlock\) \{\s+desiredElements\.push\(\(await getEmptyBlock\(\)\)\[0\]\);/);
        expect(scriptSource).toMatch(/desiredElements\.push\(\(await getHiddenBlock\(renderPlan\.hiddenCount\)\)\[0\]\);/);
        expect(renderStateSource).toMatch(/const displayCount = pageEntities\.filter\(entity => entity\.type === 'character' \|\| entity\.type === 'group'\)\.length;/);
        expect(renderStateSource).toMatch(/const hiddenCount = \(totalCharacters \+ totalGroups\) - displayCount;/);
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

        expect(styleSource).toMatch(/#rm_button_bar\s*\{[\s\S]*display:\s*grid/);
        expect(styleSource).toMatch(/#rm_button_bar\s*\{[\s\S]*grid-template-areas:\s*["']create sort["'][\s\S]*["']view bulk["']/);
        expect(styleSource).toMatch(/#rm_button_bar \.character-list-create-group\s*\{[\s\S]*grid-area:\s*create/);
        expect(styleSource).toMatch(/#rm_button_bar \.character-list-sort-group\s*\{[\s\S]*grid-area:\s*sort/);
        expect(styleSource).toMatch(/#rm_button_bar \.character-list-view-group\s*\{[\s\S]*grid-area:\s*view/);
        expect(styleSource).toMatch(/#rm_button_bar \.character-list-bulk-actions\s*\{[\s\S]*grid-area:\s*bulk/);
        const actionLabelRule = styleSource.match(/#rm_button_bar \.character-list-action-label\s*\{(?<body>[^}]+)\}/)?.groups?.body;
        expect(actionLabelRule).toContain('white-space: nowrap');
        expect(actionLabelRule).not.toContain('text-overflow');
        expect(actionLabelRule).not.toContain('max-width');
        expect(styleSource).toMatch(/#bulkSelectedCount/);
        expect(styleSource).toMatch(/#rm_print_characters_block \.entity_type_badge/);
        expect(styleSource).toMatch(/@media screen and \(max-width: 600px\)[\s\S]*#rm_button_bar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
        expect(styleSource).toMatch(/@media screen and \(max-width: 600px\)[\s\S]*grid-template-areas:\s*["']create["'][\s\S]*["']sort["'][\s\S]*["']view["'][\s\S]*["']bulk["']/);
    });

    test('keeps ordinary character type badges quiet while group badges remain visible', () => {
        const styleSource = read('public/style.css');

        const characterBadgeRule = styleSource.match(/#rm_print_characters_block \.character_type_badge\s*\{(?<body>[^}]+)\}/)?.groups?.body;
        const groupBadgeRule = styleSource.match(/#rm_print_characters_block \.group_type_badge\s*\{(?<body>[^}]+)\}/)?.groups?.body;

        expect(characterBadgeRule).toContain('display: none');
        expect(groupBadgeRule).toContain('display: inline-flex');
        expect(groupBadgeRule).toContain('color: var(--SmartThemeUnderlineColor)');
    });

    test('keeps character list pagination state synchronized after page-size changes', () => {
        const scriptSource = read('public/script.js');
        const printCharactersSource = extractFunctionSource(scriptSource, 'printCharacters');
        const renderStateSource = read('public/scripts/character-list-render-state.js');

        expect(printCharactersSource).toMatch(/let pageSize = Number\(accountStorage\.getItem\(storageKey\)\) \|\| per_page_default;/);
        expect(printCharactersSource).toContain('const sizeChangerOptions = CHARACTER_LIST_PAGE_SIZE_OPTIONS;');
        expect(printCharactersSource).toMatch(/const getCurrentPageSize = \(\) => pageSize;/);
        expect(printCharactersSource).toMatch(/const getPaginationRangeLabel = \(currentPage, totalNumber\) => \{/);
        expect(printCharactersSource).toContain('return getCharacterListPaginationRangeLabel({');
        expect(renderStateSource).toContain('export const CHARACTER_LIST_PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100, 250, 500, 1000]);');
        expect(renderStateSource).toMatch(/return `\$\{rangeStart\}-\$\{rangeEnd\} \/ \$\{actualTotal\}`;/);
        expect(printCharactersSource).toMatch(/formatNavigator: function \(currentPage, _totalPage, totalNumber\) \{\s+return getPaginationRangeLabel\(currentPage, totalNumber\);/);
        expect(printCharactersSource).toMatch(/formatSizeChanger: function \(\) \{\s+return renderPaginationDropdown\(getCurrentPageSize\(\), sizeChangerOptions\);/);
        expect(printCharactersSource).toMatch(/beforeSizeSelectorChange: function \(_e, size\) \{\s+pageSize = Number\(size\) \|\| per_page_default;\s+saveCharactersPage = 1;/);
        expect(printCharactersSource).toMatch(/afterSizeSelectorChange: function \(e, size\) \{\s+accountStorage\.setItem\(storageKey, String\(pageSize\)\);/);
    });

    test('keeps ordinary character delete on the incremental reconcile path with full-refresh fallback', () => {
        const scriptSource = read('public/script.js');
        const printCharactersSource = extractFunctionSource(scriptSource, 'printCharacters');
        const removeCharacterFromUISource = extractFunctionSource(scriptSource, 'removeCharacterFromUI');
        const reconcileSource = extractFunctionSource(scriptSource, 'reconcileCharacterListAfterDelete');

        expect(scriptSource).toContain('createCharacterDeleteReconcilePlan');
        expect(scriptSource).toContain('createCharacterBulkDeletePagePlan');
        expect(scriptSource).toContain('syncCharacterListRowIdentity');
        expect(scriptSource).toContain('let isCharacterDeleteReconcileInProgress = false;');
        expect(scriptSource).toContain('let characterDeleteReconcileGeneration = 0;');
        expect(scriptSource).not.toContain('suppressCharacterDeleteListReprintUntil');
        expect(scriptSource).not.toContain('CHARACTER_DELETE_REPRINT_SUPPRESSION_MS');
        expect(scriptSource).toContain('const deleteReconcileGenerationAtStart = characterDeleteReconcileGeneration;');
        expect(scriptSource).toContain('shouldSuppressCharacterDeleteListReprintState');
        expect(printCharactersSource).toContain('allowDuringCharacterDelete = false');
        expect(printCharactersSource).toMatch(/if \(shouldSuppressCharacterDeleteListReprint\(deleteReconcileGenerationAtStart, \{ allowDuringDelete: allowDuringCharacterDelete \}\)\) \{\s+return;\s+\}/);
        expect(printCharactersSource).toMatch(/callback: async function \(\/\*\* @type \{Entity\[\]\} \*\/ data\) \{\s+if \(shouldSuppressCharacterDeleteListReprint\(deleteReconcileGenerationAtStart, \{ allowDuringDelete: allowDuringCharacterDelete \}\)\) \{\s+return;\s+\}/);
        const deleteCharacterSource = extractFunctionSource(scriptSource, 'deleteCharacter');
        expect(deleteCharacterSource).toContain('deleteContext = null');
        expect(deleteCharacterSource.indexOf('isCharacterDeleteReconcileInProgress = true;')).toBeLessThan(deleteCharacterSource.indexOf('const closeChatResult = await closeCurrentChatForDelete();'));
        expect(deleteCharacterSource.indexOf('isCharacterDeleteReconcileInProgress = false;')).toBeGreaterThan(deleteCharacterSource.indexOf('await removeCharacterFromUI(deletedAvatars, { deleteContext });'));
        expect(removeCharacterFromUISource).toContain('const beforeDeleteSnapshot = createCharacterListEntitySnapshot(getEntitiesList({ doFilter: true }));');
        expect(removeCharacterFromUISource).toContain('cancelDebounce(printCharactersDebounced);');
        expect(removeCharacterFromUISource).toContain('const reconciled = await reconcileCharacterListAfterDelete({');
        expect(removeCharacterFromUISource).toContain('deleteContext,');
        expect(removeCharacterFromUISource).toMatch(/if \(!reconciled\) \{\s+const printCharactersStartedAt = performance\.now\(\);\s+await printCharacters\(true, \{ allowDuringCharacterDelete: true \}\);/);
        expect(reconcileSource).toContain('createCharacterDeleteReconcilePlan({');
        expect(reconcileSource).toContain('createCharacterBulkDeletePagePlan({');
        expect(reconcileSource).toContain("const isBulkDeleteContext = deleteContext?.source === 'bulk';");
        expect(reconcileSource).toContain('const hasActiveFilter = entitiesFilter.hasAnyFilter();');
        expect(reconcileSource).toContain("const isBulkEdit = $('#rm_print_characters_block').hasClass('bulk_select');");
        expect(reconcileSource).toContain('isBulkEdit: isBulkEdit && !isBulkDeleteContext');
        expect(reconcileSource).toContain('applyCharacterListPageRenderPlan({');
        expect(reconcileSource).toContain('currentCharacterListPageEntities = plan.pageEntities;');
        expect(reconcileSource).toContain('updateCharacterListPaginationState(plan, afterSnapshot, { skipInitialCallback: true });');
        expect(reconcileSource).toContain('await eventSource.emit(event_types.CHARACTER_PAGE_LOADED);');

        const updatePaginationSource = extractFunctionSource(scriptSource, 'updateCharacterListPaginationState');
        expect(updatePaginationSource).toContain("dataSource: afterSnapshot.entities");
        expect(updatePaginationSource).toContain('triggerPagingOnInit: !skipInitialCallback');
        expect(updatePaginationSource).not.toContain('paginationData.attributes.dataSource = afterSnapshot.entities;');
    });

    test('keeps temporary-chat warning integrated into character delete confirmation', () => {
        const scriptSource = read('public/script.js');
        const indexHtml = read('public/index.html');
        const styleSource = read('public/style.css');
        const overlaySource = read('public/scripts/BulkEditOverlay.js');
        const cascadeDialogSource = read('public/scripts/world-cascade-dialog.js');
        const zhCnLocale = read('public/locales/zh-cn.json');
        const zhTwLocale = read('public/locales/zh-tw.json');
        const deleteCharacterSource = extractFunctionSource(scriptSource, 'deleteCharacter');
        const deleteDialogTitleSource = extractFunctionSource(scriptSource, 'getCharacterDeleteDialogTitle');
        const newAssistantChatSource = extractFunctionSource(scriptSource, 'newAssistantChat');

        expect(indexHtml).toContain('id="temporary_chat_status"');
        expect(indexHtml).toContain('data-i18n="Temporary chat"');
        expect(styleSource).toMatch(/#temporary_chat_status/);
        expect(scriptSource).toContain('function setTemporaryChatStatus');
        expect(scriptSource).toContain("$('#temporary_chat_status')");
        expect(newAssistantChatSource).toContain('setTemporaryChatStatus(true)');
        expect(newAssistantChatSource).toContain('setTemporaryChatStatus(false)');
        expect(deleteCharacterSource).toContain('temporaryChatAcknowledged = false');
        expect(deleteCharacterSource).toContain('if (inTempChat && !temporaryChatAcknowledged)');
        expect(scriptSource).toContain('buildTemporaryChatDeleteWarningHtml');
        expect(scriptSource).toContain('content += buildTemporaryChatDeleteWarningHtml();');
        expect(deleteDialogTitleSource).toContain('escapeHtml(characterName');
        expect(deleteDialogTitleSource).toContain('t`Delete character "${safeCharacterName}"?`');
        expect(scriptSource).toContain('const characterToDelete = characters[this_chid];');
        expect(scriptSource).toContain('const deleteDialogTitle = getCharacterDeleteDialogTitle(characterToDelete.name);');
        expect(scriptSource).toContain('showDeleteConfirmWithCascade(deleteDialogTitle, content)');
        expect(scriptSource).toMatch(/Popup\.show\.confirm\(deleteDialogTitle,\s*content,\s*\{[\s\S]*defaultResult: POPUP_RESULT\.NEGATIVE/);
        expect(scriptSource).toMatch(/deleteCharacter\(avatarToDelete,\s*\{[\s\S]*temporaryChatAcknowledged: inTempChat[\s\S]*deleteWorlds: dialogResult\.deleteWorlds/);
        expect(scriptSource).toMatch(/deleteCharacter\(avatarToDelete,\s*\{[\s\S]*deleteChats,[\s\S]*temporaryChatAcknowledged: inTempChat[\s\S]*\}\)/);
        expect(scriptSource).toMatch(/deleteCharacter\(avatarToDelete,\s*\{[\s\S]*deleteWorlds: \[\],[\s\S]*clearWorldReferences: false[\s\S]*\}\)/);
        expect(zhCnLocale).toContain('"Delete character \\"${0}\\"?": "删除角色「${0}」？"');
        expect(zhTwLocale).toContain('"Delete character \\"${0}\\"?": "刪除角色「${0}」？"');

        expect(overlaySource).toContain('temporaryChatAcknowledged: inTempChat');
        expect(overlaySource).toContain("deleteContext: { source: 'bulk', selectedCount: count }");
        expect(overlaySource).toContain('temporary chat — unsaved messages will be lost');

        const showDeleteConfirmWithCascadeSource = extractFunctionSource(cascadeDialogSource, 'showDeleteConfirmWithCascade');
        expect(showDeleteConfirmWithCascadeSource).toContain('defaultResult: POPUP_RESULT.NEGATIVE');
        expect(showDeleteConfirmWithCascadeSource).toContain("const chatCb = document.getElementById('del_char_checkbox');");
        expect(showDeleteConfirmWithCascadeSource).toContain('if (chatCb) chatCb.checked = true;');
        expect(showDeleteConfirmWithCascadeSource).toContain("document.querySelectorAll('.world-cascade-checkbox').forEach((cb) => { cb.checked = true; });");
    });

    test('keeps selected-character navigation safe when the current character was deleted', () => {
        const scriptSource = read('public/script.js');
        const selectSelectedCharacterSource = extractFunctionSource(scriptSource, 'select_selected_character');

        expect(selectSelectedCharacterSource).toContain('const character = characters[chid];');
        expect(selectSelectedCharacterSource).toMatch(/if \(!character\) \{\s+if \(switchMenu\) \{\s+select_rm_characters\(\);\s+\}\s+return false;\s+\}/);
        expect(selectSelectedCharacterSource).toContain("$('#rm_button_selected_ch').children('h2').text(character.name);");
        expect(selectSelectedCharacterSource).not.toContain("$('#rm_button_selected_ch').children('h2').text(characters[chid].name);");
        expect(scriptSource).toMatch(/if \(this_chid !== undefined && characters\[this_chid\]\) \{\s+selected_button = 'character_edit';\s+select_selected_character\(this_chid\);\s+\} else \{\s+selected_button = 'characters';\s+select_rm_characters\(\);\s+\}/);
    });

    test('keeps the selected-character delete action directly discoverable and keyboard reachable', () => {
        const indexHtml = read('public/index.html');

        expect(indexHtml).toMatch(/<button id="delete_button"[^>]*type="button"[^>]*class="[^"]*\bmenu_button\b[^"]*\bred_button\b[^"]*"[^>]*title="Delete Character"[^>]*aria-label="Delete Character"[^>]*data-i18n="\[title\]\[aria-label\]Delete Character"[^>]*><\/button>/);
        expect(indexHtml).toContain('<option id="delete_from_dropdown" class="red_button character-detail-edit-action" data-i18n="Delete Character">');
    });

    test('keeps search feedback, grid labels, and bulk selection semantics wired', () => {
        const indexHtml = read('public/index.html');
        const scriptSource = read('public/script.js');
        const bulkEditSource = read('public/scripts/bulk-edit.js');
        const overlaySource = read('public/scripts/BulkEditOverlay.js');
        const stateSource = read('public/scripts/character-list-state.js');
        const styleSource = read('public/style.css');
        const zhCnLocale = read('public/locales/zh-cn.json');

        expect(indexHtml).toContain('id="character_search_status"');
        expect(indexHtml).toContain('data-i18n="Filtering characters…"');
        expect(indexHtml).toContain('aria-live="polite"');
        expect(indexHtml).toContain('id="bulkSelectionHint"');
        expect(indexHtml).toContain('data-i18n="Click character cards to select"');
        expect(indexHtml).toContain('data-i18n="Character Toolbar URL">URL</span>');
        expect(indexHtml).toContain('data-i18n="Character Toolbar Group">Group</span>');
        expect(indexHtml).toContain('data-i18n="Character Toolbar Bulk">Bulk</span>');
        expect(indexHtml).toContain('data-i18n="Character Toolbar Sort">Sort</label>');
        expect(indexHtml).toMatch(/id="bulkSelectedCount"[^>]*style="display: none;"[^>]*role="status"/);
        expect(indexHtml).toContain('role="status"');
        expect(indexHtml).toMatch(/id="bulkEditButton"[^>]*tabindex="0"/);
        expect(scriptSource).toContain("setCharacterSearchBusy(true)");
        expect(scriptSource).toContain("setCharacterSearchBusy(false)");
        expect(scriptSource).toContain("updateCharListGridToggleLabel()");
        expect(scriptSource).toContain("power_user.charListGrid ? 'Character Toolbar List' : 'Character Toolbar Grid'");
        expect(bulkEditSource).toMatch(/const checkbox = \$\('<input type=\\'checkbox\\' class=\\'bulk_select_checkbox\\' aria-label=\\'Select character for bulk edit\\'>'\);/);
        expect(bulkEditSource).toContain("aria-describedby': 'bulkSelectionHint'");
        expect(bulkEditSource).toContain("$(el).attr('role', 'checkbox')");
        expect(bulkEditSource).toContain("$(el).attr('aria-checked', 'false')");
        expect(overlaySource).toContain("character.setAttribute('aria-selected', 'true')");
        expect(overlaySource).toContain("character.setAttribute('aria-selected', 'false')");
        expect(overlaySource).toContain("character.setAttribute('aria-checked', 'true')");
        expect(overlaySource).toContain("character.setAttribute('aria-checked', 'false')");
        expect(overlaySource).toContain('syncBulkSelectionDomState({');
        expect(overlaySource).toContain('this.state !== BulkEditOverlayState.select');
        expect(overlaySource).toContain('updateBulkSelectionCountState({ selectedCount, deleteButton, fallbackFocusElement }, count)');
        expect(overlaySource).toContain('t`Delete ${count} characters?`');
        expect(overlaySource).toContain("deleteContext: { source: 'bulk', selectedCount: count }");
        expect(overlaySource).not.toContain('${t`Delete`} ${count} ${t`characters?`}');
        expect(stateSource).toContain('if (!selectedCount)');
        expect(stateSource).toContain('selectedCount.textContent = getBulkSelectionShortCountText(count);');
        expect(stateSource).toContain("selectedCount.setAttribute('aria-label',");
        expect(stateSource).toContain('updateBulkDeleteButtonState(deleteButton, count > 0, fallbackFocusElement)');
        expect(stateSource).toContain('export function syncBulkSelectionDomState');
        expect(stateSource).toContain("character.setAttribute('aria-checked', String(isSelected))");
        expect(stateSource).toContain("checkbox.setAttribute('aria-checked', String(isSelected))");
        expect(styleSource).toMatch(/#character_search_status/);
        expect(styleSource).toMatch(/#bulkSelectionHint/);
        expect(styleSource).toMatch(/#rm_print_characters_block \.character_select\.character_selected/);
        expect(styleSource).toMatch(/#rm_print_characters_block \.character_select\.character_selected::after/);
        expect(zhCnLocale).toContain('"Character Toolbar URL": "URL"');
        expect(zhCnLocale).toContain('"Character Toolbar Group": "群"');
        expect(zhCnLocale).toContain('"Character Toolbar Bulk": "批"');
        expect(zhCnLocale).toContain('"Character Toolbar List": "列"');
        expect(zhCnLocale).toContain('"Character Toolbar Sort": "排"');
        expect(zhCnLocale).toContain('"Delete ${0} characters?": "删除 ${0} 个角色？"');
        expect(zhCnLocale).toContain('"Filtering characters…": "正在筛选角色…"');
        expect(zhCnLocale).toContain('"Click character cards to select": "点击角色卡选择"');
    });

    test('keeps bulk selection mounted on generated character rows', () => {
        const bulkEditSource = read('public/scripts/bulk-edit.js');
        const enableBulkSelectSource = extractFunctionSource(bulkEditSource, 'enableBulkSelect');
        const disableBulkSelectSource = extractFunctionSource(bulkEditSource, 'disableBulkSelect');

        expect(enableBulkSelectSource).toMatch(/\$\(\'#rm_print_characters_block \.character_select\'\)\.each/);
        expect(enableBulkSelectSource).toMatch(/const checkbox = \$\('<input type=\\'checkbox\\' class=\\'bulk_select_checkbox\\' aria-label=\\'Select character for bulk edit\\'>'\);/);
        expect(enableBulkSelectSource).toContain("$(el).attr('role', 'checkbox')");
        expect(enableBulkSelectSource).toContain("$(el).attr('aria-selected', 'false')");
        expect(enableBulkSelectSource).toContain("$(el).attr('aria-checked', 'false')");
        expect(enableBulkSelectSource).toContain("$(el).attr('aria-describedby', 'bulkSelectionHint')");
        expect(enableBulkSelectSource).toContain("$('#rm_print_characters_block').addClass('bulk_select')");
        expect(enableBulkSelectSource).toContain("$(document).off('click.bulkSelectCheckbox').on('click.bulkSelectCheckbox'");
        expect(bulkEditSource).toContain('if (is_bulk_edit) {');
        expect(bulkEditSource).toContain('characterGroupOverlay.onPageLoad();');
        expect(bulkEditSource).toContain("$('#bulkSelectedCount').css('display', 'inline-flex')");
        expect(disableBulkSelectSource).toContain("$('.bulk_select_checkbox').remove()");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block .character_select').removeAttr('role')");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block .character_select').removeAttr('aria-selected')");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block .character_select').removeAttr('aria-checked aria-describedby')");
        expect(disableBulkSelectSource).toContain("$('#rm_print_characters_block').removeClass('bulk_select')");
        expect(disableBulkSelectSource).toContain("$(document).off('click.bulkSelectCheckbox')");
    });

    test('keeps bulk destructive actions disabled until a selection exists', () => {
        const bulkEditSource = read('public/scripts/bulk-edit.js');
        const overlaySource = read('public/scripts/BulkEditOverlay.js');
        const deleteButtonSource = extractFunctionSource(bulkEditSource, 'onDeleteButtonClick');
        const enableBulkEditSource = extractFunctionSource(bulkEditSource, 'enableBulkEdit');
        const disableBulkEditSource = extractFunctionSource(bulkEditSource, 'disableBulkEdit');

        expect(overlaySource).toContain("static bulkDeleteButtonId = 'bulkDeleteButton'");
        expect(overlaySource).toContain('updateBulkActionStates = (countOverride = undefined) => {');
        expect(overlaySource).toContain('updateBulkDeleteButtonState(deleteButton, hasSelection, fallbackFocusElement)');
        expect(overlaySource).toContain('updateBulkSelectionCountState({ selectedCount, deleteButton, fallbackFocusElement }, count)');
        expect(read('public/scripts/character-list-state.js')).toContain("deleteButton.setAttribute('tabindex', '0')");
        expect(enableBulkEditSource).toContain('characterGroupOverlay.updateSelectedCount(0)');
        expect(enableBulkEditSource).not.toContain('characterGroupOverlay.updateBulkActionStates(0)');
        expect(disableBulkEditSource).toContain('characterGroupOverlay.updateSelectedCount(0)');
        expect(disableBulkEditSource).not.toContain('characterGroupOverlay.updateBulkActionStates(0)');
        expect(deleteButtonSource).toContain("if ($('#bulkDeleteButton').hasClass('disabled'))");
        expect(deleteButtonSource).toContain('return;');
        expect(deleteButtonSource).toContain("Reuse the overlay's delete flow; it also no-ops when selection is empty.");
    });
});
