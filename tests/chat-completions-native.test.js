import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('legacy chat-completions entry exposes the native TypeScript router', () => {
    const entry = new URL('../src/endpoints/backends/chat-completions.js', import.meta.url).href;
    const implementation = new URL('../src/endpoints/backends/chat-completions.ts', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import assert from 'node:assert/strict';
        const entry = await import(process.argv[1]);
        const implementation = await import(process.argv[2]);
        assert.equal(entry.router, implementation.router);
        assert.deepEqual(entry.router.stack.filter(layer => layer.route).map(layer => layer.route.path), ['/status', '/generate']);
        assert.equal(entry.router.stack.some(layer => layer.name === 'router'), true);
    `, entry, implementation], { encoding: 'utf8', timeout: 10_000 });
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
        .toEqual({ status: 0, stderr: '' });
});
