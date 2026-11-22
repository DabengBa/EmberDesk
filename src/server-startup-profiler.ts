import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

/**
 * Creates an optional startup profiler that records server boot stages when an
 * output path is provided. When disabled, wrappers are effectively no-ops.
 *
 * @param {string | undefined} outputPath File path for the emitted JSON profile
 * @returns {object} Startup profiler API
 */
export function createServerStartupProfiler(outputPath: string | undefined) {
    const enabled = typeof outputPath === 'string' && outputPath.length > 0;
    const startedAtPerfMs = performance.now();
    const startedAtEpochMs = Date.now();
    const stages: object[] = [];
    const events: object[] = [];

    function recordStage(name: string, startTimeMs: number, endTimeMs: number, error: { message: string; stack: string | null } | null = null) {
        if (!enabled) {
            return;
        }

        stages.push({
            name,
            startTimeMs: roundTime(startTimeMs - startedAtPerfMs),
            endTimeMs: roundTime(endTimeMs - startedAtPerfMs),
            durationMs: roundTime(endTimeMs - startTimeMs),
            error,
        });
    }

    async function measure<T>(name: string, fn: () => T | PromiseLike<T>): Promise<Awaited<T>> {
        const startTimeMs = performance.now();

        try {
            const result = await fn();
            recordStage(name, startTimeMs, performance.now());
            return result;
        } catch (error) {
            recordStage(name, startTimeMs, performance.now(), serializeStartupError(error));
            throw error;
        }
    }

    function mark(name: string, details: object = {}) {
        if (!enabled) {
            return;
        }

        events.push({
            name,
            timeMs: roundTime(performance.now() - startedAtPerfMs),
            ...details,
        });
    }

    function flush(extra: object = {}) {
        if (!enabled) {
            return;
        }

        fs.mkdirSync(path.dirname(outputPath!), { recursive: true });
        fs.writeFileSync(outputPath!, JSON.stringify({
            startedAtIso: new Date(startedAtEpochMs).toISOString(),
            totalDurationMs: roundTime(performance.now() - startedAtPerfMs),
            stages,
            events,
            ...extra,
        }, null, 2), 'utf8');
    }

    return {
        enabled,
        measure,
        mark,
        flush,
    };
}

function roundTime(value: number) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.round(value * 100) / 100;
}

function serializeStartupError(error: unknown) {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack ?? null,
        };
    }

    return {
        message: String((error as { message?: unknown } | null | undefined)?.message ?? error),
        stack: null,
    };
}
