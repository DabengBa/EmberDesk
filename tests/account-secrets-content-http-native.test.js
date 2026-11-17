import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const repo = new URL('../', import.meta.url);

test.each([false, true])('native HTTP account, secrets and content boundaries (exposure=%s)', exposure => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-account-http-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, `enableUserAccounts: true\nallowKeysExposure: ${exposure}\n`);
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import path from 'node:path';
            import express from 'express';
            import cookieSession from 'cookie-session';
            import storage from 'node-persist';
            const [root, config, exposureString] = process.argv.slice(1);
            const exposure = exposureString === 'true';
            const { setConfigFilePath } = await import('./src/util.js');
            setConfigFilePath(config);
            globalThis.DATA_ROOT = root;
            const users = await import('./src/users.js');
            await users.initUserStorage(root);
            for (const [handle, admin] of [['alice', false], ['admin', true]]) {
                const salt = users.getPasswordSalt();
                await storage.setItem(users.toKey(handle), {
                    handle, name: handle, admin, enabled: true, created: 1,
                    salt, password: users.getPasswordHash('old-password', salt),
                });
                fs.mkdirSync(users.getUserDirectories(handle).root, { recursive: true });
            }
            const publicUsers = await import('./src/endpoints/users-public.js');
            const privateUsers = await import('./src/endpoints/users-private.js');
            const adminUsers = await import('./src/endpoints/users-admin.js');
            const secrets = await import('./src/endpoints/secrets.js');
            const content = await import('./src/endpoints/content-manager.js');
            const app = express();
            app.use(express.json());
            app.use(cookieSession({ name: 'test-session', keys: ['test-only-signing-key'] }));
            app.use(users.setUserDataMiddleware);
            app.use('/public', publicUsers.router);
            app.use(users.requireLoginMiddleware);
            app.use('/private', privateUsers.router);
            app.use('/admin', adminUsers.router);
            app.use('/secrets', secrets.router);
            app.use('/content', content.router);
            const server = app.listen(0, '127.0.0.1');
            await new Promise(resolve => server.once('listening', resolve));
            const base = 'http://127.0.0.1:' + server.address().port;
            let cookie = '';
            async function post(route, body = {}) {
                const response = await fetch(base + route, {
                    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
                });
                const cookies = response.headers.getSetCookie();
                if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
                return response;
            }
            try {
                assert.equal((await post('/admin/slugify', { text: 'Hi' })).status, 403);
                assert.equal((await post('/public/login', { handle: 'alice', password: 'wrong' })).status, 403);
                assert.equal((await post('/public/login', { handle: 'alice', password: 'old-password' })).status, 200);
                assert.equal((await post('/admin/slugify', { text: 'Hi' })).status, 403);
                assert.equal((await post('/private/change-password', { handle: 'admin', newPassword: 'new-password' })).status, 403);
                assert.equal((await post('/private/change-password', { handle: 'alice', oldPassword: 'old-password', newPassword: 'new-password' })).status, 204);
                assert.equal((await fetch(base + '/private/me', { headers: { cookie } })).status, 200);
                assert.equal((await post('/private/logout')).status, 204);
                assert.equal((await fetch(base + '/private/me', { headers: { cookie } })).status, 403);
                cookie = '';
                assert.equal((await post('/public/login', { handle: 'admin', password: 'old-password' })).status, 200);
                const slug = await post('/admin/slugify', { text: 'Hello World' });
                assert.equal(slug.status, 200);
                assert.equal(await slug.text(), 'hello-world');
                assert.equal((await post('/admin/demote', { handle: 'admin' })).status, 400);
                assert.equal((await post('/secrets/write', { key: secrets.SECRET_KEYS.LIBRE_URL, value: 'https://example.test' })).status, 200);
                assert.equal((await post('/secrets/write', { key: secrets.SECRET_KEYS.OPENAI, value: 'synthetic-value' })).status, 200);
                assert.equal((await post('/secrets/find', {})).status, 400);
                const publicKey = await post('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL });
                assert.equal(publicKey.status, 200);
                assert.equal((await publicKey.json()).value, 'https://example.test');
                const privateKey = await post('/secrets/find', { key: secrets.SECRET_KEYS.OPENAI });
                assert.equal(privateKey.status, exposure ? 200 : 403);
                if (exposure) assert.equal((await privateKey.json()).value, 'synthetic-value');
                assert.equal((await post('/secrets/view')).status, exposure ? 200 : 403);
                assert.equal((await post('/secrets/find', { key: secrets.SECRET_KEYS.LINGVA_URL })).status, 404);
                assert.equal((await post('/content/importURL', {})).status, 400);
                assert.equal((await post('/content/importURL', { url: 'https://not-whitelisted.example/card' })).status, 404);
                assert.equal((await post('/content/importUUID', { url: 'AICC/incomplete' })).status, 404);
                console.log('account-secrets-content:http-native:ok');
            } finally {
                await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            }
        `, root, config, String(exposure)], { cwd: repo, encoding: 'utf8', timeout: 20_000 });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr, stdout: result.status === 0 ? '' : result.stdout })
            .toEqual({ status: 0, stderr: '', stdout: '' });
        expect(result.stdout).toContain('account-secrets-content:http-native:ok');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
