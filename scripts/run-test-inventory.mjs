import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    buildInventoryReport,
    classifyTestSource,
    discoverTestFiles,
    parsePlaywrightListOutput,
    renderInventoryMarkdown,
} from './test-inventory.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsRoot = path.join(repoRoot, 'tests');
const jestEntry = path.join(testsRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const playwrightEntry = path.join(
    testsRoot,
    'node_modules',
    '@playwright',
    'test',
    'cli.js',
);
const inventoryConfig = path.join(testsRoot, 'jest.inventory.config.cjs');
const playwrightConfig = path.join(testsRoot, 'playwright.config.js');

function readOption(args, name) {
    const prefix = `${name}=`;
    const value = args.find(argument => argument.startsWith(prefix));
    return value ? value.slice(prefix.length) : null;
}

function phaseReportFiles(entries) {
    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name);
}

const args = process.argv.slice(2);
const staticOnly = args.includes('--static');
const jsonOutput = readOption(args, '--json-out');
const markdownOutput = readOption(args, '--markdown-out');
const files = await discoverTestFiles(testsRoot);
const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'emberdesk-test-inventory-'));
const dataRoot = path.join(runRoot, 'data');
const tempRoot = path.join(runRoot, 'tmp');
const phaseRoot = path.join(runRoot, 'phases');
const jestOutput = path.join(runRoot, 'jest.json');

await Promise.all([
    fs.mkdir(dataRoot, { recursive: true }),
    fs.mkdir(tempRoot, { recursive: true }),
    fs.mkdir(phaseRoot, { recursive: true }),
]);

const startedAt = performance.now();
let jestReport = null;
let playwrightReport = null;
let exitCode = 0;

if (!staticOnly) {
    const environment = {
        ...process.env,
        DATA_DIR: dataRoot,
        DATA_ROOT: dataRoot,
        TMPDIR: tempRoot,
        JEST_PHASE_REPORT_DIR: phaseRoot,
    };
    const result = spawnSync(
        process.execPath,
        [
            '--experimental-vm-modules',
            jestEntry,
            '--config',
            inventoryConfig,
            '--json',
            `--outputFile=${jestOutput}`,
        ],
        {
            cwd: testsRoot,
            env: environment,
            stdio: 'inherit',
        },
    );
    exitCode = result.status ?? 1;
    try {
        jestReport = JSON.parse(await fs.readFile(jestOutput, 'utf8'));
    } catch {
        jestReport = null;
    }

    const playwrightResult = spawnSync(
        process.execPath,
        [
            playwrightEntry,
            'test',
            '--config',
            playwrightConfig,
            '--list',
        ],
        {
            cwd: testsRoot,
            env: {
                ...environment,
                PLAYWRIGHT_DATA_ROOT: dataRoot,
                PLAYWRIGHT_CONFIG_PATH: path.join(runRoot, 'playwright-config.yaml'),
                PLAYWRIGHT_REUSE_SERVER: '0',
            },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    playwrightReport = parsePlaywrightListOutput(
        `${playwrightResult.stdout ?? ''}\n${playwrightResult.stderr ?? ''}`,
    );
    if (!playwrightReport) {
        const discoveredE2eFiles = files.filter(file => (
            classifyTestSource(file).runner === 'playwright'
        )).length;
        playwrightReport = {
            testFiles: discoveredE2eFiles,
            tests: null,
            executed: false,
        };
        process.stderr.write('playwright_discovery=unavailable\n');
    }
}

const phaseEntries = await fs.readdir(phaseRoot, { withFileTypes: true });
const phaseReports = [];
for (const fileName of phaseReportFiles(phaseEntries)) {
    try {
        phaseReports.push(JSON.parse(await fs.readFile(path.join(phaseRoot, fileName), 'utf8')));
    } catch {
        // A worker can be interrupted while writing its phase evidence.
    }
}

const report = buildInventoryReport({
    files,
    jestReport,
    playwrightReport,
    phaseReports,
    wallMs: staticOnly ? null : Math.round(performance.now() - startedAt),
});
const markdown = renderInventoryMarkdown(report);

if (jsonOutput) {
    await fs.writeFile(path.resolve(jsonOutput), JSON.stringify(report, null, 2));
}
if (markdownOutput) {
    await fs.writeFile(path.resolve(markdownOutput), markdown);
}

process.stdout.write(`\n${markdown}`);
process.stderr.write(`inventory_run_root=${runRoot}\n`);
if (exitCode !== 0) {
    process.exitCode = exitCode;
}
