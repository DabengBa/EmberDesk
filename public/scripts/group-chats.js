// Compatibility facade for the retired multi-character chat product.
// Historical group files and canonical owner shapes are handled server-side;
// the browser must not create, open, edit, generate, or import group chats.

const retiredFilter = Object.freeze({
    applyFilters(items) { return Array.isArray(items) ? items : []; },
    clearFuzzySearchCaches() {},
    setFilterData() {},
});

export const groups = [];
export const selected_group = null;
export const openGroupId = null;
export const is_group_automode_enabled = false;
export const hideMutedSprites = false;
export const is_group_generating = false;
export const group_generation_id = null;
export const groupCandidatesFilter = retiredFilter;
export const groupMembersFilter = retiredFilter;
export const group_activation_strategy = Object.freeze({ NATURAL: 0, LIST: 1, MANUAL: 2, POOLED: 3 });
export const group_generation_mode = Object.freeze({ SWAP: 0, APPEND: 1, APPEND_DISABLED: 2 });
export const DEFAULT_AUTO_MODE_DELAY = 5;

const retiredOperation = () => {
    const error = new Error('Group chat functionality has been removed from EmberDesk.');
    error.code = 'group_chat_feature_removed';
    error.error = 'group_chat_feature_removed';
    error.status = 410;
    return Promise.reject(error);
};

export function setGroupAuthoringMembersDraft() { return retiredOperation(); }
export function saveGroupChat() { return retiredOperation(); }
export function generateGroupWrapper() { return retiredOperation(); }
export function deleteGroup() { return retiredOperation(); }
export function getGroupAvatar() { return null; }
export function getGroups() { return Promise.resolve([]); }
export function regenerateGroup() { return retiredOperation(); }
export function resetSelectedGroup() {}
export function select_group_chats() {}
export function getGroupChatNames() { return []; }
export function getGroupChat() { return retiredOperation(); }
export function getGroupMembers() { return []; }
export function getGroupNames() { return []; }
export function findGroupMemberId() { return undefined; }
export function getGroupDepthPrompts() { return []; }
export function getGroupCharacterCards() { return undefined; }
export function getGroupCharacterCardsLazy() { return null; }
export function renameGroupMember() { return retiredOperation(); }
export function createNewGroupChat() { return retiredOperation(); }
export function getGroupPastChats() { return Promise.resolve([]); }
export function openGroupChat() { return retiredOperation(); }
export function renameGroupChat() { return retiredOperation(); }
export function deleteGroupChatByName() { return retiredOperation(); }
export function deleteGroupChat() { return retiredOperation(); }
export function importGroupChat() { return retiredOperation(); }
export function saveGroupBookmarkChat() { return retiredOperation(); }
export function openGroupById() { return retiredOperation(); }
export function unshallowGroupMembers() { return retiredOperation(); }
