import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_LAYERS = ['unit', 'component', 'integration', 'e2e'];
export const RESOURCE_KEYS = ['db', 'file', 'network', 'browser', 'realTime', 'worker'];

const TEST_FILE_PATTERN = /\.(?:test|e2e)\.js$/;
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', 'test-results', 'dist']);
const ROOT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizePath(filePath) {
    return String(filePath).replaceAll(path.sep, '/');
}

function hasAny(source, patterns) {
    return patterns.some(pattern => pattern.test(source));
}

function stripCommentsAndStringLiterals(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '');
}

function hasCleanupHook(source) {
    return /\b(?:afterAll|afterEach)\s*\(/.test(source)
        || /\b(?:restoreAllMocks|resetAllMocks|resetModules|isolateModules)\s*\(/.test(source);
}

function matchesTestResult(filePath, testPath) {
    const normalizedFile = normalizePath(filePath);
    const normalizedTest = normalizePath(testPath);
    if (normalizedFile === normalizedTest) {
        return true;
    }

    const relativeFile = normalizedFile.replace(/^\.?\//, '');
    return normalizedTest.endsWith(`/${relativeFile}`)
        || normalizedTest.endsWith(`/${relativeFile.replace(/^tests\//, '')}`);
}

function sumDurations(values) {
    const observed = values.filter(value => Number.isFinite(value));
    return observed.length > 0 ? observed.reduce((total, value) => total + value, 0) : null;
}

export function classifyTestSource({ relativePath, source }) {
    const normalizedPath = normalizePath(relativePath);
    const usesPlaywright = /^import\s+[^\n;]*\sfrom\s+['"]@playwright\/test['"]/m.test(source)
        || /^import\s+['"]@playwright\/test['"]/m.test(source)
        || /^(?:const|let|var)\s+[^\n;]*=\s*require\(['"]@playwright\/test['"]\)/m.test(source);
    const behaviorSource = stripCommentsAndStringLiterals(source);
    const resources = {
        db: hasAny(behaviorSource, [
            /\bDatabaseSync\b/,
            /\b(?:sqlite|canonical-sqlite|openCanonicalDatabase)\b/i,
        ]),
        file: hasAny(behaviorSource, [
            /\b(?:readFile|writeFile|appendFile|mkdir|rm|mkdtemp|tmpdir|readdir|stat)(?:Sync)?\s*\(/,
            /\bfs\.(?:promises\.)?(?:readFile|writeFile|appendFile|mkdir|rm|mkdtemp|readdir|stat)/,
        ]),
        network: usesPlaywright || hasAny(behaviorSource, [
            /\bfetch\s*\(/,
            /\b(?:http|https)\.createServer\s*\(/,
            /\b(?:http|https)\.(?:request|get)\s*\(/,
            /\b(?:app|server)\.listen\s*\(/,
        ]),
        browser: usesPlaywright || hasAny(behaviorSource, [
            /\b(?:page|browser|context)\.[A-Za-z_$][\w$]*\s*\(/,
            /\b(?:document|window)\.(?:querySelector|querySelectorAll|getElementById|createElement|addEventListener|removeEventListener|body|documentElement|defaultView|innerWidth|innerHeight|localStorage)\b/,
            /\bnew\s+(?:HTMLElement|DOMParser)\b/,
        ]),
        realTime: hasAny(behaviorSource, [
            /\bDate\.now\s*\(/,
            /\bnew\s+Date\b/,
            /\bperformance\.now\s*\(/,
            /\b(?:setTimeout|setInterval)\s*\(/,
        ]) && !/\bjest\.useFakeTimers\s*\(/.test(behaviorSource),
        worker: hasAny(source, [
            /\bworker_threads\b/,
        ]) || hasAny(behaviorSource, [
            /\bnew\s+Worker\s*\(/,
            /\b(?:spawn|fork)\s*\(/,
            /\bsetInterval\s*\(/,
        ]),
    };

    const isolation = {
        processEnvironment: /\bprocess\.env\b/.test(behaviorSource),
        globalSingleton: hasAny(behaviorSource, [
            /\bglobalThis\./,
            /\bglobal\./,
            /\bjest\.(?:mock|unstable_mockModule|resetModules|isolateModules)\s*\(/,
        ]),
        sharedTempDirectory: hasAny(behaviorSource, [
            /\bos\.tmpdir\s*\(/,
            /\bmkdtemp(?:Sync)?\s*\(/,
            /\b(?:TMPDIR|DATA_DIR|DATA_ROOT)\b/,
        ]),
    };

    const lifecycle = {
        beforeAll: /\bbeforeAll\s*\(/.test(behaviorSource),
        afterAll: /\bafterAll\s*\(/.test(behaviorSource),
        beforeEach: /\bbeforeEach\s*\(/.test(behaviorSource),
        afterEach: /\bafterEach\s*\(/.test(behaviorSource),
        close: /\b(?:server|database|db|connection|browser|worker)\.close\s*\(/.test(behaviorSource)
            || /\bclose\s*\(\s*\)/.test(behaviorSource),
        dispose: /\b(?:dispose|destroy|cleanup|reset)\w*\s*\(/i.test(behaviorSource),
        clearTimer: /\b(?:clearTimeout|clearInterval)\s*\(/.test(behaviorSource),
        terminateWorker: /\b(?:terminate|unref)\s*\(/.test(behaviorSource),
        leakCandidates: [],
    };

    const leakCandidates = [];
    if (isolation.globalSingleton && !hasCleanupHook(source)) {
        leakCandidates.push('global-reset-unverified');
    }
    if (resources.db && !lifecycle.close && !lifecycle.dispose) {
        leakCandidates.push('db-close-unverified');
    }
    if (resources.network && /\b(?:createServer|\.listen)\s*\(/.test(behaviorSource) && !lifecycle.close) {
        leakCandidates.push('server-close-unverified');
    }
    if (resources.worker && !lifecycle.terminateWorker && !lifecycle.close && !lifecycle.dispose) {
        leakCandidates.push('worker-close-unverified');
    }
    if (resources.realTime && /\b(?:setTimeout|setInterval)\s*\(/.test(source) && !lifecycle.clearTimer) {
        leakCandidates.push('timer-clear-unverified');
    }
    lifecycle.leakCandidates = leakCandidates;

    let layer = 'unit';
    if (usesPlaywright) {
        layer = 'e2e';
    } else if (resources.browser && !resources.db && !resources.file && !resources.network) {
        layer = 'component';
    } else if (Object.values(resources).some(Boolean)) {
        layer = 'integration';
    }

    return {
        file: normalizedPath,
        runner: usesPlaywright ? 'playwright' : 'jest',
        layer,
        resources,
        isolation,
        lifecycle,
    };
}

export async function discoverTestFiles(testsRoot) {
    const files = [];

    async function visit(directory) {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
                continue;
            }

            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }
            if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) {
                continue;
            }

            const source = await fs.readFile(absolutePath, 'utf8');
            files.push({
                relativePath: normalizePath(path.relative(ROOT_DIRECTORY, absolutePath)),
                source,
            });
        }
    }

    await visit(testsRoot);
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function parsePlaywrightListOutput(output) {
    const match = String(output).match(/Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/i);
    if (!match) {
        return null;
    }

    return {
        tests: Number(match[1]),
        testFiles: Number(match[2]),
        executed: false,
    };
}

function buildJestFileTiming(file, jestReport, phaseReports) {
    const result = jestReport?.testResults?.find(candidate => (
        matchesTestResult(file.relativePath, candidate.name)
    ));
    const phase = phaseReports.find(candidate => (
        matchesTestResult(file.relativePath, candidate.testPath)
    ));
    const assertionResults = result?.assertionResults ?? [];
    const testMs = sumDurations(assertionResults.map(assertion => assertion.duration));

    return {
        file: file.relativePath,
        ms: Number.isFinite(result?.startTime) && Number.isFinite(result?.endTime)
            ? result.endTime - result.startTime
            : null,
        status: result?.status ?? 'not-run',
        tests: assertionResults.length,
        failedTests: assertionResults.filter(assertion => assertion.status === 'failed').length,
        phase: {
            transformMs: phase?.transformMs ?? null,
            importMs: phase?.importMs ?? null,
            setupMs: phase?.setupMs ?? null,
            environmentMs: phase?.environmentMs ?? null,
            testsMs: phase?.testsMs ?? testMs,
            teardownMs: phase?.teardownMs ?? null,
        },
        assertions: assertionResults.map(assertion => ({
            title: assertion.fullName ?? assertion.title ?? '(anonymous)',
            ms: assertion.duration ?? null,
            status: assertion.status,
        })),
    };
}

export function buildInventoryReport({
    files,
    jestReport = null,
    playwrightReport = null,
    phaseReports = [],
    wallMs = null,
}) {
    const classifiedFiles = files.map(file => ({
        ...file,
        metadata: classifyTestSource(file),
    }));
    const fileTimings = classifiedFiles.map(file => buildJestFileTiming(
        file,
        jestReport,
        phaseReports,
    ));
    const allTests = fileTimings.flatMap(file => file.assertions.map(assertion => ({
        file: file.file,
        title: assertion.title,
        ms: assertion.ms,
        status: assertion.status,
    })));
    const failures = allTests.filter(test => test.status === 'failed');
    const phases = {
        transformMs: sumDurations(fileTimings.map(file => file.phase.transformMs)),
        importMs: sumDurations(fileTimings.map(file => file.phase.importMs)),
        setupMs: sumDurations(fileTimings.map(file => file.phase.setupMs)),
        environmentMs: sumDurations(fileTimings.map(file => file.phase.environmentMs)),
        testsMs: sumDurations(fileTimings.map(file => file.phase.testsMs)),
        teardownMs: sumDurations(fileTimings.map(file => file.phase.teardownMs)),
        transformObservability: 'not-observable-by-jest',
    };
    const resourceCounts = Object.fromEntries(RESOURCE_KEYS.map(key => [
        key,
        classifiedFiles.filter(file => file.metadata.resources[key]).length,
    ]));
    const isolationKeys = ['globalSingleton', 'processEnvironment', 'sharedTempDirectory'];
    const isolationCounts = Object.fromEntries(isolationKeys.map(key => [
        key,
        classifiedFiles.filter(file => file.metadata.isolation[key]).length,
    ]));
    const isolationFiles = Object.fromEntries(isolationKeys.map(key => [
        key,
        classifiedFiles
            .filter(file => file.metadata.isolation[key])
            .map(file => file.relativePath),
    ]));
    const layers = Object.fromEntries(TEST_LAYERS.map(layer => [
        layer,
        classifiedFiles.filter(file => file.metadata.layer === layer).length,
    ]));
    const lifecycleCandidates = classifiedFiles
        .filter(file => file.metadata.lifecycle.leakCandidates.length > 0)
        .map(file => ({
            file: file.relativePath,
            candidates: file.metadata.lifecycle.leakCandidates,
        }));
    const completedFileEnds = fileTimings
        .map(file => file.ms)
        .filter(Number.isFinite);
    const discoveredE2eFiles = classifiedFiles.filter(file => file.metadata.runner === 'playwright').length;
    const jestFiles = jestReport?.numTotalTestSuites
        ?? classifiedFiles.length - discoveredE2eFiles;
    const executedJestTests = jestReport?.numTotalTests ?? allTests.length;
    const discoveredPlaywrightTests = playwrightReport?.tests ?? 0;
    const discoveredPlaywrightFiles = playwrightReport?.testFiles ?? discoveredE2eFiles;
    const hasRuntimeReport = jestReport !== null || playwrightReport !== null;
    const reportWallMs = Number.isFinite(wallMs)
        ? wallMs
        : Number.isFinite(jestReport?.startTime) && completedFileEnds.length > 0
            ? Math.max(...jestReport.testResults.map(result => result.endTime)) - jestReport.startTime
            : null;

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            testFiles: hasRuntimeReport
                ? jestFiles + discoveredPlaywrightFiles
                : classifiedFiles.length,
            tests: hasRuntimeReport
                ? executedJestTests + discoveredPlaywrightTests
                : allTests.length,
            failures: jestReport?.numFailedTests ?? failures.length,
            failedFiles: jestReport?.numFailedTestSuites ?? fileTimings.filter(file => file.status === 'failed').length,
            passedFiles: jestReport?.numPassedTestSuites ?? fileTimings.filter(file => file.status === 'passed').length,
            wallMs: reportWallMs,
            executedJestFiles: jestFiles,
            executedJestTests,
            discoveredPlaywrightFiles,
            discoveredPlaywrightTests: playwrightReport?.tests ?? null,
            playwrightFailures: playwrightReport?.failures ?? null,
            playwrightExecution: playwrightReport?.executed ?? false,
        },
        layers,
        resources: resourceCounts,
        isolation: isolationCounts,
        isolationFiles,
        phases,
        slowestFiles: [...fileTimings]
            .filter(file => Number.isFinite(file.ms))
            .sort((left, right) => right.ms - left.ms)
            .slice(0, 10),
        slowestTests: [...allTests]
            .filter(test => Number.isFinite(test.ms))
            .sort((left, right) => right.ms - left.ms)
            .slice(0, 10),
        failures,
        lifecycleCandidates,
        files: classifiedFiles.map(file => ({
            file: file.relativePath,
            runner: file.metadata.runner,
            layer: file.metadata.layer,
            resources: file.metadata.resources,
            isolation: file.metadata.isolation,
            lifecycle: file.metadata.lifecycle,
            timing: fileTimings.find(timing => timing.file === file.relativePath),
        })),
    };
}

function formatMs(value) {
    return Number.isFinite(value) ? `${value} ms` : 'n/a';
}

function formatCount(value) {
    return Number.isFinite(value) ? String(value) : 'n/a';
}

export function renderInventoryMarkdown(report) {
    const lines = [
        '# Test Inventory',
        '',
        `Generated: ${report.generatedAt}`,
        '',
        '## Summary',
        '',
        `- Files: ${report.summary.testFiles}`,
        `- Tests: ${report.summary.tests}`,
        `- Jest execution: ${report.summary.executedJestFiles} files, ${report.summary.executedJestTests} tests`,
        `- Playwright discovery: ${report.summary.discoveredPlaywrightFiles} files, ${formatCount(report.summary.discoveredPlaywrightTests)} tests`,
        `- Failures: ${report.summary.failures} executed Jest tests across ${report.summary.failedFiles} files`,
        `- Playwright failures: ${report.summary.playwrightFailures === null ? 'n/a (discovery only)' : report.summary.playwrightFailures}`,
        `- Wall time: ${formatMs(report.summary.wallMs)}`,
        '',
        '## Layers',
        '',
        ...TEST_LAYERS.map(layer => `- ${layer}: ${report.layers[layer]} files`),
        '',
        '## Resources',
        '',
        ...RESOURCE_KEYS.map(resource => `- ${resource}: ${report.resources[resource]} files`),
        '',
        '## Shared state',
        '',
        `- global singleton candidates: ${report.isolation.globalSingleton} files`,
        `- environment variable candidates: ${report.isolation.processEnvironment} files`,
        `- shared temporary directory candidates: ${report.isolation.sharedTempDirectory} files`,
        '',
        '## Phases',
        '',
        '| Phase | Duration | Evidence |',
        '|---|---:|---|',
        `| transform | ${formatMs(report.phases.transformMs)} | ${report.phases.transformObservability} |`,
        `| import | ${formatMs(report.phases.importMs)} | Jest phase probe |`,
        `| setup | ${formatMs(report.phases.setupMs)} | Jest phase probe |`,
        `| environment | ${formatMs(report.phases.environmentMs)} | Jest environment probe |`,
        `| tests | ${formatMs(report.phases.testsMs)} | Jest assertion durations |`,
        `| teardown | ${formatMs(report.phases.teardownMs)} | Jest environment probe |`,
        '',
        '## Slowest files',
        '',
        ...report.slowestFiles.map(file => `- ${formatMs(file.ms)}: ${file.file}`),
        '',
        '## Slowest tests',
        '',
        ...report.slowestTests.map(test => `- ${formatMs(test.ms)}: ${test.file} :: ${test.title}`),
        '',
        '## Lifecycle candidates',
        '',
        ...(report.lifecycleCandidates.length > 0
            ? report.lifecycleCandidates.map(candidate => `- ${candidate.file}: ${candidate.candidates.join(', ')}`)
            : ['- none detected by static scan']),
        '',
    ];
    return lines.join('\n');
}
