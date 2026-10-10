import { throttle } from './utils.js';
import { SWIPE_DIRECTION, SWIPE_STATE, debounce_timeout } from './constants.js';
import { eventSource, event_types } from './events.js';
import { swipe } from './generation-service.js';
import { updateMessageElement } from './message-service.js';
import { requireDomHandlersShellContext } from './dom-handlers-shell-context.js';
import { initMainChatComposerService } from './main-chat-composer-service.js';

function shell() {
    return requireDomHandlersShellContext();
}

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

const Generate = (...args) => shell().Generate(...args);
const bootstrapWorkspace = (...args) => shell().bootstrapWorkspace(...args);
const buildCascadeSectionHtml = (...args) => shell().buildCascadeSectionHtml(...args);
const buildTemporaryChatDeleteWarningHtml = (...args) => shell().buildTemporaryChatDeleteWarningHtml(...args);
const callGenericPopup = (...args) => shell().callGenericPopup(...args);
const cancelTtsPlay = (...args) => shell().cancelTtsPlay(...args);
const chooseBogusFolder = (...args) => shell().chooseBogusFolder(...args);
const closeCharacterExportPopup = (...args) => shell().closeCharacterExportPopup(...args);
const closeCurrentChat = (...args) => shell().closeCurrentChat(...args);
const closeMessageEditor = (...args) => shell().closeMessageEditor(...args);
const copyText = (...args) => shell().copyText(...args);
const createChatMessageActionsController = (...args) => shell().createChatMessageActionsController(...args);
const createOrEditCharacter = (...args) => shell().createOrEditCharacter(...args);
const debounce = (...args) => shell().debounce(...args);
const delChat = (...args) => shell().delChat(...args);
const delay = (...args) => shell().delay(...args);
const deleteCharacter = (...args) => shell().deleteCharacter(...args);
const deleteMessage = (...args) => shell().deleteMessage(...args);
const displayPastChats = (...args) => shell().displayPastChats(...args);
const doCharListDisplaySwitch = (...args) => shell().doCharListDisplaySwitch(...args);
const doDrawerOpenClick = (...args) => shell().doDrawerOpenClick(...args);
const doNewChat = (...args) => shell().doNewChat(...args);
const download = (...args) => shell().download(...args);
const duplicateCharacter = (...args) => shell().duplicateCharacter(...args);
const formatCreatorNotes = (...args) => shell().formatCreatorNotes(...args);
const getCharacterDeleteDialogTitle = (...args) => shell().getCharacterDeleteDialogTitle(...args);
const getCharacterSource = (...args) => shell().getCharacterSource(...args);
const getCharacters = (...args) => shell().getCharacters(...args);
const getOptionsPopper = (...args) => shell().getOptionsPopper(...args);
const getRequestHeaders = (...args) => shell().getRequestHeaders(...args);
const handleUnifiedImport = (...args) => shell().handleUnifiedImport(...args);
const hideSwipeButtons = (...args) => shell().hideSwipeButtons(...args);
const importCharacter = (...args) => shell().importCharacter(...args);
const importCharacterChat = (...args) => shell().importCharacterChat(...args);
const importEmbeddedWorldInfo = (...args) => shell().importEmbeddedWorldInfo(...args);
const importFromExternalUrl = (...args) => shell().importFromExternalUrl(...args);
const importFromURL = (...args) => shell().importFromURL(...args);
const importTags = (...args) => shell().importTags(...args);
const initCharacterSearch = (...args) => shell().initCharacterSearch(...args);
const isDataURL = (...args) => shell().isDataURL(...args);
const isReactMainChatOwner = (...args) => shell().isReactMainChatOwner(...args);
const isValidUrl = (...args) => shell().isValidUrl(...args);
const loadEarlierChatMessages = (...args) => shell().loadEarlierChatMessages(...args);
const messageEdit = (...args) => shell().messageEdit(...args);
const messageEditCancel = (...args) => shell().messageEditCancel(...args);
const messageEditDone = (...args) => shell().messageEditDone(...args);
const messageEditMove = (...args) => shell().messageEditMove(...args);
const mountAiConfigPanel = (...args) => shell().mountAiConfigPanel(...args);
const mountCharacterContextMenu = (...args) => shell().mountCharacterContextMenu(...args);
const mountCharacterPopup = (...args) => shell().mountCharacterPopup(...args);
const mountChatComposer = (...args) => shell().mountChatComposer(...args);
const mountDialogueDelMesControls = (...args) => shell().mountDialogueDelMesControls(...args);
const mountDialoguePopupControls = (...args) => shell().mountDialoguePopupControls(...args);
const mountOnboardingActions = (...args) => shell().mountOnboardingActions(...args);
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
const pauseScriptExecution = (...args) => shell().pauseScriptExecution(...args);
const processDroppedFiles = (...args) => shell().processDroppedFiles(...args);
const queueReactCharacterAuthoringRemount = (...args) => shell().queueReactCharacterAuthoringRemount(...args);
const read_avatar_load = (...args) => shell().read_avatar_load(...args);
const renameCharacter = (...args) => shell().renameCharacter(...args);
const renameChat = (...args) => shell().renameChat(...args);
const renderTemplateAsync = (...args) => shell().renderTemplateAsync(...args);
const resetMovableStyles = (...args) => shell().resetMovableStyles(...args);
const resetScrollHeight = (...args) => shell().resetScrollHeight(...args);
const runMainChatVisibleMessageActionsShellAction = (...args) => shell().runMainChatVisibleMessageActionsShellAction(...args);
const saveCharacterDebounced = (...args) => shell().saveCharacterDebounced(...args);
const saveChatConditional = (...args) => shell().saveChatConditional(...args);
const saveSettingsDebounced = (...args) => shell().saveSettingsDebounced(...args);
const selectCharacterById = (...args) => shell().selectCharacterById(...args);
const selectImportedChar = (...args) => shell().selectImportedChar(...args);
const select_rm_characters = (...args) => shell().select_rm_characters(...args);
const select_rm_create = (...args) => shell().select_rm_create(...args);
const select_selected_character = (...args) => shell().select_selected_character(...args);
const sendTextareaMessage = (...args) => shell().sendTextareaMessage(...args);
const setCharacterSettingsOverrides = (...args) => shell().setCharacterSettingsOverrides(...args);
const setMainChatMessageUiState = (...args) => shell().setMainChatMessageUiState(...args);
const showBranchChatButtons = (...args) => shell().showBranchChatButtons(...args);
const showDeleteConfirmWithCascade = (...args) => shell().showDeleteConfirmWithCascade(...args);
const showSwipeButtons = (...args) => shell().showSwipeButtons(...args);
const stopGeneration = (...args) => shell().stopGeneration(...args);
const stopScriptExecution = (...args) => shell().stopScriptExecution(...args);
const t = (...args) => shell().t(...args);
const toggleCharacterExportPopup = (...args) => shell().toggleCharacterExportPopup(...args);
const getVisibleCharacterExportTrigger = (...args) => shell().getVisibleCharacterExportTrigger(...args);
const toggleDrawer = (...args) => shell().toggleDrawer(...args);
const translate = (...args) => shell().translate(...args);
const updateCharListGridToggleLabel = (...args) => shell().updateCharListGridToggleLabel(...args);
const updateCharacterRow = (...args) => shell().updateCharacterRow(...args);
const updateFavButtonState = (...args) => shell().updateFavButtonState(...args);
const updateViewMessageIds = (...args) => shell().updateViewMessageIds(...args);
const waitUntilCondition = (...args) => shell().waitUntilCondition(...args);

export function initDomHandlers() {
    handleInputWheel();
}

export async function bindLegacyShellHandlers() {
    // React-owned composer markup must exist before handlers bind below.
    await mountChatComposer();
    initMainChatComposerService();
    // React-owned static panels must exist before the direct $(...).on()
    // bindings below; bootstrapWorkspace re-invokes these mounts later, and
    // each mount is idempotent via its dataset.react*Mounted guard.
    await Promise.all([
        mountAiConfigPanel(),
        mountCharacterPopup(),
        mountRightNavPanel(),
        mountSelectChatPopup(),
        mountCharacterContextMenu(),
        mountOptionsMenu(),
        mountExportFormatPopup(),
        mountDialoguePopupControls(),
        mountDialogueDelMesControls(),
        mountOnboardingActions(),
    ]);

    //////////INPUT BAR FOCUS-KEEPING LOGIC/////////////
    let S_TAPreviouslyFocused = false;
    $('#send_textarea').on('focusin focus click', () => {
        S_TAPreviouslyFocused = true;
    });
    $('#send_but, #option_regenerate, #option_continue').on('click', () => {
        if (S_TAPreviouslyFocused) {
            $('#send_textarea').trigger('focus');
        }
    });
    $(document).on('click', event => {
        if ($(':focus').attr('id') !== 'send_textarea') {
            var validIDs = ['options_button', 'send_but', 'send_textarea', 'option_regenerate', 'option_continue'];
            if (!validIDs.includes($(event.target).attr('id'))) {
                S_TAPreviouslyFocused = false;
            }
        } else {
            S_TAPreviouslyFocused = true;
        }
    });

    /////////////////

    $('#swipes-checkbox').on('change', function () {
        state.swipes = !!$('#swipes-checkbox').prop('checked');
        if (state.swipes) {
            //console.log('toggle change calling showswipebtns');
            showSwipeButtons();
        } else {
            hideSwipeButtons();
        }
        saveSettingsDebounced();
    });

    ///// SWIPE BUTTON CLICKS ///////

    //limit swiping to only last message clicks
    $(document).on('click', '.last_mes .swipe_right', async (e, data) => await swipe(e, SWIPE_DIRECTION.RIGHT, data));
    $(document).on('click', '.last_mes .swipe_left', async (e, data) => await swipe(e, SWIPE_DIRECTION.LEFT, data));
    $(document).on('click keydown', '.generation_failure_retry', function (event) {
        if (isReactMainChatOwner() && $(this).closest('[data-main-chat-message-row-owner="react"]').length > 0) {
            return;
        }
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) {
            return;
        }
        event.preventDefault();
        $('#option_regenerate').trigger('click');
    });

    initCharacterSearch();

    const userInputGenerateMutex = new state.SimpleMutex(sendTextareaMessage);
    $('#send_but').on('click', async function () {
        await userInputGenerateMutex.update();
    });

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
        $('#character_search_bar').val('').trigger('input');
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

    $(document).on('click', '.mes', function () {
        //when a 'delete message' parent div is clicked
        // and we are in delete mode and del_checkbox is visible
        const row = $(this);
        const deleteCheckbox = row.find('.del_checkbox').first();

        if (!state.is_delete_mode || !deleteCheckbox.is(':visible')) {
            return;
        }
        $('.mes').each(function () {
            const candidateRow = $(this);
            candidateRow.find('.del_checkbox').first().prop('checked', false);
            candidateRow.removeClass('selected');
        });
        row.addClass('selected'); //sets the bg of the mes selected for deletion
        var i = Number($(this).attr('mesid')); //checks the message ID in the chat
        state.this_del_mes = i;
        //as long as the current message ID is less than the total chat length
        while (i < state.chat.length) {
            //sets the bg of the all msgs BELOW the selected .mes
            const selectedRow = $(`.mes[mesid="${i}"]`);
            selectedRow.addClass('selected');
            selectedRow.find('.del_checkbox').first().prop('checked', true);
            i++;
        }
    });

    /** Handles deletion of a character chat file. */
    async function handleDeleteChat(chatFile, _group, fromSlashCommand = false) {
        // Close past chat popup.
        $('#select_chat_cross').trigger('click');

        const loaderHandle = state.loader.show({
            slug: 'chat-delete',
            title: t`Delete Chat`,
            message: t`Deleting chat…`,
            toastMode: state.loader.ToastMode.STATIC,
        });

        try {
            await delChat(`${chatFile}.jsonl`);
        } catch (error) {
            loaderHandle.hide();
            throw error;
        }

        if (fromSlashCommand) {  // When called from `/delchat` command, don't re-open the history view.
            $('#options').hide();  // Hide option popup menu.
            await loaderHandle.hide();
        } else {  // Open the history view again after 2 seconds (delay to avoid edge cases for deleting last chat).
            setTimeout(async function () {
                $('#option_select_chat').trigger('click');
                $('#options').hide();  // Hide option popup menu.
                await loaderHandle.hide();
            }, 2000);
        }
    }

    $(document).on('click', '.PastChat_cross', async function (e, { fromSlashCommand = false } = {}) {
        e.stopPropagation();
        const deleteFileName = $(this).attr('file_name');
        console.debug('detected cross click for' + deleteFileName);

        // Skip confirmation if called from a slash command.
        if (fromSlashCommand) {
            await handleDeleteChat(deleteFileName, null, true);
            return;
        }

        const result = await callGenericPopup('<h3>' + t`Delete the Chat File?` + '</h3>', state.POPUP_TYPE.CONFIRM);
        if (result === state.POPUP_RESULT.AFFIRMATIVE) {
            await handleDeleteChat(deleteFileName, null, false);
        }
    });

    $('#advanced_div').on('click', function () {
        if (!state.is_advanced_char_open) {
            state.is_advanced_char_open = true;
            $('#character_popup').css({ 'display': 'flex', 'opacity': 0.0 }).addClass('open');
            $('#character_popup').transition({
                opacity: 1.0,
                duration: state.animation_duration,
                easing: state.animation_easing,
            });
        } else {
            state.is_advanced_char_open = false;
            $('#character_popup').css('display', 'none').removeClass('open');
        }
    });

    $('#character_cross').on('click', function () {
        state.is_advanced_char_open = false;
        $('#character_popup').transition({
            opacity: 0,
            duration: state.animation_duration,
            easing: state.animation_easing,
        });
        setTimeout(function () { $('#character_popup').css('display', 'none'); }, state.animation_duration);
    });

    $('#character_popup_ok').on('click', function () {
        state.is_advanced_char_open = false;
        $('#character_popup').css('display', 'none');
    });

    $('#dialogue_popup_ok').on('click', async function (_e) {
        state.dialogueCloseStop = false;
        $('#shadow_popup').transition({
            opacity: 0,
            duration: state.animation_duration,
            easing: state.animation_easing,
        });
        setTimeout(function () {
            if (state.dialogueCloseStop) return;
            $('#shadow_popup').css('display', 'none');
            $('#dialogue_popup').removeClass('large_dialogue_popup');
            $('#dialogue_popup').removeClass('wide_dialogue_popup');
        }, state.animation_duration);

        if (state.dialogueResolve) {
            if (state.popup_type == 'input') {
                state.dialogueResolve($('#dialogue_popup_input').val());
                $('#dialogue_popup_input').val('');
            } else {
                state.dialogueResolve(true);
            }

            state.dialogueResolve = null;
        }
    });

    $('#dialogue_popup_cancel').on('click', function (_e) {
        state.dialogueCloseStop = false;
        $('#shadow_popup').transition({
            opacity: 0,
            duration: state.animation_duration,
            easing: state.animation_easing,
        });
        setTimeout(function () {
            if (state.dialogueCloseStop) return;
            $('#shadow_popup').css('display', 'none');
            $('#dialogue_popup').removeClass('large_dialogue_popup');
        }, state.animation_duration);

        state.popup_type = '';

        if (state.dialogueResolve) {
            state.dialogueResolve(false);
            state.dialogueResolve = null;
        }
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
        '#mes_example_textarea': function () { state.create_save.mes_example = String($('#mes_example_textarea').val()); },
        '#firstmessage_textarea': function () { state.create_save.first_message = String($('#firstmessage_textarea').val()); },
        '#depth_prompt_prompt': function () { state.create_save.depth_prompt_prompt = String($('#depth_prompt_prompt').val()); },
        '#depth_prompt_depth': function () { state.create_save.depth_prompt_depth = Number($('#depth_prompt_depth').val()); },
        '#depth_prompt_role': function () { state.create_save.depth_prompt_role = String($('#depth_prompt_role').val()); },
    };

    Object.keys(elementsToUpdate).forEach(function (id) {
        $(id).on('input', function () {
            if (state.menu_type == 'create') {
                elementsToUpdate[id]();
            } else {
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

    $(document).on('click', '.select_chat_block', async function () {
        const fileName = $(this).attr('file_name');

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

        $('#shadow_select_chat_popup').css('display', 'none');
    });

    $(document).on('click', '.renameChatButton', async function (e) {
        e.stopPropagation();
        const oldFileName = $(this).closest('.select_chat_block_wrapper').find('.select_chat_block_filename').text();

        const popupText = await renderTemplateAsync('chatRename');
        const newName = await callGenericPopup(popupText, state.POPUP_TYPE.INPUT, oldFileName);

        if (!newName || typeof newName !== 'string' || newName == oldFileName) {
            console.log('no new name found, aborting');
            return;
        }

        await renameChat(oldFileName, newName);

        await delay(250);
        $('#option_select_chat').trigger('click');
        $('#options').hide();
    });

    $(document).on('click', '.exportChatButton, .exportRawChatButton', async function (e) {
        e.stopPropagation();
        const format = $(this).data('format') || 'txt';
        await saveChatConditional();
        const filename = $(this).closest('.select_chat_block_wrapper').find('.select_chat_block_filename').text();
        console.log(`exporting ${filename} in ${format} format`);

        const body = {
            is_group: false,
            avatar_url: state.characters[state.this_chid]?.avatar,
            file: `${filename}.jsonl`,
            exportfilename: `${filename}.${format}`,
            format: format,
        };
        console.log(body);
        try {
            const response = await fetch('/api/chats/export', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: getRequestHeaders(),
            });
            const data = await response.json();
            if (!response.ok) {
                // display error message
                console.log(data.message);
                await delay(250);
                toastr.error(`Error: ${data.message}`);
                return;
            } else {
                const mimeType = format == 'txt' ? 'text/plain' : 'application/octet-stream';
                // success, handle response data
                console.log(data);
                await delay(250);
                toastr.success(data.message);
                download(data.result, body.exportfilename, mimeType);
            }
        } catch (error) {
            // display error message
            console.log(`An error has occurred: ${error.message}`);
            await delay(250);
            toastr.error(`Error: ${error.message}`);
        }
    });


    const button = $('#options_button');
    const menu = $('#options');
    let isOptionsMenuVisible = false;

    function showMenu() {
        showBranchChatButtons();
        menu.fadeIn(state.animation_duration);
        getOptionsPopper()?.update();
        isOptionsMenuVisible = true;
    }

    function hideMenu() {
        menu.fadeOut(state.animation_duration);
        getOptionsPopper()?.update();
        isOptionsMenuVisible = false;
    }

    function isMouseOverButtonOrMenu() {
        return menu.is(':hover, :focus-within') || button.is(':hover, :focus');
    }

    button.on('click', function () {
        if (isOptionsMenuVisible) {
            hideMenu();
        } else {
            showMenu();
        }
    });
    $(document).on('click', function () {
        if (!isOptionsMenuVisible) return;
        if (!isMouseOverButtonOrMenu()) { hideMenu(); }
    });
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && isOptionsMenuVisible && !e.originalEvent.isComposing) {
            hideMenu();
            button.trigger('focus');
        }
    });

    ///////////// OPTIMIZED LISTENERS FOR LEFT SIDE OPTIONS POPUP MENU //////////////////////
    // Delegated binding: the menu items are React-owned inside #options and can be
    // remounted; a document-level handler keeps jQuery-trigger compatibility
    // (slash commands/extensions pass customData through trigger()).
    $(document).on('click', '#options [id]', async function (event, customData) {
        const fromSlashCommand = customData?.fromSlashCommand || false;
        var id = $(this).attr('id');

        // Check whether a custom prompt was provided via custom data (for example through a slash command)
        const additionalPrompt = customData?.additionalPrompt?.trim() || undefined;
        const buildOrFillAdditionalArgs = (args = {}) => ({
            ...args,
            ...(additionalPrompt !== undefined && { quiet_prompt: additionalPrompt, quietToLoud: true }),
        });

        if (id == 'option_select_chat') {
            if ((state.this_chid !== undefined && !state.is_send_press) || fromSlashCommand) {
                await displayPastChats();
                //this is just to avoid the shadow for past chat view when using /delchat
                //however, the dialog popup still gets one..
                if (!fromSlashCommand) {
                    console.log('displaying shadow');
                    $('#shadow_select_chat_popup').css('display', 'block');
                    $('#shadow_select_chat_popup').css('opacity', 0.0);
                    $('#shadow_select_chat_popup').transition({
                        opacity: 1.0,
                        duration: state.animation_duration,
                        easing: state.animation_easing,
                    });
                }
            }
        } else if (id == 'option_start_new_chat') {
            if (state.this_chid !== undefined && !state.is_send_press) {
                let deleteCurrentChat = false;
                const result = await state.Popup.show.confirm(t`Start new chat?`, await renderTemplateAsync('newChatConfirm'), {
                    onClose: () => { deleteCurrentChat = !!$('#del_chat_checkbox').prop('checked'); },
                });
                if (!result) {
                    return;
                }

                await doNewChat({ deleteCurrentChat: deleteCurrentChat });
            }
            if (state.this_chid === undefined && !state.is_send_press) {
                await newAssistantChat();
            }
        } else if (id == 'option_regenerate') {
            //Attempting to regenerate a user message will instead generate a new message.
            if (state.chat.length && state.chat.length - 1 === state.this_edit_mes_id && state.chat[state.this_edit_mes_id]?.is_user == false) {
                toastr.warning(t`Finish the edit before starting a generation.`, t`You cannot regenerate the message you are editing.`);
                return;
            }
            if (state.is_send_press == false) {
                state.is_send_press = true;
                Generate('regenerate', buildOrFillAdditionalArgs());
            }
        } else if (id == 'option_impersonate') {
            if (state.is_send_press == false || fromSlashCommand) {
                state.is_send_press = true;
                Generate('impersonate', buildOrFillAdditionalArgs());
            }
        } else if (id == 'option_continue') {
            if (state.swipeState == SWIPE_STATE.EDITING) {
                toastr.warning(t`Confirm the edit to start a generation.`, t`You cannot send a message during a swipe-edit.`);
                return;
            }
            if (state.chat.length && state.chat.length - 1 === state.this_edit_mes_id) {
                toastr.warning(t`Finish the edit before starting a generation.`, t`You cannot continue the message you are editing.`);
                return;
            }

            if (state.is_send_press == false || fromSlashCommand) {
                state.is_send_press = true;
                Generate('continue', buildOrFillAdditionalArgs());
            }
        } else if (id == 'option_delete_mes') {
            setTimeout(() => openMessageDelete(fromSlashCommand), state.animation_duration);
        } else if (id == 'option_close_chat') {
            await closeCurrentChat();
        }
        hideMenu();
    });

    $('#newChatFromManageScreenButton').on('click', async function () {
        await doNewChat({ deleteCurrentChat: false });
        $('#select_chat_cross').trigger('click');
    });

    //////////////////////////////////////////////////////////////////////////////////////////////

    //functionality for the cancel delete messages button, reverts to normal display of input form
    $('#dialogue_del_mes_cancel').on('click', function () {
        $('#dialogue_del_mes').css('display', 'none');
        $('#send_form').css('display', state.css_send_form_display);
        $('.del_checkbox').each(function () {
            const checkbox = $(this);
            const row = checkbox.closest('.mes');
            checkbox.css('display', 'none');
            row.find('.for_checkbox').first().css('display', 'block');
            row.removeClass('selected');
            checkbox.prop('checked', false);
        });
        showSwipeButtons();
        state.this_del_mes = -1;
        state.is_delete_mode = false;
    });

    //confirms message deletion with the "ok" button
    $('#dialogue_del_mes_ok').on('click', async function () {
        $('#dialogue_del_mes').css('display', 'none');
        $('#send_form').css('display', state.css_send_form_display);
        $('.del_checkbox').each(function () {
            const checkbox = $(this);
            const row = checkbox.closest('.mes');
            checkbox.css('display', 'none');
            row.find('.for_checkbox').first().css('display', 'block');
            row.removeClass('selected');
            checkbox.prop('checked', false);
        });

        if (state.this_del_mes >= 0) {
            state.chatElement.find(`.mes[mesid="${state.this_del_mes}"]`).nextAll('div').remove();
            state.chatElement.find(`.mes[mesid="${state.this_del_mes}"]`).remove();
            state.chat.length = state.this_del_mes;
            state.chat_metadata.tainted = true;
            await saveChatConditional();
            state.chatElement.scrollTop(state.chatElement[0].scrollHeight);
            await eventSource.emit(event_types.MESSAGE_DELETED, state.chat.length);
            state.chatElement.find('.mes').removeClass('last_mes');
            state.chatElement.find('.mes').last().addClass('last_mes');
        } else {
            console.log('this_del_mes is not >= 0, not deleting');
        }

        showSwipeButtons();
        state.this_del_mes = -1;
        state.is_delete_mode = false;
    });

    ////////////////// OPTIMIZED RANGE SLIDER LISTENERS////////////////

    var sliderLocked = true;
    var sliderTimer;

    $('input[type=\'range\']').on('touchstart', function () {
        // Unlock the slider after 300ms
        sliderTimer = setTimeout(function () {
            sliderLocked = false;
            $(this).css('background-color', 'var(--SmartThemeQuoteColor)');
        }.bind(this), 300);
    });

    $('input[type=\'range\']').on('touchend', function () {
        clearTimeout(sliderTimer);
        $(this).css('background-color', '');
        sliderLocked = true;
    });

    $('input[type=\'range\']').on('touchmove', function (event) {
        if (sliderLocked) {
            event.preventDefault();
        }
    });

    const sliders = [
        {
            sliderId: '#amount_gen',
            counterId: '#amount_gen_counter',
            format: (val) => `${val}`,
            setValue: (val) => { state.amount_gen = Number(val); },
        },
        {
            sliderId: '#max_context',
            counterId: '#max_context_counter',
            format: (val) => `${val}`,
            setValue: (val) => { state.max_context = Number(val); },
        },
    ];

    sliders.forEach(slider => {
        $(document).on('input', slider.sliderId, function () {
            const value = $(this).val();
            const formattedValue = slider.format(value);
            slider.setValue(value);
            $(slider.counterId).val(formattedValue);
            saveSettingsDebounced();
        });
    });

    //////////////////////////////////////////////////////////////

    $('#select_chat_cross').on('click', function () {
        $('#shadow_select_chat_popup').transition({
            opacity: 0,
            duration: state.animation_duration,
            easing: state.animation_easing,
        });
        setTimeout(function () { $('#shadow_select_chat_popup').css('display', 'none'); }, state.animation_duration);
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
                if (Number(edit_mes_id) == state.chat.length - 1) { //if the generating swipe (...)
                    let run_edit = true;
                    if (state.chat[edit_mes_id].swipe_id !== undefined) {
                        if (state.chat[edit_mes_id].swipes.length === state.chat[edit_mes_id].swipe_id) {
                            run_edit = false;
                        }
                    }
                    if (run_edit) {
                        hideSwipeButtons();
                    }
                }
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
        if (state.this_edit_mes_id <= 0) {
            return;
        }
        const targetId = Number(state.this_edit_mes_id) - 1;
        await messageEditMove(state.this_edit_mes_id, targetId);
    });

    $(document).on('click', '.mes_edit_down', async function () {
        if (state.this_edit_mes_id >= state.chat.length - 1) {
            return;
        }

        const targetId = Number(state.this_edit_mes_id) + 1;
        await messageEditMove(state.this_edit_mes_id, targetId);
    });

    $(document).on('click', '.mes_edit_copy', async function () {
        const confirmation = await callGenericPopup(t`Create a copy of this message?`, state.POPUP_TYPE.CONFIRM);
        if (!confirmation) {
            return;
        }

        hideSwipeButtons();
        const oldScroll = state.chatElement[0].scrollTop;
        const clone = structuredClone(state.chat[state.this_edit_mes_id]);
        clone.send_date = Date.now();
        const this_edit_mes_element = $(this).closest('.mes');
        clone.mes = this_edit_mes_element.find('.edit_textarea').val().toString();

        clone.mes = clone.mes.trim();

        state.chat.splice(Number(state.this_edit_mes_id) + 1, 0, clone);
        const newMessageElement = updateMessageElement(clone);
        this_edit_mes_element.after(newMessageElement);

        updateViewMessageIds();
        await saveChatConditional();
        state.chatElement[0].scrollTop = oldScroll;
        showSwipeButtons();
    });

    $(document).on('click', '.mes_edit_delete', async function (event, customData) {
        const fromSlashCommand = customData?.fromSlashCommand || false;
        const message = state.chat[state.this_edit_mes_id];
        const selectedSwipe = message.swipe_id ?? undefined;
        const swipesArray = Array.isArray(message.swipes) ? message.swipes : [];
        const canDeleteSwipe = !fromSlashCommand && !message.is_user && swipesArray.length > 1 && state.this_edit_mes_id === state.chat.length - 1 && selectedSwipe !== undefined;
        await deleteMessage(Number(state.this_edit_mes_id), canDeleteSwipe ? selectedSwipe : undefined, fromSlashCommand !== true);
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

    $(document).on('keydown', function (event) {
        if (state.isExportPopupOpen && event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeCharacterExportPopup();
        }
    });

    $(document).on('click', '.export_format', async function () {
        const format = $(this).data('format');

        if (!format) {
            return;
        }

        closeCharacterExportPopup();

        try {
            // Save before exporting
            await createOrEditCharacter();
            const body = { format, avatar_url: state.characters[state.this_chid].avatar };

            const response = await fetch('/api/characters/export', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                toastr.error(t`Could not download file`, t`Export and Download`);
                return;
            }

            const filename = state.characters[state.this_chid].avatar.replace('.png', `.${format}`);
            const blob = await response.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.setAttribute('download', filename);
            document.body.appendChild(a);
            toastr.success(t`Character export download started.`, t`Export and Download`);
            a.click();
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Character export failed', error);
            toastr.error(t`Could not download file`, t`Export and Download`);
        }
    });
    //**************************CHAT IMPORT EXPORT*************************//
    $('#chat_import_button').on('click', function () {
        $('#chat_import_file').trigger('click');
    });

    $('#chat_import_file').on('change', async function (e) {
        const targetElement = e.target;
        const formElement = document.getElementById('form_import_chat');
        if (!(targetElement instanceof HTMLInputElement) || !(formElement instanceof HTMLFormElement)) {
            return;
        }

        const importedFileNames = [];

        for (const file of targetElement.files) {
            const ext = file.name.match(/\.(\w+)$/);
            const format = ext?.[1]?.toLowerCase();

            if (!['json', 'jsonl'].includes(format)) {
                toastr.warning(t`Only JSON and JSONL files are supported for chat imports.`);
                continue;
            }

            const formData = new FormData(formElement);
            formData.set('file_type', format);
            formData.set('avatar', file);
            formData.set('user_name', state.name1);

            const result = await importCharacterChat(formData, { refresh: false });
            importedFileNames.push(...result);
        }

        if (importedFileNames.length > 0) {
            toastr.success(t`Successfully imported ${importedFileNames.length} chat(s).`);
        }

        await displayPastChats(importedFileNames);

        targetElement.value = '';
    });

    $('#dupe_button').on('click', async function () {
        await duplicateCharacter();
    });

    $(document).on('click', '.mes_stop', function () {
        stopGeneration();
    });

    $(document).on('click', '#form_sheld .stscript_continue', function () {
        pauseScriptExecution();
    });

    $(document).on('click', '#form_sheld .stscript_pause', function () {
        pauseScriptExecution();
    });

    $(document).on('click', '#form_sheld .stscript_stop', function () {
        stopScriptExecution();
    });

    $(document).on('click', '.drawer-opener', doDrawerOpenClick);

    $('html').on('touchstart mousedown', async function (e) {
        const clickTarget = $(e.target);

        if (state.isExportPopupOpen
            && clickTarget.closest('#export_button').length == 0
            && clickTarget.closest('#export_format_popup').length == 0) {
            closeCharacterExportPopup({ restoreFocus: false });
        }

        const forbiddenTargets = [
            '#character_cross',
            '#avatar-and-name-block',
            '#shadow_popup',
            '.popup',
            '#world_popup',
            '.ui-widget',
            '.text_pole',
            '#toast-container',
            '.select2-results',
            '.wi-content-editor-modal',
        ];

        for (const id of forbiddenTargets) {
            if (clickTarget.closest(id).length > 0) {
                return;
            }
        }

        // This autocloses open drawers that are not pinned if a click happens inside the app which does not target them.
        const targetParentHasOpenDrawer = clickTarget.parents('.openDrawer').length;
        if (!clickTarget.hasClass('openDrawer')) {
            const $openDrawers = $('.openDrawer').not('.pinnedOpen');
            if ($openDrawers.length && targetParentHasOpenDrawer === 0) {
                $openDrawers.toggleClass('closedDrawer openDrawer');
            }
        }
    });

    $(document).on('click', '.inline-drawer-toggle', async function (e) {
        if ($(e.target).hasClass('text_pole')) {
            return;
        }
        const drawer = $(this).closest('.inline-drawer');
        const icon = drawer.find('>.inline-drawer-header .inline-drawer-icon');
        const drawerContent = drawer.find('>.inline-drawer-content');
        icon.toggleClass('down up');
        icon.toggleClass('fa-circle-chevron-down fa-circle-chevron-up');
        drawer.trigger('inline-drawer-toggle');
        drawerContent.stop(true, true).css({ display: '', height: '' }).toggleClass('openInlineDrawer');

        // Set the height of "autoSetHeight" textareas within the inline-drawer to their scroll height
        if (!CSS.supports('field-sizing', 'content')) {
            const textareas = drawerContent.find('textarea.autoSetHeight');
            for (const textarea of textareas) {
                await resetScrollHeight($(textarea));
            }
        }
    });

    $(document).on('click', '.inline-drawer-maximize', function () {
        const icon = $(this).find('.inline-drawer-icon, .floating_panel_maximize');
        icon.toggleClass('fa-window-maximize fa-window-restore');
        const drawerContent = $(this).closest('.drawer-content');
        drawerContent.toggleClass('maximized');
        const drawerId = drawerContent.attr('id');
        resetMovableStyles(drawerId);
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
            if (messageElement.attr('is_user') == 'true' || (messageElement.attr('is_system') == 'true' && !isValidCharacter)) {
                //handle user and system avatars
                zoomedAvatarImgElement.attr('src', thumbURL);
                zoomedAvatarImgElement.attr('data-izoomify-url', thumbURL);
            } else if (messageElement.attr('is_user') == 'false') { //handle char avatars
                zoomedAvatarImgElement.attr('src', avatarSrc);
                zoomedAvatarImgElement.attr('data-izoomify-url', avatarSrc);
            }
            $(`.zoomed_avatar[forChar="${charname}"]`).css('display', 'flex');

            $('.zoomed_avatar, .zoomed_avatar .dragClose').on('click touchend', (e) => {
                if (e.target.closest('.dragClose')) {
                    $(`.zoomed_avatar[forChar="${charname}"]`).fadeOut(state.animation_duration, () => {
                        $(`.zoomed_avatar[forChar="${charname}"]`).remove();
                    });
                }
            });

            zoomedAvatarImgElement.on('dragstart', (e) => {
                console.log('saw drag on avatar!');
                e.preventDefault();
                return false;
            });
        }
    });

    document.addEventListener('click', function (e) {
        if (!(e.target instanceof HTMLElement)) return;
        if (e.target.matches('#OpenAllWIEntries')) {
            document.querySelectorAll('#world_popup_entries_list .inline-drawer').forEach((/** @type {HTMLElement} */ drawer) => {
                delay(0).then(() => toggleDrawer(drawer, true));
            });
        } else if (e.target.matches('#CloseAllWIEntries')) {
            document.querySelectorAll('#world_popup_entries_list .inline-drawer').forEach((/** @type {HTMLElement} */ drawer) => {
                toggleDrawer(drawer, false);
            });
        }
    });

    $(document).on('click', '.open_alternate_greetings', openAlternateGreetings);
    /* $('#set_character_world').on('click', openCharacterWorldPopup); */

    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && !e.originalEvent.isComposing) {
            const isEditVisible = $('#curEditTextarea').is(':visible') || $('.reasoning_edit_textarea').length > 0;
            if (isEditVisible) {
                closeMessageEditor('all');
                $('#send_textarea').trigger('focus');
                return;
            }
            if (state.this_edit_mes_id === undefined && $('#mes_stop').is(':visible')) {
                $('#mes_stop').trigger('click');
                if (state.chat.length === 0) return;
                const lastMessage = state.chat[state.chat.length - 1];
                if (Array.isArray(lastMessage.swipes) && lastMessage.swipe_id == lastMessage.swipes.length) {
                    $('.last_mes .swipe_left').trigger('click');
                }
            }
        }
    });

    $('#char-management-dropdown').on('change', async (e) => {
        const targetElement = /** @type {HTMLSelectElement} */ (e.target);
        const target = $(targetElement.selectedOptions).attr('id');
        switch (target) {
            case 'set_character_world':
                await openCharacterWorldPopup();
                break;
            case 'character_action_advanced':
                $('#advanced_div').trigger('click');
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
            case 'character_source': {
                const source = getCharacterSource(state.this_chid);
                if (source && isValidUrl(source)) {
                    const url = new URL(source);
                    const confirm = await state.Popup.show.confirm('Open Source', `<span>Do you want to open the link to ${url.hostname} in a new tab?</span><var>${url}</var>`);
                    if (confirm) {
                        window.open(source, '_blank', 'noopener');
                    }
                } else {
                    toastr.info('This character doesn\'t seem to have a source.');
                }
            } break;
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


    var isManualInput = false;
    var valueBeforeManualInput;

    $(document).on('input', '.range-block-counter input, .neo-range-input', function () {
        valueBeforeManualInput = $(this).val();
        console.log(valueBeforeManualInput);
    });

    $(document).on('change', '.range-block-counter input, .neo-range-input', function (e) {
        if (!(e.target instanceof HTMLElement)) {
            return;
        }
        e.target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    });

    $(document).on('keydown', '.range-block-counter input, .neo-range-input', function (e) {
        const masterSelector = '#' + $(this).data('for');
        const masterElement = $(masterSelector);
        if (e.key === 'Enter') {
            let manualInput = Number($(this).val());
            if (isManualInput) {
                //disallow manual inputs outside acceptable range
                if (manualInput >= Number($(this).attr('min')) && manualInput <= Number($(this).attr('max'))) {
                    //if value is ok, assign to slider and update handle text and position
                    //newSlider.val(manualInput)
                    //handleSlideEvent.call(newSlider, null, { value: parseFloat(manualInput) }, 'manual');
                    valueBeforeManualInput = manualInput;
                    $(masterElement).val($(this).val()).trigger('input', { forced: true });
                } else {
                    //if value not ok, warn and reset to last known valid value
                    toastr.warning(`Invalid value. Must be between ${$(this).attr('min')} and ${$(this).attr('max')}`);
                    //newSlider.val(valueBeforeManualInput)
                    $(this).val(valueBeforeManualInput);
                }
            }
        }
    });

    $(document).on('keyup', '.range-block-counter input, .neo-range-input', function () {
        valueBeforeManualInput = $(this).val();
        isManualInput = true;
    });

    //trigger slider changes when user clicks away
    $(document).on('mouseup blur', '.range-block-counter input, .neo-range-input', function () {
        const masterSelector = '#' + $(this).data('for');
        const masterElement = $(masterSelector);
        let manualInput = Number($(this).val());
        if (isManualInput) {
            //if value is between correct range for the slider
            if (manualInput >= Number($(this).attr('min')) && manualInput <= Number($(this).attr('max'))) {
                valueBeforeManualInput = manualInput;
                //set the slider value to input value
                $(masterElement).val($(this).val()).trigger('input', { forced: true });
            } else {
                //if value not ok, warn and reset to last known valid value
                toastr.warning(`Invalid value. Must be between ${$(this).attr('min')} and ${$(this).attr('max')}`);
                $(this).val(valueBeforeManualInput);
            }
        }
        isManualInput = false;
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
            $(importFile).trigger('change');
        }
    });

    $('#charListGridToggle').on('click', async () => {
        doCharListDisplaySwitch();
    });
    updateCharListGridToggleLabel();

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
        await getCharacters();
        await eventSource.emit(event_types.OPEN_CHARACTER_LIBRARY);
    });

    // Show regenerate button for empty AI replies
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        if (messageId !== state.chat.length - 1) return;
        const message = state.chat[messageId];
        if (!message || message.is_user || message.is_system) return;
        const visibleText = (message.extra?.display_text ?? message.mes ?? '').trim();
        if (isReactMainChatOwner()) {
            setMainChatMessageUiState(messageId, {
                emptyReplyRegenerateVisible: visibleText.length === 0,
            });
            return;
        }
        if (visibleText.length > 0) return;
        const mesBlock = $(`.mes[mesid="${messageId}"] .mes_block`);
        if (mesBlock.length === 0 || mesBlock.find('.empty_reply_regenerate').length > 0) return;
        mesBlock.append(
            $('<div>')
                .addClass('empty_reply_regenerate')
                .append($('<i>').addClass('fa-solid fa-arrow-rotate-right'))
                .append($('<span>').attr('data-i18n', 'Regenerate').text(translate('Regenerate')))
                .on('click', () => { $('#option_regenerate').trigger('click'); }),
        );
        void mountReactMainChatMessageListPanel();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        void mountReactWorkspaceShellChromeHost();
        void mountReactMainChatMessageListPanel();
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
        if (input && input.type === 'number' && input.hasAttribute('step')) {
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
