import { Fuse, Handlebars } from '../lib.js';

import {
    saveSettingsDebounced,
    scrollChatToBottom,
    characters,
    reloadMarkdownProcessor,
    reloadCurrentChat,
    substituteParams,
    printCharactersDebounced,
    setCharacterId,
    setEditedMessageId,
    chat,
    getFirstDisplayedMessageId,
    showMoreMessages,
    saveChatConditional,
    setAnimationDuration,
    ANIMATION_DURATION_DEFAULT,
    setActiveCharacter,
    entitiesFilter,
    doNewChat,
    messageFormatting,
    extension_prompt_types,
    deleteMessage,
} from '../script.js';
import { favsToHotswap } from './RossAscends-mods.js';

import { tag_map, tag_sort_mode, tags } from './tags.js';

import { debounce, delay, getStringHash, isTrueBoolean, shuffle, sortMoments, stringToRange, timestampToMoment } from './utils.js';
import { FILTER_TYPES, fuzzySearchCategories } from './filters.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { accountStorage } from './util/AccountStorage.js';
import { fixToastrForDialogs } from './popup.js';
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
    charListGrid: false,

    frontend_frames: { ...DEFAULT_FRONTEND_FRAME_SETTINGS },

    sort_field: 'name',
    sort_order: 'asc',
    sort_rule: null,

    tag_sort_mode: tag_sort_mode.MANUAL,


    servers: [],
    show_tag_filters: false,
    auto_connect: true,
    external_media_allowed_overrides: [],
    external_media_forbidden_overrides: [],
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

//MARK: loadPowerUser
export async function loadPowerUserSettings(settings) {
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
        'ui_mode']) {
        delete power_user[key];
    }


    $('#frontend_frames_enabled').prop('checked', power_user.frontend_frames.enabled);
    $('#frontend_frames_depth').val(power_user.frontend_frames.depth);
    $('#frontend_frames_depth_ignore_hidden').prop('checked', power_user.frontend_frames.depth_ignore_hidden);
    $('#frontend_frames_collapse_code_block').val(power_user.frontend_frames.collapse_code_block);
    $('#frontend_frames_skip_highlight').prop('checked', power_user.frontend_frames.skip_highlight);
    $('#frontend_frames_use_blob_url').prop('checked', power_user.frontend_frames.use_blob_url);
    $('#frontend_frames_allow_streaming').prop('checked', power_user.frontend_frames.allow_streaming);
    $(`#character_sort_order option[data-order="${power_user.sort_order}"][data-field="${power_user.sort_field}"]`).prop('selected', true);
    switchReducedMotion();
    reloadMarkdownProcessor();
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
 * @param {Object<string, *>} [options.customContextSettings] Custom context settings.
 * @returns {string} The rendered story string.
 */
export function renderStoryString(params, { customStoryString = null, customContextSettings = null } = {}) {
    try {
        const contextSettings = structuredClone({ ...DEFAULT_CONTEXT, ...(customContextSettings ?? {}) });
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

