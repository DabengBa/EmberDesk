import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const fixture = name => new URL(`./fixtures/server-typescript/${name}`, import.meta.url);

function runNode(source, name) {
    return spawnSync(process.execPath, ['--input-type=module', '--eval', source, fixture(name).href], { encoding: 'utf8' });
}

test('Node runs the mixed static and dynamic module graph natively', () => {
    const result = runNode('const { readGraph } = await import(process.argv[1]); console.log(await readGraph());', 'entry.js');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('js:static-ts:dynamic-static-ts');
});

test('Jest runs the same mixed static and dynamic module graph', async () => {
    const { readGraph } = await import('./fixtures/server-typescript/entry.js');
    await expect(readGraph()).resolves.toBe('js:static-ts:dynamic-static-ts');
});

test('Jest ESM mocks target the original TypeScript module identity', async () => {
    jest.unstable_mockModule('./fixtures/server-typescript/mock-dependency.ts', () => ({ dependency: () => 'mocked' }));
    const { readDependency } = await import('./fixtures/server-typescript/mock-entry.ts');
    expect(readDependency()).toBe('mocked');
});

test('Node and Jest errors retain the original TypeScript path and line', async () => {
    const node = runNode('const { fail } = await import(process.argv[1]); fail();', 'throws.ts');
    expect(node.status).not.toBe(0);
    expect(node.stderr).toContain(`${fileURLToPath(fixture('throws.ts'))}:2:`);

    const { fail } = await import('./fixtures/server-typescript/throws.ts');
    try {
        fail();
        throw new Error('fixture did not throw');
    } catch (error) {
        expect(error.message).toBe('typed fixture failure');
        expect(error.stack).toContain(`${fileURLToPath(fixture('throws.ts'))}:2:`);
    }
});

test.each([
    ['unsupported.ts', /enum.*not supported/i],
    ['invalid-extension.ts', /Cannot find module/],
    ['invalid-alias.ts', /Cannot find module/],
])(
    'Node and Jest reject %s rather than silently transforming or rewriting it', async (name, jestError) => {
        const node = runNode('await import(process.argv[1]);', name);
        expect(node.status).not.toBe(0);
        expect(node.stderr).toMatch(/ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX|ERR_MODULE_NOT_FOUND/);
        await expect(import(`./fixtures/server-typescript/${name}`)).rejects.toThrow(jestError);
    },
);

test('Node rejects extensionless server imports even though Jest resolves them', async () => {
    const node = runNode('await import(process.argv[1]);', 'extensionless.ts');
    expect(node.status).not.toBe(0);
    expect(node.stderr).toContain('ERR_MODULE_NOT_FOUND');
    const { value } = await import('./fixtures/server-typescript/extensionless.ts');
    expect(value).toBe('static-ts');
});

test('the existing frontend helper retains alias, extensionless and mixed graph support', async () => {
    const { frontendGraph } = await loadTsModule('tests/fixtures/server-typescript/frontend-graph.ts');
    expect(frontendGraph()).toBe('js:1.0 KiB');
});

test('reused Jest caches execute changes to the strip helper and transformer', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-strip-cache-'));
    const helper = path.join(directory, 'strip-typescript.cjs');
    const transformer = path.join(directory, 'jest-strip-typescript.cjs');
    try {
        for (const name of ['strip-typescript.cjs', 'jest-strip-typescript.cjs']) {
            fs.copyFileSync(fileURLToPath(new URL(`./helpers/${name}`, import.meta.url)), path.join(directory, name));
        }
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
        fs.writeFileSync(path.join(directory, 'value.ts'), "export const value: string = 'cached';\n");
        fs.writeFileSync(path.join(directory, 'probe.test.js'), [
            "import { value } from './value.ts';",
            "test('uses the current transform', () => expect(value).toBe(process.env.EXPECTED_VALUE));",
        ].join('\n'));
        const config = JSON.stringify({
            rootDir: directory,
            cacheDirectory: path.join(directory, 'cache'),
            extensionsToTreatAsEsm: ['.ts'],
            transform: { '^.+\\.ts$': transformer },
            testEnvironment: 'node',
            testMatch: ['<rootDir>/probe.test.js'],
        });
        const runJest = expected => {
            const result = spawnSync(process.execPath, [
                '--experimental-vm-modules',
                fileURLToPath(new URL('./node_modules/jest/bin/jest.js', import.meta.url)),
                '--runInBand', '--config', config,
            ], {
                cwd: directory,
                env: { ...process.env, EXPECTED_VALUE: expected },
                encoding: 'utf8',
                timeout: 10_000,
            });
            if (result.status !== 0) {
                throw new Error(`${result.error ?? ''}\n${result.stdout}${result.stderr}`);
            }
        };

        runJest('cached');
        fs.appendFileSync(helper, "\nconst original = module.exports;\nmodule.exports = source => original(source).replace(\"'cached'\", \"'updated'\");\n");
        runJest('updated');
        fs.appendFileSync(transformer, "\nconst original = module.exports.process;\nmodule.exports.process = source => ({ code: original(source).code.replace(\"'updated'\", \"'current'\") });\n");
        runJest('current');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
