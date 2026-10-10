import { Fuse, Handlebars } from '../lib.js';

import {
    saveSettingsDebounced,
    scrollChatToBottom,
    characters,
    reloadMarkdownProcessor,
    reloadCurrentChat,
    substituteParams,
    getCurrentChatId,
    printCharactersDebounced,
    setCharacterId,
    setEditedMessageId,
    chat,
    getFirstDisplayedMessageId,
    showMoreMessages,
    saveSettings,
    saveChatConditional,
    setAnimationDuration,
    ANIMATION_DURATION_DEFAULT,
    setActiveCharacter,
    entitiesFilter,
    doNewChat,
    messageFormatting,
    extension_prompt_types,
    extension_prompt_roles,
    deleteMessage,
} from '../script.js';
import { favsToHotswap } from './RossAscends-mods.js';

import { tag_map, tag_sort_mode, tags } from './tags.js';
import { tokenizers } from './tokenizers.js';
import { renderTemplateAsync } from './templates.js';

import { countOccurrences, debounce, delay, getStringHash, isOdd, isTrueBoolean, shuffle, sortMoments, stringToRange, timestampToMoment } from './utils.js';
import { FILTER_TYPES, fuzzySearchCategories } from './filters.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { AUTOCOMPLETE_STATE } from './autocomplete/AutoComplete.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { POPUP_TYPE, callGenericPopup, fixToastrForDialogs } from './popup.js';
import { loadSystemPrompts } from './sysprompt.js';
import { accountStorage } from './util/AccountStorage.js';
import { DEFAULT_REASONING_TEMPLATE, loadReasoningTemplates } from './reasoning.js';
import { MEDIA_DISPLAY } from './constants.js';
import { t } from './i18n.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';
import { DEFAULT_FRONTEND_FRAME_SETTINGS, normalizeFrontendFramesSettings } from './frontend-frame.js';

export const toastPositionClasses = [
    'toast-top-left',
    'toast-top-center',
    'toast-top-right',
    'toast-bottom-left',
    'toast-bottom-center',
    'toast-bottom-right',
];

export const MAX_CONTEXT_DEFAULT = 8192;
export const MAX_RESPONSE_DEFAULT = 2048;

const defaultStoryString = '{{#if system}}{{system}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if scenario}}Scenario: {{scenario}}\n{{/if}}';
const defaultExampleSeparator = '***';
const defaultChatStart = '***';
const defaultToastPosition = 'toast-top-center';

export const chat_styles = {
    DEFAULT: 0,
    BUBBLES: 1,
    DOCUMENT: 2,
};

export const send_on_enter_options = {
    DISABLED: -1,
    AUTO: 0,
    ENABLED: 1,
};


export const power_user = {
    charListGrid: false,
    tokenizer: tokenizers.BEST_MATCH,
    token_padding: 64,
    pin_examples: false,
    strip_examples: false,
    always_force_name2: false,
    user_prompt_bias: '',
    smooth_streaming: false,

    fast_ui_mode: true,
    chat_display: chat_styles.DEFAULT,
    chat_width: 50,

    frontend_frames: { ...DEFAULT_FRONTEND_FRAME_SETTINGS },

    sort_field: 'name',
    sort_order: 'asc',
    sort_rule: null,
    font_scale: 1,

    custom_css: '',

    noShadows: false,

    auto_fix_generated_markdown: true,
    send_on_enter: send_on_enter_options.AUTO,
    timestamps_enabled: true,
    message_token_count_enabled: false,
    trim_spaces: true,
    tag_sort_mode: tag_sort_mode.MANUAL,

    instruct: {
        enabled: false,
        preset: 'Alpaca',
        input_sequence: '### Instruction:',
        input_suffix: '',
        output_sequence: '### Response:',
        output_suffix: '',
        system_sequence: '',
        system_suffix: '',
        last_system_sequence: '',
        first_input_sequence: '',
        first_output_sequence: '',
        last_input_sequence: '',
        last_output_sequence: '',
        story_string_prefix: '',
        story_string_suffix: '',
        stop_sequence: '',
        wrap: true,
        macro: true,
        names_behavior: 'force',
        activation_regex: '',
        bind_to_context: false,
        user_alignment_message: '',
        system_same_as_user: false,
        /** @deprecated Use output_suffix instead */
        separator_sequence: '',
        sequences_as_stop_strings: true,
    },

    context: {
        preset: 'Default',
        story_string: defaultStoryString,
        chat_start: defaultChatStart,
        example_separator: defaultExampleSeparator,
        use_stop_strings: true,
        names_as_stop_strings: true,
        story_string_position: extension_prompt_types.IN_PROMPT,
        story_string_role: extension_prompt_roles.SYSTEM,
        story_string_depth: 1,
    },

    sysprompt: {
        enabled: true,
        name: 'Neutral - Chat',
        content: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
        post_history: '',
    },

    reasoning: {
        name: DEFAULT_REASONING_TEMPLATE,
        auto_parse: false,
        add_to_prompts: false,
        auto_expand: false,
        show_hidden: false,
        prefix: '<think>',
        suffix: '</think>',
        separator: '\n',
        max_additions: 1,
    },

    custom_stopping_strings: '',
    servers: [],
    show_tag_filters: false,
    stscript: {
        matching: 'fuzzy',
        autocomplete: {
            state: AUTOCOMPLETE_STATE.ALWAYS,
        },
    },
    reduced_motion: false,
    compact_input_area: true,
    auto_connect: true,
    forbid_external_media: true,
    external_media_allowed_overrides: [],
    external_media_forbidden_overrides: [],
    media_display: MEDIA_DISPLAY.LIST,
};

/** @type {ContextSettings[]} */
const storage_keys = {
    storyStringValidationCache: 'StoryStringValidationCache',
};


const debug_functions = [];

const setHotswapsDebounced = debounce(favsToHotswap);


/**
 * Replaces consecutive newlines with a single newline.
 * @param {string} x String to be processed.
 * @returns {string} Processed string.
 * @example
 * collapseNewlines("\n\n\n"); // "\n"
 */
export function collapseNewlines(x) {
    return x.replaceAll(/\n+/g, '\n');
}

/**
 * Fix formatting problems in markdown.
 * @param {string} text Text to be processed.
 * @param {boolean} forDisplay Whether the text is being processed for display.
 * @returns {string} Processed text.
 * @example
 * "^example * text*\n" // "^example *text*\n"
 *  "^*example * text\n"// "^*example* text\n"
 * "^example *text *\n" // "^example *text*\n"
 * "^* example * text\n" // "^*example* text\n"
 * // take note that the side you move the asterisk depends on where its pairing is
 * // i.e. both of the following strings have the same broken asterisk ' * ',
 * // but you move the first to the left and the second to the right, to match the non-broken asterisk
 * "^example * text*\n" // "^*example * text\n"
 * // and you HAVE to handle the cases where multiple pairs of asterisks exist in the same line
 * "^example * text* * harder problem *\n" // "^example *text* *harder problem*\n"
 */
export function fixMarkdown(text, forDisplay) {
    // Find pairs of formatting characters and capture the text in between them
    const format = /([*_]{1,2})([\s\S]*?)\1/gm;
    let matches = [];
    let match;
    while ((match = format.exec(text)) !== null) {
        matches.push(match);
    }

    // Iterate through the matches and replace adjacent spaces immediately beside formatting characters
    let newText = text;
    for (let i = matches.length - 1; i >= 0; i--) {
        let matchText = matches[i][0];
        let replacementText = matchText.replace(/(\*|_)([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)|([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)(\*|_)/g, '$1$4');
        newText = newText.slice(0, matches[i].index) + replacementText + newText.slice(matches[i].index + matchText.length);
    }

    // Don't auto-fix asterisks if this is a message clean-up procedure.
    // It botches the continue function. Apply this to display only.
    if (!forDisplay) {
        return newText;
    }

    const splitText = newText.split('\n');

    // Fix asterisks, and quotes that are not paired
    for (let index = 0; index < splitText.length; index++) {
        const line = splitText[index];
        const charsToCheck = ['*', '"'];
        for (const char of charsToCheck) {
            if (line.includes(char) && isOdd(countOccurrences(line, char))) {
                splitText[index] = line.trimEnd() + char;
            }
        }
    }

    newText = splitText.join('\n');

    return newText;
}

function switchTimestamps() {
    $('body').toggleClass('no-timestamps', !power_user.timestamps_enabled);
    $('#messageTimestampsEnabled').prop('checked', power_user.timestamps_enabled);
}

function switchTokenCount() {
    $('body').toggleClass('no-tokenCount', !power_user.message_token_count_enabled);
    $('#messageTokensEnabled').prop('checked', power_user.message_token_count_enabled);
}

function switchReducedMotion() {
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (osReduced) {
        power_user.reduced_motion = true;
    }
    jQuery.fx.off = power_user.reduced_motion;
    const overrideDuration = power_user.reduced_motion ? 0 : ANIMATION_DURATION_DEFAULT;
    setAnimationDuration(overrideDuration);
    $('#reduced_motion').prop('checked', power_user.reduced_motion);
    $('#reduced_motion').prop('disabled', osReduced);
    $('#reduced_motion').closest('label').attr('title',
        osReduced
            ? t`Controlled by your operating system's reduced motion setting`
            : t`Disable animations and transitions`,
    );
    $('body').toggleClass('reduced-motion', power_user.reduced_motion);
}

function switchCompactInputArea() {
    $('#send_form').toggleClass('compact', power_user.compact_input_area);
    $('#compact_input_area').prop('checked', power_user.compact_input_area);
}

function switchUiMode() {
    $('body').toggleClass('no-blur', power_user.fast_ui_mode);
    $('#fast_ui_mode').prop('checked', power_user.fast_ui_mode);
}

function applyNoShadows() {
    $('body').toggleClass('noShadows', power_user.noShadows);
    $('#noShadowsmode').prop('checked', power_user.noShadows);
    scrollChatToBottom();
}

function applyChatDisplay() {
    if ([null, undefined].includes(power_user.chat_display)) {
        console.debug('applyChatDisplay: saw no chat display type defined');
        power_user.chat_display = chat_styles.DEFAULT;
    }
    console.debug(`poweruser.chat_display ${power_user.chat_display}`);
    $('#chat_display').val(power_user.chat_display).prop('selected', true);

    switch (power_user.chat_display) {
        case 0: {
            console.debug('applying default chat');
            $('body').removeClass('bubblechat');
            $('body').removeClass('documentstyle');
            break;
        }
        case 1: {
            console.debug('applying bubblechat');
            $('body').addClass('bubblechat');
            $('body').removeClass('documentstyle');
            break;
        }
        case 2: {
            console.debug('applying document style');
            $('body').removeClass('bubblechat');
            $('body').addClass('documentstyle');
            break;
        }
    }
    // Mirror the class for StyleX surfaces (when.ancestor only supports [attr] selectors).
    document.body.toggleAttribute('data-bubblechat', power_user.chat_display === 1);
}

function applyToastrPosition() {
    toastr.options.positionClass = defaultToastPosition;
    fixToastrForDialogs();
}

function applyChatWidth(type) {
    if (type === 'forced') {
        let r = document.documentElement;
        r.style.setProperty('--sheldWidth', `${power_user.chat_width}vw`);
        $('#chat_width_slider').val(power_user.chat_width);
        //document.documentElement.style.setProperty('--sheldWidth', power_user.chat_width);
    } else {
        //this is to prevent the slider from updating page in real time
        $('#chat_width_slider').off('mouseup touchend').on('mouseup touchend', async () => {
            // This is a hack for Firefox to let it render before applying the block width.
            // Otherwise it takes the incorrect slider position with the new value AFTER the resizing.
            await delay(1);
            document.documentElement.style.setProperty('--sheldWidth', `${power_user.chat_width}vw`);
            await delay(1);
        });
    }

    $('#chat_width_slider_counter').val(power_user.chat_width);
}

function applyCustomCSS() {
    $('#customCSS').val(power_user.custom_css);
    var styleId = 'custom-style';
    var style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.setAttribute('id', styleId);
        document.head.appendChild(style);
    }
    style.innerHTML = power_user.custom_css;
}

function applyFontScale(type) {
    //this is to allow forced setting on page load, theme swap, etc
    if (type === 'forced') {
        document.documentElement.style.setProperty('--fontScale', String(power_user.font_scale));
    } else {
        //this is to prevent the slider from updating page in real time
        $('#font_scale').off('mouseup touchend').on('mouseup touchend', () => {
            document.documentElement.style.setProperty('--fontScale', String(power_user.font_scale));
        });
    }

    $('#font_scale_counter').val(power_user.font_scale);
    $('#font_scale').val(power_user.font_scale);
}

/**
 * Checks if the chat needs to be reloaded to apply media display settings.
 * @returns {boolean} True if the chat needs reload to apply media display settings
 */
function isMediaDisplayReloadNeeded() {
    // A user is not currently in a chat.
    const chatId = getCurrentChatId();
    if (!chatId) {
        return false;
    }

    const firstDisplayedIndex = getFirstDisplayedMessageId();
    const hasUnprocessedMediaMessages = chat.some((message, index) => {
        // Skip messages that are not currently displayed
        if (index < firstDisplayedIndex) {
            return false;
        }
        const hasMediaAttachments = Array.isArray(message?.extra?.media) && message.extra.media.length > 0;
        const lacksMediaDisplay = !message?.extra?.media_display;
        return hasMediaAttachments && lacksMediaDisplay;
    });

    return hasUnprocessedMediaMessages;
}

/**
 * Register a function to be executed when the debug menu is opened.
 * @param {string} functionId Unique ID for the function.
 * @param {string} name Name of the function.
 * @param {string} description Description of the function.
 * @param {function} func Function to be executed.
 */
export function registerDebugFunction(functionId, name, description, func) {
    debug_functions.push({ functionId, name, description, func });
}

async function showDebugMenu() {
    const template = await renderTemplateAsync('debug', { functions: debug_functions });
    callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
}

export function applyPowerUserSettings() {
    switchUiMode();
    applyFontScale('forced');
    applyChatWidth('forced');
    applyCustomCSS();
    applyNoShadows();
    switchTimestamps();
    switchTokenCount();
}

export function applyStylePins() {
    try {
        const existingPins = document.querySelector('#chat > .style-pins');
        if (existingPins) {
            existingPins.remove();
        }

        const firstDisplayed = getFirstDisplayedMessageId();
        if (firstDisplayed === 0 || !isFinite(firstDisplayed)) {
            return;
        }

        const chatElement = document.getElementById('chat');
        if (!chatElement) {
            return;
        }

        const firstMessage = chat[0];
        if (!firstMessage) {
            return;
        }

        const formattedMessage = messageFormatting(firstMessage.mes, firstMessage.name, firstMessage.is_system, firstMessage.is_user, 0, {}, false);
        const htmlElement = document.createElement('div');
        htmlElement.innerHTML = formattedMessage;

        const styleTags = htmlElement.querySelectorAll('style');
        if (styleTags.length === 0) {
            return;
        }

        const pinsElement = document.createElement('div');
        pinsElement.classList.add('style-pins');
        pinsElement.append(...Array.from(styleTags));
        chatElement.prepend(pinsElement);
    } catch (error) {
        console.error('Error applying style pins:', error);
    }
}

function getExampleMessagesBehavior() {
    if (power_user.strip_examples) {
        return 'strip';
    }

    if (power_user.pin_examples) {
        return 'keep';
    }

    return 'normal';
}

//MARK: loadPowerUser
export async function loadPowerUserSettings(settings, data) {
    const defaultStscript = structuredClone(power_user.stscript);
    // Load from settings.json
    if (settings.power_user !== undefined) {
        if (Object.hasOwn(settings.power_user, 'auto_sort_tags') && !Object.hasOwn(settings.power_user, 'tag_sort_mode')) {
            settings.power_user.tag_sort_mode = settings.power_user.auto_sort_tags ? tag_sort_mode.ALPHABETICAL : tag_sort_mode.MANUAL;
            delete settings.power_user.auto_sort_tags;
        }
        // Retired settings keys: drop them on load so legacy saves do not
        // round-trip dead configuration back into the stored document.
        for (const key of [
            'toastr_position', 'avatar_style', 'timer_enabled', 'timestamp_model_icon',
            'mesIDDisplay_enabled', 'hideChatAvatars_enabled', 'expand_message_actions',
            'enableZenSliders', 'enableLabMode', 'show_swipe_num_all_messages',
            'hotswap_enabled', 'zoomed_avatar_magnification', 'bogus_folders',
            'click_to_edit', 'blur_strength', 'shadow_width', 'main_text_color',
            'italics_text_color', 'underline_text_color', 'quote_text_color',
            'blur_tint_color', 'chat_tint_color', 'user_mes_blur_tint_color',
            'bot_mes_blur_tint_color', 'shadow_color', 'border_color',
            'play_message_sound', 'play_sound_unfocused', 'relaxed_api_urls',
            'world_import_dialog', 'enable_auto_select_input', 'enable_md_hotkeys',
            'restore_user_input', 'continue_on_send', 'quick_continue',
            'quick_impersonate', 'gestures', 'auto_load_chat',
            'auto_scroll_chat_to_bottom', 'auto_save_msg_edits', 'confirm_message_delete',
            'allow_name1_display', 'allow_name2_display', 'encode_tags',
            'console_log_prompts', 'pin_styles', 'fuzzy_search',
            'prefer_character_prompt', 'prefer_character_jailbreak',
            'never_resize_avatars', 'show_card_avatar_urls', 'spoiler_free_mode',
            'image_overswipe', 'aux_field', 'tag_import_setting',
            'auto_swipe', 'auto_swipe_minimum_length', 'auto_swipe_blacklist',
            'auto_swipe_blacklist_threshold', 'custom_stopping_strings_macro',
            'experimental_macro_engine', 'auto_continue', 'chat_truncation',
            'streaming_fps', 'smooth_streaming_no_think', 'smooth_streaming_speed',
            'stream_fade_in', 'collapse_newlines', 'trim_sentences', 'single_line',
            'markdown_escape_strings', 'show_user_prompt_bias',
        ]) {
            delete settings.power_user[key];
        }
        Object.assign(power_user, settings.power_user);
    }

    // settings.power_user is shallow-merged, so rebuild nested objects against defaults
    power_user.frontend_frames = normalizeFrontendFramesSettings(power_user.frontend_frames);

    if (power_user.stscript === undefined) {
        power_user.stscript = defaultStscript;
    } else {
        // Only the autocomplete on/off state survives the retirement of the
        // style/geometry/parser knobs; everything else snaps back to defaults.
        power_user.stscript.autocomplete = { state: power_user.stscript.autocomplete?.state ?? defaultStscript.autocomplete.state };
        delete power_user.stscript.parser;
        delete power_user.stscript.autocomplete_style;
    }


    if (typeof power_user.chat_display !== 'number') {
        power_user.chat_display = chat_styles.DEFAULT;
    }

    if (typeof power_user.chat_width !== 'number') {
        power_user.chat_width = 50;
    }

    // Retired remote/proprietary tokenizers (NERD/NERD2/API_CURRENT/API_KOBOLD/LEGACY) fold back to best-match
    if (!Object.values(tokenizers).includes(power_user.tokenizer)) {
        power_user.tokenizer = tokenizers.BEST_MATCH;
    }

    // Clean up old/legacy settings
    if (power_user.import_card_tags !== undefined) {
        delete power_user.import_card_tags;
    }

    if (power_user?.instruct?.derived !== undefined) {
        delete power_user.instruct.derived;
    }

    // Persona system was retired; drop legacy per-persona settings.
    for (const key of ['personas', 'default_persona', 'persona_descriptions', 'persona_description',
        'persona_description_position', 'persona_description_role', 'persona_description_depth',
        'persona_description_lorebook', 'persona_show_notifications', 'persona_sort_order',
        'persona_allow_multi_connections', 'persona_auto_lock']) {
        delete power_user[key];
    }

    $('#example_messages_behavior').val(getExampleMessagesBehavior());
    $(`#example_messages_behavior option[value="${getExampleMessagesBehavior()}"]`).prop('selected', true);

    $('#auto_fix_generated_markdown').prop('checked', power_user.auto_fix_generated_markdown);
    $(`#send_on_enter option[value=${power_user.send_on_enter}]`).prop('selected', true);
    $('#noShadowsmode').prop('checked', power_user.noShadows);
    $('#frontend_frames_enabled').prop('checked', power_user.frontend_frames.enabled);
    $('#frontend_frames_depth').val(power_user.frontend_frames.depth);
    $('#frontend_frames_depth_ignore_hidden').prop('checked', power_user.frontend_frames.depth_ignore_hidden);
    $('#frontend_frames_collapse_code_block').val(power_user.frontend_frames.collapse_code_block);
    $('#frontend_frames_skip_highlight').prop('checked', power_user.frontend_frames.skip_highlight);
    $('#frontend_frames_use_blob_url').prop('checked', power_user.frontend_frames.use_blob_url);
    $('#frontend_frames_allow_streaming').prop('checked', power_user.frontend_frames.allow_streaming);
    $('#messageTimestampsEnabled').prop('checked', power_user.timestamps_enabled);
    $(`#chat_display option[value=${power_user.chat_display}]`).prop('selected', true).trigger('change');
    $('#chat_width_slider').val(power_user.chat_width);

    $('#stscript_autocomplete_state').val(power_user.stscript.autocomplete.state).trigger('input');
    $('#stscript_matching').val(power_user.stscript.matching ?? 'fuzzy');

    $('#smooth_streaming').prop('checked', power_user.smooth_streaming);

    $('#font_scale').val(power_user.font_scale);
    $('#font_scale_counter').val(power_user.font_scale);

    $('#reduced_motion').prop('checked', power_user.reduced_motion);
    $('#forbid_external_media').prop('checked', power_user.forbid_external_media);
    $('#media_display').val(power_user.media_display);

    $(`#character_sort_order option[data-order="${power_user.sort_order}"][data-field="${power_user.sort_field}"]`).prop('selected', true);
    switchReducedMotion();
    switchCompactInputArea();
    reloadMarkdownProcessor();
    await loadSystemPrompts(data);
    await loadReasoningTemplates(data);
    loadCharListState();
    applyToastrPosition();
}

function loadCharListState() {
    document.body.classList.toggle('charListGrid', power_user.charListGrid);
}

export function loadMovingUIState() {
    // movingUI is retired; kept as a no-op for extensions importing it.
}


/**
 * Common function to perform fuzzy search with optional caching
 * @template T
 * @param {string} type - Type of search from fuzzySearchCategories
 * @param {T[]} data - Data array to search in
 * @param {Array<{name: string, weight: number, getFn?: (obj: T) => string}>} keys - Fuse.js keys configuration
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches=null] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<T>[]} Results as items with their score
 */
export function performFuzzySearch(type, data, keys, searchValue, fuzzySearchCaches = null) {
    // Check cache if provided
    if (fuzzySearchCaches) {
        const cache = fuzzySearchCaches[type];
        if (cache?.resultMap.has(searchValue)) {
            return cache.resultMap.get(searchValue);
        }
    }

    const fuse = new Fuse(data, {
        keys: keys,
        includeScore: true,
        ignoreLocation: true,
        useExtendedSearch: true,
        threshold: 0.2,
    });

    const results = fuse.search(searchValue);

    // Store in cache if provided
    if (fuzzySearchCaches) {
        fuzzySearchCaches[type].resultMap.set(searchValue, results);
    }
    return results;
}


/**
 * Fuzzy search world info entries by a search term
 * @param {*[]} data - WI items data array
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches=null] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
export function fuzzySearchWorldInfo(data, searchValue, fuzzySearchCaches = null) {
    const keys = [
        { name: 'key', weight: 20 },
        { name: 'group', weight: 15 },
        { name: 'comment', weight: 10 },
        { name: 'keysecondary', weight: 10 },
        { name: 'content', weight: 3 },
        { name: 'uid', weight: 1 },
        { name: 'automationId', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.worldInfo, data, keys, searchValue, fuzzySearchCaches);
}


/**
 * Renders a story string template with the given parameters.
 * @param {object} params Template parameters.
 * @param {object} [options] Additional options.
 * @param {string} [options.customStoryString] Custom story string template.
 * @param {ContextSettings} [options.customContextSettings] Custom context settings.
 * @returns {string} The rendered story string.
 */
export function renderStoryString(params, { customStoryString = null, customContextSettings = null } = {}) {
    try {
        const contextSettings = structuredClone(customContextSettings ?? power_user.context);
        const storyString = customStoryString ?? contextSettings.story_string;
        const storyStringPosition = contextSettings.story_string_position ?? extension_prompt_types.IN_PROMPT;

        // Validate and log possible warnings/errors
        validateStoryString(storyString, params);

        // compile the story string template into a function, with no HTML escaping
        const compiledTemplate = Handlebars.compile(storyString, { noEscape: true });

        // render the story string template with the given params
        let output = compiledTemplate(params);

        // substitute {{macro}} params that are not defined in the story string
        output = substituteParams(output, params.user, params.char);

        // remove leading newlines
        output = output.replace(/^\n+/, '');

        // add a newline to the end of the story string if it doesn't have one
        if (output.length > 0 && !output.endsWith('\n') && storyStringPosition !== extension_prompt_types.IN_CHAT) {
            output += '\n';
        }

        return output;
    } catch (e) {
        toastr.error('Check the story string template for validity', 'Error rendering story string');
        console.error('Error rendering story string', e);
        throw e; // rethrow the error
    }
}

/**
 * Validate the story string for possible warnings or issues
 *
 * @param {string} storyString - The story string
 * @param {Object} params - The story string parameters
 */
function validateStoryString(storyString, params) {
    /** @type {{hashCache: {[hash: string]: {fieldsWarned: {[key: string]: boolean}}}}} */
    const cache = JSON.parse(accountStorage.getItem(storage_keys.storyStringValidationCache)) ?? { hashCache: {} };

    const hash = getStringHash(storyString);

    // Initialize the cache for the current hash if it doesn't exist
    if (!cache.hashCache[hash]) {
        cache.hashCache[hash] = { fieldsWarned: {} };
    }

    const currentCache = cache.hashCache[hash];
    const fieldsToWarn = [];

    function validateMissingField(field, fallbackLegacyField = null) {
        const contains = storyString.includes(`{{${field}}}`) || (!!fallbackLegacyField && storyString.includes(`{{${fallbackLegacyField}}}`));
        if (!contains && params[field]) {
            const wasLogged = currentCache.fieldsWarned[field];
            if (!wasLogged) {
                fieldsToWarn.push(field);
                currentCache.fieldsWarned[field] = true;
            }
            console.warn(`The story string does not contain {{${field}}}, but it would contain content:\n`, params[field]);
        }
    }

    validateMissingField('description');
    validateMissingField('scenario');
    // validateMissingField('system');
    validateMissingField('wiBefore', 'loreBefore');
    validateMissingField('wiAfter', 'loreAfter');

    if (fieldsToWarn.length > 0) {
        const fieldsList = fieldsToWarn.map(field => `{{${field}}}`).join(', ');
        toastr.warning(`The story string does not contain the following fields, but they would contain content: ${fieldsList}`, 'Story String Validation');
    }

    accountStorage.setItem(storage_keys.storyStringValidationCache, JSON.stringify(cache));
}


const sortFunc = (a, b) => power_user.sort_order == 'asc' ? compareFunc(a, b) : compareFunc(b, a);
const compareFunc = (first, second) => {
    const a = first[power_user.sort_field];
    const b = second[power_user.sort_field];

    if (power_user.sort_field === 'create_date') {
        return sortMoments(timestampToMoment(b), timestampToMoment(a));
    }

    switch (power_user.sort_rule) {
        case 'boolean':
            if (a === true || a === 'true') return 1;  // Prioritize 'true' or true
            if (b === true || b === 'true') return -1; // Prioritize 'true' or true
            if (a && !b) return -1;        // Move truthy values to the end
            if (!a && b) return 1;         // Move falsy values to the beginning
            if (a === b) return 0;         // Sort equal values normally
            return a < b ? -1 : 1;         // Sort non-boolean values normally
        default:
            return typeof a == 'string'
                ? a.localeCompare(b)
                : a - b;
    }
};

/**
 * Sorts an array of entities based on the current sort settings
 * @param {any[]} entities An array of objects with an `item` property
 * @param {boolean} forceSearch Whether to force search sorting
 * @param {import('./filters.js').FilterHelper} [filterHelper=null] Filter helper to use
 */
export function sortEntitiesList(entities, forceSearch, filterHelper = null) {
    filterHelper = filterHelper ?? entitiesFilter;
    if (power_user.sort_field == undefined || entities.length === 0) {
        return;
    }

    const isSearch = forceSearch || $('#character_sort_order option[data-field="search"]').is(':selected');

    if (!isSearch && power_user.sort_order === 'random') {
        shuffle(entities);
        return;
    }

    entities.sort((a, b) => {
        // Sort tags/folders will always be at the top. Their original sorting will be kept, to respect manual tag sorting.
        if (a.type === 'tag' || b.type === 'tag') {
            // The one that is a tag will be at the top
            return (a.type === 'tag' ? -1 : 1) - (b.type === 'tag' ? -1 : 1);
        }

        // If we have search sorting, we take scores and use those
        if (isSearch) {
            const aScore = filterHelper.getScore(FILTER_TYPES.SEARCH, `${a.type}.${a.id}`);
            const bScore = filterHelper.getScore(FILTER_TYPES.SEARCH, `${b.type}.${b.id}`);
            return (aScore - bScore);
        }

        return sortFunc(a.item, b.item);
    });
}

/**
 * Resets the movable styles of the given element to their unset values.
 * @param {string} id Element ID
 */
export function resetMovableStyles(id) {
    const panelStyles = ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin'];

    const panel = document.getElementById(id);

    if (panel) {
        panelStyles.forEach((style) => {
            panel.style[style] = '';
        });
    }
}

/**
 * Finds the ID of the tag with the given name.
 * @param {string} name
 * @returns {string} The ID of the tag with the given name.
 */
function findTagIdByName(name) {
    const matchTypes = [
        (a, b) => a === b,
        (a, b) => a.startsWith(b),
        (a, b) => a.includes(b),
    ];

    // Only get tags that contain at least one record in the tag_map
    const liveTagIds = new Set(Object.values(tag_map).flat());
    const liveTags = tags.filter(x => liveTagIds.has(x.id));

    const exactNameMatchIndex = liveTags.map(x => x.name.toLowerCase()).indexOf(name.toLowerCase());

    if (exactNameMatchIndex !== -1) {
        return liveTags[exactNameMatchIndex].id;
    }

    for (const matchType of matchTypes) {
        const index = liveTags.findIndex(x => matchType(x.name.toLowerCase(), name.toLowerCase()));
        if (index !== -1) {
            return liveTags[index].id;
        }
    }
}

async function doRandomChat(_, tagName) {
    /**
     * Gets the ID of a random character.
     * @returns {string} The order index of the randomly selected character.
     */
    function getRandomCharacterId() {
        if (!tagName) {
            return Math.floor(Math.random() * characters.length).toString();
        }

        const tagId = findTagIdByName(tagName);
        const taggedCharacters = Object.entries(tag_map)
            .filter(x => x[1].includes(tagId)) // Get only records that include the tag
            .map(x => x[0]) // Map the character avatar
            .filter(x => characters.find(y => y.avatar === x)); // Filter out characters that don't exist
        const randomCharacter = taggedCharacters[Math.floor(Math.random() * taggedCharacters.length)];
        const randomIndex = characters.findIndex(x => x.avatar === randomCharacter);
        if (randomIndex === -1) {
            return;
        }
        return randomIndex.toString();
    }

    const characterId = getRandomCharacterId();
    if (!characterId) {
        toastr.error('No characters found');
        return;
    }
    setCharacterId(characterId);
    setActiveCharacter(characters[characterId]?.avatar);
    await delay(1);
    await reloadCurrentChat();
    return characters[characterId]?.name;
}

/**
 * Loads the chat until the given message ID is displayed.
 * @param {number} mesId
 * @returns JQuery<HTMLElement>
 */
async function loadUntilMesId(mesId) {
    let target;

    while (getFirstDisplayedMessageId() > mesId && getFirstDisplayedMessageId() !== 0) {
        await showMoreMessages();
        await delay(1);
        target = $('#chat').find(`.mes[mesid="${mesId}"]`);

        if (target.length) {
            break;
        }
    }

    if (!target.length) {
        toastr.error(`Could not find message with ID: ${mesId}`);
        return target;
    }

    return target;
}

async function doMesCut(_, text) {
    console.debug(`was asked to cut message id #${text}`);
    const range = stringToRange(text, 0, chat.length - 1);

    //reject invalid args or no args
    if (!range) {
        toastr.warning('Must provide a Message ID or a range to cut.');
        return;
    }

    let totalMesToCut = (range.end - range.start) + 1;
    let mesIDToCut = range.start;
    let cutText = '';

    for (let i = 0; i < totalMesToCut; i++) {
        cutText += (chat[mesIDToCut]?.mes || '') + '\n';
        let mesToCut = $('#chat').find(`.mes[mesid=${mesIDToCut}]`);

        if (!mesToCut.length) {
            mesToCut = await loadUntilMesId(mesIDToCut);

            if (!mesToCut || !mesToCut.length) {
                return;
            }
        }

        setEditedMessageId(mesIDToCut);
        await deleteMessage(mesIDToCut, null, false);
    }

    await saveChatConditional();

    return cutText;
}

async function doDelMode(_, text) {
    //reject invalid args
    if (text && isNaN(text)) {
        toastr.warning('Must enter a number or nothing.');
        return '';
    }

    // Just enter the delete mode.
    if (!text) {
        $('#option_delete_mes').trigger('click', { fromSlashCommand: true });
        return '';
    }

    const count = Number(text);

    // Nothing to delete.
    if (count < 1) {
        return '';
    }

    if (count > chat.length) {
        toastr.warning(`Cannot delete more than ${chat.length} messages.`);
        return '';
    }

    const range = `${chat.length - count}-${chat.length - 1}`;
    return doMesCut(_, range);
}

const EPHEMERAL_STOPPING_STRINGS = [];

/**
 * Adds a stopping string to the list of stopping strings that are only used for the next generation.
 * @param {string} value The stopping string to add
 */
export function addEphemeralStoppingString(value) {
    if (!EPHEMERAL_STOPPING_STRINGS.includes(value)) {
        console.debug('Adding ephemeral stopping string:', value);
        EPHEMERAL_STOPPING_STRINGS.push(value);
    }
}

export function flushEphemeralStoppingStrings() {
    if (EPHEMERAL_STOPPING_STRINGS.length === 0) {
        return;
    }

    console.debug('Flushing ephemeral stopping strings:', EPHEMERAL_STOPPING_STRINGS);
    EPHEMERAL_STOPPING_STRINGS.splice(0, EPHEMERAL_STOPPING_STRINGS.length);
}


/**
 * Gets the custom stopping strings from the power user settings.
 * @param {number | undefined} limit Number of strings to return. If 0 or undefined, returns all strings.
 * @returns {string[]} An array of custom stopping strings
 */
export function getCustomStoppingStrings(limit = undefined) {
    function getPermanent() {
        try {
            // If there's no custom stopping strings, return an empty array
            if (!power_user.custom_stopping_strings) {
                return [];
            }

            // Parse the JSON string
            let strings = JSON.parse(power_user.custom_stopping_strings);

            // Make sure it's an array
            if (!Array.isArray(strings)) {
                return [];
            }

            // Make sure all the elements are strings and non-empty.
            strings = strings.filter(s => typeof s === 'string' && s.length > 0);

            strings = strings.map(x => substituteParams(x));

            return strings;
        } catch (error) {
            // If there's an error, return an empty array
            console.warn('Error parsing custom stopping strings:', error);
            return [];
        }
    }

    const permanent = getPermanent();
    const ephemeral = EPHEMERAL_STOPPING_STRINGS;
    const strings = [...permanent, ...ephemeral];

    // Apply the limit. If limit is 0, return all strings.
    if (limit > 0) {
        return strings.slice(0, limit);
    }

    return strings;
}

export function forceCharacterEditorTokenize() {
    $('[data-token-counter]').each(function () {
        $(document.getElementById($(this).data('token-counter'))).data('last-value-hash', '');
    });
    $('#rm_ch_create_block').trigger('input');
    $('#character_popup').trigger('input');
}

jQuery(() => {
    const adjustAutocompleteDebounced = debounce(() => {
        $('.ui-autocomplete-input').each(function () {
            const instance = $(this).autocomplete('instance');
            if (!instance) {
                return;
            }

            const isOpen = instance.widget()[0].style.display !== 'none';
            if (isOpen) {
                $(this).autocomplete('search');
            }
        });
    });

    $(window).on('resize', async () => {
        adjustAutocompleteDebounced();
        setHotswapsDebounced();
    });

    // Settings that go to settings.json
    $('#example_messages_behavior').on('change', function () {
        const selectedOption = String($(this).find(':selected').val());
        console.log('Setting example messages behavior to', selectedOption);

        switch (selectedOption) {
            case 'normal':
                power_user.pin_examples = false;
                power_user.strip_examples = false;
                break;
            case 'keep':
                power_user.pin_examples = true;
                power_user.strip_examples = false;
                break;
            case 'strip':
                power_user.pin_examples = false;
                power_user.strip_examples = true;
                break;
        }

        console.debug('power_user.pin_examples', power_user.pin_examples);
        console.debug('power_user.strip_examples', power_user.strip_examples);

        saveSettingsDebounced();
    });

    $('#fast_ui_mode').on('change', function () {
        power_user.fast_ui_mode = $(this).prop('checked');
        switchUiMode();
        saveSettingsDebounced();
    });

    $('#customCSS').on('input', () => {
        power_user.custom_css = String($('#customCSS').val());
        saveSettingsDebounced();
        applyCustomCSS();
    });

    $('#noShadowsmode').on('change', function () {
        power_user.noShadows = $(this).prop('checked');
        applyNoShadows();
        saveSettingsDebounced();
    });

    $('#chat_display').on('change', function () {
        const value = $(this).find(':selected').val();
        power_user.chat_display = Number(value);
        applyChatDisplay();
        saveSettingsDebounced();
    });

    $('#chat_width_slider').on('input', function (e, data) {
        const applyMode = data?.forced ? 'forced' : 'normal';
        power_user.chat_width = Number($(this).val());
        applyChatWidth(applyMode);
        saveSettingsDebounced();
        setHotswapsDebounced();
    });

    $('#smooth_streaming').on('input', function () {
        power_user.smooth_streaming = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('input[name="font_scale"]').on('input', async function (e, data) {
        const applyMode = data?.forced ? 'forced' : 'normal';
        power_user.font_scale = Number($(this).val());
        $('#font_scale_counter').val(power_user.font_scale);
        applyFontScale(applyMode);
        saveSettingsDebounced();
    });


    $('#character_sort_order').on('change', function () {
        const field = String($(this).find(':selected').data('field'));
        // Save sort order, but do not save search sorting, as this is a temporary sorting option
        if (field !== 'search') {
            power_user.sort_field = field;
            power_user.sort_order = $(this).find(':selected').data('order');
            power_user.sort_rule = $(this).find(':selected').data('rule');
        }
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    $('#auto_fix_generated_markdown').on('input', function () {
        power_user.auto_fix_generated_markdown = !!$(this).prop('checked');
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    $('#send_on_enter').on('change', function () {
        const value = $(this).find(':selected').val();
        power_user.send_on_enter = Number(value);
        saveSettingsDebounced();
    });

    $('#reload_chat').on('click', async function () {
        const currentChatId = getCurrentChatId();
        if (currentChatId !== undefined && currentChatId !== null) {
            await saveSettings();
            await saveChatConditional();
            await reloadCurrentChat();
        }
    });

    $('#messageTimestampsEnabled').on('input', function () {
        const value = !!$(this).prop('checked');
        power_user.timestamps_enabled = value;
        switchTimestamps();
        saveSettingsDebounced();
    });

    $('#messageTokensEnabled').on('input', function () {
        const value = !!$(this).prop('checked');
        power_user.message_token_count_enabled = value;
        switchTokenCount();
        saveSettingsDebounced();
    });


    $('#frontend_frames_enabled').on('input', function () {
        power_user.frontend_frames.enabled = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#frontend_frames_depth').on('input', function () {
        const depth = Math.trunc(Number($(this).val()));
        power_user.frontend_frames.depth = Number.isFinite(depth) && depth >= 0 ? depth : 0;
        saveSettingsDebounced();
    });

    $('#frontend_frames_depth_ignore_hidden').on('input', function () {
        power_user.frontend_frames.depth_ignore_hidden = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#frontend_frames_collapse_code_block').on('change', function () {
        const value = String($(this).val());
        power_user.frontend_frames.collapse_code_block = ['all', 'frontend_only', 'none'].includes(value) ? value : 'frontend_only';
        saveSettingsDebounced();
    });

    $('#frontend_frames_skip_highlight').on('input', function () {
        power_user.frontend_frames.skip_highlight = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#frontend_frames_use_blob_url').on('input', function () {
        power_user.frontend_frames.use_blob_url = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#frontend_frames_allow_streaming').on('input', function () {
        power_user.frontend_frames.allow_streaming = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#debug_menu').on('click', function () {
        showDebugMenu();
    });

    $('#stscript_autocomplete_state').on('input', function () {
        power_user.stscript.autocomplete.state = Number($(this).val());
        saveSettingsDebounced();
    });

    $('#stscript_matching').on('change', function () {
        const value = $(this).find(':selected').val();
        power_user.stscript.matching = String(value);
        saveSettingsDebounced();
    });

    $('#reduced_motion').on('input', function () {
        power_user.reduced_motion = !!$(this).prop('checked');
        switchReducedMotion();
        saveSettingsDebounced();
    });

    $('#compact_input_area').on('input', function () {
        power_user.compact_input_area = !!$(this).prop('checked');
        switchCompactInputArea();
        saveSettingsDebounced();
    });

    $('#forbid_external_media').on('input', function () {
        power_user.forbid_external_media = !!$(this).prop('checked');
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    $('#media_display').on('input', async function () {
        power_user.media_display = $(this).val().toString();
        saveSettingsDebounced();
        if (isMediaDisplayReloadNeeded()) {
            await reloadCurrentChat();
        }
    });

    $(document).on('click', '#debug_table [data-debug-function]', function () {
        const functionId = $(this).data('debug-function');
        const functionRecord = debug_functions.find(f => f.functionId === functionId);

        if (functionRecord) {
            functionRecord.func();
        } else {
            console.warn(`Debug function ${functionId} not found`);
        }
    });

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'newchat',
        /** @type {(args: { delete: string?}, string) => Promise<''>} */
        callback: async (args, _) => {
            await doNewChat({ deleteCurrentChat: isTrueBoolean(args.delete) });
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'delete',
                description: 'delete the current chat',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        helpString: 'Start a new chat with the current character',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'random',
        callback: doRandomChat,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'optional tag name',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: () => tags.filter(tag => Object.values(tag_map).some(x => x.includes(tag.id))).map(tag => new SlashCommandEnumValue(tag.name, null, enumTypes.enum, enumIcons.tag)),
            }),
        ],
        helpString: 'Start a new chat with a random character. If an argument is provided, only considers characters that have the specified tag.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'del',
        callback: doDelMode,
        aliases: ['delete', 'delmode'],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'optional number', [ARGUMENT_TYPE.NUMBER], false,
            ),
        ],
        helpString: 'Enter message deletion mode, and auto-deletes last N messages if numeric argument is provided.',
        returns: 'The text of the deleted messages.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'cut',
        callback: doMesCut,
        returns: 'the text of cut messages separated by a newline',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'number or range',
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                isRequired: true,
                acceptsMultiple: true,
                enumProvider: commonEnumProviders.messages(),
            }),
        ],
        helpString: `
            <div>
                Cuts the specified message or continuous chunk from the chat.
            </div>
            <div>
                Ranges are inclusive!
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/cut 0-10</code></pre>
                    </li>
                </ul>
            </div>
        `,
        aliases: [],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'css-var',
        /** @param {{to: string, varname: string }} args @param {string} value @returns {string} */
        callback: (args, value) => {
            // Map enum to target selector
            const targetSelector = {
                chat: '#chat',
                background: '#bg1',
                zoomedAvatar: 'div.zoomed_avatar',
            }[args.to || 'chat'];

            if (!targetSelector) {
                toastr.error(`Invalid target: ${args.to}`);
                return;
            }

            if (!args.varname) {
                toastr.error('CSS variable name is required');
                return;
            }
            if (!args.varname.startsWith('--')) {
                toastr.error('CSS variable names must start with "--"');
                return;
            }

            const elements = document.querySelectorAll(targetSelector);
            if (elements.length === 0) {
                toastr.error(`No elements found for ${args.to ?? 'chat'} with selector "${targetSelector}"`);
                return;
            }

            elements.forEach(element => {
                element.style.setProperty(args.varname, value);
            });

            console.info(`Set CSS variable "${args.varname}" to "${value}" on "${targetSelector}"`);
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'varname',
                description: 'CSS variable name (starting with double dashes)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'to',
                description: 'The target element to which the CSS variable will be applied',
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: [
                    new SlashCommandEnumValue('chat', null, enumTypes.enum, enumIcons.message),
                    new SlashCommandEnumValue('background', null, enumTypes.enum, enumIcons.image),
                    new SlashCommandEnumValue('zoomedAvatar', null, enumTypes.enum, enumIcons.character),
                ],
                defaultValue: 'chat',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'CSS variable value',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: `
            <div>
                Sets a CSS variable to a specified value on a target element.
                <br />
                Only setting of variable names is supported. They have to be prefixed with double dashes ("--exampleVar").
                Setting actual CSS properties is not supported. Custom CSS in the theme settings can be used for that.
                <br /><br />
                <b>This value will be gone after a page reload!</b>
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/css-var varname="--SmartThemeBodyColor" #ff0000</code></pre>
                        Sets the text color of the chat to red
                    </li>
                    <li>
                        <pre><code>/css-var to=zoomedAvatar varname="--SmartThemeBlurStrength" 0</code></pre>
                        Remove the blur from the zoomed avatar
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'stop-strings',
        aliases: ['stopping-strings', 'custom-stopping-strings', 'custom-stop-strings'],
        helpString: `
            <div>
                Sets a list of custom stopping strings. Gets the list if no value is provided.
                Use a "force" argument to force set an empty value.
            </div>
            <div>
                <strong>Examples:</strong>
            </div>
            <ul>
                <li>Force set an empty value: <pre><code class="language-stscript">/stop-strings force="true" {{noop}}</code></pre></li>
                <li>Value must be a JSON-serialized array: <pre><code class="language-stscript">/stop-strings ["goodbye", "farewell"]</code></pre></li>
                <li>Pipe characters must be escaped with a backslash: <pre><code class="language-stscript">/stop-strings ["left\\|right"]</code></pre></li>
            </ul>
        `,
        returns: ARGUMENT_TYPE.LIST,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'force',
                description: 'force set a value if empty',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'list of strings',
                typeList: [ARGUMENT_TYPE.LIST],
                acceptsMultiple: false,
                isRequired: false,
            }),
        ],
        callback: (args, value) => {
            const force = isTrueBoolean(String(args?.force ?? false));
            value = String(value ?? '').trim();

            // Skip processing if no value and not forced
            if (!force && !value) {
                return power_user.custom_stopping_strings;
            }

            // Use empty array for forced empty value
            if (force && !value) {
                value = JSON.stringify([]);
            }

            const parsedValue = ((x) => { try { return JSON.parse(x.toString()); } catch { return null; } })(value);
            if (!parsedValue || !Array.isArray(parsedValue)) {
                throw new Error('Invalid list format. The value must be a JSON-serialized array of strings.');
            }
            parsedValue.forEach((item, index) => {
                parsedValue[index] = String(item);
            });
            power_user.custom_stopping_strings = JSON.stringify(parsedValue);
            saveSettingsDebounced();

            return power_user.custom_stopping_strings;
        },
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'start-reply-with',
        helpString: `
            <div>
                Sets a "Start Reply With". Gets the current value if no value is provided.
                Use a "force" argument to force set an empty value.
            </div>
            <div>
                <strong>Examples:</strong>
            </div>
            <ul>
                <li>Set the field value: <pre><code class="language-stscript">/start-reply-with Sure!</code></pre></li>
                <li>Force set an empty value: <pre><code class="language-stscript">/start-reply-with force="true" {{noop}}</code></pre></li>
            </ul>
        `,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'force',
                description: 'force set a value if empty',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'value',
                typeList: [ARGUMENT_TYPE.STRING],
                acceptsMultiple: false,
                isRequired: false,
            }),
        ],
        callback: (args, value) => {
            const force = isTrueBoolean(String(args?.force ?? false));

            // Skip processing if no value and not forced
            if (!force && !value) {
                return power_user.user_prompt_bias;
            }

            power_user.user_prompt_bias = String(value ?? '');
            saveSettingsDebounced();

            return power_user.user_prompt_bias;
        },
    }));
});

/**
 * Mounts the React-owned User Settings (power-user) drawer content.
 * Must run before getSettings(): loadPowerUserSettings binds every element
 * ID that the React surface preserves.
 */
export async function mountPowerUserPanel() {
    const drawerContent = document.getElementById('user-settings-block');
    if (!drawerContent) {
        console.warn('User Settings drawer not found');
        return;
    }
    if (drawerContent.dataset.reactPowerUserMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-power-user-host';
    drawerContent.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountPowerUserPanel(host);
        drawerContent.dataset.reactPowerUserMounted = 'true';
    } catch (error) {
        console.error('Failed to mount power-user panel:', error);
    }
}

