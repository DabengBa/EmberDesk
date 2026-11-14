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
            "export type MainChatGenerationKind = 'submitComposer' | 'regenerate';",
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
        const panelBlock = fs.readFileSync(
            path.join(repoRoot, 'app', 'components', 'main-chat', 'MainChatMessageListWorkspacePanel.tsx'),
            'utf8',
        );
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

        const generationServiceSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'scripts', 'generation-service.js'),
            'utf8',
        );
        const typedGenerationSource = fs.readFileSync(
            path.join(repoRoot, 'app', 'lib', 'generation', 'attempt-executor.ts'),
            'utf8',
        );
        const streamingMethod = typedGenerationSource.match(
            /async function progressStreamMessage\([\s\S]*?\n\}/,
        )?.[0] ?? '';
        expect(generationServiceSource).toContain('refresh: () => scheduleMainChatMessageListPanelRefresh()');
        expect(generationServiceSource).toContain('getGenerationLifecycleService().progressStreamMessage(');
        expect(streamingMethod).toContain('ports.refresh();');
        expect(streamingMethod).not.toContain('isReactMainChatOwner');
        expect(streamingMethod).not.toContain('messageTextDom.innerHTML');
        expect(streamingMethod).not.toContain('messageTimerDom.textContent');

        const messageServiceSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'scripts', 'message-service.js'),
            'utf8',
        );
        const appendMediaBlock = messageServiceSource.match(
            /export function appendMediaToMessage\([\s\S]*?\n\}\n\nexport function addCopyToCodeBlocks/,
        )?.[0] ?? '';
        expect(appendMediaBlock).toMatch(
            /if \(isReactMainChatOwner\(\)\) \{\s*scheduleMainChatMessageListPanelRefresh\(\);\s*return;/,
        );
        const updateElementBlock = messageServiceSource.match(/export function updateMessageElement\([\s\S]*?\n\}/)?.[0] ?? '';
        expect(updateElementBlock).toMatch(/closest\('\[data-main-chat-message-row-owner="react"\]'\)[\s\S]*?scheduleMainChatMessageListPanelRefresh\(\);[\s\S]*?return messageElement;/);

        const recoveryBlock = scriptSource.match(
            /function clearGenerationAutoRecoveryStatus[\s\S]*?export async function redisplayChat/,
        )?.[0] ?? '';
        expect(recoveryBlock).toContain('setMainChatMessageUiState');
        expect(recoveryBlock.indexOf('return;')).toBeLessThan(recoveryBlock.indexOf('const messageElement'));
        expect(recoveryBlock).toContain("messageElement.find('.mes_text').after");
        expect(recoveryBlock).toContain("messageElement.find('.generation_failure_notice').length");

        const editorBlock = scriptSource.match(
            /export async function messageEdit\([\s\S]*?async function messageEditDone\([\s\S]*?\n\}/,
        )?.[0] ?? '';
        expect(editorBlock).toContain('getChatMessageCommands().startMessageEdit(messageId)');
        expect(editorBlock).toContain('getChatMessageCommands().cancelMessageEdit(messageId)');
        expect(editorBlock).toContain('getChatMessageCommands().commitMessageEdit(this_edit_mes_id)');
        expect(editorBlock).not.toMatch(/chatElement|messageElement|querySelector|innerHTML|\.find\(/);
    });

    test('keeps React-owned in-context marker in the snapshot path', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const contextBlock = scriptSource.match(
            /function setInContextMessages\([\s\S]*?\n\}\n\n\/\*\*\n \* @typedef \{object\} AdditionalRequestOptions/,
        )?.[0] ?? '';
        const reactContextBranch = contextBlock.match(
            /if \(isReactMainChatOwner\(\)\) \{[\s\S]*?return;\n    \}/,
        )?.[0] ?? '';

        expect(reactContextBranch).toContain('if (isReactMainChatOwner())');
        expect(reactContextBranch).toContain("setMainChatMessageUiState(lastMessageId, { lastInContext: true });");
        expect(reactContextBranch).not.toContain("chatElement.find('.mes').removeClass('lastInContext')");
    });

    test('moves React-owned messages without reading legacy message DOM', () => {
        const scriptSource = fs.readFileSync(
            path.join(repoRoot, 'public', 'script.js'),
            'utf8',
        );
        const moveBlock = scriptSource.match(
            /async function messageEditMove\(sourceId, targetId\) \{[\s\S]*?\n\}\n\nasync function messageEditDone/,
        )?.[0] ?? '';
        const commandSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-message-commands.js'), 'utf8');
        const moveCommand = commandSource.match(/async function moveMessage\([\s\S]*?\n    \}/)?.[0] ?? '';
        expect(moveBlock).toContain('getChatMessageCommands().moveMessage(sourceId, targetId)');
        expect(moveBlock).not.toMatch(/chatElement|querySelector|messageElement/);
        expect(moveCommand).toContain('[chat[source], chat[target]] = [chat[target], chat[source]]');
        expect(moveCommand).toContain('remapUi(');
        expect(moveCommand).toContain('await deps.save()');
        expect(moveCommand).toContain('deps.refresh()');
        expect(moveCommand).not.toMatch(/chatElement|querySelector|messageElement|\bdocument\b/);
        expect(scriptSource).toContain('save: () => saveChatConditional()');
        expect(scriptSource).toContain('refresh: () => scheduleMainChatMessageListPanelRefresh()');
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

        expect(commandsSource).toContain('copyMessage(messageUid: string): CommandResult;');
        expect(commandsSource).toContain('duplicateMessage(messageUid: string): CommandResult;');
        expect(commandsSource).toContain('deleteMessage(messageUid: string): CommandResult;');
        expect(commandsSource).toContain("moveMessage(messageUid: string, direction: 'up' | 'down'): CommandResult;");
        expect(rowSource).toContain('commands?.copyMessage(messageUid)');
        expect(rowSource).toContain('commands?.duplicateMessage(messageUid)');
        expect(rowSource).toContain('commands?.deleteMessage(messageUid)');
        expect(rowSource).toContain('commands?.moveMessage(messageUid,');
        const commandSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-message-commands.js'), 'utf8');
        const portBlock = scriptSource.match(/function getMainChatMessageListReactCommands\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(portBlock).toContain('...getChatMessageCommands()');
        expect(portBlock).toContain('...rowCommands');
        expect(portBlock).toContain('createChatMessageRowCommands({');
        const rowCommandsSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-message-row-commands.js'), 'utf8');
        expect(rowCommandsSource).toContain('getMessageUid(message) === uid');
        expect(rowCommandsSource).toContain('commands.deleteMessage(index, true)');
        expect(rowCommandsSource).toContain('commands.moveMessage(index, index +');
        expect(commandSource).toContain('copyMessage, duplicateMessage, deleteMessage, deleteRange, moveMessage');
        expect(commandSource).not.toMatch(/\bdocument\b|querySelector|chatElement|innerHTML/);
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
            'setMessageReasoningOpen(messageUid: string, open: boolean): CommandResult;',
            'copyMessageReasoning(messageUid: string): CommandResult;',
            'startMessageReasoningEdit(messageUid: string): CommandResult;',
            'updateMessageReasoningEdit(messageUid: string, text: string): CommandResult;',
            'commitMessageReasoningEdit(messageUid: string): CommandResult;',
            'cancelMessageReasoningEdit(messageUid: string): CommandResult;',
            'deleteMessageReasoning(messageUid: string): CommandResult;',
            'collapseAllMessageReasoning(): CommandResult;',
        ].forEach(marker => expect(commandsSource).toContain(marker));

        expect(projectionSource).toContain('const reasoningEditing = messageUi.reasoningEditing === true;');
        expect(projectionSource).toContain('messageUi.reasoningEditText,');
        expect(rowSource).toContain('commands?.setMessageReasoningOpen(messageUid');
        expect(rowSource).toContain('commands?.startMessageReasoningEdit(messageUid)');
        expect(rowSource).toContain('commands?.updateMessageReasoningEdit(messageUid');
        expect(rowSource).toContain('commands?.commitMessageReasoningEdit(messageUid)');
        expect(rowSource).toContain('commands?.cancelMessageReasoningEdit(messageUid)');
        expect(rowSource).toContain('commands?.copyMessageReasoning(messageUid)');
        expect(rowSource).toContain('commands?.deleteMessageReasoning(messageUid)');
        expect(rowSource).toContain('commands?.collapseAllMessageReasoning()');
        expect(rowSource).toContain('event.stopPropagation();');

        const commandSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-message-commands.js'), 'utf8');
        const reasoningCommandsBlock = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-message-reasoning-commands.js'), 'utf8');
        const reasoningSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'reasoning.js'), 'utf8');
        expect(scriptSource).toContain('getChatMessageCommands: () => getChatMessageCommands()');
        expect(scriptSource).toContain('save: () => saveChatConditional()');
        expect(scriptSource).toContain('emit: (event, id) => eventSource.emit(event_types[event], id)');
        expect(scriptSource).toContain('...getChatMessageCommands()');
        expect(commandSource).toContain('...createChatMessageReasoningCommands({ ...deps, commitMessageEdit, cancelMessageEdit })');
        expect(reasoningSource).toContain('requireMessageShellContext().getChatMessageCommands()');
        expect(reasoningCommandsBlock).toContain('await deps.save()');
        expect(reasoningCommandsBlock).toContain("deps.emit('MESSAGE_REASONING_EDITED', id)");
        expect(reasoningCommandsBlock).toContain("deps.emit('MESSAGE_REASONING_DELETED', id)");
        expect(reasoningCommandsBlock).not.toMatch(/querySelector|messageBlock|\bdocument\b|chatElement|innerHTML/);
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
            /async function mountChatComposer\(\) \{[\s\S]*?\n\}/,
        )?.[0] ?? '';

        expect(hostBlock).toContain("sendForm.dataset.mainChatComposerOwner = 'react';");
        expect(hostBlock).toContain("nonQrFormItems.dataset.mainChatComposerOwner = 'react';");
        expect(bindingBlock).toContain('submit: sendTextareaMessage');
        expect(bindingBlock).toContain('stop: stopGeneration');
        expect(bindingBlock).toContain('getComposerSnapshot, subscribeComposerState');
        expect(bindingBlock).not.toContain('replaceWith');
        expect(scriptSource).not.toContain('bindMainChatReactComposerCommandPort');
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
        expect(rowSource).toContain('commands?.copyMessage(messageUid)');
        expect(rowSource).toContain('commands?.deleteMessage(messageUid)');
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
        const commandSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'chat-message-commands.js'), 'utf8');
        const deleteCommand = commandSource.match(/async function deleteRange\([\s\S]*?\n    \}/)?.[0] ?? '';
        expect(deleteBlock).toContain('getChatMessageCommands().deleteMessage(id, askConfirmation)');
        expect(deleteBlock).not.toMatch(/messageElement|chatElement|querySelector/);
        expect(deleteCommand).toContain('deps.getChat().splice(id, count)');
        expect(deleteCommand).toContain('remapUi(');
        expect(deleteCommand).toContain('deps.saveDebounced()');
        expect(deleteCommand).toContain("deps.emit('MESSAGE_DELETED', deps.getChat().length)");
        expect(deleteCommand).toContain('deps.refresh()');
        expect(deleteCommand).not.toMatch(/messageElement|chatElement|querySelector|\bdocument\b/);
        expect(scriptSource).toContain('saveDebounced: () => saveChatDebounced()');
        expect(scriptSource).toContain('refresh: () => scheduleMainChatMessageListPanelRefresh()');
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
