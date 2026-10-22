import express from 'express';
import sanitize from 'sanitize-filename';

import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { ensureCanonicalSliceBackend } from '../canonical-backend.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { getDefaultPresetFile, getDefaultPresets } from './content-manager.js';
import {
    deleteCanonicalPreset,
    listCanonicalPresets,
    PRESETS_OPENAI_API_ID,
    upsertCanonicalPreset,
} from './presets-store.js';

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function canReadCanonicalFeatureFlags() {
    if (globalThis.COMMAND_LINE_ARGS != null) {
        return true;
    }
    return Object.keys(process.env).some(key => key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_'));
}

function sendCanonicalUnavailable(response, state) {
    return response.status(503).send({
        error: 'canonical_storage_unavailable',
        reason: state.reason ?? 'canonical_storage_unavailable',
    });
}

/**
 * Resolves the canonical presets backend for a mutation. Preset JSON files
 * under `Open AI Settings/` are a one-shot migration input only — they are
 * never a runtime fallback.
 * @returns {Promise<{ok: true, db: object, handle: string} | {ok: false, reason: string}>}
 */
async function getCanonicalPresetsWriteState(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }

    const slice = getCanonicalStorageSlice('presets');
    const featureFlags = slice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled' };
    }

    const handle = getRequestHandle(request);
    await ensureCanonicalSliceBackend('presets', request.user.directories, handle);
    if (!featureFlags.writes) {
        return { ok: false, reason: 'canonical_writes_disabled' };
    }

    const db = canonicalSqliteManager.open({
        handle,
        directories: request.user.directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable' };
    }

    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
    if (!migrationStatus.ok) {
        return { ok: false, reason: 'migration_blocked' };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: slice.auditScope });
    if (auditStatus.blocking) {
        return { ok: false, reason: auditStatus.reason ?? 'presets_audit_blocked' };
    }

    const rollback = slice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'writes',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        return { ok: false, reason: rollback.blockers[0]?.code ?? 'presets_slice_blocked' };
    }

    return { ok: true, db, handle };
}

/**
 * Read-side counterpart of `getCanonicalPresetsWriteState`: open repairs or
 * writes-off must not hide readable preset lists.
 * @returns {Promise<{ok: true, rows: object[]} | {ok: false, reason: string}>}
 */
export async function getCanonicalPresetsReadState(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }

    const slice = getCanonicalStorageSlice('presets');
    const featureFlags = slice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled' };
    }

    const handle = getRequestHandle(request);
    await ensureCanonicalSliceBackend('presets', request.user.directories, handle);
    if (!featureFlags.reads) {
        return { ok: false, reason: 'canonical_reads_disabled' };
    }

    const db = canonicalSqliteManager.open({
        handle,
        directories: request.user.directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable' };
    }

    const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
    if (!migrationStatus.ok) {
        return { ok: false, reason: 'migration_blocked' };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: slice.auditScope });
    if (auditStatus.blocking) {
        return { ok: false, reason: auditStatus.reason ?? 'presets_audit_blocked' };
    }

    const rollback = slice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'reads',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        return { ok: false, reason: rollback.blockers[0]?.code ?? 'presets_slice_blocked' };
    }

    return { ok: true, rows: listCanonicalPresets(db, { apiId: PRESETS_OPENAI_API_ID }) };
}

/**
 * Preset saves historically used last-write-wins file semantics; canonical
 * keeps that contract (no client-facing revision field yet).
 */
export const router = express.Router();

router.post('/save', async function (request, response) {
    const name = sanitize(request.body.name);
    if (!request.body.preset || !name) {
        return response.sendStatus(400);
    }
    if (request.body.apiId !== PRESETS_OPENAI_API_ID) {
        return response.sendStatus(400);
    }

    try {
        const writeState = await getCanonicalPresetsWriteState(request);
        if (!writeState.ok) {
            return sendCanonicalUnavailable(response, writeState);
        }

        const result = upsertCanonicalPreset(writeState.db, {
            apiId: PRESETS_OPENAI_API_ID,
            name,
            payload: request.body.preset,
            source: 'user',
        });
        if (!result.ok) {
            return response.status(409).send({ error: 'preset_conflict', revision: result.revision });
        }
        return response.send({ name });
    } catch (error) {
        console.error('Preset could not be saved', error);
        return response.sendStatus(500);
    }
});

router.post('/delete', async function (request, response) {
    const name = sanitize(request.body.name);
    if (!name) {
        return response.sendStatus(400);
    }
    if (request.body.apiId !== PRESETS_OPENAI_API_ID) {
        return response.sendStatus(400);
    }

    try {
        const writeState = await getCanonicalPresetsWriteState(request);
        if (!writeState.ok) {
            return sendCanonicalUnavailable(response, writeState);
        }

        const result = deleteCanonicalPreset(writeState.db, { apiId: PRESETS_OPENAI_API_ID, name });
        return result.deleted ? response.sendStatus(200) : response.sendStatus(404);
    } catch (error) {
        console.error('Preset could not be deleted', error);
        return response.sendStatus(500);
    }
});

router.post('/restore', function (request, response) {
    try {
        const name = sanitize(request.body.name);
        const defaultPresets = getDefaultPresets(request.user.directories);
        const defaultPreset = defaultPresets.find(p => p.name === name && p.type === 'openai_preset');

        const result = { isDefault: false, preset: {} };

        if (defaultPreset) {
            result.isDefault = true;
            result.preset = getDefaultPresetFile(defaultPreset.filename) || {};
        }

        return response.send(result);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

// Kept for route tests that exercise the canonical state resolution directly.
export { getCanonicalPresetsWriteState };
