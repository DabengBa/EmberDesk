export const OPENAI_FALLBACK_SECRET_MARKER = 'openai_fallback_provider';

export function normalizeFallbackBaseUrl(baseUrl) {
    return String(baseUrl ?? '').trim().replace(/\/+$/, '');
}

export function hasFallbackProviderSettings(settings, secretState, fallbackSecretKey) {
    if (!settings?.fallback_provider_enabled) {
        return false;
    }

    const hasEndpoint = Boolean(normalizeFallbackBaseUrl(settings.fallback_provider_base_url));
    const hasModel = Boolean(String(settings.fallback_provider_model ?? '').trim());
    const hasSecret = Boolean(secretState?.[fallbackSecretKey]);
    return hasEndpoint && hasModel && hasSecret;
}

export function buildFallbackOpenAIRequestOverrides(settings) {
    return {
        chatCompletionSource: 'openai',
        model: String(settings?.fallback_provider_model ?? '').trim(),
        customUrl: normalizeFallbackBaseUrl(settings?.fallback_provider_base_url),
        openaiSecretMarker: OPENAI_FALLBACK_SECRET_MARKER,
    };
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
