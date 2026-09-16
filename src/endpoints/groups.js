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
