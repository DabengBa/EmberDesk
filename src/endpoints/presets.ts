import express from 'express';
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import sanitize from 'sanitize-filename';

import { canonicalSqliteManager } from '../canonical-sqlite.ts';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.ts';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.ts';
import { ensureCanonicalSliceBackend } from '../canonical-backend.ts';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import { getDefaultPresetFile, getDefaultPresets } from './content-manager.ts';
import type { ContentItem } from './content-manager.ts';
import {
    deleteCanonicalPreset,
    listCanonicalPresets,
    PRESETS_OPENAI_API_ID,
    upsertCanonicalPreset,
} from './presets-store.ts';

type PresetRequest = Request & { user: Request['user'] & { handle?: string } };
// Describes the existing request contract; it does not add runtime validation.
type PresetBody = { name: string; apiId?: unknown; preset?: unknown; expectedRevision?: unknown };
type PresetWriteState =
    | { ok: true; db: DatabaseSync; handle: string }
    | { ok: false; reason: string };

function getRequestHandle(request: PresetRequest): string {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function canReadCanonicalFeatureFlags() {
    if (globalThis.COMMAND_LINE_ARGS != null) {
        return true;
    }
    return Object.keys(process.env).some(key => key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_'));
}

function sendCanonicalUnavailable(response: Response, state: { reason?: string | null }) {
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
async function getCanonicalPresetsWriteState(request: PresetRequest): Promise<PresetWriteState> {
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
export async function getCanonicalPresetsReadState(request: PresetRequest) {
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

export const router = express.Router();

router.post<Record<string, string>, unknown, PresetBody>('/save', async function (request, response) {
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
            expectedRevision: request.body.expectedRevision ?? 0,
        });
        if (!result.ok) {
            return response.status(409).send({ error: 'preset_conflict', revision: result.revision });
        }
        return response.send({ name, revision: result.revision });
    } catch (error) {
        console.error('Preset could not be saved', error);
        return response.sendStatus(500);
    }
});

router.post<Record<string, string>, unknown, PresetBody>('/delete', async function (request, response) {
    const { name: rawName, apiId, expectedRevision }: Partial<PresetBody> = request.body ?? {};
    const name = typeof rawName === 'string' ? sanitize(rawName) : '';
    if (!name || apiId !== PRESETS_OPENAI_API_ID) {
        return response.sendStatus(400);
    }
    if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        return response.sendStatus(400);
    }

    try {
        const writeState = await getCanonicalPresetsWriteState(request);
        if (!writeState.ok) {
            return sendCanonicalUnavailable(response, writeState);
        }

        const result = deleteCanonicalPreset(writeState.db, { apiId: PRESETS_OPENAI_API_ID, name, expectedRevision });
        if (!result.ok) {
            return response.status(409).send({ error: 'preset_conflict', revision: result.revision });
        }
        return result.deleted ? response.sendStatus(200) : response.sendStatus(404);
    } catch (error) {
        console.error('Preset could not be deleted', error);
        return response.sendStatus(500);
    }
});

router.post<Record<string, string>, unknown, PresetBody>('/restore', function (request, response) {
    try {
        const name = sanitize(request.body.name);
        // The legacy JS function declares object[] although it returns ContentItem[].
        const defaultPresets = getDefaultPresets(request.user.directories) as ContentItem[];
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
