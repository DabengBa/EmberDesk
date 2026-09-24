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
    test('toolbar layers: append group, overflow menu, primary new', () => {
        const template = read('public/scripts/templates/promptManagerFooter.html');

        // Append group keeps its select and action IDs.
        expect(template).toContain('id="{{prefix}}prompt_manager_footer_append_prompt"');
        expect(template).toContain('id="prompt-manager-append-prompt"');
        expect(template).toContain('id="prompt-manager-delete-prompt"');
        expect(template).toContain('caution');

        // Low-frequency actions collapse into a ⋮ overflow menu.
        expect(template).toContain('class="pm-footer-menu"');
        expect(template).toContain('id="prompt-manager-more"');
        expect(template).toContain('aria-haspopup="menu"');
        const menuMatch = template.match(/<div class="pm-overflow-menu"[^>]*>([\s\S]*?)<\/div>/);
        expect(menuMatch).not.toBeNull();
        for (const id of ['prompt-manager-import', 'prompt-manager-export', 'prompt-manager-reset-character']) {
            expect(menuMatch[0]).toContain(`id="${id}"`);
        }

        // New is the single labeled primary action.
        expect(template).toContain('id="prompt-manager-new-prompt"');
        expect(template).toContain('pm-primary-btn');
    });

    test('footer bindings use stable IDs, not positional selectors', () => {
        const source = read('public/scripts/PromptManager.js');

        for (const id of ['#prompt-manager-append-prompt', '#prompt-manager-delete-prompt', '#prompt-manager-new-prompt', '#prompt-manager-reset-character', '#prompt-manager-import', '#prompt-manager-export']) {
            expect(source).toContain(`querySelector('${id}')`);
        }
        expect(source).not.toContain("'.menu_button:nth-child");
        expect(source).not.toContain("'.menu_button:last-child'");
    });

    test('overflow menu + popup keyboard/dirty-state contracts stay wired', () => {
        const source = read('public/scripts/PromptManager.js');

        // ⋮ menu toggle/close handlers (document-delegated: footer re-renders).
        expect(source).toContain("'click', '#prompt-manager-more'");
        expect(source).toContain('.pm-overflow-menu');
        // Popup: Esc closes, Ctrl/Cmd+S saves.
        expect(source).toContain("'Escape'");
        expect(source).toContain('ctrlKey');
        // Dirty-field marking + char-count meta on the prompt field.
        expect(source).toContain('pm-field-dirty');
        expect(source).toContain('prompt_manager_popup_entry_form_prompt_meta');
    });

    test('header exposes enabled/listed prompt count chip', () => {
        const template = read('public/scripts/templates/promptManagerHeader.html');
        expect(template).toContain('pm-count-badge');
        expect(template).toContain('{{promptCounts}}');
        const source = read('public/scripts/PromptManager.js');
        expect(source).toContain('promptCounts');
    });

    test('toolbar/menu/chip/dirty CSS anchors exist', () => {
        const css = read('public/css/promptmanager.css');

        expect(css).toContain('#completion_prompt_manager_footer_append_prompt');
        expect(css).toContain('.pm-overflow-menu');
        expect(css).toContain('.pm-overflow-item');
        expect(css).toContain('.pm-primary-btn');
        expect(css).toContain('.pm-count-badge');
        expect(css).toContain('.pm-field-dirty');
        expect(css).toContain('.pm-prompt-meta');
    });
});
