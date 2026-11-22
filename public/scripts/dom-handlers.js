import toastr from './notifications.js';
import { throttle } from './utils.js';
import { debounce_timeout } from './constants.js';
import { eventSource, event_types } from './events.js';

import { requireDomHandlersShellContext } from './dom-handlers-shell-context.js';
import { renameComposerDraftContext, setComposerDraftContext, requestComposerFocus } from './main-chat-composer-service.js';
import { installWorkspaceInteractionCommands } from './workspace-interaction-commands.js';
import { transitionOpacity } from './chat-ui-motion.js';
import { fixToastrForDialogs } from './popup.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';

function shell() {
    return requireDomHandlersShellContext();
}

let historyRowCommands;
let optionsMenuCommand;
let dialoguePopupCommands;
let deleteMessageCommands;
let characterExportCommand;

/** Invoke the same history actions used by the compatibility click adapter. */
export function runHistoryRowCommand(command, ...args) {
    if (!historyRowCommands?.[command]) throw new Error(`History command unavailable: ${command}`);
    return historyRowCommands[command](...args);
}

export function runOptionsMenuCommand(id, customData) {
    if (!optionsMenuCommand) throw new Error('Options menu command unavailable');
    return optionsMenuCommand(id, customData);
}

export function runDialoguePopupCommand(command) {
    if (!dialoguePopupCommands?.[command]) throw new Error(`Dialogue command unavailable: ${command}`);
    return dialoguePopupCommands[command]();
}

export function runDeleteMessageCommand(command) {
    if (!deleteMessageCommands?.[command]) throw new Error(`Delete message command unavailable: ${command}`);
    return deleteMessageCommands[command]();
}

export function runCharacterExportCommand(format, options) {
    if (!characterExportCommand) throw new Error('Character export command unavailable');
    return characterExportCommand(format, options);
}

installWorkspaceInteractionCommands({ runHistoryRowCommand, runOptionsMenuCommand, runDialoguePopupCommand, runDeleteMessageCommand });

const state = new Proxy({}, {
    get: (_, key) => shell().state[key],
    set: (_, key, value) => {
        shell().state[key] = value;
        return true;
    },
    has: (_, key) => key in shell().state,
    ownKeys: () => Reflect.ownKeys(shell().state),
    getOwnPropertyDescriptor: (_, key) => Object.getOwnPropertyDescriptor(shell().state, key),
});

const bootstrapWorkspace = (...args) => shell().bootstrapWorkspace(...args);
const buildCascadeSectionHtml = (...args) => shell().buildCascadeSectionHtml(...args);
const buildTemporaryChatDeleteWarningHtml = (...args) => shell().buildTemporaryChatDeleteWarningHtml(...args);
const callGenericPopup = (...args) => shell().callGenericPopup(...args);
const canRegenerateLastReply = (...args) => shell().canRegenerateLastReply(...args);
const cancelTtsPlay = (...args) => shell().cancelTtsPlay(...args);
const closeCharacterExportPopup = (...args) => shell().closeCharacterExportPopup(...args);
const closeCurrentChat = (...args) => shell().closeCurrentChat(...args);
const handleWorkspaceDrawerOutsidePointer = target => shell().handleWorkspaceDrawerOutsidePointer(target);
const copyText = (...args) => shell().copyText(...args);
const createChatMessageActionsController = (...args) => shell().createChatMessageActionsController(...args);
const createOrEditCharacter = (...args) => shell().createOrEditCharacter(...args);
const debounce = (...args) => shell().debounce(...args);
const delChat = (...args) => shell().delChat(...args);
const delay = (...args) => shell().delay(...args);
const deleteCharacter = (...args) => shell().deleteCharacter(...args);
const deleteMessage = (...args) => shell().deleteMessage(...args);
const displayPastChats = (...args) => shell().displayPastChats(...args);

const doNewChat = (...args) => shell().doNewChat(...args);
const download = (...args) => shell().download(...args);
const duplicateCharacter = (...args) => shell().duplicateCharacter(...args);
const formatCreatorNotes = (...args) => shell().formatCreatorNotes(...args);
const getCharacterDeleteDialogTitle = (...args) => shell().getCharacterDeleteDialogTitle(...args);
const getCharacterSource = (...args) => shell().getCharacterSource(...args);
const getOptionsPopper = (...args) => shell().getOptionsPopper(...args);
const getRequestHeaders = (...args) => shell().getRequestHeaders(...args);
const handleUnifiedImport = (...args) => shell().handleUnifiedImport(...args);
const importCharacter = (...args) => shell().importCharacter(...args);
const importCharacterChat = (...args) => shell().importCharacterChat(...args);
const importEmbeddedWorldInfo = (...args) => shell().importEmbeddedWorldInfo(...args);
const importFromExternalUrl = (...args) => shell().importFromExternalUrl(...args);
const importFromURL = (...args) => shell().importFromURL(...args);
const importTags = (...args) => shell().importTags(...args);
const initCharacterSearch = (...args) => shell().initCharacterSearch(...args);
const isDataURL = (...args) => shell().isDataURL(...args);


const loadEarlierChatMessages = (...args) => shell().loadEarlierChatMessages(...args);
const messageEdit = (...args) => shell().messageEdit(...args);
const messageEditCancel = (...args) => shell().messageEditCancel(...args);
const messageEditDone = (...args) => shell().messageEditDone(...args);
const messageEditMove = (...args) => shell().messageEditMove(...args);
const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const mountReactWorkspaceShellChromeHost = (...args) => shell().mountReactWorkspaceShellChromeHost(...args);
const newAssistantChat = (...args) => shell().newAssistantChat(...args);
const openAlternateGreetings = (...args) => shell().openAlternateGreetings(...args);
const openCharacterChat = (...args) => shell().openCharacterChat(...args);
const openCharacterWorldPopup = (...args) => shell().openCharacterWorldPopup(...args);
const openMessageDelete = (...args) => shell().openMessageDelete(...args);
const openWireLogPanel = (...args) => shell().openWireLogPanel(...args);
const openChatMemoryPanel = (...args) => shell().openChatMemoryPanel(...args);

const processDroppedFiles = (...args) => shell().processDroppedFiles(...args);
const queueReactCharacterAuthoringRemount = (...args) => shell().queueReactCharacterAuthoringRemount(...args);
const regenerateLastReply = (...args) => shell().regenerateLastReply(...args);
const renameCharacter = (...args) => shell().renameCharacter(...args);
const renameChat = (...args) => shell().renameChat(...args);
const renderTemplateAsync = (...args) => shell().renderTemplateAsync(...args);

const runMainChatVisibleMessageActionsShellAction = (...args) => shell().runMainChatVisibleMessageActionsShellAction(...args);
const saveCharacterDebounced = (...args) => shell().saveCharacterDebounced(...args);
const saveChatConditional = (...args) => shell().saveChatConditional(...args);

const selectImportedChar = (...args) => shell().selectImportedChar(...args);
const select_rm_characters = (...args) => shell().select_rm_characters(...args);
const select_rm_create = (...args) => shell().select_rm_create(...args);
const select_selected_character = (...args) => shell().select_selected_character(...args);
const setCharacterSettingsOverrides = (...args) => shell().setCharacterSettingsOverrides(...args);
const setOptionsMenuRegenerateAvailability = (...args) => shell().setOptionsMenuRegenerateAvailability(...args);
const showBranchChatButtons = (...args) => shell().showBranchChatButtons(...args);
const showDeleteConfirmWithCascade = (...args) => shell().showDeleteConfirmWithCascade(...args);
const stopGeneration = (...args) => shell().stopGeneration(...args);

const t = (...args) => shell().t(...args);
const toggleCharacterExportPopup = (...args) => shell().toggleCharacterExportPopup(...args);
const getVisibleCharacterExportTrigger = (...args) => shell().getVisibleCharacterExportTrigger(...args);

const updateCharacterRow = (...args) => shell().updateCharacterRow(...args);
const updateFavButtonState = (...args) => shell().updateFavButtonState(...args);

const waitUntilCondition = (...args) => shell().waitUntilCondition(...args);

export function initDomHandlers() {
    handleInputWheel();
}

export async function bindLegacyShellHandlers() {
    initCharacterSearch();

    function delegate(type, selector, handler) {
        document.addEventListener(type, event => {
            if (type === 'click' && event.button >= 1) return;
            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            const match = target?.closest(selector);
            if (!match || (type === 'click' && match.disabled === true)) return;
            return handler.call(match, event);
        });
    }

    //menu buttons setup

    document.getElementById('rm_button_characters')?.addEventListener('click', function () {
        state.selected_button = 'characters';
        select_rm_characters();
    });
    document.getElementById('rm_button_back')?.addEventListener('click', function () {
        state.selected_button = 'characters';
        select_rm_characters();
    });
    document.getElementById('rm_button_create')?.addEventListener('click', function () {
        state.selected_button = 'create';
        select_rm_create();
        // This is also the React Character Library's New action. Selecting the
        // legacy-compatible panel does not emit CHARACTER_EDITOR_OPENED, so mount
        // the sole-owner authoring UI explicitly for new-character drafts.
        queueReactCharacterAuthoringRemount();
    });
    document.getElementById('rm_button_selected_ch')?.addEventListener('click', function () {
        if (state.this_chid !== undefined && state.characters[state.this_chid]) {
            state.selected_button = 'character_edit';
            select_selected_character(state.this_chid);
        } else {
            state.selected_button = 'characters';
            select_rm_characters();
        }
        const searchInput = document.getElementById('character_search_bar');
        if (searchInput instanceof HTMLInputElement && searchInput.value !== '') {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    const cssAutofit = CSS.supports('field-sizing', 'content');
    if (!cssAutofit) {
        /**
         * Sets the scroll height of the edit textarea to fit the content.
         * @param {HTMLTextAreaElement} e Textarea element to auto-fit
         */
        function autoFitEditTextArea(e) {
            const chat = document.getElementById('chat');
            const scrollTop = chat.scrollTop;
            e.style.height = '0px';
            const newHeight = e.scrollHeight + 4;
            e.style.height = `${newHeight}px`;
            chat.scrollTop = scrollTop;
        }
        const autoFitEditTextAreaDebounced = debounce(autoFitEditTextArea, debounce_timeout.short);
        document.addEventListener('input', e => {
            if (e.target instanceof HTMLTextAreaElement && e.target.classList.contains('edit_textarea')) {
                const scrollbarShown = e.target.clientWidth < e.target.offsetWidth && e.target.offsetHeight >= window.innerHeight * 0.75;
                const immediately = (e.target.scrollHeight > e.target.offsetHeight && !scrollbarShown) || e.target.value === '';
                if (immediately) autoFitEditTextArea(e.target); else autoFitEditTextAreaDebounced(e.target);
            }
        });
    }


    function closeSelectChatPopup() {
        document.getElementById('shadow_select_chat_popup').close();
    }

    async function deleteChatByFileName(deleteFileName) {
        console.debug('detected cross click for' + deleteFileName);
        return shell().getHistoryCommands().deleteHistoryChat(deleteFileName, false, {
            confirm: async () => {
                const content = document.createElement('div');
                const title = document.createElement('h3');
                title.textContent = t`Delete the Chat File?`;
                const file = document.createElement('p');
                file.className = 'chat-file-name';
                file.textContent = deleteFileName;
                content.append(title, file);
                const result = await callGenericPopup(content, state.POPUP_TYPE.CONFIRM, '', { okButton: t`Delete chat`, cancelButton: t`Cancel`, defaultResult: state.POPUP_RESULT.NEGATIVE });
                return result === state.POPUP_RESULT.AFFIRMATIVE;
            },
            close: closeSelectChatPopup,
            showLoader: () => state.loader.show({ slug: 'chat-delete', title: t`Delete Chat`, message: t`Deleting chat…`, toastMode: state.loader.ToastMode.STATIC }),
            remove: delChat,
            hideMenu: () => { document.getElementById('options').style.display = 'none'; },
            reopen: () => { void runOptionsMenuCommand('option_select_chat'); },
            schedule: callback => setTimeout(callback, 2000),
        });
    }

    delegate('click', '.PastChat_cross', function (e) {
        e.stopPropagation();
        return deleteChatByFileName(this.getAttribute('file_name'));
    });


    document.getElementById('character_cross')?.addEventListener('click', function () {
        state.is_advanced_char_open = false;
        const popup = document.getElementById('character_popup');
        transitionOpacity(popup, {
            opacity: 0,
            duration: state.animation_duration,
            easing: state.animation_easing,
            complete() { popup.style.display = 'none'; },
        });
    });

    document.getElementById('character_popup_ok')?.addEventListener('click', function () {
        state.is_advanced_char_open = false;
        document.getElementById('character_popup').style.display = 'none';
    });

    async function confirmDialoguePopup() {
        state.dialogueCloseStop = false;
        if (globalThis.__emberDeskDialoguePresentation) {
            globalThis.__emberDeskDialoguePresentation.close('confirm');
        } else {
            transitionOpacity(document.getElementById('shadow_popup'), {
                opacity: 0,
                duration: state.animation_duration,
                easing: state.animation_easing,
                complete() {
                    if (state.dialogueCloseStop) return;
                    document.getElementById('shadow_popup').style.display = 'none';
                    document.getElementById('dialogue_popup').classList.remove('large_dialogue_popup', 'wide_dialogue_popup');
                },
            });
        }

        const controller = state.dialogueController;
        if (controller?.getSnapshot().open) {
            const input = document.getElementById('dialogue_popup_input');
            if (state.popup_type == 'input' && input?.getAttribute('data-react-dialogue-input') !== 'true') {
                controller.setInput(String(input?.value ?? ''));
                if (input) input.value = '';
            }
            controller.confirmDialoguePopup();
        }
    }

    function cancelDialoguePopup() {
        state.dialogueCloseStop = false;
        if (globalThis.__emberDeskDialoguePresentation) {
            globalThis.__emberDeskDialoguePresentation.close('cancel');
        } else {
            transitionOpacity(document.getElementById('shadow_popup'), {
                opacity: 0,
                duration: state.animation_duration,
                easing: state.animation_easing,
                complete() {
                    if (state.dialogueCloseStop) return;
                    document.getElementById('shadow_popup').style.display = 'none';
                    document.getElementById('dialogue_popup').classList.remove('large_dialogue_popup');
                },
            });
        }

        state.popup_type = '';

        const controller = state.dialogueController;
        if (controller?.getSnapshot().open) {
            controller.cancelDialoguePopup();
        }
    }

    dialoguePopupCommands = { confirmDialoguePopup, cancelDialoguePopup };
    // React owns button clicks; keyboard and programmatic callers use commands.

    document.getElementById('delete_button')?.addEventListener('click', async function () {
        if (state.this_chid === undefined || !state.characters[state.this_chid]) {
            toastr.warning('No character selected.');
            return;
        }
        const characterToDelete = state.characters[state.this_chid];
        const avatarToDelete = characterToDelete.avatar;
        const deleteDialogTitle = getCharacterDeleteDialogTitle(characterToDelete.name);

        // Auto-stop generation if active
        if (state.is_send_press !== false) {
            stopGeneration();
            try {
                await waitUntilCondition(() => state.is_send_press === false, debounce_timeout.extended, 10);
            } catch {
                // Timeout — proceed anyway
            }
        }

        // Preflight: gather world info metadata before showing confirmation
        let worldInfos = [];
        try {
            const resp = await fetch('/api/characters/delete-preflight', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatars: [avatarToDelete] }),
                cache: 'no-cache',
            });
            if (resp.ok) {
                const data = await resp.json();
                worldInfos = data.worldInfos ?? [];
            }
        } catch {
            // Preflight failure should not block deletion
        }

        // Build dialog content: original deleteConfirm template + world info section
        let content = await renderTemplateAsync('deleteConfirm');
        const inTempChat = state.this_chid === undefined && state.name2 === state.neutralCharacterName;
        if (inTempChat) {
            content += buildTemporaryChatDeleteWarningHtml();
        }
        const cascadeHtml = buildCascadeSectionHtml(worldInfos);
        if (cascadeHtml) {
            content += cascadeHtml;
        }

        // When world infos exist, use the integrated dialog with "Delete All" button;
        // otherwise fall back to the standard confirm dialog.
        if (cascadeHtml) {
            const dialogResult = await showDeleteConfirmWithCascade(deleteDialogTitle, content);
            if (!dialogResult.confirmed) {
                return;
            }
            await deleteCharacter(avatarToDelete, {
                deleteChats: dialogResult.deleteChats,
                temporaryChatAcknowledged: inTempChat,
                deleteWorlds: dialogResult.deleteWorlds,

            });
        } else {
            let deleteChats = false;
            const confirm = await state.Popup.show.confirm(deleteDialogTitle, content, {
                leftAlign: true,
                defaultResult: state.POPUP_RESULT.NEGATIVE,
                onClose: () => { deleteChats = Boolean(document.getElementById('del_char_checkbox')?.checked); },
            });
            if (!confirm) {
                return;
            }
            await deleteCharacter(avatarToDelete, {
                deleteChats,
                temporaryChatAcknowledged: inTempChat,
                deleteWorlds: [],

            });
        }
    });

    //////// OPTIMIZED ALL CHAR CREATION/EDITING TEXTAREA LISTENERS ///////////////

    document.getElementById('character_name_pole')?.addEventListener('input', function () {
        if (state.menu_type == 'create') {
            state.create_save.name = String(document.getElementById('character_name_pole').value);
        }
    });

    const elementsToUpdate = {
        '#description_textarea': function () { state.create_save.description = String(document.getElementById('description_textarea').value); },
        '#creator_notes_textarea': function () { state.create_save.creator_notes = String(document.getElementById('creator_notes_textarea').value); },
        '#character_version_textarea': function () { state.create_save.character_version = String(document.getElementById('character_version_textarea').value); },
        '#system_prompt_textarea': function () { state.create_save.system_prompt = String(document.getElementById('system_prompt_textarea').value); },
        '#post_history_instructions_textarea': function () { state.create_save.post_history_instructions = String(document.getElementById('post_history_instructions_textarea').value); },
        '#creator_textarea': function () { state.create_save.creator = String(document.getElementById('creator_textarea').value); },
        '#tags_textarea': function () { state.create_save.tags = String(document.getElementById('tags_textarea').value); },
        '#scenario_pole': function () { state.create_save.scenario = String(document.getElementById('scenario_pole').value); },
        '#firstmessage_textarea': function () { state.create_save.first_message = String(document.getElementById('firstmessage_textarea').value); },
        '#depth_prompt_prompt': function () { state.create_save.depth_prompt_prompt = String(document.getElementById('depth_prompt_prompt').value); },
        '#depth_prompt_depth': function () { state.create_save.depth_prompt_depth = Number(document.getElementById('depth_prompt_depth').value); },
        '#depth_prompt_role': function () { state.create_save.depth_prompt_role = String(document.getElementById('depth_prompt_role').value); },
    };

    Object.keys(elementsToUpdate).forEach(function (id) {
        document.querySelector(id)?.addEventListener('input', function () {
            if (state.menu_type == 'create') {
                elementsToUpdate[id]();
            } else if (!shell().isAuthoringMirrorWrite?.()) {
                saveCharacterDebounced();
            }
        });
    });

    document.getElementById('creator_notes_textarea')?.addEventListener('input', function () {
        const notes = String(document.getElementById('creator_notes_textarea').value);
        const avatar = state.menu_type === 'create' ? '' : state.characters[state.this_chid]?.avatar;
        const spoiler = document.getElementById('creator_notes_spoiler');
        if (spoiler) spoiler.innerHTML = formatCreatorNotes(notes, avatar);
    });

    document.getElementById('favorite_button')?.addEventListener('click', function () {
        const newFavState = !state.fav_ch_checked;
        updateFavButtonState(newFavState);
        if (state.menu_type != 'create') {
            updateCharacterRow(state.this_chid, { fav: newFavState });
            saveCharacterDebounced();
        }
    });

    async function openHistoryChat(fileName, closeAfterLoad = true) {
        if (!fileName) {
            return;
        }

        const loaderHandle = state.loader.show({
            slug: 'chat-load',
            title: t`Chat History`,
            message: t`Loading chat…`,
            toastMode: state.loader.ToastMode.STATIC,
        });

        try {
            await openCharacterChat(fileName);
        } finally {
            await loaderHandle.hide();
        }

        if (closeAfterLoad) closeSelectChatPopup();
    }

    async function renameHistoryChat(oldFileName) {
        const popupText = document.createElement('div');
        popupText.innerHTML = await renderTemplateAsync('chatRename');
        const errorText = document.createElement('p');
        errorText.setAttribute('role', 'alert');
        errorText.className = 'chat-rename-error';
        errorText.hidden = true;
        popupText.append(errorText);
        let currentPopup;
        const rename = shell().getHistoryCommands().createHistoryRenameCommand(oldFileName, {
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
            rename: name => renameChat(oldFileName, name),
            failed: () => { errorText.textContent = t`Chat was not renamed. Check the name and connection, then try again.`; errorText.hidden = false; },
        });
        const result = await callGenericPopup(popupText, state.POPUP_TYPE.INPUT, oldFileName, {
            okButton: t`Rename chat`,
            cancelButton: t`Cancel`,
            onClosing: async popup => {
                currentPopup = popup;
                return rename(popup.result === state.POPUP_RESULT.AFFIRMATIVE, popup.mainInput.value);
            },
        });
        if (result !== state.POPUP_RESULT.CANCELLED && result !== state.POPUP_RESULT.NEGATIVE) await displayPastChats();
    }

    async function exportHistoryChat(filename, format = 'txt', alreadySaved = false) {
        return shell().getHistoryCommands().exportHistoryChat(format, alreadySaved, {
            save: saveChatConditional,
            request: async () => {
                console.log(`exporting ${filename} in ${format} format`);
                const body = { avatar_url: state.characters[state.this_chid]?.avatar, file: `${filename}.jsonl`, exportfilename: `${filename}.${format}`, format };
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

    historyRowCommands = {
        close: closeSelectChatPopup,
        newChat: async () => {
            await doNewChat({ deleteCurrentChat: false });
            closeSelectChatPopup();
        },
        openChat: openHistoryChat,
        renameChat: renameHistoryChat,
        exportChat: exportHistoryChat,
        deleteChat: deleteChatByFileName,
        importFiles: importHistoryFiles,
    };
    // Native fallback for non-React rows. React
    // rows stop propagation and invoke the commands above directly.
    delegate('click', '.select_chat_block', function (event) {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (target?.closest('.PastChat_cross, .renameChatButton, .exportChatButton, .exportRawChatButton')) return;
        return openHistoryChat(this.getAttribute('file_name'));
    });
    delegate('click', '.renameChatButton', function (event) {
        event.stopPropagation();
        return renameHistoryChat(this.closest('.select_chat_block_wrapper')?.querySelector('.select_chat_block_filename')?.textContent ?? '');
    });
    delegate('click', '.exportChatButton, .exportRawChatButton', function (event) {
        event.stopPropagation();
        return exportHistoryChat(this.closest('.select_chat_block_wrapper')?.querySelector('.select_chat_block_filename')?.textContent ?? '', this.dataset.format || 'txt');
    });


    const button = document.getElementById('options_button');
    const menu = document.getElementById('options');


    function showMenu() {
        button.setAttribute('aria-expanded', 'true');
        showBranchChatButtons();
        setOptionsMenuRegenerateAvailability(canRegenerateLastReply());
        shell().syncOptionsMenuContinueAvailability();
        if (getComputedStyle(menu).display === 'none') { menu.style.opacity = '0'; menu.style.display = 'block'; }
        transitionOpacity(menu, { opacity: 1, duration: state.animation_duration, easing: state.animation_easing });
        getOptionsPopper()?.update();
    }

    function hideMenu() {
        button.setAttribute('aria-expanded', 'false');
        transitionOpacity(menu, { opacity: 0, duration: state.animation_duration, easing: state.animation_easing, complete() { menu.style.display = 'none'; } });
        getOptionsPopper()?.update();
    }

    function isMouseOverButtonOrMenu() {
        return menu.matches(':hover, :focus-within') || button.matches(':hover, :focus');
    }

    const createMenuController = shell().getOptionsMenuControllerFactory();
    const menuController = createMenuController({ show: showMenu, hide: hideMenu, focus: () => button.focus() });
    menuController.attach(button, document, isMouseOverButtonOrMenu);

    ///////////// OPTIMIZED LISTENERS FOR LEFT SIDE OPTIONS POPUP MENU //////////////////////
    // React-owned menu items invoke this command directly.
    optionsMenuCommand = async function (id) {
        if (id === 'option_continue') {
            menuController.close();
            return shell().continueLastReply();
        }
        return shell().getHistoryCommands().runHistoryMenuAction(id, false, {
            hasCharacter: () => state.this_chid !== undefined,
            isSending: () => Boolean(state.is_send_press),
            canRegenerate: canRegenerateLastReply,
            history: async () => {
                await displayPastChats();
                console.log('displaying shadow');
                const historyDialog = document.getElementById('shadow_select_chat_popup');
                if (!historyDialog.open) historyDialog.showModal();
                document.getElementById('select_chat_search').focus();
            },
            confirmNew: async () => {
                let deleteCurrentChat = false;
                const result = await state.Popup.show.confirm(t`Start new chat?`, await renderTemplateAsync('newChatConfirm'), {
                    okButton: t`Start new chat`,
                    cancelButton: t`Cancel`,
                    onClose: () => { deleteCurrentChat = Boolean(document.getElementById('del_chat_checkbox')?.checked); },
                });
                return result ? deleteCurrentChat : null;
            },
            newChat: deleteCurrentChat => doNewChat({ deleteCurrentChat }),
            newAssistant: newAssistantChat,
            deleteMessages: () => { setTimeout(() => openMessageDelete(), state.animation_duration); },
            regenerate: () => { void regenerateLastReply(); },
            closeChat: closeCurrentChat,
            memory: openChatMemoryPanel,
            wireLog: openWireLogPanel,
            backToMain: () => { void shell().backToMainChat(); },
            attachFile: () => shell().openFileAttachmentPicker(),
            closeMenu: () => menuController.close(),
        });
    };


    //////////////////////////////////////////////////////////////////////////////////////////////

    //functionality for the cancel delete messages button, reverts to normal display of input form
    function cancelMessageDeletion() {
        globalThis.__emberDeskBulkDeleteController.finish();
        document.getElementById('dialogue_del_mes').style.display = 'none';
        document.getElementById('send_form').style.display = state.css_send_form_display;

        state.is_delete_mode = false;
        requestComposerFocus();
    }

    //confirms message deletion with the "ok" button
    async function confirmMessageDeletion() {
        const controller = globalThis.__emberDeskBulkDeleteController;
        return controller.confirm(t`Deleting messages…`, async deletedFrom => {
            try {
                document.getElementById('dialogue_del_mes').setAttribute('aria-busy', 'true');

                await shell().getChatMessageCommands().deleteFrom(deletedFrom);
            } finally {
                const dialogue = document.getElementById('dialogue_del_mes');
                dialogue.style.display = 'none';
                dialogue.removeAttribute('aria-busy');
                document.getElementById('send_form').style.display = state.css_send_form_display;
                requestComposerFocus();
                state.is_delete_mode = false;
            }
        });
    }
    deleteMessageCommands = { cancel: cancelMessageDeletion, confirm: confirmMessageDeletion };
    // React owns delete and history close buttons; callers use the commands.
    document.getElementById('shadow_select_chat_popup').addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });
    document.getElementById('shadow_select_chat_popup').addEventListener('close', () => {
        fixToastrForDialogs();
        document.getElementById('options_button').focus();
    });




    state.mainChatMessageActionsController = createChatMessageActionsController(document, {
        getExpandMessageActions: () => false,
        animationDuration: state.animation_duration,
        animationEasing: state.animation_easing,
        onReactOwnedOutsideClick: () => {
            runMainChatVisibleMessageActionsShellAction({ kind: 'close' });
        },
        onStateChanged: () => {
            void mountReactMainChatMessageListPanel();
        },
    });
    state.mainChatMessageActionsController.init();



    //Select chat

    //**************************CHARACTER IMPORT EXPORT*************************//
    document.getElementById('character_import_button')?.addEventListener('click', function () {
        document.getElementById('character_import_file')?.click();
    });

    document.getElementById('character_import_file')?.addEventListener('change', async function (e) {
        const avatarInfo = document.getElementById('rm_info_avatar');
        if (avatarInfo) avatarInfo.replaceChildren();

        if (!(e.target instanceof HTMLInputElement)) {
            return;
        }

        if (!e.target.files.length) {
            return;
        }

        const avatarFileNames = [];
        for (const file of e.target.files) {
            const avatarFileName = await importCharacter(file);
            if (avatarFileName !== undefined) {
                avatarFileNames.push(avatarFileName);
            }
        }

        if (avatarFileNames.length > 0) {
            await handleUnifiedImport(avatarFileNames);
            selectImportedChar(avatarFileNames[avatarFileNames.length - 1]);
        }

        // Clear the file input value to allow re-uploading the same file
        e.target.value = '';
    });

    document.getElementById('export_button')?.addEventListener('click', function () {
        toggleCharacterExportPopup(this);
    });

    const exportDismissal = shell().getHistoryCommands().createExportPopupDismissal({
        isOpen: () => state.isExportPopupOpen,
        close: restoreFocus => closeCharacterExportPopup({ restoreFocus }),
    });
    document.addEventListener('keydown', function (event) {
        if (exportDismissal.key(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    });

    characterExportCommand = async function (format, { presaved = false } = {}) {
        return shell().getCharacterExportCommand()(format, {
            close: closeCharacterExportPopup,
            save: presaved ? async () => {} : createOrEditCharacter,
            request: async format => {
                const body = { format, avatar_url: state.characters[state.this_chid].avatar };
                const response = await fetch('/api/characters/export', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify(body),
                });
                if (!response.ok) return { ok: false, data: null };
                const filename = state.characters[state.this_chid].avatar.replace('.png', `.${format}`);
                return { ok: true, data: { filename, blob: await response.blob() } };
            },
            download: ({ filename, blob }) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.setAttribute('download', filename);
                document.body.appendChild(a);
                toastr.success(t`Character export download started.`, t`Export and Download`);
                a.click();
                URL.revokeObjectURL(a.href);
                document.body.removeChild(a);
            },
            failure: error => {
                if (error) console.error('Character export failed', error);
                toastr.error(t`Could not download file`, t`Export and Download`);
            },
        });
    };
    // React owns format and history import controls; callers use commands.

    async function importHistoryFiles(targetElement) {
        const formElement = document.getElementById('form_import_chat');
        if (!(targetElement instanceof HTMLInputElement) || !(formElement instanceof HTMLFormElement)) {
            return;
        }

        await shell().getHistoryImportCommand()(targetElement.files, {
            invalid: () => toastr.warning(t`Only JSON, JSONL, and chat ZIP files are supported for chat imports.`),
            importFile: (file, format) => {
                const formData = new FormData(formElement);
                formData.set('file_type', format);
                formData.set('avatar', file);
                formData.set('user_name', state.name1);
                return importCharacterChat(formData, { refresh: false });
            },
            complete: async names => {
                if (names.length > 0) toastr.success(t`Successfully imported ${names.length} chat(s).`);
                await displayPastChats(names);
            },
        });

        targetElement.value = '';
    }

    document.getElementById('dupe_button')?.addEventListener('click', async function () {
        await duplicateCharacter();
    });

    function onOutsidePointer(e) {
        const target = e.target instanceof Element ? e.target : e.target?.parentElement;
        exportDismissal.pointer(Boolean(target?.closest('#export_button')), Boolean(target?.closest('#export_format_popup')));
        handleWorkspaceDrawerOutsidePointer(target);
    }
    document.documentElement.addEventListener('touchstart', onOutsidePointer);
    document.documentElement.addEventListener('mousedown', onOutsidePointer);


    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const opener = target?.closest('.mes .avatar');
        if (!opener) return;
        const messageElement = opener.closest('.mes');
        const image = opener.querySelector(':scope > img');
        const thumbURL = image?.getAttribute('src');
        if (thumbURL == null) return;
        const charsPath = '/characters/';
        const targetAvatarImg = thumbURL.substring(thumbURL.lastIndexOf('=') + 1);
        const charname = targetAvatarImg.replace('.png', '');
        const isValidCharacter = state.characters.some(x => x.avatar === decodeURIComponent(targetAvatarImg));

        // Remove existing zoomed avatars for characters that are not the clicked character
        const previews = Array.from(document.querySelectorAll('.zoomed_avatar[forChar]'));
        previews.forEach(preview => {
            const currentForChar = preview.getAttribute('forChar');
            if (currentForChar !== charname) {
                console.debug(`Removing zoomed avatar for character: ${currentForChar}`);
                preview.remove();
            }
        });

        const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
        const existing = previews.filter(preview => preview.getAttribute('forChar') === charname);
        if (existing.length) {
            console.debug('removing container as it already existed');
            existing.forEach(preview => transitionOpacity(preview, { opacity: 0, duration: state.animation_duration, complete: () => preview.remove() }));
        } else {
            console.debug('making new container from template');
            const newElement = document.querySelector('#zoomed_avatar_template .zoomed_avatar')?.cloneNode(true);
            if (!newElement) return;
            newElement.setAttribute('forChar', charname);
            newElement.id = `zoomFor_${charname}`;
            newElement.style.display = 'flex';
            newElement.style.opacity = '0';
            document.body.append(newElement);
            transitionOpacity(newElement, { opacity: 1, duration: state.animation_duration });
            const zoomedAvatarImgElement = newElement.querySelector('img');
            if (!zoomedAvatarImgElement) return;
            zoomedAvatarImgElement.setAttribute('alt', image.getAttribute('alt') || t`Avatar preview`);
            const closePreview = () => {
                transitionOpacity(newElement, { opacity: 0, duration: state.animation_duration, complete: () => { newElement.remove(); opener.focus(); } });
            };
            const close = newElement.querySelector('.dragClose');
            close?.addEventListener('click', closePreview);
            close?.focus();
            newElement.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closePreview();
                }
            });
            if (messageElement.getAttribute('is_user') == 'true' || (messageElement.getAttribute('is_system') == 'true' && !isValidCharacter)) {
                //handle user and system avatars
                zoomedAvatarImgElement.setAttribute('src', thumbURL);
            } else if (messageElement.getAttribute('is_user') == 'false') { //handle char avatars
                zoomedAvatarImgElement.setAttribute('src', avatarSrc);
            }
            zoomedAvatarImgElement.addEventListener('dragstart', e => {
                console.log('saw drag on avatar!');
                e.preventDefault();
                e.stopPropagation();
            });
        }
    });


    delegate('click', '.open_alternate_greetings', openAlternateGreetings);

    let replacementCardChangeHandler;
    document.getElementById('char-management-dropdown')?.addEventListener('change', async (e) => {
        const targetElement = /** @type {HTMLSelectElement} */ (e.target);
        const target = targetElement.selectedOptions[0]?.id;
        switch (target) {
            case 'set_character_world':
                await openCharacterWorldPopup();
                break;

            case 'character_action_chat_lorebook':
                document.querySelector('.chat_lorebook_button')?.click();
                break;
            case 'set_chat_character_settings':
                await setCharacterSettingsOverrides();
                break;
            case 'renameCharButton':
                await renameCharacter();
                break;
            case 'import_character_info':
                await importEmbeddedWorldInfo();
                saveCharacterDebounced();
                break;

            case 'replace_update': {
                let onlineUrl = getCharacterSource(state.this_chid);

                const POPUP_RESULT_URL = state.POPUP_RESULT.CUSTOM1, POPUP_RESULT_FILE = state.POPUP_RESULT.CUSTOM2;
                const result = await state.Popup.show.confirm(t`Replace Character`,
                    `<p>${t`Choose a new character card to replace this character with.`}</p>` +
                    `<p>${t`You can also replace this character with the one from the online source.`}${onlineUrl ? `<br />This character was downloaded from: <var>${onlineUrl}</var>` : ''}</p>` +
                    `<p>${t`All chats, assets and group memberships will be preserved, but local changes to the character data will be lost.`}<br />${t`Proceed?`}</p>`,
                    {
                        okButton: false,
                        customButtons: [{
                            text: t`Replace with URL`,
                            result: POPUP_RESULT_URL,
                            classes: ['popup-button-ok'],
                        }, {
                            text: t`Replace with File`,
                            result: POPUP_RESULT_FILE,
                            classes: ['popup-button-ok'],
                        }],
                        defaultResult: onlineUrl ? POPUP_RESULT_URL : POPUP_RESULT_FILE,
                    });

                // Remember the chat currently selected, so we can reload it after the replacement
                const currentChatFile = state.characters[state.this_chid].chat;
                async function postReplace() {
                    await openCharacterChat(currentChatFile);
                }

                switch (result) {
                    case POPUP_RESULT_FILE: {
                        async function uploadReplacementCard(e) {
                            const file = e.target.files[0];
                            if (!file) {
                                return;
                            }

                            try {
                                const data = new Map();
                                data.set(file, state.characters[state.this_chid].avatar);
                                await processDroppedFiles([file], data);
                                await postReplace();
                            } catch {
                                toastr.error('Failed to replace the character card.', 'Something went wrong');
                            }
                        }
                        const input = document.getElementById('character_replace_file');
                        if (input) {
                            if (replacementCardChangeHandler) input.removeEventListener('change', replacementCardChangeHandler);
                            replacementCardChangeHandler = uploadReplacementCard;
                            input.addEventListener('change', replacementCardChangeHandler);
                            input.click();
                        }
                        break;
                    }
                    case POPUP_RESULT_URL: {
                        const inputUrl = await state.Popup.show.input(t`Replace Character from URL`,
                            `<p>${t`Enter the URL of the character card to replace this character with.`}</p>` +
                            (onlineUrl ? `<p>${t`This character was downloaded from: <var>${onlineUrl}</var>`}</p>` : ''),
                            onlineUrl);
                        if (!inputUrl) {
                            break;
                        }
                        onlineUrl = inputUrl;
                        await importFromExternalUrl(onlineUrl, { preserveFileName: state.characters[state.this_chid].avatar });
                        await postReplace();
                        break;
                    }
                }
            } break;
            case 'import_tags': {
                await importTags(state.characters[state.this_chid], { importSetting: state.tag_import_setting.ASK });
            } break;
            case 'character_action_export': {
                toggleCharacterExportPopup(getVisibleCharacterExportTrigger());
            } break;
            case 'character_action_duplicate': {
                await duplicateCharacter();
            } break;
            case 'delete_from_dropdown': {
                document.getElementById('delete_button')?.click();
            } break;
            /*case 'delete_button':
                popup_type = "del_ch";
                callPopup(`
                        <h3>Delete the character?</h3>
                        <b>THIS IS PERMANENT!<br><br>
                        THIS WILL ALSO DELETE ALL<br>
                        OF THE CHARACTER'S CHAT FILES.<br><br></b>`
                );
                break;*/
            default:
                await eventSource.emit(event_types.CHARACTER_MANAGEMENT_DROPDOWN, target);
        }
        targetElement.selectedIndex = 0;
    });

    window.addEventListener('beforeunload', () => {
        cancelTtsPlay();
        if (state.streamingProcessor) {
            console.log('Page reloaded. Aborting streaming...');
            state.streamingProcessor.onStopStreaming();
        }
    });

    let externalImportOpen = false;
    delegate('click', '.external_import_button, #external_import_button', async () => {
        if (externalImportOpen) return;
        externalImportOpen = true;
        const previousFocus = document.activeElement;
        const host = document.createElement('div');
        let unmount;
        const close = () => {
            externalImportOpen = false;
            try { unmount?.(); } finally { host.remove(); }
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
        const fail = error => {
            close();
            console.error('Could not open external import:', error);
            toastr.error(t`Import failed`);
        };
        try {
            const { mountExternalImportDialog } = await loadWorkspacePanelsModule();
            document.body.append(host);
            unmount = mountExternalImportDialog(host, url => importFromExternalUrl(url, { showDownloadErrors: false }), close,
                () => document.getElementById('character_import_file')?.click(), fail);
        } catch (error) {
            fail(error);
        }
    });

    state.charDragDropHandler = new state.DragAndDropHandler('body', async (files, event) => {
        if (!files.length) {
            await importFromURL(event.originalEvent.dataTransfer.items, files);
        }
        await processDroppedFiles(files);
    }, { noAnimation: true });

    state.chatDragDropHandler = new state.DragAndDropHandler('#select_chat_popup', async (_, event) => {
        const importFile = document.getElementById('chat_import_file');
        if (importFile instanceof HTMLInputElement) {
            importFile.files = event.originalEvent.dataTransfer.files;
            await importHistoryFiles(importFile);
        }
    });

    let avatarPanelAnimation;
    let avatarPanelHidden;
    let avatarPanelOverflow;
    document.getElementById('hideCharPanelAvatarButton')?.addEventListener('click', () => {
        const panel = document.getElementById('avatar-and-name-block');
        if (!panel) return;
        const hidden = avatarPanelAnimation ? avatarPanelHidden : getComputedStyle(panel).display === 'none';
        avatarPanelHidden = !hidden;
        if (avatarPanelAnimation) {
            avatarPanelAnimation.cancel();
            avatarPanelAnimation = undefined;
            panel.style.overflow = avatarPanelOverflow;
        }
        if (hidden) panel.style.display = '';
        if (hidden && getComputedStyle(panel).display === 'none') panel.style.display = 'block';
        avatarPanelOverflow = panel.style.overflow;
        if (!panel.animate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            panel.style.display = hidden ? panel.style.display : 'none';
            return;
        }
        panel.style.overflow = 'hidden';
        const height = `${panel.scrollHeight}px`;
        const animation = panel.animate(hidden ? [{ height: '0px' }, { height }] : [{ height }, { height: '0px' }], { duration: 400, easing: 'ease' });
        avatarPanelAnimation = animation;
        animation.finished.then(() => {
            if (avatarPanelAnimation !== animation) return;
            if (!hidden) panel.style.display = 'none';
            panel.style.overflow = avatarPanelOverflow;
            avatarPanelAnimation = undefined;
        }).catch(() => {});
    });

    // Compatibility fallback click path. React MainChatShowMoreOwnerPortal owns the
    // primary load-more control when the message-list panel is mounted (capture phase).
    delegate('click', '#show_more_messages', async function (event) {
        event.stopPropagation();
        event.preventDefault();
        await loadEarlierChatMessages();
    });

    delegate('click', '.open_characters_library', async function () {
        const popup = state.Popup.util.popups.find(popup => popup.dlg.contains(this));
        await popup?.completeAffirmative();
        await shell().openCharacterLibrary();
    });

    // Draft restore runs first in this handler: later CHAT_CHANGED subscribers
    // must not overwrite it with text belonging to the outgoing chat.
    eventSource.on(event_types.CHAT_CHANGED, (chatId) => {
        setComposerDraftContext({ avatarId: state.characters[state.this_chid]?.avatar ?? null, chatId });
        void mountReactWorkspaceShellChromeHost();
        void mountReactMainChatMessageListPanel();
    });

    eventSource.on(event_types.CHAT_RENAMED, ({ avatarId, oldFileName, newFileName }) => {
        renameComposerDraftContext(oldFileName, newFileName, avatarId ?? null);
    });

    eventSource.on(event_types.CHAT_LOADED, () => {
        void mountReactWorkspaceShellChromeHost();
        void mountReactMainChatMessageListPanel();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        void mountReactWorkspaceShellChromeHost();
        void mountReactMainChatMessageListPanel();
    });

    eventSource.on(event_types.MORE_MESSAGES_LOADED, () => {
        void mountReactWorkspaceShellChromeHost();
        void mountReactMainChatMessageListPanel();
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        void mountReactWorkspaceShellChromeHost();
        void mountReactMainChatMessageListPanel();
    });

    // Added here to prevent execution before script.js is loaded and get rid of quirky timeouts
    await bootstrapWorkspace();

    window.addEventListener('beforeunload', (e) => {
        if (state.isChatSaving || state.this_edit_mes_id >= 0) {
            e.preventDefault();
            e.returnValue = true;
        }
    });
}

/**
 * Trap mouse wheel inside of focused number inputs to prevent scrolling their containers.
 * Instead of firing wheel events, manually update both slider and input values.
 * This also makes wheel work inside Firefox.
 */
function handleInputWheel() {
    const minInterval = 25; // ms

    /**
     * Update input and slider values based on wheel delta
     * @param {HTMLInputElement} input The number input element
     * @param {HTMLInputElement|null} slider The associated range input element, if any
     * @param {number} deltaY The wheel deltaY value
     */
    function updateValue(input, slider, deltaY) {
        const currentValue = parseFloat(input.value);
        const step = parseFloat(input.step);
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        // Sanity checks before trying to calculate new value
        if (isNaN(currentValue) || isNaN(step) || step <= 0 || deltaY === 0) return;

        // Calculate new value based on wheel movement delta (negative = up, positive = down)
        let newValue = currentValue + (deltaY > 0 ? -step : step);
        // Ensure it's a multiple of step
        newValue = Math.round(newValue / step) * step;
        // Ensure it's within the min and max range (NaN-aware)
        newValue = !isNaN(min) ? Math.max(newValue, min) : newValue;
        newValue = !isNaN(max) ? Math.min(newValue, max) : newValue;
        // Simple fix for floating point precision issues
        newValue = Math.round(newValue * 1e10) / 1e10;

        // Update both input and slider values
        input.value = newValue.toString();
        if (slider) slider.value = newValue.toString();
        // Trigger input event (just ONE) to update any listeners
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
    }

    const updateValueThrottled = throttle(updateValue, minInterval);

    document.addEventListener('wheel', (e) => {
        // Try to carefully narrow down if we even need to fire this handler
        const input = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
        if (input && input.type === 'number' && input.hasAttribute('step') && input.dataset.workspaceNumeric !== 'react') {
            const parent = input.closest('.range-block-range-and-counter') ?? input.closest('div') ?? input.parentElement;
            const slider = /** @type {HTMLInputElement} */ (parent?.querySelector('input[type="range"]'));

            // Stop propagation for either target
            if (e.target === input || (slider && e.target === slider)) {
                e.stopPropagation();
                e.preventDefault();

                updateValueThrottled(input, slider, e.deltaY);
            }
        }
    }, { passive: false });
}
