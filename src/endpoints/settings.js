import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import _ from 'lodash';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import bytes from 'bytes';

import { SETTINGS_FILE } from '../constants.js';
import { getConfigValue, generateTimestamp, removeOldBackups } from '../util.js';
import { getAllUserHandles, getUserDirectories } from '../users.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';
import {
    readAndParseFromDirectoryAsync,
    readPresetsFromDirectoryAsync,
    readWorldNamesAsync,
    getCachedPayload,
} from './settings-cache.js';
import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { SETTINGS_AUDIT_SCOPE } from '../canonical-settings-shadow-import.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import {
    createSettingsSnapshot,
    getCanonicalSettingsDocument,
    getCanonicalSettingsRevision,
    getSettingsSnapshot,
    listSettingsSnapshots,
    recordSettingsProjectionRepair,
    restoreSettingsSnapshot,
    upsertCanonicalSettingsDocument,
} from './settings-store.js';

const ENABLE_EXTENSIONS = !!getConfigValue('extensions.enabled', true, 'boolean');
const ENABLE_EXTENSIONS_AUTO_UPDATE = !!getConfigValue('extensions.autoUpdate', true, 'boolean');
const ENABLE_ACCOUNTS = !!getConfigValue('enableUserAccounts', false, 'boolean');
const ENABLE_REQUEST_COMPRESSION = !!getConfigValue('performance.requestCompression.enabled', false, 'boolean');
const REQUEST_COMPRESSION_MIN = bytes.parse(getConfigValue('performance.requestCompression.minPayloadSize', '256kb'));
const REQUEST_COMPRESSION_MAX = bytes.parse(getConfigValue('performance.requestCompression.maxPayloadSize', '8mb'));
const REQUEST_COMPRESSION_TIMEOUT = Number(getConfigValue('performance.requestCompression.timeout', 3000, 'number'));

// 10 minutes
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;

/**
 * Map of functions to trigger settings autosave for a user.
 * @type {Map<string, function>}
 */
const AUTOSAVE_FUNCTIONS = new Map();

/**
 * Triggers autosave for a user every 10 minutes.
 * @param {string} handle User handle
 * @returns {void}
 */
function triggerAutoSave(handle) {
    try {
        if (!AUTOSAVE_FUNCTIONS.has(handle)) {
            const throttledAutoSave = _.throttle(() => {
                try {
                    backupUserSettings(handle, true);
                } catch (error) {
                    console.error('Could not autosave settings backup', error);
                }
            }, AUTOSAVE_INTERVAL);
            AUTOSAVE_FUNCTIONS.set(handle, throttledAutoSave);
        }

        const functionToCall = AUTOSAVE_FUNCTIONS.get(handle);
        if (functionToCall && typeof functionToCall === 'function') {
            functionToCall();
        }
    } catch (error) {
        console.error('Could not schedule settings autosave', error);
    }
}

/**
 * Gets backup file prefix for user settings.
 * @param {string} handle User handle
 * @returns {string} File prefix
 */
export function getSettingsBackupFilePrefix(handle) {
    return `settings_${handle}_`;
}

async function backupSettings() {
    try {
        const userHandles = await getAllUserHandles();

        for (const handle of userHandles) {
            backupUserSettings(handle, true);
        }
    } catch (err) {
        console.error('Could not backup settings file', err);
    }
}

/**
 * Makes a backup of the user's settings file.
 * @param {string} handle User handle
 * @param {boolean} preventDuplicates Prevent duplicate backups
 * @returns {void}
 */
function backupUserSettings(handle, preventDuplicates, directoriesOverride = null) {
    const userDirectories = directoriesOverride ?? getUserDirectories(handle);

    if (!userDirectories?.root || !fs.existsSync(userDirectories.root)) {
        return;
    }
    if (!userDirectories.backups) {
        return;
    }
    if (!fs.existsSync(userDirectories.backups)) {
        fs.mkdirSync(userDirectories.backups, { recursive: true });
    }

    const backupFile = path.join(userDirectories.backups, `${getSettingsBackupFilePrefix(handle)}${generateTimestamp()}.json`);
    const sourceFile = path.join(userDirectories.root, SETTINGS_FILE);

    if (preventDuplicates && isDuplicateBackup(handle, sourceFile)) {
        return;
    }

    if (!fs.existsSync(sourceFile)) {
        return;
    }

    fs.copyFileSync(sourceFile, backupFile);
    removeOldBackups(userDirectories.backups, `settings_${handle}`);
}

/**
 * Checks if the backup would be a duplicate.
 * @param {string} handle User handle
 * @param {string} sourceFile Source file path
 * @returns {boolean} True if the backup is a duplicate
 */
function isDuplicateBackup(handle, sourceFile) {
    const latestBackup = getLatestBackup(handle);
    if (!latestBackup) {
        return false;
    }
    return areFilesEqual(latestBackup, sourceFile);
}

/**
 * Returns true if the two files are equal.
 * @param {string} file1 File path
 * @param {string} file2 File path
 */
function areFilesEqual(file1, file2) {
    if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
        return false;
    }

    const content1 = fs.readFileSync(file1);
    const content2 = fs.readFileSync(file2);
    return content1.toString() === content2.toString();
}

/**
 * Gets the latest backup file for a user.
 * @param {string} handle User handle
 * @returns {string|null} Latest backup file. Null if no backup exists.
 */
function getLatestBackup(handle) {
    const userDirectories = getUserDirectories(handle);
    const backupFiles = fs.readdirSync(userDirectories.backups)
        .filter(x => x.startsWith(getSettingsBackupFilePrefix(handle)))
        .map(x => ({ name: x, ctime: fs.statSync(path.join(userDirectories.backups, x)).ctimeMs }));
    const latestBackup = backupFiles.sort((a, b) => b.ctime - a.ctime)[0]?.name;
    if (!latestBackup) {
        return null;
    }
    return path.join(userDirectories.backups, latestBackup);
}


function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function canReadCanonicalFeatureFlags() {
    if (globalThis.COMMAND_LINE_ARGS != null) {
        return true;
    }
    return Object.keys(process.env).some(key => key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_'));
}

function getCanonicalSettingsReadState(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }

    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    if (!featureFlags.reads) {
        return { ok: false, reason: 'canonical_reads_disabled', featureFlags };
    }

    const handle = getRequestHandle(request);
    const db = canonicalSqliteManager.open({
        handle,
        directories: request.user.directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable', featureFlags };
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: settingsSlice.auditScope });
    if (auditStatus.blocking) {
        if (featureFlags.strict) {
            throw new Error(`Canonical settings reads blocked: ${auditStatus.reason}`);
        }
        return { ok: false, reason: auditStatus.reason ?? 'settings_audit_blocked', featureFlags, auditStatus };
    }

    const rollback = settingsSlice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'reads',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        const reason = rollback.blockers[0]?.code ?? auditStatus.reason ?? 'settings_slice_blocked';
        if (featureFlags.strict) {
            throw new Error(`Canonical settings reads blocked: ${reason}`);
        }
        return { ok: false, reason, featureFlags, auditStatus, rollback };
    }

    const document = getCanonicalSettingsDocument(db, { userId: handle });
    if (!document) {
        return { ok: false, reason: 'settings_document_missing', featureFlags, auditStatus, db, handle };
    }

    return {
        ok: true,
        db,
        handle,
        featureFlags,
        migrationStatus,
        auditStatus,
        document,
        sliceKey: settingsSlice.key,
    };
}

function getCanonicalSettingsWriteState(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }

    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    if (!featureFlags.writes) {
        return { ok: false, reason: 'canonical_writes_disabled', featureFlags };
    }
    if (!featureFlags.reads) {
        // Writes require the same audit gate as reads.
        return { ok: false, reason: 'canonical_reads_disabled', featureFlags };
    }

    const handle = getRequestHandle(request);
    const db = canonicalSqliteManager.open({
        handle,
        directories: request.user.directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable', featureFlags };
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: settingsSlice.auditScope });
    if (auditStatus.blocking) {
        if (featureFlags.strict) {
            throw new Error(`Canonical settings writes blocked: ${auditStatus.reason}`);
        }
        return { ok: false, reason: auditStatus.reason ?? 'settings_audit_blocked', featureFlags, auditStatus, db, handle };
    }

    const writeBlockers = settingsSlice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'writes',
        persistedAuditStatus: auditStatus,
    });
    if (!writeBlockers.ok) {
        const reason = writeBlockers.blockers[0]?.code ?? 'settings_write_blocked';
        if (featureFlags.strict) {
            throw new Error(`Canonical settings writes blocked: ${reason}`);
        }
        return {
            ok: false,
            reason,
            featureFlags,
            auditStatus,
            rollback: writeBlockers,
            db,
            handle,
        };
    }

    return {
        ok: true,
        db,
        handle,
        featureFlags,
        migrationStatus,
        auditStatus,
        sliceKey: settingsSlice.key,
    };
}

function projectSettingsJson(directories, payload) {
    const pathToSettings = path.join(directories.root, SETTINGS_FILE);
    writeFileAtomicSync(pathToSettings, JSON.stringify(payload, null, 4), 'utf8');
}

function extractSettingsRevision(body) {
    if (body == null || typeof body !== 'object') {
        return null;
    }
    // Protocol field only. Do not treat a document field named "revision" as authority.
    if (Object.prototype.hasOwnProperty.call(body, 'settings_revision')) {
        return body.settings_revision;
    }
    return null;
}

function stripSettingsRevisionFields(body) {
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        return body;
    }
    const clone = { ...body };
    delete clone.settings_revision;
    return clone;
}

function resolveExpectedRevisionForSave({ db, handle, body }) {
    const provided = extractSettingsRevision(body);
    if (provided != null && provided !== '') {
        const numeric = Number(provided);
        if (!Number.isFinite(numeric) || numeric < 0) {
            return { ok: false, error: 'invalid_settings_revision' };
        }
        return { ok: true, expectedRevision: numeric };
    }

    // Legacy clients without a revision may save only when their baseline matches
    // the current document (compat window). We treat missing revision as "use current".
    // If no document exists yet, expectedRevision is 0 (create).
    const current = getCanonicalSettingsRevision(db, { userId: handle });
    return { ok: true, expectedRevision: current };
}

function invalidateSettingsAuditAfterFileWrite(request, operation) {
    if (!canReadCanonicalFeatureFlags()) {
        return;
    }
    const featureFlags = getCanonicalStorageSlice('settings').getAuditTrackingFeatureFlags();
    if (!featureFlags.enabled) {
        return;
    }

    const handle = getRequestHandle(request);
    const db = canonicalSqliteManager.open({
        handle,
        directories: request.user.directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return;
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return;
    }

    invalidateCanonicalAuditStatus(db, {
        scope: SETTINGS_AUDIT_SCOPE,
        handle,
        reason: 'audit_stale_after_settings_file_write',
        source: `settings:${operation}`,
    });
}


export const router = express.Router();

router.post('/save', function (request, response) {
    try {
        const writeState = getCanonicalSettingsWriteState(request);
        if (writeState.ok) {
            const handle = writeState.handle;
            const payload = stripSettingsRevisionFields(request.body);
            if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
                return response.status(400).send({ error: 'settings payload must be a JSON object' });
            }

            const expected = resolveExpectedRevisionForSave({
                db: writeState.db,
                handle,
                body: request.body,
            });
            if (!expected.ok) {
                return response.status(400).send({ error: expected.error });
            }

            const saved = upsertCanonicalSettingsDocument(writeState.db, {
                userId: handle,
                payload,
                expectedRevision: expected.expectedRevision,
            });
            if (!saved.ok) {
                return response.status(409).send({
                    error: 'settings_revision_conflict',
                    settings_revision: saved.currentRevision,
                });
            }

            try {
                projectSettingsJson(request.user.directories, payload);
            } catch (projectionError) {
                const repairKey = `settings:${handle}:projection`;
                recordSettingsProjectionRepair(writeState.db, {
                    repairKey,
                    userId: handle,
                    reason: 'projection_failed',
                    details: {
                        operation: 'save',
                        message: String(projectionError?.message ?? projectionError ?? ''),
                        revision: saved.revision,
                    },
                });
                invalidateCanonicalAuditStatus(writeState.db, {
                    scope: SETTINGS_AUDIT_SCOPE,
                    handle,
                    reason: 'audit_stale_after_settings_projection_failure',
                    source: 'settings:save',
                });
                console.warn(`Canonical settings projection failed for ${handle}:`, projectionError);
                return response.status(500).send({
                    error: 'Failed to project canonical settings file.',
                    repairKey,
                    settings_revision: saved.revision,
                });
            }

            triggerAutoSave(handle);
            return response.send({
                result: 'ok',
                settings_revision: saved.revision,
            });
        }

        // File-backed path (flags off or blocked). Still atomic write.
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        const filePayload = stripSettingsRevisionFields(request.body);
        writeFileAtomicSync(pathToSettings, JSON.stringify(filePayload, null, 4), 'utf8');
        invalidateSettingsAuditAfterFileWrite(request, 'save');
        triggerAutoSave(request.user.profile.handle);
        response.send({ result: 'ok' });
    } catch (err) {
        console.error(err);
        response.send(err);
    }
});

// Wintermute's code
router.post('/get', async (request, response) => {
    let settings;
    /** @type {number|undefined} */
    let settingsRevision;
    try {
        const readState = getCanonicalSettingsReadState(request);
        if (readState.ok) {
            settings = readState.document.payloadJson;
            settingsRevision = readState.document.revision;
        } else {
            const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
            settings = await fs.promises.readFile(pathToSettings, 'utf8');
        }
    } catch {
        return response.sendStatus(500);
    }

    const dirs = request.user.directories;
    const sortFn = () => (a, b) => a.localeCompare(b);

    const presetOpts = (dir) => ({ sortFunction: sortFn(), removeFileExtension: true });

    const [
        { fileContents: novelai_settings, fileNames: novelai_setting_names },
        { fileContents: openai_settings, fileNames: openai_setting_names },
        { fileContents: koboldai_settings, fileNames: koboldai_setting_names },
        { fileContents: textgenerationwebui_presets, fileNames: textgenerationwebui_preset_names },
        world_names,
        themes,
        movingUIPresets,
        quickReplyPresets,
        instruct,
        context,
        sysprompt,
        reasoning,
    ] = await Promise.all([
        getCachedPayload(dirs.novelAI_Settings, () => readPresetsFromDirectoryAsync(dirs.novelAI_Settings, presetOpts(dirs.novelAI_Settings))),
        getCachedPayload(dirs.openAI_Settings, () => readPresetsFromDirectoryAsync(dirs.openAI_Settings, presetOpts(dirs.openAI_Settings))),
        getCachedPayload(dirs.koboldAI_Settings, () => readPresetsFromDirectoryAsync(dirs.koboldAI_Settings, presetOpts(dirs.koboldAI_Settings))),
        getCachedPayload(dirs.textGen_Settings, () => readPresetsFromDirectoryAsync(dirs.textGen_Settings, presetOpts(dirs.textGen_Settings))),
        getCachedPayload(dirs.worlds, () => readWorldNamesAsync(dirs.worlds)),
        getCachedPayload(dirs.themes, () => readAndParseFromDirectoryAsync(dirs.themes)),
        getCachedPayload(dirs.movingUI, () => readAndParseFromDirectoryAsync(dirs.movingUI)),
        getCachedPayload(dirs.quickreplies, () => readAndParseFromDirectoryAsync(dirs.quickreplies)),
        getCachedPayload(dirs.instruct, () => readAndParseFromDirectoryAsync(dirs.instruct)),
        getCachedPayload(dirs.context, () => readAndParseFromDirectoryAsync(dirs.context)),
        getCachedPayload(dirs.sysprompt, () => readAndParseFromDirectoryAsync(dirs.sysprompt)),
        getCachedPayload(dirs.reasoning, () => readAndParseFromDirectoryAsync(dirs.reasoning)),
    ]);

    response.send({
        settings,
        ...(settingsRevision != null ? { settings_revision: settingsRevision } : {}),
        koboldai_settings,
        koboldai_setting_names,
        textgenerationwebui_presets,
        textgenerationwebui_preset_names,
        world_names,
        novelai_settings,
        novelai_setting_names,
        openai_settings,
        openai_setting_names,
        themes,
        movingUIPresets,
        quickReplyPresets,
        instruct,
        context,
        sysprompt,
        reasoning,
        enable_extensions: ENABLE_EXTENSIONS,
        enable_extensions_auto_update: ENABLE_EXTENSIONS_AUTO_UPDATE,
        enable_accounts: ENABLE_ACCOUNTS,
        request_compression: {
            enabled: ENABLE_REQUEST_COMPRESSION,
            minPayloadSize: REQUEST_COMPRESSION_MIN || 0,
            maxPayloadSize: REQUEST_COMPRESSION_MAX || 0,
            timeout: REQUEST_COMPRESSION_TIMEOUT || 0,
        },
    });
});

router.post('/get-snapshots', async (request, response) => {
    try {
        const handle = getRequestHandle(request);
        const fileSnapshots = [];
        try {
            const snapshots = fs.readdirSync(request.user.directories.backups);
            const userFilesPattern = getSettingsBackupFilePrefix(handle);
            for (const name of snapshots.filter(x => x.startsWith(userFilesPattern))) {
                const stat = fs.statSync(path.join(request.user.directories.backups, name));
                fileSnapshots.push({ date: stat.ctimeMs, name, size: stat.size, source: 'file' });
            }
        } catch {
            // backups dir may be missing
        }

        // Listing is a read operation: do not require the write gate (open repairs
        // or writes-off must not hide readable canonical snapshots).
        const readState = getCanonicalSettingsReadState(request);
        if (readState.ok) {
            const dbSnaps = listSettingsSnapshots(readState.db, { userId: handle }).map(snap => ({
                date: snap.createdAtMs,
                name: `canonical:${snap.id}`,
                size: snap.size,
                source: 'canonical',
                source_revision: snap.sourceRevision,
            }));
            return response.json([...dbSnaps, ...fileSnapshots].sort((a, b) => b.date - a.date));
        }

        response.json(fileSnapshots.sort((a, b) => b.date - a.date));
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/load-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const handle = getRequestHandle(request);
        const name = request.body?.name;
        if (!name) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        if (String(name).startsWith('canonical:')) {
            const snapshotId = String(name).slice('canonical:'.length);
            const readState = getCanonicalSettingsReadState(request);
            if (!readState.ok) {
                return response.sendStatus(404);
            }
            const snap = getSettingsSnapshot(readState.db, { userId: handle, id: snapshotId });
            if (!snap) {
                return response.sendStatus(404);
            }
            return response.send(snap.payloadJson);
        }

        const userFilesPattern = getSettingsBackupFilePrefix(handle);
        if (!String(name).startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotPath = path.join(request.user.directories.backups, name);
        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        const content = fs.readFileSync(snapshotPath, 'utf8');
        response.send(content);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/make-snapshot', async (request, response) => {
    try {
        const writeState = getCanonicalSettingsWriteState(request);
        if (writeState.ok) {
            createSettingsSnapshot(writeState.db, {
                userId: writeState.handle,
                name: `manual_${Date.now()}`,
            });
            // Project canonical payload first so any companion file backup matches authority.
            try {
                const document = getCanonicalSettingsDocument(writeState.db, { userId: writeState.handle });
                if (document) {
                    projectSettingsJson(request.user.directories, document.payload);
                }
                backupUserSettings(writeState.handle, false, request.user.directories);
            } catch (error) {
                console.error('Could not create file settings backup alongside canonical snapshot', error);
            }
            return response.sendStatus(204);
        }

        backupUserSettings(request.user.profile.handle, false);
        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/restore-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const handle = getRequestHandle(request);
        const name = request.body?.name;
        if (!name) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        if (String(name).startsWith('canonical:')) {
            const writeState = getCanonicalSettingsWriteState(request);
            if (!writeState.ok) {
                return response.status(409).send({
                    error: 'canonical_settings_restore_unavailable',
                    reason: writeState.reason ?? null,
                });
            }
            const snapshotId = String(name).slice('canonical:'.length);
            const restored = restoreSettingsSnapshot(writeState.db, {
                userId: handle,
                snapshotId,
            });
            if (restored.notFound) {
                return response.sendStatus(404);
            }
            if (!restored.ok) {
                return response.status(409).send({
                    error: 'settings_revision_conflict',
                    settings_revision: restored.currentRevision,
                });
            }
            try {
                projectSettingsJson(request.user.directories, restored.payload);
            } catch (projectionError) {
                const repairKey = `settings:${handle}:projection`;
                recordSettingsProjectionRepair(writeState.db, {
                    repairKey,
                    userId: handle,
                    reason: 'projection_failed',
                    details: {
                        operation: 'restore-snapshot',
                        message: String(projectionError?.message ?? projectionError ?? ''),
                        revision: restored.revision,
                    },
                });
                invalidateCanonicalAuditStatus(writeState.db, {
                    scope: SETTINGS_AUDIT_SCOPE,
                    handle,
                    reason: 'audit_stale_after_settings_projection_failure',
                    source: 'settings:restore-snapshot',
                });
                return response.status(500).send({
                    error: 'Failed to project canonical settings file.',
                    repairKey,
                    settings_revision: restored.revision,
                });
            }
            return response.sendStatus(204);
        }

        const userFilesPattern = getSettingsBackupFilePrefix(handle);
        if (!String(name).startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotPath = path.join(request.user.directories.backups, name);
        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        const writeState = getCanonicalSettingsWriteState(request);
        if (writeState.ok) {
            const content = fs.readFileSync(snapshotPath, 'utf8');
            let payload;
            try {
                payload = JSON.parse(content);
            } catch {
                return response.status(400).send({ error: 'Invalid snapshot JSON' });
            }
            const current = getCanonicalSettingsRevision(writeState.db, { userId: handle });
            const restored = upsertCanonicalSettingsDocument(writeState.db, {
                userId: handle,
                payload,
                expectedRevision: current,
            });
            if (!restored.ok) {
                return response.status(409).send({
                    error: 'settings_revision_conflict',
                    settings_revision: restored.currentRevision,
                });
            }
            try {
                projectSettingsJson(request.user.directories, payload);
            } catch (projectionError) {
                const repairKey = `settings:${handle}:projection`;
                recordSettingsProjectionRepair(writeState.db, {
                    repairKey,
                    userId: handle,
                    reason: 'projection_failed',
                    details: {
                        operation: 'restore-snapshot-file',
                        message: String(projectionError?.message ?? projectionError ?? ''),
                        revision: restored.revision,
                    },
                });
                return response.status(500).send({
                    error: 'Failed to project canonical settings file.',
                    repairKey,
                    settings_revision: restored.revision,
                });
            }
            return response.sendStatus(204);
        }

        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        fs.rmSync(pathToSettings, { force: true });
        fs.copyFileSync(snapshotPath, pathToSettings);
        invalidateSettingsAuditAfterFileWrite(request, 'restore-snapshot');
        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

/**
 * Initializes the settings endpoint
 */
export async function init() {
    await backupSettings();
}
