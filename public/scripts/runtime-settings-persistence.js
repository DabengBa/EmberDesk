import { equalSettingsValues as equal, settingsChanges, settingsValue, setSettingsValue } from './settings-document-changes.js';

// These are resume/version markers, not settings that the user needs to merge.
const resumeMetadata = new Set(['active_character', 'currentVersion', 'main_api']);

// Associate a synchronous strict-save invocation with its optimistic rollback.
// The wrapper restores the previous handler immediately, before any await.
let strictSaveFailureHandler;
export function withStrictSettingsSaveFailureHandler(onFailure, save) {
    const previous = strictSaveFailureHandler;
    strictSaveFailureHandler = onFailure;
    try {
        return save();
    } finally {
        strictSaveFailureHandler = previous;
    }
}

/** Runtime settings payload and guarded persistence over the existing settings owner. */
export function createRuntimeSettingsPersistence(ports) {
    // A fetched revision and what this window has actually seen are different.
    let canonical;
    let known;
    let liveBaseline;
    let pending;
    let rows = [];
    function buildRuntimeSettingsPayload() {
        const persistedCurrentVersion = ports.persistedCurrentVersion();
        return {
            accountStorage: ports.accountStorage(),
            currentVersion: persistedCurrentVersion ?? undefined,
            active_character: ports.activeCharacter(),
            amount_gen: ports.amountGen(),
            max_context: ports.maxContext(),
            main_api: ports.mainApi(),
            world_info_settings: ports.worldInfoSettings(),
            power_user: ports.powerUser(),
            feature_settings: ports.featureSettings(),
            tags: ports.tags(),
            tag_map: ports.tagMap(),
            oai_settings: ports.oaiSettings(),
            background: ports.background(),
            ...(ports.getRevision() != null ? { settings_revision: ports.getRevision() } : {}),
        };
    }

    const snapshot = () => {
        const { settings_revision: _settingsRevision, ...live } = buildRuntimeSettingsPayload();
        return JSON.parse(JSON.stringify(live));
    };

    function publish(document, revision) {
        canonical = { document: structuredClone(document), revision };
        ports.setDocument(document);
        if (revision != null) ports.setRevision(Math.max(ports.getRevision() ?? 0, revision));
    }

    function initialize(document, revision) {
        canonical = { document: structuredClone(document), revision };
        known = structuredClone(document);
        liveBaseline = snapshot();
        // AccountStorage can migrate local keys during startup and queue a save.
        liveBaseline.accountStorage = structuredClone(document.accountStorage ?? {});
    }

    function publishForm(document, revision, editedPaths, apply) {
        const before = snapshot();
        const edited = editedPaths && new Set(editedPaths.map(path => JSON.stringify(path)));
        apply(path => !edited || edited.has(JSON.stringify(path)));
        if (!known || !Number.isSafeInteger(revision)) return;
        const { settings_revision: _settingsRevision, ...saved } = document;
        publish(saved, revision);
        for (const { path, value } of settingsChanges(before, snapshot())) {
            setSettingsValue(liveBaseline, path, value);
            setSettingsValue(known, path, settingsValue(saved, path));
        }
        for (const path of editedPaths ?? []) setSettingsValue(known, path, settingsValue(saved, path));
    }

    async function writeChanges(changes, live, choices) {
        const sortSnapshot = ports.beginSnapshot(canonical.revision);
        let savedRevision;
        try {
            if (changes.length === 0 && !choices) {
                savedRevision = canonical.revision;
                return false;
            }
            let fresh = Boolean(choices);
            if (fresh) canonical = await ports.fetchLatest();
            for (let attempt = 0; attempt < 3; attempt++) {
                if (choices) {
                    live = snapshot();
                    changes = getPendingChanges(live);
                }
                const latest = canonical;
                const merged = structuredClone(latest.document);
                const conflicts = [];
                let needsChoice = false;
                const accepted = changes.map(({ id, path, value: mine }) => {
                    const saved = settingsValue(latest.document, path);
                    let value = mine;
                    if (!resumeMetadata.has(path[0]) && !equal(saved, mine) && !equal(saved, settingsValue(known, path))) {
                        conflicts.push({ id, path, mine, saved });
                        const choice = choices?.find(choice => choice.id === id && equal(choice.mine, mine) && equal(choice.saved, saved));
                        if (!choice) needsChoice = true;
                        else if (choice.use === 'saved') value = saved;
                    }
                    setSettingsValue(merged, path, value);
                    return { path, value };
                });
                if (needsChoice) {
                    pending = { changes, live };
                    rows = conflicts;
                    const notify = !ports.conflict.hasConflict();
                    ports.conflict.markConflict();
                    ports.onConflict(notify);
                    if (choices) return false;
                    throw new Error('Failed to save settings: revision conflict');
                }
                let revision = latest.revision;
                if (!equal(merged, latest.document)) {
                    const payload = { ...merged, ...(revision != null ? { settings_revision: revision } : {}) };
                    const request = await ports.compress({ method: 'POST', headers: ports.headers(), body: JSON.stringify(payload), cache: 'no-cache' });
                    const response = await ports.post(request);
                    if (response.status === 409) {
                        canonical = await ports.fetchLatest();
                        fresh = true;
                        continue;
                    }
                    if (!response.ok) throw new Error(`Failed to save settings: ${response.statusText}`);
                    const result = await response.json();
                    if (result?.result !== 'ok' || !Number.isSafeInteger(result.settings_revision) || result.settings_revision <= 0) {
                        throw new Error('Settings save response did not confirm its revision');
                    }
                    revision = result.settings_revision;
                } else if (!fresh) {
                    canonical = await ports.fetchLatest();
                    fresh = true;
                    continue;
                }
                savedRevision = revision;
                publish(merged, revision);
                if (choices) {
                    const current = snapshot();
                    const update = accepted.filter(({ path, value }) => equal(settingsValue(current, path), settingsValue(live, path))
                        && !equal(value, settingsValue(current, path)));
                    ports.applyResolution(update);
                    const applied = snapshot();
                    for (const { path } of update) setSettingsValue(live, path, settingsValue(applied, path));
                }
                for (const { path, value } of accepted) {
                    setSettingsValue(known, path, value);
                    setSettingsValue(liveBaseline, path, settingsValue(live, path));
                }
                if (choices) {
                    pending = undefined;
                    rows = [];
                    ports.conflict.clearConflict();
                    ports.onConflict(false);
                }
                return true;
            }
            throw new Error('Failed to save settings: revision conflict; try again');
        } finally {
            ports.finishSnapshot(sortSnapshot, savedRevision);
        }
    }

    async function saveSettingsCore(loopCounter = 0, options) {
        const strict = options?.strict === true;
        if (ports.conflict.hasConflict()) {
            if (strict) ports.conflict.assertWritable();
            return;
        }
        if (!ports.isReady()) {
            console.warn('Settings not ready, scheduling another save');
            ports.schedule();
            if (strict) throw new Error('Settings save is queued: settings not ready');
            return;
        }
        const MAX_RETRIES = 3;
        if (ports.isResponseCustomized()) {
            if (loopCounter < MAX_RETRIES) {
                console.warn('Response length is currently being overridden, scheduling another save');
                ports.schedule(++loopCounter);
                if (strict) throw new Error('Settings save is queued: response length is overridden');
                return;
            }
            console.error('Response length is currently being overridden, but the save loop has reached the maximum number of retries');
            ports.restoreResponse();
        }
        if (ports.version() === '0.0.0') {
            try { await ports.ensureVersion(); } catch (error) { console.warn('Saving settings before client version resolved.', error); }
        }
        try {
            const live = snapshot();
            return await writeChanges(settingsChanges(liveBaseline, live), live);
        } catch (error) {
            if (!ports.conflict.hasConflict()) {
                console.error('Error saving settings:', error);
                ports.onError();
            }
            if (strict) throw error;
        }
    }

    async function emitUpdated() {
        try {
            await ports.emitUpdated();
        } catch (error) {
            console.error('Error saving settings:', error);
            if (!ports.conflict.hasConflict()) ports.onError();
        }
    }

    async function saveSettings(loopCounter = 0, options) {
        const onFailure = options?.strict === true ? strictSaveFailureHandler : undefined;
        const operation = ports.conflict.runWrite(() => saveSettingsCore(loopCounter, options).catch(error => {
            if (onFailure) {
                const before = pending && snapshot();
                onFailure();
                if (before) for (const { path, value } of settingsChanges(before, snapshot())) {
                    if (equal(settingsValue(pending.live, path), settingsValue(before, path))) {
                        setSettingsValue(pending.live, path, value);
                    }
                }
            }
            throw error;
        }));
        // Do not hold the write queue while notifying subscribers: a subscriber
        // may itself await a settings save. Failed writes must not poison it.
        if (await operation) await emitUpdated();
    }

    function getPendingChanges(live) {
        const changes = new Map(pending.changes.map(change => [change.id, change]));
        for (const change of settingsChanges(pending.live, live)) {
            if (equal(settingsValue(liveBaseline, change.path), change.value)) changes.delete(change.id);
            else changes.set(change.id, change);
        }
        return [...changes.values()];
    }

    async function resolveConflict(choices) {
        if (await ports.conflict.runWrite(async () => {
            if (!pending) return false;
            const live = snapshot();
            return writeChanges(getPendingChanges(live), live, choices);
        })) await emitUpdated();
    }

    function recoveryDocument() {
        const live = snapshot();
        if (pending) for (const { path, value } of getPendingChanges(live)) setSettingsValue(live, path, value);
        return live;
    }

    return { buildRuntimeSettingsPayload, initialize, publishForm, saveSettings, resolveConflict, recoveryDocument, conflictRows: () => rows };
}
