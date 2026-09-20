import { readSecret, SECRET_KEYS } from './secrets.js';
import { GEMINI_SAFETY } from '../constants.js';
import { getConfigValue, trimTrailingSlash } from '../util.js';

const API_MAKERSUITE = 'https://generativelanguage.googleapis.com';

/**
 * Generates Google AI Studio API URL and headers based on request configuration
 * @param {express.Request} request Express request object
 * @param {string} model Model name to use
 * @param {string} endpoint API endpoint (default: 'generateContent')
 * @returns {Promise<{url: string, headers: object, apiName: string, baseUrl: string, safetySettings: object[]}>} URL, headers, and API name
 */
export async function getGoogleApiConfig(request, model, endpoint = 'generateContent') {
    const apiName = 'Google AI Studio';
    const safetySettings = [...GEMINI_SAFETY];
    const apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.MAKERSUITE);
    const apiUrl = trimTrailingSlash(request.body.reverse_proxy || API_MAKERSUITE);
    const apiVersion = getConfigValue('gemini.apiVersion', 'v1beta');
    const baseUrl = `${apiUrl}/${apiVersion}`;
    const url = `${baseUrl}/models/${model}:${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
    };

    return { url, headers, apiName, baseUrl, safetySettings };
}
