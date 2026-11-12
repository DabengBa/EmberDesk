import { moment } from '../lib.js';
import { eventSource, event_types } from './events.js';
import { getRequestHeaders } from './request-context.js';
import { chat_completion_sources } from './openai.js';

export const SECRET_KEYS = {
    MANCER: 'api_key_mancer',
    VLLM: 'api_key_vllm',
    APHRODITE: 'api_key_aphrodite',
    TABBY: 'api_key_tabby',
    OPENAI: 'api_key_openai',
    DEEPL: 'deepl',
    LIBRE: 'libre',
    LIBRE_URL: 'libre_url',
    LINGVA_URL: 'lingva_url',
    AI21: 'api_key_ai21',
    ONERING_URL: 'oneringtranslator_url',
    DEEPLX_URL: 'deeplx_url',
    MISTRALAI: 'api_key_mistralai',
    TOGETHERAI: 'api_key_togetherai',
    INFERMATICAI: 'api_key_infermaticai',
    DREAMGEN: 'api_key_dreamgen',
    CUSTOM: 'api_key_custom',
    OOBA: 'api_key_ooba',
    NOMICAI: 'api_key_nomicai',
    KOBOLDCPP: 'api_key_koboldcpp',
    LLAMACPP: 'api_key_llamacpp',
    COHERE: 'api_key_cohere',
    PERPLEXITY: 'api_key_perplexity',
    GROQ: 'api_key_groq',
    AZURE_OPENAI: 'api_key_azure_openai',
    FEATHERLESS: 'api_key_featherless',
    HUGGINGFACE: 'api_key_huggingface',
    STABILITY: 'api_key_stability',
    CHUTES: 'api_key_chutes',
    ELECTRONHUB: 'api_key_electronhub',
    BFL: 'api_key_bfl',
    COMFY_RUNPOD: 'api_key_comfy_runpod',
    GENERIC: 'api_key_generic',
    DEEPSEEK: 'api_key_deepseek',
    AIMLAPI: 'api_key_aimlapi',
    FALAI: 'api_key_falai',
    XAI: 'api_key_xai',
    FIREWORKS: 'api_key_fireworks',
    MINIMAX: 'api_key_minimax',
    MINIMAX_GROUP_ID: 'minimax_group_id',
    MOONSHOT: 'api_key_moonshot',
    COMETAPI: 'api_key_cometapi',
    ZAI: 'api_key_zai',
    SILICONFLOW: 'api_key_siliconflow',
    POLLINATIONS: 'api_key_pollinations',
    WORKERS_AI: 'api_key_workers_ai',
};

const getLabel = () => moment().format('L LT');

/**
 * Resolves the secret key based on the selected API, chat completion source, and text completion type.
 * @returns {string|null} The secret key corresponding to the selected API, or null if no key is found.
 */
export function resolveSecretKey() {
    const { mainApi, chatCompletionSettings } = SillyTavern.getContext();
    const chatCompletionSource = chatCompletionSettings.chat_completion_source;

    if (mainApi === 'openai') {
        const [key] = Object.entries(chat_completion_sources).find(([, value]) => value === chatCompletionSource) ?? [null];
        if (key && SECRET_KEYS[key]) {
            return SECRET_KEYS[key];
        }
    }

    return null;
}

/**
 * Checks if secrets can be viewed based on server configuration.
 * @returns {Promise<boolean|null>} A boolean value, or null if the request fails.
 */
export async function canViewSecrets() {
    try {
        const response = await fetch('/api/secrets/settings', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data?.allowKeysExposure === true;
    } catch (error) {
        console.error('Error getting secrets settings:', error);
        return null;
    }
}


/**
 * @type {import('../../src/endpoints/secrets.js').SecretStateMap}
 */
export let secret_state = {};

/**
 * Write a secret value to the server.
 * @param {string} key Secret key
 * @param {string} value Secret value to write
 * @param {string} [label] (Optional) Label for the key. If not provided, generated automatically.
 * @param {Object} [options] Additional options
 * @param {boolean} [options.allowEmpty] Whether to allow writing empty values. If false and value is empty, the secret will be deleted.
 * @return {Promise<string?>} The ID of the newly created secret key, or null if no value is provided.
 */
export async function writeSecret(key, value, label, { allowEmpty } = {}) {
    try {
        if (!value && !allowEmpty) {
            console.warn(`No value provided for ${key} in writeSecret, redirecting to deleteSecret`);
            await deleteSecret(key);
            return null;
        }

        if (!label) {
            label = getLabel();
        }

        const response = await fetch('/api/secrets/write', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, value, label }),
        });

        if (!response.ok) {
            return null;
        }

        const { id } = await response.json();
        await readSecretState();
        await eventSource.emit(event_types.SECRET_WRITTEN, key);
        return id;
    } catch (error) {
        console.error(`Could not write secret value: ${key}`, error);
        return null;
    }
}

/**
 * Deletes a secret value from the server.
 * @param {string} key Secret key
 * @param {string} [id] (Optional) ID of the secret key to delete. If not provided, deletes an active key.
 */
export async function deleteSecret(key, id) {
    try {
        const response = await fetch('/api/secrets/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (response.ok) {
            await readSecretState();
            await eventSource.emit(event_types.MAIN_API_CHANGED, { apiId: 'openai' });
            await eventSource.emit(event_types.SECRET_DELETED, key);
        }
    } catch (error) {
        console.error(`Could not delete secret value: ${key}`, error);
    }
}

/**
 * Reads the current state of secrets from the server.
 * @returns {Promise<void>}
 */
export async function readSecretState() {
    try {
        const response = await fetch('/api/secrets/read', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (response.ok) {
            secret_state = await response.json();
        }
    } catch {
        console.error('Could not read secrets file');
    }
}

/**
 * Finds a secret value by key.
 * @param {string} key Secret key
 * @param {string} [id] ID of the secret to find. If not provided, will return the active secret.
 * @returns {Promise<string?>} Secret value, or null if keys are not exposed
 */
export async function findSecret(key, id) {
    try {
        const response = await fetch('/api/secrets/find', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.value;
    } catch {
        console.error('Could not find secret value: ', key);
        return null;
    }
}

/**
 * Changes the active value for a given secret key.
 * @param {string} key Secret key to rotate
 * @param {string} id ID of the secret to rotate
 */
export async function rotateSecret(key, id) {
    try {
        const response = await fetch('/api/secrets/rotate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (response.ok) {
            await readSecretState();
            await eventSource.emit(event_types.MAIN_API_CHANGED, { apiId: 'openai' });
            await eventSource.emit(event_types.SECRET_ROTATED, key);
        }
    } catch (error) {
        console.error(`Could not rotate secret value: ${key}`, error);
    }
}

/**
 * Renames a secret value on the server.
 * @param {string} key Secret key to rename
 * @param {string} id ID of the secret to rename
 * @param {string} label Label to rename the secret to
 */
export async function renameSecret(key, id, label) {
    try {
        const response = await fetch('/api/secrets/rename', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id, label }),
        });

        if (response.ok) {
            await readSecretState();
            await eventSource.emit(event_types.SECRET_EDITED, key);
        }
    } catch (error) {
        console.error(`Could not rename secret value: ${key}`, error);
    }
}

export async function initSecrets() {
}
