import fs from 'node:fs';
import path from 'node:path';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { withCanonicalTransaction } from '../canonical-sqlite.js';
import { getCanonicalMigrationStatus } from '../canonical-sqlite-migrations.js';
import { invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { auditCanonicalChatShadowImport } from '../canonical-chat-shadow-import.js';
import {
    createCanonicalChatSessionRecord,
    listOpenCanonicalChatProjectionRepairs,
    listCanonicalChatSessions,
    recordCanonicalChatProjectionRepair,
    serializeCanonicalChatSession,
} from './canonical-chat-store.js';
import { parseCanonicalChatJsonl } from './canonical-chat-write-service.js';
import { resolveCanonicalChatProjectionPath } from './canonical-chat-projection-path.js';

export const CANONICAL_CHAT_BACKUP_MANIFEST_VERSION = 1;
export const CANONICAL_CHAT_ATTACHMENT_MANIFEST_VERSION = 1;

function listAttachmentManifestEntries(db) {
    return db.prepare(`
        SELECT DISTINCT
            reference.blob_id,
            media.compatibility_path
        FROM chat_attachment_refs AS reference
        JOIN media_references AS media
            ON media.blob_id = reference.blob_id
            AND media.compatibility_path = json_extract(reference.compatibility_json, '$.path')
            AND media.deleted_at_ms IS NULL
        ORDER BY reference.blob_id ASC, media.compatibility_path ASC
    `).all().map(row => ({
        blobId: String(row.blob_id),
        compatibilityPath: row.compatibility_path == null ? null : String(row.compatibility_path),
    }));
}

function getCanonicalChatDatabaseRevision(db) {
    const row = db.prepare(`
        SELECT
            COUNT(*) AS session_count,
            COALESCE(MAX(updated_at_ms), 0) AS max_updated_at_ms
        FROM chat_sessions
    `).get();
    return {
        sessionCount: Number(row?.session_count ?? 0),
        maxUpdatedAtMs: Number(row?.max_updated_at_ms ?? 0),
    };
}

function createBackupSessionRows(db) {
    return listCanonicalChatSessions(db).map(session => ({
        ownerType: String(session.owner_type),
        ownerId: String(session.owner_id),
        sourcePath: String(session.source_path),
        sourceMtimeMs: Number(session.source_mtime_ms),
        jsonl: serializeCanonicalChatSession(db, String(session.id)),
    }));
}

function ensureRestoreJournalTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_restore_operations (
            restore_id TEXT PRIMARY KEY,
            manifest_version INTEGER NOT NULL,
            backup_created_at_ms INTEGER,
            status TEXT NOT NULL,
            reason_code TEXT,
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL,
            finished_at_ms INTEGER
        );
    `);
}

function writeRestoreStatus(db, {
    restoreId,
    manifestVersion,
    backupCreatedAtMs = null,
    status,
    reasonCode = null,
    details = {},
    nowMs,
    finishedAtMs = null,
}) {
    ensureRestoreJournalTable(db);
    db.prepare(`
        INSERT INTO chat_restore_operations (
            restore_id,
            manifest_version,
            backup_created_at_ms,
            status,
            reason_code,
            details_json,
            created_at_ms,
            updated_at_ms,
            finished_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(restore_id) DO UPDATE SET
            manifest_version = excluded.manifest_version,
            backup_created_at_ms = excluded.backup_created_at_ms,
            status = excluded.status,
            reason_code = excluded.reason_code,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            finished_at_ms = excluded.finished_at_ms
    `).run(
        restoreId,
        manifestVersion,
        backupCreatedAtMs,
        status,
        reasonCode,
        JSON.stringify(details),
        Number(nowMs),
        Number(nowMs),
        finishedAtMs == null ? null : Number(finishedAtMs),
    );
}

function validateBackupShape(backup) {
    if (!backup || typeof backup !== 'object') {
        return { ok: false, reasonCode: 'invalid_backup_manifest' };
    }
    if (Number(backup.manifestVersion) !== CANONICAL_CHAT_BACKUP_MANIFEST_VERSION) {
        return { ok: false, reasonCode: 'unsupported_backup_manifest_version' };
    }
    if (!Array.isArray(backup.sessions) || !backup.databaseRevision || !backup.projectionState || !backup.attachmentManifest) {
        return { ok: false, reasonCode: 'incomplete_backup_manifest' };
    }
    if (Number(backup.attachmentManifest.version) !== CANONICAL_CHAT_ATTACHMENT_MANIFEST_VERSION
        || !Array.isArray(backup.attachmentManifest.entries)) {
        return { ok: false, reasonCode: 'incomplete_attachment_manifest' };
    }
    const repairKeys = backup.projectionState.repairKeys;
    const recordedRepairKeys = backup.projectionRepairs?.map(repair => repair?.repairKey);
    if (!Number.isInteger(backup.projectionState.openRepairCount)
        || !Array.isArray(repairKeys)
        || !Array.isArray(recordedRepairKeys)
        || backup.projectionState.openRepairCount !== recordedRepairKeys.length
        || JSON.stringify([...repairKeys].sort()) !== JSON.stringify([...recordedRepairKeys].sort())) {
        return { ok: false, reasonCode: 'incomplete_projection_state' };
    }
    return { ok: true };
}

function validateAttachmentManifest(db, attachmentManifest) {
    for (const entry of attachmentManifest.entries) {
        if (!entry?.blobId || !entry?.compatibilityPath) {
            return { ok: false, reasonCode: 'incomplete_attachment_manifest' };
        }
        const active = db.prepare(`
            SELECT 1
            FROM media_references AS media
            JOIN managed_blobs AS blob
                ON blob.id = media.blob_id
                AND blob.lifecycle_state = 'active'
                AND blob.deleted_at_ms IS NULL
            WHERE media.blob_id = ?
                AND media.compatibility_path = ?
                AND media.deleted_at_ms IS NULL
            LIMIT 1
        `).get(String(entry.blobId), String(entry.compatibilityPath));
        if (!active) {
            return {
                ok: false,
                reasonCode: 'missing_attachment_reference',
                details: {
                    blobId: String(entry.blobId),
                    compatibilityPath: String(entry.compatibilityPath),
                },
            };
        }
    }
    return { ok: true };
}

function stageBackupSessions(db, backup, directories, nowMs) {
    return backup.sessions.map(session => {
        const locator = {
            ownerType: String(session.ownerType),
            ownerId: String(session.ownerId),
            sourcePath: String(session.sourcePath),
        };
        resolveCanonicalChatProjectionPath({
            directories,
            ...locator,
        });
        const payload = parseCanonicalChatJsonl(session.jsonl);
        const record = createCanonicalChatSessionRecord(db, {
            locator,
            payload,
            nowMs,
        });
        const sourceMtimeMs = Number(session.sourceMtimeMs);
        if (Number.isFinite(sourceMtimeMs) && sourceMtimeMs >= 0) {
            record.sourceMtimeMs = sourceMtimeMs;
        }
        return record;
    });
}

function recordRestoreProjectionFailure(db, {
    record,
    operation,
    error,
    nowMs,
}) {
    recordCanonicalChatProjectionRepair(db, {
        repairKey: [
            'chat',
            record.ownerType,
            record.ownerId,
            encodeURIComponent(record.sourcePath),
            operation,
        ].join(':'),
        sessionId: operation === 'delete' ? null : record.id,
        locator: {
            ownerType: record.ownerType,
            ownerId: record.ownerId,
            sourcePath: record.sourcePath,
        },
        operation,
        reason: 'restore_projection_failed',
        details: {
            message: String(error?.message ?? error ?? ''),
        },
        nowMs,
    });
}

function projectRestoredSessions(db, {
    directories,
    previousSessions,
    stagedRecords,
    nowMs,
}) {
    const restoredPaths = new Set(stagedRecords.map(record => record.sourcePath));
    const failures = [];

    for (const record of stagedRecords) {
        try {
            const filePath = resolveCanonicalChatProjectionPath({
                directories,
                ownerType: record.ownerType,
                ownerId: record.ownerId,
                sourcePath: record.sourcePath,
            });
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            writeFileAtomicSync(filePath, record.sourceJsonl, 'utf8');
        } catch (error) {
            failures.push({ operation: 'restore', sourcePath: record.sourcePath });
            recordRestoreProjectionFailure(db, {
                record,
                operation: 'restore',
                error,
                nowMs,
            });
        }
    }

    for (const session of previousSessions) {
        if (restoredPaths.has(String(session.source_path))) {
            continue;
        }
        const record = {
            id: String(session.id),
            ownerType: String(session.owner_type),
            ownerId: String(session.owner_id),
            sourcePath: String(session.source_path),
        };
        try {
            const filePath = resolveCanonicalChatProjectionPath({
                directories,
                ownerType: record.ownerType,
                ownerId: record.ownerId,
                sourcePath: record.sourcePath,
            });
            fs.rmSync(filePath, { force: true });
        } catch (error) {
            failures.push({ operation: 'delete', sourcePath: record.sourcePath });
            recordRestoreProjectionFailure(db, {
                record,
                operation: 'delete',
                error,
                nowMs,
            });
        }
    }

    return failures;
}

function restoreProjectionRepairs(db, repairs, nowMs) {
    for (const repair of repairs ?? []) {
        recordCanonicalChatProjectionRepair(db, {
            repairKey: String(repair.repairKey),
            sessionId: repair.sessionId == null ? null : String(repair.sessionId),
            locator: {
                ownerType: String(repair.ownerType),
                ownerId: String(repair.ownerId),
                sourcePath: String(repair.sourcePath),
            },
            operation: String(repair.operation),
            reason: String(repair.reason),
            details: repair.details ?? {},
            nowMs,
        });
    }
}

function insertStagedChatRecord(db, record) {
    db.prepare(`
        INSERT INTO chat_sessions (
            id,
            owner_type,
            owner_id,
            source_key,
            source_path,
            display_name,
            header_payload_json,
            source_jsonl,
            source_mtime_ms,
            source_size_bytes,
            created_at_ms,
            updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        record.id,
        record.ownerType,
        record.ownerId,
        record.sourceKey,
        record.sourcePath,
        record.displayName,
        record.headerPayloadJson,
        record.sourceJsonl,
        record.sourceMtimeMs,
        record.sourceSizeBytes,
        record.createdAtMs,
        record.updatedAtMs,
    );

    const insertMessage = db.prepare(`
        INSERT INTO chat_messages (
            id,
            session_id,
            message_order,
            identity_key,
            payload_json,
            created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertSwipe = db.prepare(`
        INSERT INTO chat_message_swipes (message_id, swipe_order, payload_json)
        VALUES (?, ?, ?)
    `);
    const insertAttachment = db.prepare(`
        INSERT INTO chat_attachment_refs (message_id, blob_id, role, compatibility_json)
        VALUES (?, ?, ?, ?)
    `);

    for (const message of record.messages) {
        insertMessage.run(
            message.id,
            record.id,
            message.order,
            message.identityKey,
            message.payloadJson,
            message.createdAtMs,
        );
        for (const [swipeOrder, swipe] of (Array.isArray(message.payload?.swipes) ? message.payload.swipes : []).entries()) {
            insertSwipe.run(message.id, swipeOrder, JSON.stringify(swipe));
        }
        for (const attachment of message.attachments) {
            insertAttachment.run(
                message.id,
                attachment.blobId,
                attachment.role,
                JSON.stringify(attachment.compatibility),
            );
        }
    }
}

export function createCanonicalChatBackup({
    db,
    createdAtMs = Date.now(),
}) {
    const projectionRepairs = listOpenCanonicalChatProjectionRepairs(db);
    const attachmentEntries = listAttachmentManifestEntries(db);
    return {
        manifestVersion: CANONICAL_CHAT_BACKUP_MANIFEST_VERSION,
        createdAtMs: Number(createdAtMs),
        schemaVersion: getCanonicalMigrationStatus(db).currentVersion,
        databaseRevision: getCanonicalChatDatabaseRevision(db),
        projectionState: {
            openRepairCount: projectionRepairs.length,
            repairKeys: projectionRepairs.map(repair => repair.repairKey),
        },
        attachmentManifest: {
            version: CANONICAL_CHAT_ATTACHMENT_MANIFEST_VERSION,
            entries: attachmentEntries,
        },
        sessions: createBackupSessionRows(db),
        projectionRepairs,
    };
}

export function getCanonicalChatRestoreStatus(db) {
    try {
        ensureRestoreJournalTable(db);
        const row = db.prepare(`
            SELECT
                restore_id,
                status,
                reason_code,
                details_json,
                updated_at_ms,
                finished_at_ms
            FROM chat_restore_operations
            ORDER BY updated_at_ms DESC, restore_id DESC
            LIMIT 1
        `).get();
        if (!row) {
            return {
                status: 'none',
                reasonCode: null,
                details: {},
                updatedAtMs: null,
                finishedAtMs: null,
            };
        }
        let details = {};
        try {
            details = JSON.parse(String(row.details_json ?? '{}'));
        } catch {
            details = {};
        }
        return {
            restoreId: String(row.restore_id),
            status: String(row.status),
            reasonCode: row.reason_code == null ? null : String(row.reason_code),
            details,
            updatedAtMs: Number(row.updated_at_ms),
            finishedAtMs: row.finished_at_ms == null ? null : Number(row.finished_at_ms),
        };
    } catch {
        return {
            status: 'none',
            reasonCode: null,
            details: {},
            updatedAtMs: null,
            finishedAtMs: null,
        };
    }
}

export async function restoreCanonicalChatBackup({
    db,
    backup,
    handle,
    directories,
    nowMs = Date.now(),
}) {
    const restoreId = `chat-restore-${Number(nowMs)}`;
    const manifestVersion = Number(backup?.manifestVersion ?? null);
    writeRestoreStatus(db, {
        restoreId,
        manifestVersion: Number.isFinite(manifestVersion) ? manifestVersion : CANONICAL_CHAT_BACKUP_MANIFEST_VERSION,
        backupCreatedAtMs: backup?.createdAtMs ?? null,
        status: 'validating',
        nowMs,
    });

    const shape = validateBackupShape(backup);
    if (!shape.ok) {
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: CANONICAL_CHAT_BACKUP_MANIFEST_VERSION,
            backupCreatedAtMs: backup?.createdAtMs ?? null,
            status: 'blocked',
            reasonCode: shape.reasonCode,
            nowMs,
            finishedAtMs: nowMs,
        });
        return { ok: false, status: 'blocked', reasonCode: shape.reasonCode, restoreId };
    }

    const attachmentValidation = validateAttachmentManifest(db, backup.attachmentManifest);
    if (!attachmentValidation.ok) {
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'blocked',
            reasonCode: attachmentValidation.reasonCode,
            details: attachmentValidation.details ?? {},
            nowMs,
            finishedAtMs: nowMs,
        });
        return {
            ok: false,
            status: 'blocked',
            reasonCode: attachmentValidation.reasonCode,
            restoreId,
        };
    }

    let stagedRecords;
    try {
        stagedRecords = stageBackupSessions(db, backup, directories, nowMs);
    } catch (error) {
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'blocked',
            reasonCode: 'invalid_backup_session',
            details: {
                message: String(error?.message ?? error ?? ''),
            },
            nowMs,
            finishedAtMs: nowMs,
        });
        return {
            ok: false,
            status: 'blocked',
            reasonCode: 'invalid_backup_session',
            restoreId,
        };
    }

    try {
        const previousSessions = listCanonicalChatSessions(db);
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'restoring',
            nowMs,
        });
        withCanonicalTransaction(db, txnDb => {
            txnDb.prepare('DELETE FROM chat_projection_repairs').run();
            txnDb.prepare('DELETE FROM chat_sessions').run();
            for (const record of stagedRecords) {
                insertStagedChatRecord(txnDb, record);
            }
            restoreProjectionRepairs(txnDb, backup.projectionRepairs, nowMs);
        });
        const projectionFailures = projectRestoredSessions(db, {
            directories,
            previousSessions,
            stagedRecords,
            nowMs,
        });
        if (projectionFailures.length > 0) {
            invalidateCanonicalAuditStatus(db, {
                scope: 'chats',
                handle,
                reason: 'audit_stale_after_chat_restore_projection_failure',
                source: 'canonical_chat_backup_restore',
            });
            writeRestoreStatus(db, {
                restoreId,
                manifestVersion: backup.manifestVersion,
                backupCreatedAtMs: backup.createdAtMs,
                status: 'failed',
                reasonCode: 'restore_projection_failed',
                details: { projectionFailures },
                nowMs,
                finishedAtMs: nowMs,
            });
            return {
                ok: false,
                status: 'failed',
                reasonCode: 'restore_projection_failed',
                restoreId,
            };
        }
        const audit = await auditCanonicalChatShadowImport({
            handle,
            directories,
            db,
            auditedAtMs: nowMs,
        });
        if (!audit.ok) {
            writeRestoreStatus(db, {
                restoreId,
                manifestVersion: backup.manifestVersion,
                backupCreatedAtMs: backup.createdAtMs,
                status: 'failed',
                reasonCode: 'restore_audit_failed',
                details: {
                    reason: audit.reason,
                    entryCount: audit.entries.length,
                },
                nowMs,
                finishedAtMs: nowMs,
            });
            return {
                ok: false,
                status: 'failed',
                reasonCode: 'restore_audit_failed',
                restoreId,
            };
        }
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'restored',
            nowMs,
            finishedAtMs: nowMs,
        });
        return { ok: true, status: 'restored', reasonCode: null, restoreId };
    } catch (error) {
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'failed',
            reasonCode: 'restore_failed',
            details: {
                message: String(error?.message ?? error ?? ''),
            },
            nowMs,
            finishedAtMs: nowMs,
        });
        return {
            ok: false,
            status: 'failed',
            reasonCode: 'restore_failed',
            restoreId,
        };
    }
}
