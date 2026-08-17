import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const playwrightEntry = path.join(
    testsRoot,
    'node_modules',
    '@playwright',
    'test',
    'cli.js',
);
const shard = process.env.PLAYWRIGHT_SHARD_INDEX
    ?? process.env.CI_NODE_INDEX
    ?? '0';
const budgetMs = 300_000;

async function getAvailablePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
    return port;
}

const runRoot = process.env.EMBERDESK_TEST_ROOT
    ? path.resolve(process.env.EMBERDESK_TEST_ROOT, `e2e-shard-${shard}`)
    : await fs.mkdtemp(path.join(os.tmpdir(), `emberdesk-e2e-shard-${shard}-`));
const dataRoot = path.join(runRoot, 'data');
const tempRoot = path.join(runRoot, 'tmp');
const configPath = path.join(runRoot, 'config.yaml');
await fs.mkdir(dataRoot, { recursive: true });
await fs.mkdir(tempRoot, { recursive: true });
const startedAt = performance.now();

const environment = {
    ...process.env,
    EMBERDESK_TEST_LANE: 'e2e',
    PLAYWRIGHT_DATA_ROOT: dataRoot,
    PLAYWRIGHT_CONFIG_PATH: configPath,
    PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? String(await getAvailablePort()),
    PLAYWRIGHT_REUSE_SERVER: process.env.PLAYWRIGHT_REUSE_SERVER ?? '0',
    TMPDIR: tempRoot,
};
const result = spawnSync(
    process.execPath,
    [playwrightEntry, 'test', ...process.argv.slice(2)],
    {
        cwd: testsRoot,
        env: environment,
        stdio: 'inherit',
    },
);

const elapsedMs = Math.round(performance.now() - startedAt);
process.stderr.write(`e2e_shard=${shard}\n`);
process.stderr.write(`e2e_run_root=${runRoot}\n`);
process.stderr.write(`e2e_port=${environment.PLAYWRIGHT_PORT}\n`);
process.stderr.write(`e2e_elapsed_ms=${elapsedMs}\n`);
process.stderr.write(`e2e_budget_ms=${budgetMs}\n`);
if (elapsedMs > budgetMs) {
    process.stderr.write('e2e_budget_status=exceeded\n');
}
process.exitCode = result.status ?? 1;
