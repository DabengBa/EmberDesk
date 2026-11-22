import { loader } from './action-loader.js';
import toastr from './notifications.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { t } from './i18n.js';
import { getRequestHeaders } from './request-context.js';
import { delay, download } from './utils.js';

export function createChatHistoryCommands({
    panels, openHistory, closeHistory, closeOptionsMenu, getTarget,
    hasCharacter, isSending, getAnimationDuration, getUserName,
    delChat, openCharacterChat, renameChat, saveChatConditional, displayPastChats,
    renderTemplateAsync, doNewChat, continueLastReply, canRegenerateLastReply,
    openMessageDelete, regenerateLastReply, closeCurrentChat, newAssistantChat,
    openChatMemoryPanel, openWireLogPanel, backToMainChat, openFileAttachmentPicker, importCharacterChat,
}) {
    function captureCurrentTarget() {
        const target = getTarget();
        return () => {
            const current = getTarget();
            return current.account === target.account && current.avatar === target.avatar && current.chat === target.chat && current.session === target.session;
        };
    }

    async function deleteChatByFileName(deleteFileName) {
        const isCurrent = captureCurrentTarget();
        return panels().deleteHistoryChat(deleteFileName, false, {
            isCurrent,
            confirm: async () => {
                const content = document.createElement('div');
                const title = document.createElement('h3');
                title.textContent = t`Delete the Chat File?`;
                const file = document.createElement('p');
                file.className = 'chat-file-name';
                file.textContent = deleteFileName;
                content.append(title, file);
                const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', { okButton: t`Delete chat`, cancelButton: t`Cancel`, defaultResult: POPUP_RESULT.NEGATIVE });
                return result === POPUP_RESULT.AFFIRMATIVE;
            },
            close: closeHistory,
            showLoader: () => loader.show({ slug: 'chat-delete', title: t`Delete Chat`, message: t`Deleting chat…`, toastMode: loader.ToastMode.STATIC }),
            remove: delChat,
            hideMenu: closeOptionsMenu,
            reopen: () => { void runOptionsMenuCommand('option_select_chat'); },
            schedule: callback => setTimeout(callback, 2000),
        });
    }


    async function openHistoryChat(fileName, closeAfterLoad = true) {
        if (!fileName) {
            return;
        }

        const loaderHandle = loader.show({
            slug: 'chat-load',
            title: t`Chat History`,
            message: t`Loading chat…`,
            toastMode: loader.ToastMode.STATIC,
        });

        try {
            await openCharacterChat(fileName);
        } finally {
            await loaderHandle.hide();
        }

        if (closeAfterLoad) closeHistory();
    }

    async function renameHistoryChat(oldFileName) {
        const target = getTarget();
        const isCurrent = captureCurrentTarget();
        let renamed = false;
        const popupText = document.createElement('div');
        popupText.innerHTML = await renderTemplateAsync('chatRename');
        const errorText = document.createElement('p');
        errorText.setAttribute('role', 'alert');
        errorText.className = 'chat-rename-error';
        errorText.hidden = true;
        popupText.append(errorText);
        let currentPopup;
        const rename = panels().createHistoryRenameCommand(oldFileName, {
            isCurrent,
            invalid: () => {
                errorText.textContent = t`Enter a chat name.`;
                errorText.hidden = false;
                currentPopup.mainInput.setAttribute('aria-invalid', 'true');
                currentPopup.mainInput.focus();
            },
            busy: value => {
                if (value) currentPopup.dlg.setAttribute('aria-busy', 'true');
                else currentPopup.dlg.removeAttribute('aria-busy');
                currentPopup.mainInput.disabled = value;
                currentPopup.buttonControls.querySelectorAll('button').forEach(button => { button.disabled = value; });
                if (!value) currentPopup.mainInput.focus();
            },
            rename: async name => { renamed = await renameChat(oldFileName, name); return renamed; },
            failed: () => { errorText.textContent = t`Chat was not renamed. Check the name and connection, then try again.`; errorText.hidden = false; },
        });
        const result = await callGenericPopup(popupText, POPUP_TYPE.INPUT, oldFileName, {
            okButton: t`Rename chat`,
            cancelButton: t`Cancel`,
            onClosing: async popup => {
                currentPopup = popup;
                return rename(popup.result === POPUP_RESULT.AFFIRMATIVE, popup.mainInput.value);
            },
        });
        const current = getTarget();
        if ((isCurrent() || (renamed && current.account === target.account && current.avatar === target.avatar))
            && result !== POPUP_RESULT.CANCELLED && result !== POPUP_RESULT.NEGATIVE) await displayPastChats();
    }

    async function exportHistoryChat(filename, format = 'txt', alreadySaved = false) {
        const { avatar } = getTarget();
        return panels().exportHistoryChat(format, alreadySaved, {
            save: saveChatConditional,
            request: async () => {
                console.log(`exporting ${filename} in ${format} format`);
                const body = { avatar_url: avatar, file: `${filename}.jsonl`, exportfilename: `${filename}.${format}`, format };
                console.log(body);
                const response = await fetch('/api/chats/export', { method: 'POST', body: JSON.stringify(body), headers: getRequestHeaders() });
                if (response.ok && format === 'zip') {
                    return { ok: true, data: { message: t`Chat archive exported.`, result: await response.blob() } };
                }
                return { ok: response.ok, data: await response.json() };
            },
            wait: () => delay(250),
            log: data => console.log(data),
            success: data => toastr.success(data.message),
            failure: message => toastr.error(`Error: ${message}`),
            download: (data, mime) => download(data, `${filename}.${format}`, mime),
        });
    }

    const historyRowCommands = {
        close: closeHistory,
        newChat: async () => {
            await doNewChat({ deleteCurrentChat: false });
            closeHistory();
        },
        openChat: openHistoryChat,
        renameChat: renameHistoryChat,
        exportChat: exportHistoryChat,
        deleteChat: deleteChatByFileName,
        importFiles: importHistoryFiles,
    };


    async function runOptionsMenuCommand(id) {
        if (id === 'option_continue') {
            closeOptionsMenu();
            return continueLastReply();
        }
        return panels().runHistoryMenuAction(id, false, {
            hasCharacter: () => hasCharacter(),
            isSending: () => isSending(),
            canRegenerate: canRegenerateLastReply,
            history: async () => {
                await displayPastChats();
                console.log('displaying shadow');
                openHistory();
            },
            confirmNew: async () => {
                let deleteCurrentChat = false;
                const result = await Popup.show.confirm(t`Start new chat?`, await renderTemplateAsync('newChatConfirm'), {
                    okButton: t`Start new chat`,
                    cancelButton: t`Cancel`,
                    onClose: () => { deleteCurrentChat = Boolean(document.getElementById('del_chat_checkbox')?.checked); },
                });
                return result ? deleteCurrentChat : null;
            },
            newChat: deleteCurrentChat => doNewChat({ deleteCurrentChat }),
            newAssistant: newAssistantChat,
            deleteMessages: () => { setTimeout(() => openMessageDelete(), getAnimationDuration()); },
            regenerate: () => { void regenerateLastReply(); },
            closeChat: closeCurrentChat,
            memory: openChatMemoryPanel,
            wireLog: openWireLogPanel,
            backToMain: () => { void backToMainChat(); },
            attachFile: () => openFileAttachmentPicker(),
            closeMenu: closeOptionsMenu,
        });
    }


    async function importHistoryFiles(targetElement) {
        const formElement = document.getElementById('form_import_chat');
        if (!(targetElement instanceof HTMLInputElement) || !(formElement instanceof HTMLFormElement)) {
            return;
        }

        await panels().importHistoryFiles(targetElement.files, {
            invalid: () => toastr.warning(t`Only JSON, JSONL, and chat ZIP files are supported for chat imports.`),
            importFile: (file, format) => {
                const formData = new FormData(formElement);
                formData.set('file_type', format);
                formData.set('avatar', file);
                formData.set('user_name', getUserName());
                return importCharacterChat(formData, { refresh: false });
            },
            complete: async names => {
                if (names.length > 0) toastr.success(t`Successfully imported ${names.length} chat(s).`);
                await displayPastChats(names);
            },
        });

        targetElement.value = '';
    }

    return {
        runHistoryRowCommand(command, ...args) {
            if (!Object.hasOwn(historyRowCommands, command)) throw new Error(`History command unavailable: ${command}`);
            return historyRowCommands[command](...args);
        },
        runOptionsMenuCommand,
    };
}
