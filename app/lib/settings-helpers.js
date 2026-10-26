/**
 * Settings tabs rendered by the React surface.
 *
 * `labelKey` is the English source string and the translation key; the tab label
 * is resolved at render time so the tab follows the live locale.
 */
export const settingsTabDefinitions = [
    {
        id: 'providers',
        labelKey: 'Providers',
    },
];

export const providerSecretKeyBySource = {
    openai: 'api_key_openai',
};

export const defaultSettingsFormValues = {
    providers: {
        openaiModel: '',
        customUrl: '',
        fallbackProviderModel: '',
    },
    memory: {
        enabled: false,
        keepTurns: 5,
        role: 'system',
        prompt: '',
        wrap: '',
        maxTokens: 400,
    },
    // Mirrors DEFAULT_FRONTEND_FRAME_SETTINGS in public/scripts/frontend-frame.js —
    // the message-rendering fields merged in from the retired user-settings drawer.
    rendering: {
        frontendFramesEnabled: true,
        frontendFramesDepth: 0,
        frontendFramesDepthIgnoreHidden: true,
        frontendFramesCollapseCodeBlock: 'frontend_only',
        frontendFramesSkipHighlight: true,
        frontendFramesUseBlobUrl: false,
        frontendFramesAllowStreaming: false,
    },
};

const FRONTEND_FRAME_COLLAPSE_MODES = ['all', 'frontend_only', 'none'];

function boolOr(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

const fieldBindings = [

    { tab: 'providers', formPath: 'providers.openaiModel', settingsPath: 'oai_settings.openai_model' },
    { tab: 'providers', formPath: 'providers.customUrl', settingsPath: 'oai_settings.custom_url' },
    {
        tab: 'providers',
        formPath: 'providers.fallbackProviderModel',
        settingsPath: 'oai_settings.fallback_provider_model',
        // Under the retired contract an unchecked fallback meant "off"; a stale model
        // value must not silently re-enable it under "non-empty model = enabled".
        toForm: (value, settings) => (getValueAtPath(settings, 'oai_settings.fallback_provider_enabled') === false ? '' : value),
    },
    // Chat memory (round summarization) — oai_settings-owned, edited here so the
    // background model + memory parameters live in one place.
    {
        tab: 'providers',
        formPath: 'memory.enabled',
        settingsPath: 'oai_settings.chat_memory_enabled',
        toForm: value => boolOr(value, false),
    },
    {
        tab: 'providers',
        formPath: 'memory.keepTurns',
        settingsPath: 'oai_settings.chat_memory_keep_turns',
        toForm: value => {
            const numeric = Number(value);
            return Number.isInteger(numeric) && numeric >= 1 ? numeric : 5;
        },
    },
    {
        tab: 'providers',
        formPath: 'memory.role',
        settingsPath: 'oai_settings.chat_memory_role',
        toForm: value => ['system', 'user', 'assistant'].includes(value) ? value : 'system',
    },
    {
        tab: 'providers',
        formPath: 'memory.prompt',
        settingsPath: 'oai_settings.chat_memory_prompt',
        toForm: value => (typeof value === 'string' ? value : ''),
    },
    {
        tab: 'providers',
        formPath: 'memory.wrap',
        settingsPath: 'oai_settings.chat_memory_wrap',
        toForm: value => (typeof value === 'string' ? value : ''),
    },
    {
        tab: 'providers',
        formPath: 'memory.maxTokens',
        settingsPath: 'oai_settings.chat_memory_max_tokens',
        toForm: value => {
            const numeric = Number(value);
            return Number.isInteger(numeric) && numeric > 0 ? numeric : 400;
        },
    },
    // Frontend Frames rendering settings — previously legacy-bound checkboxes in
    // the retired #user-settings-block drawer. toForm mirrors
    // normalizeFrontendFramesSettings so partial/garbage stored values fall back
    // to shipped defaults instead of leaking into the form.
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesEnabled',
        settingsPath: 'power_user.frontend_frames.enabled',
        toForm: value => boolOr(value, true),
    },
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesDepth',
        settingsPath: 'power_user.frontend_frames.depth',
        toForm: value => {
            const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
            return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
        },
    },
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesDepthIgnoreHidden',
        settingsPath: 'power_user.frontend_frames.depth_ignore_hidden',
        toForm: value => boolOr(value, true),
    },
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesCollapseCodeBlock',
        settingsPath: 'power_user.frontend_frames.collapse_code_block',
        toForm: value => (FRONTEND_FRAME_COLLAPSE_MODES.includes(value) ? value : 'frontend_only'),
    },
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesSkipHighlight',
        settingsPath: 'power_user.frontend_frames.skip_highlight',
        toForm: value => boolOr(value, true),
    },
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesUseBlobUrl',
        settingsPath: 'power_user.frontend_frames.use_blob_url',
        toForm: value => boolOr(value, false),
    },
    {
        tab: 'providers',
        formPath: 'rendering.frontendFramesAllowStreaming',
        settingsPath: 'power_user.frontend_frames.allow_streaming',
        toForm: value => boolOr(value, false),
    },
];


/**
 * Owner inventory for settings retirement.
 * reactOwned paths come from fieldBindings; specializedSurfaces stay out of /settings.
 */
export const settingsOwnerInventory = {
    // No legacy-owned settings drawers remain: the former user-settings-block
    // Frontend Frames surface is bound into the providers tab above.
    drawers: {},
    specializedSurfaces: [
        'world_info_settings',
        'feature_settings',
        'tags',
        'tag_map',
    ],
    complexManagers: [
        'oai_settings.prompts',
        'oai_settings.prompt_order',
        'oai_settings.extensions',
        'power_user.servers',
    ],
    textGenRoots: [
        'preset_settings',
        'main_api',
        'max_context',
        'amount_gen',
    ],
};

export const settingsFormFieldPaths = fieldBindings.map(binding => binding.formPath);

export const settingsCoverage = {
    reactOwned: settingsTabDefinitions.reduce((accumulator, tab) => {
        accumulator[tab.id] = fieldBindings
            .filter(binding => binding.tab === tab.id)
            .map(binding => binding.settingsPath);
        return accumulator;
    }, {}),
    legacyOwned: [
        // Text-gen root + specialized surfaces (not general settings drawers)
        'preset_settings',
        'main_api',
        'max_context',
        'amount_gen',
        'world_info_settings',
        'feature_settings',
        // Generation defaults: edited by the AI Response Configuration / preset
        // drawer, not the React Settings surface.
        'oai_settings.preset_settings_openai',
        'oai_settings.openai_max_context',
        'oai_settings.openai_max_tokens',
        'oai_settings.stream_openai',
        'oai_settings.temp_openai',
        'oai_settings.freq_pen_openai',
        'oai_settings.pres_pen_openai',
        'oai_settings.top_p_openai',
        'oai_settings.show_thoughts',
        'oai_settings.reasoning_effort',
        'oai_settings.squash_system_messages',
        'oai_settings.verbosity',
        'oai_settings.media_inlining',
        'oai_settings.inline_image_quality',
        'oai_settings.tool_reasoning_mode',
        'oai_settings.send_if_empty',
        'oai_settings.new_chat_prompt',
        'oai_settings.new_example_chat_prompt',
        'oai_settings.wi_format',
        'oai_settings.description_format',
        'oai_settings.names_behavior',
        // Complex managers / runtime-only surfaces
        'oai_settings.prompts',
        'oai_settings.prompt_order',
        'oai_settings.extensions',
        'power_user.servers',
        'tags',
        'tag_map',
    ],
};

export function getValueAtPath(source, path, fallbackValue = undefined) {
    if (!source || typeof source !== 'object') {
        return fallbackValue;
    }

    const segments = path.split('.');
    let currentValue = source;

    for (const segment of segments) {
        if (!currentValue || typeof currentValue !== 'object' || !(segment in currentValue)) {
            return fallbackValue;
        }

        currentValue = currentValue[segment];
    }

    return currentValue ?? fallbackValue;
}

export function setValueAtPath(target, path, value) {
    const segments = path.split('.');
    let currentValue = target;

    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        if (!currentValue[segment] || typeof currentValue[segment] !== 'object') {
            currentValue[segment] = {};
        }

        currentValue = currentValue[segment];
    }

    currentValue[segments[segments.length - 1]] = value;
}

export function parseSettingsPayload(payload) {
    const rawSettings = typeof payload?.settings === 'string' ? payload.settings : '{}';
    let settings = {};

    try {
        settings = JSON.parse(rawSettings);
    } catch {
        settings = {};
    }

    const revisionRaw = payload?.settings_revision;
    const settingsRevision = Number.isFinite(Number(revisionRaw)) ? Number(revisionRaw) : null;

    return {
        rawSettings,
        settings,
        settingsRevision,
        payload,
    };
}

export function buildSettingsFormDefaults(settings) {
    const defaults = globalThis.structuredClone(defaultSettingsFormValues);

    for (const binding of fieldBindings) {
        const currentValue = getValueAtPath(settings, binding.settingsPath, undefined);
        if (currentValue === undefined && binding.toFormWhenMissing !== true) {
            continue;
        }

        let nextValue = typeof binding.toForm === 'function'
            ? binding.toForm(currentValue, settings)
            : currentValue;

        // Legacy settings files often store numeric enums as strings. Coerce when the form
        // default for that path is a number so Zod/select number fields stay valid.
        const defaultValue = getValueAtPath(defaults, binding.formPath);
        if (typeof defaultValue === 'number' && typeof nextValue === 'string' && nextValue.trim() !== '' && Number.isFinite(Number(nextValue))) {
            nextValue = Number(nextValue);
        }

        setValueAtPath(defaults, binding.formPath, nextValue);
    }

    return defaults;
}

function areFormValuesEqual(left, right) {
    if (Object.is(left, right)) {
        return true;
    }

    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
        return false;
    }

    return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * @param {object} baseSettings
 * @param {object} formValues
 * @param {{ settingsRevision?: number | null, baselineFormValues?: object | null }} [options]
 * @returns {import('../compat/runtime-port').SettingsDocument}
 */
export function buildSettingsSavePayload(baseSettings, formValues, { settingsRevision = null, baselineFormValues = null } = {}) {
    const nextSettings = globalThis.structuredClone(baseSettings && typeof baseSettings === 'object' ? baseSettings : {});

    for (const binding of fieldBindings) {
        const formValue = getValueAtPath(formValues, binding.formPath);
        const baselineValue = baselineFormValues
            ? getValueAtPath(baselineFormValues, binding.formPath)
            : undefined;
        const saveWhenDependencyChanged = baselineFormValues
            && Array.isArray(binding.saveWhenFormPathsChanged)
            && binding.saveWhenFormPathsChanged.some(path => !areFormValuesEqual(
                getValueAtPath(formValues, path),
                getValueAtPath(baselineFormValues, path),
            ));
        // Partial form objects (tests or progressive UI) must not wipe unbound paths with undefined.
        if (formValue === undefined && typeof binding.toSettings !== 'function') {
            continue;
        }

        if (baselineFormValues && areFormValuesEqual(formValue, baselineValue) && !saveWhenDependencyChanged) {
            continue;
        }

        const nextValue = typeof binding.toSettings === 'function'
            ? binding.toSettings(formValue, formValues, baseSettings)
            : formValue;

        if (nextValue === undefined) {
            continue;
        }

        setValueAtPath(nextSettings, binding.settingsPath, nextValue);
    }

    // Retired provider contract: the settings form owns exactly one URL, one key,
    // one model, and one fallback model. Strip legacy routing keys so a save cannot
    // resurrect them, and fold the retired reverse-proxy URL into custom_url.
    const oaiSettings = getValueAtPath(nextSettings, 'oai_settings');
    if (oaiSettings && typeof oaiSettings === 'object') {
        if (oaiSettings.reverse_proxy && !oaiSettings.custom_url) {
            oaiSettings.custom_url = oaiSettings.reverse_proxy;
        }
        // Single-provider contract: every saved document normalizes the source.
        oaiSettings.chat_completion_source = 'openai';
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
            delete oaiSettings[key];
        }
    }

    // Retired power_user contract: the settings surface no longer owns these
    // keys. Strip them on save so legacy values cannot linger forever; code
    // paths that still honor a fixed behavior use constants, not this store.
    const powerUser = getValueAtPath(nextSettings, 'power_user');
    if (powerUser && typeof powerUser === 'object') {
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
            'chat_width', 'font_scale', 'fast_ui_mode',
            'reduced_motion', 'noShadows', 'chat_display', 'timestamps_enabled',
            'compact_input_area', 'media_display', 'send_on_enter',
            'auto_fix_generated_markdown', 'forbid_external_media',
            'message_token_count_enabled',
            // Retired controls/data fields; runtime uses fixed constants or
            // frozen shipped defaults.
            'custom_stopping_strings', 'tokenizer', 'token_padding',
            'smooth_streaming', 'always_force_name2', 'trim_spaces',
            'user_prompt_bias', 'stscript', 'instruct', 'context',
            'chat_truncation', 'custom_css', 'pin_examples', 'strip_examples',
            'movingUI', 'movingUIState', 'movingUIPreset', 'max_context_unlocked',
            'ui_mode',
        ]) {
            delete powerUser[key];
        }
        // Global system prompt and configurable reasoning template are retired;
        // runtime uses fixed markers and card/Prompt Manager prompts.
        delete powerUser.sysprompt;
        delete powerUser.reasoning;
    }

    // The swipes toggle and swipe generation are retired; strip on save.
    delete nextSettings.swipes;

    if (settingsRevision != null && Number.isFinite(Number(settingsRevision))) {
        nextSettings.settings_revision = Number(settingsRevision);
    }

    return nextSettings;
}

/**
 * Sends a saved Settings document through the injected runtime command port.
 *
 * @param {import('../compat/runtime-port').SettingsDocument} settings
 * @param {{ commands?: { saveSettings?: (settings: import('../compat/runtime-port').SettingsDocument) => Promise<void> } }|undefined} [runtime]
 * @returns {Promise<boolean>}
 */
export async function saveSettingsToRuntime(settings, runtime) {
    if (
        !runtime
        || typeof runtime !== 'object'
        || !runtime.commands
        || typeof runtime.commands.saveSettings !== 'function'
        || !settings
        || typeof settings !== 'object'
    ) {
        return false;
    }

    await runtime.commands.saveSettings(settings);
    return true;
}

export function getFieldErrorMessage(errors) {
    if (!Array.isArray(errors) || errors.length === 0) {
        return '';
    }

    const [firstError] = errors;

    if (typeof firstError === 'string') {
        return firstError;
    }

    if (firstError && typeof firstError === 'object' && typeof firstError.message === 'string' && firstError.message.length > 0) {
        return firstError.message;
    }

    return String(firstError);
}
