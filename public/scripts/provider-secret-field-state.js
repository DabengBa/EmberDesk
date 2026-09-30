import { hasFallbackProviderSettings } from './chat-generation-auto-recovery.js';

export function getFallbackProviderStatus(settings) {
    return hasFallbackProviderSettings(settings)
        ? { state: 'ready', text: 'Ready', ready: true }
        : { state: 'disabled', text: 'Disabled', ready: false };
}

export function resolveProviderSecretKeyForSettings({ secretKey }) {
    return secretKey;
}

export function getUnifiedKeyFieldState({
    source,
    secretKey,
    secretState,
    chatCompletionSources,
}) {
    if (secretKey && secretState?.[secretKey]) {
        const label = Array.isArray(secretState[secretKey])
            ? (secretState[secretKey].find(secret => secret.active)?.label || '')
            : '';
        return {
            placeholder: label ? `Saved (${label})` : 'Saved',
            value: '',
        };
    }

    const placeholders = {
        [chatCompletionSources.OPENAI]: 'sk-...',
    };

    return {
        placeholder: placeholders[source] || 'Enter API key',
        value: '',
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
