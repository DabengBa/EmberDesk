export const OAUTH_CALLBACK_ROUTE = '/callback{/:source}';
export const CORS_PROXY_ROUTE = '/proxy/*url';

const OAUTH_CALLBACK_QUERY_KEYS = new Set([
    'code',
    'state',
    'error',
    'error_description',
    'error_uri',
    'iss',
]);

/**
 * Redirects OAuth PKCE callbacks back to the app shell.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 * @returns {import('express').Response} Redirect response
 */
export function oauthCallbackMiddleware(request, response) {
    const source = request.params.source;
    const callbackUrl = new URL(request.originalUrl, `${request.protocol}://${request.get('host')}`);
    const searchParams = new URLSearchParams();
    source && searchParams.set('source', source);

    for (const [key, value] of callbackUrl.searchParams) {
        if (OAUTH_CALLBACK_QUERY_KEYS.has(key)) {
            searchParams.set(key, value);
        }
    }

    const query = searchParams.toString();
    const path = query ? `/?${query}` : '/';
    return response.redirect(307, path);
}

/**
 * Reports that the optional CORS proxy is disabled.
 * @param {import('express').Request} _request Request object
 * @param {import('express').Response} response Response object
 * @returns {import('express').Response} Error response
 */
export function disabledCorsProxyMiddleware(_request, response) {
    const message = 'CORS proxy is disabled. Enable it in config.yaml or use the --corsProxy flag.';
    return response.status(404).send(message);
}
