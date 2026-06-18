/* global globalThis */
import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';
import corsProxyMiddleware from '../src/middleware/corsProxy.js';
import errorHandlerMiddleware from '../src/middleware/errorHandler.js';
import {
    CORS_PROXY_ROUTE,
    OAUTH_CALLBACK_ROUTE,
    disabledCorsProxyMiddleware,
    oauthCallbackMiddleware,
} from '../src/express-route-compat.js';
import getWebpackServeMiddleware from '../src/middleware/webpack-serve.js';
import userCssMiddleware from '../src/middleware/userCss.js';
import multerMonkeyPatch from '../src/middleware/multerMonkeyPatch.js';
import getPublicLibConfig from '../webpack.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const globalExtensionRoot = path.join(process.cwd(), 'public', 'scripts', 'extensions', 'third-party', 'express5-local');
const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-express5-config-'));
const configPath = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(configPath, 'extensions:\n  enabled: true\n', 'utf8');
setConfigFilePath(configPath);

const { router: userDataRouter, requireLoginMiddleware } = await import('../src/users.js');
const { router: imagesRouter } = await import('../src/endpoints/images.js');
const { redirectDeprecatedEndpoints, setupPublicEndpoints } = await import('../src/server-startup.js');

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}`,
            });
        });
    });
}

async function usingApp(app, callback) {
    const { server, url } = await listen(app);
    try {
        return await callback(url);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

function createUserDirectories(root) {
    const directories = {
        backgrounds: path.join(root, 'backgrounds'),
        characters: path.join(root, 'characters'),
        avatars: path.join(root, 'User Avatars'),
        assets: path.join(root, 'assets'),
        userImages: path.join(root, 'user', 'images'),
        files: path.join(root, 'user', 'files'),
        extensions: path.join(root, 'extensions'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    return directories;
}

function createUserRouterApp(directories) {
    const app = express();
    app.use((req, _res, next) => {
        req.user = {
            profile: { handle: 'test-user' },
            directories,
        };
        next();
    });
    app.use(userDataRouter);
    return app;
}

describe('Express 5 route compatibility', () => {
    const tmpRoots = [];

    beforeAll(() => {
        globalThis.DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-express5-data-'));
        fs.mkdirSync(globalExtensionRoot, { recursive: true });
        fs.writeFileSync(path.join(globalExtensionRoot, 'fallback.txt'), 'global extension', 'utf8');
    });

    afterAll(() => {
        fs.rmSync(configTmpDir, { recursive: true, force: true });
        fs.rmSync(globalThis.DATA_ROOT, { recursive: true, force: true });
        fs.rmSync(globalExtensionRoot, { recursive: true, force: true });
    });

    afterEach(() => {
        for (const root of tmpRoots.splice(0)) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('OAuth callback route preserves root and sourced redirects', async () => {
        const app = express();
        app.get(OAUTH_CALLBACK_ROUTE, oauthCallbackMiddleware);

        await usingApp(app, async (url) => {
            const rootResponse = await fetch(`${url}/callback`, { redirect: 'manual' });
            expect(rootResponse.status).toBe(307);
            expect(rootResponse.headers.get('location')).toBe('/');

            const sourceResponse = await fetch(`${url}/callback/openrouter?code=abc&state=xyz&redirect_uri=https%3A%2F%2Fevil.test`, { redirect: 'manual' });
            expect(sourceResponse.status).toBe(307);
            const sourceRedirect = new URL(sourceResponse.headers.get('location'), url);
            expect(sourceRedirect.pathname).toBe('/');
            expect(sourceRedirect.searchParams.get('source')).toBe('openrouter');
            expect(sourceRedirect.searchParams.get('query')).toBe('code=abc&state=xyz');

            const errorResponse = await fetch(`${url}/callback?error=access_denied&error_description=Denied&unexpected=value`, { redirect: 'manual' });
            expect(errorResponse.status).toBe(307);
            expect(errorResponse.headers.get('location')).toBe('/?error=access_denied&error_description=Denied');
        });
    });

    test('CORS proxy route captures the full target URL and disabled mode remains 404', async () => {
        const originalPrivateWhitelistEnabled = process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ENABLED;
        const originalPrivateWhitelistRanges = process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ALLOWEDRANGES;
        const upstream = express();
        upstream.all('/a/b', (request, response) => {
            response.type('text/plain').send(`proxied ${request.query.x}`);
        });

        try {
            await usingApp(upstream, async (upstreamUrl) => {
                const blockedApp = express();
                blockedApp.use(CORS_PROXY_ROUTE, corsProxyMiddleware);
                await usingApp(blockedApp, async (url) => {
                    const blockedPrivateTarget = await fetch(`${url}/proxy/${upstreamUrl}/a/b?x=1`);
                    expect(blockedPrivateTarget.status).toBe(403);
                    expect(await blockedPrivateTarget.text()).toContain('CORS proxy target is not allowed');
                });

                process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ENABLED = 'true';
                process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ALLOWEDRANGES = JSON.stringify(['127.0.0.0/8']);

                const enabledApp = express();
                enabledApp.use(CORS_PROXY_ROUTE, corsProxyMiddleware);

                await usingApp(enabledApp, async (url) => {
                    const response = await fetch(`${url}/proxy/${upstreamUrl}/a/b?x=1`);
                    expect(response.status).toBe(200);
                    expect(await response.text()).toBe('proxied 1');

                    const circular = await fetch(`${url}/proxy/${url}/loop`);
                    expect(circular.status).toBe(400);
                    expect(await circular.text()).toContain('Circular requests are not allowed');

                    const usernameBypass = await fetch(`${url}/proxy/http://example.test@127.0.0.1:${new URL(url).port}/loop`);
                    expect(usernameBypass.status).toBe(400);
                    expect(await usernameBypass.text()).toContain('Circular requests are not allowed');

                    const encodedHost = await fetch(`${url}/proxy/http://%31%32%37.0.0.1:${new URL(url).port}/loop`);
                    expect(encodedHost.status).toBe(400);
                    expect(await encodedHost.text()).toContain('Circular requests are not allowed');

                    const invalidTarget = await fetch(`${url}/proxy/http://example.test%40127.0.0.1:${new URL(url).port}/loop`);
                    expect(invalidTarget.status).toBe(400);
                    expect(await invalidTarget.text()).toContain('Invalid CORS proxy target URL');
                });
            });

            const encodedUpstream = express();
            encodedUpstream.all('/encoded/*tail', (request, response) => {
                response.type('text/plain').send(request.originalUrl);
            });
            await usingApp(encodedUpstream, async (upstreamUrl) => {
                const enabledApp = express();
                enabledApp.use(CORS_PROXY_ROUTE, corsProxyMiddleware);

                await usingApp(enabledApp, async (url) => {
                    const response = await fetch(`${url}/proxy/${upstreamUrl}/encoded/a%252Fb?x=1`);
                    expect(response.status).toBe(200);
                    expect(await response.text()).toBe('/encoded/a%252Fb?x=1');
                });
            });
        } finally {
            if (originalPrivateWhitelistEnabled === undefined) {
                delete process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ENABLED;
            } else {
                process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ENABLED = originalPrivateWhitelistEnabled;
            }
            if (originalPrivateWhitelistRanges === undefined) {
                delete process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ALLOWEDRANGES;
            } else {
                process.env.EMBERDESK_PRIVATEADDRESSWHITELIST_ALLOWEDRANGES = originalPrivateWhitelistRanges;
            }
        }

        const disabledApp = express();
        disabledApp.use(CORS_PROXY_ROUTE, disabledCorsProxyMiddleware);
        await usingApp(disabledApp, async (url) => {
            const response = await fetch(`${url}/proxy/https://example.test/a/b?x=1`);
            expect(response.status).toBe(404);
            expect(await response.text()).toContain('CORS proxy is disabled');
        });
    });

    test('user file wildcard routes preserve nested files, encoded avatar path, extension fallback, and errors', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-express5-user-'));
        tmpRoots.push(root);
        const directories = createUserDirectories(root);

        fs.mkdirSync(path.join(directories.characters, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(directories.characters, 'nested', 'hero.png'), 'character file', 'utf8');
        fs.mkdirSync(path.join(directories.avatars, 'folder'), { recursive: true });
        fs.writeFileSync(path.join(directories.avatars, 'folder', 'avatar.png'), 'avatar file', 'utf8');
        fs.mkdirSync(path.join(directories.extensions, 'local'), { recursive: true });
        fs.writeFileSync(path.join(directories.extensions, 'local', 'asset.txt'), 'local extension', 'utf8');

        await usingApp(createUserRouterApp(directories), async (url) => {
            const nested = await fetch(`${url}/characters/nested/hero.png`);
            expect(nested.status).toBe(200);
            expect(await nested.text()).toBe('character file');

            const avatar = await fetch(`${url}/User%20Avatars/folder/avatar.png`);
            expect(avatar.status).toBe(200);
            expect(await avatar.text()).toBe('avatar file');

            const localExtension = await fetch(`${url}/scripts/extensions/third-party/local/asset.txt`);
            expect(localExtension.status).toBe(200);
            expect(await localExtension.text()).toBe('local extension');

            const globalExtension = await fetch(`${url}/scripts/extensions/third-party/express5-local/fallback.txt`);
            expect(globalExtension.status).toBe(200);
            expect(await globalExtension.text()).toBe('global extension');

            const traversal = await fetch(`${url}/characters/%252e%252e%252fsecret.txt`);
            expect(traversal.status).toBe(404);

            const emptyWildcard = await fetch(`${url}/characters/`);
            expect(emptyWildcard.status).toBe(404);

            const missing = await fetch(`${url}/characters/missing.png`);
            expect(missing.status).toBe(404);
        });
    });

    test('global error handler keeps async errors out of Express default HTML responses', async () => {
        const app = express();
        app.get('/api/fails', async () => {
            throw new Error('Async failure');
        });
        app.get('/page-fails', async () => {
            throw new Error('Page failure');
        });
        app.use(errorHandlerMiddleware);

        await usingApp(app, async (url) => {
            const apiResponse = await fetch(`${url}/api/fails`, {
                headers: { accept: 'application/json' },
            });
            expect(apiResponse.status).toBe(500);
            expect(apiResponse.headers.get('content-type')).toContain('application/json');
            expect(await apiResponse.json()).toEqual({ error: 'Internal Server Error' });

            const pageResponse = await fetch(`${url}/page-fails`);
            expect(pageResponse.status).toBe(500);
            expect(pageResponse.headers.get('content-type')).toContain('text/plain');
            expect(await pageResponse.text()).toBe('Internal Server Error');
        });
    });

    test('deprecated image list folder parameter still maps to request body folder', async () => {
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-express5-images-'));
            tmpRoots.push(userRoot);
            req.user = { directories: { userImages: path.join(userRoot, 'user', 'images') } };
            next();
        });
        app.use('/api/images', imagesRouter);

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/api/images/list/favorites`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual([]);
        });
    });

    test('deprecated endpoint redirects preserve methods under Express 5', async () => {
        const app = express();
        redirectDeprecatedEndpoints(app);

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/getcharacters`, {
                method: 'POST',
                redirect: 'manual',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            });

            expect(response.status).toBe(308);
            expect(response.headers.get('location')).toBe('/api/characters/all');
        });
    });

    test('public health endpoint stays in front of the private route gate', async () => {
        const app = express();
        app.get('/login', (_request, response) => response.type('text/plain').send('login page'));
        app.use((request, _response, next) => {
            if (request.get('x-test-user')) {
                request.user = { profile: { handle: 'test-user' }, directories: {} };
            }
            next();
        });
        setupPublicEndpoints(app);
        app.use(requireLoginMiddleware);
        app.get('/api/private', (_request, response) => response.json({ ok: true }));

        await usingApp(app, async (url) => {
            const healthResponse = await fetch(`${url}/api/ping`);
            expect(healthResponse.status).toBe(200);
            expect(await healthResponse.json()).toEqual(expect.objectContaining({
                status: 'ok',
                message: 'EmberDesk API is running',
                version: packageJson.version,
            }));

            const blockedPrivate = await fetch(`${url}/api/private`);
            expect(blockedPrivate.status).toBe(403);
        });
    });

    test('private routes stay behind the login wall and final 404 stays last', async () => {
        const app = express();
        app.get('/login', (_request, response) => response.type('text/plain').send('login page'));
        app.use((request, _response, next) => {
            if (request.get('x-test-user')) {
                request.user = { profile: { handle: 'test-user' }, directories: {} };
            }
            next();
        });
        app.use(requireLoginMiddleware);
        app.get('/api/private', (_request, response) => response.json({ ok: true }));
        app.get('/api/fails', async () => {
            throw new Error('Route failure');
        });
        app.use(errorHandlerMiddleware);
        app.use((_request, response) => response.status(404).type('text/plain').send('custom not found'));

        await usingApp(app, async (url) => {
            const loginResponse = await fetch(`${url}/login`);
            expect(loginResponse.status).toBe(200);
            expect(await loginResponse.text()).toBe('login page');

            const blockedPrivate = await fetch(`${url}/api/private`);
            expect(blockedPrivate.status).toBe(403);

            const allowedPrivate = await fetch(`${url}/api/private`, { headers: { 'x-test-user': '1' } });
            expect(allowedPrivate.status).toBe(200);
            expect(await allowedPrivate.json()).toEqual({ ok: true });

            const routeError = await fetch(`${url}/api/fails`, { headers: { 'x-test-user': '1' } });
            expect(routeError.status).toBe(500);
            expect(routeError.headers.get('content-type')).toContain('application/json');
            expect(await routeError.json()).toEqual({ error: 'Internal Server Error' });

            const missing = await fetch(`${url}/missing`, { headers: { 'x-test-user': '1' } });
            expect(missing.status).toBe(404);
            expect(await missing.text()).toBe('custom not found');
        });
    });

    test('avatar upload parsing runs after the private route gate', async () => {
        const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-express5-upload-'));
        tmpRoots.push(uploadRoot);
        const app = express();
        app.use((request, _response, next) => {
            if (request.get('x-test-user')) {
                request.user = { profile: { handle: 'test-user' }, directories: {} };
            }
            next();
        });
        app.use(requireLoginMiddleware);
        app.use(multer({ dest: uploadRoot }).single('avatar'));
        app.use(multerMonkeyPatch);
        app.post('/api/upload-inspection', (request, response) => {
            response.json({
                hasFile: Boolean(request.file),
                fieldName: request.file?.fieldname,
                originalName: request.file?.originalname,
            });
        });

        await usingApp(app, async (url) => {
            const blockedForm = new FormData();
            blockedForm.append('avatar', new Blob(['blocked']), 'blocked.png');
            const blocked = await fetch(`${url}/api/upload-inspection`, {
                method: 'POST',
                body: blockedForm,
            });
            expect(blocked.status).toBe(403);

            const allowedForm = new FormData();
            allowedForm.append('avatar', new Blob(['allowed']), 'avatar.png');
            const allowed = await fetch(`${url}/api/upload-inspection`, {
                method: 'POST',
                headers: { 'x-test-user': '1' },
                body: allowedForm,
            });
            expect(allowed.status).toBe(200);
            expect(await allowed.json()).toEqual({
                hasFile: true,
                fieldName: 'avatar',
                originalName: 'avatar.png',
            });
        });
    });

    test('server plugin routes still mount under /api/plugins/{id}', async () => {
        const script = [
            'import express from "express";',
            'import fs from "node:fs";',
            'import os from "node:os";',
            'import path from "node:path";',
            'import http from "node:http";',
            'import { setConfigFilePath } from "./src/util.js";',
            'const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "emberdesk-express5-plugin-child-"));',
            'fs.writeFileSync(path.join(tmp, "config.yaml"), "enableServerPlugins: true\\n", "utf8");',
            'setConfigFilePath(path.join(tmp, "config.yaml"));',
            'const pluginsRoot = path.join(tmp, "plugins");',
            'fs.mkdirSync(pluginsRoot, { recursive: true });',
            'fs.writeFileSync(path.join(pluginsRoot, "mounted-plugin.mjs"), "export const info = { id: \\"mounted_plugin\\", name: \\"Mounted Plugin\\", description: \\"test\\" };\\nexport async function init(router) { router.get(\\"/status\\", (_req, res) => res.json({ ok: true })); }", "utf8");',
            'const { loadPlugins } = await import("./src/plugin-loader.js");',
            'const app = express();',
            'const cleanup = await loadPlugins(app, pluginsRoot);',
            'const server = http.createServer(app);',
            'await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });',
            'const address = server.address();',
            'const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/mounted_plugin/status`);',
            'const body = await response.text();',
            'await new Promise(resolve => server.close(resolve));',
            'await cleanup();',
            'fs.rmSync(tmp, { recursive: true, force: true });',
            'if (response.status !== 200 || body !== "{\\"ok\\":true}") { throw new Error(`Unexpected plugin response ${response.status} ${body}`); }',
        ].join('\n');
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        expect(result.status).toBe(0);
    });

    test('static browser assets keep Express 5 compatible MIME types', async () => {
        const webpackConfig = getPublicLibConfig();
        fs.mkdirSync(webpackConfig.output.path, { recursive: true });
        fs.writeFileSync(path.join(webpackConfig.output.path, webpackConfig.output.filename), 'export default {};', 'utf8');
        fs.mkdirSync(path.join(globalThis.DATA_ROOT, '_css'), { recursive: true });
        fs.writeFileSync(path.join(globalThis.DATA_ROOT, '_css', 'user.css'), ':root { --test: 1; }', 'utf8');

        const app = express();
        app.use(getWebpackServeMiddleware());
        app.use(userCssMiddleware);
        app.use(express.static(path.join(repoRoot, 'public'), {}));

        await usingApp(app, async (url) => {
            const checks = [
                ['/lib.js', 'text/javascript'],
                ['/script.js', 'text/javascript'],
                ['/style.css', 'text/css'],
                ['/index.html', 'text/html'],
                ['/img/claude.svg', 'image/svg+xml'],
                ['/webfonts/NotoSans/NotoSans-Regular.woff2', 'font/woff2'],
                ['/css/user.css', 'text/css'],
            ];

            for (const [assetPath, contentType] of checks) {
                const response = await fetch(`${url}${assetPath}`);
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain(contentType);
                await response.arrayBuffer();
            }
        });
    });

    test('missing user CSS still returns an empty stylesheet response', async () => {
        fs.mkdirSync(path.join(globalThis.DATA_ROOT, '_css'), { recursive: true });
        fs.rmSync(path.join(globalThis.DATA_ROOT, '_css', 'user.css'), { force: true });

        const app = express();
        app.use(userCssMiddleware);
        app.use(express.static(path.join(repoRoot, 'public'), {}));

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/css/user.css`);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/css');
            expect(await response.text()).toBe('');
        });
    });
});
