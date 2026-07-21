/**
 * Group definition CRUD has been retired.
 * Live write/read implementation is replaced by a stable JSON 410 tombstone.
 * @see ./group-chat-retirement.js
 */
export {
    router,
    createGroupChatRetirementRouter,
    groupChatRetirementHandler,
    sendGroupChatRetired,
    getGroupChatRetiredBody,
    GROUP_CHAT_RETIRED_ERROR,
    GROUP_CHAT_RETIRED_MESSAGE,
} from './group-chat-retirement.js';

/**
 * Historical group chat metadata migration is a no-op after group-chat retirement.
 * Existing on-disk group files are intentionally left untouched.
 * @param {import('../users.js').UserDirectoryList[]} _userDirectories
 */
export async function migrateGroupChatsMetadataFormat(_userDirectories) {
    return;
}
