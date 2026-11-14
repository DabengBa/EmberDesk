import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const compiler = path.join(repoRoot, 'node_modules/typescript/bin/tsc');
let projectRoot;

beforeAll(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-server-types-'));
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ type: 'module' }));
});

afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
});

function compile(name, source, dependencies = {}) {
    const directory = path.join(projectRoot, name);
    fs.mkdirSync(directory);
    const entry = path.join(directory, 'entry.ts');
    fs.writeFileSync(entry, source);
    for (const [filename, contents] of Object.entries(dependencies)) {
        fs.writeFileSync(path.join(directory, filename), contents);
    }
    const configPath = path.join(directory, 'tsconfig.json');
    fs.writeFileSync(configPath, JSON.stringify({
        extends: path.join(repoRoot, 'tsconfig.server.json'),
        compilerOptions: { typeRoots: [path.join(repoRoot, 'node_modules/@types')] },
        files: [entry, path.join(repoRoot, 'index.d.ts')],
        include: [],
    }));
    const result = spawnSync(process.execPath, [compiler, '--project', configPath, '--pretty', 'false'], {
        encoding: 'utf8',
        timeout: 10_000,
    });
    if (result.error) {
        throw result.error;
    }
    return { status: result.status, diagnostics: `${result.stdout}${result.stderr}` };
}

describe('server TypeScript compiler environment', () => {
    test('checks Node types and existing server globals without emitting files', () => {
        const result = compile('node', [
            "import { basename } from 'node:path';",
            'export const rootName: string = basename(globalThis.DATA_ROOT);',
            'export const nodeVersion: string = process.versions.node;',
            'export const globalMode: boolean = globalThis.FORCE_GLOBAL_MODE;',
        ].join('\n'));

        expect(result).toEqual({ status: 0, diagnostics: '' });
        expect(fs.readdirSync(path.join(projectRoot, 'node')).sort()).toEqual(['entry.ts', 'tsconfig.json']);
    });

    test('checks explicit TypeScript imports in a mixed Node module graph', () => {
        const result = compile('mixed', [
            "import { value } from './dependency.ts';",
            "import { suffix } from './legacy.js';",
            'export const result: string = value + suffix;',
        ].join('\n'), {
            'dependency.ts': "export const value: string = 'native';",
            'legacy.js': "export const suffix = '-node';",
        });

        expect(result).toEqual({ status: 0, diagnostics: '' });
    });

    test('rejects browser globals in a server module', () => {
        const result = compile('dom', "export const node = document.createElement('div');");

        expect(result.status).not.toBe(0);
        expect(result.diagnostics).toMatch(/TS2584.*Cannot find name 'document'/);
    });

    test('rejects syntax that requires TypeScript code generation', () => {
        const result = compile('enum', 'export enum Mode { Visible, Quiet }');

        expect(result.status).not.toBe(0);
        expect(result.diagnostics).toMatch(/TS1294/);
    });

    test('rejects extensionless relative imports', () => {
        const result = compile('extensionless', "export { value } from './dependency';", {
            'dependency.ts': 'export const value: number = 1;',
        });

        expect(result.status).not.toBe(0);
        expect(result.diagnostics).toMatch(/TS2835/);
    });

    test('does not resolve frontend aliases in a server module', () => {
        const result = compile('alias', "export { value } from '@/dependency';");

        expect(result.status).not.toBe(0);
        expect(result.diagnostics).toMatch(/TS2307/);
    });
});
