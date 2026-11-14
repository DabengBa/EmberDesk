import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

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
    test('switching books clears search through the command that restores the saved sort', () => {
        const source = read('public/scripts/world-info.js');
        const selection = source.slice(source.indexOf('export async function selectWorldInfoEditorName('), source.indexOf('export async function selectWorldInfoEditorIndex('));
        expect(selection).toContain("applyWorldInfoSearchQuery('')");
    });
    test('selection-dependent confirmation commands check their original selection after awaiting', () => {
        const source = read('public/scripts/world-info-editor-ui.js');
        const sorting = source.slice(source.indexOf('async function promptApplyWorldInfoCurrentSorting()'), source.indexOf('async function bulkDeleteWorldInfoEntries('));
        const deletion = source.slice(source.indexOf('async function bulkDeleteWorldInfoEntries('), source.indexOf('async function bulkSetWorldInfoEntriesEnabled('));
        expect(sorting).toMatch(/captureSelectionGuard\(\)[\s\S]*await showLocalDialog[\s\S]*!isCurrent\(\)[\s\S]*session\.applySortingAsOrder/);
        expect(deletion).toMatch(/captureSelectionGuard\(\)[\s\S]*await showLocalDialog[\s\S]*!isCurrent\(\)[\s\S]*session\.deleteEntries/);
    });
    test('React owns entry list rather than the retired DOM renderer', () => {
        const source = read('public/scripts/world-info.js');
        const workbench = read('app/world-info-workbench.tsx');
        expect(source).not.toContain('displayWorldEntries');
        expect(workbench).toContain('data-world-info-react-entry={entry.uid}');
    });

    test('retired card renderer and form bindings are absent', () => {
        const source = read('public/scripts/world-info.js');
        expect(source).not.toContain('createWorldEntryCard');
        expect(source).not.toContain('setupEditFormBindings');
        expect(source).not.toContain('renderCollapsedCard');
    });

    test('React renders the editable entry instead of a legacy form', () => {
        const source = read('public/scripts/world-info.js');
        const workbench = read('app/world-info-workbench.tsx');
        expect(source).not.toContain('export async function getWorldEntry');
        expect(workbench).toContain('data-world-info-react-editor="active"');
        expect(workbench).toContain('data-world-info-react-field="content"');
    });

    test('more menu opener and items support keyboard operation', () => {
        const panelHtml = read('public/panels/world-info-body.html');
        const source = read('public/scripts/world-info-panel-ui.js');

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
        expect(source).not.toContain('worldEntriesList.find(');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-entry-toggle');
    });

    test('React owns global activation separately from editor selection', () => {
        const selector = read('app/components/panels/WorldInfoGlobalSelector.tsx');
        const mirror = read('app/components/panels/WorldInfoEditorMirror.tsx');
        const workbench = read('app/world-info-workbench.tsx');
        const html = read('public/panels/world-info-body.html');
        expect(selector).toContain('id="world_info"');
        expect(selector).toContain('id="wiGlobalCount"');
        expect(selector).toContain('useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)');
        expect(selector).toContain('type="checkbox"');
        expect(selector).toContain('runtime.setGlobalActiveNames(');
        expect(selector).toContain('runtime.selectEditorName(name)');
        expect(workbench).toContain('<WorldInfoGlobalSelector runtime={bridgeState.selectorRuntime} />');
        expect(mirror).toContain('id="world_editor_select" hidden');
        expect(html).toContain('id="world_info_editor_mirror_host"');
    });

    test('global selector replay has no Select2 or DOM-authority path', () => {
        for (const file of ['public/scripts/world-info.js', 'public/scripts/world-info-panel-ui.js', 'public/scripts/world-info-book-sync.js']) {
            const source = read(file);
            expect(source).not.toContain('.select2(');
            expect(source).not.toContain('change.select2');
            expect(source).not.toContain("$('#world_info')");
            expect(source).not.toContain("$('#world_editor_select')");
        }
    });

    test('empty editor state makes new-entry prerequisite visible', () => {
        const panelHtml = read('public/panels/world-info-body.html');
        const workbench = read('app/world-info-workbench.tsx');

        expect(panelHtml).toContain('data-i18n="[title]Create or select a World Info file first"');
        expect(workbench).toContain('disabled={!bridgeState.canCreateEntry}');
    });

    test('React global selector uses translated controls instead of Select2 language callbacks', () => {
        const source = read('app/components/panels/WorldInfoGlobalSelector.tsx');
        expect(source).toContain("translate('Select global World Info')");
        expect(source).toContain("translate('Clear all')");
        expect(source).toContain("translate('No matching World Info.')");
        expect(read('public/scripts/world-info-panel-ui.js')).not.toContain('getWorldInfoSelect2Language');
    });

    test('world info panel rehydrates selected editor after drawer remount', () => {
        const source = read('public/scripts/world-info.js');
        const rehydrateStart = source.indexOf('export function rehydrateWorldInfoPanel');
        const rehydrateEnd = source.indexOf('export async function reloadEditor', rehydrateStart);
        const rehydrateSource = source.slice(rehydrateStart, rehydrateEnd);

        expect(rehydrateStart).toBeGreaterThanOrEqual(0);
        expect(rehydrateEnd).toBeGreaterThan(rehydrateStart);
        expect(rehydrateSource).toContain('syncWorldInfoSettingsUi();');
        expect(rehydrateSource).toContain('void mountWorldInfoEditorMirror();');
        expect(rehydrateSource).toContain('Array.isArray(world_names) && world_names.includes(selectedName)');
        expect(rehydrateSource).toContain('void showWorldEditor(selectedName);');
        expect(rehydrateSource).toContain('resetEmptyEditor = true');
        expect(rehydrateSource).toContain('} else if (resetEmptyEditor) {');
        expect(rehydrateSource).toContain('void hideWorldEditor();');
    });

    test('opening world info closes unpinned drawers while retaining pinned ones', async () => {
        const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-domain.ts');
        const drawers = [
            { id: 'WorldInfo', open: false, pinned: false },
            { id: 'right-nav-panel', open: true, pinned: false },
            { id: 'left-nav-panel', open: true, pinned: true },
        ];
        const service = createWorkspaceDrawerService({ get: id => drawers.find(drawer => drawer.id === id), list: () => drawers, read: () => null, write: () => {}, notify: () => {} });
        await service.open('WorldInfo');
        expect(drawers.map(drawer => drawer.open)).toEqual([true, false, true]);
        service.close('WorldInfo');
        service.setPinned('right-nav-panel', true);
        drawers[1].open = true;
        await service.open('WorldInfo');
        expect(drawers.map(drawer => drawer.open)).toEqual([true, true, true]);
    });

    test('world book deletion confirmations default to cancel and mark destructive actions', () => {
        const source = read('public/scripts/world-info-book-ui.js');
        const deleteSource = source.slice(
            source.indexOf('async function deleteWorldInfoWithCascade'),
            source.indexOf('async function deleteCurrentWorldInfo'),
        );

        expect(deleteSource).toContain("initialFocus: 'cancel'");
        expect(deleteSource).toContain("id: 'cancel', label: t`Cancel`");
        expect(deleteSource).toContain("id: 'delete', label: t`Delete`, variant: 'destructive'");
        expect(deleteSource).toContain("id: 'all', label: t`Delete ${worldInfos.length} linked world book(s)`, variant: 'destructive'");
        expect(deleteSource).toContain('This action is irreversible!');
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

        // sys-settings-button hosted the retired rm_api_block drawer,
        // advanced-formatting-button hosted the retired AdvancedFormatting
        // drawer, ai-config-button hosted the retired AI Response
        // Configuration drawer, and user-settings-button hosted the
        // user-settings drawer merged into Settings; all four are gone.
        // settings-panel-button is the legacy icon entry for the React
        // SettingsPanel drawer.
        expect(getTopSettingsDrawerIds(indexHtml)).toEqual([
            'WI-SP-button',
            'settings-panel-button',
            'regex-panel-button',
            'leftNavHolder',
            'rightNavHolder',
        ]);
    });

    test('entry active toggle color is independent from entry state', () => {
        const source = read('public/scripts/world-info.js');
        const css = read('public/css/world-info.css');

        expect(read('app/world-info-workbench.tsx')).toContain('const enabled = enabledOverride ?? !entry.disabled;');
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
        expect(indexHtml).not.toContain('data-i18n="Content" class="mdhotkey_location"');
        expect(css).toContain('.wi-content-grid');
        expect(css).toContain('.wi-content-open');
        expect(css).toContain('.wi-content-editor-modal');
        expect(css).toContain('body.wi-content-editor-open');
        expect(css).toContain('flex: 1 1 100% !important;');
        expect(css).toContain('.wi-content-editor-panel textarea[name="content"]');
        expect(css).toContain('.world_entry_form_horizontal[name="WIEntryBottomControls"]');
        expect(css).toContain('border-top: 1px solid color-mix(in oklch, var(--SmartThemeBorderColor), transparent 48%);');
        expect(css).not.toContain('grid-template-columns: minmax(0, 1fr) minmax(150px, 0.38fr);');
        expect(css).not.toContain('.wi-accordion {\n    border: 1px solid var(--SmartThemeBorderColor);');
    });

    test('content remains editable in the React workbench', () => {
        const source = read('app/world-info-workbench.tsx');
        expect(source).toContain('data-world-info-react-field="content"');
        expect(source).toContain('translate(\'Injected content\')');
    });

    test('world info workbench keeps editor panel inside wi-holder with explicit containment', () => {
        const panelTsx = read('app/components/panels/WorldInfoPanel.tsx');
        const wiHolderOpen = panelTsx.indexOf('id="wi-holder"');
        const wiEditorOpen = panelTsx.indexOf('id="wiEditorPanel"');
        const wiHolderCloseAfterEditor = panelTsx.indexOf('</div>', panelTsx.indexOf('id="world_popup"'));

        expect(wiHolderOpen).toBeGreaterThanOrEqual(0);
        expect(wiEditorOpen).toBeGreaterThan(wiHolderOpen);

        const betweenHolderAndEditor = panelTsx.slice(wiHolderOpen, wiEditorOpen);
        // The global selector belongs to the visible React workbench, not this inert shell.
        expect(betweenHolderAndEditor).not.toContain('id="wiGlobalPanel"');
        expect(betweenHolderAndEditor).not.toMatch(/id="wi-holder"[\s\S]*<\/div>\s*<section id="wiEditorPanel"/);

        const afterEditorStart = panelTsx.slice(wiEditorOpen, wiEditorOpen + 2500);
        expect(afterEditorStart).toContain('id="world_popup"');
        expect(afterEditorStart.indexOf('</section>')).toBeGreaterThan(-1);
        // editor section closes, then wi-holder closes
        const editorSectionClose = afterEditorStart.indexOf('</section>');
        const holderClose = afterEditorStart.indexOf('</div>', editorSectionClose);
        expect(holderClose).toBeGreaterThan(editorSectionClose);
    });

    test('react world info host becomes sole visible owner and hides legacy workbench children', () => {
        const script = read('public/script.js');
        const css = read('public/css/world-info.css');
        const bridge = read('public/scripts/workspace-panels-react-bridge.js');

        expect(bridge).not.toContain('groupAuthoring');
        expect(bridge).toContain('worldInfo: true');
        expect(script).toContain('function hideLegacyWorldInfoWorkbench(hidden');
        expect(script).toContain("workbench.dataset.worldInfoVisibleOwner = hidden ? 'react' : 'legacy'");
        expect(script).toContain('legacyWorldInfoHiddenByReact');
        expect(script).toContain("setAttribute('inert'");
                expect(script).toContain('// Sole-owner: never re-enable the legacy workbench editor.');
        expect(script).toContain('// Sole-owner: React host owns the workbench; legacy editor stays hidden/inert.');
        expect(script).not.toContain('revealGlobalPanel');
        expect(script).not.toContain('setWorldInfoActivationRulesVisible');
        expect(script).toContain("const workbench = document.getElementById('wi-holder')");
        expect(script).toContain('hostParent.prepend(host)');
        expect(script).toContain("host.setAttribute('data-doc-id', 'feature.world_info_panel')");
        expect(css).toContain('.wi-workbench.wi-workbench-react-owned');
        expect(css).toContain('[data-legacy-world-info-hidden-by-react="true"]');
        expect(css).toContain('#WorldInfo.openDrawer #wi-holder.wi-workbench-react-owned');
    });

});
