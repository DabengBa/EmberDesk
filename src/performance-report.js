/**
 * Creates a human-readable startup performance summary from captured metrics.
 * The summary is intentionally deterministic so it can be covered by unit tests
 * and reused by CLI/browser-driven performance scripts.
 *
 * @param {object} report Raw performance report
 * @returns {object} Summary with breakdowns and likely causes
 */
export function summarizeStartupPerformance(report) {
    const timings = report?.timings ?? {};
    const navigation = report?.navigation ?? {};
    const resources = Array.isArray(report?.resources) ? report.resources : [];
    const stages = Array.isArray(report?.appStages) ? report.appStages : [];
    const longTasks = Array.isArray(report?.longTasks) ? report.longTasks : [];

    const serverReadyMs = toNumber(timings.serverReadyMs);
    const navigationToLoadMs = toNumber(timings.navigationToLoadMs);
    const navigationToAppReadyMs = toNumber(timings.navigationToAppReadyMs);
    const appInitAfterLoadMs = nonNegativeDelta(navigationToAppReadyMs, navigationToLoadMs);
    const totalBlockingTimeMs = longTasks.reduce((sum, task) => {
        const durationMs = toNumber(task.durationMs);
        return sum + Math.max(0, (durationMs ?? 0) - 50);
    }, 0);

    const scriptResources = resources.filter(resource => String(resource.type).includes('script'));
    const styleResources = resources.filter(resource => String(resource.type).includes('css') || String(resource.type).includes('stylesheet'));
    const htmlResources = resources.filter(resource => String(resource.type) === 'document');

    const topScripts = sortResourcesBySize(scriptResources).slice(0, 5);
    const topStyles = sortResourcesBySize(styleResources).slice(0, 5);
    const topResources = sortResourcesBySize(resources).slice(0, 10);

    const htmlTransferKb = bytesToKb(toNumber(navigation.transferSize) ?? htmlResources.reduce((sum, resource) => sum + toNumber(resource.transferSize), 0));
    const totalTransferKb = bytesToKb((toNumber(navigation.transferSize) ?? 0) + resources.reduce((sum, resource) => sum + toNumber(resource.transferSize), 0));
    const scriptTransferKb = bytesToKb(scriptResources.reduce((sum, resource) => sum + toNumber(resource.transferSize), 0));
    const styleTransferKb = bytesToKb(styleResources.reduce((sum, resource) => sum + toNumber(resource.transferSize), 0));

    const stageBreakdown = stages.map((stage, index) => {
        const startTime = toNumber(stage.startTimeMs);
        const endTime = toNumber(stage.endTimeMs);
        const nextStart = toNumber(stages[index + 1]?.startTimeMs);
        const durationMs = endTime !== null ? Math.max(0, endTime - startTime) : (nextStart !== null ? Math.max(0, nextStart - startTime) : null);

        return {
            name: stage.name,
            durationMs,
        };
    });

    const bottleneckCandidates = [];

    if (serverReadyMs !== null) {
        bottleneckCandidates.push({
            bucket: 'server_cold_start',
            durationMs: serverReadyMs,
            reason: 'Server startup waits for migrations, content checks, and plugin loading before listening.',
        });
    }

    if (navigationToLoadMs !== null) {
        bottleneckCandidates.push({
            bucket: 'page_load',
            durationMs: navigationToLoadMs,
            reason: 'Large initial HTML plus many blocking CSS and classic scripts delay the load event.',
        });
    }

    if (appInitAfterLoadMs !== null) {
        bottleneckCandidates.push({
            bucket: 'app_initialization',
            durationMs: appInitAfterLoadMs,
            reason: 'The app chains many awaited initialization steps after load before emitting APP_READY.',
        });
    }

    const dominantBucket = bottleneckCandidates
        .filter(candidate => candidate.durationMs !== null)
        .sort((left, right) => right.durationMs - left.durationMs)[0] ?? null;

    const likelyCauses = [];

    if (serverReadyMs !== null && serverReadyMs >= 1000) {
        likelyCauses.push('Cold server start is significant because startup blocks on pre-listen tasks, including frontend library compilation.');
    }

    if (navigationToLoadMs !== null && navigationToLoadMs >= 1500) {
        likelyCauses.push('Browser load time is elevated by a very large static document and many blocking CSS or non-module script tags.');
    }

    if (appInitAfterLoadMs !== null && appInitAfterLoadMs >= 1000) {
        likelyCauses.push('Post-load app initialization is significant because startup awaits multiple API fetches and extension/module setup before APP_READY.');
    }

    if (scriptTransferKb >= 500) {
        likelyCauses.push('Initial script transfer is heavy; large JS payloads increase parse and execute time.');
    }

    if (styleTransferKb >= 100) {
        likelyCauses.push('Initial stylesheet transfer is non-trivial and contributes to render-blocking work before load.');
    }

    if (htmlTransferKb >= 50) {
        likelyCauses.push('Initial HTML payload is non-trivial and adds discovery and parse work before scripts can bootstrap.');
    }

    if (totalBlockingTimeMs >= 200) {
        likelyCauses.push('Long main-thread tasks indicate parse/execute or synchronous DOM work is blocking responsiveness during startup.');
    }

    if (stageBreakdown.some(stage => stage.durationMs !== null && stage.durationMs >= 300)) {
        likelyCauses.push('One or more startup phases have concentrated synchronous work and should be split or deferred.');
    }

    return {
        totals: {
            serverReadyMs,
            navigationToLoadMs,
            navigationToAppReadyMs,
            appInitAfterLoadMs,
            totalTransferKb,
            scriptTransferKb,
            styleTransferKb,
            htmlTransferKb,
            totalBlockingTimeMs,
        },
        resources: {
            topResources,
            topScripts,
            topStyles,
        },
        stageBreakdown,
        dominantBucket,
        likelyCauses,
    };
}

function sortResourcesBySize(resources) {
    return resources
        .map(resource => ({
            name: resource.name,
            type: resource.type,
            transferKb: bytesToKb(toNumber(resource.transferSize) ?? 0),
            durationMs: roundNumber(toNumber(resource.durationMs)),
        }))
        .sort((left, right) => right.transferKb - left.transferKb || (right.durationMs ?? 0) - (left.durationMs ?? 0));
}

function toNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return value;
}

function bytesToKb(bytes) {
    return roundNumber(bytes / 1024);
}

function roundNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.round(value * 100) / 100;
}

function nonNegativeDelta(end, start) {
    if (end === null || start === null) {
        return null;
    }

    return roundNumber(Math.max(0, end - start));
}
