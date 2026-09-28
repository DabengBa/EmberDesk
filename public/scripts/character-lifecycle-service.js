import { eventSource, event_types } from './events.js';
import { buildCharacterAuthoringFormData, getCharacterAuthoringWriteUrl } from './character-authoring.js';
import { getCharacterDeleteCandidates, shouldRefreshCharacterAfterEdit } from './character-list-state.js';
import { getRequestHeaders } from './request-context.js';
import { requireCharacterLifecycleShellContext } from './character-lifecycle-shell-context.js';

function shell() {
    return requireCharacterLifecycleShellContext();
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

const applyCharacterAuthoringSaveModel = (...args) => shell().applyCharacterAuthoringSaveModel(...args);
const callGenericPopup = (...args) => shell().callGenericPopup(...args);
const charSetAuxWorlds = (...args) => shell().charSetAuxWorlds(...args);
const charUpdatePrimaryWorld = (...args) => shell().charUpdatePrimaryWorld(...args);
const checkEmbeddedWorld = (...args) => shell().checkEmbeddedWorld(...args);
const flushDeletedWorldsFromUI = (...args) => shell().flushDeletedWorldsFromUI(...args);
const setWorldInfoButtonClass = (...args) => shell().setWorldInfoButtonClass(...args);
const showWorldInfoCascadeDialog = (...args) => shell().showWorldInfoCascadeDialog(...args);
const Popup = new Proxy(function () {}, {
    get: (_, key) => shell().Popup[key],
    construct: (_, args) => new (shell().Popup)(...args),
});
const POPUP_RESULT = new Proxy({}, { get: (_, key) => shell().POPUP_RESULT[key] });
const POPUP_TYPE = new Proxy({}, { get: (_, key) => shell().POPUP_TYPE[key] });
const t = (...args) => shell().t(...args);
const cancelDebounce = (...args) => shell().cancelDebounce(...args);
const clearChat = (...args) => shell().clearChat(...args);
const closeCurrentChatForDelete = (...args) => shell().closeCurrentChatForDelete(...args);
const createTagMapFromList = (...args) => shell().createTagMapFromList(...args);
const delay = (...args) => shell().delay(...args);
const ensureImageFormatSupported = (...args) => shell().ensureImageFormatSupported(...args);
const formatCreatorNotes = (...args) => shell().formatCreatorNotes(...args);
const getCharaFilename = (...args) => shell().getCharaFilename(...args);
const getCharacterSource = (...args) => shell().getCharacterSource(...args);
const getCharacters = (...args) => shell().getCharacters(...args);
const getCurrentCharacterAuthoringMode = (...args) => shell().getCurrentCharacterAuthoringMode(...args);
const getCurrentCharacterAuthoringSource = (...args) => shell().getCurrentCharacterAuthoringSource(...args);
const getFirstMessage = (...args) => shell().getFirstMessage(...args);
const getOneCharacter = (...args) => shell().getOneCharacter(...args);
const getPastCharacterChats = (...args) => shell().getPastCharacterChats(...args);
const getThumbnailUrl = (...args) => shell().getThumbnailUrl(...args);
const isExternalMediaAllowed = (...args) => shell().isExternalMediaAllowed(...args);
const isMobile = (...args) => shell().isMobile(...args);
const markPerfInteractionMetric = (...args) => shell().markPerfInteractionMetric(...args);
const printMessages = (...args) => shell().printMessages(...args);
const queueReactCharacterAuthoringRemount = (...args) => shell().queueReactCharacterAuthoringRemount(...args);
const reloadCurrentChat = (...args) => shell().reloadCurrentChat(...args);
const removeCharacterFromUI = (...args) => shell().removeCharacterFromUI(...args);
const renamePastChats = (...args) => shell().renamePastChats(...args);
const renameTagKey = (...args) => shell().renameTagKey(...args);
const saveCharacterDebounced = (...args) => shell().saveCharacterDebounced(...args);
const saveChatConditional = (...args) => shell().saveChatConditional(...args);
const saveSettingsDebounced = (...args) => shell().saveSettingsDebounced(...args);
const selectCharacterById = (...args) => shell().selectCharacterById(...args);
const select_rm_characters = (...args) => shell().select_rm_characters(...args);
const select_rm_create = (...args) => shell().select_rm_create(...args);
const select_rm_info = (...args) => shell().select_rm_info(...args);
const setCharacterId = (...args) => shell().setCharacterId(...args);
const setMenuType = (...args) => shell().setMenuType(...args);
const setTemporaryChatStatus = (...args) => shell().setTemporaryChatStatus(...args);
const timestampToMoment = (...args) => shell().timestampToMoment(...args);
const unshallowCharacter = (...args) => shell().unshallowCharacter(...args);
const updateFavButtonState = (...args) => shell().updateFavButtonState(...args);


export async function saveCharacterAuthoringFromPayload(saveModel = {}) {
    if (!state.settingsReady) {
        throw new Error('Settings not ready');
    }

    const mode = getCurrentCharacterAuthoringMode();
    const sourceCharacter = getCurrentCharacterAuthoringSource();
    const expectedName = String(saveModel?.fields?.name || '').trim();
    if (!expectedName) {
        toastr.error(t`Name is required`);
        throw new Error('Name is required');
    }
    if (mode === 'create' && state.is_send_press) {
        toastr.error(t`Cannot create characters while generating. Stop the request and try again.`, t`Creation aborted`);
        throw new Error('Creation aborted while generating');
    }

    const avatarFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('add_avatar_button'));
    const avatarFile = avatarFileInput?.files?.[0] ?? (state.create_save.avatar?.[0] ?? null);
    let preparedAvatarFile = null;
    if (avatarFile instanceof File) {
        preparedAvatarFile = await ensureImageFormatSupported(avatarFile);
    }

    const formData = buildCharacterAuthoringFormData(saveModel, {
        mode,
        existingAvatar: sourceCharacter?.avatar || saveModel?.fields?.avatar || '',
        chat: sourceCharacter?.chat || String($('#selected_chat_pole').val() || ''),
        createDate: sourceCharacter?.create_date
            ? timestampToMoment(sourceCharacter.create_date).toISOString()
            : String($('#create_date_pole').val() || ''),
        jsonData: sourceCharacter?.json_data || String($('#character_json_data').val() || ''),
        avatarFile: preparedAvatarFile,
    });

    // Keep create_save / legacy form mirrors in sync for remaining tool popups without submitting.
    applyCharacterAuthoringSaveModel(saveModel, { submit: false });

    let url = getCharacterAuthoringWriteUrl(mode);
    if (state.crop_data != undefined) {
        url = getCharacterAuthoringWriteUrl(mode, JSON.stringify(state.crop_data));
    }

    const headers = getRequestHeaders({ omitContentType: true });
    const fetchResult = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        cache: 'no-cache',
    });

    if (!fetchResult.ok) {
        const message = mode === 'create'
            ? t`Failed to create character`
            : t`Something went wrong while saving the character, or the image file provided was in an invalid format. Double check that the image is not a webp.`;
        toastr.error(message);
        throw new Error(`Character authoring ${mode} failed with status ${fetchResult.status}`);
    }

    if (mode === 'create') {
        const avatarId = await fetchResult.text();
        createTagMapFromList('#tagList', avatarId);
        await getCharacters();
        const createdIndex = state.characters.findIndex(character => character?.avatar === avatarId);
        if (createdIndex >= 0) {
            select_selected_character(createdIndex, { switchMenu: false });
            await eventSource.emit(event_types.CHARACTER_EDITED, {
                detail: { id: createdIndex, character: state.characters[createdIndex] },
            });
        } else {
            select_rm_info('char_create', avatarId, state.this_chid !== undefined ? state.characters[state.this_chid]?.avatar : null);
        }
        state.crop_data = undefined;
        return {
            ok: true,
            mode,
            avatar: avatarId,
            character: createdIndex >= 0 ? state.characters[createdIndex] : null,
        };
    }

    const editedAvatar = String(formData.get('avatar_url') || sourceCharacter?.avatar || '');
    if (shouldRefreshCharacterAfterEdit(state.characters, editedAvatar)) {
        await getOneCharacter(editedAvatar);
        state.favsToHotswap();
        await eventSource.emit(event_types.CHARACTER_EDITED, {
            detail: { id: state.this_chid, character: state.characters[state.this_chid] },
        });
    }
    state.crop_data = undefined;
    return {
        ok: true,
        mode,
        avatar: editedAvatar,
        character: state.this_chid !== undefined ? state.characters[state.this_chid] : null,
    };
}


/**
 * Renames the currently selected character, updating relevant references and optionally renaming past chats.
 *
 * If no name is provided, a popup prompts for a new name. If the new name matches the current name,
 * the renaming process is aborted. The function sends a request to the server to rename the character
 * and handles updates to other related fields such as tags, lore, and author notes.
 *
 * If the renaming is successful, the character list is reloaded and the renamed character is selected.
 * Optionally, past chats can be renamed to reflect the new character name.
 *
 * @param {string?} [name=null] - The new name for the character. If not provided, a popup will prompt for it.
 * @param {object} [options] - Additional options.
 * @param {boolean} [options.silent=false] - If true, suppresses popups and warnings.
 * @param {boolean?} [options.renameChats=null] - If true, renames past chats to reflect the new character name.
 * @returns {Promise<boolean>} - Returns true if the character was successfully renamed, false otherwise.
 */

export async function renameCharacter(name = null, { silent = false, renameChats = null } = {}) {
    if (!name && silent) {
        toastr.warning(t`No character name provided.`, t`Rename Character`);
        return false;
    }
    if (state.this_chid === undefined) {
        toastr.warning(t`No character selected.`, t`Rename Character`);
        return false;
    }

    const oldAvatar = state.characters[state.this_chid].avatar;
    const newValue = name || await callGenericPopup('<h3>' + t`New name:` + '</h3>', POPUP_TYPE.INPUT, state.characters[state.this_chid].name);

    if (!newValue) {
        toastr.warning(t`No character name provided.`, t`Rename Character`);
        return false;
    }
    if (newValue === state.characters[state.this_chid].name) {
        toastr.info(t`Same character name provided, so name did not change.`, t`Rename Character`);
        return false;
    }

    const body = JSON.stringify({ avatar_url: oldAvatar, new_name: newValue });
    const response = await fetch('/api/characters/rename', {
        method: 'POST',
        headers: getRequestHeaders(),
        body,
    });

    try {
        if (response.ok) {
            const data = await response.json();
            const newAvatar = data.avatar;

            const oldName = getCharaFilename(null, { manualAvatarKey: oldAvatar });
            const newName = getCharaFilename(null, { manualAvatarKey: newAvatar });

            // Replace other auxiliary fields where was referenced by avatar key
            // Tag List
            renameTagKey(oldAvatar, newAvatar);

            // Additional lore books
            const charLore = state.world_info.charLore?.find(x => x.name == oldName);
            if (charLore) {
                charLore.name = newName;
                saveSettingsDebounced();
            }

            // Char-bound Author's Notes
            const charNote = state.feature_settings.note.chara?.find(x => x.name == oldName);
            if (charNote) {
                charNote.name = newName;
                saveSettingsDebounced();
            }

            // Update active character, if the current one was the currently active one
            if (state.active_character === oldAvatar) {
                state.active_character = newAvatar;
                saveSettingsDebounced();
            }

            await eventSource.emit(event_types.CHARACTER_RENAMED, oldAvatar, newAvatar);

            // Unload current character
            setCharacterId(undefined);
            // Reload characters list
            await getCharacters();

            // Find newly renamed character
            const newChId = state.characters.findIndex(c => c.avatar == data.avatar);

            if (newChId !== -1) {
                // Select the character after the renaming
                await selectCharacterById(newChId);

                // Async delay to update UI
                await delay(1);

                if (state.this_chid === undefined) {
                    throw new Error('New character not selected');
                }

                const renamePastChatsConfirm = renameChats !== null
                    ? renameChats
                    : silent
                        ? false
                        : await Popup.show.confirm(
                            t`Character renamed!`,
                            `<p>${t`Past chats will still contain the old character name. Would you like to update the character name in previous chats as well?`}</p>`,
                        ) == POPUP_RESULT.AFFIRMATIVE;

                if (renamePastChatsConfirm) {
                    await renamePastChats(oldAvatar, newAvatar, newValue);
                    await reloadCurrentChat();
                    toastr.success(t`Character renamed and past chats updated!`, t`Rename Character`);
                } else {
                    toastr.success(t`Character renamed!`, t`Rename Character`);
                }
            } else {
                throw new Error('Newly renamed character was lost?');
            }
        } else {
            throw new Error('Could not rename the character');
        }
    } catch (error) {
        // Reloading to prevent data corruption
        if (!silent) await Popup.show.text(t`Rename Character`, t`Something went wrong. The page will be reloaded.`);
        else toastr.error(t`Something went wrong. The page will be reloaded.`, t`Rename Character`);

        console.log('Renaming character error:', error);
        location.reload();
        return false;
    }

    return true;
}


/**
 * Selects the right menu for displaying the character editor.
 * @param {string} chid Character array index
 * @param {object} [param1] Options for the switch
 * @param {boolean} [param1.switchMenu=true] Whether to switch the menu
 */
export function select_selected_character(chid, { switchMenu = true } = {}) {
    //character select
    //console.log('select_selected_character() -- starting with input of -- ' + chid + ' (name:' + characters[chid].name + ')');
    const character = state.characters[chid];
    if (!character) {
        if (switchMenu) {
            select_rm_characters();
        }
        return false;
    }

    setTemporaryChatStatus(false);
    $('#rm_print_characters_block .character_select').removeClass('is_active');
    $(`#CharID${chid}`).addClass('is_active');

    select_rm_create({ switchMenu });
    if (switchMenu) setMenuType('character_edit');
    // Selecting a character switches the right nav to rm_ch_create_block, which
    // hosts the sole-owner React authoring panel; mount it on this path too.
    if (switchMenu) queueReactCharacterAuthoringRemount();
    $('#delete_button').css('display', 'flex');
    $('#export_button').css('display', 'flex');
    $('#world_button').css('display', 'flex');

    //create text poles
    $('#rm_button_back').css('display', 'none');
    //$("#character_import_button").css("display", "none");
    $('#create_button').attr('value', 'Save');              // what is the use case for this?
    $('#dupe_button').show();
    $('#create_button_label').css('display', 'none');
    $('.character-detail-edit-action').show();

    $('#set_chat_character_settings').show();
    $('#rm_button_selected_ch').children('h2').text(character.name);

    $('#add_avatar_button').val('');

    $('#character_popup-button-h3').text(character.name);
    $('#character_name_pole').val(character.name);
    $('#description_textarea').val(character.description);
    $('#character_world').val(character.data?.extensions?.world || '');
    $('#creator_notes_textarea').val(character.data?.creator_notes || character.creatorcomment);
    $('#creator_notes_spoiler').html(formatCreatorNotes(character.data?.creator_notes || character.creatorcomment, character.avatar));
    $('#character_version_textarea').val(character.data?.character_version || '');
    $('#system_prompt_textarea').val(character.data?.system_prompt || '');
    $('#post_history_instructions_textarea').val(character.data?.post_history_instructions || '');
    $('#tags_textarea').val(Array.isArray(character.data?.tags) ? character.data.tags.join(', ') : '');
    $('#creator_textarea').val(character.data?.creator);
    $('#character_version_textarea').val(character.data?.character_version || '');
    $('#personality_textarea').val(character.personality);
    $('#firstmessage_textarea').val(character.first_mes);
    $('#scenario_pole').val(character.scenario);
    $('#depth_prompt_prompt').val(character.data?.extensions?.depth_prompt?.prompt ?? '');
    $('#depth_prompt_depth').val(character.data?.extensions?.depth_prompt?.depth ?? state.depth_prompt_depth_default);
    $('#depth_prompt_role').val(character.data?.extensions?.depth_prompt?.role ?? state.depth_prompt_role_default);
    $('#mes_example_textarea').val(character.mes_example);
    $('#selected_chat_pole').val(character.chat);
    $('#create_date_pole').val(timestampToMoment(character.create_date).toISOString());
    $('#avatar_url_pole').val(character.avatar);
    $('#chat_import_avatar_url').val(character.avatar);
    $('#chat_import_character_name').val(character.name);
    $('#character_json_data').val(character.json_data);

    updateFavButtonState(character.fav || character.fav == 'true');

    const avatarUrl = character.avatar != 'none' ? getThumbnailUrl('avatar', character.avatar) : state.default_avatar;
    $('#avatar_load_preview').attr('src', avatarUrl);
    $('.open_alternate_greetings').data('chid', chid);
    $('#set_character_world').data('chid', chid);
    setWorldInfoButtonClass(chid);
    checkEmbeddedWorld(chid);

    $('#name_div').removeClass('displayBlock');
    $('#name_div').addClass('displayNone');
    $('#renameCharButton').css('display', '');

    $('#form_create').attr('actiontype', 'editcharacter');
    $('.form_create_bottom_buttons_block .chat_lorebook_button').show();

    const externalMediaState = isExternalMediaAllowed();
    $('#character_open_media_overrides').show();
    $('#character_media_allowed_icon').toggle(externalMediaState);
    $('#character_media_forbidden_icon').toggle(!externalMediaState);

    // Update some stuff about the char management dropdown
    $('#character_source').attr('disabled', !getCharacterSource(chid) ? '' : null);

    eventSource.emit(event_types.CHARACTER_EDITOR_OPENED, chid);

    saveSettingsDebounced();
}


export async function openCharacterWorldPopup() {
    const chid = $('#set_character_world').data('chid');
    if (state.menu_type != 'create' && chid === undefined) {
        toastr.error('Does not have an Id for this character in world select menu.');
        return;
    }

    if (state.menu_type !== 'create') {
        await unshallowCharacter(String(chid));
    }

    // TODO: Maybe make this utility function not use the window context?
    const fileName = getCharaFilename(chid);
    const charName = (state.menu_type == 'create' ? state.create_save.name : state.characters[chid]?.data?.name) || 'Nameless';
    const worldId = (state.menu_type == 'create' ? state.create_save.world : state.characters[chid]?.data?.extensions?.world) || '';
    const template = $('#character_world_template .character_world').clone();
    template.find('.character_name').text(charName);

    // --- Event Handlers ---
    async function handlePrimaryWorldSelect() {
        const selectedValue = $(this).val();
        const worldIndex = selectedValue !== '' ? Number(selectedValue) : NaN;
        const name = !isNaN(worldIndex) ? state.world_names[worldIndex] : '';
        await charUpdatePrimaryWorld(name);
    }

    function handleExtrasWorldSelect(evt) {
        const el = evt?.currentTarget ?? this;
        const selectedValues = $(el).val();
        const selected = Array.isArray(selectedValues) ? selectedValues : [];
        const fileName = getCharaFilename(null, {});
        const nextList = selected.map(i => state.world_names[i]).filter(Boolean);
        charSetAuxWorlds(fileName, nextList);
    }

    // --- Populate Dropdowns ---
    // Append to primary dropdown.
    const primarySelect = template.find('.character_world_info_selector');
    state.world_names.forEach((item, i) => {
        primarySelect.append(new Option(item, String(i), item === worldId, item === worldId));
    });

    // Append to extras dropdown.
    const extrasSelect = template.find('.character_extra_world_info_selector');
    const existingCharLore = state.world_info.charLore?.find((e) => e.name === fileName);
    state.world_names.forEach((item, i) => {
        const array = (state.menu_type == 'create' ? state.create_save.extra_books : existingCharLore?.extraBooks);
        const isSelected = !!array?.includes(item);
        extrasSelect.append(new Option(item, String(i), isSelected, isSelected));
    });

    const popup = new Popup(template, POPUP_TYPE.TEXT, '', {
        onOpen: function (popup) {
            const popupDialog = $(popup.dlg);

            primarySelect.on('change', handlePrimaryWorldSelect);
            extrasSelect.on('change', handleExtrasWorldSelect);

            // Not needed on mobile.
            if (!isMobile()) {
                extrasSelect.select2({
                    width: '100%',
                    placeholder: t`No auxiliary Lorebooks set. Click here to select.`,
                    allowClear: true,
                    closeOnSelect: false,
                    dropdownParent: popupDialog,
                });
            }
        },
    });

    await popup.show();
}


/**
 * Creates or edits a character based on the form data.
 * @param {Event} [e] Event that triggered the function call.
 */
export async function createOrEditCharacter(e) {
    if (!state.settingsReady) {
        console.warn('Settings not ready, aborting character creation/editing.');
        return;
    }

    $('#rm_info_avatar').html('');
    const formData = new FormData(/** @type {HTMLFormElement} */($('#form_create').get(0)));
    formData.set('fav', String(state.fav_ch_checked));
    const isNewChat = e instanceof CustomEvent && e.type === 'newChat';

    const rawFile = formData.get('avatar');
    if (rawFile instanceof File) {
        const convertedFile = await ensureImageFormatSupported(rawFile);
        formData.set('avatar', convertedFile);
    }

    const headers = getRequestHeaders({ omitContentType: true });

    if ($('#form_create').attr('actiontype') == 'createcharacter') {
        if (String($('#character_name_pole').val()).length === 0) {
            toastr.error(t`Name is required`);
            return;
        }
        if (state.is_send_press) {
            toastr.error(t`Cannot create characters while generating. Stop the request and try again.`, t`Creation aborted`);
            return;
        }
        try {
            //if the character name text area isn't empty (only posible when creating a new character)
            let url = '/api/characters/create';

            if (state.crop_data != undefined) {
                url += `?crop=${encodeURIComponent(JSON.stringify(state.crop_data))}`;
            }

            formData.delete('alternate_greetings');
            for (const value of state.create_save.alternate_greetings) {
                formData.append('alternate_greetings', value);
            }

            formData.append('extensions', JSON.stringify(state.create_save.extensions));

            const fetchResult = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: formData,
                cache: 'no-cache',
            });

            if (!fetchResult.ok) {
                throw new Error('Fetch result is not ok');
            }

            const avatarId = await fetchResult.text();

            $('#character_cross').trigger('click'); //closes the advanced character editing popup
            const fields = [
                { id: '#character_name_pole', callback: value => state.create_save.name = value },
                { id: '#description_textarea', callback: value => state.create_save.description = value },
                { id: '#creator_notes_textarea', callback: value => state.create_save.creator_notes = value },
                { id: '#character_version_textarea', callback: value => state.create_save.character_version = value },
                { id: '#post_history_instructions_textarea', callback: value => state.create_save.post_history_instructions = value },
                { id: '#system_prompt_textarea', callback: value => state.create_save.system_prompt = value },
                { id: '#tags_textarea', callback: value => state.create_save.tags = value },
                { id: '#creator_textarea', callback: value => state.create_save.creator = value },
                { id: '#personality_textarea', callback: value => state.create_save.personality = value },
                { id: '#firstmessage_textarea', callback: value => state.create_save.first_message = value },
                { id: '#scenario_pole', callback: value => state.create_save.scenario = value },
                { id: '#depth_prompt_prompt', callback: value => state.create_save.depth_prompt_prompt = value },
                { id: '#depth_prompt_depth', callback: value => state.create_save.depth_prompt_depth = value, defaultValue: state.depth_prompt_depth_default },
                { id: '#depth_prompt_role', callback: value => state.create_save.depth_prompt_role = value, defaultValue: state.depth_prompt_role_default },
                { id: '#mes_example_textarea', callback: value => state.create_save.mes_example = value },
                { id: '#character_json_data', callback: () => { } },
                { id: '#alternate_greetings_template', callback: value => state.create_save.alternate_greetings = value, defaultValue: [] },
                { id: '#character_world', callback: value => state.create_save.world = value },
                { id: '#_character_extensions_fake', callback: _value => state.create_save.extensions = {} },
            ];

            fields.forEach(field => {
                const fieldValue = field.defaultValue !== undefined ? field.defaultValue : '';
                $(field.id).val(fieldValue);
                if (field.callback) field.callback(fieldValue);
            });

            if (Array.isArray(state.create_save.extra_books) && state.create_save.extra_books.length > 0) {
                const fileName = getCharaFilename(null, { manualAvatarKey: avatarId });
                const charLore = state.world_info.charLore ?? [];
                charLore.push({ name: fileName, extraBooks: state.create_save.extra_books });
                Object.assign(state.world_info, { charLore: charLore });
                saveSettingsDebounced();
            }
            state.create_save.extra_books = [];

            $('#character_popup-button-h3').text('Create character');

            state.create_save.avatar = null;

            $('#add_avatar_button').replaceWith(
                $('#add_avatar_button').val('').clone(true),
            );

            let oldSelectedChar = null;
            if (state.this_chid !== undefined) {
                oldSelectedChar = state.characters[state.this_chid].avatar;
            }

            console.log(`new avatar id: ${avatarId}`);
            createTagMapFromList('#tagList', avatarId);
            await getCharacters();

            select_rm_info('char_create', avatarId, oldSelectedChar);

            state.crop_data = undefined;
        } catch (error) {
            console.error('Error creating character', error);
            toastr.error(t`Failed to create character`);
        }
    } else {
        try {
            let url = '/api/characters/edit';

            if (state.crop_data != undefined) {
                url += `?crop=${encodeURIComponent(JSON.stringify(state.crop_data))}`;
            }

            formData.delete('alternate_greetings');
            const chid = $('.open_alternate_greetings').data('chid');
            if (state.characters[chid] && Array.isArray(state.characters[chid]?.data?.alternate_greetings)) {
                for (const value of state.characters[chid].data.alternate_greetings) {
                    formData.append('alternate_greetings', value);
                }
            }

            const fetchResult = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: formData,
                cache: 'no-cache',
            });

            if (!fetchResult.ok) {
                throw new Error('Fetch result is not ok');
            }

            const editedAvatar = formData.get('avatar_url');
            if (!shouldRefreshCharacterAfterEdit(state.characters, editedAvatar)) {
                return;
            }

            await getOneCharacter(editedAvatar);
            state.favsToHotswap(); // Update fav state

            $('#add_avatar_button').replaceWith(
                $('#add_avatar_button').val('').clone(true),
            );
            $('#create_button').attr('value', 'Save');
            state.crop_data = undefined;
            await eventSource.emit(event_types.CHARACTER_EDITED, { detail: { id: state.this_chid, character: state.characters[state.this_chid] } });

            // Recreate the chat if it hasn't been used at least once (i.e. with continue).
            const message = getFirstMessage();
            const shouldRegenerateMessage =
                !isNewChat &&
                message.mes &&
                !state.chat_metadata.tainted &&
                (state.chat.length === 0 || (state.chat.length === 1 && !state.chat[0].is_user && !state.chat[0].is_system));

            if (shouldRegenerateMessage) {
                state.chat.splice(0, state.chat.length, message);
                const messageId = (state.chat.length - 1);
                await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, 'first_message');
                await clearChat();
                await printMessages();
                await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, 'first_message');
                await saveChatConditional();
            }
        } catch (error) {
            console.log(error);
            toastr.error(t`Something went wrong while saving the character, or the image file provided was in an invalid format. Double check that the image is not a webp.`);
        }
    }
}


/**
 * Deletes a character completely, including associated chats if specified
 *
 * @param {string|string[]} characterKey - The key (avatar) of the character to be deleted
 * @param {Object} [options] - Optional parameters for the deletion
 * @param {boolean} [options.deleteChats=true] - Whether to delete associated chats or not
 * @param {string[]} [options.deleteWorlds] - World info names to delete (from caller's preflight)
 * @param {boolean} [options.clearWorldReferences] - Whether to clear world references in remaining characters
 * @param {boolean} [options.temporaryChatAcknowledged=false] - Whether the caller already confirmed the temporary-chat data loss warning
 * @return {Promise<boolean>} - A promise that resolves when the character is successfully deleted
 */
export async function deleteCharacter(characterKey, { deleteChats = true, deleteWorlds, clearWorldReferences, temporaryChatAcknowledged = false, deleteContext = null } = {}) {
    const deleteFlowStartedAt = performance.now();
    cancelDebounce(saveCharacterDebounced);
    if (!Array.isArray(characterKey)) {
        characterKey = [characterKey];
    }
    const deleteCandidates = getCharacterDeleteCandidates(state.characters, characterKey);

    const inTempChat = state.this_chid === undefined && state.name2 === state.neutralCharacterName;
    if (inTempChat && !temporaryChatAcknowledged) {
        const confirmClose = await Popup.show.confirm(
            t`You are currently in a temporary chat.`,
            t`Deleting this character will close the chat and you will lose any unsaved messages. Do you want to proceed?`,
        );
        if (!confirmClose) {
            return false;
        }
    }

    state.isCharacterDeleteReconcileInProgress = true;
    try {
        const closeChatResult = await closeCurrentChatForDelete();
        if (!closeChatResult) {
            return false;
        }

        // World info cascade preflight — only when caller did not provide choices
        let resolvedDeleteWorlds = deleteWorlds ?? [];
        let resolvedClearRefs = clearWorldReferences ?? false;
        if (deleteWorlds === undefined) {
            try {
                const preflightResponse = await fetch('/api/characters/delete-preflight', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ avatars: characterKey }),
                    cache: 'no-cache',
                });
                if (preflightResponse.ok) {
                    const preflightData = await preflightResponse.json();
                    if (preflightData.worldInfos && preflightData.worldInfos.length > 0) {
                        const cascadeResult = await showWorldInfoCascadeDialog(preflightData.worldInfos);
                        if (cascadeResult === null) {
                            return false;
                        }
                        resolvedDeleteWorlds = cascadeResult.deleteWorlds;
                        resolvedClearRefs = cascadeResult.clearWorldReferences;
                    }
                }
            } catch {
                // Preflight failure should not block deletion
            }
        }

        let deleted = false;
        const deletedAvatars = [];

        for (const { avatar, character, index: chid } of deleteCandidates) {
            const chatLookupStartedAt = performance.now();
            const pastChats = character ? await getPastCharacterChats(chid) : [];
            markPerfInteractionMetric('preDeleteChatLookupMs', performance.now() - chatLookupStartedAt);

            const msg = { avatar_url: avatar, delete_chats: deleteChats };

            const deleteRequestStartedAt = performance.now();
            const response = await fetch('/api/characters/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(msg),
                cache: 'no-cache',
            });
            markPerfInteractionMetric('deleteRequestMs', performance.now() - deleteRequestStartedAt);

            if (!response.ok) {
                toastr.error(`${response.status} ${response.statusText}`, t`Failed to delete character`);
                continue;
            }

            state.accountStorage.removeItem(`AlertWI_${avatar}`);
            state.accountStorage.removeItem(`AlertRegex_${avatar}`);
            state.accountStorage.removeItem(`mediaWarningShown:${avatar}`);
            delete state.tag_map[avatar];
            select_rm_info('char_delete', character?.name ?? avatar);

            if (deleteChats) {
                for (const chat of pastChats) {
                    const name = chat.file_name.replace('.jsonl', '');
                    await eventSource.emit(event_types.CHAT_DELETED, name);
                }
            }

            await eventSource.emit(event_types.CHARACTER_DELETED, { id: chid, character: character ?? { avatar } });
            deletedAvatars.push(avatar);
            deleted = true;
        }

        // World info cascade: delete world files and clear references after all characters are deleted
        if (deleted && resolvedDeleteWorlds.length > 0) {
            try {
                const cascadeResp = await fetch('/api/worldinfo/delete-cascade', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        worlds: resolvedDeleteWorlds,
                        clear_references: resolvedClearRefs,
                    }),
                    cache: 'no-cache',
                });
                if (cascadeResp.ok) {
                    await flushDeletedWorldsFromUI(resolvedDeleteWorlds);
                }
            } catch {
                // Cascade failure should not block the UI cleanup
            }
        }

        await removeCharacterFromUI(deletedAvatars, { deleteContext });
        markPerfInteractionMetric('deleteFlowMs', performance.now() - deleteFlowStartedAt);
        return deleted;
    } finally {
        state.isCharacterDeleteReconcileInProgress = false;
        state.characterDeleteReconcileGeneration++;
    }
}
