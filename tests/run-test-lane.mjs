import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    classifyTestSource,
    discoverTestFiles,
} from '../scripts/test-inventory.mjs';

const testsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(testsRoot, '..');
const jestEntry = path.join(testsRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const lane = process.argv[2] ?? 'unit';
const requestedArgs = process.argv.slice(3);
const knownLayers = new Set(['unit', 'component', 'integration', 'all']);
const laneBudgets = {
    unit: 10_000,
    component: 5_000,
    integration: 30_000,
    all: 120_000,
};

if (!knownLayers.has(lane)) {
    throw new Error(`Unknown test lane: ${lane}`);
}

const files = await discoverTestFiles(testsRoot);
const requestedFiles = requestedArgs
    .filter(argument => /\.(?:test|e2e)\.js$/.test(argument))
    .map(argument => argument.replaceAll('\\', '/').replace(/^\.?\//, ''));
const jestOptions = requestedArgs.filter(argument => !/\.(?:test|e2e)\.js$/.test(argument));
const selectedFiles = requestedFiles.length > 0
    ? files.filter(file => requestedFiles.some(requested => (
        file.relativePath === requested
        || file.relativePath.endsWith(`/${requested}`)
        || path.basename(file.relativePath) === path.basename(requested)
    )))
    : files.filter(file => (
        lane === 'all'
            ? classifyTestSource(file).runner === 'jest'
            : classifyTestSource(file).layer === lane
    ));

if (requestedFiles.length > 0 && selectedFiles.length !== requestedFiles.length) {
    const selectedNames = new Set(selectedFiles.map(file => path.basename(file.relativePath)));
    const missing = requestedFiles.filter(file => !selectedNames.has(path.basename(file)));
    throw new Error(`Requested test files were not found: ${missing.join(', ')}`);
}

const runRoot = process.env.EMBERDESK_TEST_ROOT
    ? path.resolve(process.env.EMBERDESK_TEST_ROOT, lane)
    : await fs.mkdtemp(path.join(os.tmpdir(), `emberdesk-test-${lane}-`));
const dataRoot = path.join(runRoot, 'data');
const tempRoot = path.join(runRoot, 'tmp');
await fs.mkdir(dataRoot, { recursive: true });
await fs.mkdir(tempRoot, { recursive: true });
const startedAt = performance.now();

const environment = {
    ...process.env,
    EMBERDESK_TEST_LANE: lane,
    DATA_DIR: dataRoot,
    DATA_ROOT: dataRoot,
    TMPDIR: tempRoot,
};
const configPath = path.join(testsRoot, `jest.${lane === 'all' ? 'unit' : lane}.config.cjs`);
const jestArgs = [
    '--experimental-vm-modules',
    jestEntry,
    '--config',
    configPath,
    ...jestOptions,
];

if (selectedFiles.length === 0) {
    jestArgs.push('--passWithNoTests');
} else {
    jestArgs.push(
        '--runTestsByPath',
        ...selectedFiles.map(file => path.join(repoRoot, file.relativePath)),
    );
}

const result = spawnSync(process.execPath, jestArgs, {
    cwd: testsRoot,
    env: environment,
    stdio: 'inherit',
});

const elapsedMs = Math.round(performance.now() - startedAt);
process.stderr.write(`test_lane=${lane}\n`);
process.stderr.write(`test_run_root=${runRoot}\n`);
process.stderr.write(`test_files=${selectedFiles.length}\n`);
process.stderr.write(`test_elapsed_ms=${elapsedMs}\n`);
process.stderr.write(`test_budget_ms=${laneBudgets[lane]}\n`);
if (elapsedMs > laneBudgets[lane]) {
    process.stderr.write('test_budget_status=exceeded\n');
}
process.exitCode = result.status ?? 1;
