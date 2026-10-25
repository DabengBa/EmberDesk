import {
    buildChatMessageRenderDescriptor,
} from './chat-message-render-descriptor.js';
import {
    buildChatMessageRichBodyRender,
} from './chat-message-render-service.js';
import { getMessageUid } from './message-uid.js';

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
 * @param {string} [options.mediaDisplay]
 * @param {number} [options.mediaIndex]
 * @param {Function} [options.timerForMessage] Resolves { timerValue, timerTitle } for .mes_timer
 * @param {Function} [options.mediaDisplayForMessage] Resolves the media display attribute for the row
 * @param {Function} [options.hasItemizedPromptForMessage] Whether an itemized prompt exists for the message
 * @returns {object} Typed message record containing HTML strings only
 */
export function buildMainChatMessageRecord(message, {
    messageId,
    timestamp = '',
    formatMessage,
    avatarUrlForMessage = () => '',
    timestampTitleForMessage = () => '',
    messageUi = {},
    mediaDisplay,
    mediaIndex,
    timerForMessage = () => null,
    mediaDisplayForMessage = null,
    hasItemizedPromptForMessage = () => false,
    includeRender = true,
} = {}) {
    const numericMessageId = normalizeMessageId(messageId);
    const descriptor = buildChatMessageRenderDescriptor(message, {
        messageId: numericMessageId,
        timestamp,
    });
    const hasMedia = Array.isArray(message?.extra?.media) && message.extra.media.length > 0;
    const resolvedMediaDisplay = hasMedia
        ? normalizeString(mediaDisplayForMessage?.(message, numericMessageId) ?? mediaDisplay) || null
        : null;
    const render = includeRender
        ? buildChatMessageRichBodyRender(message, {
            messageId: numericMessageId,
            formatMessage,
            mediaDisplay: resolvedMediaDisplay ?? mediaDisplay,
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
    const timer = timerForMessage(message, numericMessageId) ?? {};
    const messageState = normalizeMessageState(message, descriptor, messageUi);
    const reasoningState = message?.extra?.reasoning
        ? (messageState === 'streaming' ? 'thinking' : 'done')
        : message?.extra?.reasoning_duration
            ? 'hidden'
            : null;

    return {
        id: String(numericMessageId),
        uid: getMessageUid(message),
        role: descriptor.role,
        name: normalizeString(message?.name),
        content,
        timestamp: normalizeString(timestamp),
        timestampTitle: normalizeString(timestampTitleForMessage(message, numericMessageId)),
        avatarUrl: normalizeString(avatarUrlForMessage(message, numericMessageId)),
        title: normalizeString(message?.title),
        tokenCount: typeof message?.extra?.token_count === 'number' ? message.extra.token_count : null,
        reasoningOpen,
        reasoningEditing,
        reasoningEditText,
        rootClassNames: [
            ...(descriptor.flags.hasReasoning || reasoningEditing ? ['reasoning'] : []),
            ...(message?.extra?.isSmallSys === true ? ['smallSysMes'] : []),
            ...(Array.isArray(message?.extra?.tool_invocations) ? ['toolCall'] : []),
            ...(descriptor.flags.isPipelineHidden ? ['replyPipelineHidden'] : []),
        ],
        state: messageState,
        timer: normalizeString(timer.timerValue),
        timerTitle: normalizeString(timer.timerTitle),
        promptButtonVisible: message?.is_user !== true
            && hasItemizedPromptForMessage(message, numericMessageId) === true,
        mediaDisplay: resolvedMediaDisplay,
        inlineMediaText: hasMedia && message?.extra?.inline_image === false,
        reasoningState,
        reasoningType: normalizeString(message?.extra?.reasoning_type) || null,
        recoveryStatus: normalizeString(messageUi.recoveryStatus).trim() || null,
        recoveryStage: messageUi.recoveryStage === 'fallback'
            ? 'fallback'
            : messageUi.recoveryStage === 'primary'
                ? 'primary'
                : null,
        failureNoticeVisible: messageUi.failureNoticeVisible === true,
        actionsExpanded: messageUi.actionsExpanded === true,
        editing: messageUi.editing === true
            || message?.extra?.editing === true
            || message?.editing === true,
        editText: normalizeString(messageUi.editText, content),
        lastInContext: messageUi.lastInContext === true,
        extraType: normalizeString(message?.extra?.type),
        pinned: message?.extra?.pinned === true,
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

let formatEpoch = 0;

/**
 * Previous projection keyed by message uid, used to reuse unchanged message
 * records between snapshot rebuilds. Reuse is only attempted when the chat
 * array reference, length, and format epoch are all unchanged — membership
 * changes (insert/delete/load-more) always recompute because message
 * formatting depends on depth, which shifts with chat membership.
 * @type {{chatId: string|null, chat: object[], epoch: number, entries: Map<string, object>}|null}
 */
let lastProjection = null;

/**
 * Invalidates the record-reuse cache. Callers bump this when display
 * semantics outside the message objects change (display settings, regex).
 */
export function invalidateMainChatRenderProjection() {
    formatEpoch += 1;
    lastProjection = null;
}

function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

/**
 * Content signature covering every display-relevant field of a stored
 * message, including in-place `extra`/`mes` mutations that reference
 * comparison cannot see. Returns null when the message cannot be serialized,
 * which safely disables reuse for that entry.
 * @param {object} message Stored chat message
 * @returns {string|null}
 */
function messageContentSignature(message) {
    try {
        return hashText(JSON.stringify(message ?? null));
    } catch {
        return null;
    }
}

function shallowUiEqual(left, right) {
    if (left === right) {
        return true;
    }
    const a = left && typeof left === 'object' ? left : {};
    const b = right && typeof right === 'object' ? right : {};
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every(key => a[key] === b[key]);
}

function tryReuseProjectedRecord({ entries, uid, index, sig, ui }) {
    const prev = entries.get(uid);
    if (!prev || prev.index !== index || prev.sig !== sig || sig === null) {
        return null;
    }
    return shallowUiEqual(prev.ui, ui) ? prev.record : null;
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
 * @param {Function} [options.timerForMessage]
 * @param {Function} [options.mediaDisplayForMessage]
 * @param {Function} [options.hasItemizedPromptForMessage]
 * @param {string[]} [options.visibleMessageIds]
 * @param {object} [options.composer]
 * @param {object} [options.generation]
 * @param {object} [options.streaming]
 * @param {object} [options.slash]
 * @param {object} [options.window]
 * @param {object} [options.window.scrollRestore] One-shot anchor restore owned by the React output lifecycle
 * @param {Record<string, object>} [options.messageUiById]
 * @param {object[]} [options.turnSummaries] Active turn-summary display cards (chat-memory projection)
 * @returns {object} Main-chat store snapshot input
 */
export function buildMainChatSnapshotFromLegacyChat({
    chat = [],
    chatId = null,
    formatMessage,
    avatarUrlForMessage = () => '',
    timestampTitleForMessage = () => '',
    timestampForMessage = () => '',
    timerForMessage,
    mediaDisplayForMessage,
    hasItemizedPromptForMessage,
    visibleMessageIds,
    composer = {},
    generation = {},
    streaming = {},
    slash = {},
    window = {},
    messageUiById = {},
    turnSummaries = [],
    greetings = {},
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

    const normalizedChatId = normalizeString(chatId).trim() || null;
    const canReuse = lastProjection !== null
        && lastProjection.chatId === normalizedChatId
        && lastProjection.chat === chat
        && lastProjection.length === chat.length
        && lastProjection.epoch === formatEpoch;
    const nextEntries = new Map();

    for (const id of visibleIds) {
        const messageId = Number(id);
        const message = chat[messageId];
        const uid = getMessageUid(message);
        const sig = canReuse ? messageContentSignature(message) : null;
        const ui = messageUiById[id];
        const reused = canReuse
            ? tryReuseProjectedRecord({ entries: lastProjection.entries, uid, index: messageId, sig, ui })
            : null;
        if (reused) {
            messagesById[id] = reused;
            nextEntries.set(uid, { index: messageId, sig, ui, record: reused });
            continue;
        }
        const timestamp = timestampForMessage(message, messageId);
        const record = buildMainChatMessageRecord(message, {
            messageId,
            timestamp: normalizeString(timestamp),
            formatMessage,
            avatarUrlForMessage,
            timestampTitleForMessage,
            messageUi: messageUiById[id],
            timerForMessage,
            mediaDisplayForMessage,
            hasItemizedPromptForMessage,
        });
        messagesById[id] = record;
        nextEntries.set(uid, { index: messageId, sig: sig ?? messageContentSignature(message), ui, record });
    }

    lastProjection = normalizedChatId !== null
        ? { chatId: normalizedChatId, chat, length: chat.length, epoch: formatEpoch, entries: nextEntries }
        : null;

    return {
        chatId: normalizedChatId,
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
        turnSummaries: Array.isArray(turnSummaries) ? turnSummaries : [],
        greetings,
    };
}
