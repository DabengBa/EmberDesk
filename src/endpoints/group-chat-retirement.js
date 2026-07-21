import express from 'express';

export const GROUP_CHAT_RETIRED_ERROR = 'group_chat_feature_removed';
export const GROUP_CHAT_RETIRED_MESSAGE = 'Group chat functionality has been removed from EmberDesk.';

/**
 * Stable JSON body for retired group-chat endpoints.
 * @returns {{error: string, message: string}}
 */
export function getGroupChatRetiredBody() {
    return {
        error: GROUP_CHAT_RETIRED_ERROR,
        message: GROUP_CHAT_RETIRED_MESSAGE,
    };
}

/**
 * Respond with HTTP 410 for removed group-chat functionality.
 * @param {import('express').Response} response
 */
export function sendGroupChatRetired(response) {
    return response.status(410).json(getGroupChatRetiredBody());
}

/**
 * Express middleware that always returns the group-chat retirement payload.
 * @param {import('express').Request} _request
 * @param {import('express').Response} response
 */
export function groupChatRetirementHandler(_request, response) {
    return sendGroupChatRetired(response);
}

/**
 * Build a router that rejects every method/path with 410 JSON.
 * @returns {import('express').Router}
 */
export function createGroupChatRetirementRouter() {
    const router = express.Router();
    router.use(groupChatRetirementHandler);
    return router;
}

export const router = createGroupChatRetirementRouter();
