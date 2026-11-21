import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const repo = new URL('../', import.meta.url);

test.each([false, true].flatMap(exposure => ['read', 'find', 'view'].map(probe => [exposure, probe])))('native HTTP account, secrets and content boundaries (exposure=%s, probe=%s)', (exposure, probe) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-account-http-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, `enableUserAccounts: true\nallowKeysExposure: ${exposure}\n`);
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import path from 'node:path';
            import { DatabaseSync } from 'node:sqlite';
            import express from 'express';
            import cookieSession from 'cookie-session';
            import storage from 'node-persist';
            const [root, config, probe] = process.argv.slice(1);
            const secretValue = 'synthetic-value';
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
            const publicUsers = await import('./src/endpoints/users-public-routes.ts');
            const privateUsers = await import('./src/endpoints/users-private-routes.ts');
            const adminUsers = await import('./src/endpoints/users-admin-routes.ts');
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
                if (route.startsWith('/secrets/')) {
                    assert.equal((await response.clone().text()).includes(secretValue), false, route + ' exposed secret');
                }
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
                const adminUrlWrite = await post('/secrets/write', { key: secrets.SECRET_KEYS.LIBRE_URL, value: 'https://example.test' });
                assert.equal(adminUrlWrite.status, 200);
                const adminUrlId = (await adminUrlWrite.json()).id;

                // Keep two authenticated sessions alive at the same time. Both
                // address the same resource key, but each owns a separate database.
                let aliceCookie = '';
                async function alicePost(route, body = {}) {
                    const response = await fetch(base + route, {
                        method: 'POST', headers: { 'content-type': 'application/json', cookie: aliceCookie }, body: JSON.stringify(body),
                    });
                    const cookies = response.headers.getSetCookie();
                    if (cookies.length) aliceCookie = cookies.map(value => value.split(';')[0]).join('; ');
                    return response;
                }
                assert.equal((await alicePost('/public/login', { handle: 'alice', password: 'new-password' })).status, 200);
                assert.equal((await alicePost('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL, handle: 'admin' })).status, 404);
                const aliceUrlWrite = await alicePost('/secrets/write', { key: secrets.SECRET_KEYS.LIBRE_URL, value: 'https://alice.example.test', handle: 'admin' });
                assert.equal(aliceUrlWrite.status, 200);
                const aliceUrlId = (await aliceUrlWrite.json()).id;
                assert.equal((await alicePost('/secrets/delete', { key: secrets.SECRET_KEYS.LIBRE_URL, id: adminUrlId, handle: 'admin' })).status, 204);
                assert.equal((await (await alicePost('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL })).json()).value, 'https://alice.example.test');
                assert.equal((await (await post('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL })).json()).value, 'https://example.test');
                assert.equal((await (await alicePost('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL, id: adminUrlId })).json()).value, '');
                assert.equal((await (await post('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL, id: aliceUrlId })).json()).value, '');
                const aliceDbPath = path.join(users.getUserDirectories('alice').storage, 'emberdesk.sqlite');
                const adminDbPath = path.join(users.getUserDirectories('admin').storage, 'emberdesk.sqlite');
                assert.notEqual(aliceDbPath, adminDbPath);
                for (const [dbPath, expected] of [[aliceDbPath, 'https://alice.example.test'], [adminDbPath, 'https://example.test']]) {
                    assert.ok(fs.existsSync(dbPath));
                    const db = new DatabaseSync(dbPath, { readOnly: true });
                    try {
                        assert.equal(db.prepare('SELECT value FROM secret_records WHERE secret_key = ? AND active = 1').get(secrets.SECRET_KEYS.LIBRE_URL).value, expected);
                    } finally {
                        db.close();
                    }
                }
                const written = await post('/secrets/write', { key: secrets.SECRET_KEYS.OPENAI, value: secretValue });
                assert.equal(written.status, 200);
                const { id } = await written.json();
                const manager = new secrets.SecretManager(users.getUserDirectories('admin'));
                assert.equal(manager.readSecret(secrets.SECRET_KEYS.OPENAI), secretValue);
                await post('/secrets/' + probe, probe === 'find' ? { key: secrets.SECRET_KEYS.OPENAI } : {});
                const readResponse = await post('/secrets/read');
                assert.equal(readResponse.status, 200);
                const state = await readResponse.json();
                assert.equal(state[secrets.SECRET_KEYS.OPENAI][0].id, id);
                assert.notEqual(state[secrets.SECRET_KEYS.OPENAI][0].value, secretValue);
                assert.equal(state[secrets.SECRET_KEYS.LIBRE_URL][0].value, 'https://example.test');
                assert.equal((await post('/secrets/find', {})).status, 400);
                const publicKey = await post('/secrets/find', { key: secrets.SECRET_KEYS.LIBRE_URL });
                assert.equal(publicKey.status, 200);
                assert.equal((await publicKey.json()).value, 'https://example.test');
                const privateKey = await post('/secrets/find', { key: secrets.SECRET_KEYS.OPENAI });
                assert.equal(privateKey.status, 403);
                assert.equal((await post('/secrets/view')).status, 403);
                assert.equal((await (await post('/secrets/settings')).json()).allowKeysExposure, false);
                assert.equal((await post('/secrets/rename', { key: secrets.SECRET_KEYS.OPENAI, id, label: 'renamed' })).status, 204);
                assert.equal((await post('/secrets/rotate', { key: secrets.SECRET_KEYS.OPENAI, id })).status, 204);
                assert.equal(manager.readSecret(secrets.SECRET_KEYS.OPENAI), secretValue);
                assert.equal((await post('/secrets/delete', { key: secrets.SECRET_KEYS.OPENAI, id })).status, 204);
                assert.equal(manager.readSecret(secrets.SECRET_KEYS.OPENAI), '');
                assert.equal((await post('/secrets/find', { key: secrets.SECRET_KEYS.LINGVA_URL })).status, 404);
                assert.equal((await post('/content/importURL', {})).status, 400);
                assert.equal((await post('/content/importURL', { url: 'https://not-whitelisted.example/card' })).status, 404);
                assert.equal((await post('/content/importUUID', { url: 'AICC/incomplete' })).status, 404);
                console.log('account-secrets-content:http-native:ok');
            } finally {
                await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            }
        `, root, config, probe], { cwd: repo, encoding: 'utf8', timeout: 20_000 });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr, stdout: result.status === 0 ? '' : result.stdout })
            .toEqual({ status: 0, stderr: '', stdout: '' });
        expect(result.stdout).toContain('account-secrets-content:http-native:ok');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
