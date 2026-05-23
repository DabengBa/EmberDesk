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

describe('prompt manager toolbar', () => {
    test('toolbar icon buttons avoid duplicate Font Awesome glyph layers', () => {
        const template = read('public/scripts/templates/promptManagerFooter.html');
        const toolbarButtonMatches = template.matchAll(/<a class="([^"]*\bpm-toolbar-btn\b[^"]*)"[^>]*>(.*?)<\/a>/g);
        const toolbarButtons = Array.from(toolbarButtonMatches);

        expect(toolbarButtons).toHaveLength(4);

        for (const [, anchorClass, contents] of toolbarButtons) {
            expect(anchorClass).not.toMatch(/\bfa-solid\b/);
            expect(contents).toMatch(/<i class="[^"]*\bfa-solid\b[^"]*"><\/i>/);
            expect(contents).toMatch(/<span class="pm-btn-label"/);
        }
    });

    test('toolbar labels are visually hidden and buttons keep fixed icon dimensions', () => {
        const css = read('public/css/promptmanager.css');

        expect(css).toContain('.completion_prompt_manager_footer .pm-toolbar-btn {');
        expect(css).toContain('width: calc(var(--mainFontSize) * 1.7);');
        expect(css).toContain('flex-wrap: nowrap;');
        expect(css).toContain('#completion_prompt_manager_footer_append_prompt');
        expect(css).toContain('.completion_prompt_manager_footer .pm-toolbar-btn .pm-btn-label');
        expect(css).toContain('clip: rect(0 0 0 0);');
    });
});
