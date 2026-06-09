import { describe, expect, test } from '@jest/globals';

import {
    expectButtonAffordance,
    expectContainsMarkers,
    expectDocumentOrder,
    getTagByClass,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

describe('chat workspace structure', () => {
    test('keeps send-form controls discoverable by role and accessible name', () => {
        const indexHtml = readRepoFile('public/index.html');

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
        const indexHtml = readRepoFile('public/index.html');

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
        const indexHtml = readRepoFile('public/index.html');

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
        const indexHtml = readRepoFile('public/index.html');

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
        const indexHtml = readRepoFile('public/index.html');

        const fallbackProviderContract = [
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
        ];
        expectContainsMarkers(indexHtml, fallbackProviderContract, { contractName: 'fallback provider selectors' });

        expectDocumentOrder(indexHtml, [
            'id="openai_reverse_proxy"',
            'id="fallback_provider_section"',
            'id="prompt_post_processing_form"',
        ], { contractName: 'fallback provider drawer order' });

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
        const scriptSource = readRepoFile('public/script.js');
        const styleSource = readRepoFile('public/style.css');

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
        const scriptSource = readRepoFile('public/script.js');
        const lifecycleSource = readRepoFile('public/scripts/chat-generation-lifecycle.js');

        expect(scriptSource).toContain('createGenerationLifecyclePlan({');
        expect(scriptSource).toContain('mainApi: main_api');
        expect(scriptSource).toContain("fallbackProvider: attempt.fallbackProvider");
        expect(scriptSource).toContain('getGenerationFailureDecision({');
        expect(scriptSource).toContain('failureDecision.shouldRestoreAttemptMessage');
        expect(scriptSource).toContain('hasFallbackProviderForGeneration({');
        expect(scriptSource).toContain('clearGenerationAttemptMessage(activeRecoveryMessageId, getGenerationAttemptBaseline(activeRecoveryMessageId));');

        expect(lifecycleSource).toContain("label: 'primary'");
        expect(lifecycleSource).toContain("label: 'primary_retry'");
        expect(lifecycleSource).toContain("label: 'fallback'");
        expect(lifecycleSource).toContain('hasFallbackProviderSettings(settings, secretState, fallbackSecretKey)');
        expect(lifecycleSource).toContain('isMainChatVisibleGeneration({ type, mainApi, dryRun, depth })');
        expect(lifecycleSource).toContain('isRecoverableGenerationFailure(failure)');
    });
});
