import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const repo = new URL('../', import.meta.url).href;

test.each([false, true])('native Node preserves config and account behavior (accounts=%s)', enabled => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-user-config-native-'));
    const config = path.join(root, 'config.yaml');
    fs.writeFileSync(config, `enableUserAccounts: ${enabled}\nport: 4321\ndisableThumbnails: true\nbackups:\n  chat:\n    enabled: false\n`);
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
            const cli = await import(moduleUrl('command-line.js'));
            const { getConfigValue } = await import(moduleUrl('util.js'));
            const configPath = path.join(root, 'config.yaml');
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
                const barrel = await import(moduleUrl('users.js'));
                const auth = await import(moduleUrl('user-auth.js'));
                const directories = await import(moduleUrl('user-directories.js'));
                assert.equal(barrel.getAccountVersion, user.getAccountVersion);
                assert.equal(typeof auth.getPasswordHash('password', 'salt'), 'string');
                assert.equal(directories.getUserDirectories('alice').root, path.join(globalThis.DATA_ROOT, 'alice'));
                await import(moduleUrl('server-init.js'));
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
