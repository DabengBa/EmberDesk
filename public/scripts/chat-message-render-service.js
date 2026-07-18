/**
 * Framework-neutral Main Chat rich-body render service.
 *
 * Produces message/reasoning/media/file/bias HTML strings from message data.
 * Does not insert into the document, touch jQuery, or own React row lifecycle.
 * Markdown/regex/sanitization remain delegated through the injected formatMessage
 * function so the existing formatting contract is not forked.
 */

import { MEDIA_DISPLAY, MEDIA_TYPE } from './constants.js';
import {
    buildChatMessageRenderDescriptor,
} from './chat-message-render-descriptor.js';

export const RENDER_SERVICE_OWNER = 'render-service';

/**
 * Builds pure rich-body HTML for a chat message row.
 *
 * @param {object} message Chat message object
 * @param {object} options Render options
 * @param {number} options.messageId Message index used as identity for formatting depth
 * @param {Function} options.formatMessage Formatting function with messageFormatting signature
 * @param {string} [options.mediaDisplay] Preferred media display mode
 * @param {number} [options.mediaIndex] Preferred gallery media index
 * @returns {object} Rich-body render result (HTML strings only; insertsDom is always false)
 */
export function buildChatMessageRichBodyRender(message, {
    messageId,
    formatMessage,
    mediaDisplay,
    mediaIndex,
} = {}) {
    if (typeof formatMessage !== 'function') {
        throw new TypeError('buildChatMessageRichBodyRender requires formatMessage');
    }

    const mes = message ?? {};
    const extra = mes.extra ?? {};
    const descriptor = buildChatMessageRenderDescriptor(mes, { messageId });
    const resolvedMediaDisplay = resolveMediaDisplay(mes, mediaDisplay);
    const resolvedMediaIndex = resolveMediaIndex(mes, mediaIndex);
    const mediaAttachments = getMediaAttachments(mes);
    const fileAttachments = getFileAttachments(mes);
    const hasMedia = mediaAttachments.length > 0;
    const hasFiles = fileAttachments.length > 0;
    const hideMessageText = hasMedia && extra.inline_image === false;

    const sanitizerOverrides = extra.uses_system_ui
        ? { MESSAGE_ALLOW_SYSTEM_UI: true }
        : {};

    const sourceText = typeof extra.display_text === 'string'
        ? extra.display_text
        : (mes.mes ?? '');

    const messageHtml = formatMessage(
        sourceText,
        mes.name,
        Boolean(mes.is_system),
        Boolean(mes.is_user),
        messageId,
        sanitizerOverrides,
        false,
    );

    const reasoningSource = typeof extra.reasoning_display_text === 'string'
        ? extra.reasoning_display_text
        : (extra.reasoning ?? '');
    const reasoningHtml = reasoningSource
        ? formatMessage(reasoningSource, '', false, false, messageId, {}, true)
        : '';

    const biasSource = extra.bias;
    const biasHtml = biasSource !== undefined && biasSource !== ''
        ? formatMessage(biasSource, '', false, false, -1, {}, false)
        : '';

    const mediaHtml = hasMedia
        ? buildMediaHtml(mediaAttachments, {
            mediaDisplay: resolvedMediaDisplay,
            mediaIndex: resolvedMediaIndex,
            fallbackTitle: extra.title ?? '',
        })
        : '';

    const fileHtml = hasFiles
        ? buildFileHtml(fileAttachments)
        : '';

    return {
        owner: RENDER_SERVICE_OWNER,
        insertsDom: false,
        messageId,
        role: descriptor.role,
        state: descriptor.state,
        messageHtml,
        reasoningHtml,
        mediaHtml,
        fileHtml,
        biasHtml,
        mediaDisplay: resolvedMediaDisplay,
        mediaIndex: resolvedMediaIndex,
        flags: {
            hasReasoning: Boolean(reasoningHtml),
            hasBias: Boolean(biasHtml),
            hasMedia,
            hasAttachment: hasFiles,
            hideMessageText,
            usesSystemUi: Boolean(extra.uses_system_ui),
        },
        descriptor,
    };
}

/**
 * Resolve media display mode with the same defaults as the legacy path.
 * @param {object} message
 * @param {string} [override]
 * @returns {string}
 */
export function resolveMediaDisplay(message, override) {
    const value = override
        || message?.extra?.media_display
        || MEDIA_DISPLAY.LIST;
    return Object.values(MEDIA_DISPLAY).includes(value) ? value : MEDIA_DISPLAY.LIST;
}

/**
 * Resolve gallery media index with the same defaults as the legacy path.
 * @param {object} message
 * @param {number} [override]
 * @returns {number}
 */
export function resolveMediaIndex(message, override) {
    if (Number.isInteger(override) && override >= 0) {
        return override;
    }
    const value = Number(message?.extra?.media_index ?? 0);
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * @param {object} message
 * @returns {Array<object>}
 */
function getMediaAttachments(message) {
    const media = message?.extra?.media;
    if (Array.isArray(media) && media.length > 0) {
        return media;
    }

    const attachments = [];
    if (message?.extra?.image) {
        attachments.push({
            type: MEDIA_TYPE.IMAGE,
            url: message.extra.image,
            title: message.extra.title ?? '',
        });
    }
    if (message?.extra?.image_url || message?.extra?.imageUrl) {
        attachments.push({
            type: MEDIA_TYPE.IMAGE,
            url: message.extra.image_url || message.extra.imageUrl,
            title: message.extra.title ?? '',
        });
    }
    if (Array.isArray(message?.extra?.images)) {
        for (const url of message.extra.images) {
            attachments.push({ type: MEDIA_TYPE.IMAGE, url, title: message.extra.title ?? '' });
        }
    }
    if (Array.isArray(message?.extra?.image_urls)) {
        for (const url of message.extra.image_urls) {
            attachments.push({ type: MEDIA_TYPE.IMAGE, url, title: message.extra.title ?? '' });
        }
    }
    if (message?.extra?.video) {
        attachments.push({
            type: MEDIA_TYPE.VIDEO,
            url: message.extra.video,
            title: message.extra.title ?? '',
        });
    }
    return attachments;
}

/**
 * @param {object} message
 * @returns {Array<object>}
 */
function getFileAttachments(message) {
    if (Array.isArray(message?.extra?.files) && message.extra.files.length > 0) {
        return message.extra.files;
    }
    if (message?.extra?.file && typeof message.extra.file === 'object') {
        return [message.extra.file];
    }
    return [];
}

/**
 * @param {Array<object>} attachments
 * @param {object} options
 * @returns {string}
 */
function buildMediaHtml(attachments, { mediaDisplay, mediaIndex, fallbackTitle }) {
    if (mediaDisplay === MEDIA_DISPLAY.GALLERY) {
        const index = Math.min(Math.max(mediaIndex, 0), attachments.length - 1);
        const selected = attachments[index];
        const block = buildMediaAttachmentHtml(selected, index, fallbackTitle);
        const controls = [
            '<div class="mes_img_swipes">',
            '<div title="Swipe left" class="right_menu_button fa-lg fa-solid fa-chevron-left mes_img_swipe_left" role="button" aria-label="Swipe left" tabindex="0"></div>',
            `<div class="mes_img_swipe_counter">${index + 1}/${attachments.length}</div>`,
            '<div title="Swipe right" class="right_menu_button fa-lg fa-solid fa-chevron-right mes_img_swipe_right" role="button" aria-label="Swipe right" tabindex="0"></div>',
            '</div>',
        ].join('');
        return injectGalleryControls(block, controls);
    }

    return attachments
        .map((attachment, index) => buildMediaAttachmentHtml(attachment, index, fallbackTitle))
        .join('');
}

/**
 * @param {object} attachment
 * @param {number} index
 * @param {string} fallbackTitle
 * @returns {string}
 */
function buildMediaAttachmentHtml(attachment, index, fallbackTitle) {
    const type = attachment?.type || MEDIA_TYPE.IMAGE;
    const url = escapeHtmlAttr(attachment?.url ?? '');
    const title = escapeHtmlAttr(attachment?.title || fallbackTitle || '');

    switch (type) {
        case MEDIA_TYPE.VIDEO:
            return [
                `<div class="mes_media_container mes_video_container" data-index="${index}">`,
                '<div class="mes_video_controls">',
                '<div title="Expand and zoom" class="right_menu_button fa-lg fa-solid fa-magnifying-glass mes_media_enlarge"></div>',
                '<div title="Caption" class="right_menu_button fa-lg fa-solid fa-envelope-open-text mes_img_caption"></div>',
                '<div title="Delete" class="right_menu_button fa-lg fa-solid fa-trash-can mes_media_delete"></div>',
                '</div>',
                `<video class="mes_video" controls preload="metadata" src="${url}" title="${title}"></video>`,
                '</div>',
            ].join('');
        case MEDIA_TYPE.AUDIO:
            return [
                `<div class="mes_media_container mes_audio_container audio-player" data-index="${index}">`,
                `<audio class="mes_audio" preload="auto" hidden src="${url}" title="${title}"></audio>`,
                '<div class="audio-player-header">',
                '<div class="audio-player-title">Audio</div>',
                '<div class="right_menu_button mes_media_delete fa-fw fa-solid fa-trash-can" title="Delete"></div>',
                '</div>',
                '<div class="audio-player-controls">',
                '<button class="audio-player-play-pause right_menu_button fa-fw fa-solid fa-play" title="Play"></button>',
                '<div class="audio-player-time">',
                '<span class="audio-player-current-time">0:00</span>',
                '<span class="audio-player-time-separator">/</span>',
                '<span class="audio-player-total-time">0:00</span>',
                '</div>',
                '<div class="audio-player-progress"><div class="audio-player-progress-bar"></div></div>',
                '<div class="audio-player-volume-control">',
                '<button class="audio-player-volume right_menu_button fa-fw fa-solid fa-volume-high" title="Mute"></button>',
                '</div>',
                '</div>',
                '</div>',
            ].join('');
        case MEDIA_TYPE.IMAGE:
        default:
            return [
                `<div class="mes_media_container mes_img_container" data-index="${index}">`,
                '<div class="mes_img_controls">',
                '<div title="Expand and zoom" class="right_menu_button fa-lg fa-solid fa-magnifying-glass mes_media_enlarge"></div>',
                '<div title="Caption" class="right_menu_button fa-lg fa-solid fa-envelope-open-text mes_img_caption"></div>',
                '<div title="Delete" class="right_menu_button fa-lg fa-solid fa-trash-can mes_media_delete"></div>',
                '</div>',
                `<img class="mes_img" src="${url}" title="${title}" />`,
                '</div>',
            ].join('');
    }
}

/**
 * @param {string} blockHtml
 * @param {string} controlsHtml
 * @returns {string}
 */
function injectGalleryControls(blockHtml, controlsHtml) {
    // Insert gallery controls before the closing div of the media container and mark swipes.
    return blockHtml
        .replace('class="mes_media_container', 'class="mes_media_container img_swipes')
        .replace(/<\/div>\s*$/, `${controlsHtml}</div>`);
}

/**
 * @param {Array<object>} files
 * @returns {string}
 */
function buildFileHtml(files) {
    return files.map((file, index) => {
        const name = escapeHtml(file?.name ?? '');
        const nameAttr = escapeHtmlAttr(file?.name ?? '');
        const sizeText = humanFileSize(file?.size ?? 0);
        const sizeAttr = escapeHtmlAttr(String(file?.size ?? ''));
        return [
            `<div class="mes_media_container mes_file_container" data-index="${index}">`,
            '<div class="fa-lg fa-solid fa-file-alt mes_file_icon"></div>',
            `<div class="mes_file_name" title="${nameAttr}">${name}</div>`,
            `<div class="mes_file_size" title="${sizeAttr}">${escapeHtml(sizeText)}</div>`,
            '<div class="right_menu_button mes_file_open fa-solid fa-magnifying-glass" title="View contents"></div>',
            '<div class="right_menu_button mes_file_delete fa-solid fa-trash-can" title="Remove the file"></div>',
            '</div>',
        ].join('');
    }).join('');
}

/**
 * Lightweight human-readable file size (parity with utils.humanFileSize defaults).
 * @param {number} bytes
 * @param {boolean} [si=false]
 * @param {number} [dp=1]
 * @returns {string}
 */
export function humanFileSize(bytes, si = false, dp = 1) {
    let value = Number(bytes) || 0;
    const thresh = si ? 1000 : 1024;

    if (Math.abs(value) < thresh) {
        return `${value} B`;
    }

    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10 ** dp;

    do {
        value /= thresh;
        ++u;
    } while (Math.round(Math.abs(value) * r) / r >= thresh && u < units.length - 1);

    return `${value.toFixed(dp)} ${units[u]}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtmlAttr(value) {
    return escapeHtml(value);
}
