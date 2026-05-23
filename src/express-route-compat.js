export const OAUTH_CALLBACK_ROUTE = '/callback{/:source}';
export const CORS_PROXY_ROUTE = '/proxy/*url';

/**
 * Redirects OAuth PKCE callbacks back to the app shell.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 * @returns {import('express').Response} Redirect response
 */
export function oauthCallbackMiddleware(request, response) {
    const source = request.params.source;
    const query = request.url.split('?')[1];
    const searchParams = new URLSearchParams();
    source && searchParams.set('source', source);
    query && searchParams.set('query', query);
    const path = `/?${searchParams.toString()}`;
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
    console.log(message);
    return response.status(404).send(message);
}
