import fetch from 'node-fetch';
import { forwardFetchResponse } from '../util.js';

function getRequestOrigin(req) {
    return new URL(`${req.protocol}://${req.get('host')}`);
}

function getEffectivePort(url) {
    if (url.port) {
        return url.port;
    }

    if (url.protocol === 'http:') {
        return '80';
    }

    if (url.protocol === 'https:') {
        return '443';
    }

    return '';
}

function isCircularRequest(targetUrl, requestOrigin) {
    return targetUrl.protocol === requestOrigin.protocol
        && targetUrl.hostname.toLowerCase() === requestOrigin.hostname.toLowerCase()
        && getEffectivePort(targetUrl) === getEffectivePort(requestOrigin);
}

/**
 * Gets the proxied URL captured by Express route params.
 * @param {import('express').Request} req Express request object
 * @returns {string} Proxied URL
 */
function getProxyUrl(req) {
    const queryIndex = req.originalUrl.indexOf('?');
    const originalPath = queryIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, queryIndex);
    const originalQuery = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex + 1);
    if (originalPath.startsWith('/proxy/')) {
        const rawTarget = originalPath.slice('/proxy/'.length);
        return originalQuery ? `${rawTarget}?${originalQuery}` : rawTarget;
    }

    const captured = req.params.url ?? '';
    const path = Array.isArray(captured) ? captured.join('/') : captured;
    const fallbackQueryIndex = req.url.indexOf('?');
    const query = fallbackQueryIndex === -1 ? '' : req.url.slice(fallbackQueryIndex + 1);
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

    let targetUrl;
    try {
        targetUrl = new URL(url);
    } catch {
        return res.status(400).send('Invalid CORS proxy target URL');
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return res.status(400).send('Invalid CORS proxy target URL');
    }

    if (isCircularRequest(targetUrl, getRequestOrigin(req))) {
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

        const response = await fetch(targetUrl.href, {
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
