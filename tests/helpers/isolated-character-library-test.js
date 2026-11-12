import { test as base, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const execFileAsync = promisify(execFile);

// Each test gets a fresh seeded server, distinct from the shared E2E server
// and from other tests. Both browser pages within a test use that server.
export function isolatedCharacterLibraryTest({ lazy }) {
    return base.extend({
        // Playwright requires a destructured fixture argument even when empty.
        // eslint-disable-next-line no-empty-pattern
        isolatedServer: [async ({}, use) => {
            const root = await fs.mkdtemp(path.join(os.tmpdir(), 'character-library-e2e-'));
            const data = path.join(root, 'data');
            const config = path.join(root, 'config.yaml');
            const portServer = net.createServer();
            let child;
            const previousBase = process.env.PLAYWRIGHT_BASE_URL;
            try {
                await new Promise((resolve, reject) => {
                    portServer.once('error', reject);
                    portServer.listen(0, '127.0.0.1', resolve);
                });
                const port = portServer.address().port;
                await new Promise((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
                const url = `http://127.0.0.1:${port}`;
                const env = { ...process.env, ...(lazy ? { EMBERDESK_PERFORMANCE_LAZYLOADCHARACTERS: 'true' } : {}) };
                await execFileAsync(process.execPath, ['scripts/seed-dev-environment.mjs', '--data-root', data, '--config', config,
                    '--user-handle', process.env.PLAYWRIGHT_USER ?? 'playwright-e2e', '--user-password', process.env.PLAYWRIGHT_PASSWORD ?? 'playwright'],
                { cwd: repoRoot, env });
                const log = await fs.open(path.join(root, 'server.log'), 'w');
                try {
                    child = spawn(process.execPath, ['server.js', '--configPath', config, '--port', String(port)],
                        { cwd: repoRoot, env, stdio: ['ignore', log.fd, log.fd] });
                } finally { await log.close(); }
                const deadline = Date.now() + 120_000;
                let ready = false;
                while (Date.now() < deadline) {
                    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Isolated server exited: ${await fs.readFile(path.join(root, 'server.log'), 'utf8')}`);
                    try { ready = (await fetch(url)).status < 500; } catch { /* still starting */ }
                    if (ready) break;
                    await delay(200);
                }
                if (!ready) throw new Error(`Isolated server did not start: ${await fs.readFile(path.join(root, 'server.log'), 'utf8')}`);
                process.env.PLAYWRIGHT_BASE_URL = url;
                await use(url);
            } finally {
                if (previousBase === undefined) delete process.env.PLAYWRIGHT_BASE_URL;
                else process.env.PLAYWRIGHT_BASE_URL = previousBase;
                if (child && child.exitCode === null && child.signalCode === null) {
                    const exited = once(child, 'exit');
                    child.kill();
                    await exited;
                }
                await fs.rm(root, { recursive: true, force: true });
            }
        }, { scope: 'test', timeout: 120_000 }],
        baseURL: async ({ isolatedServer }, use) => { await use(isolatedServer); },
    });
}

export { expect };
