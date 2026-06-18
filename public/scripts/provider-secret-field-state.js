import { hasFallbackProviderSettings } from './chat-generation-auto-recovery.js';

export function getFallbackProviderStatus(settings, secretState, fallbackSecretKey) {
    if (!settings?.fallback_provider_enabled) {
        return { state: 'disabled', text: 'Disabled', ready: false };
    }

    const ready = hasFallbackProviderSettings(settings, secretState, fallbackSecretKey);
    return ready
        ? { state: 'ready', text: 'Ready', ready: true }
        : { state: 'needs_setup', text: 'Needs setup', ready: false };
}

export function resolveProviderSecretKeyForSettings({
    settings,
    source,
    secretKey,
    chatCompletionSources,
}) {
    if (settings?.reverse_proxy) {
        return null;
    }

    const isVertexAi = source === chatCompletionSources.MAKERSUITE && settings?.use_vertexai;
    if (!isVertexAi) {
        return secretKey;
    }

    switch (settings?.vertexai_auth_mode) {
        case 'express':
            return 'api_key_vertexai';
        case 'full':
            return null;
        default:
            return secretKey;
    }
}

export function canUseDirectProviderSecret({ settings, secretKey }) {
    return !settings?.reverse_proxy && Boolean(secretKey);
}

export function getUnifiedKeyFieldState({
    settings,
    source,
    secretKey,
    secretState,
    chatCompletionSources,
}) {
    const vertexAiActive = source === chatCompletionSources.MAKERSUITE
        && settings?.use_vertexai
        && settings?.vertexai_auth_mode === 'express';

    if (settings?.reverse_proxy) {
        return {
            placeholder: 'Proxy password',
            value: settings.proxy_password || '',
            vertexAiActive,
        };
    }

    if (secretKey && secretState?.[secretKey]) {
        const label = Array.isArray(secretState[secretKey])
            ? (secretState[secretKey].find(secret => secret.active)?.label || '')
            : '';
        return {
            placeholder: label ? `Saved (${label})` : 'Saved',
            value: '',
            vertexAiActive,
        };
    }

    const placeholders = {
        [chatCompletionSources.OPENAI]: 'sk-...',
        [chatCompletionSources.CLAUDE]: 'sk-ant-...',
        [chatCompletionSources.MAKERSUITE]: 'AIza...',
    };

    return {
        placeholder: placeholders[source] || 'Enter API key',
        value: '',
        vertexAiActive,
    };
}

export async function saveProviderSecretField({ key, value, writeSecret }) {
    const trimmedValue = String(value ?? '').trim();
    if (!trimmedValue) {
        return { status: 'empty', id: null, shouldClearInput: false };
    }

    const id = await writeSecret(key, trimmedValue);
    if (!id) {
        return { status: 'failed', id: null, shouldClearInput: false };
    }

    return { status: 'saved', id, shouldClearInput: true };
}

export async function clearProviderSecretField({ key, deleteSecret }) {
    await deleteSecret(key);
    return { status: 'cleared', shouldClearInput: true };
}

export function toggleSecretInputMask(inputElement, triggerElement) {
    inputElement?.classList.toggle('api-key-masked');
    triggerElement?.classList.toggle('fa-eye-slash');
    triggerElement?.classList.toggle('fa-eye');
}
