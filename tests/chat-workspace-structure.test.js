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

    test('keeps fallback provider controls embedded in the API configuration drawer', () => {
        const indexHtml = read('public/index.html');

        [
            'id="fallback_provider_section"',
            'id="fallback_provider_enabled"',
            'id="fallback_provider_status"',
            'id="fallback_provider_base_url"',
            'id="fallback_provider_model"',
            'id="fallback_provider_api_key"',
            'id="fallback_provider_api_key_show"',
            'id="fallback_provider_save_key"',
            'id="fallback_provider_clear_key"',
            'id="fallback_provider_cost_warning"',
        ].forEach(marker => expect(indexHtml).toContain(marker));

        expect(indexHtml.indexOf('id="openai_reverse_proxy"')).toBeLessThan(indexHtml.indexOf('id="fallback_provider_section"'));
        expect(indexHtml.indexOf('id="fallback_provider_section"')).toBeLessThan(indexHtml.indexOf('id="prompt_post_processing_form"'));

        expect(indexHtml).not.toMatch(/<dialog[^>]*id="fallback_provider_section"/);
        expect(indexHtml).toMatch(/id="fallback_provider_enabled"[^>]*type="checkbox"/);
        expect(indexHtml).toMatch(/id="fallback_provider_base_url"[^>]*\baria-label="Fallback provider Base URL"/);
        expect(indexHtml).toMatch(/id="fallback_provider_model"[^>]*\bplaceholder="gpt-4.1-mini"/);
        expect(indexHtml).toMatch(/id="fallback_provider_api_key"[^>]*\bautocomplete="off"/);
        expect(indexHtml).toMatch(/id="fallback_provider_status"[^>]*\baria-live="polite"/);
        expect(indexHtml).toMatch(/id="fallback_provider_cost_warning"[^>]*\brole="note"/);

        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_api_key_show'), 'Show fallback API key');
        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_save_key'), 'Save fallback API key');
        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_clear_key'), 'Clear fallback API key');
    });

    test('keeps automatic recovery status scoped outside message text', () => {
        const scriptSource = read('public/script.js');
        const styleSource = read('public/style.css');

        expect(scriptSource).toContain('function showGenerationAutoRecoveryStatus(messageId, status)');
        expect(scriptSource).toContain('function clearGenerationAutoRecoveryStatus(messageId)');
        expect(scriptSource).toContain("const statusRow = $('<div class=\"generation_auto_recovery_status\"");
        expect(scriptSource).toContain('statusRow.attr(\'role\', \'status\');');
        expect(scriptSource).toContain("messageElement.find('.mes_text').after(statusRow);");
        expect(scriptSource).not.toContain("messageElement.find('.mes_text').text(status");
        expect(scriptSource).toContain("messageElement.find('.generation_auto_recovery_status').remove();");
        expect(scriptSource).toContain("messageElement.find('.generation_failure_retry').toggle(!isRecovering);");

        expect(styleSource).toContain('.generation_auto_recovery_status');
        expect(styleSource).toContain('@media (prefers-reduced-motion: reduce)');
    });

    test('routes visible main chat generation through bounded auto recovery attempts', () => {
        const scriptSource = read('public/script.js');

        expect(scriptSource).toContain('function getGenerationAutoRecoveryAttempts()');
        expect(scriptSource).toContain("label: 'primary'");
        expect(scriptSource).toContain("label: 'primary_retry'");
        expect(scriptSource).toContain("label: 'fallback'");
        expect(scriptSource).toContain("fallbackProvider: attempt.fallbackProvider");
        expect(scriptSource).toContain('isRecoverableGenerationFailure(exception)');
        expect(scriptSource).toContain('hasFallbackProviderSettings(oai_settings, secret_state, SECRET_KEYS.OPENAI_FALLBACK)');
        expect(scriptSource).toContain('clearGenerationAttemptMessage(activeRecoveryMessageId);');
    });
});
