export function resolveStartupSettingsPlan({ data, currentVersion = null }) {
    const hasSettings = data?.result != 'file not find' && !!data?.settings;
    const settings = hasSettings ? normalizeSettingsPayload(data.settings) : null;
    const savedVersion = settings?.currentVersion ?? null;
    const extensionsEnabled = Boolean(hasSettings && data?.enable_extensions);

    return {
        hasSettings,
        settings,
        firstRun: Boolean(settings?.firstRun),
        extensionPlan: {
            shouldLoadDeferred: extensionsEnabled,
            enableAutoUpdate: Boolean(extensionsEnabled && data?.enable_extensions_auto_update),
            isVersionChanged: savedVersion !== null && currentVersion !== null ? savedVersion !== currentVersion : false,
            savedVersion,
            disableUi: Boolean(hasSettings && !extensionsEnabled),
        },
    };
}

function normalizeSettingsPayload(settings) {
    if (typeof settings === 'string') {
        return JSON.parse(settings);
    }

    return structuredClone(settings ?? {});
}

export function createSingleFlightTask(task) {
    let inFlight = null;
    let complete = false;
    let lastValue;
    let rerunAfterCurrent = false;
    let pendingRefreshPromise = null;
    let resolvePendingRefresh;
    let rejectPendingRefresh;

    function clearPendingRefresh() {
        pendingRefreshPromise = null;
        resolvePendingRefresh = null;
        rejectPendingRefresh = null;
    }

    function scheduleQueuedRefresh() {
        if (!rerunAfterCurrent) {
            return;
        }

        const queuedResolve = resolvePendingRefresh;
        const queuedReject = rejectPendingRefresh;
        rerunAfterCurrent = false;
        clearPendingRefresh();

        const rerunPromise = startRun();
        rerunPromise.then(queuedResolve, queuedReject);
    }

    function startRun() {
        inFlight = Promise.resolve()
            .then(() => task())
            .then((value) => {
                complete = true;
                lastValue = value;
                return value;
            })
            .catch((error) => {
                complete = false;
                throw error;
            })
            .finally(() => {
                inFlight = null;
                scheduleQueuedRefresh();
            });

        return inFlight;
    }

    function run(force = false) {
        if (!force) {
            if (inFlight) {
                return inFlight;
            }

            if (complete) {
                return Promise.resolve(lastValue);
            }
        } else if (inFlight) {
            rerunAfterCurrent = true;
            if (!pendingRefreshPromise) {
                pendingRefreshPromise = new Promise((resolve, reject) => {
                    resolvePendingRefresh = resolve;
                    rejectPendingRefresh = reject;
                });
            }

            return pendingRefreshPromise;
        }

        return startRun();
    }

    return {
        ensure() {
            return run(false);
        },
        refresh() {
            return run(true);
        },
        reset() {
            complete = false;
            lastValue = undefined;
        },
        isPending() {
            return inFlight !== null;
        },
        isComplete() {
            return complete;
        },
    };
}

export function resolvePersistedCurrentVersion({ currentVersion, settingsVersion = null }) {
    if (isPersistableCurrentVersion(currentVersion)) {
        return currentVersion;
    }

    if (isPersistableCurrentVersion(settingsVersion)) {
        return settingsVersion;
    }

    return null;
}

function isPersistableCurrentVersion(version) {
    return typeof version === 'string' && version.length > 0 && version !== '0.0.0';
}

export function parseTransitionDurationMs(transitionDuration) {
    if (typeof transitionDuration !== 'string' || transitionDuration.length === 0) {
        return 0;
    }

    return transitionDuration
        .split(',')
        .map(part => part.trim())
        .reduce((maxDuration, part) => {
            if (part.endsWith('ms')) {
                return Math.max(maxDuration, Number.parseFloat(part) || 0);
            }

            if (part.endsWith('s')) {
                return Math.max(maxDuration, (Number.parseFloat(part) || 0) * 1000);
            }

            return maxDuration;
        }, 0);
}

export function shouldAnimateOverlayHide({ transitionDuration, immediate = false }) {
    if (immediate) {
        return false;
    }

    return parseTransitionDurationMs(transitionDuration) > 0;
}
