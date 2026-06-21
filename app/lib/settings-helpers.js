export const settingsTabDefinitions = [
    {
        id: 'general',
        label: 'General',
        description: '全局 chat-completion 默认行为、采样和 continue / reasoning 控制。',
    },
    {
        id: 'providers',
        label: 'Providers',
        description: '主 provider 路由、fallback、Vertex AI 和连接级参数。',
    },
    {
        id: 'userInterface',
        label: 'User Interface',
        description: '主题、布局、通知和工作区显示偏好。',
    },
    {
        id: 'advanced',
        label: 'Advanced',
        description: '模板、auto-swipe、tokenizer、reasoning 和 STscript power-user 设置。',
    },
];

export const providerOptions = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'claude', label: 'Claude' },
    { value: 'makersuite', label: 'Google' },
];

export const providerSecretKeyBySource = {
    openai: 'api_key_openai',
    claude: 'api_key_claude',
    makersuite: 'api_key_makersuite',
};

export const providerModelFieldBySource = {
    openai: {
        name: 'providers.openaiModel',
        placeholder: 'gpt-5.2',
        description: 'OpenAI primary path 当前使用的模型名称。',
    },
    claude: {
        name: 'providers.claudeModel',
        placeholder: 'claude-sonnet-4-5',
        description: 'Claude primary path 当前使用的模型名称。',
    },
    makersuite: {
        name: 'providers.googleModel',
        placeholder: 'gemini-2.5-pro',
        description: 'Google primary path 当前使用的模型名称。',
    },
};

export const reasoningEffortOptions = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'min', label: 'Min' },
    { value: 'max', label: 'Max' },
    { value: 'none', label: 'None' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'xhigh', label: 'XHigh' },
];

export const promptPostProcessingOptions = [
    { value: '', label: 'None' },
    { value: 'merge_tools', label: 'Merge Tools' },
    { value: 'semi_tools', label: 'Semi Tools' },
    { value: 'strict_tools', label: 'Strict Tools' },
    { value: 'merge', label: 'Merge' },
    { value: 'semi', label: 'Semi' },
    { value: 'strict', label: 'Strict' },
    { value: 'single', label: 'Single' },
];

export const vertexAuthModeOptions = [
    { value: 'express', label: 'Express' },
    { value: 'full', label: 'Service Account' },
];

export const toastPositionOptions = [
    { value: 'toast-top-left', label: 'Top Left' },
    { value: 'toast-top-center', label: 'Top Center' },
    { value: 'toast-top-right', label: 'Top Right' },
    { value: 'toast-bottom-left', label: 'Bottom Left' },
    { value: 'toast-bottom-center', label: 'Bottom Center' },
    { value: 'toast-bottom-right', label: 'Bottom Right' },
];

export const avatarStyleOptions = [
    { value: '0', label: 'Round' },
    { value: '1', label: 'Rectangular' },
    { value: '2', label: 'Square' },
    { value: '3', label: 'Rounded' },
];

export const chatDisplayOptions = [
    { value: '0', label: 'Default' },
    { value: '1', label: 'Bubbles' },
    { value: '2', label: 'Document' },
];

export const defaultSettingsFormValues = {
    general: {
        presetSettings: '',
        openaiMaxContext: 4095,
        openaiMaxTokens: 300,
        streamOpenai: true,
        temperature: 0.7,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topP: 1,
        topK: 0,
        enableWebSearch: false,
        functionCalling: false,
        showThoughts: true,
        reasoningEffort: 'high',
        continuePrefill: false,
        continuePostfix: ' ',
        squashSystemMessages: false,
        customPromptPostProcessing: '',
    },
    providers: {
        chatCompletionSource: 'openai',
        openaiModel: '',
        claudeModel: '',
        googleModel: '',
        reverseProxy: '',
        proxyPassword: '',
        customUrl: '',
        customIncludeBody: '',
        customExcludeBody: '',
        customIncludeHeaders: '',
        useVertexAi: false,
        vertexaiAuthMode: 'express',
        vertexaiRegion: 'us-central1',
        vertexaiExpressProjectId: '',
        fallbackProviderEnabled: false,
        fallbackProviderBaseUrl: '',
        fallbackProviderModel: '',
        bindPresetToConnection: true,
    },
    userInterface: {
        theme: '',
        chatWidth: 50,
        fontScale: 1,
        customCss: '',
        movingUI: false,
        movingUIPreset: '',
        fastUiMode: true,
        reducedMotion: false,
        noShadows: false,
        toastrPosition: 'toast-top-center',
        avatarStyle: 0,
        chatDisplay: 0,
        timerEnabled: true,
        timestampsEnabled: true,
        timestampModelIcon: false,
        mesIDDisplayEnabled: false,
        hideChatAvatarsEnabled: false,
        compactInputArea: true,
    },
    advanced: {
        autoSwipe: false,
        autoSwipeMinimumLength: 0,
        autoSwipeBlacklist: '',
        autoSwipeBlacklistThreshold: 2,
        customStoppingStrings: '',
        tokenizer: 99,
        customStoppingStringsMacro: true,
        experimentalMacroEngine: true,
        autoContinueEnabled: false,
        autoContinueAllowChatCompletions: false,
        autoContinueTargetLength: 400,
        chatTruncation: 100,
        streamingFps: 30,
        smoothStreaming: false,
        smoothStreamingNoThink: false,
        smoothStreamingSpeed: 50,
        streamFadeIn: false,
        instructEnabled: false,
        instructPreset: 'Alpaca',
        instructWrap: true,
        instructMacro: true,
        instructSequencesAsStopStrings: true,
        instructSkipExamples: false,
        instructBindToContext: false,
        instructActivationRegex: '',
        systemPromptName: '',
        systemPromptContent: '',
        contextPreset: '',
        contextStoryString: '',
        contextChatStart: '',
        contextExampleSeparator: '',
        contextUseStopStrings: true,
        contextNamesAsStopStrings: true,
        syspromptEnabled: true,
        syspromptPostHistory: '',
        reasoningName: 'Default',
        reasoningAutoParse: false,
        reasoningAddToPrompts: false,
        reasoningAutoExpand: false,
        reasoningShowHidden: false,
        reasoningPrefix: '<think>',
        reasoningSuffix: '</think>',
        reasoningSeparator: '\n',
        reasoningMaxAdditions: 1,
        stscriptMatching: 'fuzzy',
        stscriptAutocompleteState: 2,
        stscriptAutocompleteAutoHide: false,
        stscriptAutocompleteStyle: 'theme',
        stscriptAutocompleteSelect: 3,
        stscriptAutocompleteShowInAllMacroFields: false,
        stscriptAutocompleteFontScale: 0.8,
        stscriptAutocompleteWidthLeft: 0,
        stscriptAutocompleteWidthRight: 0,
        stscriptParserFlagStrictEscaping: false,
        stscriptParserFlagReplaceGetvar: false,
    },
};

function parseBlacklistToFormValue(value) {
    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return typeof value === 'string' ? value : '';
}

function parseBlacklistToSettingsValue(value) {
    return String(value ?? '')
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean);
}

function mapChatCompletionSourceToFormValue(value) {
    return value === 'vertexai' ? 'makersuite' : value;
}

function mapChatCompletionSourceToSettingsValue(value, formValues, baseSettings) {
    const baseSource = getValueAtPath(baseSettings, 'oai_settings.chat_completion_source');
    const usesVertexAi = getValueAtPath(formValues, 'providers.useVertexAi') === true;

    if (baseSource === 'vertexai' && value === 'makersuite' && usesVertexAi) {
        return 'vertexai';
    }

    return value;
}

function mapUseVertexAiToFormValue(value, settings) {
    if (getValueAtPath(settings, 'oai_settings.chat_completion_source') === 'vertexai') {
        return true;
    }

    return value;
}

const fieldBindings = [
    { tab: 'general', formPath: 'general.presetSettings', settingsPath: 'oai_settings.preset_settings_openai' },
    { tab: 'general', formPath: 'general.openaiMaxContext', settingsPath: 'oai_settings.openai_max_context' },
    { tab: 'general', formPath: 'general.openaiMaxTokens', settingsPath: 'oai_settings.openai_max_tokens' },
    { tab: 'general', formPath: 'general.streamOpenai', settingsPath: 'oai_settings.stream_openai' },
    { tab: 'general', formPath: 'general.temperature', settingsPath: 'oai_settings.temp_openai' },
    { tab: 'general', formPath: 'general.frequencyPenalty', settingsPath: 'oai_settings.freq_pen_openai' },
    { tab: 'general', formPath: 'general.presencePenalty', settingsPath: 'oai_settings.pres_pen_openai' },
    { tab: 'general', formPath: 'general.topP', settingsPath: 'oai_settings.top_p_openai' },
    { tab: 'general', formPath: 'general.topK', settingsPath: 'oai_settings.top_k_openai' },
    { tab: 'general', formPath: 'general.enableWebSearch', settingsPath: 'oai_settings.enable_web_search' },
    { tab: 'general', formPath: 'general.functionCalling', settingsPath: 'oai_settings.function_calling' },
    { tab: 'general', formPath: 'general.showThoughts', settingsPath: 'oai_settings.show_thoughts' },
    { tab: 'general', formPath: 'general.reasoningEffort', settingsPath: 'oai_settings.reasoning_effort' },
    { tab: 'general', formPath: 'general.continuePrefill', settingsPath: 'oai_settings.continue_prefill' },
    { tab: 'general', formPath: 'general.continuePostfix', settingsPath: 'oai_settings.continue_postfix' },
    { tab: 'general', formPath: 'general.squashSystemMessages', settingsPath: 'oai_settings.squash_system_messages' },
    { tab: 'general', formPath: 'general.customPromptPostProcessing', settingsPath: 'oai_settings.custom_prompt_post_processing' },

    {
        tab: 'providers',
        formPath: 'providers.chatCompletionSource',
        settingsPath: 'oai_settings.chat_completion_source',
        toForm: mapChatCompletionSourceToFormValue,
        toSettings: mapChatCompletionSourceToSettingsValue,
    },
    { tab: 'providers', formPath: 'providers.openaiModel', settingsPath: 'oai_settings.openai_model' },
    { tab: 'providers', formPath: 'providers.claudeModel', settingsPath: 'oai_settings.claude_model' },
    { tab: 'providers', formPath: 'providers.googleModel', settingsPath: 'oai_settings.google_model' },
    { tab: 'providers', formPath: 'providers.reverseProxy', settingsPath: 'oai_settings.reverse_proxy' },
    { tab: 'providers', formPath: 'providers.proxyPassword', settingsPath: 'oai_settings.proxy_password' },
    { tab: 'providers', formPath: 'providers.customUrl', settingsPath: 'oai_settings.custom_url' },
    { tab: 'providers', formPath: 'providers.customIncludeBody', settingsPath: 'oai_settings.custom_include_body' },
    { tab: 'providers', formPath: 'providers.customExcludeBody', settingsPath: 'oai_settings.custom_exclude_body' },
    { tab: 'providers', formPath: 'providers.customIncludeHeaders', settingsPath: 'oai_settings.custom_include_headers' },
    {
        tab: 'providers',
        formPath: 'providers.useVertexAi',
        settingsPath: 'oai_settings.use_vertexai',
        toForm: mapUseVertexAiToFormValue,
        toFormWhenMissing: true,
    },
    { tab: 'providers', formPath: 'providers.vertexaiAuthMode', settingsPath: 'oai_settings.vertexai_auth_mode' },
    { tab: 'providers', formPath: 'providers.vertexaiRegion', settingsPath: 'oai_settings.vertexai_region' },
    { tab: 'providers', formPath: 'providers.vertexaiExpressProjectId', settingsPath: 'oai_settings.vertexai_express_project_id' },
    { tab: 'providers', formPath: 'providers.fallbackProviderEnabled', settingsPath: 'oai_settings.fallback_provider_enabled' },
    { tab: 'providers', formPath: 'providers.fallbackProviderBaseUrl', settingsPath: 'oai_settings.fallback_provider_base_url' },
    { tab: 'providers', formPath: 'providers.fallbackProviderModel', settingsPath: 'oai_settings.fallback_provider_model' },
    { tab: 'providers', formPath: 'providers.bindPresetToConnection', settingsPath: 'oai_settings.bind_preset_to_connection' },

    { tab: 'userInterface', formPath: 'userInterface.theme', settingsPath: 'power_user.theme' },
    { tab: 'userInterface', formPath: 'userInterface.chatWidth', settingsPath: 'power_user.chat_width' },
    { tab: 'userInterface', formPath: 'userInterface.fontScale', settingsPath: 'power_user.font_scale' },
    { tab: 'userInterface', formPath: 'userInterface.customCss', settingsPath: 'power_user.custom_css' },
    { tab: 'userInterface', formPath: 'userInterface.movingUI', settingsPath: 'power_user.movingUI' },
    { tab: 'userInterface', formPath: 'userInterface.movingUIPreset', settingsPath: 'power_user.movingUIPreset' },
    { tab: 'userInterface', formPath: 'userInterface.fastUiMode', settingsPath: 'power_user.fast_ui_mode' },
    { tab: 'userInterface', formPath: 'userInterface.reducedMotion', settingsPath: 'power_user.reduced_motion' },
    { tab: 'userInterface', formPath: 'userInterface.noShadows', settingsPath: 'power_user.noShadows' },
    { tab: 'userInterface', formPath: 'userInterface.toastrPosition', settingsPath: 'power_user.toastr_position' },
    { tab: 'userInterface', formPath: 'userInterface.avatarStyle', settingsPath: 'power_user.avatar_style' },
    { tab: 'userInterface', formPath: 'userInterface.chatDisplay', settingsPath: 'power_user.chat_display' },
    { tab: 'userInterface', formPath: 'userInterface.timerEnabled', settingsPath: 'power_user.timer_enabled' },
    { tab: 'userInterface', formPath: 'userInterface.timestampsEnabled', settingsPath: 'power_user.timestamps_enabled' },
    { tab: 'userInterface', formPath: 'userInterface.timestampModelIcon', settingsPath: 'power_user.timestamp_model_icon' },
    { tab: 'userInterface', formPath: 'userInterface.mesIDDisplayEnabled', settingsPath: 'power_user.mesIDDisplay_enabled' },
    { tab: 'userInterface', formPath: 'userInterface.hideChatAvatarsEnabled', settingsPath: 'power_user.hideChatAvatars_enabled' },
    { tab: 'userInterface', formPath: 'userInterface.compactInputArea', settingsPath: 'power_user.compact_input_area' },

    { tab: 'advanced', formPath: 'advanced.autoSwipe', settingsPath: 'power_user.auto_swipe' },
    { tab: 'advanced', formPath: 'advanced.autoSwipeMinimumLength', settingsPath: 'power_user.auto_swipe_minimum_length' },
    {
        tab: 'advanced',
        formPath: 'advanced.autoSwipeBlacklist',
        settingsPath: 'power_user.auto_swipe_blacklist',
        toForm: parseBlacklistToFormValue,
        toSettings: parseBlacklistToSettingsValue,
    },
    { tab: 'advanced', formPath: 'advanced.autoSwipeBlacklistThreshold', settingsPath: 'power_user.auto_swipe_blacklist_threshold' },
    { tab: 'advanced', formPath: 'advanced.customStoppingStrings', settingsPath: 'power_user.custom_stopping_strings' },
    { tab: 'advanced', formPath: 'advanced.tokenizer', settingsPath: 'power_user.tokenizer' },
    { tab: 'advanced', formPath: 'advanced.customStoppingStringsMacro', settingsPath: 'power_user.custom_stopping_strings_macro' },
    { tab: 'advanced', formPath: 'advanced.experimentalMacroEngine', settingsPath: 'power_user.experimental_macro_engine' },
    { tab: 'advanced', formPath: 'advanced.autoContinueEnabled', settingsPath: 'power_user.auto_continue.enabled' },
    { tab: 'advanced', formPath: 'advanced.autoContinueAllowChatCompletions', settingsPath: 'power_user.auto_continue.allow_chat_completions' },
    { tab: 'advanced', formPath: 'advanced.autoContinueTargetLength', settingsPath: 'power_user.auto_continue.target_length' },
    { tab: 'advanced', formPath: 'advanced.chatTruncation', settingsPath: 'power_user.chat_truncation' },
    { tab: 'advanced', formPath: 'advanced.streamingFps', settingsPath: 'power_user.streaming_fps' },
    { tab: 'advanced', formPath: 'advanced.smoothStreaming', settingsPath: 'power_user.smooth_streaming' },
    { tab: 'advanced', formPath: 'advanced.smoothStreamingNoThink', settingsPath: 'power_user.smooth_streaming_no_think' },
    { tab: 'advanced', formPath: 'advanced.smoothStreamingSpeed', settingsPath: 'power_user.smooth_streaming_speed' },
    { tab: 'advanced', formPath: 'advanced.streamFadeIn', settingsPath: 'power_user.stream_fade_in' },
    { tab: 'advanced', formPath: 'advanced.instructEnabled', settingsPath: 'power_user.instruct.enabled' },
    { tab: 'advanced', formPath: 'advanced.instructPreset', settingsPath: 'power_user.instruct.preset' },
    { tab: 'advanced', formPath: 'advanced.instructWrap', settingsPath: 'power_user.instruct.wrap' },
    { tab: 'advanced', formPath: 'advanced.instructMacro', settingsPath: 'power_user.instruct.macro' },
    { tab: 'advanced', formPath: 'advanced.instructSequencesAsStopStrings', settingsPath: 'power_user.instruct.sequences_as_stop_strings' },
    { tab: 'advanced', formPath: 'advanced.instructSkipExamples', settingsPath: 'power_user.instruct.skip_examples' },
    { tab: 'advanced', formPath: 'advanced.instructBindToContext', settingsPath: 'power_user.instruct.bind_to_context' },
    { tab: 'advanced', formPath: 'advanced.instructActivationRegex', settingsPath: 'power_user.instruct.activation_regex' },
    { tab: 'advanced', formPath: 'advanced.systemPromptName', settingsPath: 'power_user.sysprompt.name' },
    { tab: 'advanced', formPath: 'advanced.systemPromptContent', settingsPath: 'power_user.sysprompt.content' },
    { tab: 'advanced', formPath: 'advanced.contextPreset', settingsPath: 'power_user.context.preset' },
    { tab: 'advanced', formPath: 'advanced.contextStoryString', settingsPath: 'power_user.context.story_string' },
    { tab: 'advanced', formPath: 'advanced.contextChatStart', settingsPath: 'power_user.context.chat_start' },
    { tab: 'advanced', formPath: 'advanced.contextExampleSeparator', settingsPath: 'power_user.context.example_separator' },
    { tab: 'advanced', formPath: 'advanced.contextUseStopStrings', settingsPath: 'power_user.context.use_stop_strings' },
    { tab: 'advanced', formPath: 'advanced.contextNamesAsStopStrings', settingsPath: 'power_user.context.names_as_stop_strings' },
    { tab: 'advanced', formPath: 'advanced.syspromptEnabled', settingsPath: 'power_user.sysprompt.enabled' },
    { tab: 'advanced', formPath: 'advanced.syspromptPostHistory', settingsPath: 'power_user.sysprompt.post_history' },
    { tab: 'advanced', formPath: 'advanced.reasoningName', settingsPath: 'power_user.reasoning.name' },
    { tab: 'advanced', formPath: 'advanced.reasoningAutoParse', settingsPath: 'power_user.reasoning.auto_parse' },
    { tab: 'advanced', formPath: 'advanced.reasoningAddToPrompts', settingsPath: 'power_user.reasoning.add_to_prompts' },
    { tab: 'advanced', formPath: 'advanced.reasoningAutoExpand', settingsPath: 'power_user.reasoning.auto_expand' },
    { tab: 'advanced', formPath: 'advanced.reasoningShowHidden', settingsPath: 'power_user.reasoning.show_hidden' },
    { tab: 'advanced', formPath: 'advanced.reasoningPrefix', settingsPath: 'power_user.reasoning.prefix' },
    { tab: 'advanced', formPath: 'advanced.reasoningSuffix', settingsPath: 'power_user.reasoning.suffix' },
    { tab: 'advanced', formPath: 'advanced.reasoningSeparator', settingsPath: 'power_user.reasoning.separator' },
    { tab: 'advanced', formPath: 'advanced.reasoningMaxAdditions', settingsPath: 'power_user.reasoning.max_additions' },
    { tab: 'advanced', formPath: 'advanced.stscriptMatching', settingsPath: 'power_user.stscript.matching' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteState', settingsPath: 'power_user.stscript.autocomplete.state' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteAutoHide', settingsPath: 'power_user.stscript.autocomplete.autoHide' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteStyle', settingsPath: 'power_user.stscript.autocomplete.style' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteSelect', settingsPath: 'power_user.stscript.autocomplete.select' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteShowInAllMacroFields', settingsPath: 'power_user.stscript.autocomplete.showInAllMacroFields' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteFontScale', settingsPath: 'power_user.stscript.autocomplete.font.scale' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteWidthLeft', settingsPath: 'power_user.stscript.autocomplete.width.left' },
    { tab: 'advanced', formPath: 'advanced.stscriptAutocompleteWidthRight', settingsPath: 'power_user.stscript.autocomplete.width.right' },
    { tab: 'advanced', formPath: 'advanced.stscriptParserFlagStrictEscaping', settingsPath: 'power_user.stscript.parser.flags.1' },
    { tab: 'advanced', formPath: 'advanced.stscriptParserFlagReplaceGetvar', settingsPath: 'power_user.stscript.parser.flags.2' },
];

export const settingsFormFieldPaths = fieldBindings.map(binding => binding.formPath);

export const settingsCoverage = {
    reactOwned: settingsTabDefinitions.reduce((accumulator, tab) => {
        accumulator[tab.id] = fieldBindings
            .filter(binding => binding.tab === tab.id)
            .map(binding => binding.settingsPath);
        return accumulator;
    }, {}),
    legacyOwned: [
        'preset_settings',
        'main_api',
        'max_context',
        'amount_gen',
        'world_info_settings',
        'extension_settings',
        'oai_settings.tool_reasoning_mode',
        'oai_settings.assistant_prefill',
        'oai_settings.assistant_impersonation',
        'oai_settings.names_behavior',
        'oai_settings.bias_preset_selected',
        'oai_settings.bias_presets',
        'oai_settings.request_images',
        'oai_settings.request_image_aspect_ratio',
        'oai_settings.request_image_resolution',
        'oai_settings.bind_preset_to_connection_profiles',
        'power_user.movingUIState',
        'power_user.main_text_color',
        'power_user.italics_text_color',
        'power_user.underline_text_color',
        'power_user.quote_text_color',
        'power_user.blur_tint_color',
        'power_user.chat_tint_color',
        'power_user.user_mes_blur_tint_color',
        'power_user.bot_mes_blur_tint_color',
        'power_user.shadow_color',
        'power_user.border_color',
        'power_user.personas',
        'power_user.persona_description',
        'power_user.persona_show_notifications',
        'power_user.message_token_count_enabled',
        'power_user.expand_message_actions',
        'power_user.pin_styles',
        'tags',
        'tag_map',
    ],
};

export function getProviderModelFieldConfig(source) {
    return providerModelFieldBySource[source] ?? providerModelFieldBySource.openai;
}

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

    return {
        rawSettings,
        settings,
        payload,
    };
}

export function buildSettingsFormDefaults(settings) {
    const defaults = structuredClone(defaultSettingsFormValues);

    for (const binding of fieldBindings) {
        const currentValue = getValueAtPath(settings, binding.settingsPath, undefined);
        if (currentValue === undefined && binding.toFormWhenMissing !== true) {
            continue;
        }

        const nextValue = typeof binding.toForm === 'function'
            ? binding.toForm(currentValue, settings)
            : currentValue;

        setValueAtPath(defaults, binding.formPath, nextValue);
    }

    return defaults;
}

export function buildSettingsSavePayload(baseSettings, formValues) {
    const nextSettings = structuredClone(baseSettings && typeof baseSettings === 'object' ? baseSettings : {});

    for (const binding of fieldBindings) {
        const formValue = getValueAtPath(formValues, binding.formPath);
        const nextValue = typeof binding.toSettings === 'function'
            ? binding.toSettings(formValue, formValues, baseSettings)
            : formValue;

        setValueAtPath(nextSettings, binding.settingsPath, nextValue);
    }

    return nextSettings;
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
