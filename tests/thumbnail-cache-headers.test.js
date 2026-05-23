import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { USER_DIRECTORY_TEMPLATE } from '../src/constants.js';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_AVATAR_PATH = path.resolve(__dirname, '../public/img/ai4.png');

const tempRoots = [];
let server;
let origin;
let thumbnailRouter;

function makeDirectories(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);

    const directories = {};
    for (const [key, relativePath] of Object.entries(USER_DIRECTORY_TEMPLATE)) {
        directories[key] = key === 'root' ? root : path.join(root, relativePath);
        fs.mkdirSync(directories[key], { recursive: true });
    }

    return directories;
}

function writeFixtureFile(directory, fileName, contentsPath = DEFAULT_AVATAR_PATH) {
    fs.copyFileSync(contentsPath, path.join(directory, fileName));
}

function createApp(directories) {
    const app = express();
    app.use((request, _response, next) => {
        request.user = { directories };
        next();
    });
    app.use('/thumbnail', thumbnailRouter);
    return app;
}

async function requestThumbnail(targetPath, { headers } = {}) {
    const response = await fetch(`${origin}${targetPath}`, { headers });
    return response;
}

// fetch() hides some 304 details, so the raw client is used for validator assertions.
async function requestThumbnailRaw(targetPath, { headers } = {}) {
    return await new Promise((resolve, reject) => {
        const request = http.request(`${origin}${targetPath}`, {
            method: 'GET',
            headers,
        }, (response) => {
            response.resume();
            response.on('end', () => resolve(response));
        });

        request.on('error', reject);
        request.end();
    });
}

beforeAll(async () => {
    setConfigFilePath(path.resolve(__dirname, '../default/config.yaml'));
    ({ router: thumbnailRouter } = await import('../src/endpoints/thumbnails.js'));

    const directories = makeDirectories('emberdesk-thumbnail-cache-');
    writeFixtureFile(directories.characters, 'cached.png');
    writeFixtureFile(directories.thumbnailsAvatar, 'cached.png');
    // The extension selects the serveOriginal() branch; the bytes themselves are irrelevant here.
    writeFixtureFile(directories.characters, 'animated.gif');

    const app = createApp(directories);
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            const address = server.address();
            origin = `http://127.0.0.1:${address.port}`;
            resolve();
        });
    });
});

afterAll(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }

    for (const root of tempRoots) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('thumbnail cache headers', () => {
    test('non-Firefox cached thumbnail hit returns private cache headers', async () => {
        const response = await requestThumbnail('/thumbnail?type=avatar&file=cached.png', {
            headers: {
                'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
            },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, max-age=3600, must-revalidate');
    });

    test('non-Firefox gif original fallback returns private cache headers', async () => {
        const response = await requestThumbnail('/thumbnail?type=avatar&file=animated.gif', {
            headers: {
                'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
            },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, max-age=3600, must-revalidate');
    });

    test('Firefox responses keep no-store cache headers', async () => {
        const response = await requestThumbnail('/thumbnail?type=avatar&file=cached.png', {
            headers: {
                'user-agent': 'Mozilla/5.0 Firefox/126.0',
            },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('must-understand, no-store');
    });

    test('conditional If-None-Match request returns 304', async () => {
        const firstResponse = await requestThumbnail('/thumbnail?type=avatar&file=cached.png', {
            headers: {
                'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
            },
        });
        const etag = firstResponse.headers.get('etag');

        expect(firstResponse.status).toBe(200);
        expect(etag).toBeTruthy();

        const response = await requestThumbnailRaw('/thumbnail?type=avatar&file=cached.png', {
            headers: {
                'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
                'if-none-match': etag,
            },
        });

        expect(response.statusCode).toBe(304);
        expect(response.headers['cache-control']).toBe('private, max-age=3600, must-revalidate');
    });

    test('refresh-style no-cache request still receives a normal 200 response', async () => {
        const response = await requestThumbnail('/thumbnail?type=avatar&file=cached.png', {
            headers: {
                'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
                'cache-control': 'no-cache',
            },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, max-age=3600, must-revalidate');
    });

    test('missing thumbnails keep existing 404 cache behavior', async () => {
        const response = await requestThumbnail('/thumbnail?type=avatar&file=missing.png', {
            headers: {
                'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
            },
        });

        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBeNull();
    });
});
