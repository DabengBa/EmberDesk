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

function getMessageRole({ isUser, isSystem }) {
    if (isUser) {
        return 'user';
    }

    if (isSystem) {
        return 'system';
    }

    return 'character';
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
