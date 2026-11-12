import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';

const testsRoot = fileURLToPath(new URL('.', import.meta.url));
const playwright = path.join(testsRoot, 'node_modules/@playwright/test/cli.js');

describe('isolated character library fixture cleanup', () => {
    test.each(['normal', 'throw', 'signal', 'isolation'])('%s', async scenario => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-proof-'));
        const report = path.join(root, 'report.json');
        const tmp = path.join(root, 'tmp');
        await fs.mkdir(tmp);
        let child;
        try {
            const env = { ...process.env, TMPDIR: tmp, CLEANUP_REPORT: report, CLEANUP_SCENARIO: scenario };
            delete env.JEST_WORKER_ID;
            child = spawn(process.execPath, [playwright, 'test', '--config', 'helpers/isolated-character-library-cleanup.config.mjs'], {
                cwd: testsRoot,
                detached: true,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let output = '';
            child.stdout.on('data', chunk => { output += chunk; });
            child.stderr.on('data', chunk => { output += chunk; });
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
            }, 15000);
            const [code] = await once(child, 'close');
            clearTimeout(timer);
            expect({ timedOut, output }).toMatchObject({ timedOut: false });
            expect(code).toBe(scenario === 'throw' ? 1 : 0);
            if (scenario === 'throw') expect(output).toContain('intentional test failure');
            const state = JSON.parse(await fs.readFile(report, 'utf8'));
            const servers = state.previous ? [state.previous, state] : [state];
            for (const { root: serverRoot, pid } of servers) {
                await expect(fs.access(serverRoot)).rejects.toMatchObject({ code: 'ENOENT' });
                expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
            }
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    }, 20000);
});
