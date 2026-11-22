import toastr from './notifications.js';

import { buildChatMessageRichBodyRender } from './chat-message-render-service.js';
import { MEDIA_DISPLAY, MEDIA_TYPE, REASONING_PREFIX, REASONING_SUFFIX, SCROLL_BEHAVIOR } from './constants.js';
import { eventSource, event_types } from './events.js';
import { isFrontendContent } from './frontend-frame.js';
import { isCharacterExternalMediaAllowed } from './external-media-policy.js';
import { filterMessageInlineStyles } from './message-css-policy.js';
import { highlightCodeBlock } from './highlight-code-block.js';
import { requireMessageShellContext } from './message-shell-context.js';
import { uuidv4 } from './utils.js';

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

function currentCharacterAllowsExternalMedia() {
    const character = state.characters[state.this_chid];
    return isCharacterExternalMediaAllowed(state.power_user, character?.avatar, character?.canonical_id);
}

const messageStyleScopes = new WeakMap();
const COMMENT_NAME_DEFAULT = 'Note';
function getMessageStyleScope(messageId, isReasoning) {
    const message = state.chat[messageId];
    if (!message || typeof message !== 'object') return `message-${uuidv4()}`;
    let scopes = messageStyleScopes.get(message);
    if (!scopes) {
        scopes = {};
        messageStyleScopes.set(message, scopes);
    }
    const key = isReasoning ? 'reasoning' : 'message';
    return scopes[key] ??= `message-${uuidv4()}`;
}


const copyText = (...args) => shell().copyText(...args);
const decodeStyleTags = (...args) => shell().decodeStyleTags(...args);

const encodeStyleTags = (...args) => shell().encodeStyleTags(...args);
const normalizeStyleTagsForMarkdown = (...args) => shell().normalizeStyleTagsForMarkdown(...args);
const escapeHtml = (...args) => shell().escapeHtml(...args);
const escapeRegex = (...args) => shell().escapeRegex(...args);
const getGeneratingApi = (...args) => shell().getGeneratingApi(...args);
const getGeneratingModel = (...args) => shell().getGeneratingModel(...args);
const getMessageTimeStamp = (...args) => shell().getMessageTimeStamp(...args);
const getRegexedString = (...args) => shell().getRegexedString(...args);
const getStoppingStrings = (...args) => shell().getStoppingStrings(...args);

const isDataURL = (...args) => shell().isDataURL(...args);

const mountReactMainChatMessageListPanel = (...args) => shell().mountReactMainChatMessageListPanel(...args);
const onlyUnique = (...args) => shell().onlyUnique(...args);
const saveBase64AsFile = (...args) => shell().saveBase64AsFile(...args);
const saveImageToMessage = (...args) => shell().saveImageToMessage(...args);
const scheduleMainChatMessageListPanelRefresh = (...args) => shell().scheduleMainChatMessageListPanelRefresh(...args);
const substituteParams = (...args) => shell().substituteParams(...args);
const t = (...args) => shell().t(...args);


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
    if (ch_name === COMMENT_NAME_DEFAULT && isSystem && !isUser) {
        isSystem = false;
    }

    // Let hidden messages have markdown
    if (isSystem && ch_name !== state.systemUserName) {
        isSystem = false;
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


    // Make sure reasoning strings are always shown, even if they include "<" or ">"
    [REASONING_PREFIX, REASONING_SUFFIX].forEach((reasoningString) => {
        // Only replace the first occurrence of the reasoning string
        if (mes.includes(reasoningString)) {
            mes = mes.replace(reasoningString, escapeHtml(reasoningString));
        }
    });

    if (!isSystem) {
        // Markdown only treats a single-line `<style ...>` as raw HTML. Flatten
        // whitespace inside style tags first; the post-Markdown encode step
        // applies the message CSS policy to every spelling.
        mes = normalizeStyleTagsForMarkdown(mes);

        // Save double quotes in tags as a special character to prevent them from being encoded
        mes = mes.replace(/<([^>]+)>/g, function (_, contents) {
            return '<' + contents.replace(/"/g, '\ufffe') + '>';
        });

        mes = mes.replace(
            /<style(?:\s[^>]*)?>[\s\S]*?<\/style\s*>|```[\s\S]*?```|~~~[\s\S]*?~~~|``[\s\S]*?``|`[\s\S]*?`|(".*?")|(\u201C.*?\u201D)|(\u00AB.*?\u00BB)|(\u300C.*?\u300D)|(\u300E.*?\u300F)|(\uFF02.*?\uFF02)/gim,
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
        mes = mes.replace(/\ufffe/g, '"');

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

    if (ch_name && !isUser && !isSystem) {
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
        // Only decoded custom-style elements may become active message CSS.
        // HTML's error recovery accepts malformed tags that the encoder cannot parse.
        FORBID_TAGS: [...(sanitizerOverrides?.FORBID_TAGS || []), 'style'],
    };
    mes = encodeStyleTags(mes);
    mes = state.DOMPurify.sanitize(mes, config);
    const allowExternalMedia = currentCharacterAllowsExternalMedia();
    const animationScope = getMessageStyleScope(messageId, isReasoning);
    const animationNames = new Map();
    mes = decodeStyleTags(mes, { prefix: `.mes_text [data-message-style-scope="${animationScope}"] `, messagePolicy: true, allowExternalMedia, animationScope, animationNames });
    mes = filterMessageInlineStyles(mes, allowExternalMedia, animationNames);
    mes = `<div data-message-style-scope="${animationScope}">${mes}</div>`;

    return mes;
}

/**
 * Re-renders a message block with updated content.
 * @param {number} messageId Message ID
 * @param {object} message Message object
 * @param {object} [options={}] Optional arguments
 * @param {boolean} [options.rerenderMessage=true] Retained for compatibility; React renders from the model.
 */
export function updateMessageBlock(messageId, message, _options = {}) {
    if (message && state.chat[messageId] !== message) {
        state.chat[messageId] = message;
    }
    void mountReactMainChatMessageListPanel();
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
    const value = mes?.extra?.media_display || MEDIA_DISPLAY.LIST;
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
 * @param {HTMLElement|null} messageElement Message element
 * @param {string} [scrollBehavior] Scroll behavior when adjusting scroll position
 */
export function appendMediaToMessage(mes, _messageElement, _scrollBehavior = SCROLL_BEHAVIOR.ADJUST) {
    ensureMessageMediaIsArray(mes);
    scheduleMainChatMessageListPanelRefresh();
}

export function addCopyToCodeBlocks(messageElement) {
    const skipFrontend = state.power_user?.frontend_frames?.skip_highlight !== false;
    const codeBlocks = messageElement?.querySelectorAll('pre code') ?? [];
    for (const codeElement of codeBlocks) {
        if (skipFrontend && isFrontendContent(codeElement.closest('pre')?.textContent)) {
            continue;
        }
        if (codeElement.querySelector?.('.code-copy')) continue;
        const copyButton = document.createElement('i');
        copyButton.classList.add('fa-solid', 'fa-copy', 'code-copy', 'interactable');
        copyButton.title = 'Copy code';
        highlightCodeBlock(state.hljs, codeElement, copyButton);
        codeElement.appendChild(copyButton);
        copyButton.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        copyButton.addEventListener('pointerup', async function () {
            const text = codeElement.textContent;
            await copyText(text);
            toastr.info(t`Copied!`, '', { timeOut: 2000 });
        });
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
 * @param {number} [options.insertAfter=null] Message ID to insert the new message after
 * @param {boolean} [options.scroll=true] Whether to scroll to the new message
 * @param {number} [options.insertBefore=null] Message ID to insert the new message before
 * @param {number} [options.forceId=null] Force the message ID
 * @returns {HTMLElement|undefined} The message element, or undefined when React owns rendering
 */
export function addOneMessage(_mes, { insertAfter = null, scroll = true, insertBefore = null, forceId: _forceId = null } = {}) {
    void mountReactMainChatMessageListPanel();
    if (!insertAfter && !insertBefore && scroll) {
        scrollChatToBottom({ waitForFrame: true });
    }
}

/** Compatibility adapter: React owns the message row. */
export function updateMessageElement(_mes, { messageElement } = {}) {
    scheduleMainChatMessageListPanelRefresh();
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
    const doScroll = () => {
        const element = state.chatElement;
        element.scrollTop = element.scrollHeight;
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
 * @param {boolean} [options.displayIncompleteSentences] Whether to keep incomplete sentences at the end.
 * @param {array} [options.stoppingStrings] Array of stopping strings.
 * @param {boolean} [options.trimNames] Whether to allow trimming "{{char}}:" or "{{user}}:" from the beginning.
 * @param {boolean} [options.trimWrongNames] Whether to allow deleting responses prefixed by the incorrect name
 *
 * @returns {string} The formatted message
 */
export function cleanUpMessage({ getMessage, displayIncompleteSentences: _displayIncompleteSentences = false, stoppingStrings = null, trimNames = true, trimWrongNames = true } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('cleanUpMessage called with positional arguments. Please use an object instead.');
        [getMessage, _displayIncompleteSentences, stoppingStrings, trimNames, trimWrongNames] = arguments;
    }

    if (!getMessage) {
        return '';
    }

    // Allow for caching of stopping strings. getStoppingStrings is an expensive function, especially with macros
    // enabled, so for streaming, we call it once and then pass it into each cleanUpMessage call.
    if (!stoppingStrings) {
        stoppingStrings = getStoppingStrings(state.main_api);
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
    getMessage = getRegexedString(getMessage, state.regex_placement.AI_OUTPUT);

    // trailing invisible whitespace before every newlines, on a multiline string
    // "trailing whitespace on newlines       \nevery line of the string    \n?sample text" ->
    // "trailing whitespace on newlines\nevery line of the string\nsample text"
    getMessage = getMessage.replace(/[^\S\r\n]+$/gm, '');

    if (trimWrongNames) {
        // Delete the entire response if it starts with "{{user}}:"
        // Also delete any trailing text that starts with the wrong name.
        // This only occurs if the corresponding "power_user.allow_nameX_display" is false.

        let wrongName = state.name1;

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
    const name2Escaped = escapeRegex(state.name2);
    getMessage = getMessage.replace(new RegExp(`(^|\n)${name2Escaped}:\\s*`, 'g'), '$1');

    if (trimNames) {
        // Trim "{{char}}:" from the beginning.
        // Only applied when the corresponding "power_user.allow_nameX_display" is false.
        const nameToTrim2 = state.name2;

        if (nameToTrim2 && getMessage.startsWith(nameToTrim2 + ':')) {
            getMessage = getMessage.replace(nameToTrim2 + ':', '');
            getMessage = getMessage.trimStart();
        }
    }

    if (!state.PromptReasoning.getLatestPrefix()) {
        getMessage = getMessage.trim();
    }

    return getMessage;
}

/**
 * Adds an image to the message.
 * @param {object} message Message object
 * @param {object} sources Image sources
 * @param {string[]} [sources.imageUrls] Image URLs
 * @param {() => boolean} [sources.ownsRun] Live generation ownership, if applicable.
 *
 * @returns {Promise<void>}
 */
export async function processImageAttachment(message, { imageUrls, ownsRun = () => true }) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return;
    }

    for (const [index, imageUrl] of imageUrls.filter(onlyUnique).entries()) {
        if (!ownsRun()) return;
        if (!imageUrl) {
            continue;
        }

        let url = imageUrl;
        if (isDataURL(url)) {
            const fileName = `inline_image_${Date.now().toString()}_${index}`;
            const [mime, base64] = /^data:(.*?);base64,(.*)$/.exec(imageUrl).slice(1);
            url = await saveBase64AsFile(base64, message.name, fileName, mime.split('/')[1]);
        }
        if (!ownsRun()) return;
        saveImageToMessage({ image: url, inline: true }, message);
    }
}

export async function replaceGenerationRecoveryMessage(messageId, { type, getMessage, title = '', reasoning = '', imageUrls = [], reasoningSignature = null, ownsRun = () => true, render }) {
    const targetChat = state.chat;
    const message = targetChat[messageId];
    if (typeof messageId !== 'number' || messageId < 0 || !message || message.is_user || message.is_system) return null;
    const isCurrent = () => ownsRun() && state.chat === targetChat && targetChat[messageId] === message;
    if (!isCurrent()) return null;
    const staged = {
        ...message,
        title,
        mes: getMessage,
        gen_started: state.generation_started,
        gen_finished: new Date(),
        send_date: getMessageTimeStamp(),
        extra: {
            ...message.extra,
            ...(Array.isArray(message.extra?.media) ? { media: [...message.extra.media] } : {}),
            api: getGeneratingApi(),
            model: getGeneratingModel(),
            reasoning: String(reasoning ?? ''),
            reasoning_duration: null,
            reasoning_signature: reasoningSignature,
        },
    };
    await processImageAttachment(staged, { imageUrls, ownsRun: isCurrent });
    if (!isCurrent()) return null;
    Object.assign(message, staged);
    render(message, messageId);
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, type);
    if (!isCurrent()) return null;
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, type);
    return { type, getMessage };
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
 * @property {string} [reasoning] Message reasoning
 * @property {string[]} [imageUrls] Links to images
 * @property {string?} [reasoningSignature] Encrypted signature of the reasoning text
 * @property {() => boolean} [ownsRun] Live generation ownership, if applicable
 * @property {(message: object) => void} [onMessageCreated] Receives the exact committed message, if any
 *
 * @typedef {object} SaveReplyResult
 * @property {string} type Type of generation
 * @property {string} getMessage Generated message
 */
export async function saveReply({ type, getMessage, fromStreaming = false, title = '', reasoning = '', imageUrls = [], reasoningSignature = null, ownsRun = () => true, onMessageCreated }) {
    // Backward compatibility
    if (arguments.length > 1 && typeof arguments[0] !== 'object') {
        console.trace('saveReply called with positional arguments. Please use an object instead.');
        [type, getMessage, fromStreaming, title, reasoning, imageUrls, reasoningSignature] = arguments;
    }

    if (!reasoning) {
        reasoning = '';
    }

    const generationFinished = new Date();
    console.debug('entering chat update routine');
    const targetChat = state.chat;
    const isCurrent = () => state.chat === targetChat && ownsRun();
    if (!isCurrent()) return { type, getMessage };
    const newMessage = {};
    newMessage.extra = { id: uuidv4() };
    newMessage.name = state.name2;
    newMessage.is_user = false;
    newMessage.send_date = getMessageTimeStamp();
    newMessage.extra.api = getGeneratingApi();
    newMessage.extra.model = getGeneratingModel();
    newMessage.extra.reasoning = reasoning;
    newMessage.extra.reasoning_duration = null;
    newMessage.extra.reasoning_signature = reasoningSignature;
    getMessage = getMessage.trim();
    newMessage.mes = getMessage;
    newMessage.title = title;
    newMessage.gen_started = state.generation_started;
    newMessage.gen_finished = generationFinished;


    await processImageAttachment(newMessage, { imageUrls, ownsRun: isCurrent });
    if (!isCurrent()) return { type, getMessage };
    targetChat.push(newMessage);
    const chat_id = targetChat.length - 1;
    onMessageCreated?.(newMessage);

    if (!fromStreaming) await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
    if (!isCurrent() || targetChat[chat_id] !== newMessage) return { type, getMessage };
    addOneMessage(newMessage);
    if (!fromStreaming) await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);

    return { type, getMessage };
}

