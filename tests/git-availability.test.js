import { expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVersion } from '../src/util.js';
import { serverDirectory } from '../src/server-directory.js';

test('version info reads the running worktree revision when Git is available', async () => {
    const revision = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: serverDirectory, encoding: 'utf8' });
    expect(revision.status).toBe(0);
    expect(await getVersion()).toMatchObject({ gitRevision: revision.stdout.trim(), commitDate: expect.any(String) });
});

const unavailableGitCases = [
    { kind: 'missing', warning: 'Git is not installed. Please install Git to enable auto-updating of server plugins.' },
];
if (process.platform !== 'win32') {
    unavailableGitCases.push({ kind: 'failing executable', warning: 'Failed to update plugin example:' });
}

test.each(unavailableGitCases)('$kind Git preserves version fallback and allows plugin loading to continue', ({ kind, warning }) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-git-'));
    try {
        const bin = path.join(temp, 'bin');
        fs.mkdirSync(bin);
        if (kind === 'failing executable') {
            fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\necho "Git could not start" >&2\nexit 1\n', { mode: 0o755 });
        }
        fs.mkdirSync(path.join(temp, 'plugins', 'example'), { recursive: true });
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
            import { getVersion } from './src/util.js';
            import { updatePlugins } from './src/plugin-updater.js';
            await updatePlugins(process.argv[1], { autoUpdate: true });
            console.log(JSON.stringify(await getVersion()));
        `, path.join(temp, 'plugins')], {
            cwd: serverDirectory,
            env: { ...process.env, PATH: bin, NO_COLOR: '1' },
            encoding: 'utf8',
            timeout: 5000,
        });
        expect(child.status).toBe(0);
        expect(child.stderr).toContain(warning);
        if (kind === 'missing') {
            expect(child.stdout).not.toContain('All plugins are up to date.');
        }
        expect(JSON.parse(child.stdout.trim().split('\n').at(-1))).toMatchObject({
            pkgVersion: expect.stringMatching(/^\d+\./),
            gitRevision: null,
            gitBranch: null,
            commitDate: null,
            isLatest: true,
        });
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});
