import {
    characters,
    saveChat,
    syncSwipeToMes,
    this_chid,
    openCharacterChat,
    chat_metadata,
    chat,
    getCurrentChatDetails,
    setOptionsMenuBranchVisibility,
} from '../script.js';
import { getRequestHeaders } from './request-context.js';
import { getLastMessageId } from './macros.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { getUniqueName } from './utils.js';

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

/**
 * Toggles the "Back to parent chat" option based on whether the current chat is a branch.
 */
export function showBranchChatButtons() {
    try {
        const show = Boolean(chat_metadata.main_chat);
        // React projects the state; keep the jQuery write as a fallback for
        // environments where the React menu is not mounted.
        if (setOptionsMenuBranchVisibility(show)) {
            return;
        }
        if (show) {
            $('#option_back_to_main').show();
        } else {
            $('#option_back_to_main').hide();
        }
    } catch {
        $('#option_back_to_main').hide();
    }
}

/**
 * Builds the branch chat snapshot, optionally selecting a specific swipe for the target message.
 * @param {number} mesId
 * @param {{swipeId?: number|null}} [options={}]
 * @returns {ChatMessage[]|null}
 */
function getBranchChatSnapshot(mesId, { swipeId = null } = {}) {
    const snapshot = structuredClone(chat.slice(0, Number(mesId) + 1));

    if (swipeId === null) {
        return snapshot;
    }

    if (!syncSwipeToMes(null, swipeId, snapshot[mesId])) {
        return null;
    }

    return snapshot;
}

// Export is used by Timelines extension. Do not remove.
export async function createBranch(mesId, { swipeId = null } = {}) {
    if (!chat.length) {
        toastr.warning('The chat is empty.', 'Branch creation failed');
        return;
    }

    if (mesId < 0 || mesId >= chat.length) {
        toastr.warning('Invalid message ID.', 'Branch creation failed');
        return;
    }

    const lastMes = chat[mesId];
    const mainChatName = (getCurrentChatDetails()).sessionName;
    const newMetadata = { main_chat: mainChatName };
    const selectedSwipeId = swipeId === null ? null : Number(swipeId);

    if (selectedSwipeId !== null && (!Number.isInteger(selectedSwipeId) || selectedSwipeId < 0 || selectedSwipeId >= (lastMes?.swipes?.length ?? 0))) {
        toastr.warning('Invalid swipe ID.', 'Branch creation failed');
        return;
    }

    function buildBranchName(name, i) {
        // Strip off existing suffixes, then build new name
        let cleanName = name.replace(/ - Branch #\d+$/, '');
        // Strip off legacy old name prefix too
        cleanName = cleanName.replace(/^Branch #\d+ - /, '');
        return `${cleanName} - Branch #${i}`;
    }
    const existingChats = await getExistingChatNames();
    const name = getUniqueName(mainChatName, (x) => existingChats.includes(x), { nameBuilder: buildBranchName });
    if (!name) {
        console.error('Could not generate a unique branch name.');
        toastr.error('Could not generate a unique branch name.', 'Branch creation failed');
        return;
    }

    const branchChatSnapshot = getBranchChatSnapshot(mesId, { swipeId: selectedSwipeId });
    if (!branchChatSnapshot) {
        toastr.warning('Could not prepare the selected swipe for branching.', 'Branch creation failed');
        return;
    }

    await saveChat({ chatName: name, withMetadata: newMetadata, mesId, chatData: branchChatSnapshot });
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

async function backToMainChat() {
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
 * @param {{swipeId?: number|null}} [options={}] Branch options
 * @returns {Promise<string?>} Branch file name
 */
export async function branchChat(mesId, { swipeId = null } = {}) {
    if (this_chid === undefined) {
        toastr.info('No character selected.', 'Create Branch');
        return null;
    }

    const fileName = await createBranch(mesId, { swipeId });
    if (!fileName) {
        return null;
    }

    await openCharacterChat(fileName);

    return fileName;
}

function registerBranchSlashCommands() {
    /**
     * Validates a message ID. (Is a number, exists as a message)
     *
     * @param {number} mesId - The message ID to validate.
     * @param {string} context - The context of the slash command. Will be used as the title of any toasts.
     * @returns {boolean} - Returns true if the message ID is valid, otherwise false.
     */
    function validateMessageId(mesId, context) {
        if (isNaN(mesId)) {
            toastr.warning('Invalid message ID was provided', context);
            return false;
        }
        if (!chat[mesId]) {
            toastr.warning(`Message for id ${mesId} not found`, context);
            return false;
        }
        return true;
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'branch-create',
        returns: 'Name of the new branch',
        callback: async (args, text) => {
            const mesId = Number(args.mesId ?? text ?? getLastMessageId());
            if (!validateMessageId(mesId, 'Create Branch')) return '';

            const branchName = await branchChat(mesId);
            return branchName ?? '';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Message ID',
                typeList: [ARGUMENT_TYPE.NUMBER],
                enumProvider: commonEnumProviders.messages(),
            }),
        ],
        helpString: `
        <div>
            Create a new branch from the selected message. If no message id is provided, will use the last message.
        </div>
        <div>
            Creating a branch will automatically choose a name for the branch.<br />
            After creating the branch, the branch chat will be automatically opened.
        </div>`,
    }));
}

export function initBranchUI() {
    $('#option_back_to_main').on('click', backToMainChat);

    $(document).on('click', '.mes_create_branch', async function () {
        const mesId = $(this).closest('.mes').attr('mesid');
        if (mesId !== undefined) {
            await branchChat(Number(mesId));
        }
    });

    registerBranchSlashCommands();
}
