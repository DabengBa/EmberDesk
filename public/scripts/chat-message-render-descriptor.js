import { MAIN_CHAT_RICH_BODY_RENDERER_REASONS } from './main-chat-bridge-contract.js';

/**
 * Builds pure render decisions for a stored, finalized chat message row.
 * DOM mutation, formatting, avatar resolution, and streaming updates stay with public/script.js.
 *
 * @param {object} message Chat message object
 * @param {object} options Options
 * @param {number} options.messageId Message index used as DOM identity
 * @param {string} [options.timestamp=''] Already formatted timestamp text
 * @returns {object} Descriptor for stable row identity and known message flags
 */
export function buildChatMessageRenderDescriptor(message, { messageId, timestamp = '' } = {}) {
    const extra = message?.extra ?? {};
    const isUser = Boolean(message?.is_user);
    const isSystem = Boolean(message?.is_system);
    const forcedAvatar = Boolean(message?.force_avatar);
    const bookmarkLink = extra.bookmark_link;
    const tokenCount = extra.token_count;

    const flags = {
        hasForcedAvatar: forcedAvatar,
        hasReasoning: hasMeaningfulValue(extra.reasoning),
        hasMedia: hasMeaningfulValue(extra.image)
            || hasMeaningfulValue(extra.image_url)
            || hasMeaningfulValue(extra.imageUrl)
            || hasMeaningfulValue(extra.images)
            || hasMeaningfulValue(extra.image_urls),
        hasAttachment: hasMeaningfulValue(extra.file) || hasMeaningfulValue(extra.files),
        hasDisplayText: typeof extra.display_text === 'string',
        hasBias: extra.bias !== undefined && extra.bias !== '',
        isEdited: Boolean(message?.edited ?? extra.edited ?? extra.is_edited),
        isError: hasMeaningfulValue(extra.error) || hasMeaningfulValue(message?.error),
        isStopped: Boolean(extra.stopped ?? extra.aborted ?? message?.stopped ?? message?.aborted),
        isSmallSys: extra.isSmallSys === true,
        hasToolInvocations: Array.isArray(extra.tool_invocations),
    };

    return {
        messageId,
        role: getMessageRole({ isUser, isSystem }),
        state: getMessageState(flags),
        attributes: {
            mesid: messageId,
            swipeid: message?.swipe_id ?? 0,
            ch_name: message?.name,
            is_user: isUser,
            is_system: isSystem,
            bookmark_link: bookmarkLink,
            force_avatar: forcedAvatar,
            timestamp,
            type: extra.type ?? '',
        },
        display: {
            name: message?.name,
            tokenCount,
            bookmarkLink,
            timestamp,
        },
        classes: {
            smallSysMes: flags.isSmallSys,
            toolCall: flags.hasToolInvocations,
        },
        flags,
    };
}

/**
 * Builds deterministic row metadata population decisions for a rendered message.
 * Message body HTML, formatter output, lifecycle events, and media rendering stay outside this helper.
 *
 * @param {object} descriptor Result from buildChatMessageRenderDescriptor
 * @param {object} options Population options
 * @param {string} options.avatarImg Resolved avatar image URL
 * @param {string} [options.messageTitle=''] Optional row title
 * @param {string} [options.timestampTitle=''] Timestamp hover title
 * @param {string} [options.timerValue=''] Generation timer text
 * @param {string} [options.timerTitle=''] Generation timer title
 * @returns {object} Stable row metadata population decisions
 */
export function buildChatMessageRowPopulation(descriptor, {
    avatarImg,
    messageTitle = '',
    timestampTitle = '',
    timerValue = '',
    timerTitle = '',
} = {}) {
    const tokenCount = descriptor.display.tokenCount;

    return {
        attributes: descriptor.attributes,
        avatarSrc: avatarImg,
        displayName: descriptor.display.name,
        timestampText: descriptor.display.timestamp,
        timestampTitle,
        messageIdText: `#${descriptor.messageId}`,
        tokenCountText: tokenCount ? `${tokenCount}t` : '',
        messageTitle,
        timer: {
            value: timerValue || '',
            title: timerTitle || '',
        },
        bookmarkLink: descriptor.display.bookmarkLink,
        classes: descriptor.classes,
    };
}

/**
 * Classifies the current renderer ownership contract for a message row.
 * Safe finalized rows may be React-owned while excluded rows stay on the legacy fallback.
 *
 * @param {object} options DOM-derived row safety facts
 * @param {'finalized'|'editing'|'streaming'|'unsafe'} [options.rowState='finalized'] Current row lifecycle state
 * @param {boolean} [options.hasMesText=false] Whether the row exposes the protected .mes_text body
 * @param {boolean} [options.hasProtectedReasoning=false] Whether protected reasoning wrappers are present
 * @param {boolean} [options.extensionMutated=false] Whether extension-owned mutation was detected
 * @returns {object} Current renderer ownership classification
 */
export function classifyChatMessageRendererContract({
    rowState = 'finalized',
    hasMesText = false,
    hasProtectedReasoning = false,
    extensionMutated = false,
} = {}) {
    if (!hasMesText) {
        return createRendererContract('unsupported-with-reason', MAIN_CHAT_RICH_BODY_RENDERER_REASONS.MISSING_MES_TEXT);
    }

    if (extensionMutated) {
        return createRendererContract('legacy-fallback-required', MAIN_CHAT_RICH_BODY_RENDERER_REASONS.EXTENSION_MUTATED_ROW);
    }

    if (rowState === 'editing') {
        return createRendererContract('legacy-fallback-required', MAIN_CHAT_RICH_BODY_RENDERER_REASONS.EDITING_ROW);
    }

    if (rowState === 'streaming') {
        return createRendererContract('legacy-fallback-required', MAIN_CHAT_RICH_BODY_RENDERER_REASONS.STREAMING_ROW);
    }

    if (rowState === 'unsafe') {
        return createRendererContract('unsupported-with-reason', MAIN_CHAT_RICH_BODY_RENDERER_REASONS.UNSAFE_ROW);
    }

    return {
        rendererOwner: 'react',
        phase7Candidate: 'react-rich-body-owner',
        fallback: 'legacy-rich-body-compatibility',
        reason: MAIN_CHAT_RICH_BODY_RENDERER_REASONS.SAFE_FINALIZED_ROW,
        protectedSurfaces: {
            mesText: true,
            reasoning: Boolean(hasProtectedReasoning),
        },
    };
}

/**
 * Describes the final owner policy for non-finalized or excluded row lifecycle families.
 * React keeps the message-list controller boundary while excluded families stay fail-closed on legacy facades.
 *
 * @param {object} options Presence flags for row lifecycle families
 * @param {boolean} [options.hasEditingRows=false] Whether editing rows are currently present
 * @param {boolean} [options.hasStreamingRows=false] Whether active streaming rows are currently present
 * @param {boolean} [options.hasUnsafeRows=false] Whether structurally unsafe rows are currently present
 * @param {boolean} [options.hasExtensionMutatedRows=false] Whether extension-mutated rows are currently present
 * @returns {object} Row lifecycle ownership policy
 */
export function buildMainChatRowLifecycleContract({
    hasEditingRows = false,
    hasStreamingRows = false,
    hasUnsafeRows = false,
    hasExtensionMutatedRows = false,
} = {}) {
    return {
        lifecycleOwner: 'react-message-list-controller',
        phase7Candidate: 'react-row-lifecycle-owner',
        fallback: 'legacy-row-lifecycle-facade',
        editingOwner: 'legacy',
        streamingOwner: 'legacy',
        unsafeOwner: 'legacy',
        extensionMutatedOwner: 'legacy',
        hasEditingRows: Boolean(hasEditingRows),
        hasStreamingRows: Boolean(hasStreamingRows),
        hasUnsafeRows: Boolean(hasUnsafeRows),
        hasExtensionMutatedRows: Boolean(hasExtensionMutatedRows),
        reason: 'fail-closed-row-lifecycle-policy',
    };
}

/**
 * Describes the current long-chat windowing contract without changing ownership.
 *
 * @param {object} options Windowing facts from the legacy chat DOM
 * @param {string[]} [options.renderedMessageIds=[]] Direct-child .mes ids currently rendered
 * @param {number} [options.totalMessageCount=0] Total chat message count
 * @param {boolean} [options.showMoreVisible=false] Whether #show_more_messages is available
 * @param {string|null} [options.anchorMessageId=null] Current reading anchor
 * @param {number} [options.scrollTop=0] Current scroll offset
 * @returns {object} Windowing ownership classification
 */
export function buildMainChatWindowingContract({
    renderedMessageIds = [],
    totalMessageCount = 0,
    showMoreVisible = false,
    anchorMessageId = null,
    scrollTop = 0,
} = {}) {
    const normalizedRenderedIds = Array.isArray(renderedMessageIds)
        ? renderedMessageIds.map(id => String(id))
        : [];
    const normalizedTotal = Number.isInteger(totalMessageCount) && totalMessageCount >= 0
        ? totalMessageCount
        : normalizedRenderedIds.length;
    const isLongChatWindow = Boolean(showMoreVisible) || normalizedTotal > normalizedRenderedIds.length;

    return {
        windowingOwner: 'react-message-list-controller',
        phase7Candidate: 'react-windowing-owner',
        fallback: isLongChatWindow ? 'legacy-show-more-messages-facade' : 'not-needed',
        loadMoreOwner: isLongChatWindow ? 'legacy' : 'not-needed',
        restoreOwner: 'react',
        renderedMessageIds: normalizedRenderedIds,
        totalMessageCount: normalizedTotal,
        showMoreVisible: Boolean(showMoreVisible),
        anchorMessageId: anchorMessageId === null || anchorMessageId === undefined ? null : String(anchorMessageId),
        scrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
        preservesDirectChildOrder: isStrictlyOrderedIds(normalizedRenderedIds),
        reason: isLongChatWindow ? 'long-chat-window' : 'full-chat-window',
    };
}

function createRendererContract(phase7Candidate, reason) {
    return {
        rendererOwner: 'legacy',
        phase7Candidate,
        fallback: 'legacy-messageFormatting',
        reason,
    };
}

function getMessageRole({ isUser, isSystem }) {
    if (isUser) {
        return 'user';
    }

    if (isSystem) {
        return 'system';
    }

    return 'character';
}

function isStrictlyOrderedIds(ids) {
    let previous = -1;
    for (const id of ids) {
        const next = Number(id);
        if (!Number.isInteger(next) || next <= previous) {
            return false;
        }
        previous = next;
    }
    return true;
}

function getMessageState(flags) {
    if (flags.isError) {
        return 'error';
    }

    if (flags.isStopped) {
        return 'stopped';
    }

    if (flags.isEdited) {
        return 'edited';
    }

    return 'complete';
}

function hasMeaningfulValue(value) {
    if (Array.isArray(value)) {
        return value.length > 0;
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).length > 0;
    }

    return value !== undefined && value !== null && value !== '';
}
