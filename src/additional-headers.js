import { getConfigValue } from './util.js';

/**
 * Gets override headers for a specific host from config.
 * @param {string} urlHost Host to check for overrides
 * @returns {object} Override headers
 */
export function getOverrideHeaders(urlHost) {
    const requestOverrides = getConfigValue('requestOverrides', []);
    const overrideHeaders = requestOverrides?.find((e) => e.hosts?.includes(urlHost))?.headers;
    if (overrideHeaders && urlHost) {
        return overrideHeaders;
    } else {
        return {};
    }
}

/**
 * Sets additional headers for the request based on host overrides.
 * @param {import('express').Request} request Original request body
 * @param {object} args New request arguments
 * @param {string|null} server API server for new request
 */
export function setAdditionalHeaders(request, args, server) {
    if (typeof server === 'string' && server.length > 0) {
        try {
            const url = new URL(server);
            const overrideHeaders = getOverrideHeaders(url.host);
            if (overrideHeaders && Object.keys(overrideHeaders).length > 0) {
                Object.assign(args.headers, overrideHeaders);
            }
        } catch {
            // Do nothing
        }
    }
}
