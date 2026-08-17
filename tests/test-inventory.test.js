import { describe, expect, test } from '@jest/globals';
import {
    buildInventoryReport,
    classifyTestSource,
    parsePlaywrightListOutput,
    renderInventoryMarkdown,
} from '../scripts/test-inventory.mjs';

describe('test inventory helpers', () => {
    test('classifies deterministic source as unit without external resources', () => {
        const result = classifyTestSource({
            relativePath: 'tests/util-pure.test.js',
            source: `
                import { describe, expect, test } from '@jest/globals';
                test('adds values', () => expect(1 + 1).toBe(2));
            `,
        });

        expect(result.layer).toBe('unit');
        expect(result.resources).toEqual({
            db: false,
            file: false,
            network: false,
            browser: false,
            realTime: false,
            worker: false,
        });
        expect(result.lifecycle.leakCandidates).toEqual([]);
    });

    test('classifies database and filesystem boundaries as integration', () => {
        const result = classifyTestSource({
            relativePath: 'tests/canonical-sqlite.test.js',
            source: `
                import os from 'node:os';
                import fs from 'node:fs';
                import { DatabaseSync } from 'node:sqlite';
                const database = new DatabaseSync(os.tmpdir() + '/test.sqlite');
                test('reads a row', () => {
                    expect(database.prepare('select 1').get()).toBeDefined();
                    database.close();
                });
            `,
        });

        expect(result.layer).toBe('integration');
        expect(result.resources.db).toBe(true);
        expect(result.resources.file).toBe(true);
        expect(result.isolation.sharedTempDirectory).toBe(true);
        expect(result.lifecycle.leakCandidates).toEqual([]);
    });

    test('classifies browser flows as e2e even when they also use network APIs', () => {
        const result = classifyTestSource({
            relativePath: 'tests/login.test.js',
            source: 'import { test, expect } from \'@playwright/test\';\ntest(\'logs in\', async ({ page }) => { await page.goto(\'http://127.0.0.1:8000/login\'); });',
        });

        expect(result.layer).toBe('e2e');
        expect(result.resources.browser).toBe(true);
        expect(result.resources.network).toBe(true);
    });

    test('does not use a filename suffix as the layer signal', () => {
        const result = classifyTestSource({
            relativePath: 'tests/renamed.test.js',
            source: 'test("adds values", () => expect(1 + 1).toBe(2));',
        });

        expect(result.runner).toBe('jest');
        expect(result.layer).toBe('unit');
    });

    test('parses Playwright discovery without treating it as execution', () => {
        expect(parsePlaywrightListOutput('Total: 581 tests in 24 files')).toEqual({
            tests: 581,
            testFiles: 24,
            executed: false,
        });
        expect(parsePlaywrightListOutput('not a Playwright report')).toBeNull();
    });

    test('reports global and server cleanup gaps as candidates, not failures', () => {
        const result = classifyTestSource({
            relativePath: 'tests/leaky-server.test.js',
            source: `
                process.env.TEST_MODE = '1';
                globalThis.sharedState = {};
                const server = app.listen(0);
                test('uses the server', async () => {});
            `,
        });

        expect(result.isolation.processEnvironment).toBe(true);
        expect(result.isolation.globalSingleton).toBe(true);
        expect(result.lifecycle.leakCandidates).toEqual([
            'global-reset-unverified',
            'server-close-unverified',
        ]);
    });

    test('merges Jest timings and phase reports into sorted inventory output', () => {
        const report = buildInventoryReport({
            files: [
                {
                    relativePath: 'tests/slow.test.js',
                    source: 'test("slow", () => {});',
                },
                {
                    relativePath: 'tests/fast.test.js',
                    source: 'test("fast", () => {});',
                },
                {
                    relativePath: 'tests/browser.test.js',
                    source: 'import { test } from "@playwright/test";',
                },
            ],
            jestReport: {
                startTime: 1000,
                numTotalTestSuites: 2,
                numPassedTestSuites: 2,
                numFailedTestSuites: 0,
                numTotalTests: 2,
                numPassedTests: 2,
                numFailedTests: 0,
                testResults: [
                    {
                        name: '/repo/tests/slow.test.js',
                        startTime: 1000,
                        endTime: 1800,
                        status: 'passed',
                        assertionResults: [
                            {
                                fullName: 'slow',
                                duration: 700,
                                status: 'passed',
                            },
                        ],
                    },
                    {
                        name: '/repo/tests/fast.test.js',
                        startTime: 1000,
                        endTime: 1100,
                        status: 'passed',
                        assertionResults: [
                            {
                                fullName: 'fast',
                                duration: 50,
                                status: 'passed',
                            },
                        ],
                    },
                ],
            },
            playwrightReport: {
                testFiles: 1,
                tests: 3,
                executed: false,
            },
            phaseReports: [
                {
                    testPath: '/repo/tests/slow.test.js',
                    importMs: 30,
                    setupMs: 20,
                    environmentMs: 10,
                    testsMs: 700,
                    teardownMs: 5,
                },
            ],
        });

        expect(report.summary).toMatchObject({
            testFiles: 3,
            tests: 5,
            failures: 0,
            wallMs: 800,
            executedJestFiles: 2,
            executedJestTests: 2,
            discoveredPlaywrightFiles: 1,
            discoveredPlaywrightTests: 3,
            playwrightFailures: null,
            playwrightExecution: false,
        });
        expect(report.slowestFiles[0]).toMatchObject({
            file: 'tests/slow.test.js',
            ms: 800,
        });
        expect(report.slowestTests[0]).toMatchObject({
            file: 'tests/slow.test.js',
            ms: 700,
        });
        expect(report.phases).toMatchObject({
            importMs: 30,
            setupMs: 20,
            environmentMs: 10,
            testsMs: 750,
            teardownMs: 5,
            transformMs: null,
        });
        expect(report.isolation).toEqual({
            globalSingleton: 0,
            processEnvironment: 0,
            sharedTempDirectory: 0,
        });
        expect(renderInventoryMarkdown(report)).toContain('Slowest files');
    });
});
