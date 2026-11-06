import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, resolveConfig } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(repoRoot, 'vite.config.ts');
const workspaceHtml = readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const backend = createHttpServer((req, res) => {
    if (req.url === '/api/identity') return res.end(JSON.stringify(req.headers));
    if (req.url === '/?dev-workspace=1') {
        res.setHeader('content-type', 'text/html');
        res.setHeader('x-observed-url', req.url);
        return res.end(workspaceHtml);
    }
    if (req.url === '/not-a-page') {
        res.writeHead(404);
        return res.end();
    }
    if (req.url.startsWith('/settings') && !req.headers.cookie) {
        res.writeHead(302, { location: '/login' });
        return res.end();
    }
    if (/^\/(login|setup|settings)\/?(\?|$)/.test(req.url)) {
        if (req.headers['x-test-missing-build']) {
            const page = req.url.split(/[/?]/)[1];
            res.writeHead(503, { 'content-type': 'text/plain' });
            return res.end(`React ${page} build is missing. Run "pnpm run build:react" and restart the server.`);
        }
        if (req.headers['x-test-unavailable']) {
            res.writeHead(503, { 'content-type': 'text/plain' });
            return res.end('unavailable');
        }
        res.setHeader('content-type', 'text/html');
        return res.end('<html>production build</html>');
    }
    if (req.url === '/csrf-token') {
        res.setHeader('Set-Cookie', 'session=fixture; Path=/; HttpOnly');
        return res.end(JSON.stringify({ token: 'fixture-token' }));
    }
    if (req.url === '/api/check') {
        res.statusCode = req.headers.cookie === 'session=fixture'
            && req.headers['x-csrf-token'] === 'fixture-token' ? 204 : 403;
        return res.end();
    }
    res.end(`backend:${req.url}`);
});

const previousBackendOrigin = process.env.VITE_BACKEND_ORIGIN;
const previousDevPort = process.env.VITE_DEV_PORT;
let vite;
try {
    delete process.env.VITE_BACKEND_ORIGIN;
    delete process.env.VITE_DEV_PORT;
    const defaultConfig = await resolveConfig({ configFile, configLoader: 'runner' }, 'serve');
    assert.equal(defaultConfig.appType, 'mpa');
    assert.equal(defaultConfig.server.proxy['/api'].target, 'http://127.0.0.1:8000');

    for (const host of [true, '0.0.0.0', '::']) {
        await assert.rejects(
            () => createServer({ configFile, configLoader: 'runner', server: { host, port: 0 }, logLevel: 'silent' }),
            /must listen on a loopback address/,
        );
    }

    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    process.env.VITE_BACKEND_ORIGIN = `http://127.0.0.1:${backend.address().port}`;

    vite = await createServer({
        configFile,
        configLoader: 'runner',
        server: { port: 0, host: '127.0.0.1' },
        logLevel: 'silent',
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;

    const csrf = await fetch(`${origin}/csrf-token`);
    assert.deepEqual(await csrf.json(), { token: 'fixture-token' });
    const cookie = csrf.headers.get('set-cookie').split(';')[0];
    const identity = await (await fetch(`${origin}/api/identity`, { headers: { 'remote-user': 'admin', 'x-authentik-username': 'admin', 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' } })).json();
    assert.equal(identity['remote-user'], undefined);
    assert.equal(identity['x-authentik-username'], undefined);
    assert.equal(identity['x-forwarded-for'], undefined);
    assert.equal(identity['x-real-ip'], undefined);
    const protectedResponse = await fetch(`${origin}/api/check`, {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': 'fixture-token' },
    });
    assert.equal(protectedResponse.status, 204);

    for (const requestPath of [
        '/lib.js',
        '/style.css',
        '/css/user.css',
        '/scripts/example.js',
        '/img/icon.png',
        '/webfonts/font.woff2',
        '/react/login/assets/app.js',
        '/User%20Avatars/avatar.png',
        '/thumbnail?type=avatar',
        '/oauth/callback?code=abc',
    ]) {
        assert.equal(await (await fetch(origin + requestPath)).text(), `backend:${requestPath}`);
    }
    for (const page of ['/login', '/setup', '/settings', '/settings/']) {
        const response = await fetch(`${origin}${page}?x=1`, { headers: { cookie: 'session=fixture' } });
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /\/app\/client\.tsx/);
        assert.match(html, /\/@vite\/client/);
    }
    for (const page of ['/login', '/setup', '/settings']) {
        const response = await fetch(`${origin}${page}/?x=1`, { headers: { cookie: 'session=fixture', 'x-test-missing-build': '1' } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^text\/html/);
        assert.match(await response.text(), /\/app\/client\.tsx/);
    }
    const unavailable = await fetch(`${origin}/login`, { headers: { 'x-test-unavailable': '1' } });
    assert.equal(unavailable.status, 503);
    assert.equal(await unavailable.text(), 'unavailable');
    const denied = await fetch(`${origin}/settings`, { redirect: 'manual' });
    assert.equal(denied.status, 302);
    assert.equal(denied.headers.get('location'), '/login');
    assert.equal(await (await fetch(`${origin}/?test=1`)).text(), 'backend:/?test=1');
    const workspaceResponse = await fetch(`${origin}/?dev-workspace=1`);
    assert.equal(workspaceResponse.status, 200);
    assert.equal(workspaceResponse.headers.get('x-observed-url'), '/?dev-workspace=1');
    const workspace = await workspaceResponse.text();
    assert.match(workspace, /<style>/);
    assert.match(workspace, /\/@vite\/client/);
    assert.match(workspace, /\/@react-refresh/);
    for (const panel of ['workspace-panels', 'character-library-panel']) {
        const module = await fetch(`${origin}/react/login/assets/${panel}.js?v=fixture`);
        assert.equal(module.status, 200);
        assert.match(module.url, new RegExp(`/app/${panel}\\.tsx`));
        assert.match(await module.text(), /export function mount/);
        const stylesheet = await fetch(`${origin}/react/login/assets/${panel}.css`);
        assert.equal(stylesheet.status, 200);
        assert.match(stylesheet.headers.get('content-type'), /^text\/css/);
    }
    const stylex = await fetch(`${origin}/virtual:stylex.css`);
    assert.equal(stylex.status, 200);
    assert.match(stylex.headers.get('content-type'), /^text\/css/);
    const sourceModule = await fetch(`${origin}/public/scripts/ui-locale.js`);
    assert.equal(sourceModule.status, 200);
    assert.notEqual(await sourceModule.text(), 'backend:/public/scripts/ui-locale.js');
    assert.equal((await fetch(`${origin}/not-a-page`, { headers: { accept: 'text/html' } })).status, 404);
    console.log('vite-dev-proxy: ok');
} finally {
    await vite?.close();
    if (backend.listening) await new Promise(resolve => backend.close(resolve));
    if (previousBackendOrigin === undefined) delete process.env.VITE_BACKEND_ORIGIN;
    else process.env.VITE_BACKEND_ORIGIN = previousBackendOrigin;
    if (previousDevPort === undefined) delete process.env.VITE_DEV_PORT;
    else process.env.VITE_DEV_PORT = previousDevPort;
}
