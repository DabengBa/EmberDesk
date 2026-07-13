import crypto from 'node:crypto';

import { withCanonicalTransaction } from '../canonical-sqlite.js';
import { uuidv4 } from '../util.js';

export const SECRET_MIGRATION_MARKER = 'secret_records_import';

function normalizeRecord(row) {
    return {
        id: String(row.id),
        key: String(row.secret_key),
        value: String(row.value),
        label: String(row.label ?? ''),
        active: Boolean(row.active),
        createdAtMs: Number(row.created_at_ms),
        updatedAtMs: Number(row.updated_at_ms),
    };
}

function getSecretRows(db, key = null) {
    const query = key == null
        ? `
            SELECT id, secret_key, value, label, active, created_at_ms, updated_at_ms
            FROM secret_records
            ORDER BY secret_key ASC, created_at_ms ASC, id ASC
        `
        : `
            SELECT id, secret_key, value, label, active, created_at_ms, updated_at_ms
            FROM secret_records
            WHERE secret_key = ?
            ORDER BY created_at_ms ASC, id ASC
        `;
    try {
        return key == null ? db.prepare(query).all() : db.prepare(query).all(String(key));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: secret_records')) {
            return [];
        }
        throw error;
    }
}

export function hashCanonicalSecretValue(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function getCanonicalSecretRecords(db, key) {
    return getSecretRows(db, key).map(normalizeRecord);
}

export function getCanonicalSecrets(db) {
    const result = {};
    for (const row of getSecretRows(db)) {
        const record = normalizeRecord(row);
        result[record.key] ??= [];
        result[record.key].push({
            id: record.id,
            value: record.value,
            label: record.label,
            active: record.active,
        });
    }
    return result;
}

export function getCanonicalSecret(db, key, id = null) {
    const records = getCanonicalSecretRecords(db, key);
    return records.find(record => id ? record.id === id : record.active) ?? null;
}

export function getSecretMigrationMarker(db, markerKey = SECRET_MIGRATION_MARKER) {
    try {
        const row = db.prepare(`
            SELECT marker_key, source_hash, imported_at_ms
            FROM secret_migration_markers
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
        if (String(error?.message ?? '').includes('no such table: secret_migration_markers')) {
            return null;
        }
        throw error;
    }
}

export function setSecretMigrationMarker(db, {
    markerKey = SECRET_MIGRATION_MARKER,
    sourceHash = '',
    nowMs = Date.now(),
} = {}) {
    db.prepare(`
        INSERT INTO secret_migration_markers (marker_key, source_hash, imported_at_ms)
        VALUES (?, ?, ?)
        ON CONFLICT(marker_key) DO UPDATE SET
            source_hash = excluded.source_hash,
            imported_at_ms = excluded.imported_at_ms
    `).run(String(markerKey), String(sourceHash), Number(nowMs));
}

export function writeCanonicalSecret(db, {
    key,
    value,
    label = 'Unlabeled',
    id = null,
    nowMs = Date.now(),
} = {}) {
    if (!key || typeof value !== 'string') {
        throw new Error('Canonical secret key and value are required');
    }
    const secretId = id ?? uuidv4();
    return withCanonicalTransaction(db, txnDb => {
        txnDb.prepare(`
            UPDATE secret_records
            SET active = 0, updated_at_ms = ?
            WHERE secret_key = ? AND active = 1
        `).run(Number(nowMs), String(key));
        txnDb.prepare(`
            INSERT INTO secret_records (
                id, secret_key, value, label, active, created_at_ms, updated_at_ms
            ) VALUES (?, ?, ?, ?, 1, ?, ?)
        `).run(
            String(secretId),
            String(key),
            value,
            String(label ?? 'Unlabeled'),
            Number(nowMs),
            Number(nowMs),
        );
        return secretId;
    });
}

export function replaceCanonicalSecretRecords(db, {
    recordsByKey,
    sourceHash = '',
    nowMs = Date.now(),
} = {}) {
    const normalized = recordsByKey ?? {};
    return withCanonicalTransaction(db, txnDb => {
        txnDb.exec('DELETE FROM secret_records');
        const insert = txnDb.prepare(`
            INSERT INTO secret_records (
                id, secret_key, value, label, active, created_at_ms, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const [key, records] of Object.entries(normalized)) {
            for (const record of records) {
                insert.run(
                    String(record.id),
                    String(key),
                    String(record.value),
                    String(record.label ?? key),
                    record.active ? 1 : 0,
                    Number(record.createdAtMs ?? nowMs),
                    Number(record.updatedAtMs ?? nowMs),
                );
            }
        }
        setSecretMigrationMarker(txnDb, {
            sourceHash,
            nowMs,
        });
    });
}

export function deleteCanonicalSecret(db, {
    key,
    id = null,
    nowMs = Date.now(),
} = {}) {
    return withCanonicalTransaction(db, txnDb => {
        const target = id == null
            ? txnDb.prepare(`
                SELECT id, active
                FROM secret_records
                WHERE secret_key = ? AND active = 1
                ORDER BY created_at_ms ASC, id ASC
                LIMIT 1
            `).get(String(key))
            : txnDb.prepare(`
                SELECT id, active
                FROM secret_records
                WHERE secret_key = ? AND id = ?
            `).get(String(key), String(id));
        if (!target) {
            return false;
        }

        txnDb.prepare('DELETE FROM secret_records WHERE id = ?').run(String(target.id));
        if (target.active) {
            const replacement = txnDb.prepare(`
                SELECT id
                FROM secret_records
                WHERE secret_key = ?
                ORDER BY created_at_ms ASC, id ASC
                LIMIT 1
            `).get(String(key));
            if (replacement) {
                txnDb.prepare(`
                    UPDATE secret_records
                    SET active = 1, updated_at_ms = ?
                    WHERE id = ?
                `).run(Number(nowMs), String(replacement.id));
            }
        }
        return true;
    });
}

export function rotateCanonicalSecret(db, {
    key,
    id,
    nowMs = Date.now(),
} = {}) {
    return withCanonicalTransaction(db, txnDb => {
        const target = txnDb.prepare(`
            SELECT id
            FROM secret_records
            WHERE secret_key = ? AND id = ?
        `).get(String(key), String(id));
        if (!target) {
            return false;
        }
        txnDb.prepare(`
            UPDATE secret_records
            SET active = 0, updated_at_ms = ?
            WHERE secret_key = ? AND active = 1
        `).run(Number(nowMs), String(key));
        txnDb.prepare(`
            UPDATE secret_records
            SET active = 1, updated_at_ms = ?
            WHERE id = ?
        `).run(Number(nowMs), String(target.id));
        return true;
    });
}

export function renameCanonicalSecret(db, {
    key,
    id,
    label,
    nowMs = Date.now(),
} = {}) {
    const result = db.prepare(`
        UPDATE secret_records
        SET label = ?, updated_at_ms = ?
        WHERE secret_key = ? AND id = ?
    `).run(String(label), Number(nowMs), String(key), String(id));
    return Number(result.changes) > 0;
}

export function recordSecretProjectionRepair(db, {
    repairKey,
    key,
    recordId = null,
    operation,
    errorClass,
    nowMs = Date.now(),
} = {}) {
    db.prepare(`
        INSERT INTO secret_projection_repairs (
            repair_key, secret_key, record_id, operation, error_class,
            created_at_ms, updated_at_ms, last_attempt_at_ms, resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(repair_key) DO UPDATE SET
            secret_key = excluded.secret_key,
            record_id = excluded.record_id,
            operation = excluded.operation,
            error_class = excluded.error_class,
            updated_at_ms = excluded.updated_at_ms,
            resolved_at_ms = NULL
    `).run(
        String(repairKey),
        String(key ?? ''),
        recordId == null ? null : String(recordId),
        String(operation ?? 'unknown'),
        String(errorClass ?? 'Error'),
        Number(nowMs),
        Number(nowMs),
    );
}

export function resolveSecretProjectionRepair(db, {
    repairKey,
    resolvedAtMs = Date.now(),
} = {}) {
    return db.prepare(`
        UPDATE secret_projection_repairs
        SET resolved_at_ms = ?,
            updated_at_ms = ?,
            last_attempt_at_ms = ?
        WHERE repair_key = ?
    `).run(Number(resolvedAtMs), Number(resolvedAtMs), Number(resolvedAtMs), String(repairKey));
}

export function listOpenSecretProjectionRepairs(db) {
    try {
        return db.prepare(`
            SELECT
                repair_key, secret_key, record_id, operation, error_class,
                created_at_ms, updated_at_ms, last_attempt_at_ms, resolved_at_ms
            FROM secret_projection_repairs
            WHERE resolved_at_ms IS NULL
            ORDER BY created_at_ms ASC, repair_key ASC
        `).all().map(row => ({
            repairKey: String(row.repair_key),
            key: String(row.secret_key),
            recordId: row.record_id == null ? null : String(row.record_id),
            operation: String(row.operation),
            errorClass: String(row.error_class),
            createdAtMs: Number(row.created_at_ms),
            updatedAtMs: Number(row.updated_at_ms),
            lastAttemptAtMs: row.last_attempt_at_ms == null ? null : Number(row.last_attempt_at_ms),
            resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
        }));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: secret_projection_repairs')) {
            return [];
        }
        throw error;
    }
}
