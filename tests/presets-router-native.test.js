import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('the legacy preset entry re-exports the native TypeScript router graph', () => {
    const entry = new URL('../src/endpoints/presets.js', import.meta.url).href;
    const implementation = new URL('../src/endpoints/presets.ts', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import assert from 'node:assert/strict';
        const entry = await import(process.argv[1]);
        const implementation = await import(process.argv[2]);
        for (const name of ['router', 'getCanonicalPresetsReadState', 'getCanonicalPresetsWriteState']) {
            assert.equal(entry[name], implementation[name]);
        }
        assert.equal(typeof entry.router, 'function');
        assert.deepEqual(entry.router.stack.map(layer => layer.route?.path), ['/save', '/delete', '/restore']);
    `, entry, implementation], { encoding: 'utf8', timeout: 10_000 });
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
        .toEqual({ status: 0, stderr: '' });
});
