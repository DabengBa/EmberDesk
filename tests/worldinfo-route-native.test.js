import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('Node loads the native TypeScript World Info router without a loader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-worldinfo-route-native-'));
    try {
        const config = path.join(root, 'config.jsonc');
        fs.writeFileSync(config, JSON.stringify({ port: 8000 }));
        const url = name => new URL(`../src/${name}`, import.meta.url).href;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const entry = await import(process.argv[4]);

            for (const name of ['router', 'getCanonicalWorldInfoReadState', 'getCanonicalWorldInfoWriteState', 'readWorldInfoFile', 'writeWorldInfoProjectionFile']) {
                assert.equal(typeof entry[name], 'function');

            }
            assert.ok(entry.router.stack.some(layer => layer.route?.path === '/edit' && layer.route.methods.post));
        `, url('util.ts'), config, root, url('endpoints/worldinfo-routes.ts')], {
            encoding: 'utf8', timeout: 10_000,
        });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
