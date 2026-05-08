import { describe, expect, test } from '@jest/globals';

import { summarizeStartupPerformance } from '../src/performance-report.js';

describe('summarizeStartupPerformance', () => {
    test('should summarize startup phases, heavy resources, and likely causes', () => {
        const summary = summarizeStartupPerformance({
            timings: {
                serverReadyMs: 1820,
                navigationToLoadMs: 2410,
                navigationToAppReadyMs: 3890,
            },
            resources: [
                { name: 'http://127.0.0.1:8000/', type: 'document', transferSize: 742787, durationMs: 180 },
                { name: 'http://127.0.0.1:8000/script.js', type: 'script', transferSize: 507531, durationMs: 260 },
                { name: 'http://127.0.0.1:8000/style.css', type: 'css', transferSize: 150540, durationMs: 95 },
                { name: 'http://127.0.0.1:8000/lib.js', type: 'script', transferSize: 210000, durationMs: 120 },
            ],
            appStages: [
                { name: 'initSecrets', startTimeMs: 2200, endTimeMs: 2400 },
                { name: 'getSettings', startTimeMs: 2400, endTimeMs: 3050 },
                { name: 'getCharacters', startTimeMs: 3050, endTimeMs: 3520 },
            ],
            longTasks: [
                { startTimeMs: 2600, durationMs: 220 },
                { startTimeMs: 3300, durationMs: 90 },
            ],
        });

        expect(summary.totals.serverReadyMs).toBe(1820);
        expect(summary.totals.navigationToLoadMs).toBe(2410);
        expect(summary.totals.navigationToAppReadyMs).toBe(3890);
        expect(summary.totals.appInitAfterLoadMs).toBe(1480);
        expect(summary.totals.totalBlockingTimeMs).toBe(210);

        expect(summary.resources.topScripts[0]).toEqual(expect.objectContaining({
            name: 'http://127.0.0.1:8000/script.js',
            transferKb: expect.any(Number),
        }));
        expect(summary.resources.topStyles[0]).toEqual(expect.objectContaining({
            name: 'http://127.0.0.1:8000/style.css',
        }));

        expect(summary.stageBreakdown).toEqual([
            { name: 'initSecrets', durationMs: 200 },
            { name: 'getSettings', durationMs: 650 },
            { name: 'getCharacters', durationMs: 470 },
        ]);

        expect(summary.dominantBucket).toEqual(expect.objectContaining({
            bucket: 'page_load',
            durationMs: 2410,
        }));

        expect(summary.likelyCauses).toEqual(expect.arrayContaining([
            expect.stringContaining('Cold server start is significant'),
            expect.stringContaining('Browser load time is elevated'),
            expect.stringContaining('Post-load app initialization is significant'),
            expect.stringContaining('Long main-thread tasks indicate'),
        ]));
    });

    test('should tolerate missing sections and keep null timings explicit', () => {
        const summary = summarizeStartupPerformance({
            timings: {},
            resources: [],
            appStages: [],
            longTasks: [],
        });

        expect(summary.totals.serverReadyMs).toBeNull();
        expect(summary.totals.navigationToLoadMs).toBeNull();
        expect(summary.totals.navigationToAppReadyMs).toBeNull();
        expect(summary.totals.appInitAfterLoadMs).toBeNull();
        expect(summary.resources.topResources).toEqual([]);
        expect(summary.stageBreakdown).toEqual([]);
        expect(summary.dominantBucket).toBeNull();
        expect(summary.likelyCauses).toEqual([]);
    });
});
