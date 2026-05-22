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
        const createCardEnd = source.indexOf('/**\n * Builds the edit form', createCardStart);
        const createCardSource = source.slice(createCardStart, createCardEnd);

        expect(createCardStart).toBeGreaterThanOrEqual(0);
        expect(createCardEnd).toBeGreaterThan(createCardStart);
        expect(createCardSource).not.toContain('let built = false');
        expect(createCardSource).not.toContain('if (built) return;');
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
        expect(indexHtml).toContain('data-i18n="Activation Rules"');
        expect(indexHtml).toContain('id="wiEditorPanel"');
        expect(indexHtml).toContain('data-i18n="World Info Editor"');
        expect(indexHtml).toContain('id="wiTopBlock" class="wi-global-grid inline-drawer wide100p"');
        expect(indexHtml).toContain('class="inline-drawer-content wi-global-rules-content"');
        expect(panelHtml).toContain('id="world_editor_select"');
        expect(css).toContain('.wi-global-grid');
        expect(css).toContain('.wi-global-rules-content');
        expect(css).toContain('grid-column: 1 / -1;');
        expect(css).toContain('.wi-settings-toggle');
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
        expect(indexHtml).toContain('class="wi-content-editor-modal"');
        expect(indexHtml).toContain('class="wi-content-editor-meta"');
        expect(indexHtml).toContain('class="wi-content-flags flex-container flexFlowColumn"');
        expect(indexHtml).not.toContain('data-i18n="Content" class="mdhotkey_location"');
        expect(css).toContain('.wi-content-grid');
        expect(css).toContain('.wi-content-open');
        expect(css).toContain('.wi-content-editor-modal');
        expect(css).toContain('grid-template-columns: repeat(2, minmax(220px, 1fr));');
        expect(css).toContain('.wi-content-flags .checkbox:hover');
        expect(css).toContain('flex: 1 1 100% !important;');
        expect(css).toContain('.wi-content-editor-panel textarea[name="content"]');
        expect(css).toContain('.world_entry_form_horizontal[name="WIEntryBottomControls"]');
        expect(css).toContain('border-top: 1px solid color-mix(in oklch, var(--SmartThemeBorderColor), transparent 48%);');
        expect(css).not.toContain('grid-template-columns: minmax(0, 1fr) minmax(150px, 0.38fr);');
        expect(css).not.toContain('.wi-accordion {\n    border: 1px solid var(--SmartThemeBorderColor);');
    });
});
