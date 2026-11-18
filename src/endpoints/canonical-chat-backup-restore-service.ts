import { assertNoActiveChatGenerations, ChatGenerationBusyError } from '../server-generation-lock.ts';
import fs from 'node:fs';
import crypto, { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { CanonicalChatLocator } from './canonical-chat-read-service.ts';
import type { CanonicalChatProjectionPathInput } from './canonical-chat-projection-path.ts';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { withCanonicalTransaction } from '../canonical-sqlite.ts';
import { getCanonicalMigrationStatus } from '../canonical-sqlite-migrations.ts';
import { invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.ts';
import { auditCanonicalChatShadowImport } from '../canonical-chat-shadow-import.ts';
import {
    createCanonicalChatSessionRecord,
    listOpenCanonicalChatProjectionRepairs,
    listCanonicalChatSessions,
    recordCanonicalChatProjectionRepair,
    resolveCanonicalChatProjectionRepair,
    serializeCanonicalChatSession,
} from './canonical-chat-store.ts';
import { parseCanonicalChatJsonl } from './canonical-chat-write-service.ts';
import { resolveCanonicalChatProjectionPath } from './canonical-chat-projection-path.ts';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import { recordImportLedgerEntry, removeImportLedgerEntry } from '../canonical-import-ledger.js';

export const CANONICAL_CHAT_BACKUP_MANIFEST_VERSION = 2;
export const CANONICAL_CHAT_ATTACHMENT_MANIFEST_VERSION = 1;
const RESTORE_ID_PATTERN = /^chat-restore-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Directories = CanonicalChatProjectionPathInput['directories'];
type ChatRecord = ReturnType<typeof createCanonicalChatSessionRecord>;
type SessionRow = ReturnType<typeof listCanonicalChatSessions>[number];
type ErrorView = { message?: unknown; code?: string } | null | undefined;
// These views describe the existing unchecked JSON property accesses. Shape
// and path checks below remain the runtime authority; this is not a parser.
type BackupView = {
    manifestVersion: number;
    createdAtMs: number;
    databaseRevision: unknown;
    projectionState: { repairKeys: unknown[]; openRepairCount: number };
    attachmentManifest: { version: number; entries: { blobId: unknown; compatibilityPath: unknown }[] };
    sessions: { ownerType: unknown; ownerId: unknown; sourcePath: unknown; jsonl: unknown; sourceMtimeMs: unknown }[];
    projectionRepairs: { repairKey: unknown; sessionId: unknown; ownerType: unknown; ownerId: unknown; sourcePath: unknown; operation: unknown; reason: unknown; details: object }[];
    tombstones: { owner_type: string; owner_id: string; source_path: string }[];
    operationResults: { operation_id: string; fingerprint: string; result_json: string }[];
};
type RestoreStatusOptions = {
    restoreId: string; manifestVersion: number; backupCreatedAtMs?: number | null;
    status: string; reasonCode?: string | null; details?: object; commitState?: string;
    claim?: boolean; nowMs: number; finishedAtMs?: number | null;
};

function listAttachmentManifestEntries(db: DatabaseSync) {
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

function getCanonicalChatDatabaseRevision(db: DatabaseSync) {
    const row = db.prepare(`
        SELECT
            COUNT(*) AS session_count,
            COALESCE(MAX(updated_at_ms), 0) AS max_updated_at_ms
        FROM chat_sessions
    `).get();
    return {
        sessionCount: Number(row?.session_count ?? 0),
        maxUpdatedAtMs: Number(row?.max_updated_at_ms ?? 0),
        version: getCanonicalChatRestoreVersion(db),
    };
}

export function getCanonicalChatRestoreVersion(db: DatabaseSync) {
    const rows = db.prepare('SELECT owner_type, owner_id, source_path, concurrency_token FROM chat_sessions ORDER BY owner_type, owner_id, source_path').all();
    return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function createBackupSessionRows(db: DatabaseSync) {
    return listCanonicalChatSessions(db).map(session => ({
        ownerType: String(session.owner_type),
        ownerId: String(session.owner_id),
        sourcePath: String(session.source_path),
        sourceMtimeMs: Number(session.source_mtime_ms),
        jsonl: serializeCanonicalChatSession(db, String(session.id)),
    }));
}

function ensureRestoreJournalTable(db: DatabaseSync) {
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

function writeRestoreStatus(db: DatabaseSync, {
    restoreId,
    manifestVersion,
    backupCreatedAtMs = null,
    status,
    reasonCode = null,
    details = {},
    commitState = 'unknown',
    claim = false,
    nowMs,
    finishedAtMs = null,
}: RestoreStatusOptions) {
    ensureRestoreJournalTable(db);
    return db.prepare(`
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
        ON CONFLICT(restore_id) ${claim ? 'DO NOTHING' : `DO UPDATE SET
            manifest_version = excluded.manifest_version,
            backup_created_at_ms = excluded.backup_created_at_ms,
            status = excluded.status,
            reason_code = excluded.reason_code,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            finished_at_ms = excluded.finished_at_ms`}
    `).run(
        restoreId,
        manifestVersion,
        backupCreatedAtMs,
        status,
        reasonCode,
        JSON.stringify({ ...details, commitState }),
        Number(nowMs),
        Number(nowMs),
        finishedAtMs == null ? null : Number(finishedAtMs),
    );
}

function validateBackupShape(backup: BackupView) {
    if (!backup || typeof backup !== 'object') {
        return { ok: false, reasonCode: 'invalid_backup_manifest' };
    }
    if (![1, CANONICAL_CHAT_BACKUP_MANIFEST_VERSION].includes(Number(backup.manifestVersion))) {
        return { ok: false, reasonCode: 'unsupported_backup_manifest_version' };
    }
    if (Number(backup.manifestVersion) === 2 && (
        !Array.isArray(backup.tombstones) || !Array.isArray(backup.operationResults)
        || backup.tombstones.some(row => !row || typeof row.owner_type !== 'string' || typeof row.owner_id !== 'string' || typeof row.source_path !== 'string')
        || backup.operationResults.some(row => !row || typeof row.operation_id !== 'string' || typeof row.fingerprint !== 'string' || typeof row.result_json !== 'string')
    )) {
        return { ok: false, reasonCode: 'incomplete_backup_manifest' };
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

function validateAttachmentManifest(db: DatabaseSync, attachmentManifest: BackupView['attachmentManifest']) {
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

function stageBackupSessions(db: DatabaseSync, backup: BackupView, directories: Directories, nowMs: number) {
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
            locator: locator as CanonicalChatLocator,
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

function recordRestoreProjectionFailure(db: DatabaseSync, {
    record,
    restoreId,
    operation,
    error,
    nowMs,
}: { record: CanonicalChatLocator & { id: string }; restoreId: string; operation: string; error: unknown; nowMs: number }) {
    recordCanonicalChatProjectionRepair(db, {
        repairKey: operation === 'delete'
            ? `chat-restore:${restoreId}:delete:${record.ownerType}:${record.ownerId}:${encodeURIComponent(record.sourcePath)}`
            : `chat-restore:${restoreId}:${record.ownerType}:${record.ownerId}:${encodeURIComponent(record.sourcePath)}`,
        sessionId: operation === 'delete' ? null : record.id,
        locator: {
            ownerType: record.ownerType,
            ownerId: record.ownerId,
            sourcePath: record.sourcePath,
        },
        operation,
        reason: 'restore_projection_failed',
        details: {
            message: String((error as ErrorView)?.message ?? error ?? ''),
        },
        nowMs,
    });
}

function projectRestoredSessions(db: DatabaseSync, {
    directories,
    previousSessions,
    stagedRecords,
    restoreId,
    nowMs,
}: { directories: Directories; previousSessions: SessionRow[]; stagedRecords: ChatRecord[]; restoreId: string; nowMs: number }) {
    const restoredPaths = new Set(stagedRecords.map(record => `${record.ownerType}\0${record.ownerId}\0${record.sourcePath}`));
    const failures = [];

    for (const record of stagedRecords) {
        try {
            withCanonicalTransaction(db, (txn: DatabaseSync) => {
                const current = txn.prepare(`SELECT source_jsonl FROM chat_sessions
                    WHERE owner_type = ? AND owner_id = ? AND source_path = ?`)
                    .get(record.ownerType, record.ownerId, record.sourcePath);
                if (!current) throw new Error('restore_projection_authority_missing');
                const filePath = resolveCanonicalChatProjectionPath({
                    directories, ownerType: record.ownerType, ownerId: record.ownerId, sourcePath: record.sourcePath,
                });
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                writeFileAtomicSync(filePath, current.source_jsonl as string, 'utf8');
                recordImportLedgerEntry(txn, {
                    sliceKey: 'chats', sourcePath: record.sourcePath,
                    contentHash: crypto.createHash('sha256').update(current.source_jsonl as string).digest('hex'),
                    origin: 'projection', nowMs,
                });
                resolveCanonicalChatProjectionRepair(txn, {
                    repairKey: `chat-restore:${restoreId}:${record.ownerType}:${record.ownerId}:${encodeURIComponent(record.sourcePath)}`,
                    resolvedAtMs: nowMs,
                });
            });
        } catch (error) {
            failures.push({ operation: 'restore', sourcePath: record.sourcePath });
            recordRestoreProjectionFailure(db, {
                record,
                restoreId,
                operation: 'restore',
                error,
                nowMs,
            });
        }
    }

    for (const session of previousSessions) {
        const identity = `${String(session.owner_type)}\0${String(session.owner_id)}\0${String(session.source_path)}`;
        if (restoredPaths.has(identity)) {
            continue;
        }
        const record = {
            id: String(session.id),
            ownerType: String(session.owner_type) as CanonicalChatLocator['ownerType'],
            ownerId: String(session.owner_id),
            sourcePath: String(session.source_path),
        };
        try {
            withCanonicalTransaction(db, (txn: DatabaseSync) => {
                const current = txn.prepare(`SELECT 1 FROM chat_sessions
                    WHERE owner_type = ? AND owner_id = ? AND source_path = ?`)
                    .get(record.ownerType, record.ownerId, record.sourcePath);
                if (current) {
                    resolveCanonicalChatProjectionRepair(txn, {
                        repairKey: `chat-restore:${restoreId}:delete:${record.ownerType}:${record.ownerId}:${encodeURIComponent(record.sourcePath)}`,
                        resolvedAtMs: nowMs,
                    });
                    return;
                }
                const filePath = resolveCanonicalChatProjectionPath({
                    directories, ownerType: record.ownerType, ownerId: record.ownerId, sourcePath: record.sourcePath,
                });
                fs.rmSync(filePath, { force: true });
                removeImportLedgerEntry(txn, { sliceKey: 'chats', sourcePath: record.sourcePath });
                resolveCanonicalChatProjectionRepair(txn, {
                    repairKey: `chat-restore:${restoreId}:delete:${record.ownerType}:${record.ownerId}:${encodeURIComponent(record.sourcePath)}`,
                    resolvedAtMs: nowMs,
                });
            });
        } catch (error) {
            failures.push({ operation: 'delete', sourcePath: record.sourcePath });
            recordRestoreProjectionFailure(db, {
                record,
                restoreId,
                operation: 'delete',
                error,
                nowMs,
            });
        }
    }

    return failures;
}

function restoreProjectionRepairs(db: DatabaseSync, repairs: BackupView['projectionRepairs'], nowMs: number) {
    for (const repair of repairs ?? []) {
        recordCanonicalChatProjectionRepair(db, {
            repairKey: String(repair.repairKey),
            sessionId: repair.sessionId == null ? null : String(repair.sessionId),
            locator: {
                ownerType: String(repair.ownerType) as CanonicalChatLocator['ownerType'],
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

function insertStagedChatRecord(db: DatabaseSync, record: ChatRecord) {
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
}: { db: DatabaseSync; createdAtMs?: number }) {
    db.exec('SAVEPOINT canonical_chat_backup');
    try {
        const projectionRepairs = listOpenCanonicalChatProjectionRepairs(db);
        const attachmentEntries = listAttachmentManifestEntries(db);
        const backup = {
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
            tombstones: db.prepare('SELECT owner_type, owner_id, source_path FROM chat_projection_tombstones ORDER BY owner_type, owner_id, source_path').all(),
            operationResults: db.prepare('SELECT operation_id, fingerprint, result_json FROM chat_operation_results ORDER BY operation_id').all(),
        };
        db.exec('RELEASE canonical_chat_backup');
        return backup;
    } catch (error) {
        db.exec('ROLLBACK TO canonical_chat_backup');
        db.exec('RELEASE canonical_chat_backup');
        throw error;
    }
}

export function getCanonicalChatRestoreStatus(db: DatabaseSync, restoreId: string | null = null) {
    try {
        ensureRestoreJournalTable(db);
        const query = `
            SELECT
                restore_id,
                status,
                reason_code,
                details_json,
                updated_at_ms,
                finished_at_ms
            FROM chat_restore_operations
        `;
        const row = restoreId == null
            ? db.prepare(`${query} ORDER BY updated_at_ms DESC, restore_id DESC LIMIT 1`).get()
            : db.prepare(`${query} WHERE restore_id = ?`).get(String(restoreId));
        if (!row) {
            return {
                ...(restoreId == null ? {} : { restoreId: String(restoreId) }),
                status: 'none',
                reasonCode: null,
                details: {},
                commitState: 'unknown',
                updatedAtMs: null,
                finishedAtMs: null,
            };
        }
        let details: { commitState?: string } = {};
        try {
            details = JSON.parse(String(row.details_json ?? '{}'));
        } catch {
            details = {};
        }
        const commitState = RESTORE_ID_PATTERN.test(String(row.restore_id))
            && ['committed', 'not_committed', 'unknown'].includes(details?.commitState as string) ? details.commitState : 'unknown';
        return {
            restoreId: String(row.restore_id),
            status: String(row.status),
            reasonCode: row.reason_code == null ? null : String(row.reason_code),
            details: { ...details, commitState },
            commitState,
            updatedAtMs: Number(row.updated_at_ms),
            finishedAtMs: row.finished_at_ms == null ? null : Number(row.finished_at_ms),
        };
    } catch {
        return {
            ...(restoreId == null ? {} : { restoreId: String(restoreId) }),
            status: 'none',
            reasonCode: null,
            details: {},
            commitState: 'unknown',
            updatedAtMs: null,
            finishedAtMs: null,
        };
    }
}

export async function restoreCanonicalChatBackup({
    db,
    backup: inputBackup,
    handle,
    directories,
    nowMs = Date.now(),
    restoreId = `chat-restore-${randomUUID()}`,
    expectedVersion,
}: { db: DatabaseSync; backup: unknown; handle: string; directories: Directories; nowMs?: number; restoreId?: string; expectedVersion?: string }) {
    const backup = inputBackup as BackupView;
    if (typeof restoreId !== 'string' || !RESTORE_ID_PATTERN.test(restoreId)) {
        return { ok: false, status: 'blocked', reasonCode: 'invalid_restore_id', restoreId, commitState: 'not_committed' };
    }
    if (typeof expectedVersion !== 'string' || !/^[0-9a-f]{64}$/.test(expectedVersion)) {
        return { ok: false, status: 'blocked', reasonCode: 'restore_version_required', restoreId, commitState: 'not_committed' };
    }
    const manifestVersion = Number(backup?.manifestVersion ?? null);
    let commitState = 'not_committed';
    let claimed = false;
    try {
        const claimResult = writeRestoreStatus(db, {
            restoreId,
            manifestVersion: Number.isFinite(manifestVersion) ? manifestVersion : CANONICAL_CHAT_BACKUP_MANIFEST_VERSION,
            backupCreatedAtMs: backup?.createdAtMs ?? null,
            status: 'validating',
            commitState,
            claim: true,
            nowMs,
        });
        if (claimResult.changes === 0) {
            return { ok: false, status: 'blocked', reasonCode: 'restore_id_in_use', restoreId, commitState: 'unknown' };
        }
        claimed = true;

        const shape = validateBackupShape(backup);
        if (!shape.ok) {
            writeRestoreStatus(db, {
                restoreId,
                manifestVersion: CANONICAL_CHAT_BACKUP_MANIFEST_VERSION,
                backupCreatedAtMs: backup?.createdAtMs ?? null,
                status: 'blocked',
                commitState,
                reasonCode: shape.reasonCode,
                nowMs,
                finishedAtMs: nowMs,
            });
            return { ok: false, status: 'blocked', reasonCode: shape.reasonCode, restoreId, commitState };
        }

        const attachmentValidation = validateAttachmentManifest(db, backup.attachmentManifest);
        if (!attachmentValidation.ok) {
            writeRestoreStatus(db, {
                restoreId,
                manifestVersion: backup.manifestVersion,
                backupCreatedAtMs: backup.createdAtMs,
                status: 'blocked',
                commitState,
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
                commitState,
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
                commitState,
                reasonCode: 'invalid_backup_session',
                details: {
                    message: String((error as ErrorView)?.message ?? error ?? ''),
                },
                nowMs,
                finishedAtMs: nowMs,
            });
            return {
                ok: false,
                status: 'blocked',
                reasonCode: 'invalid_backup_session',
                restoreId,
                commitState,
            };
        }

        const previous = { sessions: undefined as SessionRow[] | undefined };
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'restoring',
            commitState: 'unknown',
            nowMs,
        });
        commitState = 'unknown';
        withCanonicalTransaction(db, (txnDb: DatabaseSync) => {
            assertNoActiveChatGenerations(txnDb);
            if (getCanonicalChatRestoreVersion(txnDb) !== expectedVersion) {
                const error: Error & { code?: string } = new Error('chat_conflict');
                error.code = 'CHAT_RESTORE_CONFLICT';
                throw error;
            }
            const existingOperation = txnDb.prepare('SELECT fingerprint, result_json FROM chat_operation_results WHERE operation_id = ?');
            const insertOperation = txnDb.prepare('INSERT OR IGNORE INTO chat_operation_results (operation_id, fingerprint, result_json) VALUES (?, ?, ?)');
            for (const row of Number(backup.manifestVersion) === 2 ? backup.operationResults : []) {
                const existing = existingOperation.get(row.operation_id);
                if (existing && (existing.fingerprint !== row.fingerprint || existing.result_json !== row.result_json)) {
                    const error: Error & { code?: string } = new Error('chat_operation_conflict');
                    error.code = 'CHAT_RESTORE_OPERATION_CONFLICT';
                    throw error;
                }
                insertOperation.run(row.operation_id, row.fingerprint, row.result_json);
            }
            const insertTombstone = txnDb.prepare('INSERT OR IGNORE INTO chat_projection_tombstones (owner_type, owner_id, source_path) VALUES (?, ?, ?)');
            for (const row of Number(backup.manifestVersion) === 2 ? backup.tombstones : []) {
                insertTombstone.run(row.owner_type, row.owner_id, row.source_path);
            }
            previous.sessions = listCanonicalChatSessions(txnDb);
            txnDb.prepare('DELETE FROM chat_projection_repairs').run();
            txnDb.prepare('DELETE FROM chat_sessions').run();
            for (const record of stagedRecords) {
                insertStagedChatRecord(txnDb, record);
                recordCanonicalChatProjectionRepair(txnDb, {
                    repairKey: `chat-restore:${restoreId}:${record.ownerType}:${record.ownerId}:${encodeURIComponent(record.sourcePath)}`,
                    sessionId: record.id,
                    locator: { ownerType: record.ownerType, ownerId: record.ownerId, sourcePath: record.sourcePath },
                    operation: 'restore', reason: 'restore_projection_pending', details: {}, nowMs,
                });
            }
            const restored = new Set(stagedRecords.map(record => `${record.ownerType}\0${record.ownerId}\0${record.sourcePath}`));
            for (const session of previous.sessions) {
                const ownerType = String(session.owner_type) as CanonicalChatLocator['ownerType'], ownerId = String(session.owner_id), sourcePath = String(session.source_path);
                if (restored.has(`${ownerType}\0${ownerId}\0${sourcePath}`)) continue;
                recordCanonicalChatProjectionRepair(txnDb, {
                    repairKey: `chat-restore:${restoreId}:delete:${ownerType}:${ownerId}:${encodeURIComponent(sourcePath)}`,
                    sessionId: null, locator: { ownerType, ownerId, sourcePath }, operation: 'delete',
                    reason: 'restore_projection_pending', details: {}, nowMs,
                });
            }
            restoreProjectionRepairs(txnDb, backup.projectionRepairs, nowMs);
            writeRestoreStatus(txnDb, {
                restoreId, manifestVersion: backup.manifestVersion, backupCreatedAtMs: backup.createdAtMs,
                status: 'restoring', commitState: 'committed', nowMs,
            });
        });
        commitState = 'committed';
        const projectionFailures = projectRestoredSessions(db, {
            directories,
            // The synchronous transaction assigns this before it can return successfully.
            previousSessions: previous.sessions as SessionRow[],
            stagedRecords,
            restoreId,
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
                commitState,
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
                commitState,
            };
        }
        // JS's default empty options object omits the required fields from inference.
        const audit = await (auditCanonicalChatShadowImport as (options: { handle: string; directories: Directories; db: DatabaseSync; auditedAtMs: number; projection: string }) => ReturnType<typeof auditCanonicalChatShadowImport>)({
            handle,
            directories,
            db,
            auditedAtMs: nowMs,
            projection: getCanonicalStorageSlice('chats').getProjectionMode(),
        });
        if (!audit.ok) {
            writeRestoreStatus(db, {
                restoreId,
                manifestVersion: backup.manifestVersion,
                backupCreatedAtMs: backup.createdAtMs,
                status: 'failed',
                commitState,
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
                commitState,
            };
        }
        writeRestoreStatus(db, {
            restoreId,
            manifestVersion: backup.manifestVersion,
            backupCreatedAtMs: backup.createdAtMs,
            status: 'restored',
            commitState,
            nowMs,
            finishedAtMs: nowMs,
        });
        return { ok: true, status: 'restored', reasonCode: null, restoreId, commitState };
    } catch (error) {
        if (error instanceof ChatGenerationBusyError || (error as ErrorView)?.code === 'CHAT_RESTORE_CONFLICT' || (error as ErrorView)?.code === 'CHAT_RESTORE_OPERATION_CONFLICT') {
            const reasonCode = error instanceof ChatGenerationBusyError ? 'chat_generation_busy'
                : (error as ErrorView)?.code === 'CHAT_RESTORE_OPERATION_CONFLICT' ? 'chat_operation_conflict' : 'chat_conflict';
            writeRestoreStatus(db, { restoreId, manifestVersion, backupCreatedAtMs: backup?.createdAtMs ?? null,
                status: 'blocked', commitState: 'not_committed', reasonCode, nowMs, finishedAtMs: nowMs });
            return { ok: false, status: 'blocked', reasonCode, restoreId, commitState: 'not_committed' };
        }
        let journalWritten = true;
        try {
            if (!claimed) throw error;
            writeRestoreStatus(db, {
                restoreId,
                manifestVersion: backup.manifestVersion,
                backupCreatedAtMs: backup.createdAtMs,
                status: 'failed',
                commitState,
                reasonCode: 'restore_failed',
                details: {
                    message: String((error as ErrorView)?.message ?? error ?? ''),
                },
                nowMs,
                finishedAtMs: nowMs,
            });
        } catch {
            journalWritten = false;
        }
        return {
            ok: false,
            status: 'failed',
            reasonCode: 'restore_failed',
            restoreId,
            commitState,
            journalWritten,
        };
    }
}
