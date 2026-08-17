import {
    buildChatMessageRenderDescriptor,
} from './chat-message-render-descriptor.js';
import {
    buildChatMessageRichBodyRender,
} from './chat-message-render-service.js';

function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function normalizeMessageState(message, descriptor, messageUi = {}) {
    if (descriptor?.flags?.isError) {
        return 'error';
    }
    if (messageUi?.editing === true) {
        return 'editing';
    }
    if (message?.extra?.streaming === true || message?.streaming === true) {
        return 'streaming';
    }
    if (message?.extra?.editing === true || message?.editing === true) {
        return 'editing';
    }
    return 'finalized';
}

function normalizeMessageId(messageId) {
    const numericId = Number(messageId);
    if (!Number.isInteger(numericId) || numericId < 0) {
        throw new TypeError('Main chat message projection requires a non-negative integer messageId');
    }
    return numericId;
}

function getProjectedOverswipeBehavior(messageId, message, { pristineChat = false } = {}) {
    const explicitBehavior = message?.extra?.overswipe_behavior;
    if (typeof explicitBehavior === 'string') {
        return explicitBehavior;
    }
    if (message?.extra?.swipeable === false || message?.extra?.isSmallSys) {
        return 'none';
    }
    if (messageId === 0 && pristineChat) {
        return 'pristine_greeting';
    }
    if (!message?.is_user && !message?.is_system) {
        return 'regenerate';
    }
    return 'loop';
}

function getProjectedSwipeState(message, {
    messageId,
    chatLength = 0,
    pristineChat = false,
} = {}) {
    const swipeCount = Array.isArray(message?.swipes) ? message.swipes.length : 0;
    const swipeIndex = Number.isInteger(message?.swipe_id) && message.swipe_id >= 0
        ? message.swipe_id
        : 0;
    const isMessageSwipeable = messageId === chatLength - 1
        && !message?.is_user
        && message?.extra?.isSmallSys !== true
        && message?.extra?.swipeable !== false;
    if (!isMessageSwipeable) {
        return {
            swipeIndex,
            swipeCount,
            swipesVisible: false,
            lastSwipe: false,
        };
    }

    const overswipeBehavior = getProjectedOverswipeBehavior(messageId, message, { pristineChat });
    const pristineGreeting = overswipeBehavior === 'pristine_greeting';
    const isLastSwipe = Math.max(swipeCount, 1) - 1 <= swipeIndex;
    const lastSwipe = isLastSwipe
        && (overswipeBehavior === 'regenerate' || overswipeBehavior === 'edit_generate');

    return {
        swipeIndex,
        swipeCount,
        swipesVisible: swipeCount > 1 || pristineGreeting,
        lastSwipe,
    };
}

/**
 * Project one stored chat record into the DOM-free browser message model.
 *
 * @param {object} message Stored chat message
 * @param {object} options Projection options
 * @param {number} options.messageId Stable message identity
 * @param {string} [options.timestamp=''] Already formatted timestamp
 * @param {Function} options.formatMessage Existing message formatter
 * @param {Function} [options.avatarUrlForMessage] Resolves a display avatar without reading DOM
 * @param {Function} [options.timestampTitleForMessage] Resolves the timestamp tooltip
 * @param {object} [options.messageUi] Transient message controls owned by the projection caller
 * @param {number} [options.chatLength] Total chat length used for swipe ownership
 * @param {boolean} [options.pristineChat] Whether this is an untainted chat
 * @param {string} [options.mediaDisplay]
 * @param {number} [options.mediaIndex]
 * @returns {object} Typed message record containing HTML strings only
 */
export function buildMainChatMessageRecord(message, {
    messageId,
    timestamp = '',
    formatMessage,
    avatarUrlForMessage = () => '',
    timestampTitleForMessage = () => '',
    messageUi = {},
    chatLength = 0,
    pristineChat = false,
    mediaDisplay,
    mediaIndex,
    includeRender = true,
} = {}) {
    const numericMessageId = normalizeMessageId(messageId);
    const descriptor = buildChatMessageRenderDescriptor(message, {
        messageId: numericMessageId,
        timestamp,
    });
    const render = includeRender
        ? buildChatMessageRichBodyRender(message, {
            messageId: numericMessageId,
            formatMessage,
            mediaDisplay,
            mediaIndex,
        })
        : null;
    const content = typeof message?.extra?.display_text === 'string'
        ? message.extra.display_text
        : normalizeString(message?.mes);
    const reasoningOpen = typeof messageUi.reasoningOpen === 'boolean'
        ? messageUi.reasoningOpen
        : message?.extra?.reasoning_open === true;
    const reasoningEditing = messageUi.reasoningEditing === true;
    const reasoningEditText = normalizeString(
        messageUi.reasoningEditText,
        normalizeString(message?.extra?.reasoning),
    );
    const swipeState = getProjectedSwipeState(message, {
        messageId: numericMessageId,
        chatLength,
        pristineChat,
    });

    return {
        id: String(numericMessageId),
        role: descriptor.role,
        name: normalizeString(message?.name),
        content,
        timestamp: normalizeString(timestamp),
        timestampTitle: normalizeString(timestampTitleForMessage(message, numericMessageId)),
        avatarUrl: normalizeString(avatarUrlForMessage(message, numericMessageId)),
        title: normalizeString(message?.title),
        tokenCount: typeof message?.extra?.token_count === 'number' ? message.extra.token_count : null,
        bookmarkLink: normalizeString(message?.extra?.bookmark_link),
        reasoningOpen,
        reasoningEditing,
        reasoningEditText,
        rootClassNames: [
            ...(descriptor.flags.hasReasoning || reasoningEditing ? ['reasoning'] : []),
            ...(message?.extra?.isSmallSys === true ? ['smallSysMes'] : []),
            ...(Array.isArray(message?.extra?.tool_invocations) ? ['toolCall'] : []),
        ],
        state: normalizeMessageState(message, descriptor, messageUi),
        recoveryStatus: normalizeString(messageUi.recoveryStatus).trim() || null,
        recoveryStage: messageUi.recoveryStage === 'fallback'
            ? 'fallback'
            : messageUi.recoveryStage === 'primary'
                ? 'primary'
                : null,
        failureNoticeVisible: messageUi.failureNoticeVisible === true,
        failureRetryVisible: messageUi.failureRetryVisible === true,
        emptyReplyRegenerateVisible: messageUi.emptyReplyRegenerateVisible === true,
        actionsExpanded: messageUi.actionsExpanded === true,
        editing: messageUi.editing === true
            || message?.extra?.editing === true
            || message?.editing === true,
        editText: normalizeString(messageUi.editText, content),
        lastInContext: messageUi.lastInContext === true,
        swipeCounterHidden: messageUi.swipeCounterHidden === true,
        swipeIndex: swipeState.swipeIndex,
        swipeCount: swipeState.swipeCount,
        swipesVisible: swipeState.swipesVisible,
        lastSwipe: swipeState.lastSwipe,
        ...(render ? {
            render: {
                messageHtml: render.messageHtml,
                reasoningHtml: render.reasoningHtml,
                mediaHtml: render.mediaHtml,
                fileHtml: render.fileHtml,
                biasHtml: render.biasHtml,
            },
        } : {}),
    };
}

function normalizeMessageIds(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set();
    return value
        .map(item => normalizeString(item).trim())
        .filter(id => {
            if (!id || seen.has(id)) {
                return false;
            }
            seen.add(id);
            return true;
        });
}

/**
 * Project the in-memory chat array into the main-chat store snapshot shape.
 * The caller supplies UI control snapshots because this module deliberately
 * has no knowledge of DOM controls or legacy runtime globals.
 *
 * @param {object} options Projection options
 * @param {string|null} [options.chatId]
 * @param {object[]} [options.chat]
 * @param {Function} options.formatMessage
 * @param {Function} [options.avatarUrlForMessage]
 * @param {Function} [options.timestampTitleForMessage]
 * @param {Function} [options.timestampForMessage]
 * @param {string[]} [options.visibleMessageIds]
 * @param {object} [options.composer]
 * @param {object} [options.generation]
 * @param {object} [options.streaming]
 * @param {object} [options.slash]
 * @param {object} [options.window]
 * @param {object} [options.window.scrollRestore] One-shot anchor restore owned by the React output lifecycle
 * @param {Record<string, object>} [options.messageUiById]
 * @param {boolean} [options.pristineChat]
 * @returns {object} Main-chat store snapshot input
 */
export function buildMainChatSnapshotFromLegacyChat({
    chat = [],
    chatId = null,
    formatMessage,
    avatarUrlForMessage = () => '',
    timestampTitleForMessage = () => '',
    timestampForMessage = () => '',
    visibleMessageIds,
    composer = {},
    generation = {},
    streaming = {},
    slash = {},
    window = {},
    messageUiById = {},
    pristineChat = false,
} = {}) {
    if (!Array.isArray(chat)) {
        throw new TypeError('Main chat snapshot projection requires a chat array');
    }

    const messagesById = {};
    const orderedMessageIds = [];
    const requestedVisibleMessageIds = Array.isArray(window.visibleMessageIds)
        ? normalizeMessageIds(window.visibleMessageIds)
        : Array.isArray(visibleMessageIds)
            ? normalizeMessageIds(visibleMessageIds)
            : null;

    chat.forEach((_message, messageId) => {
        orderedMessageIds.push(String(messageId));
    });

    const knownMessageIdSet = new Set(orderedMessageIds);
    const visibleIds = (requestedVisibleMessageIds ?? orderedMessageIds)
        .filter(id => knownMessageIdSet.has(id));

    for (const id of visibleIds) {
        const messageId = Number(id);
        const message = chat[messageId];
        const timestamp = timestampForMessage(message, messageId);
        messagesById[id] = buildMainChatMessageRecord(message, {
            messageId,
            timestamp: normalizeString(timestamp),
            formatMessage,
            avatarUrlForMessage,
            timestampTitleForMessage,
            messageUi: messageUiById[id],
            chatLength: chat.length,
            pristineChat,
        });
    }

    return {
        chatId: normalizeString(chatId).trim() || null,
        messagesById,
        orderedMessageIds,
        composer: {
            value: normalizeString(composer.value),
            activeContext: composer.activeContext,
            focused: composer.focused === true,
            disabled: composer.disabled === true,
        },
        generation: {
            phase: generation.phase,
            activeMessageId: generation.activeMessageId ?? null,
        },
        streaming: {
            phase: streaming.phase,
            activeMessageId: streaming.activeMessageId ?? null,
            observedTokenCount: streaming.observedTokenCount ?? 0,
        },
        slash: {
            active: slash.active === true,
            query: normalizeString(slash.query),
            autocompleteVisible: slash.autocompleteVisible === true,
            replaceable: slash.replaceable === true,
            detailsVisible: slash.detailsVisible === true,
            detailsHtml: normalizeString(slash.detailsHtml),
            options: Array.isArray(slash.options)
                ? slash.options.map(option => ({
                    name: normalizeString(option?.name),
                    type: normalizeString(option?.type),
                    typeIcon: normalizeString(option?.typeIcon),
                    selectable: option?.selectable !== false,
                    selected: option?.selected === true,
                }))
                : [],
            executing: slash.executing === true,
            paused: slash.paused === true,
            aborted: slash.aborted === true,
            errorLabel: normalizeString(slash.errorLabel).trim() || null,
        },
        window: {
            visibleMessageIds: visibleIds,
            anchorMessageId: normalizeString(window.anchorMessageId).trim() || null,
            showMoreVisible: window.showMoreVisible === true,
            scrollTop: window.scrollTop ?? 0,
            scrollHeight: window.scrollHeight ?? 0,
            clientHeight: window.clientHeight ?? 0,
            scrollRestore: window.scrollRestore ?? null,
        },
    };
}
