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

function getTagByClass(html, className) {
    const tagPattern = new RegExp(`<[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*"[^>]*>`);
    const match = html.match(tagPattern);
    expect(match).not.toBeNull();
    return match[0];
}

function expectButtonAffordance(tag, label) {
    expect(tag).toMatch(/\brole="button"/);
    expect(tag).toMatch(/\btabindex="0"/);
    expect(tag).toMatch(new RegExp(`\\baria-label="${label}"`));
}

describe('chat workspace structure', () => {
    test('keeps send-form controls discoverable by role and accessible name', () => {
        const indexHtml = read('public/index.html');

        [
            ['options_button', 'Chat options'],
            ['send_but', 'Send message'],
            ['mes_stop', 'Abort request'],
            ['mes_continue', 'Continue last message'],
            ['mes_impersonate', 'Ask AI to write your message'],
        ].forEach(([id, label]) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\brole="button"`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\baria-label="${label}"`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\btabindex="0"`));
        });

        expect(indexHtml).toMatch(/id="send_textarea"[^>]*\baria-label="Chat message"/);
    });

    test('keeps chat options menu items keyboard reachable as buttons', () => {
        const indexHtml = read('public/index.html');

        [
            'option_toggle_AN',
            'option_toggle_CFG',
            'option_toggle_logprobs',
            'option_start_new_chat',
            'option_select_chat',
            'option_delete_mes',
            'option_regenerate',
            'option_impersonate',
            'option_continue',
        ].forEach((id) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\brole="button"`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\btabindex="0"`));
        });
    });

    test('keeps message template DOM identity stable', () => {
        const indexHtml = read('public/index.html');

        const messageRootTag = getTagByClass(indexHtml, 'mes');
        [
            'mesid=""',
            'ch_name=""',
            'is_user=""',
            'is_system=""',
            'bookmark_link=""',
        ].forEach(attribute => expect(messageRootTag).toContain(attribute));

        [
            'id="message_template"',
            'class="mes"',
            'class="swipe_left fa-solid fa-chevron-left"',
            'class="mes_block"',
            'class="mes_buttons"',
            'class="mes_edit_buttons"',
            'class="mes_reasoning_details"',
            'class="mes_reasoning"',
            'class="mes_text"',
            'class="mes_media_wrapper"',
            'class="mes_file_wrapper"',
            'class="mes_bias"',
            'class="swipe_right fa-solid fa-chevron-right"',
            'class="swipes-counter"',
        ].forEach(marker => expect(indexHtml).toContain(marker));

        expect(indexHtml.indexOf('class="mes_reasoning_details"')).toBeLessThan(indexHtml.indexOf('class="mes_text"'));
        expect(indexHtml.indexOf('class="mes_text"')).toBeLessThan(indexHtml.indexOf('class="mes_media_wrapper"'));
        expect(indexHtml.indexOf('class="mes_media_wrapper"')).toBeLessThan(indexHtml.indexOf('class="mes_file_wrapper"'));
        expect(getTagByClass(indexHtml, 'mes_img_swipe_left')).toContain('mes_img_swipe_left');
        expect(getTagByClass(indexHtml, 'mes_img_swipe_right')).toContain('mes_img_swipe_right');
    });

    test('keeps message row actions discoverable by role and accessible name', () => {
        const indexHtml = read('public/index.html');

        [
            ['extraMesButtonsHint', 'Message Actions'],
            ['mes_translate', 'Translate message'],
            ['sd_message_gen', 'Generate Image'],
            ['mes_narrate', 'Narrate'],
            ['mes_prompt', 'Prompt'],
            ['mes_hide', 'Exclude message from prompts'],
            ['mes_unhide', 'Include message in prompts'],
            ['mes_media_gallery', 'Toggle media display style'],
            ['mes_media_list', 'Toggle media display style'],
            ['mes_embed', 'Embed file or image'],
            ['mes_swipe_picker', 'Jump to swipe history'],
            ['mes_create_bookmark', 'Create checkpoint'],
            ['mes_create_branch', 'Create branch'],
            ['mes_copy', 'Copy'],
            ['mes_bookmark', 'Open checkpoint chat'],
            ['mes_edit', 'Edit'],
            ['mes_edit_done', 'Confirm'],
            ['mes_edit_copy', 'Copy this message'],
            ['mes_edit_add_reasoning', 'Add a reasoning block'],
            ['mes_edit_delete', 'Delete this message'],
            ['mes_edit_up', 'Move message up'],
            ['mes_edit_down', 'Move message down'],
            ['mes_edit_cancel', 'Cancel'],
            ['mes_reasoning_edit_done', 'Confirm Edit'],
            ['mes_reasoning_delete', 'Remove reasoning'],
            ['mes_reasoning_edit_cancel', 'Cancel edit'],
            ['mes_reasoning_close_all', 'Collapse all reasoning blocks'],
            ['mes_reasoning_copy', 'Copy reasoning'],
            ['mes_reasoning_edit', 'Edit reasoning'],
            ['swipe_left', 'Previous swipe'],
            ['swipe_right', 'Next swipe'],
            ['mes_img_swipe_left', 'Swipe left'],
            ['mes_img_swipe_right', 'Swipe right'],
        ].forEach(([className, label]) => {
            expectButtonAffordance(getTagByClass(indexHtml, className), label);
        });
    });
});
