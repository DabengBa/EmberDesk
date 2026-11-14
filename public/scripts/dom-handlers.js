import { throttle } from './utils.js';
import { debounce_timeout } from './constants.js';
import { eventSource, event_types } from './events.js';

import { requireDomHandlersShellContext } from './dom-handlers-shell-context.js';
import { renameComposerDraftContext, setComposerDraftContext, requestComposerFocus } from './main-chat-composer-service.js';
import { installWorkspaceInteractionCommands } from './workspace-interaction-commands.js';
import { transitionOpacity } from './chat-ui-motion.js';

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

export function runCharacterExportCommand(format) {
    if (!characterExportCommand) throw new Error('Character export command unavailable');
    return characterExportCommand(format);
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
const chooseBogusFolder = (...args) => shell().chooseBogusFolder(...args);
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
const isReactMainChatOwner = (...args) => shell().isReactMainChatOwner(...args);

const loadEarlierChatMessages = (...args) => shell().loadEarlierChatMessages(...args);
const messageEdit = (...args) => shell().messageEdit(...args);
const messageEditCancel = (...args) => shell().messageEditCancel(...args);
const messageEditDone = (...args) => shell().messageEditDone(...args);
const messageEditMove = (...args) => shell().messageEditMove(...args);
const mountCharacterContextMenu = (...args) => shell().mountCharacterContextMenu(...args);
const mountCharacterPopup = (...args) => shell().mountCharacterPopup(...args);
const mountChatComposer = (...args) => shell().mountChatComposer(...args);
const mountDialogueDelMesControls = (...args) => shell().mountDialogueDelMesControls(...args);

const mountExportFormatPopup = (...args) => shell().mountExportFormatPopup(...args);
const mountOptionsMenu = (...args) => shell().mountOptionsMenu(...args);
const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const mountReactWorkspaceShellChromeHost = (...args) => shell().mountReactWorkspaceShellChromeHost(...args);
const mountRightNavPanel = (...args) => shell().mountRightNavPanel(...args);
const mountSelectChatPopup = (...args) => shell().mountSelectChatPopup(...args);
const newAssistantChat = (...args) => shell().newAssistantChat(...args);
const openAlternateGreetings = (...args) => shell().openAlternateGreetings(...args);
const openCharacterChat = (...args) => shell().openCharacterChat(...args);
const openCharacterWorldPopup = (...args) => shell().openCharacterWorldPopup(...args);
const openMessageDelete = (...args) => shell().openMessageDelete(...args);
const openWireLogPanel = (...args) => shell().openWireLogPanel(...args);
const openChatMemoryPanel = (...args) => shell().openChatMemoryPanel(...args);

const processDroppedFiles = (...args) => shell().processDroppedFiles(...args);
const queueReactCharacterAuthoringRemount = (...args) => shell().queueReactCharacterAuthoringRemount(...args);
const read_avatar_load = (...args) => shell().read_avatar_load(...args);
const regenerateLastReply = (...args) => shell().regenerateLastReply(...args);
const renameCharacter = (...args) => shell().renameCharacter(...args);
const renameChat = (...args) => shell().renameChat(...args);
const renderTemplateAsync = (...args) => shell().renderTemplateAsync(...args);

const runMainChatVisibleMessageActionsShellAction = (...args) => shell().runMainChatVisibleMessageActionsShellAction(...args);
const saveCharacterDebounced = (...args) => shell().saveCharacterDebounced(...args);
const saveChatConditional = (...args) => shell().saveChatConditional(...args);

const selectCharacterById = (...args) => shell().selectCharacterById(...args);
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
    // React-owned composer markup must exist before handlers bind below.
    await mountChatComposer();
    // React-owned static panels must exist before the direct $(...).on()
    // bindings below; bootstrapWorkspace re-invokes these mounts later, and
    // each mount is idempotent via its dataset.react*Mounted guard. Dialogue
    // controls mount during bootstrap after their controller is initialized.
    await Promise.all([
        mountCharacterPopup(),
        mountRightNavPanel(),
        mountSelectChatPopup(),
        mountCharacterContextMenu(),
        mountOptionsMenu(),
        mountExportFormatPopup(),
        mountDialogueDelMesControls(),
    ]);

    initCharacterSearch();

    //menu buttons setup

    $('#rm_button_characters').on('click', function () {
        state.selected_button = 'characters';
        select_rm_characters();
    });
    $('#rm_button_back').on('click', function () {
        state.selected_button = 'characters';
        select_rm_characters();
    });
    $('#rm_button_create').on('click', function () {
        state.selected_button = 'create';
        select_rm_create();
        // This is also the React Character Library's New action. Selecting the
        // legacy-compatible panel does not emit CHARACTER_EDITOR_OPENED, so mount
        // the sole-owner authoring UI explicitly for new-character drafts.
        queueReactCharacterAuthoringRemount();
    });
    $('#rm_button_selected_ch').on('click', function () {
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

    $(document).on('click', '.character_select', async function () {
        const id = Number($(this).attr('data-chid'));
        await selectCharacterById(id);
    });

    $(document).on('click', '.bogus_folder_select', function () {
        const tagId = $(this).attr('tagid');
        console.debug('Bogus folder clicked', tagId);
        chooseBogusFolder($(this), tagId);
    });

    const cssAutofit = CSS.supports('field-sizing', 'content');
    if (!cssAutofit) {
        /**
         * Sets the scroll height of the edit textarea to fit the content.
         * @param {HTMLTextAreaElement} e Textarea element to auto-fit
         */
        function autoFitEditTextArea(e) {
            const scrollTop = state.chatElement.scrollTop();
            e.style.height = '0px';
            const newHeight = e.scrollHeight + 4;
            e.style.height = `${newHeight}px`;
            state.chatElement.scrollTop(scrollTop);
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

    const chatElementScroll = document.getElementById('chat');
    const chatScrollHandler = function () {
        const scrollIsAtBottom = Math.abs(chatElementScroll.scrollHeight - chatElementScroll.clientHeight - chatElementScroll.scrollTop) < 5;

        // Resume autoscroll if the user scrolls to the bottom
        if (state.scrollLock && scrollIsAtBottom) {
            state.scrollLock = false;
        }

        // Cancel autoscroll if the user scrolls up
        if (!state.scrollLock && !scrollIsAtBottom) {
            state.scrollLock = true;
        }
    };
    chatElementScroll.addEventListener('scroll', chatScrollHandler, { passive: true });

    function selectMessageForDeletion(index) {
        const count = state.chat.length - index;
        globalThis.__emberDeskBulkDeleteController.select(index, t`Delete ${count} messages, from message ${index + 1} through the end of this chat.`, t`Delete ${count} messages`);
    }
    globalThis.__emberDeskBulkDeleteController.setSelectionHandler(selectMessageForDeletion);

    $(document).on('click', '.mes', function () {
        //when a 'delete message' parent div is clicked
        // and we are in delete mode and del_checkbox is visible
        const row = $(this);
        const deleteCheckbox = row.find('.del_checkbox').first();

        if (row.is('[data-main-chat-message-row-owner="react"]') || !state.is_delete_mode || !deleteCheckbox.is(':visible')) {
            return;
        }
        globalThis.__emberDeskBulkDeleteController.selectLegacyRange(Number(row.attr('mesid')), state.chat.length, {
            clear: () => $('.mes').each(function () {
                const candidateRow = $(this);
                candidateRow.find('.del_checkbox').first().prop('checked', false);
                candidateRow.removeClass('selected');
            }),
            markClicked: () => row.addClass('selected'),
            announce: selectMessageForDeletion,
            select: index => {
                const selectedRow = $(`.mes[mesid="${index}"]`);
                selectedRow.addClass('selected');
                selectedRow.find('.del_checkbox').first().prop('checked', true);
            },
        });
    });

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
            hideMenu: () => $('#options').hide(),
            reopen: () => { void runOptionsMenuCommand('option_select_chat'); },
            schedule: callback => setTimeout(callback, 2000),
        });
    }

    $(document).on('click', '.PastChat_cross', function (e) {
        e.stopPropagation();
        if (e.isTrigger) e.preventDefault();
        return deleteChatByFileName($(this).attr('file_name'));
    });


    $('#character_cross').on('click', function () {
        state.is_advanced_char_open = false;
        const popup = document.getElementById('character_popup');
        transitionOpacity(popup, {
            opacity: 0,
            duration: state.animation_duration,
            easing: state.animation_easing,
            complete() { popup.style.display = 'none'; },
        });
    });

    $('#character_popup_ok').on('click', function () {
        state.is_advanced_char_open = false;
        $('#character_popup').css('display', 'none');
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
                    $('#shadow_popup').css('display', 'none');
                    $('#dialogue_popup').removeClass('large_dialogue_popup');
                    $('#dialogue_popup').removeClass('wide_dialogue_popup');
                },
            });
        }

        const controller = state.dialogueController;
        if (controller?.getSnapshot().open) {
            if (state.popup_type == 'input' && $('#dialogue_popup_input').attr('data-react-dialogue-input') !== 'true') {
                controller.setInput(String($('#dialogue_popup_input').val() ?? ''));
                $('#dialogue_popup_input').val('');
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
                    $('#shadow_popup').css('display', 'none');
                    $('#dialogue_popup').removeClass('large_dialogue_popup');
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
    // Enter/Escape and third-party jQuery triggers retain their old entrypoint;
    // native button clicks are owned by React.
    $(document).on('click', '#dialogue_popup_ok', function (event) {
        if (!event.isTrigger) return;
        event.preventDefault();
        return confirmDialoguePopup();
    });
    $(document).on('click', '#dialogue_popup_cancel', function (event) {
        if (!event.isTrigger) return;
        event.preventDefault();
        return cancelDialoguePopup();
    });

    $('#add_avatar_button').on('change', function () {
        const inputElement = /** @type {HTMLInputElement} */ (this);
        read_avatar_load(inputElement);
    });

    $('#form_create').on('submit', (e) => createOrEditCharacter(e.originalEvent));

    $('#delete_button').on('click', async function () {
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
                clearWorldReferences: dialogResult.clearWorldReferences,
            });
        } else {
            let deleteChats = false;
            const confirm = await state.Popup.show.confirm(deleteDialogTitle, content, {
                leftAlign: true,
                defaultResult: state.POPUP_RESULT.NEGATIVE,
                onClose: () => { deleteChats = !!$('#del_char_checkbox').prop('checked'); },
            });
            if (!confirm) {
                return;
            }
            await deleteCharacter(avatarToDelete, {
                deleteChats,
                temporaryChatAcknowledged: inTempChat,
                deleteWorlds: [],
                clearWorldReferences: false,
            });
        }
    });

    //////// OPTIMIZED ALL CHAR CREATION/EDITING TEXTAREA LISTENERS ///////////////

    $('#character_name_pole').on('input', function () {
        if (state.menu_type == 'create') {
            state.create_save.name = String($('#character_name_pole').val());
        }
    });

    const elementsToUpdate = {
        '#description_textarea': function () { state.create_save.description = String($('#description_textarea').val()); },
        '#creator_notes_textarea': function () { state.create_save.creator_notes = String($('#creator_notes_textarea').val()); },
        '#character_version_textarea': function () { state.create_save.character_version = String($('#character_version_textarea').val()); },
        '#system_prompt_textarea': function () { state.create_save.system_prompt = String($('#system_prompt_textarea').val()); },
        '#post_history_instructions_textarea': function () { state.create_save.post_history_instructions = String($('#post_history_instructions_textarea').val()); },
        '#creator_textarea': function () { state.create_save.creator = String($('#creator_textarea').val()); },
        '#tags_textarea': function () { state.create_save.tags = String($('#tags_textarea').val()); },
        '#scenario_pole': function () { state.create_save.scenario = String($('#scenario_pole').val()); },
        '#firstmessage_textarea': function () { state.create_save.first_message = String($('#firstmessage_textarea').val()); },
        '#depth_prompt_prompt': function () { state.create_save.depth_prompt_prompt = String($('#depth_prompt_prompt').val()); },
        '#depth_prompt_depth': function () { state.create_save.depth_prompt_depth = Number($('#depth_prompt_depth').val()); },
        '#depth_prompt_role': function () { state.create_save.depth_prompt_role = String($('#depth_prompt_role').val()); },
    };

    Object.keys(elementsToUpdate).forEach(function (id) {
        $(id).on('input', function () {
            if (state.menu_type == 'create') {
                elementsToUpdate[id]();
            } else if (!shell().isAuthoringMirrorWrite?.()) {
                saveCharacterDebounced();
            }
        });
    });

    $('#creator_notes_textarea').on('input', function () {
        const notes = String($('#creator_notes_textarea').val());
        const avatar = state.menu_type === 'create' ? '' : state.characters[state.this_chid]?.avatar;
        $('#creator_notes_spoiler').html(formatCreatorNotes(notes, avatar));
    });

    $('#favorite_button').on('click', function () {
        const newFavState = !state.fav_ch_checked;
        updateFavButtonState(newFavState);
        if (state.menu_type != 'create') {
            updateCharacterRow(state.this_chid, { fav: newFavState });
            saveCharacterDebounced();
        }
    });

    /* $("#renameCharButton").on('click', renameCharacter); */

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
        const popupText = $('<div></div>').html(await renderTemplateAsync('chatRename'));
        const errorText = $('<p role="alert" class="chat-rename-error" hidden></p>');
        popupText.append(errorText);
        let currentPopup;
        const rename = shell().getHistoryCommands().createHistoryRenameCommand(oldFileName, {
            invalid: () => {
                errorText.text(t`Enter a chat name.`).prop('hidden', false);
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
            failed: () => errorText.text(t`Chat was not renamed. Check the name and connection, then try again.`).prop('hidden', false),
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
    // Compatibility for programmatic jQuery triggers and non-React rows. React
    // rows stop propagation and invoke the commands above directly.
    $(document).on('click', '.select_chat_block', function (event) {
        if (event.isTrigger) event.preventDefault();
        return openHistoryChat($(this).attr('file_name'));
    });
    $(document).on('click', '.renameChatButton', function (event) {
        event.stopPropagation();
        if (event.isTrigger) event.preventDefault();
        return renameHistoryChat($(this).closest('.select_chat_block_wrapper').find('.select_chat_block_filename').text());
    });
    $(document).on('click', '.exportChatButton, .exportRawChatButton', function (event) {
        event.stopPropagation();
        if (event.isTrigger) event.preventDefault();
        return exportHistoryChat($(this).closest('.select_chat_block_wrapper').find('.select_chat_block_filename').text(), $(this).data('format') || 'txt');
    });


    const button = $('#options_button');
    const menu = $('#options');


    function showMenu() {
        button.attr('aria-expanded', 'true');
        showBranchChatButtons();
        setOptionsMenuRegenerateAvailability(canRegenerateLastReply());
        menu.fadeIn(state.animation_duration);
        getOptionsPopper()?.update();
    }

    function hideMenu() {
        button.attr('aria-expanded', 'false');
        menu.fadeOut(state.animation_duration);
        getOptionsPopper()?.update();
    }

    function isMouseOverButtonOrMenu() {
        return menu.is(':hover, :focus-within') || button.is(':hover, :focus');
    }

    const createMenuController = shell().getOptionsMenuControllerFactory();
    const menuController = createMenuController({ show: showMenu, hide: hideMenu, focus: () => button.trigger('focus') });
    menuController.attach(button[0], document, isMouseOverButtonOrMenu);
    button.on('click', event => { if (event.isTrigger) { event.preventDefault(); menuController.toggle(); } });

    ///////////// OPTIMIZED LISTENERS FOR LEFT SIDE OPTIONS POPUP MENU //////////////////////
    // Delegated binding: the menu items are React-owned inside #options and can be
    // remounted; a document-level handler keeps jQuery-trigger compatibility.
    optionsMenuCommand = async function (id) {
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
                    onClose: () => { deleteCurrentChat = !!$('#del_chat_checkbox').prop('checked'); },
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
    $(document).on('click', '#options [id]', function (event) {
        const id = $(this).attr('id');
        if (event.isTrigger && ['option_start_new_chat', 'option_close_chat', 'option_select_chat', 'option_regenerate', 'option_chat_memory', 'option_wire_log', 'option_delete_mes', 'option_back_to_main', 'attachFile'].includes(id)) event.preventDefault();
        return optionsMenuCommand(id);
    });

    $('#newChatFromManageScreenButton').on('click', function (event) {
        if (event.isTrigger) { event.preventDefault(); return runHistoryRowCommand('newChat'); }
    });

    //////////////////////////////////////////////////////////////////////////////////////////////

    //functionality for the cancel delete messages button, reverts to normal display of input form
    function cancelMessageDeletion() {
        globalThis.__emberDeskBulkDeleteController.finish();
        $('#dialogue_del_mes').css('display', 'none');
        $('#send_form').css('display', state.css_send_form_display);
        $('.del_checkbox').each(function () {
            const checkbox = $(this);
            const row = checkbox.closest('.mes');
            if (row.is('[data-main-chat-message-row-owner="react"]')) return;
            checkbox.css('display', 'none');
            row.find('.for_checkbox').first().css('display', 'block');
            row.removeClass('selected');
            checkbox.prop('checked', false);
        });
        state.is_delete_mode = false;
        requestComposerFocus();
    }

    //confirms message deletion with the "ok" button
    async function confirmMessageDeletion() {
        const controller = globalThis.__emberDeskBulkDeleteController;
        return controller.confirm(t`Deleting messages…`, async deletedFrom => {
            try {
                $('#dialogue_del_mes').attr('aria-busy', 'true');
                $('.del_checkbox').each(function () {
                    const checkbox = $(this);
                    const row = checkbox.closest('.mes');
                    if (row.is('[data-main-chat-message-row-owner="react"]')) return;
                    checkbox.css('display', 'none');
                    row.find('.for_checkbox').first().css('display', 'block');
                    row.removeClass('selected');
                    checkbox.prop('checked', false);
                });
                await shell().getChatMessageCommands().deleteFrom(deletedFrom);
            } finally {
                $('#dialogue_del_mes').css('display', 'none').removeAttr('aria-busy');
                $('#send_form').css('display', state.css_send_form_display);
                requestComposerFocus();
                state.is_delete_mode = false;
            }
        });
    }
    deleteMessageCommands = { cancel: cancelMessageDeletion, confirm: confirmMessageDeletion };
    $('#dialogue_del_mes_cancel').on('click', event => { if (event.isTrigger) { event.preventDefault(); return cancelMessageDeletion(); } });
    $('#dialogue_del_mes_ok').on('click', event => { if (event.isTrigger) { event.preventDefault(); return confirmMessageDeletion(); } });


    $('#select_chat_cross').on('click', function (event) {
        if (event.isTrigger) { event.preventDefault(); closeSelectChatPopup(); }
    });
    document.getElementById('shadow_select_chat_popup').addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });
    document.getElementById('shadow_select_chat_popup').addEventListener('close', () => {
        document.getElementById('options_button').focus();
    });

    $(document).on('pointerup', '.mes_copy', async function () {
        if (isReactMainChatOwner() && $(this).closest('[data-main-chat-message-row-owner="react"]').length > 0) {
            return;
        }
        if (state.this_chid !== undefined || state.name2 === state.neutralCharacterName) {
            try {
                const messageId = $(this).closest('.mes').attr('mesid');
                const text = state.chat[messageId].mes;
                await copyText(text);
                toastr.info('Copied!', '', { timeOut: 2000 });
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        }
    });

    //********************
    //***Message Editor***
    $(document).on('click', '.mes_edit', async function () {
        if (isReactMainChatOwner()) {
            return;
        }
        if (state.is_delete_mode) {
            return;
        }
        if (state.this_chid !== undefined || state.name2 === state.neutralCharacterName) {
            // Previously system messages we're allowed to be edited
            /*const message = $(this).closest(".mes");

            if (message.data("isSystem")) {
                return;
            }*/

            if (state.this_edit_mes_id >= 0) {
                let mes_edited = state.chatElement.find(`[mesid="${state.this_edit_mes_id}"]`).find('.mes_edit_done');
                await messageEditDone(mes_edited);
            }
            var edit_mes_id = Number($(this).closest('.mes').attr('mesid'));

            await messageEdit(edit_mes_id);
        }
    });


    state.mainChatMessageActionsController = createChatMessageActionsController(document, {
        getExpandMessageActions: () => false,
        animationDuration: state.animation_duration,
        animationEasing: state.animation_easing,
        onReactOwnedOutsideClick: () => {
            if (isReactMainChatOwner()) {
                runMainChatVisibleMessageActionsShellAction({ kind: 'close' });
            }
        },
        onStateChanged: () => {
            void mountReactMainChatMessageListPanel();
        },
    });
    state.mainChatMessageActionsController.init();

    $(document).on('click', '.mes_edit_cancel', async function () {
        if (isReactMainChatOwner()) {
            return;
        }
        await messageEditCancel.call(this, state.this_edit_mes_id);
    });

    $(document).on('click', '.mes_edit_up', async function () {
        if (isReactMainChatOwner()) return;
        if (state.this_edit_mes_id <= 0) {
            return;
        }
        const targetId = Number(state.this_edit_mes_id) - 1;
        await messageEditMove(state.this_edit_mes_id, targetId);
    });

    $(document).on('click', '.mes_edit_down', async function () {
        if (isReactMainChatOwner()) return;
        if (state.this_edit_mes_id >= state.chat.length - 1) {
            return;
        }

        const targetId = Number(state.this_edit_mes_id) + 1;
        await messageEditMove(state.this_edit_mes_id, targetId);
    });

    $(document).on('click', '.mes_edit_copy', async function () {
        if (isReactMainChatOwner()) return;
        const confirmation = await callGenericPopup(t`Create a copy of this message?`, state.POPUP_TYPE.CONFIRM);
        if (!confirmation) {
            return;
        }

        await shell().getChatMessageCommands().duplicateMessage(state.this_edit_mes_id);
    });

    $(document).on('click', '.mes_edit_delete', async function () {
        if (isReactMainChatOwner()) return;
        await deleteMessage(Number(state.this_edit_mes_id), true);
    });

    $(document).on('click', '.mes_edit_done', async function () {
        if (isReactMainChatOwner()) {
            return;
        }
        await messageEditDone($(this));
    });

    //Select chat

    //**************************CHARACTER IMPORT EXPORT*************************//
    $('#character_import_button').on('click', function () {
        $('#character_import_file').trigger('click');
    });

    $('#character_import_file').on('change', async function (e) {
        $('#rm_info_avatar').html('');

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

    $('#export_button').on('click', function () {
        toggleCharacterExportPopup(this);
    });

    const exportDismissal = shell().getHistoryCommands().createExportPopupDismissal({
        isOpen: () => state.isExportPopupOpen,
        close: restoreFocus => closeCharacterExportPopup({ restoreFocus }),
    });
    $(document).on('keydown', function (event) {
        if (exportDismissal.key(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    });

    characterExportCommand = async function (format) {
        return shell().getCharacterExportCommand()(format, {
            close: closeCharacterExportPopup,
            save: createOrEditCharacter,
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
    $(document).on('click', '.export_format', function (event) {
        if (event.isTrigger) event.preventDefault();
        return characterExportCommand($(this).data('format'));
    });
    //**************************CHAT IMPORT EXPORT*************************//
    $('#chat_import_button').on('click', function (event) {
        if (!event.isTrigger) return;
        event.preventDefault();
        $('#chat_import_file').trigger('click');
    });

    $('#chat_import_file').on('change', function (event) {
        if (event.isTrigger) return importHistoryFiles(event.target);
    });

    async function importHistoryFiles(targetElement) {
        const formElement = document.getElementById('form_import_chat');
        if (!(targetElement instanceof HTMLInputElement) || !(formElement instanceof HTMLFormElement)) {
            return;
        }

        await shell().getHistoryImportCommand()(targetElement.files, {
            invalid: () => toastr.warning(t`Only JSON and JSONL files are supported for chat imports.`),
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

    $('#dupe_button').on('click', async function () {
        await duplicateCharacter();
    });

    $('html').on('touchstart mousedown', async function (e) {
        const clickTarget = $(e.target);

        exportDismissal.pointer(Boolean(clickTarget.closest('#export_button').length), Boolean(clickTarget.closest('#export_format_popup').length));

        // Drawer policy lives in the typed service; this listener remains for
        // the separate export-popup compatibility behavior above.
        const target = e.target instanceof Element ? e.target : e.target?.parentElement;
        handleWorkspaceDrawerOutsidePointer(target);
    });


    $(document).on('click', '.mes .avatar', function () {
        const messageElement = $(this).closest('.mes');
        const thumbURL = $(this).children('img').attr('src');
        const charsPath = '/characters/';
        const targetAvatarImg = thumbURL.substring(thumbURL.lastIndexOf('=') + 1);
        const charname = targetAvatarImg.replace('.png', '');
        const isValidCharacter = state.characters.some(x => x.avatar === decodeURIComponent(targetAvatarImg));

        // Remove existing zoomed avatars for characters that are not the clicked character
        $('.zoomed_avatar').each(function () {
            const currentForChar = $(this).attr('forChar');
            if (currentForChar !== charname && typeof currentForChar !== 'undefined') {
                console.debug(`Removing zoomed avatar for character: ${currentForChar}`);
                $(this).remove();
            }
        });

        const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
        if ($(`.zoomed_avatar[forChar="${charname}"]`).length) {
            console.debug('removing container as it already existed');
            $(`.zoomed_avatar[forChar="${charname}"]`).fadeOut(state.animation_duration, () => {
                $(`.zoomed_avatar[forChar="${charname}"]`).remove();
            });
        } else {
            console.debug('making new container from template');
            const template = $('#zoomed_avatar_template').html();
            const newElement = $(template);
            newElement.attr('forChar', charname);
            newElement.attr('id', `zoomFor_${charname}`);

            $('body').append(newElement);
            newElement.fadeIn(state.animation_duration);
            const zoomedAvatarImgElement = $(`.zoomed_avatar[forChar="${charname}"] img`);
            zoomedAvatarImgElement.attr('alt', $(this).children('img').attr('alt') || t`Avatar preview`);
            const opener = this;
            const closePreview = () => {
                newElement.fadeOut(state.animation_duration, () => {
                    newElement.remove();
                    opener.focus();
                });
            };
            newElement.find('.dragClose').on('click', closePreview).trigger('focus');
            newElement.on('keydown', event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closePreview();
                }
            });
            if (messageElement.attr('is_user') == 'true' || (messageElement.attr('is_system') == 'true' && !isValidCharacter)) {
                //handle user and system avatars
                zoomedAvatarImgElement.attr('src', thumbURL);
            } else if (messageElement.attr('is_user') == 'false') { //handle char avatars
                zoomedAvatarImgElement.attr('src', avatarSrc);
            }
            $(`.zoomed_avatar[forChar="${charname}"]`).css('display', 'flex');

            zoomedAvatarImgElement.on('dragstart', (e) => {
                console.log('saw drag on avatar!');
                e.preventDefault();
                return false;
            });
        }
    });


    $(document).on('click', '.open_alternate_greetings', openAlternateGreetings);
    /* $('#set_character_world').on('click', openCharacterWorldPopup); */

    $('#char-management-dropdown').on('change', async (e) => {
        const targetElement = /** @type {HTMLSelectElement} */ (e.target);
        const target = $(targetElement.selectedOptions).attr('id');
        switch (target) {
            case 'set_character_world':
                await openCharacterWorldPopup();
                break;

            case 'character_action_chat_lorebook':
                $('.chat_lorebook_button').first().trigger('click');
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
                        $('#character_replace_file').off('change').on('change', uploadReplacementCard).trigger('click');
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
                $('#delete_button').trigger('click');
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
        $('#char-management-dropdown').prop('selectedIndex', 0);
    });

    $(window).on('beforeunload', () => {
        cancelTtsPlay();
        if (state.streamingProcessor) {
            console.log('Page reloaded. Aborting streaming...');
            state.streamingProcessor.onStopStreaming();
        }
    });

    $(document).on('click', '.external_import_button, #external_import_button', async () => {
        const html = await renderTemplateAsync('importCharacters');
        const input = await callGenericPopup(html, state.POPUP_TYPE.INPUT, '', { allowVerticalScrolling: true, wider: true, okButton: $('#popup_template').attr('popup-button-import'), rows: 4 });

        if (!input) {
            console.debug('Custom content import cancelled');
            return;
        }

        // break input into one input per line
        const inputs = String(input).split('\n').map(x => x.trim()).filter(x => x.length > 0);

        for (const url of inputs) {
            await importFromExternalUrl(url);
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

    $('#hideCharPanelAvatarButton').on('click', () => {
        $('#avatar-and-name-block').slideToggle();
    });

    // Compatibility fallback click path. React MainChatShowMoreOwnerPortal owns the
    // primary load-more control when the message-list panel is mounted (capture phase).
    $(document).on('click', '#show_more_messages', async function (event) {
        event.stopPropagation();
        event.preventDefault();
        await loadEarlierChatMessages();
    });

    $(document).on('click', '.open_characters_library', async function () {
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
