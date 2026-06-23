import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';

import { chromium } from '../tests/node_modules/playwright/index.mjs';

import { DEFAULT_USER, SETTINGS_FILE } from '../src/constants.js';
import { summarizeStartupPerformance } from '../src/performance-report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'artifacts', 'startup-performance');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(outputRoot, timestamp);
const dataRoot = path.join(runDir, 'data');
const configPath = path.join(runDir, 'config.yaml');
const serverProfilePath = path.join(runDir, 'server-startup-profile.json');
const reportPath = path.join(runDir, 'report.json');
const markdownPath = path.join(runDir, 'report.md');
const screenshotPath = path.join(runDir, 'page.png');
const port = Number(process.env.EMBERDESK_PERF_PORT ?? 8123);
const cliOptions = parseCliOptions(process.argv.slice(2));
const targetUrlOverride = cliOptions.url ?? process.env.EMBERDESK_PERF_URL ?? '';
const useExistingServer = typeof targetUrlOverride === 'string' && targetUrlOverride.length > 0;
const url = normalizeTargetUrl(useExistingServer ? targetUrlOverride : `http://127.0.0.1:${port}/`);

await fs.promises.mkdir(runDir, { recursive: true });

if (!useExistingServer) {
    await fs.promises.mkdir(dataRoot, { recursive: true });
    await writeConfig(configPath);
    await seedSettings(dataRoot);
}

const server = useExistingServer ? null : startServer({
    configPath,
    dataRoot,
    serverProfilePath,
    port,
});

try {
    const serverReady = useExistingServer ? null : await waitForServerReady(server, url);
    const browserResult = await captureBrowserProfile(url, screenshotPath);
    const serverProfile = useExistingServer ? null : readJsonIfExists(serverProfilePath);
    const serverListeningMs = useExistingServer
        ? null
        : (getServerListeningMs(serverProfile) ?? round(serverReady?.serverAcceptedAtMs));

    const timings = {
        serverReadyMs: serverListeningMs,
        navigationToLoadMs: browserResult.timings.loadEventEndMs,
        navigationToDomContentLoadedMs: browserResult.timings.domContentLoadedMs,
        navigationToAppReadyMs: browserResult.timings.appReadyMs,
        serverAcceptedAtMs: round(serverReady?.serverAcceptedAtMs),
    };

    const report = {
        generatedAt: new Date().toISOString(),
        mode: useExistingServer ? 'existing_server_browser_only' : 'spawn_local_server',
        url,
        paths: {
            runDir,
            configPath: useExistingServer ? null : configPath,
            dataRoot: useExistingServer ? null : dataRoot,
            screenshotPath,
            serverProfilePath: useExistingServer ? null : serverProfilePath,
        },
        timings,
        navigation: browserResult.navigation,
        resources: browserResult.resources,
        longTasks: browserResult.longTasks,
        appStages: browserResult.appStages,
        appMarks: browserResult.appMarks,
        serverStartup: serverProfile,
        consoleMessages: browserResult.consoleMessages,
        pageErrors: browserResult.pageErrors,
    };

    report.summary = summarizeStartupPerformance(report);

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(markdownPath, renderMarkdownReport(report), 'utf8');

    process.stdout.write(`${markdownPath}\n`);
} finally {
    await stopServer(server);
}

async function writeConfig(targetPath) {
    const config = [
        `dataRoot: ${normalizePathForYaml(dataRoot)}`,
        'listen: false',
        `port: ${port}`,
        'browserLaunch:',
        '  enabled: false',
        'whitelistMode: false',
        'enableUserAccounts: false',
        'extensions:',
        '  enabled: true',
        '  autoUpdate: false',
        'skipContentCheck: false',
        'logging:',
        '  minLogLevel: 0',
    ].join('\n');

    fs.writeFileSync(targetPath, `${config}\n`, 'utf8');
}

async function seedSettings(targetDataRoot) {
    const sourcePath = path.join(repoRoot, 'default', 'content', SETTINGS_FILE);
    const targetPath = path.join(targetDataRoot, DEFAULT_USER.handle, SETTINGS_FILE);

    const settings = JSON.parse(await fs.promises.readFile(sourcePath, 'utf8'));
    settings.firstRun = false;

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, `${JSON.stringify(settings, null, 4)}\n`, 'utf8');
}

function normalizePathForYaml(targetPath) {
    return JSON.stringify(targetPath.replace(/\\/g, '/'));
}

function parseCliOptions(args) {
    const options = {};

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--url') {
            options.url = args[index + 1] ?? '';
            index++;
        }
    }

    return options;
}

function normalizeTargetUrl(targetUrl) {
    const parsedUrl = new URL(targetUrl);
    if (!parsedUrl.pathname) {
        parsedUrl.pathname = '/';
    }
    return parsedUrl.toString();
}

function startServer({ configPath, dataRoot, serverProfilePath, port }) {
    const env = {
        ...process.env,
        EMBERDESK_STARTUP_PROFILE: serverProfilePath,
    };

    return spawn(process.execPath, [
        'server.js',
        '--configPath', configPath,
        '--dataRoot', dataRoot,
        '--port', String(port),
        '--browserLaunchEnabled', 'false',
        '--listen', 'false',
    ], {
        cwd: repoRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

async function waitForServerReady(server, targetUrl) {
    const startedAt = performance.now();
    let stdout = '';
    let stderr = '';

    server.stdout.setEncoding('utf8');
    server.stderr.setEncoding('utf8');
    server.stdout.on('data', chunk => {
        stdout += chunk;
    });
    server.stderr.on('data', chunk => {
        stderr += chunk;
    });

    while (performance.now() - startedAt < 120000) {
        if (server.exitCode !== null) {
            throw new Error(`Server exited early.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
        }

        try {
            const response = await fetch(targetUrl, { method: 'GET' });
            if (response.ok) {
                return {
                    stdout,
                    stderr,
                    serverAcceptedAtMs: performance.now() - startedAt,
                };
            }
        } catch {
            // Retry until timeout.
        }

        await delay(250);
    }

    throw new Error(`Timed out waiting for server.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function captureBrowserProfile(targetUrl, targetScreenshotPath) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleMessages = [];
    const pageErrors = [];

    page.on('console', message => {
        consoleMessages.push({
            type: message.type(),
            text: message.text(),
        });
    });
    page.on('pageerror', error => {
        pageErrors.push({
            message: error.message,
        });
    });

    await page.addInitScript(() => {
        const longTasks = [];
        globalThis.__emberDeskLongTasks = longTasks;

        if ('PerformanceObserver' in globalThis) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        longTasks.push({
                            startTimeMs: entry.startTime,
                            durationMs: entry.duration,
                        });
                    }
                });

                observer.observe({ type: 'longtask', buffered: true });
            } catch {
                // Long task entries may be unavailable in some browser modes.
            }
        }
    });

    await page.goto(targetUrl, { waitUntil: 'load', timeout: 120000 });

    try {
        await page.waitForFunction(() => {
            const profile = globalThis.__emberDeskStartup;
            return profile && typeof profile.appReadyAtMs === 'number';
        }, undefined, { timeout: 120000 });
    } catch (error) {
        const debugState = await page.evaluate(() => ({
            startup: globalThis.__emberDeskStartup ?? null,
            readyState: document.readyState,
            title: document.title,
        }));
        throw new Error([
            `Timed out waiting for APP_READY: ${error.message}`,
            `Console messages: ${JSON.stringify(consoleMessages, null, 2)}`,
            `Page errors: ${JSON.stringify(pageErrors, null, 2)}`,
            `Debug state: ${JSON.stringify(debugState, null, 2)}`,
        ].join('\n'));
    }

    const expectedDeferredStages = await page.evaluate(() => {
        const stageNames = ['deferred.getClientVersion', 'deferred.getBackgrounds'];
        const extensionsButton = document.getElementById('extensions_details');
        if (extensionsButton && !extensionsButton.classList.contains('disabled')) {
            stageNames.push('deferred.loadExtensionSettings');
        }

        return stageNames;
    });

    try {
        await page.waitForFunction((stageNames) => {
            const stages = globalThis.__emberDeskStartup?.stages ?? [];
            const completedStages = new Set(stages.map(stage => stage.name));
            return stageNames.every(stageName => completedStages.has(stageName));
        }, expectedDeferredStages, { timeout: 10000 });
    } catch {
        // Keep the APP_READY result even if deferred work is still running.
    }

    await page.waitForTimeout(250);
    await page.screenshot({ path: targetScreenshotPath, fullPage: true });

    const payload = await page.evaluate(() => {
        const navigationEntry = performance.getEntriesByType('navigation')[0];
        const resourceEntries = performance.getEntriesByType('resource');
        const profile = globalThis.__emberDeskStartup ?? { stages: [], marks: [] };
        const longTasks = globalThis.__emberDeskLongTasks ?? [];

        const navigation = navigationEntry ? {
            domContentLoadedEventEnd: navigationEntry.domContentLoadedEventEnd,
            loadEventEnd: navigationEntry.loadEventEnd,
            responseStart: navigationEntry.responseStart,
            responseEnd: navigationEntry.responseEnd,
            domInteractive: navigationEntry.domInteractive,
            transferSize: navigationEntry.transferSize,
            encodedBodySize: navigationEntry.encodedBodySize,
            decodedBodySize: navigationEntry.decodedBodySize,
        } : null;

        return {
            navigation,
            resources: resourceEntries.map(entry => ({
                name: entry.name,
                type: entry.initiatorType,
                durationMs: entry.duration,
                transferSize: 'transferSize' in entry ? entry.transferSize : 0,
                encodedBodySize: 'encodedBodySize' in entry ? entry.encodedBodySize : 0,
                decodedBodySize: 'decodedBodySize' in entry ? entry.decodedBodySize : 0,
            })),
            appStages: profile.stages,
            appMarks: profile.marks,
            appReadyAtMs: profile.appReadyAtMs,
            longTasks,
        };
    });

    await context.close();
    await browser.close();

    return {
        consoleMessages,
        pageErrors,
        navigation: payload.navigation,
        resources: payload.resources.map(resource => ({
            ...resource,
            durationMs: round(resource.durationMs),
        })),
        appStages: normalizeAppStages(payload.appStages),
        appMarks: normalizeAppMarks(payload.appMarks),
        longTasks: normalizeLongTasks(payload.longTasks),
        timings: {
            domContentLoadedMs: round(payload.navigation?.domContentLoadedEventEnd ?? null),
            loadEventEndMs: round(payload.navigation?.loadEventEnd ?? null),
            appReadyMs: round(payload.appReadyAtMs ?? null),
        },
    };
}

function normalizeAppStages(stages) {
    return Array.isArray(stages) ? stages.map(stage => ({
        name: stage.name,
        startTimeMs: normalizeRelativeTime(stage.startTimeMs),
        endTimeMs: normalizeRelativeTime(stage.endTimeMs),
        durationMs: round(stage.durationMs),
        error: stage.error ?? null,
    })) : [];
}

function normalizeAppMarks(marks) {
    return Array.isArray(marks) ? marks.map(mark => ({
        name: mark.name,
        timeMs: normalizeRelativeTime(mark.timeMs),
    })) : [];
}

function normalizeLongTasks(tasks) {
    return Array.isArray(tasks) ? tasks.map(task => ({
        startTimeMs: round(task.startTimeMs),
        durationMs: round(task.durationMs),
    })) : [];
}

function normalizeRelativeTime(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return round(value);
}

async function stopServer(server) {
    if (!server || server.exitCode !== null) {
        return;
    }

    if (os.platform() === 'win32') {
        server.kill();
    } else {
        server.kill('SIGTERM');
    }

    const exitedCleanly = await new Promise(resolve => {
        server.once('exit', resolve);
        setTimeout(() => resolve(false), 5000);
    });

    if (exitedCleanly !== false || server.exitCode !== null) {
        return;
    }

    server.kill('SIGKILL');
    await new Promise(resolve => {
        server.once('exit', resolve);
        setTimeout(resolve, 2000);
    });
}

function readJsonIfExists(targetPath) {
    if (!fs.existsSync(targetPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function renderMarkdownReport(report) {
    const summary = report.summary;
    const topResources = summary.resources.topResources.slice(0, 5)
        .map(resource => `- ${resource.type || 'other'} ${resource.transferKb} KB ${resource.name}`)
        .join('\n');
    const stageRows = summary.stageBreakdown
        .map(stage => `- ${stage.name}: ${stage.durationMs ?? 'n/a'} ms`)
        .join('\n');
    const causes = summary.likelyCauses.map(cause => `- ${cause}`).join('\n');

    return [
        '# Startup Performance Report',
        '',
        `- URL: ${report.url}`,
        `- Output JSON: ${reportPath}`,
        `- Screenshot: ${screenshotPath}`,
        '',
        '## Totals',
        '',
        `- Server ready: ${summary.totals.serverReadyMs ?? 'n/a'} ms`,
        `- Navigation to load: ${summary.totals.navigationToLoadMs ?? 'n/a'} ms`,
        `- Navigation to APP_READY: ${summary.totals.navigationToAppReadyMs ?? 'n/a'} ms`,
        `- Post-load app init: ${summary.totals.appInitAfterLoadMs ?? 'n/a'} ms`,
        `- Total transfer: ${summary.totals.totalTransferKb ?? 'n/a'} KB`,
        `- Script transfer: ${summary.totals.scriptTransferKb ?? 'n/a'} KB`,
        `- CSS transfer: ${summary.totals.styleTransferKb ?? 'n/a'} KB`,
        `- Long-task blocking: ${summary.totals.totalBlockingTimeMs ?? 'n/a'} ms`,
        '',
        '## Dominant Bucket',
        '',
        summary.dominantBucket
            ? `- ${summary.dominantBucket.bucket}: ${summary.dominantBucket.durationMs} ms`
            : '- none',
        summary.dominantBucket
            ? `- Reason: ${summary.dominantBucket.reason}`
            : '',
        '',
        '## Top Resources',
        '',
        topResources || '- none',
        '',
        '## App Stages',
        '',
        stageRows || '- none',
        '',
        '## Likely Causes',
        '',
        causes || '- none',
        '',
    ].filter(Boolean).join('\n');
}

function getServerListeningMs(serverProfile) {
    const listeningEvent = Array.isArray(serverProfile?.events)
        ? serverProfile.events.find(event => event?.name === 'server:listening')
        : null;

    return round(listeningEvent?.timeMs ?? null);
}

function round(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.round(value * 100) / 100;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
