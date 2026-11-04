import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, resolveConfig } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(repoRoot, 'vite.config.ts');
const backend = createHttpServer((req, res) => {
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
    ]) {
        assert.equal(await (await fetch(origin + requestPath)).text(), `backend:${requestPath}`);
    }
    assert.equal((await fetch(`${origin}/login`)).status, 200);
    assert.equal((await fetch(`${origin}/`)).status, 200);
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
