import { expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('tests frozen lockfile resolves independently of the parent workspace', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-pnpm-'));
    try {
        fs.mkdirSync(path.join(fixture, 'tests'));
        for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
            fs.copyFileSync(path.join(root, file), path.join(fixture, file));
            const source = path.join(root, 'tests', file);
            if (fs.existsSync(source)) fs.copyFileSync(source, path.join(fixture, 'tests', file));
        }
        const result = spawnSync('pnpm', ['install', '--frozen-lockfile', '--lockfile-only', '--offline'], {
            cwd: path.join(fixture, 'tests'), encoding: 'utf8', timeout: 20000,
        });
        if (result.status !== 0) throw new Error(`pnpm install failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
        expect(result.status).toBe(0);
    } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

test('standalone workspace enforces the root supply-chain policies and skips lifecycle scripts', () => {
    const config = cwd => {
        const result = spawnSync('pnpm', ['config', 'list', '--json'], { cwd, encoding: 'utf8', timeout: 20000 });
        if (result.status !== 0) throw new Error(`pnpm config failed: ${result.error ?? ''}\n${result.stderr}`);
        return JSON.parse(result.stdout);
    };
    const rootConfig = config(root);
    const testsConfig = config(path.join(root, 'tests'));
    for (const key of ['minimumReleaseAge', 'minimumReleaseAgeExclude', 'trustPolicy', 'trustPolicyExclude', 'allowBuilds', 'overrides']) {
        expect(testsConfig[key]).toEqual(rootConfig[key]);
    }
    expect(testsConfig.minimumReleaseAge).toBe(10080);
    expect(testsConfig.trustPolicy).toBe('no-downgrade');
    expect(testsConfig.ignoreScripts).toBe(true);

    const why = spawnSync('pnpm', ['why', 'brace-expansion', '--json'], { cwd: path.join(root, 'tests'), encoding: 'utf8', timeout: 20000 });
    if (why.status !== 0) throw new Error(`pnpm why failed: ${why.error ?? ''}\n${why.stderr}`);
    const versions = JSON.parse(why.stdout).map(entry => entry.version).filter(version => version.startsWith('5.'));
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
        const [major, minor, patch] = version.split('.').map(Number);
        expect(major === 5 && (minor > 0 || patch >= 12)).toBe(true);
    }

    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-pnpm-policy-'));
    try {
        fs.copyFileSync(path.join(root, 'tests/pnpm-workspace.yaml'), path.join(fixture, 'pnpm-workspace.yaml'));
        fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'lifecycle-fixture', version: '1.0.0', scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'ran\', \'yes\')"' } }));
        const result = spawnSync('pnpm', ['install', '--offline', '--no-frozen-lockfile'], { cwd: fixture, encoding: 'utf8', timeout: 20000 });
        if (result.status !== 0) throw new Error(`pnpm install failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
        expect(fs.existsSync(path.join(fixture, 'ran'))).toBe(false);
        fs.writeFileSync(path.join(fixture, 'pnpm-workspace.yaml'), 'packages: []\n');
        const control = spawnSync('pnpm', ['install', '--offline', '--no-frozen-lockfile'], { cwd: fixture, encoding: 'utf8', timeout: 20000 });
        if (control.status !== 0) throw new Error(`pnpm control install failed: ${control.error ?? ''}\n${control.stdout}\n${control.stderr}`);
        expect(fs.existsSync(path.join(fixture, 'ran'))).toBe(true);
    } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});
