import fetch from 'node-fetch';
import { forwardFetchResponse } from '../util.js';

/**
 * Gets the proxied URL captured by Express route params.
 * @param {import('express').Request} req Express request object
 * @returns {string} Proxied URL
 */
function getProxyUrl(req) {
    const [originalPath, originalQuery] = req.originalUrl.split('?');
    if (originalPath.startsWith('/proxy/')) {
        const rawTarget = originalPath.slice('/proxy/'.length);
        return originalQuery ? `${rawTarget}?${originalQuery}` : rawTarget;
    }

    const captured = req.params.url ?? req.params[0] ?? '';
    const path = Array.isArray(captured) ? captured.join('/') : captured;
    const query = req.url.split('?')[1];
    return query ? `${path}?${query}` : path;
}

/**
 * Middleware to proxy requests to a different domain
 * @param {import('express').Request} req Express request object
 * @param {import('express').Response} res Express response object
 */
export default async function corsProxyMiddleware(req, res) {
    const url = getProxyUrl(req);

    if (!url) {
        return res.status(400).send('CORS proxy target URL is required');
    }

    // Disallow circular requests
    const serverUrl = req.protocol + '://' + req.get('host');
    if (url.startsWith(serverUrl)) {
        return res.status(400).send('Circular requests are not allowed');
    }

    try {
        const headers = JSON.parse(JSON.stringify(req.headers));
        const headersToRemove = [
            'x-csrf-token', 'host', 'referer', 'origin', 'cookie',
            'x-forwarded-for', 'x-forwarded-protocol', 'x-forwarded-proto',
            'x-forwarded-host', 'x-real-ip', 'sec-fetch-mode',
            'sec-fetch-site', 'sec-fetch-dest',
        ];

        headersToRemove.forEach(header => delete headers[header]);

        const bodyMethods = ['POST', 'PUT', 'PATCH'];

        const response = await fetch(url, {
            method: req.method,
            headers: headers,
            body: bodyMethods.includes(req.method) ? JSON.stringify(req.body) : undefined,
        });

        // Copy over relevant response params to the proxy response
        await forwardFetchResponse(response, res);
    } catch (error) {
        console.error('Error in CORS proxy middleware:', error);
        if (!res.headersSent) {
            return res.sendStatus(500);
        }
        return res.end();
    }
}
