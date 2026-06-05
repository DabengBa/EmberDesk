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

function getTopSettingsDrawerIds(indexHtml) {
    const tagPattern = /<\/?div\b[^>]*>/gi;
    const stack = [];
    const drawers = [];
    let inTopSettings = false;
    let topSettingsDepth = -1;
    let match;

    while ((match = tagPattern.exec(indexHtml)) !== null) {
        const tag = match[0];
        const isClose = tag.startsWith('</');

        if (!isClose) {
            const id = tag.match(/id="([^"]+)"/)?.[1] ?? '';
            const className = tag.match(/class="([^"]+)"/)?.[1] ?? '';

            if (id === 'top-settings-holder') {
                inTopSettings = true;
                topSettingsDepth = stack.length;
            } else if (inTopSettings && stack.length === topSettingsDepth + 1 && /\bdrawer\b/.test(className)) {
                drawers.push(id);
            }

            stack.push({ id, className });
        } else {
            const openTag = stack.pop();

            if (openTag?.id === 'top-settings-holder') {
                break;
            }
        }
    }

    return drawers;
}

describe('world info card rendering', () => {
    test('pagination appends card DOM nodes, not raw jQuery wrapper arrays', () => {
        const source = read('public/scripts/world-info.js');

        expect(source).toContain('worldEntriesList.append(blocks.map(block => block[0]).filter(Boolean));');
        expect(source).not.toContain('worldEntriesList.append(blocks);');
    });

    test('collapsed cards can rebuild the lazy edit form after being collapsed', () => {
        const source = read('public/scripts/world-info.js');
        const createCardStart = source.indexOf('export function createWorldEntryCard');
        const createCardEnd = source.indexOf('function buildAutocompleteCallback', createCardStart);
        const createCardSource = source.slice(createCardStart, createCardEnd);

        expect(createCardStart).toBeGreaterThanOrEqual(0);
        expect(createCardEnd).toBeGreaterThan(createCardStart);
        expect(createCardSource).not.toContain('let built = false');
        expect(createCardSource).not.toContain('if (built) return;');
    });

    test('legacy getWorldEntry export returns a populated edit form', () => {
        const source = read('public/scripts/world-info.js');
        const entryStart = source.indexOf('export async function getWorldEntry');
        const entryEnd = source.indexOf('export function createWorldEntryCard', entryStart);
        const entrySource = source.slice(entryStart, entryEnd);

        expect(entryStart).toBeGreaterThanOrEqual(0);
        expect(entryEnd).toBeGreaterThan(entryStart);
        expect(entrySource).toContain('const editTemplate = WI_ENTRY_EDIT_TEMPLATE.clone();');
        expect(entrySource).toContain('setupEditFormBindings(editTemplate, outlet, name, data, entry);');
        expect(entrySource).toContain('initAccordionState(outlet);');
    });

    test('more menu opener and items support keyboard operation', () => {
        const panelHtml = read('public/panels/world-info-body.html');
        const source = read('public/scripts/world-info.js');

        expect(panelHtml).toContain('id="world_more_menu" class="menu_button fa-solid fa-ellipsis" role="button" tabindex="0"');
        expect(source).toContain('keydown.worldMoreMenuToggle');
        expect(source).toContain('e.key === \'Escape\'');
        expect(source).toContain('closeMoreMenu({ restoreFocus: true })');
        expect(source).toContain('keydown.worldMoreMenuItem');
    });

    test('entry template exposes the collapsed card shell before edit controls', () => {
        const indexHtml = read('public/index.html');
        const templateStart = indexHtml.indexOf('<div id="entry_edit_template" class="template_element">');
        const templateEnd = indexHtml.indexOf('<div id="character_template"', templateStart);
        const entryTemplate = indexHtml.slice(templateStart, templateEnd);
        const cardIndex = entryTemplate.indexOf('<div class="world_entry">');
        const editIndex = entryTemplate.indexOf('<div class="world_entry_edit">');

        expect(templateStart).toBeGreaterThanOrEqual(0);
        expect(templateEnd).toBeGreaterThan(templateStart);
        expect(cardIndex).toBeGreaterThanOrEqual(0);
        expect(editIndex).toBeGreaterThan(cardIndex);
        expect(entryTemplate).toContain('class="wi-card-expand-button');
        expect(entryTemplate).toContain('aria-expanded="false"');
        expect(entryTemplate).toContain('aria-label="Expand entry"');
        expect(entryTemplate).toContain('data-i18n="[title]Expand entry"');
        expect(entryTemplate).toContain('<div class="inline-drawer-content inline-drawer-outlet flex-container paddingBottom5px wide100p">');
    });

    test('collapsed cards expose explicit controls instead of hidden click targets', () => {
        const indexHtml = read('public/index.html');
        const source = read('public/scripts/world-info.js');

        expect(indexHtml).toContain('class="wi-card-position-control"');
        expect(indexHtml).toContain('name="position"');
        expect(indexHtml).toContain('class="wi-card-active-toggle');
        expect(source).toContain('worldEntriesList.find(\'.wi-card-expand-button\')');
        expect(source).not.toContain('worldEntriesList.find(\'.wi-card-body-wrap, .wi-card-expand-button\')');
    });

    test('world info panel separates global activation from entry editing', () => {
        const indexHtml = read('public/index.html');
        const panelHtml = read('public/panels/world-info-body.html');
        const css = read('public/css/world-info.css');

        expect(indexHtml).toContain('id="wiGlobalPanel"');
        expect(indexHtml).toContain('data-i18n="Global World Info"');
        expect(indexHtml).not.toContain('data-i18n="Enabled worlds"');
        expect(indexHtml).toContain('id="wiGlobalCount"');
        expect(indexHtml).toContain('data-i18n="Activation Rules"');
        expect(indexHtml).toContain('id="wiEditorPanel"');
        expect(indexHtml).toContain('data-i18n="World Info Editor"');
        expect(indexHtml).toContain('id="wiTopBlock" class="wi-global-grid inline-drawer wide100p"');
        expect(indexHtml).toContain('class="inline-drawer-content wi-global-rules-content"');
        expect(panelHtml).toContain('id="world_editor_select"');
        expect(css).toContain('.wi-global-grid');
        expect(css).toContain('.wi-global-count');
        expect(css).toContain('.wi-global-rules-content');
        expect(css).toContain('grid-column: 1 / -1;');
        expect(css).toContain('.wi-settings-toggle');
    });

    test('global world selector refreshes selected Select2 labels after option replay', () => {
        const source = read('public/scripts/world-info.js');

        expect(source).toContain('function refreshGlobalWorldInfoSelectorLabels()');
        expect(source).toContain('worldInfoSelect.trigger(\'change.select2\');');
        expect(source).not.toContain('worldInfoSelect.trigger(\'change\');');
    });

    test('global world selector exposes a clear empty prompt and keeps multi-select open for consecutive choices', () => {
        const indexHtml = read('public/index.html');
        const source = read('public/scripts/world-info.js');

        expect(indexHtml).toContain('aria-label="Global World Info active in all chats"');
        expect(indexHtml).toContain('data-placeholder="No global worlds active. Select one or more worlds."');
        expect(source).toContain('const globalWorldInfoSelector = $(\'#world_info\');');
        expect(source).toContain('function refreshGlobalWorldInfoSelectorState()');
        expect(source).toContain('$(\'#wiGlobalCount\').text');
        expect(source).toContain('placeholder: globalWorldInfoSelector.attr(\'data-placeholder\')');
        expect(source).toContain('globalWorldInfoSelector.on(\'select2:select select2:unselect\', () => refreshGlobalWorldInfoSelectorState());');
        expect(source).not.toContain('globalWorldInfoSelector.select2(\'close\');');
        expect(source).not.toContain('globalWorldInfoSelector.next(\'span.select2-container\').find(\'textarea\').trigger(\'blur\');');
    });

    test('empty editor state makes new-entry prerequisite visible', () => {
        const panelHtml = read('public/panels/world-info-body.html');
        const source = read('public/scripts/world-info.js');

        expect(panelHtml).toContain('data-i18n="[title]Create or select a World Info file first"');
        expect(source).toContain('function setWorldEntryCreationAvailable(available)');
        expect(source).toContain('setWorldEntryCreationAvailable(false);');
        expect(source).toContain('setWorldEntryCreationAvailable(true);');
        expect(source).toContain('toastr.info(t`Create or import a new World Info file first.`, t`World Info is not set`');
    });

    test('world info editor localizes page-size and clear-selection labels', () => {
        const source = read('public/scripts/world-info.js');
        const locale = read('public/locales/zh-cn.json');

        expect(source).toContain('function localizeWorldInfoPagination()');
        expect(source).toContain('afterRender: localizeWorldInfoPagination,');
        expect(source).toContain('replaceAll(\' / page\', ` ${t`/ page`}`)');
        expect(source).toContain('function getWorldInfoSelect2Language()');
        expect(source).toContain('language: getWorldInfoSelect2Language(),');
        expect(locale).toContain('"/ page": "/ 页"');
        expect(locale).toContain('"Remove all items": "移除全部项目"');
    });

    test('world info panel rehydrates selected editor after drawer remount', () => {
        const source = read('public/scripts/world-info.js');
        const rehydrateStart = source.indexOf('export function rehydrateWorldInfoPanel');
        const rehydrateEnd = source.indexOf('export function reloadEditor', rehydrateStart);
        const rehydrateSource = source.slice(rehydrateStart, rehydrateEnd);

        expect(rehydrateStart).toBeGreaterThanOrEqual(0);
        expect(rehydrateEnd).toBeGreaterThan(rehydrateStart);
        expect(rehydrateSource).toContain('syncWorldInfoSettingsUi({ syncGlobalSelect: false });');
        expect(rehydrateSource).toContain('Array.isArray(world_names) && world_names.includes(selectedName)');
        expect(rehydrateSource).toContain('void showWorldEditor(selectedName);');
        expect(rehydrateSource).toContain('void hideWorldEditor();');
    });

    test('world info drawer takes precedence over the character drawer when opened from the top bar', () => {
        const source = read('public/script.js');

        expect(source).toContain('const isOpeningWorldInfoDrawer = targetDrawerID === \'WorldInfo\' && !drawerWasOpenAlready;');
        expect(source).toContain('const $openDrawers = isOpeningWorldInfoDrawer');
        expect(source).toContain('$(\'#right-nav-panel.openDrawer\').not(drawer)');
        expect(source).toContain('const $openIcons = isOpeningWorldInfoDrawer');
        expect(source).toContain('$(\'#rm_button_panel_pin_div .openIcon, #rightNavDrawerIcon.openIcon\')');
    });

    test('world info drawer stays reachable on mobile and tablet widths', () => {
        const css = read('public/css/world-info.css');

        expect(css).toContain('#WorldInfo.openDrawer');
        expect(css).toContain('z-index: 4010;');
        expect(css).toContain('width: 100vw !important;');
        expect(css).toContain('width: 100dvw !important;');
        expect(css).toContain('max-height: calc(100dvh - var(--topBarBlockSize));');
        expect(css).toContain('#WorldInfo.openDrawer #wi-holder');
        expect(css).toContain('overflow-y: auto;');
    });

    test('world info drawer keeps the remaining top menu drawers in the top bar', () => {
        const indexHtml = read('public/index.html');

        expect(getTopSettingsDrawerIds(indexHtml)).toEqual([
            'ai-config-button',
            'sys-settings-button',
            'advanced-formatting-button',
            'WI-SP-button',
            'user-settings-button',
            'backgrounds-button',
            'extensions-settings-button',
            'persona-management-button',
            'rightNavHolder',
        ]);
    });

    test('entry active toggle color is independent from entry state', () => {
        const source = read('public/scripts/world-info.js');
        const css = read('public/css/world-info.css');

        expect(source).toContain('light.addClass(\'wi-status-enabled\');');
        expect(source).not.toContain('light.addClass(\'wi-status-enabled-constant\');');
        expect(source).not.toContain('light.addClass(\'wi-status-enabled-keyword\');');
        expect(css).toContain('.wi-card-active-toggle.wi-status-enabled .wi-card-active-toggle-track');
        expect(css).not.toContain('.wi-card-active-toggle.wi-status-enabled-constant .wi-card-active-toggle-track');
        expect(css).not.toContain('.wi-card-active-toggle.wi-status-enabled-keyword .wi-card-active-toggle-track');
    });

    test('expanded card uses explicit edit affordances and dense content layout', () => {
        const indexHtml = read('public/index.html');
        const css = read('public/css/world-info.css');

        expect(indexHtml).toContain('class="wi-card-title-edit fa-solid fa-pencil"');
        expect(indexHtml).toContain('class="world_entry_thin_controls wi-content-grid flex2"');
        expect(indexHtml).toContain('class="wi-content-open"');
        expect(indexHtml).toContain('class="wi-content-preview is-empty"');
        expect(indexHtml).toContain('class="wi-content-editor-modal" role="dialog" aria-modal="true" aria-labelledby="wi-content-editor-title"');
        expect(indexHtml).toContain('class="wi-content-editor-title" id="wi-content-editor-title"');
        expect(indexHtml).toContain('class="wi-content-editor-meta"');
        expect(indexHtml).toContain('class="wi-content-flags flex-container flexFlowColumn"');
        expect(indexHtml).not.toContain('data-i18n="Content" class="mdhotkey_location"');
        expect(css).toContain('.wi-content-grid');
        expect(css).toContain('.wi-content-open');
        expect(css).toContain('.wi-content-editor-modal');
        expect(css).toContain('body.wi-content-editor-open');
        expect(css).toContain('grid-template-columns: repeat(2, minmax(220px, 1fr));');
        expect(css).toContain('.wi-content-flags .checkbox:hover');
        expect(css).toContain('flex: 1 1 100% !important;');
        expect(css).toContain('.wi-content-editor-panel textarea[name="content"]');
        expect(css).toContain('.world_entry_form_horizontal[name="WIEntryBottomControls"]');
        expect(css).toContain('border-top: 1px solid color-mix(in oklch, var(--SmartThemeBorderColor), transparent 48%);');
        expect(css).not.toContain('grid-template-columns: minmax(0, 1fr) minmax(150px, 0.38fr);');
        expect(css).not.toContain('.wi-accordion {\n    border: 1px solid var(--SmartThemeBorderColor);');
    });

    test('content editor modal is portaled while open to avoid drawer clipping', () => {
        const source = read('public/scripts/world-info.js');

        expect(source).toContain('const contentEditorPlaceholder = $(\'<span class="wi-content-editor-placeholder" hidden></span>\');');
        expect(source).toContain('let contentEditorReturnFocus = null;');
        expect(source).toContain('contentEditorPlaceholder.insertBefore(contentEditor);');
        expect(source).toContain('contentEditor.appendTo(document.body);');
        expect(source).toContain('document.body.classList.add(\'wi-content-editor-open\');');
        expect(source).toContain('document.body.classList.remove(\'wi-content-editor-open\');');
        expect(source).toContain('contentEditor.insertAfter(contentEditorPlaceholder);');
        expect(source).toContain('contentEditorPlaceholder.detach();');
        expect(source).toContain('const contentEditorTitle = editTemplate.find(\'.wi-content-editor-title\');');
        expect(source).toContain('contentEditorTitle.attr(\'id\', `world_entry_content_editor_title_${entry.uid}`);');
        expect(source).toContain('contentEditor.attr(\'aria-labelledby\', `world_entry_content_editor_title_${entry.uid}`);');
        expect(source).toContain('focusableControls[0]?.focus();');
        expect(source).toContain('focusableControls[focusableControls.length - 1]?.focus();');
        expect(source).toContain('$(contentEditorReturnFocus).trigger(\'focus\');');
        expect(source).toContain('if (e.key === \'Escape\')');
    });
});
