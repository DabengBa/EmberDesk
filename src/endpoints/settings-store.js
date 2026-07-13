import crypto from 'node:crypto';

import { withCanonicalTransaction } from '../canonical-sqlite.js';
import { uuidv4 } from '../util.js';

function parseRequiredJson(value, fieldName) {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a JSON string`);
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`${fieldName} is not valid JSON: ${error?.message ?? error}`);
    }
}

function cloneJson(payload) {
    return structuredClone(payload);
}

export function stableSettingsPayloadJson(payload) {
    // Preserve object key order as provided by JSON.parse/JSON.stringify of the
    // source document. Do not re-sort keys; settings.json identity is full text
    // shape for projection, while content_hash uses the same serialization path.
    return JSON.stringify(payload);
}

export function hashSettingsPayload(payloadOrJson) {
    const payloadJson = typeof payloadOrJson === 'string'
        ? payloadOrJson
        : stableSettingsPayloadJson(payloadOrJson);
    return crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
}

function getSettingsDocumentRow(db, userId) {
    let row = null;
    try {
        row = db.prepare(`
            SELECT user_id, revision, payload_json, content_hash, updated_at_ms
            FROM settings_documents
            WHERE user_id = ?
        `).get(String(userId));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: settings_documents')) {
            return null;
        }
        throw error;
    }
    return row ?? null;
}

export function getCanonicalSettingsRevision(db, { userId } = {}) {
    const row = getSettingsDocumentRow(db, userId);
    return row ? Number(row.revision) : 0;
}

export function getCanonicalSettingsDocument(db, { userId } = {}) {
    const row = getSettingsDocumentRow(db, userId);
    if (!row) {
        return null;
    }
    return {
        userId: String(row.user_id),
        revision: Number(row.revision),
        payload: parseRequiredJson(row.payload_json, 'payload_json'),
        payloadJson: String(row.payload_json),
        contentHash: String(row.content_hash),
        updatedAtMs: Number(row.updated_at_ms),
    };
}

/**
 * Upsert the full settings document with optimistic revision control.
 * expectedRevision = 0 means "no existing document".
 *
 * @returns {{ok: true, revision: number, contentHash: string, updatedAtMs: number, payload: object, payloadJson: string}
 *   | {ok: false, conflict: true, currentRevision: number, current?: object}}
 */
export function upsertCanonicalSettingsDocument(db, {
    userId,
    payload,
    expectedRevision,
    nowMs = Date.now(),
    payloadJson = null,
} = {}) {
    if (!userId) {
        throw new Error('userId is required');
    }
    if (payload == null && payloadJson == null) {
        throw new Error('payload is required');
    }

    const resolvedPayload = payload != null
        ? cloneJson(payload)
        : parseRequiredJson(payloadJson, 'payloadJson');
    const resolvedPayloadJson = payloadJson != null
        ? String(payloadJson)
        : stableSettingsPayloadJson(resolvedPayload);
    const contentHash = hashSettingsPayload(resolvedPayloadJson);
    const expected = Number(expectedRevision);

    return withCanonicalTransaction(db, txnDb => {
        const existing = getSettingsDocumentRow(txnDb, userId);
        const currentRevision = existing ? Number(existing.revision) : 0;
        if (currentRevision !== expected) {
            return {
                ok: false,
                conflict: true,
                currentRevision,
                current: existing
                    ? {
                        userId: String(existing.user_id),
                        revision: currentRevision,
                        payload: parseRequiredJson(existing.payload_json, 'payload_json'),
                        payloadJson: String(existing.payload_json),
                        contentHash: String(existing.content_hash),
                        updatedAtMs: Number(existing.updated_at_ms),
                    }
                    : null,
            };
        }

        const nextRevision = currentRevision + 1;
        txnDb.prepare(`
            INSERT INTO settings_documents (
                user_id,
                revision,
                payload_json,
                content_hash,
                updated_at_ms
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                revision = excluded.revision,
                payload_json = excluded.payload_json,
                content_hash = excluded.content_hash,
                updated_at_ms = excluded.updated_at_ms
        `).run(
            String(userId),
            nextRevision,
            resolvedPayloadJson,
            contentHash,
            Number(nowMs),
        );

        return {
            ok: true,
            revision: nextRevision,
            contentHash,
            updatedAtMs: Number(nowMs),
            payload: resolvedPayload,
            payloadJson: resolvedPayloadJson,
        };
    });
}

export function recordSettingsProjectionRepair(db, {
    repairKey,
    userId,
    reason,
    details = {},
    nowMs = Date.now(),
} = {}) {
    db.prepare(`
        INSERT INTO settings_projection_repairs (
            repair_key,
            user_id,
            reason,
            details_json,
            created_at_ms,
            updated_at_ms,
            last_attempt_at_ms,
            resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(repair_key) DO UPDATE SET
            user_id = excluded.user_id,
            reason = excluded.reason,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            resolved_at_ms = NULL
    `).run(
        String(repairKey),
        String(userId),
        String(reason ?? ''),
        JSON.stringify(details ?? {}),
        Number(nowMs),
        Number(nowMs),
    );
}

export function resolveSettingsProjectionRepair(db, {
    repairKey,
    resolvedAtMs = Date.now(),
} = {}) {
    return db.prepare(`
        UPDATE settings_projection_repairs
        SET resolved_at_ms = ?,
            updated_at_ms = ?,
            last_attempt_at_ms = ?
        WHERE repair_key = ?
    `).run(
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        String(repairKey),
    );
}

export function listOpenSettingsProjectionRepairs(db) {
    let rows = [];
    try {
        rows = db.prepare(`
            SELECT
                repair_key,
                user_id,
                reason,
                details_json,
                created_at_ms,
                updated_at_ms,
                last_attempt_at_ms,
                resolved_at_ms
            FROM settings_projection_repairs
            WHERE resolved_at_ms IS NULL
            ORDER BY created_at_ms ASC, repair_key ASC
        `).all();
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: settings_projection_repairs')) {
            return [];
        }
        throw error;
    }

    return rows.map(row => ({
        repairKey: String(row.repair_key),
        userId: String(row.user_id),
        reason: String(row.reason ?? ''),
        details: parseRequiredJson(row.details_json, 'details_json'),
        createdAtMs: Number(row.created_at_ms ?? 0),
        updatedAtMs: Number(row.updated_at_ms ?? 0),
        lastAttemptAtMs: row.last_attempt_at_ms == null ? null : Number(row.last_attempt_at_ms),
        resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
    }));
}

export function createSettingsSnapshot(db, {
    userId,
    sourceRevision = null,
    payload = null,
    payloadJson = null,
    name = '',
    nowMs = Date.now(),
    id = null,
} = {}) {
    let resolvedPayloadJson = payloadJson;
    let resolvedSourceRevision = sourceRevision;
    let contentHash = null;

    if (resolvedPayloadJson == null || resolvedSourceRevision == null) {
        const document = getCanonicalSettingsDocument(db, { userId });
        if (!document) {
            throw new Error(`No canonical settings document for user: ${userId}`);
        }
        resolvedPayloadJson = document.payloadJson;
        resolvedSourceRevision = document.revision;
        contentHash = document.contentHash;
    } else {
        contentHash = hashSettingsPayload(resolvedPayloadJson);
    }

    if (payload != null && resolvedPayloadJson == null) {
        resolvedPayloadJson = stableSettingsPayloadJson(payload);
        contentHash = hashSettingsPayload(resolvedPayloadJson);
    }

    const snapshotId = id ?? uuidv4();
    db.prepare(`
        INSERT INTO settings_snapshots (
            id,
            user_id,
            source_revision,
            payload_json,
            content_hash,
            name,
            created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        snapshotId,
        String(userId),
        Number(resolvedSourceRevision),
        String(resolvedPayloadJson),
        contentHash,
        String(name ?? ''),
        Number(nowMs),
    );

    return {
        id: snapshotId,
        userId: String(userId),
        sourceRevision: Number(resolvedSourceRevision),
        payloadJson: String(resolvedPayloadJson),
        contentHash,
        name: String(name ?? ''),
        createdAtMs: Number(nowMs),
    };
}

export function listSettingsSnapshots(db, { userId } = {}) {
    let rows = [];
    try {
        rows = db.prepare(`
            SELECT id, user_id, source_revision, payload_json, content_hash, name, created_at_ms
            FROM settings_snapshots
            WHERE user_id = ?
            ORDER BY created_at_ms DESC, id ASC
        `).all(String(userId));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: settings_snapshots')) {
            return [];
        }
        throw error;
    }

    return rows.map(row => ({
        id: String(row.id),
        userId: String(row.user_id),
        sourceRevision: Number(row.source_revision),
        payloadJson: String(row.payload_json),
        contentHash: String(row.content_hash),
        name: String(row.name ?? ''),
        createdAtMs: Number(row.created_at_ms),
        size: Buffer.byteLength(String(row.payload_json), 'utf8'),
    }));
}

export function getSettingsSnapshot(db, { userId, id } = {}) {
    let row = null;
    try {
        row = db.prepare(`
            SELECT id, user_id, source_revision, payload_json, content_hash, name, created_at_ms
            FROM settings_snapshots
            WHERE user_id = ? AND id = ?
        `).get(String(userId), String(id));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: settings_snapshots')) {
            return null;
        }
        throw error;
    }
    if (!row) {
        return null;
    }
    return {
        id: String(row.id),
        userId: String(row.user_id),
        sourceRevision: Number(row.source_revision),
        payloadJson: String(row.payload_json),
        payload: parseRequiredJson(row.payload_json, 'payload_json'),
        contentHash: String(row.content_hash),
        name: String(row.name ?? ''),
        createdAtMs: Number(row.created_at_ms),
        size: Buffer.byteLength(String(row.payload_json), 'utf8'),
    };
}

/**
 * Restore a snapshot as a new revision of the live document.
 * Does not rewind the revision counter.
 */
export function restoreSettingsSnapshot(db, {
    userId,
    snapshotId,
    expectedRevision = null,
    nowMs = Date.now(),
} = {}) {
    const snapshot = getSettingsSnapshot(db, { userId, id: snapshotId });
    if (!snapshot) {
        return {
            ok: false,
            notFound: true,
        };
    }

    const currentRevision = getCanonicalSettingsRevision(db, { userId });
    const expected = expectedRevision == null ? currentRevision : Number(expectedRevision);
    return upsertCanonicalSettingsDocument(db, {
        userId,
        payloadJson: snapshot.payloadJson,
        expectedRevision: expected,
        nowMs,
    });
}
