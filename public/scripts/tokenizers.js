import { localforage } from '../lib.js';
import { characters, main_api, saveSettingsDebounced, this_chid } from '../script.js';
import { forceCharacterEditorTokenize, power_user, registerDebugFunction } from './power-user.js';
import { oai_settings } from './openai.js';
import { getStringHash } from './utils.js';
export { BYTES_PER_TOKEN as CHARACTERS_PER_TOKEN_RATIO };

export const BYTES_PER_TOKEN = 3.35;

export const tokenizers = {
    NONE: 0,
    GPT2: 1,
    OPENAI: 2,
    LLAMA: 3,
    MISTRAL: 7,
    YI: 8,
    CLAUDE: 11,
    LLAMA3: 12,
    GEMMA: 13,
    JAMBA: 14,
    QWEN2: 15,
    COMMAND_R: 16,
    NEMO: 17,
    DEEPSEEK: 18,
    COMMAND_A: 19,
    BEST_MATCH: 99,
};

// A list of local tokenizers that support encoding and decoding token ids.
export const ENCODE_TOKENIZERS = [
    tokenizers.LLAMA,
    tokenizers.MISTRAL,
    tokenizers.YI,
    tokenizers.LLAMA3,
    tokenizers.GEMMA,
    tokenizers.JAMBA,
    tokenizers.QWEN2,
    tokenizers.COMMAND_R,
    tokenizers.COMMAND_A,
    tokenizers.NEMO,
    tokenizers.DEEPSEEK,
];

const TOKENIZER_URLS = {
    [tokenizers.GPT2]: {
        encode: '/api/tokenizers/gpt2/encode',
        decode: '/api/tokenizers/gpt2/decode',
        count: '/api/tokenizers/gpt2/encode',
    },
    [tokenizers.OPENAI]: {
        encode: '/api/tokenizers/openai/encode',
        decode: '/api/tokenizers/openai/decode',
        count: '/api/tokenizers/openai/encode',
    },
    [tokenizers.LLAMA]: {
        encode: '/api/tokenizers/llama/encode',
        decode: '/api/tokenizers/llama/decode',
        count: '/api/tokenizers/llama/encode',
    },
    [tokenizers.MISTRAL]: {
        encode: '/api/tokenizers/mistral/encode',
        decode: '/api/tokenizers/mistral/decode',
        count: '/api/tokenizers/mistral/encode',
    },
    [tokenizers.YI]: {
        encode: '/api/tokenizers/yi/encode',
        decode: '/api/tokenizers/yi/decode',
        count: '/api/tokenizers/yi/encode',
    },
    [tokenizers.CLAUDE]: {
        encode: '/api/tokenizers/claude/encode',
        decode: '/api/tokenizers/claude/decode',
        count: '/api/tokenizers/claude/encode',
    },
    [tokenizers.LLAMA3]: {
        encode: '/api/tokenizers/llama3/encode',
        decode: '/api/tokenizers/llama3/decode',
        count: '/api/tokenizers/llama3/encode',
    },
    [tokenizers.GEMMA]: {
        encode: '/api/tokenizers/gemma/encode',
        decode: '/api/tokenizers/gemma/decode',
        count: '/api/tokenizers/gemma/encode',
    },
    [tokenizers.JAMBA]: {
        encode: '/api/tokenizers/jamba/encode',
        decode: '/api/tokenizers/jamba/decode',
        count: '/api/tokenizers/jamba/encode',
    },
    [tokenizers.QWEN2]: {
        encode: '/api/tokenizers/qwen2/encode',
        decode: '/api/tokenizers/qwen2/decode',
        count: '/api/tokenizers/qwen2/encode',
    },
    [tokenizers.COMMAND_R]: {
        encode: '/api/tokenizers/command-r/encode',
        decode: '/api/tokenizers/command-r/decode',
        count: '/api/tokenizers/command-r/encode',
    },
    [tokenizers.COMMAND_A]: {
        encode: '/api/tokenizers/command-a/encode',
        decode: '/api/tokenizers/command-a/decode',
        count: '/api/tokenizers/command-a/encode',
    },
    [tokenizers.NEMO]: {
        encode: '/api/tokenizers/nemo/encode',
        decode: '/api/tokenizers/nemo/decode',
        count: '/api/tokenizers/nemo/encode',
    },
    [tokenizers.DEEPSEEK]: {
        encode: '/api/tokenizers/deepseek/encode',
        decode: '/api/tokenizers/deepseek/decode',
        count: '/api/tokenizers/deepseek/encode',
    },
};

const textEncoder = new TextEncoder();
const objectStore = localforage.createInstance({ name: 'SillyTavern_ChatCompletions' });

let tokenCache = {};

/**
 * Guesstimates the token count for a string.
 * @param {string} str String to tokenize.
 * @returns {number} Token count.
 */
export function guesstimate(str) {
    const byteLength = textEncoder.encode(str).length;
    return Math.ceil(byteLength / BYTES_PER_TOKEN);
}

async function loadTokenCache() {
    try {
        console.debug('Chat Completions: loading token cache');
        tokenCache = await objectStore.getItem('tokenCache') || {};
    } catch (e) {
        console.log('Chat Completions: unable to load token cache, using default value', e);
        tokenCache = {};
    }
}

export async function saveTokenCache() {
    try {
        console.debug('Chat Completions: saving token cache');
        await objectStore.setItem('tokenCache', tokenCache);
    } catch (e) {
        console.warn('Chat Completions: unable to save token cache', e);
    }
}

async function resetTokenCache() {
    try {
        console.debug('Chat Completions: resetting token cache');
        Object.keys(tokenCache).forEach(key => delete tokenCache[key]);
        await objectStore.removeItem('tokenCache');
        toastr.success('Token cache cleared. Please reload the chat to re-tokenize it.');
    } catch (e) {
        console.warn('Chat Completions: unable to reset token cache', e);
    }
}

/**
 * @typedef {object} Tokenizer
 * @property {number} tokenizerId - The id of the tokenizer option
 * @property {string} tokenizerKey - Internal name/key of the tokenizer
 * @property {string} tokenizerName - Human-readable detailed name of the tokenizer (as displayed in the UI)
 */

/**
 * Gets all tokenizers available to the user.
 * @returns {Tokenizer[]} Tokenizer info.
 */
/**
 * Static tokenizer option list. The retired Advanced Formatting drawer owned a
 * #tokenizer select whose options were the source of truth for these labels;
 * the React Settings surface now edits power_user.tokenizer, so the option
 * list lives here as data.
 */
const TOKENIZER_OPTIONS = [
    { tokenizerId: tokenizers.BEST_MATCH, tokenizerName: 'Best match (recommended)' },
    { tokenizerId: tokenizers.NONE, tokenizerName: 'None / Estimated' },
    { tokenizerId: tokenizers.GPT2, tokenizerName: 'GPT-2' },
    { tokenizerId: tokenizers.LLAMA, tokenizerName: 'Llama 1/2' },
    { tokenizerId: tokenizers.LLAMA3, tokenizerName: 'Llama 3' },
    { tokenizerId: tokenizers.GEMMA, tokenizerName: 'Gemma / Gemini' },
    { tokenizerId: tokenizers.JAMBA, tokenizerName: 'Jamba' },
    { tokenizerId: tokenizers.QWEN2, tokenizerName: 'Qwen2' },
    { tokenizerId: tokenizers.COMMAND_R, tokenizerName: 'Command-R' },
    { tokenizerId: tokenizers.COMMAND_A, tokenizerName: 'Command-A' },
    { tokenizerId: tokenizers.MISTRAL, tokenizerName: 'Mistral V1' },
    { tokenizerId: tokenizers.NEMO, tokenizerName: 'Mistral Nemo' },
    { tokenizerId: tokenizers.YI, tokenizerName: 'Yi' },
    { tokenizerId: tokenizers.CLAUDE, tokenizerName: 'Claude 1/2' },
    { tokenizerId: tokenizers.DEEPSEEK, tokenizerName: 'DeepSeek V3' },
];

export function getAvailableTokenizers() {
    return TOKENIZER_OPTIONS.map(option => ({
        tokenizerId: option.tokenizerId,
        tokenizerKey: Object.entries(tokenizers).find(([_, value]) => value === option.tokenizerId)[0].toLocaleLowerCase(),
        tokenizerName: option.tokenizerName,
    }));
}

/**
 * Selects tokenizer if not already selected.
 * @param {number} tokenizerId Tokenizer ID.
 */
export function selectTokenizer(tokenizerId) {
    if (tokenizerId !== power_user.tokenizer) {
        const tokenizer = getAvailableTokenizers().find(tokenizer => tokenizer.tokenizerId === tokenizerId);
        if (!tokenizer) {
            console.warn('Failed to find tokenizer with id', tokenizerId);
            return;
        }
        power_user.tokenizer = tokenizer.tokenizerId;
        forceCharacterEditorTokenize();
        saveSettingsDebounced();
        toastr.info(`Tokenizer: "${tokenizer.tokenizerName}" selected`);
    }
}

/**
 * Gets the friendly name of the current tokenizer.
 * @param {string} forApi API to get the tokenizer for. Defaults to the main API.
 * @returns {Tokenizer} Tokenizer info
 */
export function getFriendlyTokenizerName(forApi) {
    if (!forApi) {
        forApi = main_api;
    }

    let tokenizerId = power_user.tokenizer;
    let tokenizerName = TOKENIZER_OPTIONS.find(option => option.tokenizerId === tokenizerId)?.tokenizerName ?? '';

    if (forApi !== 'openai' && tokenizerId === tokenizers.BEST_MATCH) {
        tokenizerId = tokenizers.NONE;
        tokenizerName = TOKENIZER_OPTIONS.find(option => option.tokenizerId === tokenizerId)?.tokenizerName ?? '';
    }

    tokenizerName = forApi == 'openai'
        ? getTokenizerModel()
        : tokenizerName;

    tokenizerId = forApi == 'openai'
        ? tokenizers.OPENAI
        : tokenizerId;

    const tokenizerKey = Object.entries(tokenizers).find(([_, value]) => value === tokenizerId)?.[0]?.toLocaleLowerCase() ?? 'none';

    return { tokenizerName, tokenizerKey, tokenizerId };
}

/**
 * Calls the underlying tokenizer model to the token count for a string.
 * @param {number} type Tokenizer type.
 * @param {string} str String to tokenize.
 * @returns {number} Token count.
 */
function callTokenizer(type, str) {
    if (type === tokenizers.NONE) return guesstimate(str);

    switch (type) {
        default: {
            const endpointUrl = TOKENIZER_URLS[type]?.count;
            if (!endpointUrl) {
                console.warn('Unknown tokenizer type', type);
                return apiFailureTokenCount(str);
            }
            return countTokensFromServer(endpointUrl, str);
        }
    }
}

/**
 * Calls the underlying tokenizer model to the token count for a string.
 * @param {number} type Tokenizer type.
 * @param {string} str String to tokenize.
 * @returns {Promise<number>} Token count.
 */
function callTokenizerAsync(type, str) {
    return new Promise(resolve => {
        if (type === tokenizers.NONE) {
            return resolve(guesstimate(str));
        }

        switch (type) {
            default: {
                const endpointUrl = TOKENIZER_URLS[type]?.count;
                if (!endpointUrl) {
                    console.warn('Unknown tokenizer type', type);
                    return resolve(apiFailureTokenCount(str));
                }
                return countTokensFromServer(endpointUrl, str, resolve);
            }
        }
    });
}

/**
 * Gets the token count for a string using the current model tokenizer.
 * @param {string} str String to tokenize
 * @param {number | undefined} padding Optional padding tokens. Defaults to 0.
 * @returns {Promise<number>} Token count.
 */
export async function getTokenCountAsync(str, padding = undefined) {
    if (typeof str !== 'string' || !str?.length) {
        return 0;
    }

    let tokenizerType = power_user.tokenizer;

    if (main_api === 'openai') {
        if (padding === power_user.token_padding) {
            // For main "shadow" prompt building
            tokenizerType = tokenizers.NONE;
        } else {
            // For extensions and WI
            return counterWrapperOpenAIAsync(str);
        }
    }

    if (tokenizerType === tokenizers.BEST_MATCH) {
        tokenizerType = tokenizers.NONE;
    }

    if (padding === undefined) {
        padding = 0;
    }

    const cacheObject = getTokenCacheObject();
    const hash = getStringHash(str);
    const cacheKey = `${tokenizerType}-${hash}+${padding}`;

    if (typeof cacheObject[cacheKey] === 'number') {
        return cacheObject[cacheKey];
    }

    const result = (await callTokenizerAsync(tokenizerType, str)) + padding;

    if (isNaN(result)) {
        console.warn('Token count calculation returned NaN');
        return 0;
    }

    cacheObject[cacheKey] = result;
    return result;
}

/**
 * Gets the token count for a string using the current model tokenizer.
 * @param {string} str String to tokenize
 * @param {number | undefined} padding Optional padding tokens. Defaults to 0.
 * @returns {number} Token count.
 * @deprecated Use getTokenCountAsync instead.
 */
export function getTokenCount(str, padding = undefined) {
    if (typeof str !== 'string' || !str?.length) {
        return 0;
    }

    let tokenizerType = power_user.tokenizer;

    if (main_api === 'openai') {
        if (padding === power_user.token_padding) {
            // For main "shadow" prompt building
            tokenizerType = tokenizers.NONE;
        } else {
            // For extensions and WI
            return counterWrapperOpenAI(str);
        }
    }

    if (tokenizerType === tokenizers.BEST_MATCH) {
        tokenizerType = tokenizers.NONE;
    }

    if (padding === undefined) {
        padding = 0;
    }

    const cacheObject = getTokenCacheObject();
    const hash = getStringHash(str);
    const cacheKey = `${tokenizerType}-${hash}+${padding}`;

    if (typeof cacheObject[cacheKey] === 'number') {
        return cacheObject[cacheKey];
    }

    const result = callTokenizer(tokenizerType, str) + padding;

    if (isNaN(result)) {
        console.warn('Token count calculation returned NaN');
        return 0;
    }

    cacheObject[cacheKey] = result;
    return result;
}

/**
 * Gets the token count for a string using the OpenAI tokenizer.
 * @param {string} text Text to tokenize.
 * @returns {number} Token count.
 * @deprecated Use counterWrapperOpenAIAsync instead.
 */
function counterWrapperOpenAI(text) {
    const message = { role: 'system', content: text };
    return countTokensOpenAI(message, true);
}

/**
 * Gets the token count for a string using the OpenAI tokenizer.
 * @param {string} text Text to tokenize.
 * @returns {Promise<number>} Token count.
 */
function counterWrapperOpenAIAsync(text) {
    const message = { role: 'system', content: text };
    return countTokensOpenAIAsync(message, true);
}

export function getTokenizerModel() {
    return oai_settings.openai_model || 'gpt-3.5-turbo';
}

/**
 * @param {any[] | Object} messages
 * @deprecated Use countTokensOpenAIAsync instead.
 */
export function countTokensOpenAI(messages, full = false) {
    const tokenizerEndpoint = `/api/tokenizers/openai/count?model=${getTokenizerModel()}`;
    const cacheObject = getTokenCacheObject();

    if (!Array.isArray(messages)) {
        messages = [messages];
    }

    let token_count = -1;

    for (const message of messages) {
        const model = getTokenizerModel();

        if (model === 'claude') {
            full = true;
        }

        const hash = getStringHash(JSON.stringify(message));
        const cacheKey = `${model}-${hash}`;
        const cachedCount = cacheObject[cacheKey];

        if (typeof cachedCount === 'number') {
            token_count += cachedCount;
        } else {
            jQuery.ajax({
                async: false,
                type: 'POST', //
                url: tokenizerEndpoint,
                data: JSON.stringify([message]),
                dataType: 'json',
                contentType: 'application/json',
                success: function (data) {
                    token_count += Number(data.token_count);
                    cacheObject[cacheKey] = Number(data.token_count);
                },
            });
        }
    }

    if (!full) token_count -= 2;

    return token_count;
}

/**
 * Returns the token count for a message using the OpenAI tokenizer.
 * @param {object[]|object} messages
 * @param {boolean} full
 * @returns {Promise<number>} Token count.
 */
export async function countTokensOpenAIAsync(messages, full = false) {
    const tokenizerEndpoint = `/api/tokenizers/openai/count?model=${getTokenizerModel()}`;
    const cacheObject = getTokenCacheObject();

    if (!Array.isArray(messages)) {
        messages = [messages];
    }

    let token_count = -1;

    for (const message of messages) {
        const model = getTokenizerModel();

        if (model === 'claude') {
            full = true;
        }

        const hash = getStringHash(JSON.stringify(message));
        const cacheKey = `${model}-${hash}`;
        const cachedCount = cacheObject[cacheKey];

        if (typeof cachedCount === 'number') {
            token_count += cachedCount;
        } else {
            const data = await jQuery.ajax({
                async: true,
                type: 'POST', //
                url: tokenizerEndpoint,
                data: JSON.stringify([message]),
                dataType: 'json',
                contentType: 'application/json',
            });

            token_count += Number(data.token_count);
            cacheObject[cacheKey] = Number(data.token_count);
        }
    }

    if (!full) token_count -= 2;

    return token_count;
}

/**
 * Gets the token cache object for the current chat.
 * @returns {Object} Token cache object for the current chat.
 */
function getTokenCacheObject() {
    let chatId = 'undefined';

    try {
        if (this_chid !== undefined) {
            chatId = characters[this_chid].chat;
        }
    } catch {
        console.log('No character selected. Using default cache item');
    }

    if (typeof tokenCache[chatId] !== 'object') {
        tokenCache[chatId] = {};
    }

    return tokenCache[String(chatId)];
}

/**
 * Count tokens using the server API.
 * @param {string} endpoint API endpoint.
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.s
 * @returns {number} Token count.
 */
function countTokensFromServer(endpoint, str, resolve) {
    const isAsync = typeof resolve === 'function';
    let tokenCount = 0;

    jQuery.ajax({
        async: isAsync,
        type: 'POST',
        url: endpoint,
        data: JSON.stringify({ text: str }),
        dataType: 'json',
        contentType: 'application/json',
        success: function (data) {
            if (typeof data.count === 'number') {
                tokenCount = data.count;
            } else {
                tokenCount = apiFailureTokenCount(str);
            }

            if (isAsync) resolve(tokenCount);
        },
    });

    return tokenCount;
}

/**
 * Calls the underlying tokenizer model to encode a string to tokens.
 * @param {string} endpoint API endpoint.
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.
 * @returns {number[]} Array of token ids.
 */
function getTextTokensFromServer(endpoint, str, resolve) {
    const isAsync = typeof resolve === 'function';
    let ids = [];
    jQuery.ajax({
        async: isAsync,
        type: 'POST',
        url: endpoint,
        data: JSON.stringify({ text: str }),
        dataType: 'json',
        contentType: 'application/json',
        success: function (data) {
            ids = data.ids;

            // Don't want to break reverse compatibility, so sprinkle in some of the JS magic
            if (Array.isArray(data.chunks)) {
                Object.defineProperty(ids, 'chunks', { value: data.chunks });
            }

            if (isAsync) resolve(ids);
        },
    });
    return ids;
}

/**
 * Encodes a string to tokens using the server API.
 * @param {number} tokenizerType Tokenizer type.
 * @param {string} str String to tokenize.
 * @returns {number[]} Array of token ids.
 */
export function getTextTokens(tokenizerType, str) {
    switch (tokenizerType) {
        default: {
            const tokenizerEndpoints = TOKENIZER_URLS[tokenizerType];
            if (!tokenizerEndpoints) {
                apiFailureTokenCount(str);
                console.warn('Unknown tokenizer type', tokenizerType);
                return [];
            }
            let endpointUrl = tokenizerEndpoints.encode;
            if (!endpointUrl) {
                apiFailureTokenCount(str);
                console.warn('This tokenizer type does not support encoding', tokenizerType);
                return [];
            }
            if (tokenizerType === tokenizers.OPENAI) {
                endpointUrl += `?model=${getTokenizerModel()}`;
            }
            return getTextTokensFromServer(endpointUrl, str);
        }
    }
}

/**
 * Decodes token ids to text using the server API.
 * @param {number} tokenizerType Tokenizer type.
 * @param {number[]} ids Array of token ids
 * @returns {({ text: string, chunks?: string[] })} Decoded token text as a single string and individual chunks (if available).
 */
export function decodeTextTokens(tokenizerType, ids) {
    const tokenizerEndpoints = TOKENIZER_URLS[tokenizerType];
    if (!tokenizerEndpoints) {
        console.warn('Unknown tokenizer type', tokenizerType);
        return { text: '', chunks: [] };
    }
    let endpointUrl = tokenizerEndpoints.decode;
    if (!endpointUrl) {
        console.warn('This tokenizer type does not support decoding', tokenizerType);
        return { text: '', chunks: [] };
    }
    if (tokenizerType === tokenizers.OPENAI) {
        endpointUrl += `?model=${getTokenizerModel()}`;
    }
    return decodeTextTokensFromServer(endpointUrl, ids);
}

function apiFailureTokenCount(str) {
    console.error('Error counting tokens');
    return guesstimate(str);
}

/**
 * Calls the server API to decode token ids to text.
 * @param {string} endpoint API endpoint.
 * @param {number[]} ids Array of token ids.
 * @param {function} [resolve] Promise resolve function.
 * @returns {({ text: string, chunks?: string[] })} Decoded token text.
 */
function decodeTextTokensFromServer(endpoint, ids, resolve) {
    const isAsync = typeof resolve === 'function';
    let text = '';
    let chunks = [];
    jQuery.ajax({
        async: isAsync,
        type: 'POST',
        url: endpoint,
        data: JSON.stringify({ ids: ids }),
        dataType: 'json',
        contentType: 'application/json',
        success: function (data) {
            text = data.text;
            chunks = data.chunks;
            if (isAsync) resolve({ text, chunks });
        },
    });
    return { text, chunks };
}

export async function initTokenizers() {
    await loadTokenCache();
    registerDebugFunction('resetTokenCache', 'Reset token cache', 'Purges the calculated token counts. Use this if you want to force a full re-tokenization of all chats or suspect the token counts are wrong.', resetTokenCache);
}
