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

export const namesBehaviorOptions = [
    { value: '-1', label: 'None' },
    { value: '0', label: 'Default' },
    { value: '1', label: 'Completion' },
    { value: '2', label: 'Content' },
];

export const toolReasoningModeOptions = [
    { value: 'disabled', label: 'Disabled' },
    { value: 'since_last_user', label: 'Since Last User' },
    { value: 'active_chain', label: 'Active Tool Chain' },
];

export const verbosityOptions = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

export const mediaDisplayOptions = [
    { value: 'list', label: 'List' },
    { value: 'gallery', label: 'Gallery' },
];

export const sendOnEnterOptions = [
    { value: '-1', label: 'Disabled' },
    { value: '0', label: 'Automatic' },
    { value: '1', label: 'Enabled' },
];

export const imageOverswipeOptions = [
    { value: 'generate', label: 'Generate new' },
    { value: 'rollover', label: 'Roll over' },
];

export const tagImportSettingOptions = [
    { value: '1', label: 'Ask' },
    { value: '2', label: 'None' },
    { value: '3', label: 'All' },
    { value: '4', label: 'Existing' },
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
        n: 1,
        verbosity: "auto",
        mediaInlining: true,
        inlineImageQuality: "auto",
        requestImages: false,
        requestImageAspectRatio: "",
        requestImageResolution: "",
        toolReasoningMode: "disabled",
        toolCallRecurseLimit: 5,
        sendIfEmpty: "",
        impersonationPrompt: "",
        newChatPrompt: "",
        newGroupChatPrompt: "",
        newExampleChatPrompt: "",
        continueNudgePrompt: "",
        wiFormat: "",
        scenarioFormat: "",
        personalityFormat: "",
        groupNudgePrompt: "",
        assistantPrefill: "",
        assistantImpersonation: "",
        namesBehavior: 0,
        biasPresetSelected: "Default (none)",
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
        connectionProfileId: '',
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
        waifuMode: false,
        expandMessageActions: false,
        enableZenSliders: false,
        enableLabMode: false,
        messageTokenCountEnabled: false,
        showSwipeNumAllMessages: false,
        hotswapEnabled: true,
        zoomedAvatarMagnification: false,
        bogusFolders: false,
        clickToEdit: false,
        mediaDisplay: "list",
        blurStrength: 10,
        shadowWidth: 2,
        mainTextColor: "rgba(220, 220, 210, 1)",
        italicsTextColor: "rgba(190, 190, 190, 1)",
        underlineTextColor: "rgba(190, 190, 190, 1)",
        quoteTextColor: "rgba(225, 138, 36, 1)",
        blurTintColor: "rgba(0, 0, 0, 1)",
        chatTintColor: "rgba(0, 0, 0, 1)",
        userMesBlurTintColor: "rgba(0, 0, 0, 1)",
        botMesBlurTintColor: "rgba(0, 0, 0, 1)",
        shadowColor: "rgba(0, 0, 0, 1)",
        borderColor: "rgba(0, 0, 0, 1)",
        playMessageSound: false,
        playSoundUnfocused: true,
        relaxedApiUrls: false,
        worldImportDialog: true,
        enableAutoSelectInput: false,
        enableMdHotkeys: false,
        restoreUserInput: true,
        sendOnEnter: 0,
        continueOnSend: false,
        quickContinue: true,
        quickImpersonate: true,
        gestures: true,
        autoLoadChat: true,
        autoScrollChatToBottom: true,
        autoSaveMsgEdits: true,
        confirmMessageDelete: true,
        autoFixGeneratedMarkdown: true,
        forbidExternalMedia: false,
        allowName1Display: true,
        allowName2Display: true,
        encodeTags: false,
        disableGroupTrimming: false,
        consoleLogPrompts: false,
        requestTokenProbabilities: false,
        showGroupChatQueue: false,
        pinStyles: true,
        fuzzySearch: false,
        preferCharacterPrompt: true,
        preferCharacterJailbreak: true,
        neverResizeAvatars: false,
        showCardAvatarUrls: false,
        spoilerFreeMode: false,
        imageOverswipe: "generate",
        auxField: "character_version",
        tagImportSetting: 1,
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
        collapseNewlines: false,
        alwaysForceName2: false,
        trimSentences: false,
        trimSpaces: true,
        singleLine: false,
        markdownEscapeStrings: "",
        userPromptBias: "",
        showUserPromptBias: true,
        tokenPadding: 64,
        instructDerived: false,
        contextDerived: false,
        contextSizeDerived: false,
        instructInputSequence: "",
        instructInputSuffix: "",
        instructOutputSequence: "",
        instructOutputSuffix: "",
        instructSystemSequence: "",
        instructSystemSuffix: "",
        instructLastSystemSequence: "",
        instructFirstInputSequence: "",
        instructFirstOutputSequence: "",
        instructLastInputSequence: "",
        instructLastOutputSequence: "",
        instructStoryStringPrefix: "",
        instructStoryStringSuffix: "",
        instructStopSequence: "",
        instructUserAlignmentMessage: "",
        instructSystemSameAsUser: false,
        instructNamesBehavior: "default",
        instructSeparatorSequence: "",
        contextStoryStringPosition: 0,
        contextStoryStringRole: 0,
        contextStoryStringDepth: 1,
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

    return value === true || value === 'true' || value === 1 || value === '1';
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
        saveWhenFormPathsChanged: ['providers.useVertexAi'],
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
    {
        tab: 'providers',
        formPath: 'providers.connectionProfileId',
        settingsPath: 'extension_settings.connectionManager.selectedProfile',
        toForm: (value) => (value == null ? '' : String(value)),
        toFormWhenMissing: true,
        toSettings: (value, _formValues, baseSettings) => {
            const normalized = value == null ? '' : String(value);
            const hasConnectionManager = getValueAtPath(baseSettings, 'extension_settings.connectionManager') !== undefined;
            if (!normalized && !hasConnectionManager) {
                return undefined;
            }
            return normalized || null;
        },
    },

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

    { tab: 'general', formPath: 'general.n', settingsPath: 'oai_settings.n' },
    { tab: 'general', formPath: 'general.verbosity', settingsPath: 'oai_settings.verbosity' },
    { tab: 'general', formPath: 'general.mediaInlining', settingsPath: 'oai_settings.media_inlining' },
    { tab: 'general', formPath: 'general.inlineImageQuality', settingsPath: 'oai_settings.inline_image_quality' },
    { tab: 'general', formPath: 'general.requestImages', settingsPath: 'oai_settings.request_images' },
    { tab: 'general', formPath: 'general.requestImageAspectRatio', settingsPath: 'oai_settings.request_image_aspect_ratio' },
    { tab: 'general', formPath: 'general.requestImageResolution', settingsPath: 'oai_settings.request_image_resolution' },
    { tab: 'general', formPath: 'general.toolReasoningMode', settingsPath: 'oai_settings.tool_reasoning_mode' },
    { tab: 'general', formPath: 'general.toolCallRecurseLimit', settingsPath: 'oai_settings.tool_call_recurse_limit' },
    { tab: 'general', formPath: 'general.sendIfEmpty', settingsPath: 'oai_settings.send_if_empty' },
    { tab: 'general', formPath: 'general.impersonationPrompt', settingsPath: 'oai_settings.impersonation_prompt' },
    { tab: 'general', formPath: 'general.newChatPrompt', settingsPath: 'oai_settings.new_chat_prompt' },
    { tab: 'general', formPath: 'general.newGroupChatPrompt', settingsPath: 'oai_settings.new_group_chat_prompt' },
    { tab: 'general', formPath: 'general.newExampleChatPrompt', settingsPath: 'oai_settings.new_example_chat_prompt' },
    { tab: 'general', formPath: 'general.continueNudgePrompt', settingsPath: 'oai_settings.continue_nudge_prompt' },
    { tab: 'general', formPath: 'general.wiFormat', settingsPath: 'oai_settings.wi_format' },
    { tab: 'general', formPath: 'general.scenarioFormat', settingsPath: 'oai_settings.scenario_format' },
    { tab: 'general', formPath: 'general.personalityFormat', settingsPath: 'oai_settings.personality_format' },
    { tab: 'general', formPath: 'general.groupNudgePrompt', settingsPath: 'oai_settings.group_nudge_prompt' },
    { tab: 'general', formPath: 'general.assistantPrefill', settingsPath: 'oai_settings.assistant_prefill' },
    { tab: 'general', formPath: 'general.assistantImpersonation', settingsPath: 'oai_settings.assistant_impersonation' },
    { tab: 'general', formPath: 'general.namesBehavior', settingsPath: 'oai_settings.names_behavior' },
    { tab: 'general', formPath: 'general.biasPresetSelected', settingsPath: 'oai_settings.bias_preset_selected' },
    { tab: 'userInterface', formPath: 'userInterface.waifuMode', settingsPath: 'power_user.waifuMode' },
    { tab: 'userInterface', formPath: 'userInterface.expandMessageActions', settingsPath: 'power_user.expand_message_actions' },
    { tab: 'userInterface', formPath: 'userInterface.enableZenSliders', settingsPath: 'power_user.enableZenSliders' },
    { tab: 'userInterface', formPath: 'userInterface.enableLabMode', settingsPath: 'power_user.enableLabMode' },
    { tab: 'userInterface', formPath: 'userInterface.messageTokenCountEnabled', settingsPath: 'power_user.message_token_count_enabled' },
    { tab: 'userInterface', formPath: 'userInterface.showSwipeNumAllMessages', settingsPath: 'power_user.show_swipe_num_all_messages' },
    { tab: 'userInterface', formPath: 'userInterface.hotswapEnabled', settingsPath: 'power_user.hotswap_enabled' },
    { tab: 'userInterface', formPath: 'userInterface.zoomedAvatarMagnification', settingsPath: 'power_user.zoomed_avatar_magnification' },
    { tab: 'userInterface', formPath: 'userInterface.bogusFolders', settingsPath: 'power_user.bogus_folders' },
    { tab: 'userInterface', formPath: 'userInterface.clickToEdit', settingsPath: 'power_user.click_to_edit' },
    { tab: 'userInterface', formPath: 'userInterface.mediaDisplay', settingsPath: 'power_user.media_display' },
    { tab: 'userInterface', formPath: 'userInterface.blurStrength', settingsPath: 'power_user.blur_strength' },
    { tab: 'userInterface', formPath: 'userInterface.shadowWidth', settingsPath: 'power_user.shadow_width' },
    { tab: 'userInterface', formPath: 'userInterface.mainTextColor', settingsPath: 'power_user.main_text_color' },
    { tab: 'userInterface', formPath: 'userInterface.italicsTextColor', settingsPath: 'power_user.italics_text_color' },
    { tab: 'userInterface', formPath: 'userInterface.underlineTextColor', settingsPath: 'power_user.underline_text_color' },
    { tab: 'userInterface', formPath: 'userInterface.quoteTextColor', settingsPath: 'power_user.quote_text_color' },
    { tab: 'userInterface', formPath: 'userInterface.blurTintColor', settingsPath: 'power_user.blur_tint_color' },
    { tab: 'userInterface', formPath: 'userInterface.chatTintColor', settingsPath: 'power_user.chat_tint_color' },
    { tab: 'userInterface', formPath: 'userInterface.userMesBlurTintColor', settingsPath: 'power_user.user_mes_blur_tint_color' },
    { tab: 'userInterface', formPath: 'userInterface.botMesBlurTintColor', settingsPath: 'power_user.bot_mes_blur_tint_color' },
    { tab: 'userInterface', formPath: 'userInterface.shadowColor', settingsPath: 'power_user.shadow_color' },
    { tab: 'userInterface', formPath: 'userInterface.borderColor', settingsPath: 'power_user.border_color' },
    { tab: 'userInterface', formPath: 'userInterface.playMessageSound', settingsPath: 'power_user.play_message_sound' },
    { tab: 'userInterface', formPath: 'userInterface.playSoundUnfocused', settingsPath: 'power_user.play_sound_unfocused' },
    { tab: 'userInterface', formPath: 'userInterface.relaxedApiUrls', settingsPath: 'power_user.relaxed_api_urls' },
    { tab: 'userInterface', formPath: 'userInterface.worldImportDialog', settingsPath: 'power_user.world_import_dialog' },
    { tab: 'userInterface', formPath: 'userInterface.enableAutoSelectInput', settingsPath: 'power_user.enable_auto_select_input' },
    { tab: 'userInterface', formPath: 'userInterface.enableMdHotkeys', settingsPath: 'power_user.enable_md_hotkeys' },
    { tab: 'userInterface', formPath: 'userInterface.restoreUserInput', settingsPath: 'power_user.restore_user_input' },
    { tab: 'userInterface', formPath: 'userInterface.sendOnEnter', settingsPath: 'power_user.send_on_enter' },
    { tab: 'userInterface', formPath: 'userInterface.continueOnSend', settingsPath: 'power_user.continue_on_send' },
    { tab: 'userInterface', formPath: 'userInterface.quickContinue', settingsPath: 'power_user.quick_continue' },
    { tab: 'userInterface', formPath: 'userInterface.quickImpersonate', settingsPath: 'power_user.quick_impersonate' },
    { tab: 'userInterface', formPath: 'userInterface.gestures', settingsPath: 'power_user.gestures' },
    { tab: 'userInterface', formPath: 'userInterface.autoLoadChat', settingsPath: 'power_user.auto_load_chat' },
    { tab: 'userInterface', formPath: 'userInterface.autoScrollChatToBottom', settingsPath: 'power_user.auto_scroll_chat_to_bottom' },
    { tab: 'userInterface', formPath: 'userInterface.autoSaveMsgEdits', settingsPath: 'power_user.auto_save_msg_edits' },
    { tab: 'userInterface', formPath: 'userInterface.confirmMessageDelete', settingsPath: 'power_user.confirm_message_delete' },
    { tab: 'userInterface', formPath: 'userInterface.autoFixGeneratedMarkdown', settingsPath: 'power_user.auto_fix_generated_markdown' },
    { tab: 'userInterface', formPath: 'userInterface.forbidExternalMedia', settingsPath: 'power_user.forbid_external_media' },
    { tab: 'userInterface', formPath: 'userInterface.allowName1Display', settingsPath: 'power_user.allow_name1_display' },
    { tab: 'userInterface', formPath: 'userInterface.allowName2Display', settingsPath: 'power_user.allow_name2_display' },
    { tab: 'userInterface', formPath: 'userInterface.encodeTags', settingsPath: 'power_user.encode_tags' },
    { tab: 'userInterface', formPath: 'userInterface.disableGroupTrimming', settingsPath: 'power_user.disable_group_trimming' },
    { tab: 'userInterface', formPath: 'userInterface.consoleLogPrompts', settingsPath: 'power_user.console_log_prompts' },
    { tab: 'userInterface', formPath: 'userInterface.requestTokenProbabilities', settingsPath: 'power_user.request_token_probabilities' },
    { tab: 'userInterface', formPath: 'userInterface.showGroupChatQueue', settingsPath: 'power_user.show_group_chat_queue' },
    { tab: 'userInterface', formPath: 'userInterface.pinStyles', settingsPath: 'power_user.pin_styles' },
    { tab: 'userInterface', formPath: 'userInterface.fuzzySearch', settingsPath: 'power_user.fuzzy_search' },
    { tab: 'userInterface', formPath: 'userInterface.preferCharacterPrompt', settingsPath: 'power_user.prefer_character_prompt' },
    { tab: 'userInterface', formPath: 'userInterface.preferCharacterJailbreak', settingsPath: 'power_user.prefer_character_jailbreak' },
    { tab: 'userInterface', formPath: 'userInterface.neverResizeAvatars', settingsPath: 'power_user.never_resize_avatars' },
    { tab: 'userInterface', formPath: 'userInterface.showCardAvatarUrls', settingsPath: 'power_user.show_card_avatar_urls' },
    { tab: 'userInterface', formPath: 'userInterface.spoilerFreeMode', settingsPath: 'power_user.spoiler_free_mode' },
    { tab: 'userInterface', formPath: 'userInterface.imageOverswipe', settingsPath: 'power_user.image_overswipe' },
    { tab: 'userInterface', formPath: 'userInterface.auxField', settingsPath: 'power_user.aux_field' },
    { tab: 'userInterface', formPath: 'userInterface.tagImportSetting', settingsPath: 'power_user.tag_import_setting' },
    { tab: 'advanced', formPath: 'advanced.collapseNewlines', settingsPath: 'power_user.collapse_newlines' },
    { tab: 'advanced', formPath: 'advanced.alwaysForceName2', settingsPath: 'power_user.always_force_name2' },
    { tab: 'advanced', formPath: 'advanced.trimSentences', settingsPath: 'power_user.trim_sentences' },
    { tab: 'advanced', formPath: 'advanced.trimSpaces', settingsPath: 'power_user.trim_spaces' },
    { tab: 'advanced', formPath: 'advanced.singleLine', settingsPath: 'power_user.single_line' },
    { tab: 'advanced', formPath: 'advanced.markdownEscapeStrings', settingsPath: 'power_user.markdown_escape_strings' },
    { tab: 'advanced', formPath: 'advanced.userPromptBias', settingsPath: 'power_user.user_prompt_bias' },
    { tab: 'advanced', formPath: 'advanced.showUserPromptBias', settingsPath: 'power_user.show_user_prompt_bias' },
    { tab: 'advanced', formPath: 'advanced.tokenPadding', settingsPath: 'power_user.token_padding' },
    { tab: 'advanced', formPath: 'advanced.instructDerived', settingsPath: 'power_user.instruct_derived' },
    { tab: 'advanced', formPath: 'advanced.contextDerived', settingsPath: 'power_user.context_derived' },
    { tab: 'advanced', formPath: 'advanced.contextSizeDerived', settingsPath: 'power_user.context_size_derived' },
    { tab: 'advanced', formPath: 'advanced.instructInputSequence', settingsPath: 'power_user.instruct.input_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructInputSuffix', settingsPath: 'power_user.instruct.input_suffix' },
    { tab: 'advanced', formPath: 'advanced.instructOutputSequence', settingsPath: 'power_user.instruct.output_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructOutputSuffix', settingsPath: 'power_user.instruct.output_suffix' },
    { tab: 'advanced', formPath: 'advanced.instructSystemSequence', settingsPath: 'power_user.instruct.system_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructSystemSuffix', settingsPath: 'power_user.instruct.system_suffix' },
    { tab: 'advanced', formPath: 'advanced.instructLastSystemSequence', settingsPath: 'power_user.instruct.last_system_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructFirstInputSequence', settingsPath: 'power_user.instruct.first_input_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructFirstOutputSequence', settingsPath: 'power_user.instruct.first_output_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructLastInputSequence', settingsPath: 'power_user.instruct.last_input_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructLastOutputSequence', settingsPath: 'power_user.instruct.last_output_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructStoryStringPrefix', settingsPath: 'power_user.instruct.story_string_prefix' },
    { tab: 'advanced', formPath: 'advanced.instructStoryStringSuffix', settingsPath: 'power_user.instruct.story_string_suffix' },
    { tab: 'advanced', formPath: 'advanced.instructStopSequence', settingsPath: 'power_user.instruct.stop_sequence' },
    { tab: 'advanced', formPath: 'advanced.instructUserAlignmentMessage', settingsPath: 'power_user.instruct.user_alignment_message' },
    { tab: 'advanced', formPath: 'advanced.instructSystemSameAsUser', settingsPath: 'power_user.instruct.system_same_as_user' },
    { tab: 'advanced', formPath: 'advanced.instructNamesBehavior', settingsPath: 'power_user.instruct.names_behavior' },
    { tab: 'advanced', formPath: 'advanced.instructSeparatorSequence', settingsPath: 'power_user.instruct.separator_sequence' },
    { tab: 'advanced', formPath: 'advanced.contextStoryStringPosition', settingsPath: 'power_user.context.story_string_position' },
    { tab: 'advanced', formPath: 'advanced.contextStoryStringRole', settingsPath: 'power_user.context.story_string_role' },
    { tab: 'advanced', formPath: 'advanced.contextStoryStringDepth', settingsPath: 'power_user.context.story_string_depth' },
];


/**
 * Owner inventory for settings retirement.
 * reactOwned paths come from fieldBindings; specializedSurfaces stay out of /settings.
 */
export const settingsOwnerInventory = {
    drawers: {
        userSettings: '#user-settings-block',
        apiConfiguration: '#rm_api_block',
        advancedFormatting: '#AdvancedFormatting',
    },
    specializedSurfaces: [
        'world_info_settings',
        'extension_settings',
        'power_user.personas',
        'power_user.persona_description',
        'power_user.persona_descriptions',
        'power_user.persona_show_notifications',
        'power_user.default_persona',
        'tags',
        'tag_map',
    ],
    complexManagers: [
        'oai_settings.bias_presets',
        'oai_settings.prompts',
        'oai_settings.prompt_order',
        'oai_settings.extensions',
        'power_user.movingUIState',
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
        'extension_settings',
        // Complex managers / runtime-only / persona surfaces
        'oai_settings.bias_presets',
        'oai_settings.prompts',
        'oai_settings.prompt_order',
        'oai_settings.extensions',
        'power_user.movingUIState',
        'power_user.personas',
        'power_user.persona_description',
        'power_user.persona_descriptions',
        'power_user.persona_show_notifications',
        'power_user.default_persona',
        'power_user.servers',
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
    const defaults = structuredClone(defaultSettingsFormValues);

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

export function getConnectionProfileOptions(settings) {
    const profiles = getValueAtPath(settings, 'extension_settings.connectionManager.profiles', []);
    const selectedProfile = getValueAtPath(settings, 'extension_settings.connectionManager.selectedProfile', null);
    const profileOptions = [];
    const profileIds = new Set();

    if (Array.isArray(profiles)) {
        for (const profile of profiles) {
            const id = profile?.id == null ? '' : String(profile.id);
            if (!id || profileIds.has(id)) {
                continue;
            }

            profileIds.add(id);
            profileOptions.push({
                value: id,
                label: String(profile?.name || id),
            });
        }
    }

    const staleProfileId = selectedProfile == null ? '' : String(selectedProfile);
    return [
        { value: '', label: 'No connection profile' },
        ...profileOptions.sort((left, right) => left.label.localeCompare(right.label)),
        ...(staleProfileId && !profileIds.has(staleProfileId)
            ? [{ value: staleProfileId, label: `Unavailable profile (${staleProfileId})` }]
            : []),
    ];
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
    const nextSettings = structuredClone(baseSettings && typeof baseSettings === 'object' ? baseSettings : {});

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
