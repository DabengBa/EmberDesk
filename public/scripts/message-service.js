import { buildChatMessageRenderDescriptor, buildChatMessageRowPopulation } from './chat-message-render-descriptor.js';
import { buildChatMessageRichBodyRender } from './chat-message-render-service.js';
import { MEDIA_DISPLAY, MEDIA_TYPE, SCROLL_BEHAVIOR, debounce_timeout } from './constants.js';
import { eventSource, event_types } from './events.js';
import { requireMessageShellContext } from './message-shell-context.js';

function shell() {
    return requireMessageShellContext();
}

const state = new Proxy({}, {
    get: (_, key) => shell().state[key],
    set: (_, key, value) => {
        shell().state[key] = value;
        return true;
    },
    has: (_, key) => key in shell().state,
    ownKeys: () => Reflect.ownKeys(shell().state),
    getOwnPropertyDescriptor: (_, key) => Object.getOwnPropertyDescriptor(shell().state, key),
});

const applyCharacterTagsToMessageDivs = (...args) => shell().applyCharacterTagsToMessageDivs(...args);
const canUseNegativeLookbehind = (...args) => shell().canUseNegativeLookbehind(...args);
const collapseNewlines = (...args) => shell().collapseNewlines(...args);
const copyText = (...args) => shell().copyText(...args);
const decodeStyleTags = (...args) => shell().decodeStyleTags(...args);
const delay = (...args) => shell().delay(...args);
const encodeStyleTags = (...args) => shell().encodeStyleTags(...args);
const escapeHtml = (...args) => shell().escapeHtml(...args);
const escapeRegex = (...args) => shell().escapeRegex(...args);
const fixMarkdown = (...args) => shell().fixMarkdown(...args);
const getGeneratingApi = (...args) => shell().getGeneratingApi(...args);
const getGeneratingModel = (...args) => shell().getGeneratingModel(...args);
const getMessageTimeStamp = (...args) => shell().getMessageTimeStamp(...args);
const getRegexedString = (...args) => shell().getRegexedString(...args);
const getStoppingStrings = (...args) => shell().getStoppingStrings(...args);
const getThumbnailUrl = (...args) => shell().getThumbnailUrl(...args);
const getTokenCountAsync = (...args) => shell().getTokenCountAsync(...args);
const humanFileSize = (...args) => shell().humanFileSize(...args);
const isDataURL = (...args) => shell().isDataURL(...args);
const isReactMainChatOwner = (...args) => shell().isReactMainChatOwner(...args);
const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const onlyUnique = (...args) => shell().onlyUnique(...args);
const parseReasoningInSwipes = (...args) => shell().parseReasoningInSwipes(...args);
const refreshSwipeButtons = (...args) => shell().refreshSwipeButtons(...args);
const saveBase64AsFile = (...args) => shell().saveBase64AsFile(...args);
const saveImageToMessage = (...args) => shell().saveImageToMessage(...args);
const scheduleMainChatMessageListPanelRefresh = (...args) => shell().scheduleMainChatMessageListPanelRefresh(...args);
const substituteParams = (...args) => shell().substituteParams(...args);
const t = (...args) => shell().t(...args);
const timestampToMoment = (...args) => shell().timestampToMoment(...args);
const trimToEndSentence = (...args) => shell().trimToEndSentence(...args);
const updateBookmarkDisplay = (...args) => shell().updateBookmarkDisplay(...args);
const updateEditArrowClasses = (...args) => shell().updateEditArrowClasses(...args);
const updateReasoningUI = (...args) => shell().updateReasoningUI(...args);
const updateSwipeCounter = (...args) => shell().updateSwipeCounter(...args);

let requestId = null;

/**
 * Formats the message text into an HTML string using Markdown and other formatting.
 * @param {string} mes Message text
 * @param {string} ch_name Character name
 * @param {boolean} isSystem If the message was sent by the system
 * @param {boolean} isUser If the message was sent by the user
 * @param {number} messageId Message index in chat array
 * @param {Partial<DOMPurify.Config>} [sanitizerOverrides] DOMPurify sanitizer option overrides
 * @param {boolean} [isReasoning] If the message is reasoning output
 * @returns {string} HTML string
 */
export function messageFormatting(mes, ch_name, isSystem, isUser, messageId, sanitizerOverrides = {}, isReasoning = false) {
    if (!mes) {
        return '';
    }

    if (Number(messageId) === 0 && !isSystem && !isUser && !isReasoning) {
        const mesBeforeReplace = mes;
        const chatMessage = state.chat[messageId];
        mes = substituteParams(mes, undefined, ch_name);
        if (chatMessage && chatMessage.mes === mesBeforeReplace && chatMessage.extra?.display_text !== mesBeforeReplace) {
            chatMessage.mes = mes;
        }
    }

    state.mesForShowdownParse = mes;

    // Force isSystem = false on comment messages so they get formatted properly
    if (ch_name === state.COMMENT_NAME_DEFAULT && isSystem && !isUser) {
        isSystem = false;
    }

    // Let hidden messages have markdown
    if (isSystem && ch_name !== state.systemUserName) {
        isSystem = false;
    }

    // Prompt bias replacement should be applied on the raw message
    const replacedPromptBias = state.power_user.user_prompt_bias && substituteParams(state.power_user.user_prompt_bias);
    if (!state.power_user.show_user_prompt_bias && ch_name && !isUser && !isSystem && replacedPromptBias && mes.startsWith(replacedPromptBias)) {
        mes = mes.slice(replacedPromptBias.length);
    }

    if (!isSystem) {
        function getRegexPlacement() {
            try {
                if (isReasoning) {
                    return state.regex_placement.REASONING;
                }
                if (isUser) {
                    return state.regex_placement.USER_INPUT;
                } else if (state.chat[messageId]?.extra?.type === 'narrator') {
                    return state.regex_placement.SLASH_COMMAND;
                } else {
                    return state.regex_placement.AI_OUTPUT;
                }
            } catch {
                return state.regex_placement.AI_OUTPUT;
            }
        }

        const regexPlacement = getRegexPlacement();
        const usableMessages = state.chat.map((x, index) => ({ message: x, index: index })).filter(x => !x.message.is_system);
        const indexOf = usableMessages.findIndex(x => x.index === Number(messageId));
        const depth = messageId >= 0 && indexOf !== -1 ? (usableMessages.length - indexOf - 1) : undefined;

        // Always override the character name
        mes = getRegexedString(mes, regexPlacement, {
            characterOverride: ch_name,
            isMarkdown: true,
            depth: depth,
        });
    }

    if (state.power_user.auto_fix_generated_markdown) {
        mes = fixMarkdown(mes, true);
    }

    if (!isSystem && state.power_user.encode_tags) {
        mes = canUseNegativeLookbehind()
            ? mes.replaceAll('<', '&lt;').replace(new RegExp('(?<!^|\\n\\s*)>', 'g'), '&gt;')
            : mes.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    // Make sure reasoning strings are always shown, even if they include "<" or ">"
    [state.power_user.reasoning.prefix, state.power_user.reasoning.suffix].forEach((reasoningString) => {
        if (!reasoningString || !reasoningString.trim().length) {
            return;
        }
        // Only replace the first occurrence of the reasoning string
        if (mes.includes(reasoningString)) {
            mes = mes.replace(reasoningString, escapeHtml(reasoningString));
        }
    });

    if (!isSystem) {
        // Save double quotes in tags as a special character to prevent them from being encoded
        if (!state.power_user.encode_tags) {
            mes = mes.replace(/<([^>]+)>/g, function (_, contents) {
                return '<' + contents.replace(/"/g, '\ufffe') + '>';
            });
        }

        mes = mes.replace(
            /<style>[\s\S]*?<\/style>|```[\s\S]*?```|~~~[\s\S]*?~~~|``[\s\S]*?``|`[\s\S]*?`|(".*?")|(\u201C.*?\u201D)|(\u00AB.*?\u00BB)|(\u300C.*?\u300D)|(\u300E.*?\u300F)|(\uFF02.*?\uFF02)/gim,
            function (match, p1, p2, p3, p4, p5, p6) {
                if (p1) {
                    // English double quotes
                    return `<q>"${p1.slice(1, -1)}"</q>`;
                } else if (p2) {
                    // Curly double quotes “ ”
                    return `<q>“${p2.slice(1, -1)}”</q>`;
                } else if (p3) {
                    // Guillemets « »
                    return `<q>«${p3.slice(1, -1)}»</q>`;
                } else if (p4) {
                    // Corner brackets 「 」
                    return `<q>「${p4.slice(1, -1)}」</q>`;
                } else if (p5) {
                    // White corner brackets 『 』
                    return `<q>『${p5.slice(1, -1)}』</q>`;
                } else if (p6) {
                    // Fullwidth quotes ＂ ＂
                    return `<q>＂${p6.slice(1, -1)}＂</q>`;
                } else {
                    // Return the original match if no quotes are found
                    return match;
                }
            },
        );

        // Restore double quotes in tags
        if (!state.power_user.encode_tags) {
            mes = mes.replace(/\ufffe/g, '"');
        }

        mes = mes.replaceAll('\\begin{align*}', '$$');
        mes = mes.replaceAll('\\end{align*}', '$$');
        mes = state.converter.makeHtml(mes);

        mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
            // Firefox creates extra newlines from <br>s in code blocks, so we replace them before converting newlines to <br>s.
            return match.replace(/\n/gm, '\u0000');
        });
        mes = mes.replace(/\u0000/g, '\n'); // Restore converted newlines
        mes = mes.trim();

        mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
            return match.replace(/&amp;/g, '&');
        });
    }

    if (!state.power_user.allow_name2_display && ch_name && !isUser && !isSystem) {
        mes = mes.replace(new RegExp(`(^|\n)${escapeRegex(ch_name)}:`, 'g'), '$1');
    }

    /** @type {DOMPurify.Config} */
    const config = {
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false,
        MESSAGE_SANITIZE: true,
        ADD_TAGS: ['custom-style'],
        ...sanitizerOverrides,
    };
    mes = encodeStyleTags(mes);
    mes = state.DOMPurify.sanitize(mes, config);
    mes = decodeStyleTags(mes, { prefix: '.mes_text ' });

    return mes;
}

/**
 * Creates an Image element for the given API/model icon.
 * The image references the matching SVG file from `/img/` and includes a tooltip with API and model info.
 * The caller is responsible for appending the image to the DOM and optionally calling `SVGInject` on it.
 *
 * @param {string} apiName - API identifier matching an SVG file in /img/ (e.g. 'openai', 'openrouter', 'claude')
 * @param {string} [modelName=''] - Model name shown in the tooltip
 * @returns {HTMLImageElement} The image element (not yet in the DOM)
 */
export function createModelIcon(apiName, modelName = '') {
    const image = new Image();
    image.classList.add('icon-svg');
    image.src = `/img/${apiName}.svg`;
    image.title = modelName ? `${apiName} - ${modelName}` : apiName;
    return image;
}

/**
 * Inserts or replaces an SVG icon adjacent to the provided message's timestamp.
 *
 * @param {JQuery<HTMLElement>} mes - The message element containing the timestamp where the icon should be inserted or replaced.
 * @param {ChatMessageExtra} extra - Contains the API and model details.
 */
function insertSVGIcon(mes, extra) {
    const apiName = extra?.api || '';

    if (!apiName) {
        return;
    }

    const insertOrReplaceSVG = (image, className, targetSelector, insertBefore) => {
        image.onload = async function () {
            let existingSVG = insertBefore ? mes.find(targetSelector).prev(`.${className}`) : mes.find(targetSelector).next(`.${className}`);
            if (existingSVG.length) {
                existingSVG.replaceWith(image);
            } else {
                if (insertBefore) mes.find(targetSelector).before(image);
                else mes.find(targetSelector).after(image);
            }
            await state.SVGInject(image);
        };
    };

    const insertIcon = (className, targetSelector, insertBefore) => {
        const image = createModelIcon(apiName, extra?.model);
        image.classList.add(className);
        insertOrReplaceSVG(image, className, targetSelector, insertBefore);
    };

    insertIcon('timestamp-icon', '.timestamp');
    insertIcon('thinking-icon', '.mes_reasoning_header_title', true);
}

/**
 * Re-renders a message block with updated content.
 * @param {number} messageId Message ID
 * @param {object} message Message object
 * @param {object} [options={}] Optional arguments
 * @param {boolean} [options.rerenderMessage=true] Whether to re-render the message content (inside <c>.mes_text</c>)
 */
export function updateMessageBlock(messageId, message, { rerenderMessage = true } = {}) {
    if (isReactMainChatOwner()) {
        if (message && state.chat[messageId] !== message) {
            state.chat[messageId] = message;
        }
        void mountReactMainChatMessageListPanel();
        return;
    }

    const messageElement = state.chatElement.find(`[mesid="${messageId}"]`);
    if (rerenderMessage) {
        const text = message?.extra?.display_text ?? message.mes;
        messageElement.find('.mes_text').html(messageFormatting(text, message.name, message.is_system, message.is_user, messageId, {}, false));
    }

    updateReasoningUI(messageElement);

    addCopyToCodeBlocks(messageElement);
    appendMediaToMessage(message, messageElement);
}

/**
 * Ensures that the message media properties are arrays, adding getters/setters for single media items.
 * @param {ChatMessage} mes Message object
 */
export function ensureMessageMediaIsArray(mes) {
    /**
     * Determines if a property of an object is a plain property (not a getter/setter or non-enumerable).
     * @param {object} obj Object to check
     * @param {string} name Property name
     * @returns {boolean} True if the property is a plain property, false otherwise
     */
    function isPlainObjectProperty(obj, name) {
        const hasProperty = Object.hasOwn(obj, name);
        if (hasProperty) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, name);
            return descriptor && descriptor.enumerable && descriptor.configurable && descriptor.writable;
        }
        return false;
    }

    /**
     * Determines if a property of an object is a getter (not a plain property).
     * @param {object} obj Object to check
     * @param {string} name Property name
     * @returns {boolean} True if the property is a getter, false otherwise
     */
    function isGetterObjectProperty(obj, name) {
        const hasProperty = Object.hasOwn(obj, name);
        if (hasProperty) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, name);
            return descriptor && typeof descriptor.get === 'function';
        }
        return false;
    }

    /**
     * Adds a plain property to an object that wraps around an array property.
     * @param {object} obj Object to add property to
     * @param {string} plainProperty Plain property name
     * @param {string} arrayProperty Array property to back the plain property
     * @param {(value: any) => boolean} [filterFn] Optional filter function to apply when getting/setting the plain property
     * @param {(value: any) => any} [mapFn] Optional map function to apply when getting/setting the plain property
     */
    function addArrayAutoWrapper(obj, plainProperty, arrayProperty, filterFn = () => true, mapFn = (t) => t) {
        // If the plain property is already a getter, do nothing.
        const hasGetterProperty = isGetterObjectProperty(obj, plainProperty);
        if (hasGetterProperty) {
            return;
        }

        // Define the plain property as a getter/setter that wraps around the array property.
        Object.defineProperty(obj, plainProperty, {
            // Getting the plain property returns the first item in the array property, or undefined if the array is empty.
            get: function () {
                console.trace(`Attempting to GET an array-wrapped property '${plainProperty}'. Use the array property '${arrayProperty}' instead.`);
                const array = Array.isArray(this[arrayProperty]) ? this[arrayProperty].filter(filterFn).map(mapFn) : [];
                return array.length > 0 ? array[0] : void 0;
            },
            // Setting the plain property is not supported, as it would be ambiguous.
            set: function () {
                console.trace(`Attempting to SET an array-wrapped property '${plainProperty}'. Use the array property '${arrayProperty}' instead.`);
            },
            // Exclude the property from JSON serialization and from being listed in for...in loops.
            enumerable: false,
            // Make the property non-configurable to prevent deletion or redefinition.
            configurable: false,
        });
    }

    /**
     * Migrates image swipes from a single image property to an array.
     * @param {ChatMessageExtra} obj
     */
    function migrateMediaToArray(obj) {
        if (isPlainObjectProperty(obj, 'file')) {
            if (!Array.isArray(obj.files)) {
                obj.files = [];
            }
            const fileValue = obj.file;
            delete obj.file;
            if (fileValue) {
                obj.files.push(fileValue);
            }
        }

        if (Array.isArray(obj.image_swipes)) {
            if (!Array.isArray(obj.media)) {
                obj.media = [];
            }
            for (const swipe of obj.image_swipes) {
                if (swipe && typeof swipe === 'string') {
                    obj.media_display = MEDIA_DISPLAY.GALLERY;
                    obj.media.push({ type: MEDIA_TYPE.IMAGE, url: swipe });
                }
            }
            delete obj.image_swipes;
        }

        if (isPlainObjectProperty(obj, 'image')) {
            if (!Array.isArray(obj.media)) {
                obj.media = [];
            }
            const imageValue = obj.image;
            delete obj.image;
            if (imageValue && typeof imageValue === 'string') {
                obj.media.push({ type: MEDIA_TYPE.IMAGE, url: imageValue });
            }
            if (obj.media_display === MEDIA_DISPLAY.GALLERY) {
                const selectedIndex = obj.media.findIndex(t => t.url === imageValue);
                if (selectedIndex > -1) {
                    obj.media_index = selectedIndex;
                }
            }
            obj.media = obj.media.filter((v, i, a) => i === a.findIndex(t => t.url === v.url));
        }

        if (isPlainObjectProperty(obj, 'video')) {
            if (!Array.isArray(obj.media)) {
                obj.media = [];
            }
            const videoValue = obj.video;
            delete obj.video;
            if (videoValue && typeof videoValue === 'string') {
                obj.media.push({ type: MEDIA_TYPE.VIDEO, url: videoValue });
            }
        }
    }

    if (!mes || !mes.extra || typeof mes.extra !== 'object') {
        return;
    }

    migrateMediaToArray(mes.extra);
    addArrayAutoWrapper(mes.extra, 'file', 'files');
    addArrayAutoWrapper(mes.extra, 'image', 'media', (t) => t.type === MEDIA_TYPE.IMAGE, (t) => t.url);
    addArrayAutoWrapper(mes.extra, 'video', 'media', (t) => t.type === MEDIA_TYPE.VIDEO, (t) => t.url);
}

/**
 * Gets the media display setting for a message.
 * @param {ChatMessage} mes Message object
 * @returns {MEDIA_DISPLAY} Media display setting
 */
export function getMediaDisplay(mes) {
    const value = mes?.extra?.media_display || state.power_user.media_display || MEDIA_DISPLAY.LIST;
    return Object.values(MEDIA_DISPLAY).includes(value) ? value : MEDIA_DISPLAY.LIST;
}

/**
 * Gets the media index for a message.
 * @param {ChatMessage} mes Message object
 * @returns {number} Media index
 */
export function getMediaIndex(mes) {
    if (!Array.isArray(mes?.extra?.media)) {
        return 0;
    }
    const value = mes.extra?.media_index;
    if (isNaN(value) || value < 0 || value >= mes.extra.media.length) {
        return 0;
    }
    return value;
}

/**
 * Appends image or file to the message element.
 * @param {ChatMessage} mes Message object
 * @param {JQuery<HTMLElement>} messageElement Message element
 * @param {string} [scrollBehavior] Scroll behavior when adjusting scroll position
 */
export function appendMediaToMessage(mes, messageElement, scrollBehavior = SCROLL_BEHAVIOR.ADJUST) {
    ensureMessageMediaIsArray(mes);
    if (isReactMainChatOwner()) {
        scheduleMainChatMessageListPanelRefresh();
        return;
    }

    const fileWrapper = messageElement.find('.mes_file_wrapper');
    const mediaWrapper = messageElement.find('.mes_media_wrapper');

    const hasMedia = Array.isArray(mes?.extra?.media) && mes.extra.media.length > 0;
    const hasFiles = Array.isArray(mes?.extra?.files) && mes.extra.files.length > 0;
    const mediaDisplay = hasMedia ? getMediaDisplay(mes) : null;
    const hideMessageText = hasMedia && mes?.extra?.inline_image === false;

    const mediaBlocks = [];
    const mediaPromises = [];

    const chatHeight = (hasMedia || hasFiles) ? state.chatElement.prop('scrollHeight') : 0;
    const scrollPosition = (hasMedia || hasFiles) ? state.chatElement.scrollTop() : 0;
    const doAdjustScroll = () => {
        if (!hasMedia && !hasFiles) {
            return;
        }
        if (scrollBehavior === SCROLL_BEHAVIOR.NONE) {
            return;
        }
        if (scrollBehavior === SCROLL_BEHAVIOR.KEEP) {
            state.chatElement.scrollTop(scrollPosition);
            return;
        }
        const newChatHeight = state.chatElement.prop('scrollHeight');
        const diff = newChatHeight - chatHeight;
        state.chatElement.scrollTop(scrollPosition + diff);
    };

    // Set media display attribute
    messageElement.attr('data-media-display', mediaDisplay);
    // Toggle text visibility
    messageElement.find('.mes_text').toggleClass('inline_media', hideMessageText);

    /**
     * Appends a single image attachment to the message element.
     * @param {MediaAttachment} attachment Image attachment object
     * @param {number} index Index of the image attachment
     * @returns {JQuery<HTMLElement>} The appended image container element
     */
    function appendImageAttachment(attachment, index) {
        const template = $('#message_image_template .mes_img_container').clone();
        template.attr('data-index', index);

        const image = template.find('.mes_img');
        image.attr('src', attachment.url);
        image.attr('title', attachment.title || mes.extra.title || '');
        mediaPromises.push(new Promise((resolve) => {
            function onLoad() {
                image.removeAttr('alt');
                image.removeClass('error');
                resolve();
            }
            function onError() {
                image.attr('alt', '');
                image.addClass('error');
                resolve();
            }
            if (image.prop('complete')) {
                onLoad();
            } else {
                image.off('load').on('load', onLoad);
                image.off('error').on('error', onError);
            }
        }));

        mediaBlocks.push(template);
        return template;
    }

    /**
     * Appends a single video attachment to the message element.
     * @param {MediaAttachment} attachment Video attachment object
     * @param {number} index Index of the video attachment
     * @returns {JQuery<HTMLElement>} The appended video container element
     */
    function appendVideoAttachment(attachment, index) {
        const template = $('#message_video_template .mes_video_container').clone();
        template.attr('data-index', index);

        const video = template.find('.mes_video');
        video.attr('src', attachment.url);
        video.attr('title', attachment.title || mes.extra.title || '');
        mediaPromises.push(new Promise((resolve) => {
            function onLoad() {
                resolve();
            }
            function onError() {
                video.addClass('error');
                resolve();
            }
            if (video.prop('readyState') >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                onLoad();
            } else {
                video.off('loadeddata').on('loadeddata', onLoad);
                video.off('error').on('error', onError);
            }
        }));

        mediaBlocks.push(template);
        return template;
    }

    /**
     * Appends a single audio attachment to the message element.
     * @param {MediaAttachment} attachment Audio attachment object
     * @param {number} index Index of the audio attachment
     * @returns {JQuery<HTMLElement>} The appended audio container element
     */
    function appendAudioAttachment(attachment, index) {
        const template = $('#message_audio_template .mes_audio_container').clone();
        template.attr('data-index', index);
        const audio = template.find('.mes_audio');
        audio.attr('src', attachment.url);
        audio.attr('title', attachment.title || mes.extra.title || '');

        mediaPromises.push(new Promise((resolve) => {
            function onLoad() {
                resolve();
            }
            function onError() {
                audio.addClass('error');
                resolve();
            }
            if (audio.prop('readyState') >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                onLoad();
            } else {
                audio.off('loadeddata').on('loadeddata', onLoad);
                audio.off('error').on('error', onError);
            }
        }));

        new state.AudioPlayer(audio.get(0), template.get(0));

        mediaBlocks.push(template);
        return template;
    }

    /**
     * Appends a media attachment to the message element.
     * @param {MediaAttachment} attachment Media attachment object
     * @param {number} index Index of the media attachment
     * @returns {JQuery<HTMLElement>} The appended media container element
     */
    function appendMediaAttachment(attachment, index) {
        if (!attachment.type) {
            attachment.type = MEDIA_TYPE.IMAGE;
        }
        switch (attachment.type) {
            case MEDIA_TYPE.IMAGE:
                return appendImageAttachment(attachment, index);
            case MEDIA_TYPE.VIDEO:
                return appendVideoAttachment(attachment, index);
            case MEDIA_TYPE.AUDIO:
                return appendAudioAttachment(attachment, index);
        }

        console.warn(`Unknown media type: ${attachment.type}, defaulting to image.`, attachment);
        return appendImageAttachment(attachment, index);
    }

    /**
     * Saves the current playback times of media elements in the message.
     * @returns {Map<string, MediaState>} Media playback times by source URL
     */
    function saveMediaStates() {
        const states = new Map();
        const media = mediaWrapper.find('video, audio');
        media.each((_, element) => {
            if (element instanceof HTMLMediaElement) {
                if (!element.currentSrc || element.readyState === HTMLMediaElement.HAVE_NOTHING) {
                    return;
                }
                const state = { currentTime: element.currentTime, paused: element.paused };
                states.set(element.currentSrc, state);
            }
        });
        return states;
    }

    /**
     * Restores the playback times of media elements in the message.
     * @param {Map<string, MediaState>} states Media playback times by source URL
     */
    function restoreMediaStates(states) {
        const media = mediaWrapper.find('video, audio');
        media.each((_, element) => {
            if (element instanceof HTMLMediaElement) {
                const restoreState = () => {
                    if (!states.has(element.currentSrc)) {
                        return;
                    }
                    const state = states.get(element.currentSrc);
                    element.currentTime = state.currentTime;
                    if (!state.paused) {
                        element.play();
                    }
                };
                if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
                    element.addEventListener('loadedmetadata', () => restoreState(), { once: true });
                } else {
                    restoreState();
                }
            }
        });
    }

    // Add media gallery to message
    if (hasMedia && mediaDisplay === MEDIA_DISPLAY.GALLERY) {
        const mediaIndex = getMediaIndex(mes);
        const selectedMedia = mes.extra.media[mediaIndex];

        const galleryControls = $('#message_gallery_controls .mes_img_swipes').clone();
        const counter = galleryControls.find('.mes_img_swipe_counter');
        counter.text(`${mediaIndex + 1}/${mes.extra.media.length}`);

        const template = appendMediaAttachment(selectedMedia, mediaIndex);
        template.addClass('img_swipes');
        template.append(galleryControls);
    }

    // Add media as a list to message
    if (hasMedia && mediaDisplay === MEDIA_DISPLAY.LIST) {
        for (let index = 0; index < mes.extra.media.length; index++) {
            const attachment = mes.extra.media[index];
            appendMediaAttachment(attachment, index);
        }
    }

    // Remove existing file containers
    fileWrapper.empty();

    // Add files to message
    if (hasFiles) {
        for (let index = 0; index < mes.extra.files.length; index++) {
            const file = mes.extra.files[index];
            const template = $('#message_file_template .mes_file_container').clone();
            template.attr('data-index', index);
            template.find('.mes_file_name').text(file.name).attr('title', file.name);
            template.find('.mes_file_size').text(humanFileSize(file.size)).attr('title', file.size);
            fileWrapper.append(template);
        }
    }

    // Early return if no media
    if (!hasMedia) {
        mediaWrapper.empty();
        doAdjustScroll();
        return;
    }

    // TODO: Consider making this awaitable
    Promise.race([Promise.all(mediaPromises), delay(debounce_timeout.short)]).then(() => {
        const states = saveMediaStates();
        mediaWrapper.empty().append(mediaBlocks);
        restoreMediaStates(states);
        doAdjustScroll();
        void mountReactMainChatMessageListPanel();
    });
}

export function addCopyToCodeBlocks(messageElement) {
    const codeBlocks = $(messageElement).find('pre code');
    for (let i = 0; i < codeBlocks.length; i++) {
        state.hljs.highlightElement(codeBlocks.get(i));
        const copyButton = document.createElement('i');
        copyButton.classList.add('fa-solid', 'fa-copy', 'code-copy', 'interactable');
        copyButton.title = 'Copy code';
        codeBlocks.get(i).appendChild(copyButton);
        copyButton.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        copyButton.addEventListener('pointerup', async function () {
            const text = codeBlocks.get(i).textContent;
            await copyText(text);
            toastr.info(t`Copied!`, '', { timeOut: 2000 });
        });
    }
}

/**
 * Shows or hides the Prompt display button.
 * @param {ChatMessage} message Message object
 * @param {object} options Options
 * @param {number} [options.messageId] Message ID
 * @param {JQuery<HTMLElement>} [options.messageElement] Message element
 * @returns {void}
 */
function updateMessageItemizedPromptButton(message, { messageId = state.chat.indexOf(message), messageElement = state.chatElement.find(`.mes[mesid="${messageId}"]`) }) {
    if (!message.is_user && Array.isArray(state.itemizedPrompts) && state.itemizedPrompts.length > 0) {
        const itemizedPrompt = state.itemizedPrompts.find(x => Number(x.mesId) === Number(messageId));
        if (itemizedPrompt) {
            messageElement.find('.mes_prompt').show();
        }
    }
}

/**
 * Gets messageFormatting for a ChatMessage object.
 * @param {ChatMessage} message
 * @param {object} options Options
 * @param {number} [options.messageId] Message ID
 * @returns {string} Formatted message HTML
 */
export function getMessageTextHTML(message, { messageId = state.chat.indexOf(message) }) {
    return buildChatMessageRichBody(message, { messageId }).messageHtml;
}

/**
 * Builds pure rich-body HTML via the framework-neutral render service.
 * The service does not insert DOM; callers apply the returned HTML strings.
 * @param {ChatMessage} message
 * @param {object} options
 * @param {number} [options.messageId]
 * @returns {ReturnType<typeof buildChatMessageRichBodyRender>}
 */
function buildChatMessageRichBody(message, { messageId = state.chat.indexOf(message) } = {}) {
    return buildChatMessageRichBodyRender(message, {
        messageId,
        formatMessage: messageFormatting,
        mediaDisplay: getMediaDisplay(message),
        mediaIndex: getMediaIndex(message),
    });
}

/**
 * Adds a single message to the chat.
 * @param {ChatMessage} mes Message object
 * @param {object} [options] Options
 * @param {string} [options.type=undefined|'swipe'] Deprecated. Use updateMessageElement instead.
 * @param {number} [options.insertAfter=null] Message ID to insert the new message after
 * @param {boolean} [options.scroll=true] Whether to scroll to the new message
 * @param {number} [options.insertBefore=null] Message ID to insert the new message before
 * @param {number} [options.forceId=null] Force the message ID
 * @param {boolean} [options.showSwipes=true] Whether to refresh the swipe buttons.
 * @returns {JQuery<HTMLElement>} The newly added message element
 */
export function addOneMessage(mes, { type = undefined, insertAfter = null, scroll = true, insertBefore = null, forceId = null, showSwipes = true } = {}) {
    // Callers push the new message to chat before calling addOneMessage
    const messageId = (() => {
        if (typeof forceId === 'number') {
            return forceId;
        }
        if (typeof insertBefore === 'number') {
            return insertBefore - 1;
        }
        if (typeof insertAfter === 'number') {
            return insertAfter + 1;
        }
        const index = state.chat.indexOf(mes);
        if (index !== -1) {
            return index;
        }
        return state.chat.length - 1;
    })();

    if (isReactMainChatOwner()) {
        void mountReactMainChatMessageListPanel();
        if (!insertAfter && !insertBefore && scroll) {
            scrollChatToBottom({ waitForFrame: true });
        }
        return $();
    }

    let messageElement;

    if (type === 'swipe') {
        // Forbidden black magic
        // This allows to use "continue" on user messages
        mes.swipe_id ??= 0;
        mes.swipes ??= [mes.mes];
        //This keeps listeners intact.
        messageElement = state.chatElement.find(`[mesid="${messageId}"]`);
        updateMessageElement(mes, { messageId, messageElement, adjustMediaScroll: scroll ? SCROLL_BEHAVIOR.ADJUST : SCROLL_BEHAVIOR.NONE });
    } else {
        messageElement = updateMessageElement(mes, { messageId, adjustMediaScroll: scroll ? SCROLL_BEHAVIOR.ADJUST : SCROLL_BEHAVIOR.NONE });
        if (typeof insertAfter === 'number' && insertAfter >= 0) {
            const target = state.chatElement.find(`.mes[mesid="${insertAfter}"]`);
            $(messageElement).insertAfter(target);
        } else if (typeof insertBefore === 'number' && insertBefore >= 0) {
            const target = state.chatElement.find(`.mes[mesid="${insertBefore}"]`);
            $(messageElement).insertBefore(target);
        } else {
            state.chatElement.append(messageElement);
        }
    }


    //last_mes should always be updated.
    state.chatElement.find('.mes').removeClass('last_mes');
    state.chatElement.find('.mes').last().addClass('last_mes');

    if (showSwipes) refreshSwipeButtons();
    // Don't scroll if not inserting last
    if (!insertAfter && !insertBefore && scroll) {
        scrollChatToBottom({ waitForFrame: true });
    }

    applyCharacterTagsToMessageDivs({ mesIds: messageId });
    updateEditArrowClasses();
    return messageElement;
}

/**
 * Creates the element of a single message as if it were the last message or at forceMesId
 * @param {ChatMessage} mes Message object
 * @param {object} [options] Options
 * @param {number} [options.messageId=chat.length - 1] Force the message ID
 * @param {JQuery<HTMLElement>} [options.messageElement=messageTemplate.clone()] This message element will be updated with the ChatMessage object.
 * @param {SCROLL_BEHAVIOR} [options.adjustMediaScroll=SCROLL_BEHAVIOR.NONE] Scroll behavior option passed to appendMediaToMessage.
 * @returns {JQuery<HTMLElement>} Rendered HTMLElement.
 */
export function updateMessageElement(mes, { messageId = state.chat.length - 1, messageElement = state.messageTemplate.clone(), adjustMediaScroll = SCROLL_BEHAVIOR.NONE } = {}) {
    let avatarImg = getThumbnailUrl('persona', state.user_avatar);

    //for non-user messages
    if (!mes.is_user) {
        if (mes.force_avatar) {
            avatarImg = mes.force_avatar;
        } else if (state.this_chid === undefined) {
            avatarImg = state.system_avatar;
        } else if (state.characters[state.this_chid] && state.characters[state.this_chid].avatar !== 'none') {
            avatarImg = getThumbnailUrl('avatar', state.characters[state.this_chid].avatar);
        } else {
            avatarImg = state.default_avatar;
        }
        //old processing:
        //if message is from system, use the name provided in the message JSONL to proceed,
        //if not system message, use name2 (char's name) to proceed
        //characterName = mes.is_system || mes.force_avatar ? mes.name : name2;
    } else if (mes.is_user && mes.force_avatar) {
        // Special case for persona images.
        avatarImg = mes.force_avatar;
    }
    const momentDate = timestampToMoment(mes.send_date);
    const timestamp = momentDate.isValid() ? momentDate.format('LL LT') : '';
    const renderDescriptor = buildChatMessageRenderDescriptor(mes, { messageId, timestamp });
    const timestampTitle = `${mes.extra?.api ? mes.extra.api + ' - ' : ''}${mes.extra?.model ?? ''}`;
    const richBody = buildChatMessageRichBody(mes, { messageId });
    const messageHTML = richBody.messageHtml;
    const { timerValue, timerTitle } = formatGenerationTimer(mes.gen_started, mes.gen_finished, mes.extra?.token_count, mes.extra?.reasoning_duration, mes.extra?.time_to_first_token);
    const rowPopulation = buildChatMessageRowPopulation(renderDescriptor, {
        avatarImg,
        messageTitle: mes.title,
        timestampTitle,
        timerValue,
        timerTitle,
    });

    messageElement.attr(rowPopulation.attributes);

    messageElement.find('.avatar img').attr('src', rowPopulation.avatarSrc);
    messageElement.find('.ch_name .name_text').text(rowPopulation.displayName);
    messageElement.find('.timestamp').text(rowPopulation.timestampText).attr('title', rowPopulation.timestampTitle);
    messageElement.find('.mesIDDisplay').text(rowPopulation.messageIdText);
    rowPopulation.tokenCountText && messageElement.find('.tokenCounterDisplay').text(rowPopulation.tokenCountText);
    rowPopulation.messageTitle && messageElement.attr('title', rowPopulation.messageTitle);
    rowPopulation.timer.value && messageElement.find('.mes_timer').attr('title', rowPopulation.timer.title).text(rowPopulation.timer.value);
    rowPopulation.bookmarkLink && updateBookmarkDisplay(messageElement);

    if (richBody.biasHtml) {
        messageElement.find('.mes_bias').html(richBody.biasHtml);
    }

    updateReasoningUI(messageElement);

    if (state.power_user.timestamp_model_icon && mes.extra?.api) {
        insertSVGIcon(messageElement, mes.extra);
    }

    if (rowPopulation.classes.smallSysMes) {
        messageElement.addClass('smallSysMes');
    }

    if (rowPopulation.classes.toolCall) {
        messageElement.addClass('toolCall');
    }

    updateMessageItemizedPromptButton(mes, { messageId, messageElement });

    messageElement.find('.avatar img').on('error', function () {
        $(this).hide();
        $(this).parent().html('<div class="missing-avatar fa-solid fa-user-slash"></div>');
    });

    appendMediaToMessage(mes, messageElement, adjustMediaScroll);
    messageElement.find('.mes_text').html(messageHTML);
    addCopyToCodeBlocks(messageElement);

    // Set the swipes counter for all non-user messages.
    if (!mes.is_user) {
        updateSwipeCounter(messageId, { message: mes, messageElement });
    }

    return messageElement;
}

/**
 * Returns the URL of the avatar for the given character Id.
 * @param {number|string} characterId Character Id
 * @returns {string} Avatar URL
 */
export function getCharacterAvatar(characterId) {
    const character = state.characters[characterId];
    const avatarImg = character?.avatar;

    if (!avatarImg || avatarImg === 'none') {
        return state.default_avatar;
    }

    return formatCharacterAvatar(avatarImg);
}

export function formatCharacterAvatar(characterAvatar) {
    return `characters/${characterAvatar}`;
}

/**
 * Formats the title for the generation timer.
 * @param {MessageTimestamp} gen_started Date when generation was started
 * @param {MessageTimestamp} gen_finished Date when generation was finished
 * @param {number} tokenCount Number of tokens generated (0 if not available)
 * @param {number?} [reasoningDuration=null] Reasoning duration (null if no reasoning was done)
 * @param {number?} [timeToFirstToken=null] Time to first token
 * @returns {Object} Object containing the formatted timer value and title
 * @example
 * const { timerValue, timerTitle } = formatGenerationTimer(gen_started, gen_finished, tokenCount);
 * console.log(timerValue); // 1.2s
 * console.log(timerTitle); // Generation queued: 12:34:56 7 Jan 2021\nReply received: 12:34:57 7 Jan 2021\nTime to generate: 1.2 seconds\nToken rate: 5 t/s
 */
export function formatGenerationTimer(gen_started, gen_finished, tokenCount, reasoningDuration = null, timeToFirstToken = null) {
    if (!gen_started || !gen_finished) {
        return {};
    }

    const dateFormat = 'HH:mm:ss D MMM YYYY';
    const start = state.moment(gen_started);
    const finish = state.moment(gen_finished);
    const seconds = finish.diff(start, 'seconds', true);
    const timerValue = `${seconds.toFixed(1)}s`;
    const timerTitle = [
        `Generation queued: ${start.format(dateFormat)}`,
        `Reply received: ${finish.format(dateFormat)}`,
        `Time to generate: ${seconds} seconds`,
        timeToFirstToken ? `Time to first token: ${timeToFirstToken / 1000} seconds` : '',
        reasoningDuration > 0 ? `Time to think: ${reasoningDuration / 1000} seconds` : '',
        tokenCount > 0 ? `Token rate: ${Number(tokenCount / seconds).toFixed(3)} t/s` : '',
    ].filter(x => x).join('\n').trim();

    if (isNaN(seconds) || seconds < 0) {
        return { timerValue: '', timerTitle };
    }

    return { timerValue, timerTitle };
}

/**
 * Scrolls the chat to the bottom if configured to do so.
 * @param {object} [options] Options
 * @param {boolean} [options.waitForFrame] If true, waits for the animation frame before scrolling
 */
export function scrollChatToBottom({ waitForFrame } = {}) {
    if (!state.power_user.auto_scroll_chat_to_bottom) {
        return;
    }

    const doScroll = () => {
        const position = state.chatElement[0].scrollHeight;
        state.chatElement.scrollTop(position);
        requestId = null;
    };

    // Do not check truthiness. requestId can loop to zero.
    if (requestId !== null) {
        cancelAnimationFrame(requestId);
    }

    if (!waitForFrame) {
        doScroll();
        return;
    }

    // This prevents layout thrashing.
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#return_value
    // https://gist.github.com/paulirish/5d52fb081b3570c81e3a#file-what-forces-layout-md
    requestId = requestAnimationFrame(() => doScroll());
}

/**
 * Formats a message according to user settings
 * @param {object} [options] - Additional options.
 * @param {string} [options.getMessage] The message to clean up
 * @param {boolean} [options.isImpersonate] Whether this is an impersonated message
 * @param {boolean} [options.isContinue] Whether this is a continued message
 * @param {boolean} [options.displayIncompleteSentences] Whether to keep incomplete sentences at the end.
 * @param {array} [options.stoppingStrings] Array of stopping strings.
 * @param {boolean} [options.includeUserPromptBias] Whether to permit prepending the user prompt bias at the beginning.
 * @param {boolean} [options.trimNames] Whether to allow trimming "{{char}}:" or "{{user}}:" from the beginning.
 * @param {boolean} [options.trimWrongNames] Whether to allow deleting responses prefixed by the incorrect name, depending on isImpersonate
 *
 * @returns {string} The formatted message
 */
export function cleanUpMessage({ getMessage, isImpersonate, isContinue, displayIncompleteSentences = false, stoppingStrings = null, includeUserPromptBias = true, trimNames = true, trimWrongNames = true } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('cleanUpMessage called with positional arguments. Please use an object instead.');
        [getMessage, isImpersonate, isContinue, displayIncompleteSentences, stoppingStrings, includeUserPromptBias, trimNames, trimWrongNames] = arguments;
    }

    if (!getMessage) {
        return '';
    }

    // Add the prompt bias before anything else
    if (
        includeUserPromptBias &&
        state.power_user.user_prompt_bias &&
        !isImpersonate &&
        !isContinue &&
        state.power_user.user_prompt_bias.length !== 0
    ) {
        getMessage = substituteParams(state.power_user.user_prompt_bias) + getMessage;
    }

    // Allow for caching of stopping strings. getStoppingStrings is an expensive function, especially with macros
    // enabled, so for streaming, we call it once and then pass it into each cleanUpMessage call.
    if (!stoppingStrings) {
        stoppingStrings = getStoppingStrings(isImpersonate, isContinue, state.main_api);
    }

    for (const stoppingString of stoppingStrings) {
        if (stoppingString.length) {
            for (let j = stoppingString.length; j > 0; j--) {
                if (getMessage.slice(-j) === stoppingString.slice(0, j)) {
                    getMessage = getMessage.slice(0, -j);
                    break;
                }
            }
        }
    }

    // Regex uses vars, so add before formatting
    getMessage = getRegexedString(getMessage, isImpersonate ? state.regex_placement.USER_INPUT : state.regex_placement.AI_OUTPUT);

    if (state.power_user.collapse_newlines) {
        getMessage = collapseNewlines(getMessage);
    }

    // trailing invisible whitespace before every newlines, on a multiline string
    // "trailing whitespace on newlines       \nevery line of the string    \n?sample text" ->
    // "trailing whitespace on newlines\nevery line of the string\nsample text"
    getMessage = getMessage.replace(/[^\S\r\n]+$/gm, '');

    if (trimWrongNames) {
        // If this is an impersonation, delete the entire response if it starts with "{{char}}:"
        // If this isn't an impersonation, delete the entire response if it starts with "{{user}}:"
        // Also delete any trailing text that starts with the wrong name.
        // This only occurs if the corresponding "power_user.allow_nameX_display" is false.

        let wrongName = isImpersonate
            ? (!state.power_user.allow_name2_display ? state.name2 : '')  // char
            : (!state.power_user.allow_name1_display ? state.name1 : '');  // user

        if (wrongName) {
            // If the message starts with the wrong name, delete the entire response
            let startIndex = getMessage.indexOf(`${wrongName}:`);
            if (startIndex === 0) {
                getMessage = '';
                console.debug(`Message started with the wrong name: "${wrongName}" - response was deleted.`);
            }

            // If there is trailing text starting with the wrong name, trim it off.
            startIndex = getMessage.indexOf(`\n${wrongName}:`);
            if (startIndex >= 0) {
                getMessage = getMessage.substring(0, startIndex);
            }
        }
    }

    if (getMessage.indexOf('<|endoftext|>') != -1) {
        getMessage = getMessage.substring(0, getMessage.indexOf('<|endoftext|>'));
    }
    const isInstruct = state.power_user.instruct.enabled && state.main_api !== 'openai';
    const isNotEmpty = (str) => str && str.trim() !== '';
    if (isInstruct && state.power_user.instruct.stop_sequence) {
        if (getMessage.indexOf(state.power_user.instruct.stop_sequence) != -1) {
            getMessage = getMessage.substring(0, getMessage.indexOf(state.power_user.instruct.stop_sequence));
        }
    }
    // Hana: Only use the first sequence (should be <|model|>)
    // of the prompt before <|user|> (as KoboldAI Lite does it).
    if (isInstruct && isNotEmpty(state.power_user.instruct.input_sequence)) {
        if (getMessage.indexOf(state.power_user.instruct.input_sequence) != -1) {
            getMessage = getMessage.substring(0, getMessage.indexOf(state.power_user.instruct.input_sequence));
        }
    }

    // Remove instruct sequences leaking to the output
    if (isInstruct && state.power_user.instruct.sequences_as_stop_strings) {
        const sequences = [
            { value: state.power_user.instruct.input_sequence, apply: isImpersonate && isNotEmpty(state.power_user.instruct.input_sequence) },
            { value: state.power_user.instruct.output_sequence, apply: !isImpersonate && isNotEmpty(state.power_user.instruct.output_sequence) },
            { value: state.power_user.instruct.last_output_sequence, apply: !isImpersonate && isNotEmpty(state.power_user.instruct.last_output_sequence) },
        ];
        for (const seq of sequences.filter(s => s.apply)) {
            seq.value.split('\n').filter(line => line.trim() !== '').forEach(line => { getMessage = getMessage.replaceAll(line, ''); });
        }
    }

    if (!state.power_user.allow_name2_display) {
        const name2Escaped = escapeRegex(state.name2);
        getMessage = getMessage.replace(new RegExp(`(^|\n)${name2Escaped}:\\s*`, 'g'), '$1');
    }

    if (isImpersonate) {
        getMessage = getMessage.trim();
    }

    if (state.power_user.auto_fix_generated_markdown) {
        getMessage = fixMarkdown(getMessage, false);
    }

    if (trimNames) {
        // If this is an impersonation, trim "{{user}}:" from the beginning
        // If this isn't an impersonation, trim "{{char}}:" from the beginning.
        // Only applied when the corresponding "power_user.allow_nameX_display" is false.
        const nameToTrim2 = isImpersonate
            ? (!state.power_user.allow_name1_display ? state.name1 : '')  // user
            : (!state.power_user.allow_name2_display ? state.name2 : '');  // char

        if (nameToTrim2 && getMessage.startsWith(nameToTrim2 + ':')) {
            getMessage = getMessage.replace(nameToTrim2 + ':', '');
            getMessage = getMessage.trimStart();
        }
    }

    if (isImpersonate) {
        getMessage = getMessage.trim();
    }

    if (!displayIncompleteSentences && state.power_user.trim_sentences) {
        getMessage = trimToEndSentence(getMessage);
    }

    if (state.power_user.trim_spaces && !state.PromptReasoning.getLatestPrefix()) {
        getMessage = getMessage.trim();
    }

    return getMessage;
}

/**
 * Adds an image to the message.
 * @param {object} message Message object
 * @param {object} sources Image sources
 * @param {string[]} [sources.imageUrls] Image URLs
 *
 * @returns {Promise<void>}
 */
export async function processImageAttachment(message, { imageUrls }) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return;
    }

    for (const [index, imageUrl] of imageUrls.filter(onlyUnique).entries()) {
        if (!imageUrl) {
            continue;
        }

        let url = imageUrl;
        if (isDataURL(url)) {
            const fileName = `inline_image_${Date.now().toString()}_${index}`;
            const [mime, base64] = /^data:(.*?);base64,(.*)$/.exec(imageUrl).slice(1);
            url = await saveBase64AsFile(base64, message.name, fileName, mime.split('/')[1]);
        }
        saveImageToMessage({ image: url, inline: true }, message);
    }
}

/**
 * Saves a resulting message to the chat.
 * @param {SaveReplyParams} params
 * @returns {Promise<SaveReplyResult>} Promise when the message is saved
 *
 * @typedef {object} SaveReplyParams
 * @property {string} type Type of generation
 * @property {string} getMessage Generated message
 * @property {boolean} [fromStreaming] If the message is from streaming
 * @property {string} [title] Message tooltip
 * @property {string[]} [swipes] Extra swipes
 * @property {string} [reasoning] Message reasoning
 * @property {string[]} [imageUrls] Links to images
 * @property {string?} [reasoningSignature] Encrypted signature of the reasoning text
 *
 * @typedef {object} SaveReplyResult
 * @property {string} type Type of generation
 * @property {string} getMessage Generated message
 */
export async function saveReply({ type, getMessage, fromStreaming = false, title = '', swipes = [], reasoning = '', imageUrls = [], reasoningSignature = null }) {
    // Backward compatibility
    if (arguments.length > 1 && typeof arguments[0] !== 'object') {
        console.trace('saveReply called with positional arguments. Please use an object instead.');
        [type, getMessage, fromStreaming, title, swipes, reasoning, imageUrls, reasoningSignature] = arguments;
    }

    const lastMessage = state.chat[state.chat.length - 1];

    if (type != 'append' && type != 'continue' && type != 'appendFinal' && state.chat.length && (lastMessage.swipe_id === undefined ||
        lastMessage.is_user)) {
        type = 'normal';
    }

    if (state.chat.length && (!lastMessage.extra || typeof lastMessage.extra !== 'object')) {
        lastMessage.extra = {};
    }

    // Coerce null/undefined to empty string
    if (state.chat.length && !lastMessage.extra.reasoning) {
        lastMessage.extra.reasoning = '';
    }

    if (!reasoning) {
        reasoning = '';
    }

    const generationFinished = new Date();
    if (type === 'swipe') {
        lastMessage.swipes.length++;
        if (lastMessage.swipe_id === lastMessage.swipes.length - 1) {
            lastMessage.title = title;
            lastMessage.mes = getMessage;
            lastMessage.gen_started = state.generation_started;
            lastMessage.gen_finished = generationFinished;
            lastMessage.send_date = getMessageTimeStamp();
            lastMessage.extra.api = getGeneratingApi();
            lastMessage.extra.model = getGeneratingModel();
            lastMessage.extra.reasoning = reasoning;
            lastMessage.extra.reasoning_duration = null;
            lastMessage.extra.reasoning_signature = reasoningSignature;
            await processImageAttachment(lastMessage, { imageUrls });
            if (state.power_user.message_token_count_enabled) {
                const tokenCountText = (reasoning || '') + lastMessage.mes;
                lastMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
            }
            const chat_id = (state.chat.length - 1);
            !fromStreaming && await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
            addOneMessage(state.chat[chat_id], { type: 'swipe' });
            !fromStreaming && await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
        } else {
            lastMessage.mes = getMessage;
        }
    } else if (type === 'append' || type === 'continue') {
        console.debug('Trying to append.');
        lastMessage.title = title;
        lastMessage.mes += getMessage;
        lastMessage.gen_started = state.generation_started;
        lastMessage.gen_finished = generationFinished;
        lastMessage.send_date = getMessageTimeStamp();
        lastMessage.extra.api = getGeneratingApi();
        lastMessage.extra.model = getGeneratingModel();
        lastMessage.extra.reasoning = reasoning;
        lastMessage.extra.reasoning_duration = null;
        lastMessage.extra.reasoning_signature = reasoningSignature;
        await processImageAttachment(lastMessage, { imageUrls });
        if (state.power_user.message_token_count_enabled) {
            const tokenCountText = (reasoning || '') + lastMessage.mes;
            lastMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }
        const chat_id = (state.chat.length - 1);
        !fromStreaming && await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
        addOneMessage(state.chat[chat_id], { type: 'swipe' });
        !fromStreaming && await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    } else if (type === 'appendFinal') {
        console.debug('Trying to appendFinal.');
        lastMessage.title = title;
        lastMessage.mes = getMessage;
        lastMessage.gen_started = state.generation_started;
        lastMessage.gen_finished = generationFinished;
        lastMessage.send_date = getMessageTimeStamp();
        lastMessage.extra.api = getGeneratingApi();
        lastMessage.extra.model = getGeneratingModel();
        lastMessage.extra.reasoning += reasoning;
        lastMessage.extra.reasoning_signature = reasoningSignature;
        await processImageAttachment(lastMessage, { imageUrls });
        // We don't know if the reasoning duration extended, so we don't update it here on purpose.
        if (state.power_user.message_token_count_enabled) {
            const tokenCountText = (reasoning || '') + lastMessage.mes;
            lastMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }
        const chat_id = (state.chat.length - 1);
        !fromStreaming && await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
        addOneMessage(state.chat[chat_id], { type: 'swipe' });
        !fromStreaming && await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    } else {
        console.debug('entering chat update routine for non-swipe post');
        const newMessage = {};
        state.chat.push(newMessage);
        newMessage.extra = {};
        newMessage.name = state.name2;
        newMessage.is_user = false;
        newMessage.send_date = getMessageTimeStamp();
        newMessage.extra.api = getGeneratingApi();
        newMessage.extra.model = getGeneratingModel();
        newMessage.extra.reasoning = reasoning;
        newMessage.extra.reasoning_duration = null;
        newMessage.extra.reasoning_signature = reasoningSignature;
        if (state.power_user.trim_spaces) {
            getMessage = getMessage.trim();
        }
        newMessage.mes = getMessage;
        newMessage.title = title;
        newMessage.gen_started = state.generation_started;
        newMessage.gen_finished = generationFinished;

        if (state.power_user.message_token_count_enabled) {
            const tokenCountText = (reasoning || '') + newMessage.mes;
            newMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }

        await processImageAttachment(newMessage, { imageUrls });
        const chat_id = (state.chat.length - 1);

        !fromStreaming && await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
        addOneMessage(state.chat[chat_id]);
        !fromStreaming && await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    }

    const item = state.chat[state.chat.length - 1];
    if (item.swipe_info === undefined) {
        item.swipe_info = [];
    }
    if (item.swipe_id !== undefined) {
        const swipeId = item.swipe_id;
        item.swipes[swipeId] = item.mes;
        item.swipe_info[swipeId] = {
            send_date: item.send_date,
            gen_started: item.gen_started,
            gen_finished: item.gen_finished,
            extra: structuredClone(item.extra),
        };
    } else {
        item.swipe_id = 0;
        item.swipes = [];
        item.swipes[0] = item.mes;
        item.swipe_info[0] = {
            send_date: item.send_date,
            gen_started: item.gen_started,
            gen_finished: item.gen_finished,
            extra: structuredClone(item.extra),
        };
    }

    if (Array.isArray(swipes) && swipes.length > 0) {
        const swipeInfoExtra = structuredClone(item.extra ?? {});
        delete swipeInfoExtra.token_count;
        delete swipeInfoExtra.reasoning;
        delete swipeInfoExtra.reasoning_duration;
        const swipeInfo = {
            send_date: item.send_date,
            gen_started: item.gen_started,
            gen_finished: item.gen_finished,
            extra: swipeInfoExtra,
        };
        const swipeInfoArray = Array(swipes.length).fill().map(() => structuredClone(swipeInfo));
        parseReasoningInSwipes(swipes, swipeInfoArray, item.extra?.reasoning_duration);
        item.swipes.push(...swipes);
        item.swipe_info.push(...swipeInfoArray);
    }

    return { type, getMessage };
}

