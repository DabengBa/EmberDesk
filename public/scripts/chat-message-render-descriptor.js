import { MAIN_CHAT_RICH_BODY_RENDERER_REASONS } from './main-chat-bridge-contract.js';

/**
 * Builds pure render decisions for a stored, finalized chat message row.
 * Rich-body HTML is owned by chat-message-render-service.js (no DOM insertion).
 * Avatar resolution and row DOM application remain with callers (script.js / React).
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
 * React owns finalized, editing, streaming, and extension-mutated rows when structure is present.
 * Live content for non-finalized families is preserved rather than overwritten.
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

    if (rowState === 'unsafe') {
        return createRendererContract('unsupported-with-reason', MAIN_CHAT_RICH_BODY_RENDERER_REASONS.UNSAFE_ROW);
    }

    // Extension-mutated rows remain React-owned shells with preserved live body content.
    // Mutation-zone survival is enforced by not overwriting protected hosts (Task 3).
    if (extensionMutated) {
        return {
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'preserve-extension-mutation-zone',
            reason: MAIN_CHAT_RICH_BODY_RENDERER_REASONS.EXTENSION_MUTATED_ROW,
            protectedSurfaces: {
                mesText: true,
                reasoning: Boolean(hasProtectedReasoning),
            },
            preserveLiveContent: true,
        };
    }

    if (rowState === 'editing') {
        return {
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'preserve-editing-live-content',
            reason: MAIN_CHAT_RICH_BODY_RENDERER_REASONS.EDITING_ROW,
            protectedSurfaces: {
                mesText: true,
                reasoning: Boolean(hasProtectedReasoning),
            },
            preserveLiveContent: true,
        };
    }

    if (rowState === 'streaming') {
        return {
            rendererOwner: 'react',
            phase7Candidate: 'react-rich-body-owner',
            fallback: 'preserve-streaming-live-content',
            reason: MAIN_CHAT_RICH_BODY_RENDERER_REASONS.STREAMING_ROW,
            protectedSurfaces: {
                mesText: true,
                reasoning: Boolean(hasProtectedReasoning),
            },
            preserveLiveContent: true,
        };
    }

    return {
        rendererOwner: 'react',
        phase7Candidate: 'react-rich-body-owner',
        fallback: 'not-needed',
        reason: MAIN_CHAT_RICH_BODY_RENDERER_REASONS.SAFE_FINALIZED_ROW,
        protectedSurfaces: {
            mesText: true,
            reasoning: Boolean(hasProtectedReasoning),
        },
        preserveLiveContent: false,
    };
}

/**
 * Describes the final owner policy for all main-chat row lifecycle families.
 * React is the sole row lifecycle owner; only structurally unsafe rows remain unsupported.
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
        fallback: hasUnsafeRows ? 'unsupported-unsafe-row-structure' : 'not-needed',
        editingOwner: 'react',
        streamingOwner: 'react',
        unsafeOwner: hasUnsafeRows ? 'unsupported' : 'not-needed',
        extensionMutatedOwner: 'react',
        hasEditingRows: Boolean(hasEditingRows),
        hasStreamingRows: Boolean(hasStreamingRows),
        hasUnsafeRows: Boolean(hasUnsafeRows),
        hasExtensionMutatedRows: Boolean(hasExtensionMutatedRows),
        reason: 'react-row-lifecycle-sole-owner',
    };
}

/**
 * Describes the long-chat windowing contract with React as sole owner.
 *
 * @param {object} options Windowing facts from the chat DOM / bridge
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
        fallback: 'not-needed',
        loadMoreOwner: isLongChatWindow ? 'react' : 'not-needed',
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
        // Structurally unsupported rows stay unowned rather than restoring a
        // product dual-path legacy renderer. React remains the sole list owner.
        rendererOwner: 'unsupported',
        phase7Candidate,
        fallback: 'unsupported-row-structure',
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
