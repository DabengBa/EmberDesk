import { eventSource, event_types } from './events.js';
import { debounce_timeout } from './constants.js';
import { getRequestHeaders } from './request-context.js';
import { createOrEditCharacter } from './character-lifecycle-service.js';
import { ensureMessageMediaIsArray, scrollChatToBottom, updateMessageElement } from './message-service.js';
import { refreshSwipeButtons } from './generation-service.js';
import { runDeleteCharacterClosePreflight } from './delete-character-preflight.js';
import { requireChatOpsShellContext } from './chat-ops-shell-context.js';

function shell() {
    return requireChatOpsShellContext();
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

const applyStylePins = (...args) => shell().applyStylePins(...args);
const compressRequest = (...args) => shell().compressRequest(...args);
const callGenericPopup = (...args) => shell().callGenericPopup(...args);
const cancelDebouncedChatSave = (...args) => shell().cancelDebouncedChatSave(...args);
const cancelDebouncedMetadataSave = (...args) => shell().cancelDebouncedMetadataSave(...args);
const clamp = (...args) => shell().clamp(...args);
const closeMessageEditor = (...args) => shell().closeMessageEditor(...args);
const consumeMainChatMessageListScrollRestore = (...args) => shell().consumeMainChatMessageListScrollRestore(...args);
const delay = (...args) => shell().delay(...args);
const deleteMainChatMessageListScrollSnapshot = (...args) => shell().deleteMainChatMessageListScrollSnapshot(...args);
const equalsIgnoreCaseAndAccents = (...args) => shell().equalsIgnoreCaseAndAccents(...args);
const flashHighlight = (...args) => shell().flashHighlight(...args);
const getChatResult = (...args) => shell().getChatResult(...args);
const getCurrentChatId = (...args) => shell().getCurrentChatId(...args);
const getLastMessageId = (...args) => shell().getLastMessageId(...args);
const getMainChatReactVisibleWindow = (...args) => shell().getMainChatReactVisibleWindow(...args);
const hasMainChatMessageListScrollRestore = (...args) => shell().hasMainChatMessageListScrollRestore(...args);
const humanizedDateTime = (...args) => shell().humanizedDateTime(...args);
const isElementInViewport = (...args) => shell().isElementInViewport(...args);
const isReactMainChatOwner = (...args) => shell().isReactMainChatOwner(...args);
const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const persistMainChatMessageListScrollSnapshotBeforeClear = (...args) => shell().persistMainChatMessageListScrollSnapshotBeforeClear(...args);
const queueMainChatMessageListScrollRestore = (...args) => shell().queueMainChatMessageListScrollRestore(...args);
const redisplayChat = (...args) => shell().redisplayChat(...args);
const reloadCurrentChat = (...args) => shell().reloadCurrentChat(...args);
const renderSelectChatListReact = (...args) => shell().renderSelectChatListReact(...args);

// Guards against out-of-order chat-search responses overwriting newer results.
let selectChatListGeneration = 0;
const saveTokenCache = (...args) => shell().saveTokenCache(...args);
const scrollOnMediaLoad = (...args) => shell().scrollOnMediaLoad(...args);
const select_rm_characters = (...args) => shell().select_rm_characters(...args);
const setActiveCharacter = (...args) => shell().setActiveCharacter(...args);
const setCharacterId = (...args) => shell().setCharacterId(...args);
const setCharacterName = (...args) => shell().setCharacterName(...args);
const sortMoments = (...args) => shell().sortMoments(...args);
const t = (...args) => shell().t(...args);
const timestampToMoment = (...args) => shell().timestampToMoment(...args);
const unshallowCharacter = (...args) => shell().unshallowCharacter(...args);
const updateRemoteChatName = (...args) => shell().updateRemoteChatName(...args);
const uuidv4 = (...args) => shell().uuidv4(...args);
const waitUntilCondition = (...args) => shell().waitUntilCondition(...args);
const Popup = new Proxy(function () {}, {
    get: (_, key) => shell().Popup[key],
    construct: (_, args) => new (shell().Popup)(...args),
});
const POPUP_TYPE = new Proxy({}, { get: (_, key) => shell().POPUP_TYPE[key] });

/**
 * Deletes a character chat by its name.
 * @param {string} characterId Character ID to delete chat for
 * @param {string} fileName Name of the chat file to delete (without .jsonl extension)
 * @returns {Promise<void>} A promise that resolves when the chat is deleted.
 */
export async function deleteCharacterChatByName(characterId, fileName) {
    // Make sure all the data is loaded.
    await unshallowCharacter(characterId);

    /** @type {Character} */
    const character = state.characters[characterId];
    if (!character) {
        console.warn(`Character with ID ${characterId} not found.`);
        return;
    }

    const response = await fetch('/api/chats/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            chatfile: `${fileName}.jsonl`,
            avatar_url: character.avatar,
        }),
    });

    if (!response.ok) {
        console.error('Failed to delete chat for character.');
        return;
    }

    if (fileName === character.chat) {
        const chatsResponse = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: character.avatar }),
        });
        const chats = Object.values(await chatsResponse.json());
        chats.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));
        const newChatName = chats.length && typeof chats[0] === 'object' ? chats[0].file_name.replace('.jsonl', '') : `${character.name} - ${humanizedDateTime()}`;
        await updateRemoteChatName(characterId, newChatName);
    }

    await eventSource.emit(event_types.CHAT_DELETED, fileName);
}


/**
 * React-owned long-chat load-earlier command.
 * Expands the immutable projection window; React renders the resulting rows.
 * @param {number|null} [messagesToLoad=null]
 * @returns {Promise<void>}
 */
export async function loadEarlierChatMessages(messagesToLoad = null) {
    if (isReactMainChatOwner()) {
        const visibleWindow = getMainChatReactVisibleWindow(state.reactMainChatProjectionCleared ? [] : state.chat);
        const configuredCount = Number(state.power_user?.chat_truncation);
        const count = Number.isInteger(messagesToLoad) && messagesToLoad > 0
            ? messagesToLoad
            : Number.isInteger(configuredCount) && configuredCount > 0
                ? configuredCount
                : state.chat.length;
        state.mainChatVisibleStartIndices.set(getCurrentChatId(), Math.max(
            0,
            (visibleWindow.visibleMessageIds.length > 0
                ? Number(visibleWindow.visibleMessageIds[0])
                : state.chat.length) - count,
        ));
        await eventSource.emit(event_types.MORE_MESSAGES_LOADED);
        void mountReactMainChatMessageListPanel();
        return;
    }

    const firstDisplayedMesId = state.chatElement.children('.mes').first().attr('mesid');
    const firstDisplayedMessage = state.chatElement.children('.mes').first();
    let messageId = Number(firstDisplayedMesId);
    let count = messagesToLoad || state.power_user.chat_truncation || Number.MAX_SAFE_INTEGER;

    // If there are no messages displayed, or the message somehow has no mesid, we default to one higher than last message id,
    // so the first "new" message being shown will be the last available message
    if (isNaN(messageId)) {
        messageId = getLastMessageId() + 1;
    }

    console.debug('Inserting messages before', messageId, 'count', count, 'chat length', state.chat.length);
    const prevHeight = state.chatElement.prop('scrollHeight');
    const showMoreButton = $('#show_more_messages');
    const isButtonInView = isElementInViewport(showMoreButton[0]);

    const firstId = clamp(messageId - count, 0, Infinity);
    const messageElements = [];
    state.chat.slice(firstId, messageId).forEach((message, id) => {
        messageElements.push(updateMessageElement(message, { messageId: firstId + id }));
    });
    const messageNodes = messageElements
        .map(messageElement => messageElement?.[0] instanceof HTMLElement ? messageElement[0] : null)
        .filter(Boolean);

    // Insert older rows ahead of the current first message so load-more keeps
    // chronological DOM order and scroll compensation remains stable.
    if (firstDisplayedMessage[0] instanceof HTMLElement && messageNodes.length > 0) {
        firstDisplayedMessage[0].before(...messageNodes);
    } else if (showMoreButton[0]) {
        showMoreButton[0].after(...messageNodes);
    } else {
        state.chatElement.prepend(messageNodes);
    }
    refreshSwipeButtons();

    if (firstId === 0) {
        showMoreButton.remove();
    }

    if (isButtonInView) {
        const newHeight = state.chatElement.prop('scrollHeight');
        state.chatElement.scrollTop(newHeight - prevHeight);
    }

    applyStylePins();
    await eventSource.emit(event_types.MORE_MESSAGES_LOADED);
    void mountReactMainChatMessageListPanel();
}


export async function printMessages() {
    state.mainChatMessageUiState.clear();
    if (isReactMainChatOwner()) {
        state.reactMainChatProjectionCleared = false;
        const shouldRestore = hasMainChatMessageListScrollRestore();
        void mountReactMainChatMessageListPanel();
        if (!shouldRestore) {
            scrollChatToBottom({ waitForFrame: true });
        }
        return;
    }

    let startIndex = 0;
    let count = state.power_user.chat_truncation || Number.MAX_SAFE_INTEGER;

    if (state.chat.length > count) {
        startIndex = state.chat.length - count;
        state.chatElement.append('<div id="show_more_messages">Show more messages</div>');
    }

    await redisplayChat({ startIndex, fade: false });
    const renderGeneration = ++state.mainChatMessageRenderGeneration;

    if (!consumeMainChatMessageListScrollRestore()) {
        scrollChatToBottom({ waitForFrame: true });
        delay(debounce_timeout.short).then(() => scrollOnMediaLoad(renderGeneration));
    }
}


/**
 * Visually removes all chat message elements.
 * @param {object} [options] Options
 * @param {boolean} [options.clearData=false] Optionally clear the chat array's contents.
 */
export async function clearChat({ clearData = false, preserveMainChatScrollSnapshot = true } = {}) {
    cancelDebouncedChatSave();
    cancelDebouncedMetadataSave();
    closeMessageEditor();
    if (preserveMainChatScrollSnapshot) {
        persistMainChatMessageListScrollSnapshotBeforeClear();
    }
    state.extension_prompts = {};
    if (state.is_delete_mode) {
        $('#dialogue_del_mes_cancel').trigger('click');
    }
    // React owns #chat after the main-chat cutover; changing the store projection
    // is enough to clear rows and avoids a second DOM writer.
    if (!isReactMainChatOwner()) {
        // This also removes non '.mes' elements, e.g. '#show_more_messages'.
        state.chatElement.children().remove();
    }
    if ($('.zoomed_avatar[forChar]').length) {
        console.debug('saw avatars to remove');
        $('.zoomed_avatar[forChar]').remove();
    } else { console.debug('saw no avatars'); }

    if (clearData) state.chat.length = 0;
    if (isReactMainChatOwner()) {
        state.reactMainChatProjectionCleared = true;
        void mountReactMainChatMessageListPanel();
    }
}


export async function renamePastChats(oldAvatar, newAvatar, newName) {
    const pastChats = await getPastCharacterChats();

    for (const { file_name } of pastChats) {
        try {
            const fileNameWithoutExtension = file_name.replace('.jsonl', '');
            const getChatResponse = await fetch('/api/chats/get', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    ch_name: newName,
                    file_name: fileNameWithoutExtension,
                    avatar_url: newAvatar,
                }),
                cache: 'no-cache',
            });

            if (getChatResponse.ok) {
                const currentChat = await getChatResponse.json();

                for (const message of currentChat) {
                    if (message.is_user || message.is_system || message.extra?.type == state.system_message_types.NARRATOR) {
                        continue;
                    }

                    if (message.name !== undefined) {
                        message.name = newName;
                    }
                }

                await eventSource.emit(event_types.CHARACTER_RENAMED_IN_PAST_CHAT, currentChat, oldAvatar, newAvatar);

                const saveChatRequest = await compressRequest({
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        ch_name: newName,
                        file_name: fileNameWithoutExtension,
                        chat: currentChat,
                        avatar_url: newAvatar,
                    }),
                    cache: 'no-cache',
                });
                const saveChatResponse = await fetch('/api/chats/save', saveChatRequest);

                if (!saveChatResponse.ok) {
                    throw new Error('Could not save chat');
                }
            }
        } catch (error) {
            toastr.error(t`Past chat could not be updated: ${file_name}`);
            console.error(error);
        }
    }
}


export function saveChatDebounced() {
    const chid = state.this_chid;

    cancelDebouncedChatSave();

    state.chatSaveTimeout = setTimeout(async () => {
        if (chid !== state.this_chid) {
            console.warn('Chat save timeout triggered, but chid changed. Aborting.');
            return;
        }

        console.debug('Chat save timeout triggered');
        await saveChatConditional();
        console.debug('Chat saved');
    }, state.DEFAULT_SAVE_EDIT_TIMEOUT);
}


/**
 * Saves the chat to the server.
 * @param {object} [options] - Additional options.
 * @param {string} [options.chatName] The name of the chat file to save to
 * @param {object} [options.withMetadata] Additional metadata to save with the chat
 * @param {number} [options.mesId] The message ID to save the chat up to
 * @param {boolean} [options.force] Force the saving despite the integrity check result
 * @param {ChatMessage[]} [options.chatData] Chat snapshot to save instead of the current in-memory chat
 *
 * @returns {Promise<void>}
 */
export async function saveChat({ chatName, withMetadata, mesId, force = false, chatData = undefined } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('saveChat called with positional arguments. Please use an object instead.');
        [chatName, withMetadata, mesId, force] = arguments;
    }

    const metadata = { ...state.chat_metadata, ...(withMetadata || {}) };
    const fileName = chatName ?? state.characters[state.this_chid]?.chat;

    if (!fileName && state.name2 === state.neutralCharacterName) {
        // TODO: Do something for a temporary chat with no character.
        return;
    }

    if (!fileName) {
        console.warn('saveChat called without chat_name and no chat file found');
        return;
    }

    state.characters[state.this_chid].date_last_chat = Date.now();

    const trimmedChat = Array.isArray(chatData)
        ? chatData
        : (mesId !== undefined && mesId >= 0 && mesId < state.chat.length)
            ? state.chat.slice(0, Number(mesId) + 1)
            : state.chat.slice();

    /** @type {ChatHeader} */
    const chatHeader = {
        chat_metadata: metadata,
        user_name: 'unused',
        character_name: 'unused',
    };

    try {
        const saveChatRequest = await compressRequest({
            method: 'POST',
            cache: 'no-cache',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                ch_name: state.characters[state.this_chid].name,
                file_name: fileName,
                chat: [chatHeader, ...trimmedChat],
                avatar_url: state.characters[state.this_chid].avatar,
                force: force,
            }),
        });
        const result = await fetch('/api/chats/save', saveChatRequest);

        if (result.ok) {
            return;
        }

        const errorData = await result.json();
        const isIntegrityError = errorData?.error === 'integrity' && !force;
        if (!isIntegrityError) {
            throw new Error(result.statusText);
        }

        const popupResult = await Popup.show.input(
            t`ERROR: Chat integrity check failed while saving the file.`,
            t`<p>After you click OK, the page will be reloaded to prevent data corruption.</p>
              <p>To confirm an overwrite (and potentially <b>LOSE YOUR DATA</b>), enter <code>OVERWRITE</code> (in all caps) in the box below before clicking OK.</p>`,
            '',
            { okButton: 'OK', cancelButton: false },
        );

        const forceSaveConfirmed = popupResult === 'OVERWRITE';

        if (!forceSaveConfirmed) {
            console.warn('Chat integrity check failed, and user did not confirm the overwrite. Reloading the page.');
            window.location.reload();
            return;
        }

        await saveChat({ chatName, withMetadata, mesId, force: true });
    } catch (error) {
        console.error(error);
        toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Chat could not be saved`);
    }
}


export async function getChat() {
    try {
        await unshallowCharacter(state.this_chid);

        const response = await fetch('/api/chats/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify({
                ch_name: state.characters[state.this_chid].name,
                file_name: state.characters[state.this_chid].chat,
                avatar_url: state.characters[state.this_chid].avatar,
            }),
        });

        if (!response.ok) {
            throw new Error('Chat could not be loaded');
        }

        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            /** @type {ChatHeader} */
            const chatHeader = data.shift();
            state.chat_metadata = chatHeader?.chat_metadata ?? {};
            state.chat.splice(0, state.chat.length, ...data);
            state.chat.forEach(ensureMessageMediaIsArray);
        } else {
            // An empty/corrupted chat file
            state.chat.splice(0, state.chat.length);
            state.chat_metadata = {};
        }
        state.reactMainChatProjectionCleared = false;
        if (!state.chat_metadata.integrity) {
            state.chat_metadata.integrity = uuidv4();
        }
        queueMainChatMessageListScrollRestore(state.characters[state.this_chid].chat);
        await getChatResult();
        eventSource.emit(event_types.CHAT_LOADED, { detail: { id: state.this_chid, character: state.characters[state.this_chid] } });

        // Focus on the textarea if not already focused on a visible text input
        delay(debounce_timeout.short).then(() => {
            if ($(document.activeElement).is('input:visible, textarea:visible')) {
                return;
            }
            $('#send_textarea').trigger('click').trigger('focus');
        });
    } catch (error) {
        await getChatResult();
        console.log(error);
    }
}


export async function openCharacterChat(file_name) {
    await waitUntilCondition(() => !state.isChatSaving, debounce_timeout.extended, 10);
    const currentChatId = getCurrentChatId();
    const isReopeningCurrentChat = typeof currentChatId === 'string' && currentChatId === file_name;
    if (isReopeningCurrentChat) {
        deleteMainChatMessageListScrollSnapshot(file_name);
        state.mainChatVisibleStartIndices.delete(file_name);
    }

    await clearChat({ clearData: true, preserveMainChatScrollSnapshot: !isReopeningCurrentChat });
    state.characters[state.this_chid].chat = file_name;
    state.chat_metadata = {};
    await getChat();
    $('#selected_chat_pole').val(file_name);
    await createOrEditCharacter(new CustomEvent('newChat'));
}


/**
 * Fetches the metadata of all past chats related to a specific character based on its avatar URL.
 * The function sends a POST request to the server to retrieve all chats for the character. It then
 * processes the received data, sorts it by the file name, and returns the sorted data.
 *
 * @param {null|number} [characterId=null] - When set, the function will use this character id instead of this_chid.
 *
 * @returns {Promise<Array>} - An array containing metadata of all past chats of the character, sorted
 * in descending order by file name. Returns an empty array if the fetch request is unsuccessful or the
 * response is an object with an `error` property set to `true`.
 */
export async function getPastCharacterChats(characterId = null) {
    characterId = characterId ?? parseInt(state.this_chid);
    if (!state.characters[characterId]) return [];

    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        body: JSON.stringify({ avatar_url: state.characters[characterId].avatar }),
        headers: getRequestHeaders(),
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json();
    if (typeof data === 'object' && data.error === true) {
        return [];
    }

    const chats = Object.values(data);
    return chats.sort((a, b) => a.file_name.localeCompare(b.file_name)).reverse();
}


export async function displayChats(searchQuery, currentChat, displayName, avatarImg, highlightNames) {
    const generation = ++selectChatListGeneration;
    try {
        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                query: searchQuery,
                avatar_url: state.characters[state.this_chid].avatar,
            }),
        });

        if (!response.ok) {
            throw new Error('Search failed');
        }

        const filteredData = await response.json();
        if (generation !== selectChatListGeneration) {
            return;
        }
        filteredData.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));

        // React owns the list DOM inside #select_chat_div; this function is now
        // fetch/sort/project only. Delegated click handlers keep working because
        // the rendered rows replicate the #past_chat_template contract exactly.
        const rendered = await renderSelectChatListReact({
            searchQuery: String(searchQuery ?? ''),
            currentChat: String(currentChat ?? ''),
            avatarImg: String(avatarImg ?? ''),
            items: filteredData.map(chat => ({
                fileName: String(chat.file_name ?? ''),
                fileSize: String(chat.file_size ?? ''),
                messageCount: Number(chat.message_count) || 0,
                preview: String(chat.preview_message ?? ''),
                dateLabel: timestampToMoment(chat.last_mes).format('lll'),
            })),
        });
        if (!rendered) {
            return;
        }

        if (Array.isArray(highlightNames) && highlightNames.length) {
            for (const fileName of highlightNames) {
                const template = $('#select_chat_div .select_chat_block_wrapper')
                    .filter((_, el) => $(el).find('.select_chat_block').attr('file_name') === fileName)
                    .first();
                if (template.length) {
                    const templateOffset = template.offset().top - template.parent().offset().top;
                    $('#select_chat_div').scrollTop(templateOffset);
                    flashHighlight(template, debounce_timeout.extended);
                }
            }
        }
    } catch (error) {
        console.error('Error loading chats:', error);
        toastr.error('Could not load chat data. Try reloading the page.');
    }
}


export async function saveChatConditional() {
    try {
        await waitUntilCondition(() => !state.isChatSaving, state.DEFAULT_SAVE_EDIT_TIMEOUT, 100);
    } catch {
        console.warn('Timeout waiting for chat to save');
        return;
    }

    try {
        cancelDebouncedChatSave();

        state.isChatSaving = true;

        await saveChat();

        // Save token cache to IndexedDB storage
        saveTokenCache();
    } catch (error) {
        console.error('Error saving chat', error);
    } finally {
        state.isChatSaving = false;
    }
}


/**
 * Renames a character chat.
 * @param {object} param Parameters for renaming chat
 * @param {string} [param.characterId] Character ID to rename chat for
 * @param {string} param.oldFileName Old name of the chat (no JSONL extension)
 * @param {string} param.newFileName New name for the chat (no JSONL extension)
 * @param {boolean} [param.loader=true] Whether to show loader during the operation
 */
export async function renameCharacterChat({ characterId, oldFileName, newFileName, loader: showLoader }) {
    const currentChatId = getCurrentChatId();
    const body = {
        is_group: false,
        avatar_url: state.characters[characterId]?.avatar,
        original_file: `${oldFileName}.jsonl`,
        renamed_file: `${newFileName.trim()}.jsonl`,
    };

    if (body.original_file === body.renamed_file) {
        console.debug('Chat rename cancelled, old and new names are the same');
        return;
    }
    if (equalsIgnoreCaseAndAccents(body.original_file, body.renamed_file)) {
        toastr.warning(t`Name not accepted, as it is the same as before (ignoring case and accents).`, t`Rename Chat`);
        return;
    }

    const loaderHandle = showLoader ? state.loader.show({
        slug: 'chat-rename',
        title: t`Rename Chat`,
        message: t`Renaming chat…`,
        toastMode: state.loader.ToastMode.STATIC,
    }) : null;

    try {
        const response = await fetch('/api/chats/rename', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Unsuccessful request.');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error('Server returned an error.');
        }

        if (data.sanitizedFileName) {
            newFileName = data.sanitizedFileName;
        }

        if (characterId !== undefined && String(characterId) === String(state.this_chid) && state.characters[characterId]?.chat === oldFileName) {
            state.characters[characterId].chat = newFileName;
            $('#selected_chat_pole').val(state.characters[characterId].chat);
            await createOrEditCharacter();
        }

        if (currentChatId) {
            await reloadCurrentChat();
        }

        const eventData = { avatarId: body.avatar_url, oldFileName: body.original_file, newFileName: body.renamed_file };
        await eventSource.emit(event_types.CHAT_RENAMED, eventData);
    } catch {
        await delay(500);
        await callGenericPopup('An error has occurred. Chat was not renamed.', POPUP_TYPE.TEXT);
    } finally {
        await loaderHandle?.hide();
    }
}


export async function closeCurrentChatForDelete() {
    return await runDeleteCharacterClosePreflight({
        isGenerationInProgress: () => state.is_send_press !== false,
        onGenerationBlocked: () => {
            toastr.info(t`Please stop the message generation first.`);
        },
        waitForPendingChatSave: async () => {
            await waitUntilCondition(() => !state.isChatSaving, debounce_timeout.extended, 10);
        },
        clearCurrentChat: async () => {
            await clearChat({ clearData: true });
        },
        resetSelectionState: () => {
            setCharacterId(undefined);
            setCharacterName('');
            setActiveCharacter(null);
            state.this_edit_mes_id = undefined;
            state.chat_metadata = {};
            state.selected_button = 'characters';
        },
        selectCharactersView: () => {
            $('#rm_button_selected_ch').children('h2').text('');
            select_rm_characters();
        },
        emitChatChanged: async () => {
            await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
        },
    });
}
