/**
 * The fallback attempt reuses the primary URL and API key; the model is the only
 * override. A non-empty fallback model means fallback is enabled.
 * @param {object} settings Chat completion settings
 * @returns {string} Configured fallback model name, or '' when fallback is off
 */
export function getFallbackOpenAIModel(settings) {
    return String(settings?.fallback_provider_model ?? '').trim();
}

export function hasFallbackProviderSettings(settings) {
    return Boolean(getFallbackOpenAIModel(settings));
}

export function isRecoverableGenerationFailure(failure) {
    const message = String(
        failure?.message
        ?? failure?.error?.message
        ?? failure
        ?? '',
    ).toLowerCase();

    if (!message && failure?.emptyReply !== true) {
        return false;
    }

    if (failure?.emptyReply === true) {
        return true;
    }

    const nonRecoverablePatterns = [
        'generation was aborted',
        'clicked stop button',
        'unsupported api',
        'no character selected',
        'server unreachable',
    ];

    if (nonRecoverablePatterns.some(pattern => message.includes(pattern))) {
        return false;
    }

    if (failure?.name === 'AbortError') {
        return true;
    }

    const recoverablePatterns = [
        'failed to fetch',
        'network',
        'provider',
        'stream',
        'unexpected token',
        'got response status',
        'timeout',
        'connection closed',
        '502',
        '503',
        '429',
    ];

    return recoverablePatterns.some(pattern => message.includes(pattern)) || Boolean(failure?.error);
}

export function isMainChatVisibleGeneration({ type, mainApi, dryRun, depth } = {}) {
    if (mainApi !== 'openai' || dryRun || depth > 0) {
        return false;
    }

    return ['normal', undefined, 'regenerate', 'continue', 'swipe'].includes(type);
}
