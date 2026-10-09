export const settingsTabDefinitions = [
    {
        id: 'providers',
        label: '服务',
        description: 'endpoint、API key、主模型与备选模型。',
    },
    {
        id: 'userInterface',
        label: '界面',
        description: '主题、布局、通知和工作区显示偏好。',
    },
    {
        id: 'advanced',
        label: '高级',
        description: '模板、auto-swipe、tokenizer、reasoning 和 STscript power-user 设置。',
    },
];

export const providerSecretKeyBySource = {
    openai: 'api_key_openai',
};

export const toastPositionOptions = [
    { value: 'toast-top-left', label: '左上' },
    { value: 'toast-top-center', label: '顶部居中' },
    { value: 'toast-top-right', label: '右上' },
    { value: 'toast-bottom-left', label: '左下' },
    { value: 'toast-bottom-center', label: '底部居中' },
    { value: 'toast-bottom-right', label: '右下' },
];

export const avatarStyleOptions = [
    { value: '0', label: '圆形' },
    { value: '1', label: '矩形' },
    { value: '2', label: '方形' },
    { value: '3', label: '圆角' },
];

export const chatDisplayOptions = [
    { value: '0', label: '默认' },
    { value: '1', label: '气泡' },
    { value: '2', label: '文档' },
];

export const mediaDisplayOptions = [
    { value: 'list', label: '列表' },
    { value: 'gallery', label: '画廊' },
];

export const sendOnEnterOptions = [
    { value: '-1', label: '禁用' },
    { value: '0', label: '自动' },
    { value: '1', label: '启用' },
];

export const imageOverswipeOptions = [
    { value: 'generate', label: '生成新图' },
    { value: 'rollover', label: '顺延切换' },
];

export const tagImportSettingOptions = [
    { value: '1', label: '询问' },
    { value: '2', label: '不导入' },
    { value: '3', label: '全部导入' },
    { value: '4', label: '仅已有标签' },
];

// Mirrors TOKENIZER_OPTIONS in public/scripts/tokenizers.js (the retired
// Advanced Formatting drawer's #tokenizer select). Values are stringified
// tokenizer ids; the settings form coerces back to numbers on save.
export const tokenizerOptions = [
    { value: '99', label: '最佳匹配（推荐）' },
    { value: '0', label: '无 / 估算' },
    { value: '1', label: 'GPT-2' },
    { value: '3', label: 'Llama 1/2' },
    { value: '12', label: 'Llama 3' },
    { value: '13', label: 'Gemma / Gemini' },
    { value: '14', label: 'Jamba' },
    { value: '15', label: 'Qwen2' },
    { value: '16', label: 'Command-R' },
    { value: '19', label: 'Command-A' },
    { value: '7', label: 'Mistral V1' },
    { value: '17', label: 'Mistral Nemo' },
    { value: '8', label: 'Yi' },
    { value: '11', label: 'Claude 1/2' },
    { value: '18', label: 'DeepSeek V3' },
];

export const defaultSettingsFormValues = {
    providers: {
        openaiModel: '',
        customUrl: '',
        fallbackProviderModel: '',
    },
    userInterface: {
        chatWidth: 50,
        fontScale: 1,
        customCss: '',
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
        expandMessageActions: false,

        enableZenSliders: false,
        enableLabMode: false,
        messageTokenCountEnabled: false,
        showSwipeNumAllMessages: false,
        hotswapEnabled: true,
        zoomedAvatarMagnification: false,
        bogusFolders: false,
        clickToEdit: false,
        mediaDisplay: 'list',
        blurStrength: 10,
        shadowWidth: 2,
        mainTextColor: 'rgba(220, 220, 210, 1)',
        italicsTextColor: 'rgba(190, 190, 190, 1)',
        underlineTextColor: 'rgba(190, 190, 190, 1)',
        quoteTextColor: 'rgba(225, 138, 36, 1)',
        blurTintColor: 'rgba(0, 0, 0, 1)',
        chatTintColor: 'rgba(0, 0, 0, 1)',
        userMesBlurTintColor: 'rgba(0, 0, 0, 1)',
        botMesBlurTintColor: 'rgba(0, 0, 0, 1)',
        shadowColor: 'rgba(0, 0, 0, 1)',
        borderColor: 'rgba(0, 0, 0, 1)',
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
        consoleLogPrompts: false,
        pinStyles: true,
        fuzzySearch: false,
        preferCharacterPrompt: true,
        preferCharacterJailbreak: true,
        neverResizeAvatars: false,
        showCardAvatarUrls: false,
        spoilerFreeMode: false,
        imageOverswipe: 'generate',
        auxField: 'character_version',
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
        systemPromptName: '',
        systemPromptContent: '',
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
        markdownEscapeStrings: '',
        userPromptBias: '',
        showUserPromptBias: true,
        tokenPadding: 64,
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
    { tab: 'userInterface', formPath: 'userInterface.chatWidth', settingsPath: 'power_user.chat_width' },
    { tab: 'userInterface', formPath: 'userInterface.fontScale', settingsPath: 'power_user.font_scale' },
    { tab: 'userInterface', formPath: 'userInterface.customCss', settingsPath: 'power_user.custom_css' },
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
    { tab: 'advanced', formPath: 'advanced.systemPromptName', settingsPath: 'power_user.sysprompt.name' },
    { tab: 'advanced', formPath: 'advanced.systemPromptContent', settingsPath: 'power_user.sysprompt.content' },
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
    { tab: 'userInterface', formPath: 'userInterface.consoleLogPrompts', settingsPath: 'power_user.console_log_prompts' },
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
