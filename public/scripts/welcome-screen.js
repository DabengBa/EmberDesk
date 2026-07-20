import {
    addOneMessage,
    characters,
    chat,
    displayVersion,
    doNewChat,
    event_types,
    eventSource,
    getCharacters,
    getCurrentChatId,
    getRequestHeaders,
    getSystemMessageByType,
    getThumbnailUrl,
    is_send_press,
    neutralCharacterName,
    printCharactersDebounced,
    selectCharacterById,
    system_avatar,
    system_message_types,
    this_chid,
    unshallowCharacter,
} from '../script.js';
import { getRegexedString, regex_placement } from './extensions/regex/engine.js';
import { is_group_generating } from './group-chats.js';
import { t } from './i18n.js';
import { getMessageTimeStamp } from './RossAscends-mods.js';
import { renderTemplateAsync } from './templates.js';
import { accountStorage } from './util/AccountStorage.js';

const assistantAvatarKey = 'assistant';
const defaultAssistantAvatar = 'default_Assistant.png';
let skipNextChatChangedWelcomeScreen = false;

/**
 * Skips the next welcome-screen open attempt triggered by CHAT_CHANGED.
 * This lets delete-specific close flows keep chat-scoped cleanup listeners.
 */
export function suppressNextChatChangedWelcomeScreen() {
    skipNextChatChangedWelcomeScreen = true;
}

export function getPermanentAssistantAvatar() {
    const assistantAvatar = accountStorage.getItem(assistantAvatarKey);
    if (assistantAvatar === null) {
        return defaultAssistantAvatar;
    }

    const character = characters.find(x => x.avatar === assistantAvatar);
    if (character === undefined) {
        accountStorage.removeItem(assistantAvatarKey);
        return defaultAssistantAvatar;
    }

    return assistantAvatar;
}

/**
 * Opens a welcome screen if no chat is currently active.
 * @param {object} param Additional parameters
 * @param {boolean} [param.force] If true, forces clearing of the welcome screen.
 * @returns {Promise<void>}
 */
export async function openWelcomeScreen({ force = false } = {}) {
    if (skipNextChatChangedWelcomeScreen) {
        skipNextChatChangedWelcomeScreen = false;
        return;
    }

    const currentChatId = getCurrentChatId();
    if (currentChatId !== undefined || (chat.length > 0 && !force)) {
        return;
    }

    if (currentChatId === undefined && force) {
        console.debug('Forcing welcome screen open.');
        chat.splice(0, chat.length);
        $('#chat').empty();
    }

    await sendWelcomePanel();
    await unshallowPermanentAssistant();
    sendAssistantMessage();
    sendWelcomePrompt();
}

/**
 * Makes sure the assistant character has all data loaded.
 * @returns {Promise<void>}
 */
async function unshallowPermanentAssistant() {
    const assistantAvatar = getPermanentAssistantAvatar();
    const characterId = characters.findIndex(x => x.avatar === assistantAvatar);
    if (characterId === -1) {
        return;
    }

    await unshallowCharacter(String(characterId));
}

/**
 * Returns a greeting message for the assistant based on the character.
 * @param {Character} character Character data
 * @returns {string} Greeting message
*/
function getAssistantGreeting(character) {
    const defaultGreeting = t`If you're connected to an API, try asking me something!` + '\n***\n' + t`**Hint:** Set any character as your welcome page assistant from their "More..." menu.`;

    if (!character) {
        return defaultGreeting;
    }

    return getRegexedString(character.first_mes || '', regex_placement.AI_OUTPUT, { depth: 0 }) || defaultGreeting;
}

function sendAssistantMessage() {
    const currentAssistantAvatar = getPermanentAssistantAvatar();
    const character = characters.find(x => x.avatar === currentAssistantAvatar);
    const name = character ? character.name : neutralCharacterName;
    const avatar = character ? getThumbnailUrl('avatar', character.avatar) : system_avatar;
    const greeting = getAssistantGreeting(character);

    const message = {
        name: name,
        force_avatar: avatar,
        mes: greeting,
        is_system: false,
        is_user: false,
        send_date: getMessageTimeStamp(),
        extra: {
            type: system_message_types.ASSISTANT_MESSAGE,
            swipeable: false,
        },
    };

    chat.push(message);
    addOneMessage(message, { scroll: false });
}

function sendWelcomePrompt() {
    const message = getSystemMessageByType(system_message_types.WELCOME_PROMPT);
    chat.push(message);
    addOneMessage(message, { scroll: false });
}

/**
 * Sends the welcome panel to the chat.
 */
async function sendWelcomePanel() {
    try {
        const chatElement = document.getElementById('chat');
        if (!chatElement) {
            console.error('Chat element not found');
            return;
        }
        const templateData = {
            version: displayVersion,
        };
        const template = await renderTemplateAsync('welcomePanel', templateData);
        const fragment = document.createRange().createContextualFragment(template);
        chatElement.append(fragment.firstChild);
    } catch (error) {
        console.error('Welcome screen error:', error);
    }
}

export async function openPermanentAssistantChat({ tryCreate = true, created = false } = {}) {
    const avatar = getPermanentAssistantAvatar();
    const characterId = characters.findIndex(x => x.avatar === avatar);
    if (characterId === -1) {
        if (!tryCreate) {
            console.error(`Character not found for avatar ID: ${avatar}. Cannot create.`);
            return;
        }

        try {
            console.log(`Character not found for avatar ID: ${avatar}. Creating new assistant.`);
            await createPermanentAssistant();
            return openPermanentAssistantChat({ tryCreate: false, created: true });
        } catch (error) {
            console.error('Error creating permanent assistant:', error);
            toastr.error(t`Failed to create ${neutralCharacterName}. See console for details.`);
            return;
        }
    }

    try {
        await selectCharacterById(characterId);
        if (!created) {
            await doNewChat({ deleteCurrentChat: false });
        }
        console.log(`Opened permanent assistant chat for ${neutralCharacterName}.`, getCurrentChatId());
    } catch (error) {
        console.error('Error opening permanent assistant chat:', error);
        toastr.error(t`Failed to open permanent assistant chat. See console for details.`);
    }
}

async function createPermanentAssistant() {
    if (is_group_generating || is_send_press) {
        throw new Error(t`Cannot create while generating.`);
    }

    const formData = new FormData();
    formData.append('ch_name', neutralCharacterName);
    formData.append('file_name', defaultAssistantAvatar.replace('.png', ''));
    formData.append('creator_notes', t`Automatically created character. Feel free to edit.`);

    try {
        const avatarResponse = await fetch(system_avatar);
        const avatarBlob = await avatarResponse.blob();
        formData.append('avatar', avatarBlob, defaultAssistantAvatar);
    } catch (error) {
        console.warn('Error fetching system avatar. Fallback image will be used.', error);
    }

    const fetchResult = await fetch('/api/characters/create', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
        cache: 'no-cache',
    });

    if (!fetchResult.ok) {
        throw new Error(t`Creation request did not succeed.`);
    }

    await getCharacters();
}

export async function openPermanentAssistantCard() {
    const avatar = getPermanentAssistantAvatar();
    const characterId = characters.findIndex(x => x.avatar === avatar);
    if (characterId === -1) {
        toastr.info(t`Assistant not found. Try sending a chat message.`);
        return;
    }

    await selectCharacterById(characterId);
}

/**
 * Assigns a character as the assistant.
 * @param {string?} characterId Character ID
 */
export function assignCharacterAsAssistant(characterId) {
    if (characterId === undefined) {
        return;
    }
    /** @type {Character} */
    const character = characters[characterId];
    if (!character) {
        return;
    }

    const currentAssistantAvatar = getPermanentAssistantAvatar();
    if (currentAssistantAvatar === character.avatar) {
        if (character.avatar === defaultAssistantAvatar) {
            toastr.info(t`${character.name} is a system assistant. Choose another character.`);
            return;
        }

        toastr.info(t`${character.name} is no longer your assistant.`);
        accountStorage.removeItem(assistantAvatarKey);
        return;
    }

    accountStorage.setItem(assistantAvatarKey, character.avatar);
    printCharactersDebounced();
    toastr.success(t`Set ${character.name} as your assistant.`);
}

export function initWelcomeScreen() {
    const events = [event_types.CHAT_CHANGED, event_types.APP_READY];
    for (const event of events) {
        eventSource.makeFirst(event, openWelcomeScreen);
    }

    eventSource.on(event_types.CHARACTER_MANAGEMENT_DROPDOWN, (target) => {
        if (target !== 'set_as_assistant') {
            return;
        }
        assignCharacterAsAssistant(this_chid);
    });

    eventSource.on(event_types.CHARACTER_RENAMED, (oldAvatar, newAvatar) => {
        if (oldAvatar === getPermanentAssistantAvatar()) {
            accountStorage.setItem(assistantAvatarKey, newAvatar);
        }
    });
}
