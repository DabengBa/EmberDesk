import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isolatedCharacterLibraryTest, expect } from './isolated-character-library-test.js';

const test = isolatedCharacterLibraryTest({ lazy: true });

async function serverState(isolatedServer, workerIndex) {
    const roots = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('character-library-e2e-'));
    if (roots.length !== 1) throw new Error(`Expected one isolated root, got ${roots.length}`);
    const root = path.join(os.tmpdir(), roots[0]);
    const processes = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    const matches = processes.split('\n').filter(line => line.includes(`server.js --configPath ${root}/config.yaml`));
    if (matches.length !== 1) throw new Error(`Expected one isolated server, got ${matches.length}`);
    const pid = Number(matches[0].trim().split(/\s+/)[0]);
    return { root, pid, isolatedServer, workerIndex };
}

test('fixture cleanup scenario', async ({ isolatedServer }, { workerIndex }) => {
    const state = await serverState(isolatedServer, workerIndex);
    const { root, pid } = state;
    await fs.writeFile(process.env.CLEANUP_REPORT, JSON.stringify(state));
    if (process.env.CLEANUP_SCENARIO === 'isolation') {
        await fs.writeFile(path.join(root, 'data', 'isolation-proof.txt'), 'changed by the first test');
    }
    if (process.env.CLEANUP_SCENARIO === 'throw') throw new Error('intentional test failure');
    if (process.env.CLEANUP_SCENARIO === 'signal') {
        process.kill(pid, 'SIGKILL');
        // Wait for the worker to observe and reap the child before teardown.
        for (let i = 0; i < 100; i++) {
            try { process.kill(pid, 0); } catch (error) {
                if (error.code === 'ESRCH') return;
                throw error;
            }
            await delay(20);
        }
        throw new Error('server was not reaped after SIGKILL');
    }
});

if (process.env.CLEANUP_SCENARIO === 'isolation') {
    test('next test in the same worker receives fresh server data', async ({ isolatedServer }, { workerIndex }) => {
        const previous = JSON.parse(await fs.readFile(process.env.CLEANUP_REPORT, 'utf8'));
        const current = await serverState(isolatedServer, workerIndex);
        await fs.writeFile(process.env.CLEANUP_REPORT, JSON.stringify({ ...current, previous }));
        expect(current.workerIndex).toBe(previous.workerIndex);
        await expect(fs.access(path.join(current.root, 'data', 'isolation-proof.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(previous.root)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(() => process.kill(previous.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    });
}
