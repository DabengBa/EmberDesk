import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
    collectGenericReactDispatchViolations,
    collectReactRuntimeBoundaryViolations,
    repoRoot,
} from './helpers/react-runtime-boundary-contract.js';

describe('React runtime boundary', () => {
    test('keeps legacy globals, events, context reads, and runtime providers outside app/', () => {
        expect(collectReactRuntimeBoundaryViolations()).toEqual([]);
    });

    test('uses named React surface commands instead of generic action dispatch', () => {
        expect(collectGenericReactDispatchViolations()).toEqual([]);
    });

    test('narrows main-chat generation commands to supported operations', () => {
        const commandsSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'compat', 'workspace-commands.ts'),
            'utf8',
        );

        expect(commandsSource).toContain(
            "export type MainChatGenerationKind = 'submitComposer' | 'continueLast' | 'retryGeneration' | 'swipeLeft' | 'swipeRight';",
        );
        expect(commandsSource).toContain('kind: MainChatGenerationKind;');
        expect(commandsSource).not.toContain('export interface MainChatGenerationCommand {\n    kind: string;');
    });

    test('keeps main-chat React state and rendering data-driven', () => {
        const workspaceSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'workspace-panels.tsx'),
            'utf8',
        );
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const stateBlock = workspaceSource.match(
            /interface MainChatMessageListWorkspacePanelState \{[\s\S]*?\n\}/,
        )?.[0] ?? '';
        const panelBlock = workspaceSource.match(
            /function MainChatMessageListWorkspacePanel\([\s\S]*?\n\}\n\nfunction /,
        )?.[0] ?? '';
        const bridgeStateBlock = scriptSource.match(
            /function getMainChatMessageListReactBridgeState\(\) \{[\s\S]*?\n\}\n\nfunction getMainChatMessageListReactCommands/,
        )?.[0] ?? '';

        expect(stateBlock).not.toMatch(/\bHTMLElement\b|\bmessageNodes\b|\brichBodySnapshots\b|\bmessageActionSnapshots\b/);
        expect(panelBlock).toContain('<MainChatMessageRow');
        expect(panelBlock).toContain('mainChatStoreSnapshot.messagesById');
        expect(panelBlock).toContain('event.stopPropagation();');
        expect(panelBlock).not.toContain('createPortal');
        expect(panelBlock).not.toMatch(/\bHTMLElement\b|\bquerySelector(?:All)?\b|\bmessageNodes\b/);
        expect(bridgeStateBlock).toContain('buildMainChatSnapshotFromLegacyChat({');
        expect(bridgeStateBlock).not.toMatch(/querySelector(?:All)?|buildMainChatRichBodySnapshot|messageNodes|richBodySnapshots|messageActionSnapshots|innerHTML/);
        expect(scriptSource).not.toContain('function buildMainChatRichBodySnapshot(');
    });

    test('keeps React-owned main-chat lifecycle writes out of legacy message DOM', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );

        expect(scriptSource).toContain('messageUiById: getMainChatMessageUiStateById()');
        expect(scriptSource).toContain('function setMainChatMessageUiState(');
        expect(scriptSource).toContain('if (isReactMainChatOwner()) {');
        expect(scriptSource).toContain('mainChatMessageUiState');

        const generationSession = scriptSource.match(
            /class GenerationStreamSession \{[\s\S]*?\n\}\n\n\/\*\*\n \* Constructs a prompt/,
        )?.[0] ?? '';
        expect(generationSession).toContain('if (isReactMainChatOwner())');
        const generationGuard = generationSession.match(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?return;\n        \}/,
        )?.[0] ?? '';
        expect(generationGuard).toContain('return;');
        expect(generationGuard).not.toContain('this.messageTextDom.innerHTML');
        expect(generationGuard).not.toContain('this.messageTimerDom.textContent');

        const appendMediaBlock = scriptSource.match(
            /export function appendMediaToMessage\([\s\S]*?\n\}\n\nexport function addCopyToCodeBlocks/,
        )?.[0] ?? '';
        expect(appendMediaBlock).toMatch(
            /if \(isReactMainChatOwner\(\)\) \{\s*scheduleMainChatMessageListPanelRefresh\(\);\s*return;/,
        );

        const recoveryBlock = scriptSource.match(
            /function clearGenerationAutoRecoveryStatus[\s\S]*?export async function printMessages/,
        )?.[0] ?? '';
        expect(recoveryBlock).toContain('setMainChatMessageUiState');
        expect(recoveryBlock.indexOf('return;')).toBeLessThan(recoveryBlock.indexOf('const messageElement'));
        expect(recoveryBlock).toContain("messageElement.find('.mes_text').after");
        expect(recoveryBlock).toContain("messageElement.find('.mes_buttons').append");

        const editorBlock = scriptSource.match(
            /export async function messageEdit\([\s\S]*?async function messageEditDone/,
        )?.[0] ?? '';
        expect(editorBlock).toContain('if (isReactMainChatOwner())');
        expect(scriptSource).toContain('function startMainChatMessageEdit(');
        expect(scriptSource).toContain('function updateMainChatMessageEdit(');
        expect(scriptSource).toContain('async function commitMainChatMessageEdit(');
        expect(scriptSource).toContain('async function cancelMainChatMessageEdit(');
        expect(editorBlock.indexOf('return;')).toBeLessThan(editorBlock.indexOf('const messageElement'));
    });

    test('does not let legacy retry delegation re-fire React-owned generation commands', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const retryHandler = scriptSource.match(
            /\$\(document\)\.on\('click keydown', '\.generation_failure_retry', function \(event\) \{[\s\S]*?\n    \}\);/,
        )?.[0] ?? '';

        expect(retryHandler).toContain(
            "if (isReactMainChatOwner() && $(this).closest('[data-main-chat-message-row-owner=\"react\"]').length > 0) {",
        );
        expect(retryHandler.indexOf('return;')).toBeLessThan(retryHandler.indexOf("$('#option_regenerate').trigger('click');"));
    });

    test('keeps React-owned swipe transitions data-driven instead of reading message DOM', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const reactSwipeStart = scriptSource.indexOf(
            'if (isReactMainChatOwner()) {\n        return runReactMainChatSwipe();',
        );
        const reactSwipeEnd = scriptSource.indexOf(
            '\n    if ([SWIPE_SOURCE.DELETE',
            reactSwipeStart,
        );
        const reactSwipeBlock = reactSwipeStart >= 0 && reactSwipeEnd > reactSwipeStart
            ? scriptSource.slice(reactSwipeStart, reactSwipeEnd)
            : '';

        expect(reactSwipeBlock).toContain('syncSwipeToMes');
        expect(reactSwipeBlock).toContain('void mountReactMainChatMessageListPanel();');
        expect(reactSwipeBlock).not.toMatch(/querySelector|closest\('\.mes'\)|\.mes_text|innerHTML|scrollHeight/);
    });

    test('projects swipe visibility semantics into React message rows', () => {
        const projectionSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'scripts', 'main-chat-store-projection.js'),
            'utf8',
        );
        const rowSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'components', 'main-chat', 'MainChatMessageRow.tsx'),
            'utf8',
        );

        expect(projectionSource).toContain('swipesVisible');
        expect(projectionSource).toContain('lastSwipe');
        expect(rowSource).toContain("...(message.swipesVisible ? ['swipes_visible'] : [])");
        expect(rowSource).toContain("...(message.lastSwipe ? ['last_swipe'] : [])");
    });

    test('keeps React-owned context and swipe controls in the snapshot path', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const contextBlock = scriptSource.match(
            /function setInContextMessages\([\s\S]*?\n\}\n\n\/\*\*\n \* @typedef \{object\} AdditionalRequestOptions/,
        )?.[0] ?? '';
        const refreshBlock = scriptSource.match(
            /export function refreshSwipeButtons\([\s\S]*?\n\}\n\/\*\*\n \* This function is misleadingly named/,
        )?.[0] ?? '';
        const reactContextBranch = contextBlock.match(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?return;\n    \}/,
        )?.[0] ?? '';
        const reactRefreshBranch = refreshBlock.match(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?return;\n    \}/,
        )?.[0] ?? '';

        expect(reactContextBranch).toContain('if (isReactMainChatOwner())');
        expect(reactContextBranch).toContain("setMainChatMessageUiState(lastMessageId, { lastInContext: true });");
        expect(reactContextBranch).not.toContain("chatElement.find('.mes').removeClass('lastInContext')");
        expect(reactRefreshBranch).toContain('if (isReactMainChatOwner())');
        expect(reactRefreshBranch).not.toContain("chatElement.children('.mes[mesid]')");
    });

    test('moves React-owned messages without reading legacy message DOM', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const moveBlock = scriptSource.match(
            /async function messageEditMove\(sourceId, targetId\) \{[\s\S]*?\n\}\n\nasync function messageEditDone/,
        )?.[0] ?? '';
        const reactMoveBranch = moveBlock.match(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?\n    \}/,
        )?.[0] ?? '';

        expect(reactMoveBranch).toContain('chat[sourceId], chat[targetId]');
        expect(reactMoveBranch).toContain('swapItemizedPrompts(sourceId, targetId);');
        expect(reactMoveBranch).toContain('await saveChatConditional();');
        expect(reactMoveBranch).toContain('void mountReactMainChatMessageListPanel();');
        expect(reactMoveBranch).not.toContain('chatElement');
        expect(moveBlock.indexOf(reactMoveBranch)).toBeLessThan(moveBlock.indexOf('const targetMessageDiv = chatElement'));
    });

    test('routes React editing actions through named data commands', () => {
        const commandsSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'compat', 'workspace-commands.ts'),
            'utf8',
        );
        const rowSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'components', 'main-chat', 'MainChatMessageRow.tsx'),
            'utf8',
        );
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );

        expect(commandsSource).toContain('copyMessage(messageId: number): CommandResult;');
        expect(commandsSource).toContain('duplicateMessage(messageId: number): CommandResult;');
        expect(commandsSource).toContain('deleteMessage(messageId: number): CommandResult;');
        expect(commandsSource).toContain("moveMessage(messageId: number, direction: 'up' | 'down'): CommandResult;");
        expect(rowSource).toContain('commands?.copyMessage(numericMessageId)');
        expect(rowSource).toContain('commands?.duplicateMessage(numericMessageId)');
        expect(rowSource).toContain('commands?.deleteMessage(numericMessageId)');
        expect(rowSource).toContain('commands?.moveMessage(numericMessageId,');
        expect(scriptSource).toContain('copyMessage: messageId => copyMainChatMessage(messageId)');
        expect(scriptSource).toContain('duplicateMessage: messageId => duplicateMainChatMessage(messageId)');
        expect(scriptSource).toContain('power_user.confirm_message_delete === true');
        expect(scriptSource).toContain('moveMessage: (messageId, direction) =>');
    });

    test('routes React reasoning controls through named state commands without message DOM reads', () => {
        const commandsSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'compat', 'workspace-commands.ts'),
            'utf8',
        );
        const rowSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'components', 'main-chat', 'MainChatMessageRow.tsx'),
            'utf8',
        );
        const projectionSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'scripts', 'main-chat-store-projection.js'),
            'utf8',
        );
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );

        [
            'setMessageReasoningOpen(messageId: number, open: boolean): CommandResult;',
            'copyMessageReasoning(messageId: number): CommandResult;',
            'startMessageReasoningEdit(messageId: number): CommandResult;',
            'updateMessageReasoningEdit(messageId: number, text: string): CommandResult;',
            'commitMessageReasoningEdit(messageId: number): CommandResult;',
            'cancelMessageReasoningEdit(messageId: number): CommandResult;',
            'deleteMessageReasoning(messageId: number): CommandResult;',
            'collapseAllMessageReasoning(): CommandResult;',
        ].forEach(marker => expect(commandsSource).toContain(marker));

        expect(projectionSource).toContain('const reasoningEditing = messageUi.reasoningEditing === true;');
        expect(projectionSource).toContain('messageUi.reasoningEditText,');
        expect(rowSource).toContain('commands?.setMessageReasoningOpen(numericMessageId');
        expect(rowSource).toContain('commands?.startMessageReasoningEdit(numericMessageId)');
        expect(rowSource).toContain('commands?.updateMessageReasoningEdit(numericMessageId');
        expect(rowSource).toContain('commands?.commitMessageReasoningEdit(numericMessageId)');
        expect(rowSource).toContain('commands?.cancelMessageReasoningEdit(numericMessageId)');
        expect(rowSource).toContain('commands?.copyMessageReasoning(numericMessageId)');
        expect(rowSource).toContain('commands?.deleteMessageReasoning(numericMessageId)');
        expect(rowSource).toContain('commands?.collapseAllMessageReasoning()');
        expect(rowSource).toContain('event.stopPropagation();');

        const reasoningCommandsStart = scriptSource.indexOf('function setMainChatMessageReasoningOpen(');
        const reasoningCommandsEnd = scriptSource.indexOf(
            '\n/**\n * Create the message edit UI.',
            reasoningCommandsStart,
        );
        const reasoningCommandsBlock = reasoningCommandsStart >= 0 && reasoningCommandsEnd > reasoningCommandsStart
            ? scriptSource.slice(reasoningCommandsStart, reasoningCommandsEnd)
            : '';

        expect(reasoningCommandsBlock).toContain('saveChatConditional();');
        expect(reasoningCommandsBlock).toContain('eventSource.emit(event_types.MESSAGE_REASONING_EDITED');
        expect(reasoningCommandsBlock).toContain('eventSource.emit(event_types.MESSAGE_REASONING_DELETED');
        expect(reasoningCommandsBlock).not.toContain('querySelector');
        expect(reasoningCommandsBlock).not.toContain('messageBlock');
    });

    test('routes visible composer controls through named commands without replacing DOM nodes', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const hostBlock = scriptSource.match(
            /function ensureMainChatMessageListReactHost\(\) \{[\s\S]*?\n\}/,
        )?.[0] ?? '';
        const bindingBlock = scriptSource.match(
            /function bindMainChatReactComposerCommandPort\(\) \{[\s\S]*?\n\}/,
        )?.[0] ?? '';

        expect(hostBlock).toContain("sendForm.dataset.mainChatComposerOwner = 'react';");
        expect(hostBlock).toContain("nonQrFormItems.dataset.mainChatComposerOwner = 'react';");
        expect(bindingBlock).toContain('triggerVisibleGeneration');
        expect(bindingBlock).toContain('stopVisibleGeneration');
        expect(bindingBlock).toContain('stopImmediatePropagation');
        expect(bindingBlock).not.toContain('replaceWith');
        expect(bindingBlock).not.toContain('createElement');
    });

    test('keeps React message action expansion in typed UI state', () => {
        const rowSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'components', 'main-chat', 'MainChatMessageRow.tsx'),
            'utf8',
        );
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const actionBlock = scriptSource.match(
            /function runMainChatVisibleMessageActionsShellAction\([\s\S]*?\n\}\n\nfunction getMainChatReactVisibleWindow/,
        )?.[0] ?? '';

        expect(rowSource).toContain('message.actionsExpanded');
        expect(rowSource).toContain("message.actionsExpanded ? 'extraMesButtons visible' : 'extraMesButtons'");
        expect(rowSource).toContain('className="mes_button mes_edit_delete');
        expect(rowSource).toContain('commands?.copyMessage(numericMessageId)');
        expect(rowSource).toContain('commands?.deleteMessage(numericMessageId)');
        expect(scriptSource).toContain('actionsExpanded');
        expect(scriptSource).toContain('setMainChatMessageUiState(messageId, { actionsExpanded: true });');
        expect(actionBlock).not.toContain('document.querySelector');
        expect(actionBlock).not.toContain('mainChatMessageActionsController');
        expect(scriptSource).toContain("!['copyMessage', 'duplicateMessage', 'deleteMessage', 'updateMessageEdit'].includes(commandName)");
    });

    test('persists React-owned message deletion without consulting message DOM', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const deleteBlock = scriptSource.match(
            /export async function deleteMessage\([\s\S]*?\n\}\n\nexport const reloadChatMutex/,
        )?.[0] ?? '';
        const reactDeleteBranch = deleteBlock.match(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?\n    \}/,
        )?.[0] ?? '';

        expect(reactDeleteBranch).toContain('saveChatDebounced();');
        expect(reactDeleteBranch).toContain('void mountReactMainChatMessageListPanel();');
        expect(reactDeleteBranch).not.toContain('messageElement');
        expect(reactDeleteBranch).not.toContain('chatElement');
    });

    test('refreshes React-owned recovery replacements after updating the stored message', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const recoveryBlock = scriptSource.match(
            /async function replaceAssistantRecoveryMessage\([\s\S]*?\n\}\n\nfunction getGenerationLifecycleStatusLabels/,
        )?.[0] ?? '';

        expect(recoveryBlock).toContain('if (isReactMainChatOwner())');
        expect(recoveryBlock).toContain('scheduleMainChatMessageListPanelRefresh();');
        expect(recoveryBlock).not.toMatch(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?chatElement\.find/,
        );
    });
});
