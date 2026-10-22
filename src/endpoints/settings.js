import express from 'express';
import bytes from 'bytes';

import { getConfigValue, tryParse } from '../util.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';
import { getDefaultTemplateFile } from './content-manager.js';
import { getCanonicalPresetsReadState } from './presets.js';
import { getCanonicalWorldInfoReadState } from './worldinfo.js';
import { listCanonicalWorldInfoBooks } from './world-info-store.js';
import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { ensureCanonicalSliceBackend } from '../canonical-backend.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import {
    createSettingsSnapshot,
    ensureCanonicalSettingsDocument,
    getCanonicalSettingsDocument,
    getCanonicalSettingsRevision,
    getSettingsSnapshot,
    listSettingsSnapshots,
    restoreSettingsSnapshot,
    upsertCanonicalSettingsDocument,
} from './settings-store.js';


const ENABLE_ACCOUNTS = !!getConfigValue('enableUserAccounts', false, 'boolean');
const ENABLE_REQUEST_COMPRESSION = !!getConfigValue('performance.requestCompression.enabled', false, 'boolean');
const REQUEST_COMPRESSION_MIN = bytes.parse(getConfigValue('performance.requestCompression.minPayloadSize', '256kb'));
const REQUEST_COMPRESSION_MAX = bytes.parse(getConfigValue('performance.requestCompression.maxPayloadSize', '8mb'));
const REQUEST_COMPRESSION_TIMEOUT = Number(getConfigValue('performance.requestCompression.timeout', 3000, 'number'));

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

/**
 * Lists world book names from canonical storage. World books are no longer
 * file-backed at runtime, so the worlds/ directory scan cannot see books that
 * were created without a file projection. Fail-closed to an empty list when
 * the canonical slice is unavailable, matching the worldinfo endpoints.
 * @param {import('express').Request} request Express request
 * @returns {Promise<string[]>} World book names
 */
async function listCanonicalWorldNamesOrEmpty(request) {
    try {
        const readState = await getCanonicalWorldInfoReadState(request);
        if (!readState.ok) {
            return [];
        }
        return listCanonicalWorldInfoBooks(readState.db).map(book => book.name);
    } catch {
        return [];
    }
}

function canReadCanonicalFeatureFlags() {
    if (globalThis.COMMAND_LINE_ARGS != null) {
        return true;
    }
    return Object.keys(process.env).some(key => key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_'));
}

async function getCanonicalSettingsReadState(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }

    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    // Populate the shadow import and persisted audit before consulting them.
    await ensureCanonicalSliceBackend('settings', request.user.directories, getRequestHandle(request));
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
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: settingsSlice.auditScope });
    if (auditStatus.blocking) {
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
        return { ok: false, reason, featureFlags, auditStatus, rollback };
    }

    const ensured = ensureCanonicalSettingsDocument(db, {
        userId: handle,
        defaults: getDefaultTemplateFile('settings-defaults.json') ?? {},
    });
    if (!ensured.ok || !ensured.document) {
        return { ok: false, reason: ensured.reason ?? 'settings_document_missing', featureFlags, auditStatus, db, handle };
    }
    const document = ensured.document;

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

async function getCanonicalSettingsWriteState(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }

    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    await ensureCanonicalSliceBackend('settings', request.user.directories, getRequestHandle(request));
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
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: settingsSlice.auditScope });
    if (auditStatus.blocking) {
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

    const ensured = ensureCanonicalSettingsDocument(db, {
        userId: handle,
        defaults: getDefaultTemplateFile('settings-defaults.json') ?? {},
    });
    if (!ensured.ok || !ensured.document) {
        return { ok: false, reason: ensured.reason ?? 'settings_document_missing', featureFlags, auditStatus, db, handle };
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

/**
 * Ensure the canonical settings document exists for a user, seeding it from
 * the bundled defaults template when absent. Flag-gated only on canonical
 * storage itself — independent of shadow import and audit state, so it can
 * run at user-creation time before any canonical document exists.
 * @param {object} directories User directories
 * @param {string} handle User handle
 * @returns {Promise<object>} { ok: true, created } or a failure reason
 */
export async function ensureCanonicalSettingsForUser(directories, handle) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }
    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled' };
    }
    const db = canonicalSqliteManager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: !!featureFlags.strict },
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable' };
    }
    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
    if (!migrationStatus.ok) {
        return { ok: false, reason: 'migration_blocked', migrationStatus };
    }
    return ensureCanonicalSettingsDocument(db, {
        userId: handle,
        defaults: getDefaultTemplateFile('settings-defaults.json') ?? {},
    });
}

/**
 * Resets the canonical settings document to the bundled defaults template.
 * Creates the document (rev 1) when missing; keeps settings_snapshots intact.
 * No file projection is written.
 * @param {import('express').Request} request Express request
 * @returns {Promise<object>} { ok: true, revision } or a write-state failure
 */
export async function resetCanonicalSettings(request) {
    const writeState = await getCanonicalSettingsWriteState(request);
    if (!writeState.ok) {
        return writeState;
    }
    const defaults = getDefaultTemplateFile('settings-defaults.json');
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
        return { ok: false, reason: 'settings_defaults_unavailable' };
    }
    const current = getCanonicalSettingsDocument(writeState.db, { userId: writeState.handle });
    const saved = upsertCanonicalSettingsDocument(writeState.db, {
        userId: writeState.handle,
        payload: defaults,
        expectedRevision: current ? current.revision : 0,
    });
    if (!saved.ok) {
        return { ok: false, reason: 'settings_revision_conflict', currentRevision: saved.currentRevision };
    }
    return { ok: true, revision: saved.revision };
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

export const router = express.Router();

router.post('/save', async function (request, response) {
    try {
        const writeState = await getCanonicalSettingsWriteState(request);
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

            return response.send({
                result: 'ok',
                settings_revision: saved.revision,
            });
        }

        return response.status(503).send({
            error: 'canonical_storage_unavailable',
            reason: writeState.reason ?? 'canonical_storage_unavailable',
        });
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
        const readState = await getCanonicalSettingsReadState(request);
        if (readState.ok) {
            settings = readState.document.payloadJson;
            settingsRevision = readState.document.revision;
        } else {
            return response.status(503).send({
                error: 'canonical_storage_unavailable',
                reason: readState.reason ?? 'canonical_storage_unavailable',
            });
        }
    } catch {
        return response.sendStatus(500);
    }

    // Lazy migration boundary: feature_settings replaced extension_settings.
    // Normalize the wire payload so every reader sees only the new key; the
    // next client save drops the old key from the stored document.
    const parsedSettings = tryParse(settings);
    if (parsedSettings && typeof parsedSettings === 'object' && parsedSettings.extension_settings !== undefined) {
        if (parsedSettings.feature_settings === undefined) {
            parsedSettings.feature_settings = parsedSettings.extension_settings;
        }
        delete parsedSettings.extension_settings;
        settings = JSON.stringify(parsedSettings);
    }

    const [
        presetsReadState,
        world_names,
    ] = await Promise.all([
        getCanonicalPresetsReadState(request),
        listCanonicalWorldNamesOrEmpty(request),
    ]);
    if (!presetsReadState.ok) {
        return response.status(503).send({
            error: 'canonical_storage_unavailable',
            reason: presetsReadState.reason ?? 'canonical_storage_unavailable',
        });
    }
    const openai_settings = presetsReadState.rows.map(row => row.payloadJson);
    const openai_setting_names = presetsReadState.rows.map(row => row.name);

    response.send({
        settings,
        ...(settingsRevision != null ? { settings_revision: settingsRevision } : {}),
        world_names,
        openai_settings,
        openai_setting_names,
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

        // Listing is a read operation: do not require the write gate (open repairs
        // or writes-off must not hide readable canonical snapshots).
        const readState = await getCanonicalSettingsReadState(request);
        if (readState.ok) {
            const dbSnaps = listSettingsSnapshots(readState.db, { userId: handle }).map(snap => ({
                date: snap.createdAtMs,
                name: `canonical:${snap.id}`,
                size: snap.size,
                source: 'canonical',
                source_revision: snap.sourceRevision,
            }));
            return response.json(dbSnaps.sort((a, b) => b.date - a.date));
        }

        response.json([]);
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

        if (!String(name).startsWith('canonical:')) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotId = String(name).slice('canonical:'.length);
        const readState = await getCanonicalSettingsReadState(request);
        if (!readState.ok) {
            return response.sendStatus(404);
        }
        const snap = getSettingsSnapshot(readState.db, { userId: handle, id: snapshotId });
        if (!snap) {
            return response.sendStatus(404);
        }
        return response.send(snap.payloadJson);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/make-snapshot', async (request, response) => {
    try {
        const writeState = await getCanonicalSettingsWriteState(request);
        if (writeState.ok) {
            createSettingsSnapshot(writeState.db, {
                userId: writeState.handle,
                name: `manual_${Date.now()}`,
            });
            return response.sendStatus(204);
        }

        return response.status(503).send({
            error: 'canonical_storage_unavailable',
            reason: writeState.reason ?? 'canonical_storage_unavailable',
        });
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

        if (!String(name).startsWith('canonical:')) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const writeState = await getCanonicalSettingsWriteState(request);
        if (!writeState.ok) {
            return response.status(503).send({
                error: 'canonical_storage_unavailable',
                reason: writeState.reason ?? 'canonical_storage_unavailable',
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
        return response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});
