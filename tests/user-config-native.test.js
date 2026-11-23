import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const repo = new URL('../', import.meta.url).href;

test.each([false, true])('native Node preserves config and account behavior (accounts=%s)', enabled => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-user-config-native-'));
    const config = path.join(root, 'config.jsonc');
    fs.writeFileSync(config, JSON.stringify({
        enableUserAccounts: enabled,
        port: 4321,
        disableThumbnails: true,
        cookieSecret: 'legacy-cookie-secret',
        sso: {
            autheliaAuth: true,
            trustedProxies: ['127.0.0.1'],
        },
        backups: {
            chat: {
                enabled: false,
            },
        },
    }));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('EMBERDESK_')));
    try {
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import path from 'node:path';
            import { createRequire } from 'node:module';
            const [repo, root, enabledArg] = process.argv.slice(1);
            const enabled = enabledArg === 'true';
            const moduleUrl = name => new URL('src/' + name, repo).href;
            const user = await import(moduleUrl('user-storage.ts'));
            const config = await import(moduleUrl('config-init.ts'));
            const cli = await import(moduleUrl('command-line.ts'));
            const { getConfig, getConfigValue } = await import(moduleUrl('util.ts'));
            const configPath = path.join(root, 'config.jsonc');
            cli.prepareConfigFilesystem(configPath, false);
            assert.equal(typeof config.initConfig, 'function');
            assert.equal(getConfigValue('port'), 4321);
            assert.equal(getConfigValue('thumbnails.enabled'), false);
            assert.equal(getConfigValue('disableThumbnails'), null);
            assert.equal(user.getEnableAccounts(), enabled);
            globalThis.DATA_ROOT = path.join(root, 'data');
            cli.prepareDataRoot(globalThis.DATA_ROOT);
            const storage = createRequire(moduleUrl('user-storage.ts'))('node-persist');
            try {
                await user.initUserStorage(globalThis.DATA_ROOT);
                assert.deepEqual(await user.getAllUserHandles(), enabled ? [] : ['default-user']);
                assert.equal(await user.needsSetup(), enabled);
                const alice = { handle: 'alice', name: 'Alice', created: 1, password: '', salt: '', enabled: true, admin: true };
                await storage.setItem(user.toKey('alice'), alice);
                await storage.setItem(user.toAvatarKey('alice'), 'avatar-data');
                if (enabled) {
                    assert.equal(await user.needsSetup(), true);
                    alice.password = 'password';
                    alice.salt = 'salt';
                    await storage.setItem(user.toKey('alice'), alice);
                    assert.equal(await user.needsSetup(), false);
                    await storage.setItem(user.toKey('bob'), { ...alice, handle: 'bob', enabled: false });
                    assert.deepEqual((await user.getAllEnabledUsers()).map(record => record.handle), ['alice']);
                } else {
                    assert.deepEqual(await user.getAllEnabledUsers(), []);
                }
                assert.equal(user.toKey('alice'), 'user:alice');
                assert.equal(user.toAvatarKey('alice'), 'avatar:alice');
                assert.equal(user.getAccountVersion({ handle: 'alice', password: 'hash123', salt: 'salt456' }), 'c3bee938b0ed248b');
                assert.ok(!(await user.getAllUserHandles()).some(handle => handle.startsWith('avatar:')));
                const auth = await import(moduleUrl('user-auth.ts'));
                const directories = await import(moduleUrl('user-directories.ts'));
                const migrations = await import(moduleUrl('user-migrations.ts'));
                const constants = await import(moduleUrl('constants.ts'));
                assert.equal(typeof migrations.migrateUserData, 'function');
                assert.equal(typeof migrations.migratePublicOverrides, 'function');
                for (const name of ['getUserDirectories', 'getUserDirectoriesList', 'ensurePublicDirectoriesExist', 'cleanUploads', 'getUserAvatar']) {
                    assert.equal(typeof directories[name], 'function');
                }
                assert.equal(typeof auth.getPasswordHash('password', 'salt'), 'string');
                assert.equal(directories.getUserDirectories('alice').root, path.join(globalThis.DATA_ROOT, 'alice'));
                const aliceDirectories = directories.getUserDirectories('alice');
                assert.equal(directories.getUserDirectories('alice'), aliceDirectories);
                const list = await directories.ensurePublicDirectoriesExist();
                assert.ok(list.includes(aliceDirectories));
                assert.deepEqual(Object.keys(aliceDirectories), Object.keys(constants.USER_DIRECTORY_TEMPLATE));
                for (const [key, value] of Object.entries(aliceDirectories)) {
                    assert.equal(value, path.join(globalThis.DATA_ROOT, 'alice', constants.USER_DIRECTORY_TEMPLATE[key]));
                    assert.ok(fs.statSync(value).isDirectory());
                }
                for (const retired of ['groups', 'group chats', 'personas', 'movingUI', 'instruct', 'context', 'quickreplies', 'vectors', 'sysprompt', 'reasoning', 'comfyWorkflows', 'themes']) {
                    assert.equal(fs.existsSync(path.join(aliceDirectories.root, retired)), false, retired);
                }
                for (const publicDirectory of Object.values(constants.PUBLIC_DIRECTORIES)) {
                    assert.ok(fs.statSync(publicDirectory).isDirectory());
                }
                assert.equal(await directories.getUserAvatar('alice'), 'avatar-data');
                assert.equal(await directories.getUserAvatar('missing'), '/img/default-user.png');
                const uploads = path.join(globalThis.DATA_ROOT, constants.UPLOADS_DIRECTORY);
                fs.mkdirSync(uploads, { recursive: true });
                fs.writeFileSync(path.join(uploads, 'temporary-file'), 'temporary');
                directories.cleanUploads(list);
                assert.deepEqual(fs.readdirSync(uploads), []);
                assert.ok(fs.existsSync(aliceDirectories.storage));
                getConfig().cookieSecret = 'legacy-cookie-secret';
                assert.equal(auth.getCookieSecret(root), 'legacy-cookie-secret');
                assert.equal(fs.readFileSync(path.join(root, 'cookie-secret.txt'), 'utf8'), 'legacy-cookie-secret');
                assert.equal(auth.getCsrfSecret(), auth.getCsrfSecret());
                const aliceDirs = directories.getUserDirectories('alice');
                fs.mkdirSync(aliceDirs.root, { recursive: true });
                const csrfRequest = { user: { directories: aliceDirs } };
                const csrf = auth.getCsrfSecret(csrfRequest);
                assert.ok(csrf && csrf !== auth.getCsrfSecret());
                assert.equal(auth.getCsrfSecret(csrfRequest), csrf);
                if (enabled) {
                    const makeRequest = ip => ({ user: undefined, session: {}, query: {}, headers: {}, socket: { remoteAddress: ip }, get: () => 'alice' });
                    const untrusted = makeRequest('192.0.2.10');
                    assert.equal(await auth.tryAutoLogin(untrusted), false);
                    assert.equal(untrusted.session.handle, undefined);
                    const trusted = makeRequest('127.0.0.1');
                    assert.equal(await auth.tryAutoLogin(trusted), true);
                    assert.equal(trusted.session.handle, 'alice');
                    assert.equal(trusted.session.version, user.getAccountVersion(alice));
                }
                await import(moduleUrl('server-init.ts'));
                assert.equal(fs.existsSync(configPath), true);
                console.log('native-user-config-ok:' + enabled);
            } finally {
                storage.stopWriteQueueInterval?.();
                storage.stopExpiredKeysInterval?.();
            }
        `, repo, root, String(enabled)], {
            cwd: root,
            env,
            encoding: 'utf8',
            timeout: 10_000,
        });
        expect({ status: result.status, error: result.error?.message, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, error: undefined, stderr: '' });
        expect(result.stdout).toContain(`native-user-config-ok:${enabled}`);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
