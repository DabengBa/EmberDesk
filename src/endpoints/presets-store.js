import { stableSettingsPayloadJson, hashSettingsPayload } from './settings-store.js';

export const PRESETS_OPENAI_API_ID = 'openai';

function normalizePresetName(name) {
    return String(name ?? '').trim();
}

function mapPresetRow(row) {
    return {
        apiId: String(row.api_id),
        name: String(row.name),
        payloadJson: String(row.payload_json),
        revision: Number(row.revision),
        contentHash: String(row.content_hash),
        source: String(row.source ?? 'user'),
        createdAtMs: Number(row.created_at_ms),
        updatedAtMs: Number(row.updated_at_ms),
    };
}

/**
 * Lists canonical presets for an API id, ordered like the retired directory
 * read (`localeCompare` on the display name).
 * @returns {{apiId: string, name: string, payloadJson: string, revision: number,
 *   contentHash: string, source: string, createdAtMs: number, updatedAtMs: number}[]}
 */
export function listCanonicalPresets(db, { apiId = PRESETS_OPENAI_API_ID } = {}) {
    const rows = db.prepare(`
        SELECT api_id, name, payload_json, revision, content_hash, source, created_at_ms, updated_at_ms
        FROM preset_documents
        WHERE api_id = ?
    `).all(String(apiId));
    return rows.map(mapPresetRow).sort((a, b) => a.name.localeCompare(b.name));
}

export function getCanonicalPreset(db, { apiId = PRESETS_OPENAI_API_ID, name } = {}) {
    const row = db.prepare(`
        SELECT api_id, name, payload_json, revision, content_hash, source, created_at_ms, updated_at_ms
        FROM preset_documents
        WHERE api_id = ? AND name = ?
    `).get(String(apiId), normalizePresetName(name));
    return row ? mapPresetRow(row) : null;
}

/**
 * Upserts a preset document. Revisions are monotonic per (api_id, name); when
 * `expectedRevision` is provided a mismatch is a conflict, not a write.
 * @returns {{ok: true, conflicted?: false, revision: number, contentHash: string,
 *   created: boolean, preset: object} | {ok: false, conflicted: true, revision: number}}
 */
export function upsertCanonicalPreset(db, {
    apiId = PRESETS_OPENAI_API_ID,
    name,
    payload,
    source = 'user',
    expectedRevision = null,
    nowMs = Date.now(),
} = {}) {
    const resolvedName = normalizePresetName(name);
    if (!resolvedName) {
        throw new Error('Preset name is required.');
    }
    const payloadJson = typeof payload === 'string' ? payload : stableSettingsPayloadJson(payload);
    const contentHash = hashSettingsPayload(payloadJson);
    const existing = db.prepare(`
        SELECT revision FROM preset_documents WHERE api_id = ? AND name = ?
    `).get(String(apiId), resolvedName);

    if (expectedRevision != null && Number(existing?.revision ?? 0) !== Number(expectedRevision)) {
        return { ok: false, conflicted: true, revision: Number(existing?.revision ?? 0) };
    }

    const nextRevision = Number(existing?.revision ?? 0) + 1;
    db.prepare(`
        INSERT INTO preset_documents
            (api_id, name, payload_json, revision, content_hash, source, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(api_id, name) DO UPDATE SET
            payload_json = excluded.payload_json,
            revision = excluded.revision,
            content_hash = excluded.content_hash,
            source = excluded.source,
            updated_at_ms = excluded.updated_at_ms
    `).run(
        String(apiId), resolvedName, payloadJson, nextRevision, contentHash,
        String(source), Number(nowMs), Number(nowMs),
    );
    return {
        ok: true,
        revision: nextRevision,
        contentHash,
        created: !existing,
        preset: getCanonicalPreset(db, { apiId, name: resolvedName }),
    };
}

/**
 * Inserts a preset only when the name is absent — the canonical counterpart of
 * the content-seeding "copy when the target file does not exist" semantics.
 * @returns {{ok: true, inserted: boolean, preset: object|null}}
 */
export function ensureCanonicalPreset(db, {
    apiId = PRESETS_OPENAI_API_ID,
    name,
    payload,
    source = 'seed',
    nowMs = Date.now(),
} = {}) {
    const resolvedName = normalizePresetName(name);
    if (!resolvedName) {
        return { ok: true, inserted: false, preset: null };
    }
    const existing = getCanonicalPreset(db, { apiId, name: resolvedName });
    if (existing) {
        return { ok: true, inserted: false, preset: existing };
    }
    const result = upsertCanonicalPreset(db, { apiId, name: resolvedName, payload, source, nowMs });
    return { ok: result.ok, inserted: result.ok === true, preset: result.preset ?? null };
}

export function deleteCanonicalPreset(db, { apiId = PRESETS_OPENAI_API_ID, name } = {}) {
    const result = db.prepare(`
        DELETE FROM preset_documents WHERE api_id = ? AND name = ?
    `).run(String(apiId), normalizePresetName(name));
    return { ok: true, deleted: Number(result.changes) > 0 };
}

export function getPresetMigrationMarker(db, markerKey) {
    try {
        const row = db.prepare(`
            SELECT marker_key, source_hash, imported_at_ms
            FROM preset_migration_markers
            WHERE marker_key = ?
        `).get(String(markerKey));
        if (!row) {
            return null;
        }
        return {
            markerKey: String(row.marker_key),
            sourceHash: String(row.source_hash ?? ''),
            importedAtMs: Number(row.imported_at_ms),
        };
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: preset_migration_markers')) {
            return null;
        }
        throw error;
    }
}

export function setPresetMigrationMarker(db, {
    markerKey,
    sourceHash = '',
    nowMs = Date.now(),
} = {}) {
    db.prepare(`
        INSERT INTO preset_migration_markers (marker_key, source_hash, imported_at_ms)
        VALUES (?, ?, ?)
        ON CONFLICT(marker_key) DO UPDATE SET
            source_hash = excluded.source_hash,
            imported_at_ms = excluded.imported_at_ms
    `).run(String(markerKey), String(sourceHash), Number(nowMs));
}

/**
 * One-shot file import for the init pass. A marked file is never re-consumed —
 * the file is inert afterwards. When the marker is lost (e.g. rebuilt DB) the
 * guarded upsert still refuses to overwrite a diverging existing row, so a
 * stale file can never win over newer canonical data.
 * @returns {{status: 'imported'|'skipped_marker'|'skipped_conflict'|'unchanged'|'error',
 *   preset?: object, errorClass?: string}}
 */
export function importPresetFile(db, {
    apiId = PRESETS_OPENAI_API_ID,
    name,
    payloadJson,
    markerKey,
    sourceHash = '',
    nowMs = Date.now(),
} = {}) {
    const resolvedName = normalizePresetName(name);
    if (!resolvedName) {
        return { status: 'error', errorClass: 'invalid_preset_name' };
    }
    if (getPresetMigrationMarker(db, markerKey)) {
        return { status: 'skipped_marker' };
    }

    const contentHash = hashSettingsPayload(payloadJson);
    const existing = getCanonicalPreset(db, { apiId, name: resolvedName });
    if (existing && existing.contentHash !== contentHash) {
        setPresetMigrationMarker(db, { markerKey, sourceHash, nowMs });
        return { status: 'skipped_conflict', preset: existing };
    }
    if (existing) {
        setPresetMigrationMarker(db, { markerKey, sourceHash, nowMs });
        return { status: 'unchanged', preset: existing };
    }

    const result = upsertCanonicalPreset(db, {
        apiId,
        name: resolvedName,
        payload: payloadJson,
        source: 'import',
        nowMs,
    });
    setPresetMigrationMarker(db, { markerKey, sourceHash, nowMs });
    return { status: 'imported', preset: result.preset };
}
