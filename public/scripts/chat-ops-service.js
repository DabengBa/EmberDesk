import { eventSource, event_types } from './events.js';
import { CHAT_TRUNCATION, debounce_timeout } from './constants.js';
import { getRequestHeaders } from './request-context.js';
import { createOrEditCharacter } from './character-lifecycle-service.js';
import { ensureMessageMediaIsArray, scrollChatToBottom, updateMessageElement } from './message-service.js';
import { runDeleteCharacterClosePreflight } from './delete-character-preflight.js';
import { requireChatOpsShellContext } from './chat-ops-shell-context.js';
import { buildGreetingOptions, canSwitchGreeting, replaceGreeting } from './main-chat-greetings.js';
import { getComposerSnapshot, requestComposerFocus, subscribeComposerState } from './main-chat-composer-service.js';
import { runDeleteMessageCommand } from './workspace-interaction-commands.js';


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
const cancelDebouncedChatSave = (...args) => shell().cancelDebouncedChatSave(...args);
const cancelDebouncedMetadataSave = (...args) => shell().cancelDebouncedMetadataSave(...args);
const clamp = (...args) => shell().clamp(...args);
const closeMessageEditor = (...args) => shell().closeMessageEditor(...args);
const consumeMainChatMessageListScrollRestore = (...args) => shell().consumeMainChatMessageListScrollRestore(...args);
const delay = (...args) => shell().delay(...args);
const deleteMainChatMessageListScrollSnapshot = (...args) => shell().deleteMainChatMessageListScrollSnapshot(...args);
const equalsIgnoreCaseAndAccents = (...args) => shell().equalsIgnoreCaseAndAccents(...args);

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


let activeCharacterChatLoad;
let failedCharacterChatLoad;
let chatSessionVersion = 0;
// Each record belongs to a particular successful read (or explicit creation),
// not merely to a character: reopening a file replaces the record.
const chatVersions = new Map();
const chatWriteQueues = new Map();
let chatClearInProgress = false;

async function serializeChatWrite(key, work) {
    const previous = chatWriteQueues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    chatWriteQueues.set(key, next);
    try { return await next; } finally {
        if (chatWriteQueues.get(key) === next) chatWriteQueues.delete(key);
    }
}

async function sendChatWrite(request, url = '/api/chats/save') {
    const send = async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            return await fetch(url, { ...request, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    };
    try {
        return await send();
    } catch {
        // The first request may already have committed. Replay the exact body.
        try {
            return await send();
        } catch (error) {
            error.unknownChatWriteOutcome = true;
            throw error;
        }
    }
}

/**
 * Run a current-chat deletion under the same queue as saves. `remove` must
 * reject unless the deletion has been confirmed; it is responsible for its
 * own durable operation ID and retry. No fresh GET is performed.
 * @template T
 * @param {{avatar: string, chat: string}} identity
 * @param {(version: string) => Promise<T>} remove
 * @param {{suspendConditionalSaves?: boolean}} [options]
 * @returns {Promise<T>}
 */
export async function withCurrentChatDeleteVersion(identity, remove, { suspendConditionalSaves = true } = {}) {
    const character = state.characters[state.this_chid];
    const chat = state.chat;
    const session = chatSessionVersion;
    const key = chatSaveKey(identity.avatar, identity.chat);
    const current = () => state.characters[state.this_chid] === character && character?.avatar === identity.avatar
        && character?.chat === identity.chat && state.chat === chat && chatSessionVersion === session;
    if (!current()) throw new Error('The requested chat is not the current session');
    // A conditional save may have taken the UI save lock but not yet entered
    // the per-file queue. Let it finish before placing the delete in that queue.
    if (state.isChatSaving) {
        await waitUntilCondition(() => !state.isChatSaving, state.DEFAULT_SAVE_EDIT_TIMEOUT, 100);
        if (!current()) throw new Error('The requested chat is not the current session');
    }
    return serializeChatWrite(key, async () => {
        const record = chatVersions.get(key);
        if (!current() || !record?.version || record.pending || record.conflicted || record.session !== session || record.chatReference !== chat) {
            throw new Error('The loaded chat version is unavailable or its save is unresolved');
        }
        // A rejected transport can have committed remotely. Fail closed until
        // recovery explicitly reloads, even when the delete result is unknown.
        record.conflicted = true;
        record.deleting = suspendConditionalSaves;
        try {
            return await remove(record.version);
        } finally {
            record.deleting = false;
        }
    });
}

export function shouldPreserveCharacterChatTarget(avatar, chat) {
    return [activeCharacterChatLoad, failedCharacterChatLoad].some(load => load && load.avatar === avatar && load.chat === chat);
}
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

    if (String(characterId) === String(state.this_chid) && fileName === character.chat) {
        await shell().deleteCurrentChatWithRecovery(`${fileName}.jsonl`);
        return;
    }

    await shell().deleteHistoryChatConditional({ avatar: character.avatar, chat: fileName });

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
        const count = Number.isInteger(messagesToLoad) && messagesToLoad > 0
            ? messagesToLoad
            : CHAT_TRUNCATION;
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
    let count = messagesToLoad || CHAT_TRUNCATION;

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
    let count = CHAT_TRUNCATION;

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
function beginChatTransition() {
    if (chatClearInProgress || chatWriteQueues.has(currentChatSaveKey())) {
        toastr.info('Wait for the current chat save to finish before switching.', 'Chat is still saving');
        throw new Error('Current chat write has not finished');
    }
    chatClearInProgress = true;
}

async function checkpointChatTransition() {
    const recoveryRecord = chatVersions.get(currentChatSaveKey());
    if (recoveryRecord?.recoveryFailed && recoveryRecord.session === chatSessionVersion && recoveryRecord.chatReference === state.chat) {
        toastr.error('The recovery draft is not saved. Keep this chat open and retry saving after storage is available.', 'Recovery storage error', { timeOut: 0 });
        throw new Error('Chat conflict recovery has not been saved');
    }
    if (recoveryRecord?.pending && recoveryRecord.session === chatSessionVersion && recoveryRecord.chatReference === state.chat) {
        const character = state.characters[state.this_chid];
        try {
            const captured = shell().captureChatSaveRecovery?.();
            if (!captured || !shell().preserveChatSaveConflict) throw new Error('Recovery storage is unavailable');
            await shell().preserveChatSaveConflict({ avatar: character.avatar, chat: character.chat }, captured, () => true);
        } catch (error) {
            toastr.error('The unconfirmed save could not be preserved. Keep this chat open and retry after storage is available.', 'Recovery storage error', { timeOut: 0 });
            throw error;
        }
    }
    await shell().beforeClearRecovery?.();
}

export async function prepareChatTransition(previous) {
    beginChatTransition();
    try {
        const capture = () => {
            const character = state.characters[state.this_chid];
            return {
                session: chatSessionVersion,
                chat: state.chat,
                avatar: character?.avatar,
                name: character?.chat,
                recovery: character ? shell().captureChatSaveRecovery() : null,
            };
        };
        const check = current => {
            if (previous && (previous.session !== current.session || previous.chat !== current.chat
                || previous.avatar !== current.avatar || previous.name !== current.name
                || JSON.stringify(previous.recovery) !== JSON.stringify(current.recovery))) {
                toastr.warning('The chat changed while the character request was in progress. Keep this page open and save or recover your edits before switching.', 'Chat could not be switched', { timeOut: 0 });
                throw new Error('Chat changed during character transition');
            }
        };
        check(capture());
        await checkpointChatTransition();
        const current = capture();
        check(current);
        return current;
    } finally {
        chatClearInProgress = false;
    }
}

export async function clearChat({ clearData = false, preserveMainChatScrollSnapshot = true } = {}) {
    beginChatTransition();
    try {
        await checkpointChatTransition();
        chatSessionVersion++;
        cancelDebouncedChatSave();
        cancelDebouncedMetadataSave();
        closeMessageEditor();
        if (preserveMainChatScrollSnapshot) {
            persistMainChatMessageListScrollSnapshotBeforeClear();
        }
        state.extension_prompts = {};
        if (state.is_delete_mode) {
            runDeleteMessageCommand('cancel');
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
    } finally {
        chatClearInProgress = false;
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
                const version = getChatResponse.headers.get('X-Chat-Version');
                if (!version || !Array.isArray(currentChat)) throw new Error('Past chat version is unavailable');

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
                        version,
                        operationId: crypto.randomUUID(),
                    }),
                    cache: 'no-cache',
                });
                const key = chatSaveKey(newAvatar, fileNameWithoutExtension);
                await serializeChatWrite(key, async () => {
                    // Do this inside the queue, before the request: even an
                    // ambiguous network failure must not leave the old token
                    // available to a queued save of the in-memory chat.
                    const loaded = chatVersions.get(key);
                    if (loaded) loaded.conflicted = true;
                    const response = await sendChatWrite(saveChatRequest);
                    if (!response.ok) throw new Error('Could not save chat');
                    const result = await response.json();
                    if (typeof result?.version !== 'string' || !result.version) throw new Error('Chat save response is missing its version');
                });
            } else {
                throw new Error('Past chat could not be loaded');
            }
        } catch (error) {
            toastr.error(t`Past chat could not be updated: ${file_name}`);
            console.error(error);
        }
    }
}


export function saveChatDebounced(shouldSave = () => true) {
    const chid = state.this_chid;
    const key = currentChatSaveKey();
    const chat = state.chat;
    const session = chatSessionVersion;
    const stillCurrent = () => chid === state.this_chid && key === currentChatSaveKey() && chat === state.chat && session === chatSessionVersion && shouldSave();

    cancelDebouncedChatSave();

    state.chatSaveTimeout = setTimeout(async () => {
        if (!stillCurrent()) {
            console.warn('Chat save timeout triggered, but chid changed. Aborting.');
            return;
        }

        console.debug('Chat save timeout triggered');
        await saveChatConditional(stillCurrent);
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
 * @returns {Promise<boolean|undefined>}
 */
const chatSaveKey = (avatar, name) => JSON.stringify([avatar, name]);
const currentChatSaveKey = () => chatSaveKey(state.characters[state.this_chid]?.avatar, state.characters[state.this_chid]?.chat);

export async function saveChat({ chatName, withMetadata, mesId, force = false, chatData = undefined } = {}) {
    if (chatClearInProgress) return false;
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('saveChat called with positional arguments. Please use an object instead.');
        [chatName, withMetadata, mesId, force] = arguments;
    }

    // A cleared or failed load has no reliable metadata for an integrity-safe save.
    const current = state.characters[state.this_chid];
    const matchesCurrent = load => Boolean(load && current && load.avatar === current.avatar && load.chat === current.chat);
    if ((matchesCurrent(activeCharacterChatLoad) && !activeCharacterChatLoad.ready) || matchesCurrent(failedCharacterChatLoad)) {
        console.warn('Cannot save a chat that has not been loaded successfully.');
        return false;
    }

    const metadata = { ...state.chat_metadata, ...withMetadata };
    const fileName = chatName ?? state.characters[state.this_chid]?.chat;

    if (!fileName && state.name2 === state.neutralCharacterName) {
        // TODO: Do something for a temporary chat with no character.
        return;
    }

    if (!fileName) {
        console.warn('saveChat called without chat_name and no chat file found');
        return;
    }

    const character = state.characters[state.this_chid];
    const key = chatSaveKey(character.avatar, fileName);
    const explicitCreate = Boolean(chatName && chatName !== character.chat);
    const session = chatSessionVersion;
    const chatReference = state.chat;
    const currentName = character.chat;
    const isCurrent = () => session === chatSessionVersion && state.chat === chatReference
        && state.characters[state.this_chid]?.avatar === character.avatar
        && state.characters[state.this_chid]?.chat === currentName;
    let recovery = null;

    if (!explicitCreate) {
        try { recovery = shell().captureChatSaveRecovery?.(); } catch { /* Recovery failure is reported if the save conflicts. */ }
    }
    character.date_last_chat = Date.now();

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
        return await serializeChatWrite(key, async () => {
            if (!isCurrent()) return false;
            let record = chatVersions.get(key);
            if (!record && explicitCreate) {
                record = { version: null, pending: null, conflicted: false, session, chatReference };
                chatVersions.set(key, record);
            }
            const preserveConflict = async () => {
                record.recoveryFailed = true;
                try {
                    if (!shell().preserveChatSaveConflict || !recovery) throw new Error('Recovery storage is unavailable');
                    await shell().preserveChatSaveConflict({ avatar: character.avatar, chat: fileName }, recovery, isCurrent);
                    record.recoveryFailed = false;
                    toastr.error('This chat changed elsewhere. Local edits were saved in Chat History → Recovery drafts; restore them as a new chat or export them.', 'Chat save conflict', { timeOut: 0 });
                } catch (error) {
                    record.recoveryFailed = true;
                    console.error('Chat save conflict recovery failed', error);
                    toastr.error('Local edits could not be saved to a recovery draft. Keep this chat open and retry saving after storage is available.', 'Recovery storage error', { timeOut: 0 });
                }
            };
            const handleUnknownSaveOutcome = async () => {
                record.recoveryFailed = true;
                try {
                    const latest = isCurrent() ? shell().captureChatSaveRecovery?.() : recovery;
                    if (!latest || !shell().preserveChatSaveConflict) throw new Error('Recovery storage is unavailable');
                    await shell().preserveChatSaveConflict({ avatar: character.avatar, chat: fileName }, latest, isCurrent);
                    record.recoveryFailed = false;
                    toastr.error('The save result is unknown. Your current edits were saved in Chat History → Recovery drafts. Verify the draft there before refreshing.', 'Chat save outcome unknown', { timeOut: 0 });
                    return true;
                } catch (storageError) {
                    record.recoveryFailed = true;
                    console.error('Unknown chat save outcome recovery failed', storageError);
                    toastr.error('The save result is unknown and your recovery draft could not be saved. Do not refresh or leave this chat. Keep this page open; your edits remain here. Copy your work and retry after storage is available.', 'Recovery storage error', { timeOut: 0 });
                    return false;
                }
            };
            if (record?.conflicted && record.recoveryFailed && !explicitCreate && record.session === session && record.chatReference === chatReference) {
                await preserveConflict();
                return false;
            }
            if (!record || record.conflicted || record.session !== session || record.chatReference !== chatReference) {
                toastr.error('Chat version is unavailable or conflicted. Reload the chat before saving.', 'Chat could not be saved', { timeOut: 0 });
                return false;
            }
            if (record?.pending && record.recoveryFailed && !explicitCreate && !await handleUnknownSaveOutcome()) return false;
            const finishRequest = async request => {
                const result = await sendChatWrite(request);
                if (result.status === 409 || result.status === 428) {
                    record.pending = null;
                    record.conflicted = true;
                    if (!explicitCreate) {
                        await preserveConflict();
                    } else {
                        toastr.error('A chat with this name already exists. Choose another name.', 'Chat creation conflict', { timeOut: 0 });
                    }
                    return false;
                }
                if (!result.ok) {
                    if (result.status < 500) record.pending = null;
                    const data = await result.json().catch(() => ({}));
                    if (data?.error === 'integrity' && !force) {
                        const error = new Error('Chat integrity check failed');
                        error.integrity = true;
                        throw error;
                    }
                    const error = new Error(result.statusText || 'Chat save failed');
                    if (result.status >= 500) error.unknownChatWriteOutcome = true;
                    throw error;
                }
                const data = await result.json().catch(() => null);
                if (typeof data?.version !== 'string' || !data.version) {
                    const error = new Error('Chat save response is missing its version');
                    error.unknownChatWriteOutcome = true;
                    throw error;
                }
                record.version = data.version;
                record.pending = null;
                return true;
            };
            const finish = async request => {
                try {
                    return await finishRequest(request);
                } catch (error) {
                    if (error.integrity) {
                        if (explicitCreate) {
                            toastr.error('The chat could not be saved. Keep this page open and copy your work before leaving.', 'Chat integrity error', { timeOut: 0 });
                            return false;
                        }
                        const checkpoint = async () => {
                            record.recoveryFailed = true;
                            try {
                                const latest = isCurrent() ? shell().captureChatSaveRecovery?.() : recovery;
                                if (!latest || !shell().preserveChatSaveConflict) throw new Error('Recovery storage is unavailable');
                                await shell().preserveChatSaveConflict({ avatar: character.avatar, chat: fileName }, latest, isCurrent);
                                record.recoveryFailed = false;
                                return true;
                            } catch (storageError) {
                                console.error('Chat integrity recovery failed', storageError);
                                toastr.error('Your recovery draft could not be saved. Do not refresh or leave this chat. Keep this page open, copy your work, and retry after storage is available.', 'Recovery storage error', { timeOut: 0 });
                                return false;
                            }
                        };
                        if (!await checkpoint()) return false;
                        const answer = await Popup.show.input(
                            t`ERROR: Chat integrity check failed while saving the file.`,
                            t`<p>Your current edits were saved in Chat History → Recovery drafts. After you click OK, the page will reload.</p><p>To confirm an overwrite (and potentially <b>LOSE YOUR DATA</b>), enter <code>OVERWRITE</code> (in all caps) in the box below before clicking OK.</p>`,
                            '', { okButton: 'OK', cancelButton: false },
                        );
                        if (answer !== 'OVERWRITE') {
                            if (await checkpoint()) window.location.reload();
                            return false;
                        }
                        if (!isCurrent()) return false;
                        error.overwriteIntegrity = true;
                        throw error;
                    }
                    if (error.unknownChatWriteOutcome && !explicitCreate) {
                        await handleUnknownSaveOutcome();
                        return false;
                    }
                    throw error;
                }
            };
            if (record.pending) {
                if (!await finish(record.pending)) return false;
                if (!isCurrent() || chatVersions.get(key) !== record) return false;
            }
            if (explicitCreate && record.version) {
                toastr.error('A chat with this name already exists. Choose another name.', 'Chat creation conflict');
                return false;
            }
            const saveChatRequest = await compressRequest({
                method: 'POST',
                cache: 'no-cache',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    ch_name: character.name,
                    file_name: fileName,
                    chat: [chatHeader, ...trimmedChat],
                    avatar_url: character.avatar,
                    force: force,
                    ...(record.version ? { version: record.version } : { create: true }),
                    operationId: crypto.randomUUID(),
                }),
            });
            if (!isCurrent() || chatVersions.get(key) !== record) return false;
            record.pending = saveChatRequest;
            return await finish(saveChatRequest);
        });
    } catch (error) {
        if (error.overwriteIntegrity) {
            if (!isCurrent()) return false;
            return await saveChat({ chatName, withMetadata, mesId, force: true, chatData });
        }
        console.error(error);
        toastr.error('Chat could not be saved. Keep this page open and copy your work before leaving.', 'Chat could not be saved', { timeOut: 0 });
        return false;
    }
}

export async function selectChatGreeting({ index, characterId, chatId }) {
    if (
        String(state.this_chid) !== String(characterId)
        || getCurrentChatId() !== chatId
        || state.is_send_press
        || state.generationPending
        || state.this_edit_mes_id !== undefined
        || state.chat_metadata.tainted === true
    ) {
        return false;
    }
    const eligible = state.chat.length === 0
        ? state.chat_metadata.tainted !== true
        : canSwitchGreeting({
            characterId,
            chat: state.chat,
            metadata: state.chat_metadata,
            isGenerating: state.is_send_press,
            isChatSaving: state.isChatSaving,
            isEditing: state.this_edit_mes_id !== undefined,
        });
    if (!eligible || state.isChatSaving) return false;

    const character = state.characters[state.this_chid];
    const selected = buildGreetingOptions(character).find(option => option.index === index);
    if (!character || !selected) {
        return false;
    }

    const metadata = state.chat_metadata;
    const original = state.chat[0];
    const message = shell().getFirstMessage(selected.text);
    const nextChat = original
        ? replaceGreeting({ characterId, chat: state.chat, metadata, message }).chat
        : [message];
    const nextMetadata = { ...metadata, greeting: { index, text: selected.text } };

    cancelDebouncedChatSave();
    state.isChatSaving = true;
    try {
        const saved = await saveChat({ chatData: nextChat, withMetadata: nextMetadata });
        if (saved !== true || getCurrentChatId() !== chatId || String(state.this_chid) !== String(characterId)
            || state.chat_metadata !== metadata || state.chat[0] !== original || state.chat.length > 1
            || metadata.tainted || state.is_send_press) {
            return false;
        }

        state.chat.splice(0, state.chat.length, ...nextChat);
        state.chat_metadata = nextMetadata;
        state.reactMainChatProjectionCleared = false;
        state.isChatSaving = false;
        await eventSource.emit(event_types.CHARACTER_FIRST_MESSAGE_SELECTED, index);
        await eventSource.emit(event_types.MESSAGE_RECEIVED, 0, 'first_message');
        await mountReactMainChatMessageListPanel();
        await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, 0, 'first_message');
        return true;
    } finally {
        state.isChatSaving = false;
        await mountReactMainChatMessageListPanel();
    }
}


export async function getChat({ strictReload = false } = {}) {
    const character = state.characters[state.this_chid];
    const load = { avatar: character?.avatar, chat: character?.chat, session: chatSessionVersion, chatReference: state.chat };
    activeCharacterChatLoad = load;
    const isCurrent = () => {
        const current = state.characters[state.this_chid];
        return activeCharacterChatLoad === load && current?.avatar === load.avatar && current?.chat === load.chat && chatSessionVersion === load.session && state.chat === load.chatReference;
    };
    try {
        await unshallowCharacter(state.this_chid);
        if (!isCurrent()) return false;

        const key = chatSaveKey(load.avatar, load.chat);
        const hasUnresolvedWrite = () => {
            const record = chatVersions.get(key);
            return Boolean(record && record.session === load.session && record.chatReference === load.chatReference
                && (record.pending || record.conflicted));
        };
        if (chatWriteQueues.has(key)) await chatWriteQueues.get(key).catch(() => {});
        if (!isCurrent()) return false;
        if (hasUnresolvedWrite()) {
            toastr.error('This chat has an unresolved save. Preserve or retry your local edits before reloading.', 'Chat could not be reloaded');
            return false;
        }

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
        if (!isCurrent()) return false;
        if (hasUnresolvedWrite() || chatWriteQueues.has(key)) {
            toastr.error('This chat has an unresolved save. Preserve or retry your local edits before reloading.', 'Chat could not be reloaded');
            return false;
        }
        const version = response.headers.get('X-Chat-Version');
        if (!version && (Array.isArray(data) || !data || typeof data !== 'object' || Object.keys(data).length)) {
            throw new Error('Chat response is missing its version');
        }
        chatVersions.set(chatSaveKey(load.avatar, load.chat), { version: version || null, pending: null, conflicted: false, session: load.session, chatReference: load.chatReference });
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
        load.ready = true;
        failedCharacterChatLoad = undefined;
        queueMainChatMessageListScrollRestore(state.characters[state.this_chid].chat);
        await getChatResult({ switchMenu: !strictReload });
        if (!isCurrent()) return false;
        eventSource.emit(event_types.CHAT_LOADED, { detail: { id: state.this_chid, character: state.characters[state.this_chid] } });

        // Focus on the textarea if not already focused on a visible interactive
        // element — a button/control the user just activated (e.g. an opened
        // preview's close button) must not lose focus to this delayed refocus.
        const focusContext = getComposerSnapshot().contextKey;
        let focusContextChanged = false;
        const unsubscribeFocus = subscribeComposerState(() => {
            if (getComposerSnapshot().contextKey !== focusContext) focusContextChanged = true;
        });
        delay(debounce_timeout.short).then(() => {
            unsubscribeFocus();
            if (focusContextChanged) return;
            if ($(document.activeElement).is('input:visible, textarea:visible, select:visible, button:visible, a:visible, [contenteditable]:visible')) {
                return;
            }
            requestComposerFocus();
        });
        return true;
    } catch (error) {
        if (!isCurrent()) return false;
        if (!load.ready) failedCharacterChatLoad = load;
        if (strictReload) throw error;
        console.log(error);
        toastr.error(t`The chat could not be reloaded. Retry before closing.`);
        return false;
    } finally {
        if (activeCharacterChatLoad === load) activeCharacterChatLoad = undefined;
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
    if (await getChat() === false) return;
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


export async function fetchChatHistory(searchQuery) {
    const response = await fetch('/api/chats/search', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ query: searchQuery, avatar_url: state.characters[state.this_chid].avatar }),
    });
    if (!response.ok) throw new Error('Search failed');
    return response.json();
}

export async function loadChatHistory(searchQuery) {
    const filteredData = await fetchChatHistory(searchQuery);
    filteredData.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));
    return filteredData.map(chat => ({
        fileName: String(chat.file_name ?? ''),
        fileSize: String(chat.file_size ?? ''),
        messageCount: Number(chat.message_count) || 0,
        preview: String(chat.preview_message ?? ''),
        dateLabel: timestampToMoment(chat.last_mes).format('lll'),
    }));
}

export async function displayChats(searchQuery, currentChat, displayName, avatarImg, highlightNames) {
    return shell().displayHistoryCompat(searchQuery, String(currentChat ?? ''), String(avatarImg ?? ''), Array.isArray(highlightNames) ? highlightNames : []);
}


export async function saveChatConditional(shouldSave = () => true) {
    const key = currentChatSaveKey();
    if (chatVersions.get(key)?.deleting) return false;
    try {
        await waitUntilCondition(() => !state.isChatSaving, state.DEFAULT_SAVE_EDIT_TIMEOUT, 100);
    } catch {
        console.warn('Timeout waiting for chat to save');
        return false;
    }

    try {
        if (key !== currentChatSaveKey() || chatVersions.get(key)?.deleting || !shouldSave()) return false;
        cancelDebouncedChatSave();

        state.isChatSaving = true;

        if (!shouldSave()) return false;
        const saved = await saveChat();
        if (saved !== true) return false;

        // Save token cache to IndexedDB storage
        saveTokenCache();
        return true;
    } catch (error) {
        console.error('Error saving chat', error);
        return false;
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
    const character = state.characters[characterId];
    const activeCharacter = state.characters[state.this_chid];
    const activeName = activeCharacter?.chat;
    const chatReference = state.chat;
    const session = chatSessionVersion;
    const isTargetCurrent = () => state.characters[state.this_chid] === character && character?.chat === oldFileName;
    const wasCurrent = isTargetCurrent();

    const body = {
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
        const rename = async version => sendChatWrite({
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ ...body, version, operationId: crypto.randomUUID() }),
        }, '/api/chats/rename');
        const response = wasCurrent
            ? await withCurrentChatDeleteVersion({ avatar: body.avatar_url, chat: oldFileName }, rename, { suspendConditionalSaves: false })
            : await serializeChatWrite(chatSaveKey(body.avatar_url, oldFileName), async () => {
                if (isTargetCurrent()) throw new Error('Chat became current before rename');
                const read = await fetch('/api/chats/get', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify({ avatar_url: body.avatar_url, file_name: oldFileName, ch_name: character?.name }),
                });
                const version = read.headers.get('X-Chat-Version');
                if (!read.ok || !version || isTargetCurrent()) throw new Error('Chat version unavailable for rename');
                const record = chatVersions.get(chatSaveKey(body.avatar_url, oldFileName));
                if (record) record.conflicted = true;
                return rename(version);
            });

        if (!response.ok) {
            throw new Error('Unsuccessful request.');
        }

        const data = await response.json();

        if (data.error || !data.version) {
            throw new Error('Server returned an error.');
        }

        if (state.characters[state.this_chid] !== activeCharacter || activeCharacter?.chat !== activeName
            || state.chat !== chatReference || chatSessionVersion !== session) {
            // The server may have renamed the file; do not modify or reload a
            // different chat after the request completes.
            return true;
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
        return true;
    } catch {
        toastr.error(t`Chat was not renamed. Check the name and connection, then try again.`);
        return false;
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
