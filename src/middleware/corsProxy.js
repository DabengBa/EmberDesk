import http from 'node:http';
import https from 'node:https';
import { getConfigValue } from '../util.js';
import { PrivateRequestAgent } from '../private-request-filter.js';

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

function createCorsProxyAgent() {
    const privateAddressWhitelistEnabled = !!getConfigValue('privateAddressWhitelist.enabled', false, 'boolean');

    return new PrivateRequestAgent({
        privateAddressWhitelist: privateAddressWhitelistEnabled ? getConfigValue('privateAddressWhitelist.allowedRanges', []) : [],
        logBlocked: !!getConfigValue('privateAddressWhitelist.log.blockedRequests', true, 'boolean'),
        logAllowed: !!getConfigValue('privateAddressWhitelist.log.allowedRequests', false, 'boolean'),
        allowUnresolvedHosts: !!getConfigValue('privateAddressWhitelist.allowUnresolvedHosts', false, 'boolean'),
        enableKeepAlive: false,
    });
}

/**
 * Proxies a request through the private-request-filter agent so DNS resolution and
 * the actual outbound socket connect use the same SSRF guard.
 * @param {URL} targetUrl Target URL
 * @param {import('express').Request} req Express request object
 * @param {import('express').Response} res Express response object
 * @returns {Promise<void>}
 */
async function forwardProxyRequest(targetUrl, req, res) {
    const bodyMethods = ['POST', 'PUT', 'PATCH'];
    const headers = JSON.parse(JSON.stringify(req.headers));
    const headersToRemove = [
        'x-csrf-token', 'host', 'referer', 'origin', 'cookie',
        'x-forwarded-for', 'x-forwarded-protocol', 'x-forwarded-proto',
        'x-forwarded-host', 'x-real-ip', 'sec-fetch-mode',
        'sec-fetch-site', 'sec-fetch-dest', 'content-length',
    ];
    const responseHeadersToRemove = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
    ]);

    headersToRemove.forEach(header => delete headers[header]);

    await new Promise((resolve, reject) => {
        const request = (targetUrl.protocol === 'https:' ? https : http).request(targetUrl, {
            method: req.method,
            headers,
            agent: createCorsProxyAgent(),
        }, upstreamResponse => {
            res.status(upstreamResponse.statusCode ?? 500);
            for (const [header, value] of Object.entries(upstreamResponse.headers)) {
                if (value !== undefined && !responseHeadersToRemove.has(header.toLowerCase())) {
                    res.setHeader(header, value);
                }
            }
            upstreamResponse.pipe(res);
            upstreamResponse.on('end', resolve);
            upstreamResponse.on('error', reject);
        });

        request.on('error', reject);

        if (bodyMethods.includes(req.method)) {
            const serializedBody = JSON.stringify(req.body);
            if (serializedBody !== undefined) {
                request.write(serializedBody);
            }
        }

        request.end();
    });
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
        await forwardProxyRequest(targetUrl, req, res);
    } catch (error) {
        if (error.message?.startsWith('Blocked request to private IP address:')
            || error.message?.startsWith('Unable to resolve host:')) {
            console.warn(error.message);
            return res.status(403).send('CORS proxy target is not allowed');
        }

        console.error('Error in CORS proxy middleware:', error);
        if (!res.headersSent) {
            return res.sendStatus(500);
        }
        return res.end();
    }
}
