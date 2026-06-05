export const CHAT_COMPLETION_SOURCES = {
    OPENAI: 'openai',
    CLAUDE: 'claude',
    MAKERSUITE: 'makersuite',
    VERTEXAI: 'vertexai',
};

const REASONING_EFFORT_TYPES = {
    auto: 'auto',
    low: 'low',
    medium: 'medium',
    high: 'high',
    min: 'min',
    max: 'max',
    none: 'none',
    minimal: 'minimal',
    xhigh: 'xhigh',
};

const VERBOSITY_LEVELS = {
    auto: 'auto',
};

const visionSupportedModels = [
    'chatgpt-4o-latest',
    'gpt-4-turbo',
    'gpt-4-vision',
    'gpt-4.1',
    'gpt-4.5-preview',
    'gpt-4o',
    'gpt-5',
    'o1',
    'o3',
    'o4-mini',
    'claude-3',
    'claude-opus-4',
    'claude-sonnet-4',
    'claude-haiku-4',
    'gemini-2.0',
    'gemini-2.5',
    'gemini-3',
    'gemini-exp-1206',
    'learnlm',
    'gemini-robotics',
    'gemma-3-27b',
    'gemma-3-12b',
    'gemma-3-4b',
    'gemma-4',
];

const videoSupportedModels = [
    'gemini-2.0',
    'gemini-2.5',
    'gemini-exp-1206',
    'gemini-3',
    'gemma-4',
];

const audioSupportedModels = [
    'gemini-2.0',
    'gemini-2.5',
    'gemini-3',
    'gemini-exp-1206',
    'gpt-4o-audio',
    'gpt-4o-realtime',
    'gpt-4o-mini-audio',
    'gpt-4o-mini-realtime',
    'gpt-audio',
    'gpt-realtime',
];

const excludedOpenAiVisionModels = [
    'gpt-4-turbo-preview',
    'o1-mini',
    'o3-mini',
];

function includesAnyModel(model, candidates) {
    return candidates.some(candidate => String(model ?? '').includes(candidate));
}

function openAiVisionModelMatchesCurrentRule(model) {
    const modelToCheck = String(model ?? '');
    return includesAnyModel(modelToCheck, visionSupportedModels)
        && !includesAnyModel(modelToCheck, excludedOpenAiVisionModels);
}

export function getChatCompletionModelFromSettings(settings = {}) {
    const source = settings.chat_completion_source;

    switch (source) {
        case CHAT_COMPLETION_SOURCES.CLAUDE:
            return settings.claude_model;
        case CHAT_COMPLETION_SOURCES.OPENAI:
            return settings.openai_model;
        case CHAT_COMPLETION_SOURCES.MAKERSUITE:
        case CHAT_COMPLETION_SOURCES.VERTEXAI:
            return settings.google_model;
        default:
            return '';
    }
}

export function resolveVerbosity(settings = {}) {
    if (settings.verbosity === VERBOSITY_LEVELS.auto) {
        return undefined;
    }

    return settings.verbosity;
}

export function resolveReasoningEffort(settings = {}, model = null) {
    model = model ?? getChatCompletionModelFromSettings(settings);

    if (settings.chat_completion_source !== CHAT_COMPLETION_SOURCES.OPENAI) {
        return settings.reasoning_effort;
    }

    switch (settings.reasoning_effort) {
        case REASONING_EFFORT_TYPES.auto:
            return undefined;
        case REASONING_EFFORT_TYPES.min:
            if (/^gpt-5\.(4|5)/.test(model)) {
                return REASONING_EFFORT_TYPES.none;
            }
            if (/^gpt-5/.test(model)) {
                return REASONING_EFFORT_TYPES.min;
            }
            return REASONING_EFFORT_TYPES.low;
        case REASONING_EFFORT_TYPES.max:
            return REASONING_EFFORT_TYPES.high;
        default:
            return settings.reasoning_effort;
    }
}

function mediaInliningCanRun(settings = {}, { mainApi = 'openai' } = {}) {
    return mainApi === 'openai' && Boolean(settings.media_inlining);
}

function providerMediaCapabilitiesCanRun({ mainApi = 'openai' } = {}) {
    return mainApi === 'openai';
}

function isImageModelSupportedForSettings(settings = {}, { mainApi = 'openai' } = {}) {
    if (!providerMediaCapabilitiesCanRun({ mainApi })) {
        return false;
    }

    switch (settings.chat_completion_source) {
        case CHAT_COMPLETION_SOURCES.OPENAI:
            return openAiVisionModelMatchesCurrentRule(settings.openai_model);
        case CHAT_COMPLETION_SOURCES.MAKERSUITE:
            return includesAnyModel(settings.google_model, visionSupportedModels);
        case CHAT_COMPLETION_SOURCES.CLAUDE:
            return includesAnyModel(settings.claude_model, visionSupportedModels);
        default:
            return false;
    }
}

function isVideoModelSupportedForSettings(settings = {}, { mainApi = 'openai' } = {}) {
    if (!providerMediaCapabilitiesCanRun({ mainApi })) {
        return false;
    }

    switch (settings.chat_completion_source) {
        case CHAT_COMPLETION_SOURCES.MAKERSUITE:
            return includesAnyModel(settings.google_model, videoSupportedModels);
        default:
            return false;
    }
}

function isAudioModelSupportedForSettings(settings = {}, { mainApi = 'openai' } = {}) {
    if (!providerMediaCapabilitiesCanRun({ mainApi })) {
        return false;
    }

    switch (settings.chat_completion_source) {
        case CHAT_COMPLETION_SOURCES.OPENAI:
            return includesAnyModel(settings.openai_model, audioSupportedModels);
        case CHAT_COMPLETION_SOURCES.MAKERSUITE:
            return includesAnyModel(settings.google_model, audioSupportedModels);
        default:
            return false;
    }
}

export function isImageInliningSupportedForSettings(settings = {}, { mainApi = 'openai' } = {}) {
    if (!mediaInliningCanRun(settings, { mainApi })) {
        return false;
    }

    return isImageModelSupportedForSettings(settings, { mainApi });
}

export function isVideoInliningSupportedForSettings(settings = {}, { mainApi = 'openai' } = {}) {
    if (!mediaInliningCanRun(settings, { mainApi })) {
        return false;
    }

    return isVideoModelSupportedForSettings(settings, { mainApi });
}

export function isAudioInliningSupportedForSettings(settings = {}, { mainApi = 'openai' } = {}) {
    if (!mediaInliningCanRun(settings, { mainApi })) {
        return false;
    }

    return isAudioModelSupportedForSettings(settings, { mainApi });
}

export function resolveChatCompletionModel(settings = {}, { mainApi = 'openai' } = {}) {
    const source = settings.chat_completion_source;
    const model = getChatCompletionModelFromSettings(settings);

    return {
        source,
        model,
        capabilities: {
            vision: isImageModelSupportedForSettings(settings, { mainApi }),
            video: isVideoModelSupportedForSettings(settings, { mainApi }),
            audio: isAudioModelSupportedForSettings(settings, { mainApi }),
            reasoning: source === CHAT_COMPLETION_SOURCES.OPENAI && /^(gpt-5|o1|o3|o4)/.test(model),
        },
    };
}
