/** Runtime settings payload and guarded persistence over the existing settings owner. */
export function createRuntimeSettingsPersistence(ports) {
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

    async function saveSettings(loopCounter = 0, options) {
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
        const payload = buildRuntimeSettingsPayload();
        const sortSaveSnapshot = ports.beginSnapshot(payload.settings_revision);
        let savedRevision;
        let sortSaveFinished = false;
        try {
            const request = await ports.compress({ method: 'POST', headers: ports.headers(), body: JSON.stringify(payload), cache: 'no-cache' });
            const result = await ports.conflict.saveRuntime({ post: () => ports.post(request), onConflict: ports.onConflict });
            if (!result.ok) throw new Error(`Failed to save settings: ${result.statusText}`);
            try {
                const saveResult = await result.json();
                if (Number.isFinite(Number(saveResult?.settings_revision))) {
                    ports.setRevision(Math.max(ports.getRevision() ?? 0, Number(saveResult.settings_revision)));
                    if (saveResult?.result === 'ok' && Number.isSafeInteger(saveResult.settings_revision) && saveResult.settings_revision > 0) {
                        savedRevision = saveResult.settings_revision;
                    }
                }
            } catch {
                // Older file-backed responses may not be JSON objects.
            }
            const documentPayload = { ...payload };
            delete documentPayload.settings_revision;
            ports.setDocument(documentPayload);
            if (savedRevision !== undefined) {
                ports.finishSnapshot(sortSaveSnapshot, savedRevision);
                sortSaveFinished = true;
            }
            await ports.emitUpdated();
        } catch (error) {
            console.error('Error saving settings:', error);
            if (!ports.conflict.hasConflict()) ports.onError();
            if (strict && savedRevision === undefined) throw error;
        } finally {
            if (!sortSaveFinished) ports.finishSnapshot(sortSaveSnapshot, savedRevision);
        }
    }
    return { buildRuntimeSettingsPayload, saveSettings };
}
