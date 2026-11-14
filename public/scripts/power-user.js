import { DOMPurify, Fuse, Handlebars } from '../lib.js';
import { markCharacterSortChanged } from './character-sort-save-guard.js';


import {
    saveSettingsDebounced,
    scrollChatToBottom,
    reloadMarkdownProcessor,
    substituteParams,
    printCharactersDebounced,
    chat,
    getFirstDisplayedMessageId,
    setAnimationDuration,
    ANIMATION_DURATION_DEFAULT,
    entitiesFilter,
    messageFormatting,
    extension_prompt_types,
} from '../script.js';
import { favsToHotswap } from './RossAscends-mods.js';

import { tag_sort_mode } from './tags.js';

import { debounce, getStringHash, shuffle, sortMoments, timestampToMoment } from './utils.js';
import { FILTER_TYPES, fuzzySearchCategories } from './filters.js';
import { accountStorage } from './util/AccountStorage.js';
import { fixToastrForDialogs } from './popup.js';
import { DEFAULT_FRONTEND_FRAME_SETTINGS, normalizeFrontendFramesSettings } from './frontend-frame.js';

export const toastPositionClasses = [
    'toast-top-left',
    'toast-top-center',
    'toast-top-right',
    'toast-bottom-left',
    'toast-bottom-center',
    'toast-bottom-right',
];

// power_user.context / power_user.instruct are retired data fields. The prompt
// assembly and macro surfaces use these frozen shipped defaults instead. The
// story string keeps the seeded template so world-info before/after injections
// and the description/scenario fields keep resolving.
export const DEFAULT_CONTEXT = Object.freeze({
    story_string: '{{#if system}}{{system}}\n{{/if}}{{#if wiBefore}}{{wiBefore}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if scenario}}Scenario: {{scenario}}\n{{/if}}{{#if wiAfter}}{{wiAfter}}\n{{/if}}',
    chat_start: '***',
    example_separator: '***',
    story_string_position: extension_prompt_types.IN_PROMPT,
});
export const INERT_INSTRUCT = Object.freeze({ enabled: false });
const defaultToastPosition = 'toast-top-center';


export const power_user = {
    frontend_frames: { ...DEFAULT_FRONTEND_FRAME_SETTINGS },

    sort_field: 'name',
    sort_order: 'asc',
    sort_rule: null,

    tag_sort_mode: tag_sort_mode.MANUAL,


    servers: [],
    show_tag_filters: false,
    auto_connect: true,
};

const storage_keys = {
    storyStringValidationCache: 'StoryStringValidationCache',
};


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

// The interface-density toggles are retired; the body classes are fixed to the
// shipped defaults (timestamps on, token count off, compact input, no blur,
// no shadows). Reduced motion still follows the OS preference.
function switchReducedMotion() {
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    jQuery.fx.off = osReduced;
    setAnimationDuration(osReduced ? 0 : ANIMATION_DURATION_DEFAULT);
    $('body').toggleClass('reduced-motion', osReduced);
}

function switchFixedInterfaceClasses() {
    $('body').removeClass('no-timestamps');
    $('#send_form').addClass('compact');
    $('body').addClass('no-blur');
    $('body').addClass('noShadows');
    scrollChatToBottom();
}

function applyChatDisplay() {
    $('body').removeClass('bubblechat');
    $('body').removeClass('documentstyle');
    document.body.removeAttribute('data-bubblechat');
}

function applyToastrPosition() {
    toastr.options.positionClass = defaultToastPosition;
    fixToastrForDialogs();
}

function applyChatWidth() {
    document.documentElement.style.setProperty('--sheldWidth', '50vw');
}

function applyFontScale() {
    document.documentElement.style.setProperty('--fontScale', '1');
}

// The Debug Menu surface is retired; keep the registration hook as a no-op
// so call sites and the st-context compat bridge keep resolving.
export function registerDebugFunction() { }

export function applyPowerUserSettings() {
    applyFontScale();
    applyChatWidth();
    applyChatDisplay();
    switchReducedMotion();
    switchFixedInterfaceClasses();
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
        const fragment = DOMPurify.sanitize(formattedMessage, { ADD_TAGS: ['style'], RETURN_DOM_FRAGMENT: true });
        const styleTags = fragment.querySelectorAll('style');
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

//MARK: loadPowerUser
export async function loadPowerUserSettings(settings) {
    // Load from the settings payload
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
            'experimental_macro_engine', 'auto_continue',
            'streaming_fps', 'smooth_streaming_no_think', 'smooth_streaming_speed',
            'stream_fade_in', 'collapse_newlines', 'trim_sentences', 'single_line',
            'markdown_escape_strings', 'show_user_prompt_bias',
            'chat_width', 'font_scale', 'fast_ui_mode', 'reduced_motion',
            'noShadows', 'chat_display', 'timestamps_enabled',
            'compact_input_area', 'media_display', 'send_on_enter',
            'auto_fix_generated_markdown', 'forbid_external_media',
            'message_token_count_enabled',
        ]) {
            delete settings.power_user[key];
        }
        Object.assign(power_user, settings.power_user);
    }

    // settings.power_user is shallow-merged, so rebuild nested objects against defaults
    power_user.frontend_frames = normalizeFrontendFramesSettings(power_user.frontend_frames);

    // Clean up old/legacy settings
    if (power_user.import_card_tags !== undefined) {
        delete power_user.import_card_tags;
    }


    // Persona system was retired; drop legacy per-persona settings.
    for (const key of ['personas', 'default_persona', 'persona_descriptions', 'persona_description',
        'persona_description_position', 'persona_description_role', 'persona_description_depth',
        'persona_description_lorebook', 'persona_show_notifications', 'persona_sort_order',
        'persona_allow_multi_connections', 'persona_auto_lock']) {
        delete power_user[key];
    }

    // Global system prompt and configurable reasoning template were retired;
    // runtime uses fixed reasoning markers and card/Prompt Manager prompts.
    delete power_user.sysprompt;
    delete power_user.reasoning;

    // Retired controls/data fields are fixed at runtime: tokenizer always
    // best-match, padding 64, name2/trim always on, no bias/stop-string fields,
    // story string/context/instruct templates frozen at shipped defaults, and
    // custom CSS / truncation window are fixed constants.
    for (const key of ['tokenizer', 'token_padding', 'always_force_name2',
        'user_prompt_bias', 'smooth_streaming', 'trim_spaces',
        'custom_stopping_strings', 'stscript', 'instruct', 'context',
        'chat_truncation', 'custom_css', 'pin_examples', 'strip_examples',
        'movingUI', 'movingUIState', 'movingUIPreset', 'max_context_unlocked',
        'ui_mode', 'charListGrid']) {
        delete power_user[key];
    }


    const sortSelector = /** @type {HTMLSelectElement|null} */ (document.getElementById('character_sort_order'));
    const savedSort = Array.from(sortSelector?.options ?? []).find(option =>
        option.dataset.order === power_user.sort_order && option.dataset.field === power_user.sort_field);
    if (savedSort) savedSort.selected = true;
    switchReducedMotion();
    reloadMarkdownProcessor();
    applyToastrPosition();
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
 * @param {Object<string, *>} [options.customContextSettings] Custom context settings.
 * @returns {string} The rendered story string.
 */
export function renderStoryString(params, { customStoryString = null, customContextSettings = null, promptMap = undefined } = {}) {
    try {
        const contextSettings = structuredClone({ ...DEFAULT_CONTEXT, ...customContextSettings });
        const storyString = customStoryString ?? contextSettings.story_string;
        const storyStringPosition = contextSettings.story_string_position ?? extension_prompt_types.IN_PROMPT;

        // Validate and log possible warnings/errors
        validateStoryString(storyString, params);

        // compile the story string template into a function, with no HTML escaping
        const compiledTemplate = Handlebars.compile(storyString, { noEscape: true });

        // render the story string template with the given params
        let output = compiledTemplate(params);

        // substitute {{macro}} params that are not defined in the story string
        output = substituteParams(output, { name1Override: params.user, name2Override: params.char, promptMap });

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
export function applyCharacterSortSelection({ field, order, rule }) {
    if (field !== 'search') {
        power_user.sort_field = String(field);
        power_user.sort_order = order;
        power_user.sort_rule = rule;
        markCharacterSortChanged();
    }
    printCharactersDebounced();
    saveSettingsDebounced();
}

export function sortEntitiesList(entities, forceSearch, filterHelper = null) {
    filterHelper = filterHelper ?? entitiesFilter;
    if (power_user.sort_field == undefined || entities.length === 0) {
        return;
    }

    const isSearch = forceSearch || !!document.querySelector('#character_sort_order option[data-field="search"]:checked');

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
    // Only ephemeral (command-injected) stopping strings remain; the
    // persistent custom stopping strings setting was retired.
    const strings = [...EPHEMERAL_STOPPING_STRINGS];

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
    $(window).on('resize', async () => {
        setHotswapsDebounced();
    });
});

