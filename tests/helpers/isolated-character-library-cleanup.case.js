import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isolatedCharacterLibraryTest } from './isolated-character-library-test.js';

const test = isolatedCharacterLibraryTest({ lazy: true });

test('fixture cleanup scenario', async ({ isolatedServer }) => {
    const roots = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('character-library-e2e-'));
    if (roots.length !== 1) throw new Error(`Expected one isolated root, got ${roots.length}`);
    const root = path.join(os.tmpdir(), roots[0]);
    const processes = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    const matches = processes.split('\n').filter(line => line.includes(`server.js --configPath ${root}/config.yaml`));
    if (matches.length !== 1) throw new Error(`Expected one isolated server, got ${matches.length}`);
    const pid = Number(matches[0].trim().split(/\s+/)[0]);
    await fs.writeFile(process.env.CLEANUP_REPORT, JSON.stringify({ root, pid, isolatedServer }));
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
