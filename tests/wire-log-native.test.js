import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('Node loads the real wire log module graph without a loader', () => {
    const root = new URL('../', import.meta.url);
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import assert from 'node:assert/strict';
        const store = await import(new URL('src/wire-log-store.ts', process.argv[1]));
        const tap = await import(new URL('src/wire-log-tap.ts', process.argv[1]));
        const recorder = await import(new URL('src/wire-log-recorder.ts', process.argv[1]));
        const route = await import(new URL('src/endpoints/wire-log.ts', process.argv[1]));
        assert.equal(typeof store.createWireRecord, 'function');
        assert.equal(typeof tap.createSseAssembler, 'function');
        assert.equal(typeof recorder.createWireLogRecorder, 'function');
        assert.equal(typeof route.router, 'function');
    `, root.href], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
        .toEqual({ status: 0, stderr: '' });
});
