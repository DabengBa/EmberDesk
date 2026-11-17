import crypto from 'node:crypto';
import path from 'node:path';

import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import { withCanonicalTransaction } from '../canonical-sqlite.ts';
import { uuidv4 } from '../util.js';

type Row = Record<string, SQLOutputValue>;
type MediaRecord = { compatibilityPath: string; contentHash: unknown; sizeBytes: unknown; mediaType?: unknown; managedRelativePath?: unknown; ownerType: unknown; ownerId?: unknown; role?: unknown; displayName?: unknown; metadata?: unknown; nowMs?: unknown };
type RepairOptions = { repairKey?: unknown; blobId?: unknown; mediaReferenceId?: unknown; operation?: unknown; reason?: unknown; details?: unknown; nowMs?: number };
type Reference = ReturnType<typeof normalizeReference>;
type PersistResult = { status: string; reference: Reference | null };

function parseJson(value: unknown): unknown {
    try {
        return JSON.parse(String(value ?? '{}'));
    } catch {
        return {};
    }
}

function normalizePath(value: unknown) {
    return String(value ?? '').split(path.sep).join(path.posix.sep);
}

function normalizeReference(row: Row) {
    return {
        id: String(row.reference_id),
        blobId: String(row.blob_id),
        contentHash: String(row.content_hash),
        sizeBytes: Number(row.size_bytes),
        mediaType: String(row.media_type),
        managedRelativePath: String(row.relative_path),
        lifecycleState: String(row.lifecycle_state),
        ownerType: String(row.owner_type),
        ownerId: String(row.owner_id),
        role: String(row.role),
        displayName: String(row.display_name ?? ''),
        compatibilityPath: String(row.compatibility_path),
        metadata: parseJson(row.metadata_json),
        createdAtMs: Number(row.created_at_ms),
        updatedAtMs: Number(row.updated_at_ms),
        deletedAtMs: row.deleted_at_ms == null ? null : Number(row.deleted_at_ms),
    };
}

function getReferenceRow(db: DatabaseSync, compatibilityPath: string) {
    return db.prepare(`
        SELECT
            media_references.id AS reference_id,
            media_references.blob_id,
            media_references.owner_type,
            media_references.owner_id,
            media_references.role,
            media_references.display_name,
            media_references.compatibility_path,
            media_references.metadata_json,
            media_references.created_at_ms,
            media_references.updated_at_ms,
            media_references.deleted_at_ms,
            managed_blobs.content_hash,
            managed_blobs.size_bytes,
            managed_blobs.media_type,
            managed_blobs.relative_path,
            managed_blobs.lifecycle_state
        FROM media_references
        JOIN managed_blobs ON managed_blobs.id = media_references.blob_id
        WHERE media_references.compatibility_path = ?
    `).get(compatibilityPath);
}

function getBlobByHash(db: DatabaseSync, contentHash: string) {
    return db.prepare(`
        SELECT id, content_hash, size_bytes, media_type, relative_path, lifecycle_state
        FROM managed_blobs
        WHERE content_hash = ?
    `).get(contentHash);
}

function isSameReference(existing: Reference | null, record: { contentHash: string; sizeBytes: number; mediaType: string; managedRelativePath: string; ownerType: string; ownerId: string; role: string; displayName: string; metadata: unknown }) {
    return existing
        && existing.contentHash === record.contentHash
        && Number(existing.sizeBytes) === Number(record.sizeBytes)
        && existing.mediaType === record.mediaType
        && existing.managedRelativePath === record.managedRelativePath
        && existing.ownerType === record.ownerType
        && existing.ownerId === record.ownerId
        && existing.role === record.role
        && existing.displayName === record.displayName
        && JSON.stringify(existing.metadata) === JSON.stringify(record.metadata ?? {});
}

export function hashCanonicalManagedMediaBuffer(contents: string | NodeJS.ArrayBufferView) {
    return crypto.createHash('sha256').update(contents).digest('hex');
}

export function listCanonicalManagedMediaReferences(db: DatabaseSync, { includeDeleted = false } = {}) {
    const rows = db.prepare(`
        SELECT
            media_references.id AS reference_id,
            media_references.blob_id,
            media_references.owner_type,
            media_references.owner_id,
            media_references.role,
            media_references.display_name,
            media_references.compatibility_path,
            media_references.metadata_json,
            media_references.created_at_ms,
            media_references.updated_at_ms,
            media_references.deleted_at_ms,
            managed_blobs.content_hash,
            managed_blobs.size_bytes,
            managed_blobs.media_type,
            managed_blobs.relative_path,
            managed_blobs.lifecycle_state
        FROM media_references
        JOIN managed_blobs ON managed_blobs.id = media_references.blob_id
        ${includeDeleted ? '' : 'WHERE media_references.deleted_at_ms IS NULL'}
        ORDER BY media_references.compatibility_path COLLATE NOCASE ASC
    `).all();
    return rows.map(normalizeReference);
}

export function getCanonicalManagedMediaReference(db: DatabaseSync, compatibilityPath: unknown) {
    const row = getReferenceRow(db, normalizePath(compatibilityPath));
    return row ? normalizeReference(row) : null;
}

/**
 * Shadow import only registers an existing compatibility file. The stored
 * relative path intentionally remains that compatibility path until write
 * cutover establishes the managed content root.
 */
export function upsertCanonicalManagedMediaReference(db: DatabaseSync, record: MediaRecord, { onPersist = null }: { onPersist?: ((db: DatabaseSync, result: PersistResult) => void) | null } = {}) {
    const normalized = {
        compatibilityPath: normalizePath(record.compatibilityPath),
        contentHash: String(record.contentHash),
        sizeBytes: Number(record.sizeBytes),
        mediaType: String(record.mediaType || 'application/octet-stream'),
        managedRelativePath: normalizePath(record.managedRelativePath ?? record.compatibilityPath),
        ownerType: String(record.ownerType),
        ownerId: String(record.ownerId ?? record.compatibilityPath),
        role: String(record.role ?? record.ownerType),
        displayName: String(record.displayName ?? path.posix.basename(record.compatibilityPath)),
        metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
        nowMs: Number(record.nowMs ?? Date.now()),
    };
    return withCanonicalTransaction(db, (txnDb: DatabaseSync) => {
        const existing = getCanonicalManagedMediaReference(txnDb, normalized.compatibilityPath);
        if (existing && isSameReference(existing, normalized) && existing.deletedAtMs == null) {
            const result = { status: 'unchanged', reference: existing };
            onPersist?.(txnDb, result);
            return result;
        }
        const existingBlob = getBlobByHash(txnDb, normalized.contentHash);
        const blobId = existingBlob?.id ?? uuidv4();
        txnDb.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path,
                lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, NULL)
            ON CONFLICT(content_hash) DO UPDATE SET
                size_bytes = excluded.size_bytes,
                media_type = excluded.media_type,
                relative_path = excluded.relative_path,
                lifecycle_state = 'active',
                updated_at_ms = excluded.updated_at_ms,
                deleted_at_ms = NULL
        `).run(
            blobId,
            normalized.contentHash,
            normalized.sizeBytes,
            normalized.mediaType,
            normalized.managedRelativePath,
            normalized.nowMs,
            normalized.nowMs,
        );

        const referenceId = existing?.id ?? uuidv4();
        txnDb.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name,
                compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(compatibility_path) DO UPDATE SET
                blob_id = excluded.blob_id,
                owner_type = excluded.owner_type,
                owner_id = excluded.owner_id,
                role = excluded.role,
                display_name = excluded.display_name,
                metadata_json = excluded.metadata_json,
                updated_at_ms = excluded.updated_at_ms,
                deleted_at_ms = NULL
        `).run(
            referenceId,
            blobId,
            normalized.ownerType,
            normalized.ownerId,
            normalized.role,
            normalized.displayName,
            normalized.compatibilityPath,
            JSON.stringify(normalized.metadata),
            existing?.createdAtMs ?? normalized.nowMs,
            normalized.nowMs,
        );
        const saved = getCanonicalManagedMediaReference(txnDb, normalized.compatibilityPath);
        const result = { status: existing ? 'updated' : 'imported', reference: saved };
        onPersist?.(txnDb, result);
        return result;
    });
}

export function listOpenCanonicalManagedMediaRepairs(db: DatabaseSync) {
    try {
        return db.prepare(`
            SELECT repair_key, blob_id, media_reference_id, operation, reason, details_json,
                created_at_ms, updated_at_ms, last_attempt_at_ms, resolved_at_ms
            FROM managed_media_repairs
            WHERE resolved_at_ms IS NULL
            ORDER BY created_at_ms ASC, repair_key ASC
        `).all().map(row => ({
            repairKey: String(row.repair_key),
            blobId: row.blob_id == null ? null : String(row.blob_id),
            mediaReferenceId: row.media_reference_id == null ? null : String(row.media_reference_id),
            operation: String(row.operation),
            reason: String(row.reason),
            details: parseJson(row.details_json),
            createdAtMs: Number(row.created_at_ms),
            updatedAtMs: Number(row.updated_at_ms),
            lastAttemptAtMs: row.last_attempt_at_ms == null ? null : Number(row.last_attempt_at_ms),
            resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
        }));
    } catch (error) {
        if (String((error as { message?: unknown } | null)?.message ?? '').includes('no such table: managed_media_repairs')) {
            return [];
        }
        throw error;
    }
}

export function recordCanonicalManagedMediaRepair(db: DatabaseSync, {
    repairKey,
    blobId = null,
    mediaReferenceId = null,
    operation,
    reason,
    details = {},
    nowMs = Date.now(),
}: RepairOptions = {}) {
    db.prepare(`
        INSERT INTO managed_media_repairs (
            repair_key, blob_id, media_reference_id, operation, reason, details_json,
            created_at_ms, updated_at_ms, last_attempt_at_ms, resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(repair_key) DO UPDATE SET
            blob_id = excluded.blob_id,
            media_reference_id = excluded.media_reference_id,
            operation = excluded.operation,
            reason = excluded.reason,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            resolved_at_ms = NULL
    `).run(
        String(repairKey),
        blobId == null ? null : String(blobId),
        mediaReferenceId == null ? null : String(mediaReferenceId),
        String(operation),
        String(reason),
        JSON.stringify(details ?? {}),
        Number(nowMs),
        Number(nowMs),
    );
}

export function resolveCanonicalManagedMediaRepair(db: DatabaseSync, {
    repairKey,
    resolvedAtMs = Date.now(),
}: { repairKey?: unknown; resolvedAtMs?: number } = {}) {
    return db.prepare(`
        UPDATE managed_media_repairs
        SET resolved_at_ms = ?,
            updated_at_ms = ?,
            last_attempt_at_ms = ?
        WHERE repair_key = ?
            AND resolved_at_ms IS NULL
    `).run(Number(resolvedAtMs), Number(resolvedAtMs), Number(resolvedAtMs), String(repairKey));
}

export function markCanonicalManagedMediaRepairAttempt(db: DatabaseSync, {
    repairKey,
    attemptedAtMs = Date.now(),
}: { repairKey?: unknown; attemptedAtMs?: number } = {}) {
    return db.prepare(`
        UPDATE managed_media_repairs
        SET last_attempt_at_ms = ?,
            updated_at_ms = ?
        WHERE repair_key = ?
            AND resolved_at_ms IS NULL
    `).run(Number(attemptedAtMs), Number(attemptedAtMs), String(repairKey));
}
