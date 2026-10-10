export const settingsTabDefinitions = [
    {
        id: 'providers',
        label: '服务',
        description: 'endpoint、API key、主模型与备选模型。',
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
};

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
];


/**
 * Owner inventory for settings retirement.
 * reactOwned paths come from fieldBindings; specializedSurfaces stay out of /settings.
 */
export const settingsOwnerInventory = {
    drawers: {
        userSettings: '#user-settings-block',
    },
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
        'oai_settings.continue_prefill',
        'oai_settings.continue_postfix',
        'oai_settings.squash_system_messages',
        'oai_settings.n',
        'oai_settings.verbosity',
        'oai_settings.media_inlining',
        'oai_settings.inline_image_quality',
        'oai_settings.tool_reasoning_mode',
        'oai_settings.send_if_empty',
        'oai_settings.impersonation_prompt',
        'oai_settings.new_chat_prompt',
        'oai_settings.new_example_chat_prompt',
        'oai_settings.continue_nudge_prompt',
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

    // The swipes toggle is retired; swipe buttons are always on.
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
