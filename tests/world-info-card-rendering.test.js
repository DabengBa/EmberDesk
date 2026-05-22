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
