import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';

import { chromium } from '../tests/node_modules/playwright/index.mjs';

import { DEFAULT_USER, SETTINGS_FILE } from '../src/constants.js';
import {
    buildVariantComparison,
    compareScenarioPayloads,
    summarizeScenarioPayload,
    validateInteractionPath,
} from '../src/interaction-performance-report.js';
import { write as writeCharacterCardPngData } from '../src/character-card-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'artifacts', 'interaction-perf');
const defaultPort = Number(process.env.EMBERDESK_PERF_PORT ?? 8133);
const cliOptions = parseCliOptions(process.argv.slice(2));
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(outputRoot, timestamp);
const baselineRoot = path.join(runDir, 'baseline');
const reportPath = path.join(runDir, 'report.json');
const markdownPath = path.join(runDir, 'report.md');
const samplesPath = path.join(runDir, 'samples.json');
const configSnapshotPath = path.join(runDir, 'config.json');
const screenshotRoot = path.join(runDir, 'screenshots');
const profile = cliOptions.profile ?? 'medium';
const scenarioSelection = cliOptions.scenario ?? 'suite';
const measuredRepeats = cliOptions.repeats ?? 4;
const pairCount = cliOptions.pairs ?? 3;
const variantSelection = cliOptions.variant ?? 'ab';
const scenarios = resolveScenarios(scenarioSelection);
const datasetProfiles = {
    small: { characters: 12, chatFilesPerCharacter: 2, chatMessagesPerFile: 8, mainChatMessagesPerFile: 50 },
    medium: { characters: 60, chatFilesPerCharacter: 4, chatMessagesPerFile: 24, mainChatMessagesPerFile: 500 },
    large: { characters: 180, chatFilesPerCharacter: 6, chatMessagesPerFile: 40, mainChatMessagesPerFile: 5000 },
};
const datasetProfile = datasetProfiles[profile];
const defaultAvatarBuffer = fs.readFileSync(new URL('../public/img/ai4.png', import.meta.url));

if (cliOptions.listScenarios) {
    process.stdout.write(`${JSON.stringify({
        defaultSelection: 'suite',
        scenarioGroups: {
            characterRoute: [
                'characters_all_first_build',
                'characters_all_warm_repeat',
                'characters_get_warm_repeat',
                'characters_all_after_chat_dirty',
                'character_delete_refresh_ui',
            ],
            characterLibrary: [
                'character_library_first_interactive',
                'character_library_filter_response',
                'character_library_pagination_scroll',
            ],
            mainChat: [
                'main_chat_warm_open_first_readable',
                'main_chat_send_local_echo',
                'main_chat_stream_first_token',
                'main_chat_stream_stop_to_usable',
                'main_chat_long_load_more',
            ],
        },
        selectedScenarios: scenarios,
    }, null, 2)}\n`);
    process.exit(0);
}

if (!datasetProfile) {
    throw new Error(`Unknown dataset profile: ${profile}`);
}

await fs.promises.mkdir(runDir, { recursive: true });
await fs.promises.mkdir(screenshotRoot, { recursive: true });
await fs.promises.mkdir(baselineRoot, { recursive: true });

await seedBaselineDataset({
    baselineRoot,
    datasetProfile,
});

const runConfig = {
    generatedAt: new Date().toISOString(),
    profile,
    datasetProfile,
    scenarioSelection,
    variantSelection,
    scenarios,
    measuredRepeats,
    pairCount,
    output: {
        runDir,
        baselineRoot,
        reportPath,
        markdownPath,
        samplesPath,
        configSnapshotPath,
        screenshotRoot,
    },
};

fs.writeFileSync(configSnapshotPath, JSON.stringify(runConfig, null, 2), 'utf8');

const scenarioResults = [];
const rawSamples = [];

for (const scenarioName of scenarios) {
    const scenarioResult = await runScenarioPairs({
        runDir,
        baselineRoot,
        scenarioName,
        measuredRepeats,
        pairCount,
        screenshotRoot,
    });

    scenarioResults.push(scenarioResult.summary);
    rawSamples.push(...scenarioResult.samples);
}

const report = {
    generatedAt: new Date().toISOString(),
    profile,
    datasetProfile,
    measuredRepeats,
    pairCount,
    scenarios: scenarioResults,
    warnings: scenarioResults.flatMap(result => result.warnings ?? []),
    runtime: {
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        browser: 'chromium',
        cacheState: 'fresh cloned data root per scenario variant',
    },
};

fs.writeFileSync(samplesPath, JSON.stringify(rawSamples, null, 2), 'utf8');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(markdownPath, renderMarkdownReport(report), 'utf8');

process.stdout.write(`${markdownPath}\n`);

async function seedBaselineDataset({ baselineRoot, datasetProfile }) {
    const userRoot = path.join(baselineRoot, DEFAULT_USER.handle);
    const configPath = path.join(baselineRoot, 'config.yaml');
    await fs.promises.mkdir(userRoot, { recursive: true });
    await writeConfig(configPath, baselineRoot, defaultPort);
    await seedSettings(baselineRoot);

    const charactersRoot = path.join(userRoot, 'characters');
    const chatsRoot = path.join(userRoot, 'chats');
    const backgroundsRoot = path.join(userRoot, 'backgrounds');
    await fs.promises.mkdir(charactersRoot, { recursive: true });
    await fs.promises.mkdir(chatsRoot, { recursive: true });
    await fs.promises.mkdir(backgroundsRoot, { recursive: true });
    fs.copyFileSync(
        path.join(repoRoot, 'default', 'content', 'backgrounds', '__transparent.png'),
        path.join(backgroundsRoot, '__transparent.png'),
    );

    for (let index = 0; index < datasetProfile.characters; index++) {
        const baseName = `perf-character-${String(index + 1).padStart(4, '0')}`;
        const avatar = `${baseName}.png`;
        const payload = JSON.stringify({
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: `Perf Character ${index + 1}`,
                description: `Description ${index + 1}`,
                personality: `Personality ${index + 1}`,
                scenario: `Scenario ${index + 1}`,
                first_mes: `First ${index + 1}`,
                mes_example: `Example ${index + 1}`,
                creator_notes: `Creator notes ${index + 1}`,
                system_prompt: '',
                post_history_instructions: '',
                alternate_greetings: [],
                tags: [`tag-${index % 5}`],
                creator: 'perf-runner',
                character_version: '2.0',
                extensions: {
                    talkativeness: 0.5,
                    fav: index % 7 === 0,
                    world: '',
                },
            },
        });

        fs.writeFileSync(path.join(charactersRoot, avatar), writeCharacterCardPngData(defaultAvatarBuffer, payload));

        const characterChatRoot = path.join(chatsRoot, baseName);
        await fs.promises.mkdir(characterChatRoot, { recursive: true });

        for (let chatIndex = 0; chatIndex < datasetProfile.chatFilesPerCharacter; chatIndex++) {
            const chatName = `Session ${chatIndex + 1}.jsonl`;
            const messageCount = index === 4 && chatIndex === 0
                ? datasetProfile.mainChatMessagesPerFile
                : datasetProfile.chatMessagesPerFile;
            const messages = createChatMessages(index, chatIndex, messageCount);
            fs.writeFileSync(
                path.join(characterChatRoot, chatName),
                messages.map(message => JSON.stringify(message)).join('\n'),
                'utf8',
            );
        }
    }
}

function createChatMessages(characterIndex, chatIndex, messageCount) {
    const startedAt = new Date(Date.UTC(2026, 4, 10, 0, 0, 0) + ((characterIndex * 100) + chatIndex) * 60000);
    const metadata = {
        user_name: 'User',
        character_name: `Perf Character ${characterIndex + 1}`,
        create_date: startedAt.toISOString(),
        chat_metadata: {
            scenario: 'perf-benchmark',
            system_prompt: '',
            mes_example: '',
        },
    };
    const messages = [metadata];

    for (let index = 0; index < messageCount; index++) {
        messages.push({
            name: index % 2 === 0 ? 'User' : `Perf Character ${characterIndex + 1}`,
            is_user: index % 2 === 0,
            mes: `Message ${index + 1} for character ${characterIndex + 1}, chat ${chatIndex + 1}.`,
            send_date: new Date(startedAt.getTime() + index * 15000).toISOString(),
        });
    }

    return messages;
}

async function runScenarioPairs({ runDir, baselineRoot, scenarioName, measuredRepeats, pairCount, screenshotRoot }) {
    const pairResults = [];
    const warnings = [];

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
        const pairRunRoot = path.join(runDir, scenarioName, `pair-${String(pairIndex + 1).padStart(2, '0')}`);
        const sqliteOnRoot = path.join(pairRunRoot, 'sqlite-on');
        const sqliteOffRoot = path.join(pairRunRoot, 'sqlite-off');
        await cloneDirectory(baselineRoot, sqliteOnRoot);
        if (variantSelection !== 'sqlite_on_only') {
            await cloneDirectory(baselineRoot, sqliteOffRoot);
        }

        const order = variantSelection === 'sqlite_on_only'
            ? ['sqlite_on']
            : pairIndex % 2 === 0 ? ['sqlite_on', 'sqlite_off'] : ['sqlite_off', 'sqlite_on'];
        const pairVariantResults = [];

        for (const variant of order) {
            const variantRoot = variant === 'sqlite_on' ? sqliteOnRoot : sqliteOffRoot;
            const port = defaultPort + (pairIndex * 2) + (variant === 'sqlite_on' ? 0 : 1);
            const variantResult = await runScenarioVariant({
                scenarioName,
                variant,
                variantRoot,
                port,
                measuredRepeats,
                screenshotRoot,
            });
            pairVariantResults.push(variantResult);
        }

        const sqliteOnResult = pairVariantResults.find(result => result.variant === 'sqlite_on');
        const sqliteOffResult = pairVariantResults.find(result => result.variant === 'sqlite_off');
        const comparison = compareScenarioPayloads(
            scenarioName,
            sqliteOnResult?.payloadReference ?? null,
            sqliteOffResult?.payloadReference ?? null,
        );

        const variantWarnings = pairVariantResults.flatMap(result => result.warnings ?? []);
        warnings.push(...variantWarnings);

        const semanticValid = variantSelection === 'sqlite_on_only'
            ? Boolean(sqliteOnResult?.valid)
            : Boolean(sqliteOnResult?.valid && sqliteOffResult?.valid && comparison.matches);
        if (variantSelection !== 'sqlite_on_only' && !comparison.matches) {
            warnings.push(`[${scenarioName}] pair ${pairIndex + 1}: payload mismatch between SQLite on/off variants`);
        }

        pairResults.push({
            pairIndex: pairIndex + 1,
            order,
            semanticValid,
            comparison,
            mismatchDetail: comparison.matches ? null : {
                sqliteOn: comparison.normalizedOn,
                sqliteOff: comparison.normalizedOff,
            },
            payloadSummary: {
                sqliteOn: summarizeScenarioPayload(scenarioName, sqliteOnResult?.payloadReference ?? null),
                sqliteOff: summarizeScenarioPayload(scenarioName, sqliteOffResult?.payloadReference ?? null),
            },
            variants: pairVariantResults,
        });
    }

    const sqliteOnSamples = pairResults
        .flatMap(pair => pair.variants.filter(variant => variant.variant === 'sqlite_on' && pair.semanticValid))
        .flatMap(variant => variant.samples);
    const sqliteOffSamples = pairResults
        .flatMap(pair => pair.variants.filter(variant => variant.variant === 'sqlite_off' && pair.semanticValid))
        .flatMap(variant => variant.samples);

    return {
        samples: pairResults.flatMap(pair => pair.variants.flatMap(variant => variant.samples)),
        summary: {
            scenario: scenarioName,
            pairCount,
            measuredRepeats,
            validPairCount: pairResults.filter(pair => pair.semanticValid).length,
            invalidPairCount: pairResults.filter(pair => !pair.semanticValid).length,
            comparison: buildVariantComparison(sqliteOnSamples, sqliteOffSamples),
            warnings,
            pairs: pairResults.map(pair => ({
                pairIndex: pair.pairIndex,
                order: pair.order,
                semanticValid: pair.semanticValid,
                mismatchDetail: pair.mismatchDetail,
                payloadSummary: pair.payloadSummary,
                variants: pair.variants.map(variant => ({
                    variant: variant.variant,
                    valid: variant.valid,
                    warnings: variant.warnings,
                    sampleCount: variant.samples.length,
                    payloadPath: variant.payloadPath,
                })),
            })),
        },
    };
}

async function runScenarioVariant({ scenarioName, variant, variantRoot, port, measuredRepeats, screenshotRoot }) {
    const dataRoot = variantRoot;
    const configPath = path.join(variantRoot, 'config.yaml');
    const url = new URL(`http://127.0.0.1:${port}/perf-harness.html`).toString();
    const targetAvatar = chooseTargetAvatar(variantRoot);
    const env = {
        ...process.env,
        EMBERDESK_CHARACTER_INDEX_MODE: variant === 'sqlite_on' ? 'force_on' : 'force_off',
        EMBERDESK_INTERACTION_PERF_MODE: '1',
        EMBERDESK_INTERACTION_PERF_CHAT_MTIME_MS: String(Date.parse('2026-05-10T00:00:00.000Z')),
    };

    const server = startServer({
        configPath,
        dataRoot,
        port,
        env,
    });

    try {
        await waitForServerReady(server, url);
        const result = await captureScenarioMeasurements({
            scenarioName,
            variant,
            url,
            screenshotRoot,
            measuredRepeats,
            targetAvatar,
        });
        return result;
    } finally {
        await stopServer(server);
    }
}

async function captureScenarioMeasurements({ scenarioName, variant, url, screenshotRoot, measuredRepeats, targetAvatar }) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleMessages = [];
    const pageErrors = [];

    attachPageDiagnostics(page, { consoleMessages, pageErrors });

    const samples = [];
    let payloadReference = null;
    let warnings = [];

    if (!targetAvatar) {
        throw new Error(`Scenario ${scenarioName} could not find any characters to measure.`);
    }

    if (isCharacterLibraryScenario(scenarioName) || isMainChatScenario(scenarioName)) {
        await page.goto(toAppUrl(url), { waitUntil: 'load', timeout: 120000 });
        await waitForAppReady(page, targetAvatar);
        await page.waitForTimeout(250);

        if (isCharacterLibraryScenario(scenarioName)) {
            for (let index = 0; index < measuredRepeats; index++) {
                const sample = await invokeCharacterLibraryScenario(page, scenarioName);
                warnings = collectCharacterLibraryWarnings(warnings, scenarioName, variant, sample);
                payloadReference = payloadReference ?? sample.payload;
                samples.push(normalizeSample(scenarioName, variant, sample, index + 1, measuredRepeats));
            }
        } else {
            for (let index = 0; index < measuredRepeats; index++) {
                const sample = await invokeMainChatScenario(page, scenarioName, targetAvatar, profile);
                warnings = collectMainChatWarnings(warnings, scenarioName, variant, sample);
                payloadReference = payloadReference ?? sample.payload;
                samples.push(normalizeSample(scenarioName, variant, sample, index + 1, measuredRepeats));
            }
        }
    } else {
        await page.goto(url, { waitUntil: 'load', timeout: 120000 });
        await page.waitForTimeout(100);
    }

    const csrfToken = isCharacterLibraryScenario(scenarioName) || isMainChatScenario(scenarioName) ? null : await getCsrfToken(page);

    if (isMainChatScenario(scenarioName)) {
        // Main-chat browser scenarios are handled on the app page above.
    } else if (scenarioName === 'characters_all_first_build') {
        const sample = await invokeScenarioRequest(page, csrfToken, scenarioName, targetAvatar);
        const pathCheck = validateInteractionPath(scenarioName, variant, sample.path);
        warnings = collectVariantWarnings(warnings, pathCheck, sample);
        payloadReference = sample.payload;
        samples.push(normalizeSample(scenarioName, variant, sample, 1, 1));
    } else if (scenarioName === 'characters_all_warm_repeat') {
        await invokeScenarioRequest(page, csrfToken, scenarioName, targetAvatar);
        for (let index = 0; index < measuredRepeats; index++) {
            const sample = await invokeScenarioRequest(page, csrfToken, scenarioName, targetAvatar);
            const pathCheck = validateInteractionPath(scenarioName, variant, sample.path);
            warnings = collectVariantWarnings(warnings, pathCheck, sample);
            payloadReference = payloadReference ?? sample.payload;
            samples.push(normalizeSample(scenarioName, variant, sample, index + 1, measuredRepeats));
        }
    } else if (scenarioName === 'characters_get_warm_repeat') {
        await invokeScenarioRequest(page, csrfToken, scenarioName, targetAvatar);
        for (let index = 0; index < measuredRepeats; index++) {
            const sample = await invokeScenarioRequest(page, csrfToken, scenarioName, targetAvatar);
            const pathCheck = validateInteractionPath(scenarioName, variant, sample.path);
            warnings = collectVariantWarnings(warnings, pathCheck, sample);
            payloadReference = payloadReference ?? sample.payload;
            samples.push(normalizeSample(scenarioName, variant, sample, index + 1, measuredRepeats));
        }
    } else if (scenarioName === 'characters_all_after_chat_dirty') {
        await invokeScenarioRequest(page, csrfToken, 'characters_all_warm_repeat', targetAvatar);
        await markChatStatsDirty(page, csrfToken, targetAvatar);
        const sample = await invokeScenarioRequest(page, csrfToken, scenarioName, targetAvatar);
        const pathCheck = validateInteractionPath(scenarioName, variant, sample.path);
        warnings = collectVariantWarnings(warnings, pathCheck, sample);
        payloadReference = sample.payload;
        samples.push(normalizeSample(scenarioName, variant, sample, 1, 1));
    } else if (scenarioName === 'character_delete_refresh_ui') {
        const appPage = await context.newPage();
        attachPageDiagnostics(appPage, { consoleMessages, pageErrors });
        await appPage.goto(url.replace('/perf-harness.html', '/?emberdesk_perf_hooks=1'), { waitUntil: 'load', timeout: 120000 });
        await waitForAppReady(appPage, targetAvatar);
        await appPage.waitForTimeout(250);

        const sample = await invokeDeleteRefreshScenario(appPage, targetAvatar);
        payloadReference = sample.payload;
        samples.push(normalizeSample(scenarioName, variant, sample, 1, 1));

        await appPage.close();
    } else {
        if (!isCharacterLibraryScenario(scenarioName)) {
            throw new Error(`Unsupported scenario: ${scenarioName}`);
        }
    }

    const screenshotPath = path.join(
        screenshotRoot,
        `${scenarioName}-${variant}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await context.close();
    await browser.close();

    const finalWarnings = [
        ...warnings,
        ...pageErrors.map(error => `[${scenarioName}] ${variant}: page error: ${error.message}`),
        ...consoleMessages
            .filter(message => message.type === 'error' && !isIgnoredPerformanceConsoleError(message))
            .map(message => {
                const location = message.location ? ` (${message.location})` : '';
                return `[${scenarioName}] ${variant}: console error: ${message.text}${location}`;
            }),
    ];

    return {
        scenarioName,
        variant,
        valid: finalWarnings.length === 0,
        warnings: finalWarnings,
        payloadReference,
        payloadPath: screenshotPath,
        samples,
    };
}

function attachPageDiagnostics(page, { consoleMessages, pageErrors }) {
    page.on('console', message => {
        const location = message.location();
        consoleMessages.push({
            type: message.type(),
            text: message.text(),
            location: location?.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : null,
        });
    });
    page.on('pageerror', error => {
        pageErrors.push({
            message: error.message,
        });
    });
}

function isIgnoredPerformanceConsoleError(message) {
    const location = message.location ?? '';
    const text = message.text ?? '';
    const isSeedPersonaThumbnail404 = text.includes('Failed to load resource')
        && location.includes('/thumbnail?type=persona&file=user-default.png');
    const isTokenizerCountProbeFailure = text.includes('Failed to load resource')
        && location.includes('/api/tokenizers/openai/count?model=');

    return isSeedPersonaThumbnail404 || isTokenizerCountProbeFailure;
}

function isCharacterLibraryScenario(scenarioName) {
    return scenarioName.startsWith('character_library_');
}

function isMainChatScenario(scenarioName) {
    return scenarioName.startsWith('main_chat_');
}

function toAppUrl(harnessUrl) {
    return harnessUrl.replace('/perf-harness.html', '/?emberdesk_perf_hooks=1');
}

async function waitForAppReady(page, targetAvatar) {
    await page.waitForFunction(
        avatar => Array.isArray(globalThis.SillyTavern?.getContext?.()?.characters)
            && globalThis.SillyTavern.getContext().characters.some(item => item?.avatar === avatar),
        targetAvatar,
        { timeout: 120000 },
    );
    await page.waitForFunction(
        () => globalThis.__emberDeskStartup?.marks?.some(mark => mark?.name === 'app:ready'),
        { timeout: 120000 },
    );
}

async function getCsrfToken(page) {
    return await page.evaluate(async () => {
        const response = await fetch('/csrf-token', { credentials: 'same-origin' });
        const data = await response.json();
        return data.token;
    });
}

async function markChatStatsDirty(page, csrfToken, avatar) {
    await page.evaluate(async ({ token, targetAvatar }) => {
        const dirtyTimestamp = '2026-05-10T00:00:00.000Z';
        const response = await fetch('/api/chats/save', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
            },
            body: JSON.stringify({
                avatar_url: targetAvatar,
                file_name: 'interaction-perf-dirty',
                force: true,
                chat: [
                    {
                        user_name: 'User',
                        character_name: targetAvatar.replace(/\.png$/i, ''),
                        create_date: dirtyTimestamp,
                        chat_metadata: {
                            source: 'interaction-perf-runner',
                        },
                    },
                    {
                        name: 'User',
                        is_user: true,
                        mes: 'Dirty the chat stats for the next list read.',
                        send_date: dirtyTimestamp,
                    },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Chat dirty mutation failed with status ${response.status}`);
        }
    }, { token: csrfToken, targetAvatar: avatar });
}

async function invokeScenarioRequest(page, csrfToken, scenarioName, avatar) {
    if (scenarioName.startsWith('characters_all')) {
        return await page.evaluate(async ({ token }) => {
            const startedAt = performance.now();
            const response = await fetch('/api/characters/all', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': token,
                },
                body: JSON.stringify({}),
            });
            const browserMs = performance.now() - startedAt;
            const payload = await response.json();

            return {
                browserMs,
                path: response.headers.get('X-EmberDesk-Interaction-Path'),
                serverTiming: response.headers.get('Server-Timing'),
                payload,
            };
        }, { token: csrfToken });
    }

    if (scenarioName.startsWith('characters_get')) {
        return await page.evaluate(async ({ token, targetAvatar }) => {
            const startedAt = performance.now();
            const response = await fetch('/api/characters/get', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': token,
                },
                body: JSON.stringify({
                    avatar_url: targetAvatar,
                }),
            });
            const browserMs = performance.now() - startedAt;
            const payload = await response.json();

            return {
                browserMs,
                path: response.headers.get('X-EmberDesk-Interaction-Path'),
                serverTiming: response.headers.get('Server-Timing'),
                payload,
            };
        }, { token: csrfToken, targetAvatar: avatar });
    }

    throw new Error(`Unsupported scenario request: ${scenarioName}`);
}

async function invokeCharacterLibraryScenario(page, scenarioName) {
    if (scenarioName === 'character_library_filter_response') {
        return await invokeCharacterLibraryFilterScenario(page);
    }

    return await page.evaluate(async ({ targetScenario }) => {
        const context = globalThis.SillyTavern?.getContext?.();
        const perfHooks = globalThis.__emberDeskPerf;
        if (!context) {
            throw new Error('SillyTavern context is unavailable on the app page.');
        }
        if (!perfHooks) {
            throw new Error('EmberDesk perf hooks are unavailable on the app page.');
        }
        if (typeof perfHooks.printCharacters !== 'function') {
            throw new Error('printCharacters is unavailable on EmberDesk perf hooks.');
        }

        const listElement = document.querySelector('#rm_print_characters_block');
        if (!listElement) {
            throw new Error('Character list element is unavailable.');
        }

        const rowSelector = '.character_select,.group_select';
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const withTimeout = (promise, timeoutMs, fallbackValue = null) => Promise.race([
            Promise.resolve(promise),
            sleep(timeoutMs).then(() => fallbackValue),
        ]);
        const countRows = () => ({
            renderedCharacterCount: listElement.querySelectorAll('.character_select').length,
            renderedGroupCount: listElement.querySelectorAll('.group_select').length,
        });
        const waitForCondition = async (predicate, timeoutMs = 120000) => {
            const startedAt = performance.now();
            while (performance.now() - startedAt < timeoutMs) {
                const value = predicate();
                if (value) {
                    return value;
                }
                await sleep(25);
            }
            return null;
        };
        const waitForCharacterPageLoaded = (timeoutMs = 5000) => {
            return new Promise(resolve => {
                let settled = false;
                const listener = () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    context.eventSource.removeListener(context.eventTypes.CHARACTER_PAGE_LOADED, listener);
                    resolve(performance.now());
                };
                const timer = setTimeout(() => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    context.eventSource.removeListener(context.eventTypes.CHARACTER_PAGE_LOADED, listener);
                    resolve(null);
                }, timeoutMs);
                context.eventSource.on(context.eventTypes.CHARACTER_PAGE_LOADED, listener);
            });
        };
        const printCharactersBounded = (fullRefresh) => withTimeout(
            perfHooks.printCharacters(fullRefresh),
            10000,
            null,
        );
        const showCharacterLibrary = async () => {
            document.querySelector('#rm_button_characters')?.click();
            await nextFrame();
        };

        await showCharacterLibrary();

        if (targetScenario === 'character_library_first_interactive') {
            context.accountStorage?.setItem?.('Characters_PerPage', '1000');

            const pageLoadedPromise = waitForCharacterPageLoaded();
            listElement.replaceChildren();
            const startedAt = performance.now();
            const printPromise = printCharactersBounded(true);
            const firstItem = await waitForCondition(() => listElement.querySelector(rowSelector));
            if (!firstItem) {
                throw new Error('Timed out waiting for the first character-library row.');
            }

            const firstListItemVisibleMs = performance.now() - startedAt;
            const firstItemId = firstItem.getAttribute('data-chid');
            firstItem.click();
            const selectedFirstItem = await waitForCondition(() => {
                if (firstItem.classList.contains('is_active')) {
                    return firstItem;
                }
                if (firstItemId === null) {
                    return null;
                }
                return Array.from(listElement.querySelectorAll('.character_select.is_active'))
                    .find(row => row.getAttribute('data-chid') === firstItemId) ?? null;
            }, 5000);
            const firstListItemClickable = selectedFirstItem !== null;
            const firstListItemClickableMs = performance.now() - startedAt;

            await printPromise;
            const pageLoadedAt = await pageLoadedPromise;
            await nextFrame();
            const browserMs = performance.now() - startedAt;
            const rowCounts = countRows();

            return {
                browserMs,
                path: null,
                serverTiming: null,
                payload: {
                    ...rowCounts,
                    firstListItemClickable,
                    pageLoaded: pageLoadedAt !== null,
                    metrics: {
                        firstListItemVisibleMs,
                        firstListItemClickableMs,
                        characterPageLoadedLagMs: pageLoadedAt === null ? null : pageLoadedAt - startedAt,
                    },
                },
            };
        }

        if (targetScenario === 'character_library_pagination_scroll') {
            context.accountStorage?.setItem?.('Characters_PerPage', '10');
            listElement.style.maxHeight = '240px';
            listElement.style.overflowY = 'auto';
            await printCharactersBounded(true);
            await nextFrame();

            const requestedScrollTop = Math.min(120, Math.max(1, listElement.scrollHeight - listElement.clientHeight));
            listElement.scrollTop = requestedScrollTop;
            const beforeScrollTop = listElement.scrollTop;
            const pageLoadedPromise = waitForCharacterPageLoaded();
            const startedAt = performance.now();
            await printCharactersBounded(false);
            const pageLoadedAt = await pageLoadedPromise;
            await nextFrame();
            const afterScrollTop = listElement.scrollTop;
            const rowCounts = countRows();

            return {
                browserMs: performance.now() - startedAt,
                path: null,
                serverTiming: null,
                payload: {
                    ...rowCounts,
                    pageLoaded: pageLoadedAt !== null,
                    paginationScrollRestored: afterScrollTop === beforeScrollTop,
                    metrics: {
                        characterPageLoadedLagMs: pageLoadedAt === null ? null : pageLoadedAt - startedAt,
                        paginationScrollRestored: afterScrollTop === beforeScrollTop,
                    },
                },
            };
        }

        throw new Error(`Unsupported character-library scenario: ${targetScenario}`);
    }, { targetScenario: scenarioName });
}

async function invokeCharacterLibraryFilterScenario(page) {
    const query = 'Perf Character 1';

    return await page.evaluate(async ({ targetQuery }) => {
        const context = globalThis.SillyTavern?.getContext?.();
        const perfHooks = globalThis.__emberDeskPerf;
        if (!context) {
            throw new Error('SillyTavern context is unavailable on the app page.');
        }
        if (!perfHooks || typeof perfHooks.measureCharacterSearchForPerf !== 'function') {
            throw new Error('EmberDesk character-search perf hook is unavailable on the app page.');
        }

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const withTimeout = (promise, timeoutMs, fallbackValue = null) => Promise.race([
            Promise.resolve(promise),
            sleep(timeoutMs).then(() => fallbackValue),
        ]);
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        document.querySelector('#rm_button_characters')?.click();
        context.accountStorage?.setItem?.('Characters_PerPage', '1000');
        await withTimeout(perfHooks.printCharacters(true), 10000, null);
        await nextFrame();

        const searchForm = document.querySelector('#form_character_search_form');
        if (searchForm && globalThis.getComputedStyle(searchForm).display === 'none') {
            document.querySelector('#rm_button_search')?.click();
            await nextFrame();
        }

        return await perfHooks.measureCharacterSearchForPerf(targetQuery);
    }, { targetQuery: query });
}

async function invokeMainChatScenario(page, scenarioName, avatar, profileName) {
    return await page.evaluate(async ({ targetScenario, targetAvatar, targetProfile }) => {
        const context = globalThis.SillyTavern?.getContext?.();
        if (!context) {
            throw new Error('SillyTavern context is unavailable on the app page.');
        }

        const script = await import('/script.js');
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const waitForCondition = async (predicate, timeoutMs = 120000) => {
            const startedAt = performance.now();
            while (performance.now() - startedAt < timeoutMs) {
                const value = predicate();
                if (value) {
                    return value;
                }
                await sleep(25);
            }
            return null;
        };
        const selectTargetCharacter = async () => {
            const characterId = Array.isArray(context.characters)
                ? context.characters.findIndex(item => item?.avatar === targetAvatar)
                : -1;
            if (characterId < 0) {
                throw new Error(`Character ${targetAvatar} not found in the active character list.`);
            }
            await context.selectCharacterById(characterId, { switchMenu: false });
            const selected = await waitForCondition(() => {
                const latestContext = globalThis.SillyTavern?.getContext?.();
                return String(latestContext?.characterId) === String(characterId) ? latestContext : null;
            }, 5000);
            if (!selected) {
                throw new Error(`Timed out selecting character ${targetAvatar}.`);
            }
            normalizeActiveChatFields();
            return selected.characters[characterId]?.name ?? '';
        };
        const normalizeActiveChatFields = () => {
            const latestContext = globalThis.SillyTavern?.getContext?.() ?? context;
            latestContext.chatMetadata.system_prompt = typeof latestContext.chatMetadata.system_prompt === 'string'
                ? latestContext.chatMetadata.system_prompt
                : '';
            latestContext.chatMetadata.mes_example = typeof latestContext.chatMetadata.mes_example === 'string'
                ? latestContext.chatMetadata.mes_example
                : '';
            latestContext.chatMetadata.scenario = typeof latestContext.chatMetadata.scenario === 'string'
                ? latestContext.chatMetadata.scenario
                : '';

            const activeCharacter = latestContext.characters?.[latestContext.characterId];
            if (activeCharacter && typeof activeCharacter === 'object') {
                activeCharacter.description = typeof activeCharacter.description === 'string'
                    ? activeCharacter.description
                    : '';
                activeCharacter.personality = typeof activeCharacter.personality === 'string'
                    ? activeCharacter.personality
                    : '';
                activeCharacter.scenario = typeof activeCharacter.scenario === 'string'
                    ? activeCharacter.scenario
                    : '';
                activeCharacter.mes_example = typeof activeCharacter.mes_example === 'string'
                    ? activeCharacter.mes_example
                    : '';
                activeCharacter.first_mes = typeof activeCharacter.first_mes === 'string'
                    ? activeCharacter.first_mes
                    : '';
            }
            if (activeCharacter?.data && typeof activeCharacter.data === 'object') {
                activeCharacter.data.system_prompt = typeof activeCharacter.data.system_prompt === 'string'
                    ? activeCharacter.data.system_prompt
                    : '';
                activeCharacter.data.post_history_instructions = typeof activeCharacter.data.post_history_instructions === 'string'
                    ? activeCharacter.data.post_history_instructions
                    : '';
                activeCharacter.data.creator_notes = typeof activeCharacter.data.creator_notes === 'string'
                    ? activeCharacter.data.creator_notes
                    : '';
                activeCharacter.data.alternate_greetings = Array.isArray(activeCharacter.data.alternate_greetings)
                    ? activeCharacter.data.alternate_greetings
                    : [];
                activeCharacter.data.extensions ??= {};
                activeCharacter.data.extensions.depth_prompt ??= {};
                activeCharacter.data.extensions.depth_prompt.prompt = typeof activeCharacter.data.extensions.depth_prompt.prompt === 'string'
                    ? activeCharacter.data.extensions.depth_prompt.prompt
                    : '';
            }
        };
        const openMainChat = async ({ truncation = null } = {}) => {
            if (truncation !== null) {
                context.powerUserSettings.chat_truncation = truncation;
            }
            const startedAt = performance.now();
            await context.openCharacterChat('Session 1');
            normalizeActiveChatFields();
            const firstReadable = await waitForCondition(() => {
                return Array.from(document.querySelectorAll('#chat > .mes[mesid] .mes_text'))
                    .find(element => element.textContent.trim().length > 0) ?? null;
            }, 30000);
            if (!firstReadable) {
                throw new Error('Timed out waiting for a readable main-chat message.');
            }
            await nextFrame();
            return performance.now() - startedAt;
        };
        const rowStats = () => {
            const rows = Array.from(document.querySelectorAll('#chat > .mes[mesid]'));
            const firstRow = rows[0] ?? null;
            const lastRow = rows[rows.length - 1] ?? null;
            return {
                renderedMessageCount: rows.length,
                firstMesid: Number(firstRow?.getAttribute('mesid') ?? 0),
                lastMesid: Number(lastRow?.getAttribute('mesid') ?? 0),
                firstReadableMessageText: firstRow?.querySelector('.mes_text')?.textContent?.trim() ?? '',
            };
        };
        const basePayload = (characterName, extra = {}) => ({
            characterName,
            profile: targetProfile,
            messageCount: Array.isArray(context.chat) ? context.chat.length : 0,
            ...rowStats(),
            localEchoPresent: false,
            firstTokenPresent: false,
            finalTextPresent: false,
            stopRestoredUsable: false,
            loadMoreBeforeMesid: 0,
            loadMoreAfterMesid: 0,
            ...extra,
        });
        const installStreamingStub = ({ chunks, delayMs = 40, keepOpenAfterChunks = false }) => {
            globalThis.__emberdeskPerfOriginalFetch ??= globalThis.fetch.bind(globalThis);
            globalThis.__emberdeskPerfAbortCount = 0;
            globalThis.fetch = async (input, init = {}) => {
                const url = typeof input === 'string' ? input : input.url;
                if (!String(url).endsWith('/api/backends/chat-completions/generate')) {
                    return globalThis.__emberdeskPerfOriginalFetch(input, init);
                }

                const encoder = new TextEncoder();
                const body = new ReadableStream({
                    async start(controller) {
                        const abort = () => {
                            globalThis.__emberdeskPerfAbortCount += 1;
                            try {
                                controller.error(new DOMException('Aborted', 'AbortError'));
                            } catch {
                                // The stream may already be closed.
                            }
                        };

                        init.signal?.addEventListener('abort', abort, { once: true });
                        try {
                            for (const chunk of chunks) {
                                if (init.signal?.aborted) {
                                    abort();
                                    return;
                                }
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                    choices: [{
                                        index: 0,
                                        delta: { content: chunk },
                                        finish_reason: null,
                                    }],
                                })}\n\n`));
                                await sleep(delayMs);
                            }

                            if (keepOpenAfterChunks) {
                                await new Promise(resolve => {
                                    if (init.signal?.aborted) {
                                        resolve();
                                        return;
                                    }
                                    init.signal?.addEventListener('abort', resolve, { once: true });
                                });
                                return;
                            }

                            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                            controller.close();
                        } finally {
                            init.signal?.removeEventListener('abort', abort);
                        }
                    },
                });

                return new Response(body, {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' },
                });
            };
        };
        const enableOpenAiStreaming = () => {
            context.powerUserSettings.stream_fade_in = false;
            context.powerUserSettings.streaming_fps = 60;
            context.chatCompletionSettings.chat_completion_source = 'openai';
            context.chatCompletionSettings.openai_model = 'gpt-4o-mini';
            context.chatCompletionSettings.stream_openai = true;
            context.chatCompletionSettings.n = 1;
            context.chatCompletionSettings.send_if_empty = '';
            script.changeMainAPI('openai');
            script.setOnlineStatus('Valid');
            script.activateSendButtons();
        };
        const assertGenerationFieldsAreStrings = () => {
            const latestContext = globalThis.SillyTavern?.getContext?.() ?? context;
            const activeCharacter = latestContext.characters?.[latestContext.characterId];
            const types = {
                chatMetadataSystemPrompt: typeof latestContext.chatMetadata?.system_prompt,
                characterSystemPrompt: typeof activeCharacter?.data?.system_prompt,
                characterPostHistoryInstructions: typeof activeCharacter?.data?.post_history_instructions,
                characterCreatorNotes: typeof activeCharacter?.data?.creator_notes,
                characterMesExample: typeof activeCharacter?.mes_example,
                characterScenario: typeof activeCharacter?.scenario,
            };
            try {
                script.getCharacterCardFields();
            } catch (error) {
                throw new Error(`Main-chat perf generation field check failed: ${JSON.stringify(types)}: ${error?.message ?? error}`);
            }
        };
        const startGeneration = (prompt) => {
            normalizeActiveChatFields();
            assertGenerationFieldsAreStrings();
            const textarea = document.querySelector('#send_textarea');
            textarea.value = prompt;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return context.generate('normal', { automatic_trigger: false });
        };
        const waitForGenerationToSettle = async (generation, timeoutMs = 5000) => {
            try {
                await Promise.race([
                    generation,
                    sleep(timeoutMs).then(() => {
                        throw new Error(`Generation did not settle within ${timeoutMs}ms.`);
                    }),
                ]);
            } catch (error) {
                const message = String(error?.message ?? error);
                if (!message.includes('Generation was aborted')) {
                    throw error;
                }
            }
        };

        const characterName = await selectTargetCharacter();

        if (targetScenario === 'main_chat_warm_open_first_readable') {
            const firstReadableMessageMs = await openMainChat();
            return {
                browserMs: firstReadableMessageMs,
                path: null,
                serverTiming: null,
                payload: basePayload(characterName, {
                    metrics: { firstReadableMessageMs },
                }),
            };
        }

        if (targetScenario === 'main_chat_send_local_echo') {
            await openMainChat();
            const startedAt = performance.now();
            const message = await script.sendMessageAsUser(`Perf local echo ${Date.now()}.`, '', null, false);
            const localEcho = await waitForCondition(() => {
                const lastRow = document.querySelector('#chat > .mes[is_user="true"][mesid]:last-of-type .mes_text');
                return lastRow?.textContent?.includes(message.mes) ? lastRow : null;
            }, 5000);
            await nextFrame();
            const sendToLocalEchoMs = performance.now() - startedAt;

            return {
                browserMs: sendToLocalEchoMs,
                path: null,
                serverTiming: null,
                payload: basePayload(characterName, {
                    localEchoPresent: Boolean(localEcho),
                    metrics: { sendToLocalEchoMs },
                }),
            };
        }

        if (targetScenario === 'main_chat_stream_first_token') {
            await openMainChat();
            installStreamingStub({ chunks: ['Perf streamed ', 'final.'], delayMs: 35 });
            enableOpenAiStreaming();
            const startedAt = performance.now();
            const generation = startGeneration('Measure first streamed token.');
            const firstTokenElement = await waitForCondition(() => {
                return Array.from(document.querySelectorAll('#chat > .mes[is_user="false"][is_system="false"][mesid] .mes_text'))
                    .find(element => element.textContent.includes('Perf streamed')) ?? null;
            }, 10000);
            const firstTokenMs = performance.now() - startedAt;
            await generation;
            await nextFrame();

            return {
                browserMs: firstTokenMs,
                path: null,
                serverTiming: null,
                payload: basePayload(characterName, {
                    firstTokenPresent: Boolean(firstTokenElement),
                    finalTextPresent: document.querySelector('#chat')?.textContent?.includes('Perf streamed final.') ?? false,
                    metrics: { firstTokenMs },
                }),
            };
        }

        if (targetScenario === 'main_chat_stream_stop_to_usable') {
            await openMainChat();
            installStreamingStub({ chunks: ['Perf stopped partial.'], delayMs: 80, keepOpenAfterChunks: true });
            enableOpenAiStreaming();
            const generation = startGeneration('Measure stream stop recovery.');
            const stopButton = await waitForCondition(() => {
                const button = document.querySelector('#mes_stop');
                return button && globalThis.getComputedStyle(button).display !== 'none' ? button : null;
            }, 5000);
            if (!stopButton) {
                throw new Error('Timed out waiting for the Abort request button.');
            }
            const stopStartedAt = performance.now();
            stopButton.click();
            await waitForGenerationToSettle(generation);
            const stopped = await waitForCondition(() => document.body.getAttribute('data-generating') !== 'true', 5000);
            if (!stopped) {
                throw new Error('Timed out waiting for generating state to clear after stop.');
            }
            const textarea = document.querySelector('#send_textarea');
            const composerUsable = textarea instanceof HTMLTextAreaElement
                && textarea.disabled === false
                && document.body.getAttribute('data-generating') !== 'true';
            if (composerUsable) {
                textarea.value = 'Perf follow-up after stop.';
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.focus();
            }
            await nextFrame();
            const streamStopToUsableMs = performance.now() - stopStartedAt;

            return {
                browserMs: streamStopToUsableMs,
                path: null,
                serverTiming: null,
                payload: basePayload(characterName, {
                    stopRestoredUsable: composerUsable,
                    metrics: { streamStopToUsableMs },
                }),
            };
        }

        if (targetScenario === 'main_chat_long_load_more') {
            await openMainChat({ truncation: 25 });
            const beforeStats = rowStats();
            const showMoreButton = document.querySelector('#show_more_messages');
            if (!showMoreButton) {
                throw new Error('Long-chat load-more button is unavailable.');
            }
            const startedAt = performance.now();
            await script.showMoreMessages();
            await waitForCondition(() => {
                const currentStats = rowStats();
                return currentStats.firstMesid < beforeStats.firstMesid ? currentStats : null;
            }, 10000);
            await nextFrame();
            const loadMoreToStableMs = performance.now() - startedAt;
            const afterStats = rowStats();

            return {
                browserMs: loadMoreToStableMs,
                path: null,
                serverTiming: null,
                payload: basePayload(characterName, {
                    ...afterStats,
                    loadMoreBeforeMesid: beforeStats.firstMesid,
                    loadMoreAfterMesid: afterStats.firstMesid,
                    metrics: { loadMoreToStableMs },
                }),
            };
        }

        throw new Error(`Unsupported main-chat scenario: ${targetScenario}`);
    }, { targetScenario: scenarioName, targetAvatar: avatar, targetProfile: profileName });
}

async function invokeDeleteRefreshScenario(page, avatar) {
    return await page.evaluate(async ({ targetAvatar }) => {
        const context = globalThis.SillyTavern?.getContext?.();
        const perfHooks = globalThis.__emberDeskPerf;
        if (!context) {
            throw new Error('SillyTavern context is unavailable on the app page.');
        }
        if (!perfHooks) {
            throw new Error('EmberDesk perf hooks are unavailable on the app page.');
        }

        const targetCharacter = Array.isArray(context.characters)
            ? context.characters.find(item => item?.avatar === targetAvatar)
            : null;
        if (!targetCharacter) {
            throw new Error(`Character ${targetAvatar} not found in the active character list.`);
        }

        const accountStorage = context.accountStorage;
        accountStorage?.setItem?.('Characters_PerPage', '1000');

        const pageLoadedEvents = [];
        const pageLoadedListener = () => {
            pageLoadedEvents.push(performance.now());
        };
        context.eventSource.on(context.eventTypes.CHARACTER_PAGE_LOADED, pageLoadedListener);

        perfHooks.interactionTrace = {
            metrics: {
                preDeleteChatLookupMs: null,
                deleteRequestMs: null,
                groupsRefreshMs: null,
                characterPrintMs: null,
                deleteFlowMs: null,
                removeCharacterFromUIMs: null,
            },
        };

        const deleteCharacter = perfHooks.deleteCharacter;
        if (typeof deleteCharacter !== 'function') {
            throw new Error('deleteCharacter is unavailable on globalThis.');
        }

        const characterCountBefore = Array.isArray(context.characters) ? context.characters.length : 0;
        const groupCountBefore = Array.isArray(context.groups) ? context.groups.length : 0;
        const startedAt = performance.now();

        try {
            const deleted = await deleteCharacter(targetAvatar, { deleteChats: true });
            if (!deleted) {
                throw new Error(`deleteCharacter(${targetAvatar}) returned false.`);
            }
        } finally {
            context.eventSource.removeListener(context.eventTypes.CHARACTER_PAGE_LOADED, pageLoadedListener);
        }

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const browserMs = performance.now() - startedAt;
        const traceMetrics = perfHooks.interactionTrace?.metrics ?? {};
        const listElement = document.querySelector('#rm_print_characters_block');
        const renderedCharacterCount = listElement ? listElement.querySelectorAll('.character_select').length : 0;
        const renderedGroupCount = listElement ? listElement.querySelectorAll('.group_select').length : 0;
        const lastCharacterPageLoadedAt = pageLoadedEvents.length ? pageLoadedEvents[pageLoadedEvents.length - 1] : null;
        perfHooks.interactionTrace = null;

        return {
            browserMs,
            path: null,
            serverTiming: null,
            payload: {
                deletedAvatar: targetAvatar,
                characterCountBefore,
                characterCountAfter: Array.isArray(context.characters) ? context.characters.length : 0,
                groupCountBefore,
                groupCountAfter: Array.isArray(context.groups) ? context.groups.length : 0,
                renderedCharacterCount,
                renderedGroupCount,
                metrics: {
                    deleteFlowMs: traceMetrics.deleteFlowMs ?? browserMs,
                    deleteRequestMs: traceMetrics.deleteRequestMs,
                    preDeleteChatLookupMs: traceMetrics.preDeleteChatLookupMs,
                    groupsRefreshMs: traceMetrics.groupsRefreshMs,
                    characterPrintMs: traceMetrics.characterPrintMs,
                    removeCharacterFromUIMs: traceMetrics.removeCharacterFromUIMs,
                    characterPageLoadedLagMs: lastCharacterPageLoadedAt === null
                        ? null
                        : lastCharacterPageLoadedAt - startedAt,
                },
            },
        };
    }, { targetAvatar: avatar });
}

function collectVariantWarnings(existingWarnings, pathCheck, sample) {
    const warnings = [...existingWarnings];
    if (!pathCheck.matches) {
        warnings.push(`Observed path ${sample.path ?? 'null'} but expected ${pathCheck.expectedPath ?? 'n/a'}`);
    }

    if (sample.serverTiming !== null && (typeof sample.serverTiming !== 'string' || !sample.serverTiming.includes('route;dur='))) {
        warnings.push('Missing or malformed Server-Timing header');
    }

    return warnings;
}

function collectCharacterLibraryWarnings(existingWarnings, scenarioName, variant, sample) {
    const warnings = [...existingWarnings];
    const payload = sample.payload ?? {};

    if (!payload.pageLoaded) {
        warnings.push(`[${scenarioName}] ${variant}: CHARACTER_PAGE_LOADED was not observed`);
    }

    if (scenarioName === 'character_library_first_interactive' && !payload.firstListItemClickable) {
        warnings.push(`[${scenarioName}] ${variant}: first character-library row did not receive a click`);
    }

    if (scenarioName === 'character_library_filter_response' && !payload.busyCleared) {
        warnings.push(`[${scenarioName}] ${variant}: character search aria-busy did not clear`);
    }

    if (scenarioName === 'character_library_pagination_scroll' && payload.paginationScrollRestored !== true) {
        warnings.push(`[${scenarioName}] ${variant}: character-list scrollTop was not restored`);
    }

    return warnings;
}

function collectMainChatWarnings(existingWarnings, scenarioName, variant, sample) {
    const warnings = [...existingWarnings];
    const payload = sample.payload ?? {};

    if (!payload.firstReadableMessageText) {
        warnings.push(`[${scenarioName}] ${variant}: first readable message text was empty`);
    }

    if (scenarioName === 'main_chat_send_local_echo' && !payload.localEchoPresent) {
        warnings.push(`[${scenarioName}] ${variant}: local echo message did not render`);
    }

    if (scenarioName === 'main_chat_stream_first_token' && !payload.firstTokenPresent) {
        warnings.push(`[${scenarioName}] ${variant}: first streamed token did not render`);
    }

    if (scenarioName === 'main_chat_stream_first_token' && typeof payload.metrics?.firstTokenMs !== 'number') {
        warnings.push(`[${scenarioName}] ${variant}: first streamed token timing was not recorded`);
    }

    if (scenarioName === 'main_chat_stream_stop_to_usable' && !payload.stopRestoredUsable) {
        warnings.push(`[${scenarioName}] ${variant}: stop did not restore a usable composer`);
    }

    if (scenarioName === 'main_chat_long_load_more' && !(payload.loadMoreAfterMesid < payload.loadMoreBeforeMesid)) {
        warnings.push(`[${scenarioName}] ${variant}: load-more did not expose older messages`);
    }

    return warnings;
}

function normalizeSample(scenarioName, variant, sample, sampleIndex, sampleCount) {
    const metrics = sample.payload?.metrics ?? {};

    return {
        scenario: scenarioName,
        variant,
        sampleIndex,
        sampleCount,
        path: sample.path ?? null,
        timing: {
            browserMs: round(sample.browserMs),
            serverRouteMs: parseServerTiming(sample.serverTiming),
            deleteFlowMs: round(sample.payload?.metrics?.deleteFlowMs),
            deleteRequestMs: round(sample.payload?.metrics?.deleteRequestMs),
            preDeleteChatLookupMs: round(sample.payload?.metrics?.preDeleteChatLookupMs),
            groupsRefreshMs: round(sample.payload?.metrics?.groupsRefreshMs),
            characterPrintMs: round(sample.payload?.metrics?.characterPrintMs),
            characterPageLoadedLagMs: round(metrics.characterPageLoadedLagMs),
            firstListItemVisibleMs: round(metrics.firstListItemVisibleMs),
            firstListItemClickableMs: round(metrics.firstListItemClickableMs),
            filterInputToPageLoadedMs: round(metrics.filterInputToPageLoadedMs),
            filterInputToBusyClearMs: round(metrics.filterInputToBusyClearMs),
            firstReadableMessageMs: round(metrics.firstReadableMessageMs),
            sendToLocalEchoMs: round(metrics.sendToLocalEchoMs),
            firstTokenMs: round(metrics.firstTokenMs),
            streamStopToUsableMs: round(metrics.streamStopToUsableMs),
            loadMoreToStableMs: round(metrics.loadMoreToStableMs),
            paginationScrollRestored: typeof metrics.paginationScrollRestored === 'boolean'
                ? metrics.paginationScrollRestored
                : null,
        },
        payloadSummary: summarizeScenarioPayload(scenarioName, sample.payload),
    };
}

function parseServerTiming(headerValue) {
    if (typeof headerValue !== 'string') {
        return null;
    }

    const match = /route;dur=([0-9.]+)/i.exec(headerValue);
    return match ? round(Number(match[1])) : null;
}

function resolveScenarios(selection) {
    if (selection === 'suite') {
        return [
            'characters_all_first_build',
            'characters_all_warm_repeat',
            'characters_get_warm_repeat',
            'characters_all_after_chat_dirty',
            'character_delete_refresh_ui',
            'character_library_first_interactive',
            'character_library_filter_response',
            'character_library_pagination_scroll',
            'main_chat_warm_open_first_readable',
            'main_chat_send_local_echo',
            'main_chat_stream_first_token',
            'main_chat_stream_stop_to_usable',
            'main_chat_long_load_more',
        ];
    }

    if (selection === 'main_chat') {
        return [
            'main_chat_warm_open_first_readable',
            'main_chat_send_local_echo',
            'main_chat_stream_first_token',
            'main_chat_stream_stop_to_usable',
            'main_chat_long_load_more',
        ];
    }

    return [selection];
}

function chooseTargetAvatar(variantRoot) {
    const charactersRoot = path.join(variantRoot, DEFAULT_USER.handle, 'characters');
    const avatars = fs.readdirSync(charactersRoot)
        .filter(file => file.endsWith('.png'))
        .sort((left, right) => left.localeCompare(right));

    return avatars[Math.min(avatars.length - 1, 4)] ?? avatars[0] ?? null;
}

function parseCliOptions(args) {
    const options = {};

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (arg === '--profile') {
            options.profile = args[index + 1] ?? '';
            index++;
            continue;
        }

        if (arg === '--scenario') {
            options.scenario = args[index + 1] ?? '';
            index++;
            continue;
        }

        if (arg === '--repeats') {
            options.repeats = Number(args[index + 1] ?? 0);
            index++;
            continue;
        }

        if (arg === '--pairs') {
            options.pairs = Number(args[index + 1] ?? 0);
            index++;
            continue;
        }

        if (arg === '--variant') {
            options.variant = args[index + 1] ?? '';
            index++;
            continue;
        }

        if (arg === '--list-scenarios') {
            options.listScenarios = true;
        }
    }

    return options;
}

async function writeConfig(configPath, dataRoot, port) {
    const config = [
        `dataRoot: ${normalizePathForYaml(dataRoot)}`,
        'listen: false',
        `port: ${port}`,
        'browserLaunch:',
        '  enabled: false',
        'whitelistMode: false',
        'enableUserAccounts: false',
        'extensions:',
        '  enabled: false',
        '  autoUpdate: false',
        'skipContentCheck: true',
        'logging:',
        '  minLogLevel: 0',
    ].join('\n');

    fs.writeFileSync(configPath, `${config}\n`, 'utf8');
}

async function seedSettings(dataRoot) {
    const sourcePath = path.join(repoRoot, 'default', 'content', SETTINGS_FILE);
    const targetPath = path.join(dataRoot, DEFAULT_USER.handle, SETTINGS_FILE);
    const settings = JSON.parse(await fs.promises.readFile(sourcePath, 'utf8'));
    settings.firstRun = false;

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, `${JSON.stringify(settings, null, 4)}\n`, 'utf8');
}

function normalizePathForYaml(targetPath) {
    return JSON.stringify(targetPath.replace(/\\/g, '/'));
}

function startServer({ configPath, dataRoot, port, env }) {
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
                return;
            }
        } catch {
            // Retry until timeout.
        }

        await delay(250);
    }

    throw new Error(`Timed out waiting for server.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
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

async function cloneDirectory(source, target) {
    await fs.promises.rm(target, { recursive: true, force: true });
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.cp(source, target, {
        recursive: true,
        preserveTimestamps: true,
    });
}

function renderMarkdownReport(report) {
    const scenarioLines = report.scenarios.map(scenario => {
        const browserDelta = scenario.comparison.delta.browserMsMedian;
        const serverDelta = scenario.comparison.delta.serverRouteMsMedian;
        const hasOffVariant = scenario.comparison.sqliteOff.sampleCount > 0;
        const extraLines = scenario.scenario === 'character_delete_refresh_ui'
            ? [
                `- Delete flow median: ${scenario.comparison.sqliteOn.deleteFlowMs.median ?? 'n/a'} ms`,
                `- Delete request median: ${scenario.comparison.sqliteOn.deleteRequestMs.median ?? 'n/a'} ms`,
                `- Pre-delete chat lookup median: ${scenario.comparison.sqliteOn.preDeleteChatLookupMs.median ?? 'n/a'} ms`,
                `- Groups refresh median: ${scenario.comparison.sqliteOn.groupsRefreshMs.median ?? 'n/a'} ms`,
                `- Character print median: ${scenario.comparison.sqliteOn.characterPrintMs.median ?? 'n/a'} ms`,
            ]
            : scenario.scenario.startsWith('character_library_')
                ? buildCharacterLibraryMetricLines(scenario.comparison.sqliteOn)
            : scenario.scenario.startsWith('main_chat_')
                ? buildMainChatMetricLines(scenario.comparison.sqliteOn)
            : [];

        return [
            `## ${scenario.scenario}`,
            '',
            `- Valid pairs: ${scenario.validPairCount}/${scenario.pairCount}`,
            `- SQLite on browser median: ${scenario.comparison.sqliteOn.browserMs.median ?? 'n/a'} ms`,
            `- SQLite off browser median: ${hasOffVariant ? scenario.comparison.sqliteOff.browserMs.median ?? 'n/a' : 'n/a'} ms`,
            `- Browser median delta: ${hasOffVariant ? formatDelta(browserDelta) : 'n/a'}`,
            `- SQLite on server median: ${scenario.comparison.sqliteOn.serverRouteMs.median ?? 'n/a'} ms`,
            `- SQLite off server median: ${hasOffVariant ? scenario.comparison.sqliteOff.serverRouteMs.median ?? 'n/a' : 'n/a'} ms`,
            `- Server median delta: ${hasOffVariant ? formatDelta(serverDelta) : 'n/a'}`,
            ...extraLines,
            ...(scenario.warnings.length ? ['', 'Warnings:', ...scenario.warnings.map(warning => `- ${warning}`)] : []),
            '',
        ].join('\n');
    }).join('\n');

    return [
        '# Interaction Performance Report',
        '',
        `- Generated at: ${report.generatedAt}`,
        `- Profile: ${report.profile}`,
        `- Pair count: ${report.pairCount}`,
        `- Measured repeats: ${report.measuredRepeats}`,
        `- JSON: ${reportPath}`,
        `- Samples: ${samplesPath}`,
        '',
        scenarioLines,
    ].join('\n');
}

function buildCharacterLibraryMetricLines(summary) {
    return [
        `- First list item visible median: ${summary.firstListItemVisibleMs.median ?? 'n/a'} ms`,
        `- First list item clickable median: ${summary.firstListItemClickableMs.median ?? 'n/a'} ms`,
        `- Character page loaded lag median: ${summary.characterPageLoadedLagMs.median ?? 'n/a'} ms`,
        `- Filter input to page loaded median: ${summary.filterInputToPageLoadedMs.median ?? 'n/a'} ms`,
        `- Filter input to busy clear median: ${summary.filterInputToBusyClearMs.median ?? 'n/a'} ms`,
        `- Pagination scroll restored: ${formatBooleanSummary(summary.paginationScrollRestored)}`,
    ];
}

function buildMainChatMetricLines(summary) {
    return [
        `- First readable message median: ${summary.firstReadableMessageMs.median ?? 'n/a'} ms`,
        `- Send to local echo median: ${summary.sendToLocalEchoMs.median ?? 'n/a'} ms`,
        `- First streamed token median: ${summary.firstTokenMs.median ?? 'n/a'} ms`,
        `- Stream stop to usable median: ${summary.streamStopToUsableMs.median ?? 'n/a'} ms`,
        `- Long-chat load-more to stable median: ${summary.loadMoreToStableMs.median ?? 'n/a'} ms`,
    ];
}

function formatBooleanSummary(summary) {
    if (!summary || summary.sampleCount === 0) {
        return 'n/a';
    }

    return `${summary.trueCount}/${summary.sampleCount} true`;
}

function formatDelta(delta) {
    if (!delta) {
        return 'n/a';
    }

    const relative = delta.relativePct === null ? 'n/a' : `${delta.relativePct}%`;
    return `${delta.absoluteMs} ms (${relative})`;
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
