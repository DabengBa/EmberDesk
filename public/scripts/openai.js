/*
* CODE FOR OPENAI SUPPORT
* By CncAnon (@CncAnon1)
* https://github.com/CncAnon1/TavernAITurbo
*/
import { DOMPurify } from '../lib.js';

import {
    abortStatusCheck,
    extension_prompt_roles,
    extension_prompt_types,
    getExtensionPrompt,
    getExtensionPromptMaxDepth,
    getMediaDisplay,
    getMediaIndex,
    is_send_press,
    main_api,
    name1,
    name2,
    displayOnlineStatus,
    saveSettingsDebounced,
    setOnlineStatus,
    substituteParams,
    substituteParamsExtended,
    system_message_types,
} from '../script.js';
import { eventSource, event_types } from './events.js';
import { getRequestHeaders } from './request-context.js';

import {
    chatCompletionDefaultPrompts,
    INJECTION_POSITION,
    Prompt,
    PromptManager,
    promptManagerDefaultPromptOrders,
} from './PromptManager.js';

import { forceCharacterEditorTokenize, getCustomStoppingStrings } from './power-user.js';
import { SECRET_KEYS, secret_state, writeSecret, deleteSecret, resolveSecretKey } from './secrets.js';

import { getEventSourceStream } from './sse-stream.js';
import {
    createThumbnail,
    delay,
    download,
    getAudioDurationFromDataURL,
    getBase64Async,
    getFileText,
    getImageSizeFromDataURL,
    getVideoDurationFromDataURL,
    isDataURL,
    isValidUrl,
    resetScrollHeight,
    stringFormat,
} from './utils.js';
import { countTokensOpenAIAsync } from './tokenizers.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { renderTemplateAsync } from './templates.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { t } from './i18n.js';
import { ToolManager } from './tool-calling.js';
import { IGNORE_SYMBOL, MEDIA_DISPLAY, MEDIA_TYPE } from './constants.js';
import { getFallbackOpenAIModel } from './chat-generation-auto-recovery.js';

import {
    getChatCompletionModelFromSettings,
    isAudioInliningSupportedForSettings,
    isImageInliningSupportedForSettings,
    isVideoInliningSupportedForSettings,
    resolveReasoningEffort,
    resolveVerbosity,
} from './openai-provider-capabilities.js';

function syncSegmentedFromSelect(selectId) {
    const value = $('#' + selectId).val();
    $(`.segmented-control[data-sync-select="${selectId}"] input[value="${value}"]`).prop('checked', true);
}

export {
    openai_messages_count,
    oai_settings,
    loadOpenAISettings,
    setOpenAIMessages,
    setOpenAIMessageExamples,
    setupChatCompletionPromptManager,
    sendOpenAIRequest,
    TokenHandler,
    IdentifierNotFoundError,
    Message,
    MessageCollection,
};

let openai_messages_count = 0;

const default_impersonation_prompt = '[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don\'t write as {{char}} or system. Don\'t describe actions of {{char}}.]';
const default_wi_format = '{0}';
const default_description_format = '{0}';
const default_new_chat_prompt = '[Start a new Chat]';
const default_new_example_chat_prompt = '[Example Chat]';
const default_continue_nudge_prompt = '[Continue your last message without repeating its original content.]';
const API_TEST_REQUEST_TIMEOUT_MS = 15000;

const max_64k = 65535;
const openai_max_stop_strings = 4;


export let model_list = [];

export const chat_completion_sources = {
    OPENAI: 'openai',
};

const character_names_behavior = {
    NONE: -1,
    DEFAULT: 0,
    COMPLETION: 1,
    CONTENT: 2,
};

const continue_postfix_types = {
    NONE: '',
    SPACE: ' ',
    NEWLINE: '\n',
    DOUBLE_NEWLINE: '\n\n',
};

export const reasoning_effort_types = {
    auto: 'auto',
    low: 'low',
    medium: 'medium',
    high: 'high',
    min: 'min',
    max: 'max',
};

function normalizeReasoningEffort(value) {
    switch (value) {
        case reasoning_effort_types.auto:
        case reasoning_effort_types.low:
        case reasoning_effort_types.medium:
        case reasoning_effort_types.high:
            return value;
        case reasoning_effort_types.min:
        case reasoning_effort_types.max:
        default:
            return reasoning_effort_types.high;
    }
}

export const verbosity_levels = {
    auto: 'auto',
    low: 'low',
    medium: 'medium',
    high: 'high',
};

export const tool_reasoning_modes = {
    DISABLED: 'disabled',
    SINCE_LAST_USER: 'since_last_user',
    ACTIVE_CHAIN: 'active_chain',
};

// Providers that support interleaved reasoning forwarding in tool-call chains.
const interleaved_reasoning_providers = [
    chat_completion_sources.OPENAI,
];

export const ZAI_ENDPOINT = {
    COMMON: 'common',
    CODING: 'coding',
};

export const SILICONFLOW_ENDPOINT = {
    GLOBAL: 'global',
    CN: 'cn',
};

export const MINIMAX_ENDPOINT = {
    GLOBAL: 'global',
    CN: 'cn',
};

const sensitiveFields = [
    'custom_url',
];

/**
 * preset_name -> [selector, setting_name, is_checkbox, is_connection]
 * @type {Record<string, [string, string, boolean, boolean]>}
 */
export const settingsToUpdate = {
    // Provider-owned fields (source/model/url/fallback) are
    // edited by the React Settings surface; their selectors stay NULL so preset
    // save/load keeps working without the retired API Connections drawer DOM.
    chat_completion_source: ['#NULL_SELECTOR', 'chat_completion_source', false, true],
    temperature: ['#temp_openai', 'temp_openai', false, false],
    frequency_penalty: ['#freq_pen_openai', 'freq_pen_openai', false, false],
    presence_penalty: ['#pres_pen_openai', 'pres_pen_openai', false, false],
    top_p: ['#top_p_openai', 'top_p_openai', false, false],
    openai_model: ['#NULL_SELECTOR', 'openai_model', false, true],
    tool_reasoning_mode: ['#tool_reasoning_mode', 'tool_reasoning_mode', false, false],
    custom_url: ['#NULL_SELECTOR', 'custom_url', false, true],
    openai_max_context: ['#openai_max_context', 'openai_max_context', false, false],
    openai_max_tokens: ['#openai_max_tokens', 'openai_max_tokens', false, false],
    names_behavior: ['#names_behavior', 'names_behavior', false, false],
    send_if_empty: ['#send_if_empty_textarea', 'send_if_empty', false, false],
    impersonation_prompt: ['#impersonation_prompt_textarea', 'impersonation_prompt', false, false],
    new_chat_prompt: ['#newchat_prompt_textarea', 'new_chat_prompt', false, false],
    new_example_chat_prompt: ['#newexamplechat_prompt_textarea', 'new_example_chat_prompt', false, false],
    continue_nudge_prompt: ['#continue_nudge_prompt_textarea', 'continue_nudge_prompt', false, false],
    wi_format: ['#wi_format_textarea', 'wi_format', false, false],
    description_format: ['#description_format_textarea', 'description_format', false, false],
    stream_openai: ['#stream_toggle', 'stream_openai', true, false],
    prompts: ['', 'prompts', false, false],
    prompt_order: ['', 'prompt_order', false, false],
    squash_system_messages: ['#squash_system_messages', 'squash_system_messages', true, false],
    media_inlining: ['#openai_media_inlining', 'media_inlining', true, false],
    inline_image_quality: ['#openai_inline_image_quality', 'inline_image_quality', false, false],
    continue_prefill: ['#continue_prefill', 'continue_prefill', true, false],
    continue_postfix: ['#continue_postfix', 'continue_postfix', false, false],
    show_thoughts: ['#openai_show_thoughts', 'show_thoughts', true, false],
    reasoning_effort: ['#openai_reasoning_effort', 'reasoning_effort', false, false],
    verbosity: ['#openai_verbosity', 'verbosity', false, false],
    n: ['#n_openai', 'n', false, false],
    fallback_provider_model: ['#NULL_SELECTOR', 'fallback_provider_model', false, false],
    extensions: ['#NULL_SELECTOR', 'extensions', false, false],
};

const default_settings = {
    preset_settings_openai: 'Default',
    temp_openai: 1.0,
    freq_pen_openai: 0,
    pres_pen_openai: 0,
    top_p_openai: 1.0,
    stream_openai: false,
    openai_max_context: max_64k,
    openai_max_tokens: 8000,
    ...chatCompletionDefaultPrompts,
    ...promptManagerDefaultPromptOrders,
    send_if_empty: '',
    impersonation_prompt: default_impersonation_prompt,
    new_chat_prompt: default_new_chat_prompt,
    new_example_chat_prompt: default_new_example_chat_prompt,
    continue_nudge_prompt: default_continue_nudge_prompt,
    wi_format: default_wi_format,
    description_format: default_description_format,
    openai_model: 'gpt-4-turbo',
    custom_model: '',
    custom_url: '',
    tool_reasoning_mode: tool_reasoning_modes.DISABLED,
    chat_completion_source: chat_completion_sources.OPENAI,
    squash_system_messages: false,
    media_inlining: true,
    inline_image_quality: 'auto',
    continue_prefill: false,
    names_behavior: character_names_behavior.DEFAULT,
    continue_postfix: continue_postfix_types.SPACE,
    show_thoughts: true,
    reasoning_effort: reasoning_effort_types.high,
    verbosity: verbosity_levels.auto,
    n: 1,
    fallback_provider_model: '',
    extensions: {},
};

const oai_settings = structuredClone(default_settings);
let _presetChangeGuard = false;

export let openai_setting_names;
export let openai_settings;

/** @type {import('./PromptManager.js').PromptManager} */
export let promptManager = null;

/**
 * Formats chat messages into chat completion messages.
 * @param {ChatMessage[]} chat - Array containing all messages.
 * @returns {object[]} - Array containing all messages formatted for chat completion.
 */
function setOpenAIMessages(chat) {
    let j = 0;
    // clean openai msgs
    const messages = [];
    // Get current API and model for thought signature validation
    const currentApi = oai_settings.chat_completion_source;
    const currentModel = getChatCompletionModel();

    for (let i = chat.length - 1; i >= 0; i--) {
        let role = chat[j].is_user ? 'user' : 'assistant';
        let content = chat[j].mes;

        // If this symbol flag is set, completely ignore the message.
        // This can be used to hide messages without affecting the number of messages in the chat.
        if (chat[j].extra?.[IGNORE_SYMBOL]) {
            j++;
            continue;
        }

        // 100% legal way to send a message as system
        if (chat[j].extra?.type === system_message_types.NARRATOR) {
            role = 'system';
        }

        // for sendas command - prepend a character's name
        switch (oai_settings.names_behavior) {
            case character_names_behavior.NONE:
                break;
            case character_names_behavior.DEFAULT:
                if (chat[j].force_avatar && chat[j].name !== name1 && chat[j].extra?.type !== system_message_types.NARRATOR) {
                    content = `${chat[j].name}: ${content}`;
                }
                break;
            case character_names_behavior.CONTENT:
                if (chat[j].extra?.type !== system_message_types.NARRATOR) {
                    content = `${chat[j].name}: ${content}`;
                }
                break;
            case character_names_behavior.COMPLETION:
                break;
            default:
                break;
        }

        // remove caret return (waste of tokens)
        content = content.replace(/\r/gm, '');

        const name = chat[j].name;
        const media = chat[j]?.extra?.media;
        const mediaDisplay = getMediaDisplay(chat[j]);
        const mediaIndex = getMediaIndex(chat[j]);
        const invocations = chat[j]?.extra?.tool_invocations?.slice();

        // Only send thought signatures if they were generated by the same API and model
        const originApi = chat[j]?.extra?.api;
        const originModel = chat[j]?.extra?.model;
        const isSameModel = originApi === currentApi && originModel === currentModel;
        const signature = isSameModel ? chat[j]?.extra?.reasoning_signature : null;
        const reasoning = isSameModel ? String(chat[j]?.extra?.reasoning ?? '') : '';

        // Remove reasoning metadata from invocations if the API/model don't match
        if (Array.isArray(invocations) && invocations.length > 0) {
            invocations.forEach((invocation, index) => {
                if (!isSameModel && (invocation.signature || invocation.reasoning)) {
                    const cloneInvocation = structuredClone(invocation);
                    delete cloneInvocation.signature;
                    delete cloneInvocation.reasoning;
                    invocations[index] = cloneInvocation;
                }
            });
        }

        messages[i] = { 'role': role, 'content': content, name: name, 'media': media, 'mediaDisplay': mediaDisplay, 'mediaIndex': mediaIndex, 'invocations': invocations, 'signature': signature, 'reasoning': reasoning };
        j++;
    }

    return messages;
}

/**
 * Formats chat examples into chat completion messages.
 * @param {string[]} mesExamplesArray - Array containing all examples.
 * @returns {object[]} - Array containing all examples formatted for chat completion.
 */
function setOpenAIMessageExamples(mesExamplesArray) {
    // get a nice array of all blocks of all example messages = array of arrays (important!)
    const examples = [];
    for (let item of mesExamplesArray) {
        // remove <START> {Example Dialogue:} and replace \r\n with just \n
        let replaced = item.replace(/<START>/i, '{Example Dialogue:}').replace(/\r/gm, '');
        let parsed = parseExampleIntoIndividual(replaced);
        // add to the example message blocks array
        examples.push(parsed);
    }
    return examples;
}

/**
 * One-time setup for prompt manager module.
 *
 * @param openAiSettings
 * @returns {PromptManager|null}
 */
function setupChatCompletionPromptManager(openAiSettings) {
    // Do not set up prompt manager more than once
    if (promptManager) {
        return promptManager;
    }

    promptManager = new PromptManager();

    const configuration = {
        promptOrder: {
            strategy: 'global',
            dummyId: 100001,
        },
    };

    promptManager.saveServiceSettings = () => {
        saveSettingsDebounced();
        return new Promise((resolve) => eventSource.once(event_types.SETTINGS_UPDATED, resolve));
    };

    promptManager.tokenHandler = tokenHandler;

    promptManager.init(configuration, openAiSettings);

    return promptManager;
}

/**
 * Parses the example messages into individual messages.
 * @param {string} messageExampleString - The string containing the example messages
 * @returns {Message[]} Array of message objects
 */
export function parseExampleIntoIndividual(messageExampleString) {
    let result = []; // array of msgs
    let tmp = messageExampleString.split('\n');
    let cur_msg_lines = [];
    let in_user = false;
    let in_bot = false;

    // DRY my cock and balls :)
    function add_msg(name, role, system_name) {
        // join different newlines (we split them by \n and join by \n)
        // remove char name
        // strip to remove extra spaces
        const parsed_msg = cur_msg_lines.join('\n').replace(name + ':', '').trim();

        result.push({ 'role': role, 'content': parsed_msg, 'name': system_name });
        cur_msg_lines = [];
    }
    // skip first line as it'll always be "This is how {bot name} should talk"
    for (let i = 1; i < tmp.length; i++) {
        let cur_str = tmp[i];
        // if it's the user message, switch into user mode and out of bot mode
        // yes, repeated code, but I don't care
        if (cur_str.startsWith(name1 + ':')) {
            in_user = true;
            // we were in the bot mode previously, add the message
            if (in_bot) {
                add_msg(name2, 'system', 'example_assistant');
            }
            in_bot = false;
        } else if (cur_str.startsWith(name2 + ':')) {
            in_bot = true;
            // we were in the user mode previously, add the message
            if (in_user) {
                add_msg(name1, 'system', 'example_user');
            }
            in_user = false;
        }
        // push the current line into the current message array only after checking for presence of user/bot
        cur_msg_lines.push(cur_str);
    }
    // Special case for last message in a block because we don't have a new message to trigger the switch
    if (in_user) {
        add_msg(name1, 'system', 'example_user');
    } else if (in_bot) {
        add_msg(name2, 'system', 'example_assistant');
    }
    return result;
}

export function formatWorldInfo(value, { wiFormat = null } = {}) {
    if (!value) {
        return '';
    }

    const format = wiFormat ?? oai_settings.wi_format;

    if (!format.trim()) {
        return value;
    }

    return stringFormat(format, value);
}

/**
 * This function populates the injections in the conversation.
 *
 * @param {Prompt[]} prompts - Array containing injection prompts.
 * @param {Object[]} messages - Array containing all messages.
 * @returns {Promise<Object[]>} - Array containing all messages with injections.
 */
async function populationInjectionPrompts(prompts, messages) {
    let totalInsertedMessages = 0;

    const roleTypes = {
        'system': extension_prompt_roles.SYSTEM,
        'user': extension_prompt_roles.USER,
        'assistant': extension_prompt_roles.ASSISTANT,
    };

    const maxDepth = getExtensionPromptMaxDepth();
    for (let i = 0; i <= maxDepth; i++) {
        // Get prompts for current depth
        const depthPrompts = prompts.filter(prompt => prompt.injection_depth === i && prompt.content);

        const roleMessages = [];
        const separator = '\n';
        const wrap = false;

        // Group prompts by priority
        const extensionPromptsOrder = '100';
        const orderGroups = {
            [extensionPromptsOrder]: [],
        };
        for (const prompt of depthPrompts) {
            const order = prompt.injection_order ?? 100;
            if (!orderGroups[order]) {
                orderGroups[order] = [];
            }
            orderGroups[order].push(prompt);
        }

        // Process each order group in order (b - a = low to high ; a - b = high to low)
        const orders = Object.keys(orderGroups).sort((a, b) => +b - +a);
        for (const order of orders) {
            const orderPrompts = orderGroups[order];

            // Order of priority for roles (most important go lower)
            const roles = ['system', 'user', 'assistant'];
            for (const role of roles) {
                const rolePrompts = orderPrompts
                    .filter(prompt => prompt.role === role)
                    .map(x => x.content)
                    .join(separator);

                // Get extension prompt
                const extensionPrompt = order === extensionPromptsOrder
                    ? await getExtensionPrompt(extension_prompt_types.IN_CHAT, i, separator, roleTypes[role], wrap)
                    : '';
                const jointPrompt = [rolePrompts, extensionPrompt].filter(x => x).map(x => x.trim()).join(separator);

                if (jointPrompt && jointPrompt.length) {
                    roleMessages.push({ 'role': role, 'content': jointPrompt, injected: true });
                }
            }
        }

        if (roleMessages.length) {
            const injectIdx = i + totalInsertedMessages;
            messages.splice(injectIdx, 0, ...roleMessages);
            totalInsertedMessages += roleMessages.length;
        }
    }

    messages = messages.reverse();
    return messages;
}

/**
 * Populates the chat history of the conversation.
 * @param {object[]} messages - Array containing all messages.
 * @param {import('./PromptManager').PromptCollection} prompts - Map object containing all prompts where the key is the prompt identifier and the value is the prompt object.
 * @param {ChatCompletion} chatCompletion - An instance of ChatCompletion class that will be populated with the prompts.
 * @param type
 * @param cyclePrompt
 */
async function populateChatHistory(messages, prompts, chatCompletion, type = null, cyclePrompt = null) {
    if (!prompts.has('chatHistory')) {
        return;
    }

    // The collection may already exist: extension prompts anchor into it before
    // the chat history is populated. Never overwrite it.
    if (!chatCompletion.has('chatHistory')) {
        chatCompletion.add(new MessageCollection('chatHistory'), prompts.index('chatHistory'));
    }

    const newChatMessage = await Message.createAsync('system', substituteParams(oai_settings.new_chat_prompt), 'newMainChat');
    chatCompletion.reserveBudget(newChatMessage);

    // Reserve budget for continue nudge
    let continueMessageCollection = null;
    if (type === 'continue' && cyclePrompt && !oai_settings.continue_prefill) {
        const promptObject = {
            identifier: 'continueNudge',
            role: 'system',
            content: substituteParamsExtended(oai_settings.continue_nudge_prompt, { lastChatMessage: String(cyclePrompt).trim() }),
            system_prompt: true,
        };
        continueMessageCollection = new MessageCollection('continueNudge');
        const continueMessageIndex = messages.findLastIndex(x => !x.injected);
        if (continueMessageIndex >= 0) {
            const continueMessage = messages.splice(continueMessageIndex, 1)[0];
            const prompt = new Prompt(continueMessage);
            const chatMessage = await Message.fromPromptAsync(promptManager.preparePrompt(prompt));
            continueMessageCollection.add(chatMessage);
        }
        const continueNudgePrompt = new Prompt(promptObject);
        const preparedNudgePrompt = promptManager.preparePrompt(continueNudgePrompt);
        const continueNudgeMessage = await Message.fromPromptAsync(preparedNudgePrompt);
        continueMessageCollection.add(continueNudgeMessage);
        chatCompletion.reserveBudget(continueMessageCollection);
    }

    const lastChatPrompt = messages[messages.length - 1];
    const message = await Message.createAsync('user', oai_settings.send_if_empty, 'emptyUserMessageReplacement');
    if (lastChatPrompt && lastChatPrompt.role === 'assistant' && oai_settings.send_if_empty && chatCompletion.canAfford(message)) {
        chatCompletion.insert(message, 'chatHistory');
    }

    const imageInlining = isImageInliningSupported();
    const videoInlining = isVideoInliningSupported();
    const audioInlining = isAudioInliningSupported();
    const canUseTools = ToolManager.isToolCallingSupported();
    const includeSignature = isReasoningSignatureSupported();
    const isToolReasoningProvider = interleaved_reasoning_providers.includes(oai_settings.chat_completion_source);
    const toolReasoningMode = isToolReasoningProvider
        ? getEffectiveToolReasoningMode()
        : tool_reasoning_modes.DISABLED;
    const includeToolReasoning = toolReasoningMode !== tool_reasoning_modes.DISABLED;
    const lastUserIdx = messages.findLastIndex(x => x.role === 'user');

    // Insert chat messages as long as there is budget available
    const chatPool = [...messages].reverse();
    for (let index = 0; index < chatPool.length; index++) {
        const chatPrompt = chatPool[index];

        // We do not want to mutate the prompt
        const prompt = new Prompt(chatPrompt);
        prompt.identifier = `chatHistory-${messages.length - index}`;
        const chatMessage = await Message.fromPromptAsync(promptManager.preparePrompt(prompt));

        if (promptManager.serviceSettings.names_behavior === character_names_behavior.COMPLETION && prompt.name) {
            const messageName = promptManager.isValidName(prompt.name) ? prompt.name : promptManager.sanitizeName(prompt.name);
            await chatMessage.setName(messageName);
        }

        /**
         * Inline a media attachment into the chat message.
         * @param {MediaAttachment} media - The media attachment to inline.
         */
        async function inlineMediaAttachment(media) {
            if (!media || !media.url) {
                return;
            }
            if (!media.type) {
                media.type = MEDIA_TYPE.IMAGE;
            }
            if (imageInlining && media.type === MEDIA_TYPE.IMAGE) {
                await chatMessage.addImage(media.url);
            }
            if (videoInlining && media.type === MEDIA_TYPE.VIDEO) {
                await chatMessage.addVideo(media.url);
            }
            if (audioInlining && media.type === MEDIA_TYPE.AUDIO) {
                await chatMessage.addAudio(media.url);
            }
        }

        if (Array.isArray(chatPrompt.media) && chatPrompt.media.length) {
            if (chatPrompt.mediaDisplay === MEDIA_DISPLAY.LIST) {
                for (const media of chatPrompt.media) {
                    await inlineMediaAttachment(media);
                }
            }
            if (chatPrompt.mediaDisplay === MEDIA_DISPLAY.GALLERY) {
                const media = chatPrompt.media[chatPrompt.mediaIndex];
                await inlineMediaAttachment(media);
            }
        }

        if (canUseTools && Array.isArray(chatPrompt.invocations)) {
            const promptIdx = messages.indexOf(chatPrompt);
            const reasoningIsEligible = toolReasoningMode !== tool_reasoning_modes.DISABLED
                && promptIdx > lastUserIdx;
            let previousAssistantReasoning = '';
            if (reasoningIsEligible) {
                if (toolReasoningMode === tool_reasoning_modes.ACTIVE_CHAIN) {
                    // Strict chain mode: skip tool/tool-call messages, then use only the first assistant text boundary.
                    for (let idx = promptIdx - 1; idx > lastUserIdx; idx--) {
                        const candidate = messages[idx];
                        if (candidate?.role === 'tool') {
                            continue;
                        }
                        if (candidate?.role === 'assistant' && Array.isArray(candidate.invocations)) {
                            continue;
                        }
                        const hasAssistantText = candidate?.role === 'assistant'
                            && !Array.isArray(candidate.invocations)
                            && typeof candidate.content === 'string'
                            && candidate.content.trim().length > 0;
                        if (hasAssistantText) {
                            previousAssistantReasoning = String(candidate.reasoning ?? '');
                        }
                        break;
                    }
                } else if (toolReasoningMode === tool_reasoning_modes.SINCE_LAST_USER) {
                    // Broad mode: use the latest assistant text reasoning anywhere since the last user.
                    for (let idx = promptIdx - 1; idx > lastUserIdx; idx--) {
                        const candidate = messages[idx];
                        const hasAssistantText = candidate?.role === 'assistant'
                            && !Array.isArray(candidate.invocations)
                            && typeof candidate.content === 'string'
                            && candidate.content.trim().length > 0;
                        if (!hasAssistantText) {
                            continue;
                        }
                        const candidateReasoning = String(candidate.reasoning ?? '');
                        if (candidateReasoning) {
                            previousAssistantReasoning = candidateReasoning;
                            break;
                        }
                    }
                }
            }
            /** @type {import('./tool-calling.js').ToolInvocation[]} */
            const invocations = chatPrompt.invocations.map(invocation => {
                const clone = structuredClone(invocation);
                if (!reasoningIsEligible) {
                    delete clone.reasoning;
                } else if (previousAssistantReasoning && !clone.reasoning) {
                    // Fall back to adjacent assistant-text reasoning only when the invocation has none of its own.
                    clone.reasoning = previousAssistantReasoning;
                }
                return clone;
            });
            const toolCallMessage = await Message.createAsync(chatMessage.role, undefined, 'toolCall-' + chatMessage.identifier);
            const toolResultMessages = await Promise.all(invocations.slice().reverse().map((invocation) => Message.createAsync('tool', invocation.result || '[No content]', invocation.id)));
            await toolCallMessage.setToolCalls(invocations, includeSignature, includeToolReasoning);
            if (chatCompletion.canAffordAll([toolCallMessage, ...toolResultMessages])) {
                for (const resultMessage of toolResultMessages) {
                    chatCompletion.insertAtStart(resultMessage, 'chatHistory');
                }
                chatCompletion.insertAtStart(toolCallMessage, 'chatHistory');
            } else {
                break;
            }

            continue;
        }

        if (includeSignature && chatPrompt.signature) {
            chatMessage.signature = chatPrompt.signature;
        }

        if (chatCompletion.canAfford(chatMessage)) {
            chatCompletion.insertAtStart(chatMessage, 'chatHistory');
        } else {
            break;
        }
    }

    // Insert and free new chat
    chatCompletion.freeBudget(newChatMessage);
    chatCompletion.insertAtStart(newChatMessage, 'chatHistory');

    // Insert and free continue nudge
    if (type === 'continue' && continueMessageCollection) {
        chatCompletion.freeBudget(continueMessageCollection);
        chatCompletion.add(continueMessageCollection, -1);
    }
}

/**
 * This function populates the dialogue examples in the conversation.
 *
 * @param {import('./PromptManager').PromptCollection} prompts - Map object containing all prompts where the key is the prompt identifier and the value is the prompt object.
 * @param {ChatCompletion} chatCompletion - An instance of ChatCompletion class that will be populated with the prompts.
 * @param {Object[]} messageExamples - Array containing all message examples.
 */
async function populateDialogueExamples(prompts, chatCompletion, messageExamples) {
    if (!prompts.has('dialogueExamples')) {
        return;
    }

    chatCompletion.add(new MessageCollection('dialogueExamples'), prompts.index('dialogueExamples'));
    if (Array.isArray(messageExamples) && messageExamples.length) {
        const newExampleChat = await Message.createAsync('system', substituteParams(oai_settings.new_example_chat_prompt), 'newChat');
        for (const dialogue of messageExamples) {
            const dialogueIndex = messageExamples.indexOf(dialogue);
            const chatMessages = [];

            for (let promptIndex = 0; promptIndex < dialogue.length; promptIndex++) {
                const prompt = dialogue[promptIndex];
                const role = 'system';
                const content = prompt.content || '';
                const identifier = `dialogueExamples ${dialogueIndex}-${promptIndex}`;

                const chatMessage = await Message.createAsync(role, content, identifier);
                await chatMessage.setName(prompt.name);
                chatMessages.push(chatMessage);
            }

            if (!chatCompletion.canAffordAll([newExampleChat, ...chatMessages])) {
                break;
            }

            chatCompletion.insert(newExampleChat, 'dialogueExamples');
            for (const chatMessage of chatMessages) {
                chatCompletion.insert(chatMessage, 'dialogueExamples');
            }
        }
    }
}

/**
 * @param {number} position - Prompt position in the extensions object.
 * @returns {string|false} - The prompt position for prompt collection.
 */
export function getPromptPosition(position) {
    if (position == extension_prompt_types.BEFORE_PROMPT) {
        return 'start';
    }

    if (position == extension_prompt_types.IN_PROMPT) {
        return 'end';
    }

    return false;
}

/**
 * Gets a Chat Completion role based on the prompt role.
 * @param {number} role Role of the prompt.
 * @returns {string} Mapped role.
 */
export function getPromptRole(role) {
    switch (role) {
        case extension_prompt_roles.SYSTEM:
            return 'system';
        case extension_prompt_roles.USER:
            return 'user';
        case extension_prompt_roles.ASSISTANT:
            return 'assistant';
        default:
            return 'system';
    }
}

/**
 * Populate a chat conversation by adding prompts to the conversation and managing system and user prompts.
 *
 * @param {import('./PromptManager.js').PromptCollection} prompts - PromptCollection containing all prompts where the key is the prompt identifier and the value is the prompt object.
 * @param {ChatCompletion} chatCompletion - An instance of ChatCompletion class that will be populated with the prompts.
 * @param {Object} options - An object with optional settings.
 * @param {string} options.bias - A bias to be added in the conversation.
 * @param {string} options.quietPrompt - Instruction prompt for extras
 * @param {string} options.quietImage - Image prompt for extras
 * @param {string} options.type - The type of the chat, can be 'impersonate'.
 * @param {string} options.cyclePrompt - The last prompt in the conversation.
 * @param {object[]} options.messages - Array containing all messages.
 * @param {object[]} options.messageExamples - Array containing all message examples.
 * @returns {Promise<void>}
 */
async function populateChatCompletion(prompts, chatCompletion, { bias, quietPrompt: _quietPrompt, quietImage, type, cyclePrompt, messages, messageExamples }) {
    // Helper function for preparing a prompt, that already exists within the prompt collection, for completion
    const addToChatCompletion = async (source, target = null) => {
        // We need the prompts array to determine a position for the source.
        if (false === prompts.has(source)) return;

        if (promptManager.isPromptDisabledForActiveCharacter(source)) {
            promptManager.log(`Skipping prompt ${source} because it is disabled`);
            return;
        }

        const prompt = prompts.get(source);

        if (prompt.injection_position === INJECTION_POSITION.ABSOLUTE) {
            promptManager.log(`Skipping prompt ${source} because it is an absolute prompt`);
            return;
        }

        const index = target ? prompts.index(target) : prompts.index(source);
        const collection = new MessageCollection(source);
        const message = await Message.fromPromptAsync(prompt);
        collection.add(message);
        chatCompletion.add(collection, index);
    };

    chatCompletion.reserveBudget(3); // every reply is primed with <|start|>assistant<|message|>
    // Character and world information
    await addToChatCompletion('worldInfo');
    await addToChatCompletion('charDescription');

    // Collection of control prompts that will always be positioned last
    chatCompletion.setOverriddenPrompts(prompts.overriddenPrompts);
    const controlPrompts = new MessageCollection('controlPrompts');

    const impersonateMessage = await Message.fromPromptAsync(prompts.get('impersonate')) ?? null;
    if (type === 'impersonate') controlPrompts.add(impersonateMessage);

    // Add quiet prompt to control prompts
    // This should always be last, even in control prompts. Add all further control prompts BEFORE this prompt
    const quietPromptMessage = await Message.fromPromptAsync(prompts.get('quietPrompt')) ?? null;
    if (quietPromptMessage && quietPromptMessage.content) {
        if (isImageInliningSupported() && quietImage) {
            await quietPromptMessage.addImage(quietImage);
        }

        controlPrompts.add(quietPromptMessage);
    }

    chatCompletion.reserveBudget(controlPrompts);

    // Add ordered user prompts
    const userRelativePrompts = prompts.collection
        .filter((prompt) => false === prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE)
        .reduce((acc, prompt) => {
            acc.push(prompt.identifier);
            return acc;
        }, []);
    const absolutePrompts = prompts.collection
        .filter((prompt) => prompt.injection_position === INJECTION_POSITION.ABSOLUTE)
        .reduce((acc, prompt) => {
            acc.push(prompt);
            return acc;
        }, []);

    for (const identifier of userRelativePrompts) {
        await addToChatCompletion(identifier);
    }

    // Bias
    if (bias && bias.trim().length) await addToChatCompletion('bias');

    // 'before' anchors to the top of the ordered prompt block; 'end' anchors
    // just before the chat history (where the retired main prompt used to end).
    // The chatHistory collection is created early so both anchors exist by the
    // time extension prompts are injected.
    const injectAnchored = async (/** @type {Prompt} */ prompt, /** @type {string|number} */ position) => {
        const message = await Message.fromPromptAsync(prompt);
        if (chatCompletion.has('chatHistory')) {
            if (position === 'end') {
                chatCompletion.insertAtStart(message, 'chatHistory');
            } else {
                const firstId = chatCompletion.getMessages().collection.find(c => c.identifier !== 'chatHistory')?.identifier ?? 'chatHistory';
                chatCompletion.insertAtStart(message, firstId);
            }
        } else {
            // Convert the relative prompt to an injection and place it relative to the chat history
            // Keeping prompts in the same order bucket will squash them together during in-chat injection
            const indexOfChatHistory = absolutePrompts.findIndex(p => p.identifier === 'chatHistory');
            if (indexOfChatHistory >= 0) {
                const chatHistory = absolutePrompts[indexOfChatHistory];
                const promptCopy = new Prompt(prompt);
                promptCopy.role = chatHistory.role;
                promptCopy.injection_position = chatHistory.injection_position;
                promptCopy.injection_depth = chatHistory.injection_depth;
                promptCopy.injection_order = chatHistory.injection_order;
                const newIndex = position === 'end' ? indexOfChatHistory : 0;
                absolutePrompts.splice(newIndex, 0, promptCopy);
            }
        }
    };

    // Create the chatHistory collection early so extension prompts can anchor
    // relative to it before populateChatHistory fills it with chat messages.
    if (prompts.has('chatHistory') && !chatCompletion.has('chatHistory')) {
        chatCompletion.add(new MessageCollection('chatHistory'), prompts.index('chatHistory'));
    }

    // Relative extension prompts anchor around the chat history
    for (const prompt of prompts.collection.filter(p => p.extension && p.position)) {
        await injectAnchored(prompt, prompt.position);
    }

    // Pre-allocation of tokens for tool data
    if (ToolManager.canPerformToolCalls(type)) {
        const toolData = {};
        await ToolManager.registerFunctionToolsOpenAI(toolData);
        const toolMessage = [{ role: 'user', content: JSON.stringify(toolData) }];
        const toolTokens = await tokenHandler.countAsync(toolMessage);
        chatCompletion.reserveBudget(toolTokens);
    }

    // Displace the message to be continued from its original position before performing in-chat injections
    if (type === 'continue' && oai_settings.continue_prefill && messages.length) {
        const chatMessage = messages.shift();
        const namesInCompletion = oai_settings.names_behavior === character_names_behavior.COMPLETION;
        const messageContent = chatMessage.content;
        const continueMessage = await Message.createAsync(chatMessage.role, messageContent, 'continuePrefill');
        if (chatMessage.name && namesInCompletion) await continueMessage.setName(promptManager.sanitizeName(chatMessage.name));
        controlPrompts.add(continueMessage);
        chatCompletion.reserveBudget(continueMessage);
    }

    // Add in-chat injections
    messages = await populationInjectionPrompts(absolutePrompts, messages);

    // Dialogue examples slot in after the chat history (example_messages_behavior
    // is fixed to the shipped 'normal' ordering).
    await populateChatHistory(messages, prompts, chatCompletion, type, cyclePrompt);
    await populateDialogueExamples(prompts, chatCompletion, messageExamples);

    chatCompletion.freeBudget(controlPrompts);
    if (controlPrompts.collection.length) chatCompletion.add(controlPrompts);
}

/**
 * Combines system prompts with prompt manager prompts
 *
 * @param {Object} options - An object with optional settings.
 * @param {string} options.name2 - The second name to be used in the messages.
 * @param {string} options.worldInfo - The merged world info block for the prompt.
 * @param {string} options.charDescription - Description of the character.
 * @param {string} options.quietPrompt - The quiet prompt to be used in the conversation.
 * @param {string} options.bias - The bias to be added in the conversation.
 * @param {Object} options.extensionPrompts - An object containing additional prompts.
 * @param {string} options.type - The type of generation that triggered the prompt
 * @returns {Promise<Object>} prompts - The prepared and merged system and user-defined prompts.
 */
async function preparePromptsForChatCompletion({ name2: _name2, worldInfo, charDescription, quietPrompt, bias, extensionPrompts, type }) {
    const impersonationPrompt = oai_settings.impersonation_prompt ? substituteParams(oai_settings.impersonation_prompt) : '';

    // Create entries for system prompts
    const systemPrompts = [
        // Ordered prompts for which a marker should exist
        { role: 'system', content: formatWorldInfo(worldInfo), identifier: 'worldInfo' },
        { role: 'system', content: formatWorldInfo(charDescription, { wiFormat: oai_settings.description_format }), identifier: 'charDescription' },
        // Unordered prompts without marker
        { role: 'system', content: impersonationPrompt, identifier: 'impersonate' },
        { role: 'system', content: quietPrompt, identifier: 'quietPrompt' },
        { role: 'assistant', content: bias, identifier: 'bias' },
    ];

    // Anything that is not a chat-bound injection becomes a prompt entry
    for (const key in extensionPrompts) {
        if (Object.hasOwn(extensionPrompts, key)) {
            const prompt = extensionPrompts[key];
            if (['QUIET_PROMPT', 'DEPTH_PROMPT'].includes(key)) continue;
            if (!extensionPrompts[key].value) continue;
            if (![extension_prompt_types.BEFORE_PROMPT, extension_prompt_types.IN_PROMPT].includes(prompt.position)) continue;

            const hasFilter = typeof prompt.filter === 'function';
            if (hasFilter && !await prompt.filter()) continue;

            systemPrompts.push({
                identifier: key.replace(/\W/g, '_'),
                position: getPromptPosition(prompt.position),
                role: getPromptRole(prompt.role),
                content: prompt.value,
                extension: true,
            });
        }
    }

    // This is the prompt order defined by the user
    const prompts = promptManager.getPromptCollection(type);

    // Merge system prompts with prompt manager prompts
    systemPrompts.forEach(prompt => {
        const collectionPrompt = prompts.get(prompt.identifier);

        // Apply system prompt role/depth overrides if they set in the prompt manager
        if (collectionPrompt) {
            // In-Chat / Relative
            prompt.injection_position = collectionPrompt.injection_position ?? prompt.injection_position;
            // Depth for In-Chat
            prompt.injection_depth = collectionPrompt.injection_depth ?? prompt.injection_depth;
            // Priority for In-Chat
            prompt.injection_order = collectionPrompt.injection_order ?? prompt.injection_order;
            // Role (system, user, assistant)
            prompt.role = collectionPrompt.role ?? prompt.role;
        }

        const newPrompt = promptManager.preparePrompt(prompt);
        const markerIndex = prompts.index(prompt.identifier);

        if (-1 !== markerIndex) prompts.collection[markerIndex] = newPrompt;
        else prompts.add(newPrompt);
    });

    return prompts;
}

/**
 * Take a configuration object and prepares messages for a chat with OpenAI's chat completion API.
 * Handles prompts, prepares chat history, manages token budget, and processes various user settings.
 *
 * @param {Object} content - System prompts provided by SillyTavern
 * @param {string} content.name2 - The second name to be used in the messages.
 * @param {string} content.charDescription - Description of the character.
 * @param {string} content.worldInfo - The merged world info block for the prompt.
 * @param {string} content.bias - The bias to be added in the conversation.
 * @param {string} content.type - The type of the chat, can be 'impersonate'.
 * @param {string} content.quietPrompt - The quiet prompt to be used in the conversation.
 * @param {string} content.quietImage - Image prompt for extras
 * @param {string} content.cyclePrompt - The last prompt used for chat message continuation.
 * @param {object} content.extensionPrompts - An array of additional prompts.
 * @param {object[]} content.messages - An array of messages to be used as chat history.
 * @param {string[]} content.messageExamples - An array of messages to be used as dialogue examples.
 * @param dryRun - Whether this is a live call or not.
 * @returns {Promise<(any[]|boolean)[]>} An array where the first element is the prepared chat and the second element is a boolean flag.
 */
export async function prepareOpenAIMessages({
    name2,
    charDescription,
    worldInfo,
    bias,
    type,
    quietPrompt,
    quietImage,
    extensionPrompts,
    cyclePrompt,
    messages,
    messageExamples,
}, dryRun) {
    // Without a character selected, there is no way to accurately calculate tokens
    if (!promptManager.activeCharacter && dryRun) return [null, false];

    const chatCompletion = new ChatCompletion();


    const userSettings = promptManager.serviceSettings;
    chatCompletion.setTokenBudget(userSettings.openai_max_context, userSettings.openai_max_tokens);

    try {
        // Merge markers and ordered user prompts with system prompts
        const prompts = await preparePromptsForChatCompletion({
            name2,
            worldInfo,
            charDescription,
            quietPrompt,
            bias,
            extensionPrompts,
            type,
        });

        // Fill the chat completion with as much context as the budget allows
        await populateChatCompletion(prompts, chatCompletion, { bias, quietPrompt, quietImage, type, cyclePrompt, messages, messageExamples });
    } catch (error) {
        if (error instanceof TokenBudgetExceededError) {
            toastr.error(t`Mandatory prompts exceed the context size.`);
            chatCompletion.log('Mandatory prompts exceed the context size.');
        } else if (error instanceof InvalidCharacterNameError) {
            toastr.warning(t`An error occurred while counting tokens: Invalid character name`);
            chatCompletion.log('Invalid character name');
        } else {
            toastr.error(t`An unknown error occurred while counting tokens. Further information may be available in console.`);
            chatCompletion.log('----- Unexpected error while preparing prompts -----');
            chatCompletion.log(error);
            chatCompletion.log(error.stack);
            chatCompletion.log('----------------------------------------------------');
        }
    } finally {
        // Pass chat completion to prompt manager for token bookkeeping
        promptManager.setChatCompletion(chatCompletion);

        if (oai_settings.squash_system_messages && dryRun == false) {
            await chatCompletion.squashSystemMessages();
        }
    }

    const chat = chatCompletion.getChat();

    const eventData = { chat, dryRun };
    await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);

    openai_messages_count = chat.filter(x => !x?.tool_calls && ['user', 'assistant', 'tool'].includes(x?.role)).length || 0;

    return [chat, promptManager.tokenHandler.counts];
}

/**
 * Handles errors during streaming requests.
 * @param {Response} response
 * @param {string} decoded - response text or decoded stream data
 * @param {object} [options]
 * @param {boolean?} [options.quiet=false] Suppress toast messages
 */
export function tryParseStreamingError(response, decoded, { quiet = false } = {}) {
    try {
        const data = JSON.parse(decoded);

        if (!data) {
            return;
        }

        checkQuotaError(data, { quiet });
        checkModerationError(data, { quiet });

        // these do not throw correctly (equiv to Error("[object Object]"))
        // if trying to fix "[object Object]" displayed to users, start here

        if (data.error) {
            if (!quiet) toastr.error(data.error.message || response.statusText, 'Chat Completion API');
            throw new Error(data);
        }

        if (data.message) {
            if (!quiet) toastr.error(data.message, 'Chat Completion API');
            throw new Error(data);
        }

        if (data.detail) {
            if (!quiet) toastr.error(data.detail?.error?.message || response.statusText, 'Chat Completion API');
            throw new Error(data);
        }
    } catch {
        // No JSON. Do nothing.
    }
}

/**
 * Checks if the response contains a quota error and displays a popup if it does.
 * @param data
 * @param {object} [options]
 * @param {boolean?} [options.quiet=false] Suppress toast messages
 * @returns {void}
 * @throws {object} - response JSON
 */
function checkQuotaError(data, { quiet = false } = {}) {
    if (!data) {
        return;
    }

    if (data.quota_error) {
        if (!quiet) renderTemplateAsync('quotaError').then((html) => Popup.show.text('Quota Error', html));

        // this does not throw correctly (equiv to Error("[object Object]"))
        // if trying to fix "[object Object]" displayed to users, start here
        throw new Error(data);
    }
}

/**
 * @param {any} data
 * @param {object} [options]
 * @param {boolean?} [options.quiet=false] Suppress toast messages
 */
function checkModerationError(data, { quiet = false } = {}) {
    const moderationError = data?.error?.message?.includes('requires moderation');
    if (moderationError && !quiet) {
        const moderationReason = `Reasons: ${data?.error?.metadata?.reasons?.join(', ') ?? '(N/A)'}`;
        const flaggedText = data?.error?.metadata?.flagged_input ?? '(N/A)';
        toastr.info(flaggedText, moderationReason, { timeOut: 10000 });
    }
}

/**
 * Gets the API model for the selected chat completion source.
 * @param {ChatCompletionSettings} settings Chat completion settings
 * @returns {string} API model
 */
export function getChatCompletionModel(settings = null) {
    settings = settings ?? oai_settings;
    const model = getChatCompletionModelFromSettings(settings);

    if (!model && !Object.values(chat_completion_sources).includes(settings.chat_completion_source)) {
        console.error(`Unknown chat completion source: ${settings.chat_completion_source}`);
    }

    return model;
}

/**
 * Models reported by the last successful provider status check.
 * @returns {Array<{id: string}>}
 */
export function getOpenAIModelList() {
    return model_list;
}

/**
 * Sets the primary chat-completion model (React field and /model share this).
 * @param {string} model Model id
 */
export function setOpenAIModel(model) {
    const value = String(model ?? '').trim();
    if (!value || oai_settings.openai_model === value) {
        return;
    }
    oai_settings.openai_model = value;
    saveSettingsDebounced();
    updateFeatureSupportFlags();
    eventSource.emit(event_types.CHATCOMPLETION_MODEL_CHANGED, value);
}

function saveModelList(data) {
    model_list = data.map((model) => ({ ...model }));
    model_list.sort((a, b) => a?.id && b?.id && a.id.localeCompare(b.id));

    if (oai_settings.chat_completion_source == chat_completion_sources.OPENAI) {
        const sel = model_list.find(m => m.id === oai_settings.openai_model);
        if (!sel && model_list.length > 0) {
            oai_settings.openai_model = model_list[0].id;
            eventSource.emit(event_types.CHATCOMPLETION_MODEL_CHANGED, oai_settings.openai_model);
        }
    }
}

function getVerbosity(settings = null) {
    settings = settings ?? oai_settings;
    return resolveVerbosity(settings);
}

/**
 * Gets the reasoning effort for the current chat completion source.
 * @param {object} [settings] Settings object
 * @param {string} [model] Model name
 * @returns {string|undefined} Reasoning effort value
 */
function getReasoningEffort(settings = null, model = null) {
    settings = settings ?? oai_settings;
    model = model ?? getChatCompletionModel(settings);
    return resolveReasoningEffort(settings, model);
}

/**
 * Build the generation parameter object for an OAI request.
 * @param {ChatCompletionSettings} settings Initial chat completion settings
 * @param {string} model Model name
 * @param {string} type Request type (impersonate, quiet, continue, etc)
 * @param {ChatCompletionMessage[]} messages Array of chat completion messages
 * @param {import('../script.js').AdditionalRequestOptions} options Additional request options
 * @returns {Promise<object>} Final generation parameters object appropriate for the chat completion source
 */
export async function createGenerationParameters(settings, model, type, messages, { jsonSchema = null } = {}) {
    // HACK: Filter out null and non-object messages
    if (!Array.isArray(messages)) {
        throw new Error('messages must be an array');
    }
    messages = messages.filter(msg => msg && typeof msg === 'object');

    // "OpenAI-like" sources
    const gptSources = [
        chat_completion_sources.OPENAI,
    ];

    // Sources that support "n" parameter for multi-swipe
    const multiswipeSources = [
        chat_completion_sources.OPENAI,
    ];

    const isO1 = gptSources.includes(settings.chat_completion_source) && ['o1-2024-12-17', 'o1'].includes(model);
    const isWorkersAIJsonMode = false;
    const stream = settings.stream_openai && type !== 'quiet' && !isO1 && !isWorkersAIJsonMode;

    const noMultiSwipeTypes = ['quiet', 'impersonate', 'continue'];
    const canMultiSwipe = settings.n > 1 && !noMultiSwipeTypes.includes(type) && multiswipeSources.includes(settings.chat_completion_source);

    const generate_data = {
        'type': type,
        'messages': messages,
        'model': model,
        'temperature': Number(settings.temp_openai),
        'frequency_penalty': Number(settings.freq_pen_openai),
        'presence_penalty': Number(settings.pres_pen_openai),
        'top_p': Number(settings.top_p_openai),
        'max_tokens': settings.openai_max_tokens,
        'stream': stream,
        'stop': getCustomStoppingStrings(openai_max_stop_strings),
        'chat_completion_source': settings.chat_completion_source,
        'n': canMultiSwipe ? settings.n : undefined,
        'user_name': name1,
        'char_name': name2,
        'include_reasoning': Boolean(settings.show_thoughts),
        'reasoning_effort': getReasoningEffort(settings, model),
        'verbosity': getVerbosity(settings),
    };


    if (!canMultiSwipe && ToolManager.canPerformToolCalls(type, settings, model)) {
        await ToolManager.registerFunctionToolsOpenAI(generate_data);
    }

    // Empty array will produce a validation error
    if (!Array.isArray(generate_data.stop) || !generate_data.stop.length) {
        delete generate_data.stop;
    }

    // Remove stop-strings if not supported by the model
    const isVision = (m) => ['gpt', 'vision'].every(x => typeof m === 'string' && m.includes(x));
    if (gptSources.includes(settings.chat_completion_source) && isVision(model)) {
        delete generate_data.stop;
    }

    if (settings.chat_completion_source === chat_completion_sources.OPENAI && settings.custom_url) {
        generate_data.custom_url = settings.custom_url;
    }


    // https://console.groq.com/docs/openai

    // https://api-docs.deepseek.com/api/create-chat-completion


    // https://docs.electronhub.ai/api-reference/chat/completions


    // https://docs.z.ai/api-reference/llm/chat-completion


    // https://docs.nano-gpt.com/api-reference/endpoint/chat-completion#temperature-&-nucleus

    // https://platform.moonshot.ai/docs/api/chat#public-service-address

    if (settings.chat_completion_source === chat_completion_sources.OPENAI && /^(o1|o3|o4)/.test(model)) {
        generate_data.max_completion_tokens = generate_data.max_tokens;
        delete generate_data.max_tokens;
        delete generate_data.stop;
        delete generate_data.temperature;
        delete generate_data.top_p;
        delete generate_data.frequency_penalty;
        delete generate_data.presence_penalty;
        if (/^(openai\/)?(o1)/.test(model)) {
            generate_data.messages.forEach((msg) => {
                if (msg.role === 'system') {
                    msg.role = 'user';
                }
            });
            delete generate_data.n;
            delete generate_data.tools;
            delete generate_data.tool_choice;
        }
    }

    if (gptSources.includes(settings.chat_completion_source) && /gpt-5/.test(model)) {
        generate_data.max_completion_tokens = generate_data.max_tokens;
        delete generate_data.max_tokens;
        if (/gpt-5-chat-latest/.test(model)) {
            delete generate_data.tools;
            delete generate_data.tool_choice;
        } else if (/gpt-5\.(1|2|3|4)/.test(model) && !/chat-latest/.test(model) && !generate_data.reasoning_effort) {
            delete generate_data.frequency_penalty;
            delete generate_data.presence_penalty;
            delete generate_data.stop;
        } else {
            delete generate_data.temperature;
            delete generate_data.top_p;
            delete generate_data.frequency_penalty;
            delete generate_data.presence_penalty;
            delete generate_data.stop;
        }
    }

    if (jsonSchema) {
        generate_data.json_schema = jsonSchema;
    }

    return { generate_data, stream, canMultiSwipe };
}

/**
 * Send a chat completion request to backend
 * @param {string} type Request type (impersonate, quiet, continue, etc)
 * @param {ChatCompletionMessage[]} messages Array of chat completion messages
 * @param {AbortSignal?} signal Abort signal for request cancellation
 * @param {import('../script.js').AdditionalRequestOptions} options Additional request options
 * @returns {Promise<unknown>}
 * @throws {Error}
 */
async function sendOpenAIRequest(type, messages, signal, { jsonSchema = null, fallbackProvider = false } = {}) {
    // Provide default abort signal
    if (!signal) {
        signal = new AbortController().signal;
    }

    const requestSettings = structuredClone(oai_settings);
    if (fallbackProvider) {
        requestSettings.openai_model = getFallbackOpenAIModel(oai_settings);
    }

    const model = getChatCompletionModel(requestSettings);
    const { generate_data, stream, canMultiSwipe } = await createGenerationParameters(requestSettings, model, type, messages, { jsonSchema });
    await eventSource.emit(event_types.CHAT_COMPLETION_SETTINGS_READY, generate_data);

    const generate_url = '/api/backends/chat-completions/generate';
    const response = await fetch(generate_url, {
        method: 'POST',
        body: JSON.stringify(generate_data),
        headers: getRequestHeaders(),
        signal: signal,
    });

    if (!response.ok) {
        tryParseStreamingError(response, await response.text());
        throw new Error(`Got response status ${response.status}`);
    }
    if (stream) {
        const eventStream = getEventSourceStream();
        response.body.pipeThrough(eventStream);
        const reader = eventStream.readable.getReader();
        const responseChatCompletionSource = requestSettings.chat_completion_source;
        return async function* streamData() {
            let text = '';
            const swipes = [];
            const toolCalls = [];
            const state = { reasoning: '', images: [], signature: '', toolSignatures: {} };
            while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                const rawData = value.data;
                if (rawData === '[DONE]') return;
                tryParseStreamingError(response, rawData);
                const parsed = JSON.parse(rawData);

                if (canMultiSwipe && Array.isArray(parsed?.choices) && parsed?.choices?.[0]?.index > 0) {
                    const swipeIndex = parsed.choices[0].index - 1;
                    // FIXME: state.reasoning should be an array to support multi-swipe
                    swipes[swipeIndex] = (swipes[swipeIndex] || '') + getStreamingReply(parsed, state, { chatCompletionSource: responseChatCompletionSource, overrideShowThoughts: false });
                } else {
                    text += getStreamingReply(parsed, state, { chatCompletionSource: responseChatCompletionSource });
                }

                ToolManager.parseToolCalls(toolCalls, parsed, state.toolSignatures);

                yield { text, swipes: swipes, toolCalls: toolCalls, state: state };
            }
        };
    } else {
        const data = await response.json();

        checkQuotaError(data);
        checkModerationError(data);

        if (data.error) {
            const message = data.error.message || response.statusText || t`Unknown error`;
            toastr.error(message, t`API returned an error`);
            throw new Error(message);
        }

        return data;
    }
}

/**
 * Extracts the reply from the response data from a chat completions-like source
 * @param {object} data Response data from the chat completions-like source
 * @param {object} state Additional state to keep track of
 * @param {object} [options] Additional options
 * @param {string?} [options.chatCompletionSource] Chat completion source
 * @param {boolean?} [options.overrideShowThoughts] Override show thoughts
 * @returns {string} The reply extracted from the response data
 */
export function getStreamingReply(data, _state, { chatCompletionSource: _chatCompletionSource = null, overrideShowThoughts: _overrideShowThoughts = null } = {}) {
    return data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
}

class TokenHandler {
    /**
     * @param {(messages: object[] | object, full?: boolean) => Promise<number>} countTokenAsyncFn Function to count tokens
     */
    constructor(countTokenAsyncFn) {
        this.countTokenAsyncFn = countTokenAsyncFn;
        this.counts = {
            'start_chat': 0,
            'prompt': 0,
            'bias': 0,
            'nudge': 0,
            'impersonate': 0,
            'examples': 0,
            'conversation': 0,
        };
    }

    getCounts() {
        return this.counts;
    }

    resetCounts() {
        Object.keys(this.counts).forEach((key) => this.counts[key] = 0);
    }

    setCounts(counts) {
        this.counts = counts;
    }

    uncount(value, type) {
        this.counts[type] -= value;
    }

    /**
     * Count tokens for a message or messages.
     * @param {object|any[]} messages Messages to count tokens for
     * @param {boolean} [full] Count full tokens
     * @param {string} [type] Identifier for the token count
     * @returns {Promise<number>} The token count
     */
    async countAsync(messages, full, type) {
        const token_count = await this.countTokenAsyncFn(messages, full);
        this.counts[type] += token_count;

        return token_count;
    }

    getTokensForIdentifier(identifier) {
        return this.counts[identifier] ?? 0;
    }

    getTotal() {
        return Object.values(this.counts).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0);
    }

    log() {
        console.table({ ...this.counts, 'total': this.getTotal() });
    }
}


const tokenHandler = new TokenHandler(countTokensOpenAIAsync);

// Thrown by ChatCompletion when a requested prompt couldn't be found.
class IdentifierNotFoundError extends Error {
    constructor(identifier) {
        super(`Identifier ${identifier} not found.`);
        this.name = 'IdentifierNotFoundError';
    }
}

// Thrown by ChatCompletion when the token budget is unexpectedly exceeded
class TokenBudgetExceededError extends Error {
    constructor(identifier = '') {
        super(`Token budged exceeded. Message: ${identifier}`);
        this.name = 'TokenBudgetExceeded';
    }
}

// Thrown when a character name is invalid
class InvalidCharacterNameError extends Error {
    constructor(identifier = '') {
        super(`Invalid character name. Message: ${identifier}`);
        this.name = 'InvalidCharacterName';
    }
}

/**
 * Used for creating, managing, and interacting with a specific message object.
 */
class Message {
    static tokensPerImage = 85;

    /** @type {number} */
    tokens;
    /** @type {string} */
    identifier;
    /** @type {string} */
    role;
    /** @type {string|any[]} */
    content;
    /** @type {string} */
    name;
    /** @type {object} */
    tool_call = null;
    /** @type {string?} */
    signature = null;
    /** @type {string?} */
    reasoning = null;

    /**
     * @constructor
     * @param {string} role - The role of the entity creating the message.
     * @param {string} content - The actual content of the message.
     * @param {string} identifier - A unique identifier for the message.
     * @private Don't use this constructor directly. Use createAsync instead.
     */
    constructor(role, content, identifier) {
        this.identifier = identifier;
        this.role = role;
        this.content = content;

        if (!this.role) {
            console.log(`Message role not set, defaulting to 'system' for identifier '${this.identifier}'`);
            this.role = 'system';
        }

        this.tokens = 0;
    }

    /**
     * Create a new Message instance.
     * @param {string} role
     * @param {string} content
     * @param {string} identifier
     * @returns {Promise<Message>} Message instance
     */
    static async createAsync(role, content, identifier) {
        const message = new Message(role, content, identifier);

        if (typeof message.content === 'string' && message.content.length > 0) {
            message.tokens = await tokenHandler.countAsync({ role: message.role, content: message.content });
        }

        return message;
    }

    /**
     * Reconstruct the message from a tool invocation.
     * @param {import('./tool-calling.js').ToolInvocation[]} invocations - The tool invocations to reconstruct the message from.
     * @param {boolean} includeSignature Whether to include the signature in the tool calls.
     * @param {boolean} includeReasoning Whether to include plaintext reasoning fallback.
     * @returns {Promise<void>}
     */
    async setToolCalls(invocations, includeSignature, includeReasoning = false) {
        this.tool_calls = invocations.map(i => ({
            id: i.id,
            type: 'function',
            function: {
                arguments: i.parameters,
                name: i.name,
            },
            ...(includeSignature && i.signature ? { signature: i.signature } : {}),
        }));
        const fallbackReasoning = invocations.find(i => typeof i.reasoning === 'string' && i.reasoning.length > 0)?.reasoning || null;
        this.reasoning = includeReasoning ? fallbackReasoning : null;
        this.tokens = await tokenHandler.countAsync({
            role: this.role,
            tool_calls: JSON.stringify(this.tool_calls),
            ...(this.reasoning ? { reasoning: this.reasoning } : {}),
        });
    }

    /**
     * Add a name to the message.
     * @param {string} name Name to set for the message.
     * @returns {Promise<void>}
     */
    async setName(name) {
        this.name = name;
        this.tokens = await tokenHandler.countAsync({ role: this.role, content: this.content, name: this.name });
    }

    /**
     * Ensures the content is an array. If it's a string, converts it to an array with a single text object.
     * @returns {any[]} Content as an array
     */
    ensureContentIsArray() {
        const textContent = this.content;
        if (!Array.isArray(this.content)) {
            this.content = [];
            if (typeof textContent === 'string') {
                this.content.push({ type: 'text', text: textContent });
            }
        }
        return this.content;
    }

    /**
     * Adds an image to the message.
     * @param {string} image Image URL or Data URL.
     * @returns {Promise<void>}
     */
    async addImage(image) {
        this.content = this.ensureContentIsArray();
        const isDataUrl = isDataURL(image);
        if (!isDataUrl) {
            try {
                const response = await fetch(image, { method: 'GET', cache: 'force-cache' });
                if (!response.ok) throw new Error('Failed to fetch image');
                const blob = await response.blob();
                image = await getBase64Async(blob);
            } catch (error) {
                console.error('Image adding skipped', error);
                return;
            }
        }

        image = await this.compressImage(image);

        const quality = oai_settings.inline_image_quality || default_settings.inline_image_quality;
        this.content.push({ type: 'image_url', image_url: { 'url': image, 'detail': quality } });

        try {
            const tokens = await this.getImageTokenCost(image, quality);
            this.tokens += tokens;
        } catch (error) {
            this.tokens += Message.tokensPerImage;
            console.error('Failed to get image token cost', error);
        }
    }

    /**
     * Adds a video to the message.
     * @param {string} video Video URL or Data URL.
     * @returns {Promise<void>}
     */
    async addVideo(video) {
        this.content = this.ensureContentIsArray();
        const isDataUrl = isDataURL(video);
        if (!isDataUrl) {
            try {
                const response = await fetch(video, { method: 'GET', cache: 'force-cache' });
                if (!response.ok) throw new Error('Failed to fetch video');
                const blob = await response.blob();
                video = await getBase64Async(blob);
            } catch (error) {
                console.error('Video adding skipped', error);
                return;
            }
        }

        // Note: No compression for videos (unlike images)
        const quality = oai_settings.inline_image_quality || default_settings.inline_image_quality;
        this.content.push({ type: 'video_url', video_url: { 'url': video, 'detail': quality } });

        try {
            // Using Gemini calculation (263 tokens per second)
            const duration = await getVideoDurationFromDataURL(video);
            this.tokens += 263 * Math.ceil(duration);
        } catch (error) {
            // Convservative estimate for video token cost without knowing duration
            this.tokens += 263 * 40; // ~40 second video (60 seconds max)
            console.error('Failed to get video token cost', error);
        }
    }

    /**
     * Adds a audio to the message.
     * @param {string} audio Audio URL or Data URL.
     * @returns {Promise<void>}
     */
    async addAudio(audio) {
        this.content = this.ensureContentIsArray();
        const isDataUrl = isDataURL(audio);
        if (!isDataUrl) {
            try {
                const response = await fetch(audio, { method: 'GET', cache: 'force-cache' });
                if (!response.ok) throw new Error('Failed to fetch audio');
                const blob = await response.blob();
                audio = await getBase64Async(blob);
            } catch (error) {
                console.error('Audio adding skipped', error);
                return;
            }
        }

        this.content.push({ type: 'audio_url', audio_url: { 'url': audio } });

        try {
            // Using Gemini calculation (32 tokens per second)
            const duration = await getAudioDurationFromDataURL(audio);
            this.tokens += 32 * Math.ceil(duration);
        } catch (error) {
            // Estimate for audio token cost without knowing duration
            const tokens = 32 * 300; // ~5 minute audio
            this.tokens += tokens;
            console.error('Failed to get audio token cost', error);
        }
    }

    /**
     * Compress an image if it exceeds the size threshold for the current chat completion source.
     * @param {string} image Data URL of the image.
     * @returns {Promise<string>} Compressed image as a Data URL.
     */
    async compressImage(image) {
        const safeMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const mimeType = image?.split(';')?.[0]?.split(':')?.[1];
        if (!safeMimeTypes.includes(mimeType)) {
            image = await createThumbnail(image, null, null);
        }
        return image;
    }

    /**
     * Get the token cost of an image.
     * @param {string} dataUrl Data URL of the image.
     * @param {string} quality String representing the quality of the image. Can be 'low', 'auto', or 'high'.
     * @returns {Promise<number>} The token cost of the image.
     */
    async getImageTokenCost(dataUrl, quality) {
        if (quality === 'low') {
            return Message.tokensPerImage;
        }

        const size = await getImageSizeFromDataURL(dataUrl);

        // If the image is small enough, we can use the low quality token cost
        if (quality === 'auto' && size.width <= 512 && size.height <= 512) {
            return Message.tokensPerImage;
        }

        /*
        * Images are first scaled to fit within a 2048 x 2048 square, maintaining their aspect ratio.
        * Then, they are scaled such that the shortest side of the image is 768px long.
        * Finally, we count how many 512px squares the image consists of.
        * Each of those squares costs 170 tokens. Another 85 tokens are always added to the final total.
        * https://platform.openai.com/docs/guides/vision/calculating-costs
        */

        const scale = 2048 / Math.min(size.width, size.height);
        const scaledWidth = Math.round(size.width * scale);
        const scaledHeight = Math.round(size.height * scale);

        const finalScale = 768 / Math.min(scaledWidth, scaledHeight);
        const finalWidth = Math.round(scaledWidth * finalScale);
        const finalHeight = Math.round(scaledHeight * finalScale);

        const squares = Math.ceil(finalWidth / 512) * Math.ceil(finalHeight / 512);
        const tokens = squares * 170 + 85;
        return tokens;
    }

    /**
     * Create a new Message instance from a prompt asynchronously.
     * @static
     * @param {Object} prompt - The prompt object.
     * @returns {Promise<Message>} A new instance of Message.
     */
    static fromPromptAsync(prompt) {
        return Message.createAsync(prompt.role, prompt.content, prompt.identifier);
    }

    /**
     * Returns the number of tokens in the message.
     * @returns {number} Number of tokens in the message.
     */
    getTokens() { return this.tokens; }
}

/**
 * Used for creating, managing, and interacting with a collection of Message instances.
 *
 * @class MessageCollection
 */
class MessageCollection {
    collection = [];
    identifier;

    /**
     * @constructor
     * @param {string} identifier - A unique identifier for the MessageCollection.
     * @param {...Object} items - An array of Message or MessageCollection instances to be added to the collection.
     */
    constructor(identifier, ...items) {
        for (let item of items) {
            if (!(item instanceof Message || item instanceof MessageCollection)) {
                throw new Error('Only Message and MessageCollection instances can be added to MessageCollection');
            }
        }

        this.collection.push(...items);
        this.identifier = identifier;
    }

    /**
     * Get chat in the format of {role, name, content, tool_calls}.
     * @returns {Array} Array of objects with role, name, and content properties.
     */
    getChat() {
        return this.collection.reduce((acc, message) => {
            if (message.content || message.tool_calls) {
                acc.push({
                    role: message.role,
                    content: message.content,
                    ...(message.name && { name: message.name }),
                    ...(message.tool_calls && { tool_calls: message.tool_calls }),
                    ...(message.role === 'tool' && { tool_call_id: message.identifier }),
                    ...(message.signature && { signature: message.signature }),
                    ...(message.reasoning && { reasoning: message.reasoning }),
                });
            }
            return acc;
        }, []);
    }

    /**
     * Method to get the collection of messages.
     * @returns {Array} The collection of Message instances.
     */
    getCollection() {
        return this.collection;
    }

    /**
     * Add a new item to the collection.
     * @param {Object} item - The Message or MessageCollection instance to be added.
     */
    add(item) {
        this.collection.push(item);
    }

    /**
     * Get an item from the collection by its identifier.
     * @param {string} identifier - The identifier of the item to be found.
     * @returns {Object} The found item, or undefined if no item was found.
     */
    getItemByIdentifier(identifier) {
        return this.collection.find(item => item?.identifier === identifier);
    }

    /**
     * Check if an item with the given identifier exists in the collection.
     * @param {string} identifier - The identifier to check.
     * @returns {boolean} True if an item with the given identifier exists, false otherwise.
     */
    hasItemWithIdentifier(identifier) {
        return this.collection.some(message => message.identifier === identifier);
    }

    /**
     * Get the total number of tokens in the collection.
     * @returns {number} The total number of tokens.
     */
    getTokens() {
        return this.collection.reduce((tokens, message) => tokens + message.getTokens(), 0);
    }

    /**
     * Combines message collections into a single collection.
     * @returns {Message[]} The collection of messages flattened into a single array.
     */
    flatten() {
        return this.collection.reduce((acc, message) => {
            if (message instanceof MessageCollection) {
                acc.push(...message.flatten());
            } else {
                acc.push(message);
            }
            return acc;
        }, []);
    }
}

/**
 * OpenAI API chat completion representation
 * const map = [{identifier: 'example', message: {role: 'system', content: 'exampleContent'}}, ...];
 *
 * This class creates a chat context that can be sent to Open AI's api
 * Includes message management and token budgeting.
 *
 * @see https://platform.openai.com/docs/guides/gpt/chat-completions-api
 *
 */
export class ChatCompletion {
    /**
     * Combines consecutive system messages into one if they have no name attached.
     * @returns {Promise<void>}
     */
    async squashSystemMessages() {
        const excludeList = ['newMainChat', 'newChat'];
        this.messages.collection = this.messages.flatten();

        let lastMessage = null;
        let squashedMessages = [];

        for (let message of this.messages.collection) {
            // Force exclude empty messages
            if (message.role === 'system' && !message.content) {
                continue;
            }

            const shouldSquash = (message) => {
                return !excludeList.includes(message.identifier) && message.role === 'system' && !message.name;
            };

            if (shouldSquash(message)) {
                if (lastMessage && shouldSquash(lastMessage)) {
                    lastMessage.content += '\n' + message.content;
                    lastMessage.tokens = await tokenHandler.countAsync({ role: lastMessage.role, content: lastMessage.content });
                } else {
                    squashedMessages.push(message);
                    lastMessage = message;
                }
            } else {
                squashedMessages.push(message);
                lastMessage = message;
            }
        }

        this.messages.collection = squashedMessages;
    }

    /**
     * Initializes a new instance of ChatCompletion.
     * Sets up the initial token budget and a new message collection.
     */
    constructor() {
        this.tokenBudget = 0;
        this.messages = new MessageCollection('root');
        this.loggingEnabled = false;
        this.overriddenPrompts = [];
    }

    /**
     * Retrieves all messages.
     *
     * @returns {MessageCollection} The MessageCollection instance holding all messages.
     */
    getMessages() {
        return this.messages;
    }

    /**
     * Calculates and sets the token budget based on context and response.
     *
     * @param {number} context - Number of tokens in the context.
     * @param {number} response - Number of tokens in the response.
     */
    setTokenBudget(context, response) {
        this.log(`Prompt tokens: ${context}`);
        this.log(`Completion tokens: ${response}`);

        this.tokenBudget = context - response;

        this.log(`Token budget: ${this.tokenBudget}`);
    }

    /**
     * Adds a message or message collection to the collection.
     *
     * @param {Message|MessageCollection} collection - The message or message collection to add.
     * @param {number|null} position - The position at which to add the collection.
     * @returns {ChatCompletion} The current instance for chaining.
     */
    add(collection, position = null) {
        this.validateMessageCollection(collection);
        this.checkTokenBudget(collection, collection.identifier);

        if (null !== position && -1 !== position) {
            this.messages.collection[position] = collection;
        } else {
            this.messages.collection.push(collection);
        }

        this.decreaseTokenBudgetBy(collection.getTokens());

        this.log(`Added ${collection.identifier}. Remaining tokens: ${this.tokenBudget}`);

        return this;
    }

    /**
     * Inserts a message at the start of the specified collection.
     *
     * @param {Message} message - The message to insert.
     * @param {string} identifier - The identifier of the collection where to insert the message.
     */
    insertAtStart(message, identifier) {
        this.insert(message, identifier, 'start');
    }

    /**
     * Inserts a message at the end of the specified collection.
     *
     * @param {Message} message - The message to insert.
     * @param {string} identifier - The identifier of the collection where to insert the message.
     */
    insertAtEnd(message, identifier) {
        this.insert(message, identifier, 'end');
    }

    /**
     * Inserts a message at the specified position in the specified collection.
     *
     * @param {Message} message - The message to insert.
     * @param {string} identifier - The identifier of the collection where to insert the message.
     * @param {string|number} position - The position at which to insert the message ('start' or 'end').
     */
    insert(message, identifier, position = 'end') {
        this.validateMessage(message);
        this.checkTokenBudget(message, message.identifier);

        const index = this.findMessageIndex(identifier);
        if (message.content || message.tool_calls) {
            if ('start' === position) this.messages.collection[index].collection.unshift(message);
            else if ('end' === position) this.messages.collection[index].collection.push(message);
            else if (typeof position === 'number') this.messages.collection[index].collection.splice(position, 0, message);

            this.decreaseTokenBudgetBy(message.getTokens());

            this.log(`Inserted ${message.identifier} into ${identifier}. Remaining tokens: ${this.tokenBudget}`);
        }
    }

    /**
     * Remove the last item of the collection
     *
     * @param identifier
     */
    removeLastFrom(identifier) {
        const index = this.findMessageIndex(identifier);
        const message = this.messages.collection[index].collection.pop();

        if (!message) {
            this.log(`No message to remove from ${identifier}`);
            return;
        }

        this.increaseTokenBudgetBy(message.getTokens());

        this.log(`Removed ${message.identifier} from ${identifier}. Remaining tokens: ${this.tokenBudget}`);
    }

    /**
     * Checks if the token budget can afford the tokens of the specified message.
     *
     * @param {Message|MessageCollection} message - The message to check for affordability.
     * @returns {boolean} True if the budget can afford the message, false otherwise.
     */
    canAfford(message) {
        return 0 <= this.tokenBudget - message.getTokens();
    }

    /**
     * Checks if the token budget can afford the tokens of all the specified messages.
     * @param {Message[]} messages - The messages to check for affordability.
     * @returns {boolean} True if the budget can afford all the messages, false otherwise.
     */
    canAffordAll(messages) {
        return 0 <= this.tokenBudget - messages.reduce((total, message) => total + message.getTokens(), 0);
    }

    /**
     * Checks if a message with the specified identifier exists in the collection.
     *
     * @param {string} identifier - The identifier to check for existence.
     * @returns {boolean} True if a message with the specified identifier exists, false otherwise.
     */
    has(identifier) {
        return this.messages.hasItemWithIdentifier(identifier);
    }

    /**
     * Retrieves the total number of tokens in the collection.
     *
     * @returns {number} The total number of tokens.
     */
    getTotalTokenCount() {
        return this.messages.getTokens();
    }

    /**
     * Retrieves the chat as a flattened array of messages.
     *
     * @returns {Array} The chat messages.
     */
    getChat() {
        const chat = [];
        for (let item of this.messages.collection) {
            if (item instanceof MessageCollection) {
                chat.push(...item.getChat());
            } else if (item instanceof Message && (item.content || item.tool_calls)) {
                const message = {
                    role: item.role,
                    content: item.content,
                    ...(item.name ? { name: item.name } : {}),
                    ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
                    ...(item.role === 'tool' ? { tool_call_id: item.identifier } : {}),
                    ...(item.signature ? { signature: item.signature } : {}),
                    ...(item.reasoning ? { reasoning: item.reasoning } : {}),
                };
                chat.push(message);
            } else {
                this.log(`Skipping invalid or empty message in collection: ${JSON.stringify(item)}`);
            }
        }
        return chat;
    }

    /**
     * Logs an output message to the console if logging is enabled.
     *
     * @param {string} output - The output message to log.
     */
    log(output) {
        if (this.loggingEnabled) console.log('[ChatCompletion] ' + output);
    }

    /**
     * Enables logging of output messages to the console.
     */
    enableLogging() {
        this.loggingEnabled = true;
    }

    /**
     * Disables logging of output messages to the console.
     */
    disableLogging() {
        this.loggingEnabled = false;
    }

    /**
     * Validates if the given argument is an instance of MessageCollection.
     * Throws an error if the validation fails.
     *
     * @param {MessageCollection|Message} collection - The collection to validate.
     */
    validateMessageCollection(collection) {
        if (!(collection instanceof MessageCollection)) {
            console.log(collection);
            throw new Error('Argument must be an instance of MessageCollection');
        }
    }

    /**
     * Validates if the given argument is an instance of Message.
     * Throws an error if the validation fails.
     *
     * @param {Message} message - The message to validate.
     */
    validateMessage(message) {
        if (!(message instanceof Message)) {
            console.log(message);
            throw new Error('Argument must be an instance of Message');
        }
    }

    /**
     * Checks if the token budget can afford the tokens of the given message.
     * Throws an error if the budget can't afford the message.
     *
     * @param {Message|MessageCollection} message - The message to check.
     * @param {string} identifier - The identifier of the message.
     */
    checkTokenBudget(message, identifier) {
        if (!this.canAfford(message)) {
            throw new TokenBudgetExceededError(identifier);
        }
    }

    /**
     * Reserves the tokens required by the given message from the token budget.
     *
     * @param {Message|MessageCollection|number} message - The message whose tokens to reserve.
     */
    reserveBudget(message) {
        const tokens = typeof message === 'number' ? message : message.getTokens();
        this.decreaseTokenBudgetBy(tokens);
    }

    /**
     * Frees up the tokens used by the given message from the token budget.
     *
     * @param {Message|MessageCollection} message - The message whose tokens to free.
     */
    freeBudget(message) { this.increaseTokenBudgetBy(message.getTokens()); }

    /**
     * Increases the token budget by the given number of tokens.
     * This function should be used sparingly, per design the completion should be able to work with its initial budget.
     *
     * @param {number} tokens - The number of tokens to increase the budget by.
     */
    increaseTokenBudgetBy(tokens) {
        this.tokenBudget += tokens;
    }

    /**
     * Decreases the token budget by the given number of tokens.
     * This function should be used sparingly, per design the completion should be able to work with its initial budget.
     *
     * @param {number} tokens - The number of tokens to decrease the budget by.
     */
    decreaseTokenBudgetBy(tokens) {
        this.tokenBudget -= tokens;
    }

    /**
     * Finds the index of a message in the collection by its identifier.
     * Throws an error if a message with the given identifier is not found.
     *
     * @param {string} identifier - The identifier of the message to find.
     * @returns {number} The index of the message in the collection.
     */
    findMessageIndex(identifier) {
        const index = this.messages.collection.findIndex(item => item?.identifier === identifier);
        if (index < 0) {
            throw new IdentifierNotFoundError(identifier);
        }
        return index;
    }

    /**
     * Sets the list of overridden prompts.
     * @param {string[]} list A list of prompts that were overridden.
     */
    setOverriddenPrompts(list) {
        this.overriddenPrompts = list;
    }

    getOverriddenPrompts() {
        return this.overriddenPrompts ?? [];
    }
}

/**
 * Migrate old Chat Completion settings to new format.
 * @param {ChatCompletionSettings} settings Settings to migrate
 */
function migrateChatCompletionSettings(settings) {
    delete settings.max_context_unlocked;
    delete settings.custom_prompt_post_processing;
    delete settings.function_calling;
    delete settings.tool_call_recurse_limit;

    const migrateMap = [
        { oldKey: 'names_in_completion', oldValue: true, newKey: 'names_behavior', newValue: character_names_behavior.COMPLETION },
        { oldKey: 'chat_completion_source', oldValue: 'palm', newKey: 'chat_completion_source', newValue: 'openai' },
        { oldKey: 'chat_completion_source', oldValue: 'makersuite', newKey: 'chat_completion_source', newValue: 'openai' },
        { oldKey: 'image_inlining', oldValue: false, newKey: 'media_inlining', newValue: false },
        { oldKey: 'image_inlining', oldValue: true, newKey: 'media_inlining', newValue: true },
        { oldKey: 'video_inlining', oldValue: true, newKey: 'media_inlining', newValue: true },
        { oldKey: 'audio_inlining', oldValue: true, newKey: 'media_inlining', newValue: true },
        { oldKey: 'chat_completion_source', oldValue: 'custom', newKey: 'chat_completion_source', newValue: 'openai' },
        { oldKey: 'chat_completion_source', oldValue: 'vertexai', newKey: 'chat_completion_source', newValue: 'openai' },
        { oldKey: 'chat_completion_source', oldValue: 'claude', newKey: 'chat_completion_source', newValue: chat_completion_sources.OPENAI },
    ];

    for (const migration of migrateMap) {
        if (Object.hasOwn(settings, migration.oldKey)) {
            const shouldMigrate = migration.oldValue instanceof RegExp
                ? migration.oldValue.test(settings[migration.oldKey])
                : settings[migration.oldKey] === migration.oldValue;
            if (shouldMigrate) {
                settings[migration.newKey] = migration.newValue;
            }
            if (migration.oldKey !== migration.newKey) {
                delete settings[migration.oldKey];
            }
        }
    }

    // Migrate custom_model to openai_model when custom source was merged into openai
    if (Object.hasOwn(settings, 'custom_model') && settings.custom_model && (!settings.openai_model || settings.openai_model === default_settings.openai_model)) {
        settings.openai_model = settings.custom_model;
    }

    // Provider contract cleanup: one URL, one key, one model, one fallback model.
    // Fold the retired reverse-proxy endpoint into the sole URL field when it is empty.
    if (settings.reverse_proxy && !settings.custom_url) {
        settings.custom_url = settings.reverse_proxy;
    }
    // A fallback explicitly switched off must not resurrect under
    // "model set = enabled" semantics; a missing flag means the new contract.
    if (settings.fallback_provider_enabled === false) {
        delete settings.fallback_provider_model;
    }
    for (const key of [
        'reverse_proxy',
        'proxy_password',
        'custom_include_body',
        'custom_exclude_body',
        'custom_include_headers',
        'fallback_provider_enabled',
        'fallback_provider_base_url',
        'bind_preset_to_connection',
    ]) {
        delete settings[key];
    }

    settings.reasoning_effort = normalizeReasoningEffort(settings.reasoning_effort);
}

/**
 * Load OpenAI settings from backend data
 * @param {any} data Settings data from backend
 * @param {ChatCompletionSettings} settings Saved settings from backend
 */
function loadOpenAISettings(data, settings) {
    const previousModel = oai_settings.openai_model;
    openai_setting_names = data.openai_setting_names;
    openai_settings = data.openai_settings;
    openai_settings.forEach(function (item, i) {
        openai_settings[i] = JSON.parse(item);
    });

    $('#settings_preset_openai').empty();
    const settingNames = {};
    openai_setting_names.forEach(function (item, i) {
        settingNames[item] = i;
        const option = document.createElement('option');
        option.value = i;
        option.text = item;
        $('#settings_preset_openai').append(option);
    });
    openai_setting_names = settingNames;

    migrateChatCompletionSettings(settings);

    for (const key of Object.keys(default_settings)) {
        oai_settings[key] = settings[key] ?? default_settings[key];
        const settingToUpdate = Object.values(settingsToUpdate).find(([_, k]) => k === key);
        if (settingToUpdate) {
            const [selector] = settingToUpdate;
            const $element = $(selector);

            if ($element.length === 0) {
                continue;
            }

            if ($element.is('input[type="checkbox"]')) {
                $element.prop('checked', oai_settings[key]);
            } else if ($element.is('select')) {
                $element.val(oai_settings[key]);
                $element.find(`option[value="${CSS.escape(oai_settings[key])}"]`).prop('selected', true);
            } else {
                const unit = $element.data('unit');
                const value = unit === 'k' ? oai_settings[key] / 1000 : oai_settings[key];
                $element.val(value);
                if ($element.is('input[type="range"]')) {
                    const id = $element.attr('id');
                    const $counter = $(`input[type="number"][data-for="${id}"]`);
                    if ($counter.length > 0) {
                        $counter.val(Number(oai_settings[key]));
                    }
                }
            }
        }
    }

    $(`#settings_preset_openai option[value="${openai_setting_names[oai_settings.preset_settings_openai]}"]`).prop('selected', true);

    // Protect openai_max_context from being overridden by extensions on initial load
    const loadedMaxContext = oai_settings.openai_max_context;
    _presetChangeGuard = true;
    eventSource.once(event_types.SETTINGS_UPDATED, () => {
        _presetChangeGuard = false;
        if (oai_settings.openai_max_context !== loadedMaxContext) {
            oai_settings.openai_max_context = loadedMaxContext;
            const unit = $('#openai_max_context').data('unit');
            $('#openai_max_context').val(unit === 'k' ? loadedMaxContext / 1000 : loadedMaxContext);
        }
    });

    setNamesBehaviorControls();
    setContinuePostfixControls();
    setToolReasoningControls();

    syncSegmentedFromSelect('openai_reasoning_effort');
    syncSegmentedFromSelect('openai_verbosity');

    // Provider form is React-owned; loading settings still needs the side
    // effects the retired #chat_completion_source change handler produced.
    updateFeatureSupportFlags();
    if (oai_settings.openai_model !== previousModel) {
        eventSource.emit(event_types.CHATCOMPLETION_MODEL_CHANGED, oai_settings.openai_model);
    }
    forceCharacterEditorTokenize();
    reconnectOpenAi();
}

function setNamesBehaviorControls() {
    $('#names_behavior').val(String(oai_settings.names_behavior));
    const selectedText = $('#names_behavior option:selected').text().trim();
    $('#character_names_display').text(selectedText);
}

function setContinuePostfixControls() {
    const reverseMap = {
        '': '0',
        ' ': '1',
        '\n': '2',
        '\n\n': '3',
    };
    const selectVal = reverseMap[oai_settings.continue_postfix];
    if (selectVal === undefined) {
        oai_settings.continue_postfix = continue_postfix_types.SPACE;
        $('#continue_postfix_select').val('1');
    } else {
        $('#continue_postfix_select').val(selectVal);
    }
    $('#continue_postfix').val(oai_settings.continue_postfix);
    const selectedText = $('#continue_postfix_select option:selected').text().trim();
    $('#continue_postfix_display').text(selectedText);
}

function setToolReasoningControls() {
    const isEnabled = oai_settings.show_thoughts;
    $('#tool_reasoning_mode').prop('disabled', !isEnabled);
}

async function getStatusOpen() {
    if (oai_settings.chat_completion_source === chat_completion_sources.OPENAI && oai_settings.custom_url && !isValidUrl(oai_settings.custom_url)) {
        console.debug('Invalid custom endpoint URL:', oai_settings.custom_url);
        setOnlineStatus(t`Invalid endpoint URL. Requests may fail.`);
        return displayOnlineStatus();
    }


    let data = {
        chat_completion_source: oai_settings.chat_completion_source,
    };

    if (oai_settings.chat_completion_source === chat_completion_sources.OPENAI && oai_settings.custom_url) {
        data.custom_url = oai_settings.custom_url;
    }

    try {
        const response = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(data),
            signal: abortStatusCheck.signal,
            cache: 'no-cache',
        });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        const responseData = await response.json();

        if ('data' in responseData && Array.isArray(responseData.data)) {
            saveModelList(responseData.data);
        }
        if (!('error' in responseData)) {
            setOnlineStatus(t`Valid`);
        }
    } catch (error) {
        console.error(error);
        setOnlineStatus('no_connection');
    }

    updateFeatureSupportFlags();
    return displayOnlineStatus();
}

/**
 * Get OpenAI preset body from settings
 * @param {ChatCompletionSettings} settings The settings object
 * @returns {Object} The preset body object
 */
export function getChatCompletionPreset(settings = oai_settings) {
    const presetBody = {};
    for (const [presetKey, [, settingsKey]] of Object.entries(settingsToUpdate)) {
        presetBody[presetKey] = settings[settingsKey];
    }
    return structuredClone(presetBody);
}

/**
 * Persist a settings preset with the given name
 *
 * @param {string} name - Name of the preset
 * @param {ChatCompletionSettings} settings The settings object
 * @param {boolean} triggerUi Whether the change event of preset UI element should be emitted
 * @returns {Promise<void>}
 */
async function saveOpenAIPreset(name, settings, triggerUi = true) {
    const presetBody = getChatCompletionPreset(settings);
    const savePresetSettings = await fetch('/api/presets/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            apiId: 'openai',
            name: name,
            preset: presetBody,
        }),
    });

    if (savePresetSettings.ok) {
        const data = await savePresetSettings.json();

        if (Object.keys(openai_setting_names).includes(data.name)) {
            oai_settings.preset_settings_openai = data.name;
            const value = openai_setting_names[data.name];
            Object.assign(openai_settings[value], presetBody);
            $(`#settings_preset_openai option[value="${value}"]`).prop('selected', true);
            if (triggerUi) $('#settings_preset_openai').trigger('change');
        } else {
            openai_settings.push(presetBody);
            openai_setting_names[data.name] = openai_settings.length - 1;
            const option = document.createElement('option');
            option.selected = true;
            option.value = String(openai_settings.length - 1);
            option.innerText = data.name;
            if (triggerUi) $('#settings_preset_openai').append(option).trigger('change');
        }
    } else {
        toastr.error(t`Failed to save preset`);
        throw new Error('Failed to save preset');
    }
}

function onImportPresetClick() {
    $('#openai_preset_import_file').trigger('click');
}

async function onPresetImportFileChange(e) {
    const file = e.target.files[0];

    if (!file) {
        return;
    }

    const name = file.name.replace(/\.[^/.]+$/, '');
    const importedFile = await getFileText(file);
    let presetBody;
    e.target.value = '';

    try {
        presetBody = JSON.parse(importedFile);
    } catch {
        toastr.error(t`Invalid file`);
        return;
    }

    const fields = sensitiveFields.filter(field => presetBody[field]).map(field => `<b>${field}</b>`);
    const shouldConfirm = fields.length > 0;

    if (shouldConfirm) {
        const textHeader = 'The imported preset contains proxy and/or custom endpoint settings.';
        const textMessage = fields.join('<br>');
        const cancelButton = { text: 'Cancel import', result: POPUP_RESULT.CANCELLED, appendAtEnd: true };
        const popupOptions = { customButtons: [cancelButton], okButton: 'Remove them', cancelButton: 'Import as-is' };
        const popupResult = await Popup.show.confirm(textHeader, textMessage, popupOptions);

        if (popupResult === POPUP_RESULT.CANCELLED) {
            console.log('Import cancelled by user');
            return;
        }

        if (popupResult === POPUP_RESULT.AFFIRMATIVE) {
            sensitiveFields.forEach(field => delete presetBody[field]);
        }
    }

    if (name in openai_setting_names) {
        const confirm = await callGenericPopup('Preset name already exists. Overwrite?', POPUP_TYPE.CONFIRM);

        if (!confirm) {
            return;
        }
    }

    await eventSource.emit(event_types.OAI_PRESET_IMPORT_READY, { data: presetBody, presetName: name });

    const savePresetSettings = await fetch('/api/presets/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            apiId: 'openai',
            name: name,
            preset: presetBody,
        }),
    });

    if (!savePresetSettings.ok) {
        toastr.error(t`Failed to save preset`);
        return;
    }

    const data = await savePresetSettings.json();

    if (Object.keys(openai_setting_names).includes(data.name)) {
        oai_settings.preset_settings_openai = data.name;
        const value = openai_setting_names[data.name];
        Object.assign(openai_settings[value], presetBody);
        $(`#settings_preset_openai option[value="${value}"]`).prop('selected', true);
        $('#settings_preset_openai').trigger('change');
    } else {
        openai_settings.push(presetBody);
        openai_setting_names[data.name] = openai_settings.length - 1;
        const option = document.createElement('option');
        option.selected = true;
        option.value = String(openai_settings.length - 1);
        option.innerText = data.name;
        $('#settings_preset_openai').append(option).trigger('change');
    }
}

async function onExportPresetClick() {
    if (!oai_settings.preset_settings_openai) {
        toastr.error(t`No preset selected`);
        return;
    }

    const preset = structuredClone(openai_settings[openai_setting_names[oai_settings.preset_settings_openai]]);
    migrateChatCompletionSettings(preset);

    const fieldValues = sensitiveFields.filter(field => preset[field]).map(field => `<b>${field}</b>: <code>${preset[field]}</code>`);
    if (fieldValues.length > 0) {
        const textHeader = t`Your preset contains proxy and/or custom endpoint settings.`;
        const textMessage = '<div>' + t`Do you want to remove these fields before exporting?` + `</div><br>${DOMPurify.sanitize(fieldValues.join('<br>'))}`;
        const cancelButton = { text: 'Cancel', result: POPUP_RESULT.CANCELLED, appendAtEnd: true };
        const popupOptions = { customButtons: [cancelButton] };
        const popupResult = await Popup.show.confirm(textHeader, textMessage, popupOptions);

        if (popupResult === POPUP_RESULT.CANCELLED) {
            console.log('Export cancelled by user');
            return;
        }

        if (popupResult === POPUP_RESULT.AFFIRMATIVE) {
            sensitiveFields.forEach(field => delete preset[field]);
        }
    }

    const exportConnectionTemplate = $(await renderTemplateAsync('exportPreset'));
    await new Popup(exportConnectionTemplate, POPUP_TYPE.TEXT).show();

    const removeConnectionData = exportConnectionTemplate.find('input[name="export_connection_data"]:checked').val() === 'false';
    if (removeConnectionData) {
        for (const [, [, settingName, , isConnection]] of Object.entries(settingsToUpdate)) {
            if (isConnection) {
                delete preset[settingName];
            }
        }
    }

    await eventSource.emit(event_types.OAI_PRESET_EXPORT_READY, preset);
    const presetJsonString = JSON.stringify(preset, null, 4);
    const presetFileName = `${oai_settings.preset_settings_openai}.json`;
    download(presetJsonString, presetFileName, 'application/json');
}

async function onDeletePresetClick() {
    const confirm = await callGenericPopup(t`Delete the preset? This action is irreversible and your current settings will be overwritten.`, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const nameToDelete = oai_settings.preset_settings_openai;
    const value = openai_setting_names[oai_settings.preset_settings_openai];
    $(`#settings_preset_openai option[value="${value}"]`).remove();
    delete openai_setting_names[oai_settings.preset_settings_openai];
    oai_settings.preset_settings_openai = null;

    if (Object.keys(openai_setting_names).length) {
        oai_settings.preset_settings_openai = Object.keys(openai_setting_names)[0];
        const newValue = openai_setting_names[oai_settings.preset_settings_openai];
        $(`#settings_preset_openai option[value="${newValue}"]`).prop('selected', true);
        $('#settings_preset_openai').trigger('change');
    }

    const response = await fetch('/api/presets/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ apiId: 'openai', name: nameToDelete }),
    });

    if (!response.ok) {
        toastr.warning(t`Preset was not deleted from server`);
    } else {
        toastr.success(t`Preset deleted`);
        await eventSource.emit(event_types.PRESET_DELETED, { apiId: 'openai', name: nameToDelete });
    }

    saveSettingsDebounced();
}

// Load OpenAI preset settings
function onSettingsPresetChange() {
    const presetNameBefore = oai_settings.preset_settings_openai;

    const presetName = $('#settings_preset_openai').find(':selected').text();
    oai_settings.preset_settings_openai = presetName;

    const preset = structuredClone(openai_settings[openai_setting_names[oai_settings.preset_settings_openai]]);

    migrateChatCompletionSettings(preset);

    const updateInput = (selector, value) => $(selector).val(value).trigger('input', { source: 'preset' });
    const updateCheckbox = (selector, value) => $(selector).prop('checked', value).trigger('input', { source: 'preset' });

    // Allow subscribers to alter the preset before applying deltas
    eventSource.emit(event_types.OAI_PRESET_CHANGED_BEFORE, {
        preset: preset,
        presetName: presetName,
        settingsToUpdate: settingsToUpdate,
        settings: oai_settings,
        savePreset: saveOpenAIPreset,
        presetNameBefore: presetNameBefore,
    }).finally(async () => {
        $('.model_custom_select').empty();

        for (const [key, [selector, setting, isCheckbox]] of Object.entries(settingsToUpdate)) {
            // Extensions don't need UI updates and shouldn't fallback to current settings
            if (key === 'extensions') {
                oai_settings.extensions = preset.extensions || {};
                continue;
            }

            if (preset[key] !== undefined) {
                if (isCheckbox) {
                    updateCheckbox(selector, preset[key]);
                } else {
                    updateInput(selector, preset[key]);
                }
                oai_settings[setting] = preset[key];
            }
        }

        // Connection fields always follow the selected preset; the retired
        // #chat_completion_source change handler used to apply these effects.
        updateFeatureSupportFlags();
        eventSource.emit(event_types.CHATCOMPLETION_MODEL_CHANGED, oai_settings.openai_model);
        reconnectOpenAi();

        // Protect openai_max_context from being overridden by extensions
        _presetChangeGuard = true;
        await eventSource.emit(event_types.OAI_PRESET_CHANGED_AFTER);
        await eventSource.emit(event_types.PRESET_CHANGED, { apiId: 'openai', name: presetName });
        _presetChangeGuard = false;

        saveSettingsDebounced();
    });
}

async function onNewPresetClick() {
    const name = await Popup.show.input(t`Preset name:`, t`Hint: Use a character name to bind preset to a specific chat.`, oai_settings.preset_settings_openai);

    if (!name) {
        return;
    }

    await saveOpenAIPreset(name, oai_settings);
}

function isProviderCredentialMissing() {
    return !secret_state[SECRET_KEYS.OPENAI] && !oai_settings.custom_url;
}

/**
 * Connects to the configured provider endpoint and refreshes the model list.
 * Callable UI-free: the React Providers surface invokes this through the
 * runtime command port; the retired API Connections drawer used to bind it.
 */
export async function connectProviderConnection() {
    if (!secret_state[SECRET_KEYS.OPENAI] && !oai_settings.custom_url) {
        console.log(`No secret key saved for ${oai_settings.chat_completion_source}`);
        toastr.warning(t`Enter or save an API key before connecting.`);
        return;
    }

    saveSettingsDebounced();
    await getStatusOpen();
}

export async function testProviderConnection() {
    // Check if the previous request is still in progress
    if (is_send_press) {
        toastr.info(t`Please wait for the previous request to complete.`);
        return;
    }

    if (isProviderCredentialMissing()) {
        toastr.warning(t`Enter or save provider credentials before testing the connection.`);
        return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('API connection test timed out'), API_TEST_REQUEST_TIMEOUT_MS);

    try {
        const reply = await Promise.race([
            sendOpenAIRequest('quiet', [{ 'role': 'user', 'content': 'Hi' }], controller.signal),
            delay(API_TEST_REQUEST_TIMEOUT_MS).then(() => {
                controller.abort('API connection test timed out');
                throw new Error('API connection test timed out');
            }),
        ]);
        console.log(reply);
        toastr.success(t`API connection successful!`);
    } catch {
        toastr.error(t`Could not get a reply from API. Check your connection settings / API key and try again.`);
    } finally {
        clearTimeout(timeout);
        displayOnlineStatus();
    }
}

function reconnectOpenAi() {
    if (main_api == 'openai') {
        setOnlineStatus('no_connection');
        displayOnlineStatus();
        void connectProviderConnection();
    }
}

/**
 * Check if the model supports image inlining
 * @returns {boolean} True if the model supports image inlining
 */
export function isImageInliningSupported() {
    return isImageInliningSupportedForSettings(oai_settings, { mainApi: main_api });
}

/**
 * Check if the model supports video inlining
 * @returns {boolean} True if the model supports video inlining
 */
export function isVideoInliningSupported() {
    return isVideoInliningSupportedForSettings(oai_settings, { mainApi: main_api });
}

/**
 * Check if the model supports video inlining
 * @returns {boolean} True if the model supports audio inlining
 */
export function isAudioInliningSupported() {
    return isAudioInliningSupportedForSettings(oai_settings, { mainApi: main_api });
}

/**
 * Gets the tool-call reasoning forwarding mode.
 * @param {ChatCompletionSettings} settings Settings object to use
 * @returns {string} Reasoning forwarding mode
 */
function getToolReasoningMode(settings = oai_settings) {
    const mode = String(settings.tool_reasoning_mode ?? '');
    if (Object.values(tool_reasoning_modes).includes(mode)) {
        return mode;
    }
    return tool_reasoning_modes.DISABLED;
}

/**
 * Gets the effective tool-call reasoning forwarding mode.
 * Interleaved thinking requires explicit reasoning requests.
 * @param {ChatCompletionSettings} settings Settings object to use
 * @returns {string} Effective reasoning forwarding mode
 */
function getEffectiveToolReasoningMode(settings = oai_settings) {
    if (!settings.show_thoughts) {
        return tool_reasoning_modes.DISABLED;
    }

    return getToolReasoningMode(settings);
}

/**
 * Check if the model supports encrypted reasoning signatures.
 * @param {ChatCompletionSettings} settings Settings object to use
 * @returns {boolean} True if reasoning signatures should be included in the request
 */
export function isReasoningSignatureSupported() {
    return false;
}

function proxyUrlCallback(_, value) {
    if (!value) {
        return oai_settings.custom_url ?? '';
    }
    oai_settings.custom_url = value;
    reconnectOpenAi();
    return oai_settings.custom_url;
}

function apiKeyCallback(_, value) {
    if (!value) {
        return '';
    }
    const secretKey = resolveSecretKey();
    if (secretKey) {
        writeSecret(secretKey, value);
    }
    return value;
}

function updateFeatureSupportFlags() {
    const featureFlags = {
        openai_image_inlining_supported: isImageInliningSupported(),
        openai_video_inlining_supported: isVideoInliningSupported(),
        openai_audio_inlining_supported: isAudioInliningSupported(),
    };

    for (const [key, value] of Object.entries(featureFlags)) {
        const element = document.getElementById(key);
        if (element) {
            element.dataset.ccToggle = String(value ?? false);
        }
    }
}

export function initOpenAI() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'proxy-url',
        callback: proxyUrlCallback,
        returns: 'current base URL',
        namedArgumentList: [],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'url',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Gets or sets the provider endpoint Base URL. Leave empty to get the current value.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'api-key',
        callback: apiKeyCallback,
        returns: 'current API key',
        namedArgumentList: [],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'key',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        helpString: 'Gets or sets the API key. Applies to both the primary and fallback model.',
    }));

    $(document).on('change', '.segmented-control input[type="radio"]', function () {
        const selectId = $(this).closest('.segmented-control').data('sync-select');
        if (selectId) {
            $('#' + selectId).val($(this).val()).trigger('input');
        }
    });

    $('#temp_openai').on('input', function () {
        oai_settings.temp_openai = Number($(this).val());
        $('#temp_openai_counter').val($(this).val());
        saveSettingsDebounced();
    });

    $('#freq_pen_openai').on('input', function () {
        oai_settings.freq_pen_openai = Number($(this).val());
        saveSettingsDebounced();
    });

    $('#pres_pen_openai').on('input', function () {
        oai_settings.pres_pen_openai = Number($(this).val());
        saveSettingsDebounced();
    });

    $('#top_p_openai').on('input', function () {
        oai_settings.top_p_openai = Number($(this).val());
        $('#top_p_openai_counter').val($(this).val());
        saveSettingsDebounced();
    });


    $('#openai_max_context').on('input', function () {
        if (_presetChangeGuard) return;
        oai_settings.openai_max_context = Math.round(Number($(this).val()) * 1000);
        saveSettingsDebounced();
    });

    $('#openai_max_tokens').on('input', function () {
        oai_settings.openai_max_tokens = Math.round(Number($(this).val()) * 1000);
        saveSettingsDebounced();
    });

    $('#stream_toggle').on('change', function () {
        oai_settings.stream_openai = !!$('#stream_toggle').prop('checked');
        saveSettingsDebounced();
    });

    $('#send_if_empty_textarea').on('input', function () {
        oai_settings.send_if_empty = String($('#send_if_empty_textarea').val());
        saveSettingsDebounced();
    });

    $('#impersonation_prompt_textarea').on('input', function () {
        oai_settings.impersonation_prompt = String($('#impersonation_prompt_textarea').val());
        saveSettingsDebounced();
    });

    $('#newchat_prompt_textarea').on('input', function () {
        oai_settings.new_chat_prompt = String($('#newchat_prompt_textarea').val());
        saveSettingsDebounced();
    });

    $('#newexamplechat_prompt_textarea').on('input', function () {
        oai_settings.new_example_chat_prompt = String($('#newexamplechat_prompt_textarea').val());
        saveSettingsDebounced();
    });

    $('#continue_nudge_prompt_textarea').on('input', function () {
        oai_settings.continue_nudge_prompt = String($('#continue_nudge_prompt_textarea').val());
        saveSettingsDebounced();
    });

    $('#wi_format_textarea').on('input', function () {
        oai_settings.wi_format = String($('#wi_format_textarea').val());
        saveSettingsDebounced();
    });

    $('#description_format_textarea').on('input', function () {
        oai_settings.description_format = String($('#description_format_textarea').val());
        saveSettingsDebounced();
    });

    $('#update_oai_preset').on('click', async function () {
        const name = oai_settings.preset_settings_openai;
        await saveOpenAIPreset(name, oai_settings, false);
        toastr.success(t`Preset updated`);
    });

    $('#impersonation_prompt_restore').on('click', function () {
        oai_settings.impersonation_prompt = default_impersonation_prompt;
        $('#impersonation_prompt_textarea').val(oai_settings.impersonation_prompt);
        saveSettingsDebounced();
    });

    $('#newchat_prompt_restore').on('click', function () {
        oai_settings.new_chat_prompt = default_new_chat_prompt;
        $('#newchat_prompt_textarea').val(oai_settings.new_chat_prompt);
        saveSettingsDebounced();
    });

    $('#newexamplechat_prompt_restore').on('click', function () {
        oai_settings.new_example_chat_prompt = default_new_example_chat_prompt;
        $('#newexamplechat_prompt_textarea').val(oai_settings.new_example_chat_prompt);
        saveSettingsDebounced();
    });

    $('#continue_nudge_prompt_restore').on('click', function () {
        oai_settings.continue_nudge_prompt = default_continue_nudge_prompt;
        $('#continue_nudge_prompt_textarea').val(oai_settings.continue_nudge_prompt);
        saveSettingsDebounced();
    });

    $('#wi_format_restore').on('click', function () {
        oai_settings.wi_format = default_wi_format;
        $('#wi_format_textarea').val(oai_settings.wi_format);
        saveSettingsDebounced();
    });

    $('#description_format_restore').on('click', function () {
        oai_settings.description_format = default_description_format;
        $('#description_format_textarea').val(oai_settings.description_format);
        saveSettingsDebounced();
    });

    $('#squash_system_messages').on('input', function () {
        oai_settings.squash_system_messages = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#openai_media_inlining').on('input', function () {
        oai_settings.media_inlining = !!$(this).prop('checked');
        updateFeatureSupportFlags();
        saveSettingsDebounced();
    });

    $('#openai_inline_image_quality').on('input', function () {
        oai_settings.inline_image_quality = String($(this).val());
        saveSettingsDebounced();
    });

    $('#continue_prefill').on('input', function () {
        oai_settings.continue_prefill = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#tool_reasoning_mode').on('input', function () {
        oai_settings.tool_reasoning_mode = getToolReasoningMode({
            ...oai_settings,
            tool_reasoning_mode: String($(this).val()),
        });
        saveSettingsDebounced();
    });

    $('#n_openai').on('input', function () {
        oai_settings.n = Number($(this).val());
        saveSettingsDebounced();
    });


    $('#names_behavior').on('input', function () {
        oai_settings.names_behavior = Number($(this).val());
        setNamesBehaviorControls();
        saveSettingsDebounced();
    });

    $('#azure_base_url').on('input', function () {
        oai_settings.azure_base_url = String($(this).val());
        saveSettingsDebounced();
    });

    $('#azure_deployment_name').on('input', function () {
        oai_settings.azure_deployment_name = String($(this).val());
        saveSettingsDebounced();
    });

    $('#azure_api_version').on('input change', function () {
        oai_settings.azure_api_version = String($(this).val());
        saveSettingsDebounced();
    });

    $('#names_behavior').on('change', function () {
        oai_settings.names_behavior = Number($(this).val());
        setNamesBehaviorControls();
        saveSettingsDebounced();
    });

    const postfixIndexMap = {
        '0': continue_postfix_types.NONE,
        '1': continue_postfix_types.SPACE,
        '2': continue_postfix_types.NEWLINE,
        '3': continue_postfix_types.DOUBLE_NEWLINE,
    };
    $('#continue_postfix_select').on('change', function () {
        oai_settings.continue_postfix = postfixIndexMap[$(this).val()] ?? continue_postfix_types.SPACE;
        setContinuePostfixControls();
        saveSettingsDebounced();
    });

    $('#openai_show_thoughts').on('input', function () {
        oai_settings.show_thoughts = !!$(this).prop('checked');
        setToolReasoningControls();
        saveSettingsDebounced();
    });

    $('#openai_reasoning_effort').on('input', function () {
        oai_settings.reasoning_effort = normalizeReasoningEffort($(this).val());
        $(this).val(oai_settings.reasoning_effort);
        syncSegmentedFromSelect('openai_reasoning_effort');
        saveSettingsDebounced();
    });

    $('#openai_verbosity').on('input', function () {
        oai_settings.verbosity = String($(this).val());
        syncSegmentedFromSelect('openai_verbosity');
        saveSettingsDebounced();
    });

    if (!CSS.supports('field-sizing', 'content')) {
        $(document).on('input', '#openai_settings .autoSetHeight', function () {
            resetScrollHeight($(this));
        });
    }

    $('#settings_preset_openai').on('change', onSettingsPresetChange);
    $('#new_oai_preset').on('click', onNewPresetClick);
    $('#delete_oai_preset').on('click', onDeletePresetClick);
    $('#openai_preset_import_file').on('input', onPresetImportFileChange);
    $('#export_oai_preset').on('click', onExportPresetClick);
    $('#import_oai_preset').on('click', onImportPresetClick);

    // Preset overflow popup menu open/close is React-owned (PresetActionsMenu);
    // item action bindings below stay direct-by-ID because the items never unmount.

    // Retired provider contract: the fallback model reuses the primary key, so the
    // dedicated fallback secret must not linger. Lazy cleanup once per session.
    if (secret_state.api_key_openai_fallback) {
        void deleteSecret('api_key_openai_fallback');
    }
}

