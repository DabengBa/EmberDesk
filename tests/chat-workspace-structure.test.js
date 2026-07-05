import { describe, expect, test } from '@jest/globals';

import {
    expectButtonAffordance,
    expectContainsMarkers,
    expectDocumentOrder,
    getTagByClass,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

describe('chat workspace structure', () => {
    test('keeps the first-paint preloader visible before startup scripts run', () => {
        const indexHtml = readRepoFile('public/index.html');
        const loaderCss = readRepoFile('public/css/loader.css');

        expect(indexHtml).toMatch(/id="preloader"[^>]*\brole="status"[^>]*\baria-live="polite"[^>]*\baria-busy="true"/);
        expect(indexHtml).toContain('class="preloader-content"');
        expect(indexHtml).toContain('class="preloader-logo"');
        expect(indexHtml).toContain('class="preloader-spinner fa-solid fa-gear fa-spin"');
        expect(indexHtml).toContain('class="preloader-message"');
        expect(indexHtml).toContain('Initializing…');
        expect(loaderCss).toContain('#preloader,');
        expect(loaderCss).toContain('.preloader-content');
        expect(loaderCss).toContain('max-width: min(320px, calc(100vw - 3rem));');
        expect(loaderCss).toContain('overflow-wrap: anywhere;');
    });

    test('keeps same-entry shell takeover diagnostics hidden from the visible workspace', () => {
        const scriptSource = readRepoFile('public/script.js');

        expectContainsMarkers(scriptSource, [
            'WORKSPACE_SHELL_TAKEOVER_MARKER_ID',
            'marker.hidden = true;',
            'data-react-workspace-shell-takeover-status',
            'data-react-workspace-shell-takeover-reason',
            'publishWorkspaceShellTakeoverDiagnostic();',
        ], { contractName: 'same-entry shell takeover diagnostic marker' });
        expect(scriptSource).not.toContain('workspace-next');
        expect(scriptSource).not.toContain('/workspace-next');
    });

    test('mounts React workspace chrome without hiding protected drawer contents', () => {
        const scriptSource = readRepoFile('public/script.js');
        const styleSource = readRepoFile('public/style.css');

        expectContainsMarkers(scriptSource, [
            'WORKSPACE_SHELL_CHROME_HOST_ID',
            'ensureWorkspaceShellChromeHost',
            'LEGACY_WORKSPACE_CHROME_SELECTOR',
            '#top-bar, #ai-config-button > .drawer-toggle, #advanced-formatting-button > .drawer-toggle, #user-settings-button > .drawer-toggle, .drawer-opener[data-target="rightNavHolder"], .drawer-opener[data-target="extensions-settings-button"]',
            'data-react-workspace-shell-chrome-status',
            'data-legacy-workspace-chrome-hidden-by-react',
            'openWorkspaceShellDrawer',
            "case 'openAIConfig':",
            "await openWorkspaceShellDrawer('left-nav-panel');",
            "case 'openFormatting':",
            "await openWorkspaceShellDrawer('AdvancedFormatting');",
            'if (getWorkspaceReactFeatures()?.reactPages?.settings)',
            "await openWorkspaceShellDrawer('user-settings-block');",
        ], { contractName: 'same-entry React workspace chrome host' });
        expect(scriptSource).not.toContain('#top-settings-holder > .drawer > .drawer-toggle');
        expect(scriptSource).not.toContain('#top-settings-holder[hidden]');
        expect(scriptSource).not.toContain('document.getElementById(\'top-settings-holder\').hidden = true');
        expect(scriptSource).not.toContain('workspace-next');
        expect(styleSource).toContain('#emberdesk-react-workspace-shell-chrome-host');
        expect(styleSource).toContain('.react-workspace-shell-chrome');
        expect(styleSource).toContain('.react-workspace-shell-nav-button[data-workspace-shell-panel-active="true"]');
        expect(styleSource).toContain('.react-workspace-panel-dock-status');
        expect(styleSource).toContain('body[data-react-workspace-shell-chrome="mounted"] .react-workspace-panel-dock-status');
        expect(styleSource).toContain('body[data-react-workspace-shell-chrome="mounted"] .drawer-opener[data-target="rightNavHolder"]');
        expect(styleSource).toContain('body[data-react-workspace-shell-chrome="mounted"] .drawer-opener[data-target="extensions-settings-button"]');
    });

    test('lets React own main-chat outer layout without wrapping protected rows', () => {
        const workspacePanelSource = readRepoFile('app/workspace-panels.tsx');
        const styleSource = readRepoFile('public/style.css');

        expectContainsMarkers(workspacePanelSource, [
            'syncMainChatLayoutShellDom(',
            'chatContainer.dataset.mainChatLayoutOwner = \'react\';',
            'sendForm.dataset.mainChatLayoutOwner = \'react\';',
            'data-main-chat-layout-owner="react"',
            'data-main-chat-local-status=',
        ], { contractName: 'React main-chat layout shell' });
        expect(workspacePanelSource).toContain("messageRow.parentElement?.id !== 'chat'");
        expect(workspacePanelSource).not.toContain('chatContainer.appendChild(messageRow');
        expect(styleSource).toContain('body[data-react-workspace-shell-chrome="mounted"] #chat[data-main-chat-layout-owner="react"]');
        expect(styleSource).toContain('#send_form[data-main-chat-layout-owner="react"]');
        expect(styleSource).toContain('#nonQRFormItems[data-main-chat-layout-owner="react"]');
        expect(styleSource).toContain('.react-main-chat-local-actions');
        expect(styleSource).toContain('.react-main-chat-local-actions .menu_button');
        expect(styleSource).toContain('.react-main-chat-local-status {');
        expect(styleSource).toContain('pointer-events: none;');
        expect(styleSource).toContain('.react-main-chat-local-status .react-main-chat-local-actions {');
        expect(styleSource).toContain('pointer-events: auto;');
        expect(styleSource).toContain('inset-block-end: calc(100% + 6px);');
        expect(styleSource).toContain('.workspace-panel-status-badge');
        expect(styleSource).toContain('.workspace-panel-legacy-slot-status');
        expect(styleSource).toContain('var(--error-color, var(--ember-red))');
        expect(styleSource).not.toContain('var(--error-red)');
    });

    test('keeps send-form controls discoverable by role and accessible name', () => {
        const indexHtml = readRepoFile('public/index.html');
        const scriptSource = readRepoFile('public/script.js');
        const keyboardSource = readRepoFile('public/scripts/keyboard.js');

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
        expect(indexHtml).toMatch(/id="send_textarea"[^>]*\baria-describedby="send_textarea_hint"/);
        expect(indexHtml).toContain('id="send_textarea_hint"');
        expect(indexHtml).toContain('data-i18n="Type /? for commands. Send requires an API connection."');
        expect(scriptSource).toContain("const sendTextareaHint = $('#send_textarea_hint');");
        expect(scriptSource).toContain('sendTextareaHint.text(t`Type /? for commands. Send requires an API connection.`);');
        expect(scriptSource).toContain('sendTextareaHint.text(t`Type /? for commands.`);');
        expect(keyboardSource).toContain("'.mes_stop', // Stop button in the chat bar");
        expect(keyboardSource).toContain("event.key === 'Enter' || event.key === ' '");
        expect(keyboardSource).toContain("event.key === ' '");
        expect(keyboardSource).toContain('event.preventDefault();');
        expect(keyboardSource).toContain('target.click();');
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

    test('refreshes React main-chat snapshots after async media attachments render', () => {
        const scriptSource = readRepoFile('public/script.js');

        expectContainsMarkers(scriptSource, [
            'Promise.race([Promise.all(mediaPromises), delay(debounce_timeout.short)]).then(() => {',
            'mediaWrapper.empty().append(mediaBlocks);',
            'void mountReactMainChatMessageListPanel();',
        ]);
        const appendIndex = scriptSource.indexOf('mediaWrapper.empty().append(mediaBlocks);');
        const refreshIndex = scriptSource.indexOf('void mountReactMainChatMessageListPanel();', appendIndex);
        expect(refreshIndex).toBeGreaterThan(appendIndex);
    });

    test('keeps reasoning header toggle explicit for React-owned message rows', () => {
        const reasoningSource = readRepoFile('public/scripts/reasoning.js');

        expectContainsMarkers(reasoningSource, [
            "$(document).on('click', '.mes_reasoning_header', function (e) {",
            'e.preventDefault();',
            "const wasOpen = details.prop('open') === true;",
            'details.prop(\'open\', !wasOpen);',
        ]);
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

        expect(indexHtml).toMatch(/class="[^"]*\bmes_edit_cancel\b[^"]*"[^>]*\bdata-action="cancel-edit"/);
    });

    test('keeps fallback provider controls embedded in the API configuration drawer', () => {
        const indexHtml = readRepoFile('public/index.html');
        const scriptSource = readRepoFile('public/scripts/openai.js');
        const styleSource = readRepoFile('public/style.css');

        const fallbackProviderContract = [
            'id="fallback_provider_section"',
            'id="fallback_provider_enabled"',
            'id="fallback_provider_status"',
            'class="fallback-provider-details"',
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
        expect(indexHtml).toMatch(/<select id="chat_completion_source">/);
        expect(indexHtml).not.toMatch(/<select id="chat_completion_source"[^>]*data-source/);
        expect(scriptSource).not.toContain("$(this).attr('data-source', oai_settings.chat_completion_source);");
        expect(scriptSource).toContain("$('[data-source]').each(function () {");
        expect(indexHtml).toMatch(/<div class="base-url-field wide100p"[^>]*data-source="openai,claude,makersuite">[\s\S]*<label class="chat-completion-field wide100p"[^>]*for="openai_reverse_proxy"/);
        expect(indexHtml).toMatch(/id="openai_reverse_proxy"[^>]*\baria-describedby="base_url_status"/);
        expect(indexHtml).toMatch(/id="base_url_status"[^>]*\brole="status"[^>]*\baria-live="polite"[^>]*\bdata-mode="direct"/);
        expect(scriptSource).toContain('function updateBaseUrlStatus()');
        expect(scriptSource).toContain(".attr('data-mode', hasCustomEndpoint ? 'custom' : 'direct')");
        expect(scriptSource).toContain('Custom endpoint active. API key field stores proxy password.');
        expect(styleSource).toContain('.base-url-status[data-mode="custom"]');
        expect(indexHtml).toMatch(/<div class="fallback-provider-details">[\s\S]*id="fallback_provider_base_url"/);
        expect(indexHtml).toMatch(/id="fallback_provider_base_url"[^>]*\baria-label="Fallback provider Base URL"/);
        expect(indexHtml).toMatch(/id="fallback_provider_model"[^>]*\bplaceholder="gpt-4.1-mini"/);
        expect(indexHtml).toMatch(/id="fallback_provider_api_key"[^>]*\bautocomplete="off"/);
        expect(indexHtml).toMatch(/id="fallback_provider_status"[^>]*\baria-live="polite"/);
        expect(indexHtml).toMatch(/id="fallback_provider_cost_warning"[^>]*\brole="note"/);
        expect(indexHtml).toMatch(/id="test_api_button"[^>]*class="[^"]*\bapi_button\b/);
        expect(scriptSource).toContain(".attr('data-state', status.state)");
        expect(styleSource).toContain('.fallback-provider-status[data-state="ready"]');
        expect(styleSource).toContain('.fallback-provider-status[data-state="needs_setup"]');
        expect(styleSource).toContain('.fallback-provider-status[data-state="disabled"]');

        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_api_key_show'), 'Show fallback API key');
        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_save_key'), 'Save fallback API key');
        expectButtonAffordance(getTagByClass(indexHtml, 'fallback_provider_clear_key'), 'Clear fallback API key');

        expect(styleSource).toContain('.fallback-provider-section:not(:has(#fallback_provider_enabled:checked)) .fallback-provider-details');
        expect(styleSource).toContain('.fallback-provider-section:has(#fallback_provider_enabled:checked) .fallback-provider-details');
    });

    test('keeps automatic recovery status scoped outside message text', () => {
        const scriptSource = readRepoFile('public/script.js');
        const styleSource = readRepoFile('public/style.css');

        expect(scriptSource).toContain("function showGenerationAutoRecoveryStatus(messageId, status, recoveryStage = 'primary')");
        expect(scriptSource).toContain('function clearGenerationAutoRecoveryStatus(messageId)');
        expect(scriptSource).toContain("const statusRow = $('<div class=\"generation_auto_recovery_status\"");
        expect(scriptSource).toContain('statusRow.attr(\'role\', \'status\');');
        expect(scriptSource).toContain("statusRow.attr('data-recovery-stage', recoveryStage === 'fallback' ? 'fallback' : 'primary');");
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
