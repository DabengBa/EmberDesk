import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('Node loads the real Secrets manager and synchronous TypeScript backend without a loader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-secrets-native-'));
    try {
        const url = name => new URL(`../src/${name}`, import.meta.url).href;
        const config = new URL('../default/config.yaml', import.meta.url).pathname;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const { SecretManager } = await import(process.argv[4]);
            const backend = await import(process.argv[5]);
            const state = backend.initializeCanonicalSecretsForDirectories({ root: process.argv[3] });
            assert.equal(state.ok, true);
            assert.equal(typeof state.then, 'undefined');
            assert.equal(typeof SecretManager, 'function');
            console.log('secrets-callers:native');
        `, url('util.js'), config, root, url('endpoints/secrets.js'), url('canonical-secrets-backend.ts')], {
            encoding: 'utf8', timeout: 10_000,
        });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('secrets-callers:native');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
