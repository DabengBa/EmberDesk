import toastr from './notifications.js';
import {
    characters,
    saveChat,
    this_chid,
    openCharacterChat,
    chat_metadata,
    chat,
    getCurrentChatDetails,
    setOptionsMenuBranchVisibility,
} from '../script.js';
import { getRequestHeaders } from './request-context.js';
import { getUniqueName } from './utils.js';
import { CHAT_MEMORY_METADATA_KEY, filterMemoryForBranch, getChatMemoryMetadata } from './chat-memory-core.js';

const branchNameToken = 'Checkpoint #';

/**
 * Gets the names of existing chats for the current character.
 * @returns {Promise<string[]>} - Returns a promise that resolves to an array of existing chat names.
 */
async function getExistingChatNames() {
    if (this_chid === undefined) {
        return [];
    }

    const character = characters[this_chid];
    if (!character) {
        return [];
    }

    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: character.avatar, simple: true }),
    });

    if (response.ok) {
        const data = await response.json();
        const chats = Object.values(data).map(x => x.file_name.replace('.jsonl', ''));
        return [...chats];
    }

    return [];
}

function getMainChatName() {
    if (chat_metadata) {
        if (chat_metadata.main_chat) {
            return chat_metadata.main_chat;
        } else if (characters[this_chid].chat && characters[this_chid].chat.includes(branchNameToken)) {
            const tokenIndex = characters[this_chid].chat.lastIndexOf(branchNameToken);
            chat_metadata.main_chat = characters[this_chid].chat.substring(0, tokenIndex).trim();
            return chat_metadata.main_chat;
        }
    }
    return null;
}

const branchButtonDisplays = new WeakMap();

/**
 * Toggles the "Back to parent chat" option based on whether the current chat is a branch.
 */
export function showBranchChatButtons() {
    let show = false;
    try {
        show = Boolean(chat_metadata.main_chat);
        // React projects the state; only update the DOM when it is unavailable.
        if (setOptionsMenuBranchVisibility(show)) {
            return;
        }
    } catch {
        show = false;
    }
    const button = document.getElementById('option_back_to_main');
    if (!button) return;
    if (!show) {
        if (button.style.display !== 'none') branchButtonDisplays.set(button, button.style.display);
        button.style.display = 'none';
        return;
    }
    if (button.style.display === 'none') button.style.display = branchButtonDisplays.get(button) ?? '';
    if (getComputedStyle(button).display === 'none') {
        const probe = document.createElement(button.tagName);
        document.body.appendChild(probe);
        button.style.display = getComputedStyle(probe).display === 'none' ? 'block' : getComputedStyle(probe).display;
        probe.remove();
    }
}

// Export is used by Timelines extension. Do not remove.
export async function createBranch(mesId) {
    if (!chat.length) {
        toastr.warning('The chat is empty.', 'Branch creation failed');
        return;
    }

    if (mesId < 0 || mesId >= chat.length) {
        toastr.warning('Invalid message ID.', 'Branch creation failed');
        return;
    }

    const sourceChat = chat;
    const sourceCharacter = characters[this_chid];
    const sourceName = sourceCharacter?.chat;
    const isCurrent = () => chat === sourceChat && characters[this_chid] === sourceCharacter && sourceCharacter?.chat === sourceName;
    const lastMes = chat[mesId];
    const mainChatName = (getCurrentChatDetails()).sessionName;
    const newMetadata = { main_chat: mainChatName };
    // Carry over only the memory entries whose covered messages survive into
    // the branch snapshot — orphaned summaries must not leak across chats.
    const branchMemory = filterMemoryForBranch(getChatMemoryMetadata(chat_metadata), chat, Number(mesId));
    if (branchMemory) {
        newMetadata[CHAT_MEMORY_METADATA_KEY] = branchMemory;
    }

    function buildBranchName(name, i) {
        // Strip off existing suffixes, then build new name
        let cleanName = name.replace(/ - Branch #\d+$/, '');
        // Strip off legacy old name prefix too
        cleanName = cleanName.replace(/^Branch #\d+ - /, '');
        return `${cleanName} - Branch #${i}`;
    }
    const existingChats = await getExistingChatNames();
    if (!isCurrent()) return;
    const name = getUniqueName(mainChatName, (x) => existingChats.includes(x), { nameBuilder: buildBranchName });
    if (!name) {
        console.error('Could not generate a unique branch name.');
        toastr.error('Could not generate a unique branch name.', 'Branch creation failed');
        return;
    }

    const branchChatSnapshot = structuredClone(chat.slice(0, Number(mesId) + 1));

    if (await saveChat({ chatName: name, withMetadata: newMetadata, mesId, chatData: branchChatSnapshot }) !== true || !isCurrent()) return;
    // append to branches list if it exists
    // otherwise create it
    if (typeof lastMes.extra !== 'object') {
        lastMes.extra = {};
    }
    if (typeof lastMes.extra.branches !== 'object') {
        lastMes.extra.branches = [];
    }
    lastMes.extra.branches.push(name);
    return name;
}

export async function backToMainChat() {
    const mainChatName = getMainChatName();
    const allChats = await getExistingChatNames();

    if (allChats.includes(mainChatName)) {
        await openCharacterChat(mainChatName);
        return mainChatName;
    }

    return null;
}

/**
 * Creates a new branch from the message with the given ID
 * @param {number} mesId Message ID
 * @returns {Promise<string?>} Branch file name
 */
export async function branchChat(mesId) {
    if (this_chid === undefined) {
        toastr.info('No character selected.', 'Create Branch');
        return null;
    }

    const fileName = await createBranch(mesId);
    if (!fileName) {
        return null;
    }

    await openCharacterChat(fileName);

    return fileName;
}

export function initBranchUI() {
    document.addEventListener('click', async event => {
        const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
        const button = target?.closest?.('.mes_create_branch');
        if (!button) return;
        const mesId = button.closest('.mes')?.getAttribute('mesid');
        if (mesId != null) {
            await branchChat(Number(mesId));
        }
    });
}
