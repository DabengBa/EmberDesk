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
});
