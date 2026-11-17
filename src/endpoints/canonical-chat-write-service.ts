import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CanonicalChatLocator } from './canonical-chat-read-service.ts';
import { withCanonicalTransaction } from '../canonical-sqlite.ts';

import {
    recordImportLedgerEntry,
    removeImportLedgerEntry,
} from '../canonical-import-ledger.js';
import {
    createCanonicalChatSessionRecord,
    createCanonicalChatSession,
    deleteCanonicalChatSession,
    deleteCanonicalChatSessionIfCurrent,
    listOpenCanonicalChatProjectionRepairs,
    renameCanonicalChatSession,
    recordCanonicalChatProjectionRepair,
    resolveCanonicalChatProjectionRepair,
    upsertCanonicalChatSession,
    saveCanonicalChatSessionIfCurrent,
    syncCanonicalCharacterChatStats,
} from './canonical-chat-store.ts';

type OperationIdentity = NonNullable<Parameters<typeof createCanonicalChatSession>[2]>['operation'];
type ProjectionFailure = { repairKey: string; error: unknown; locator: CanonicalChatLocator; operation: string };
type CommonOptions = {
    db: DatabaseSync;
    locator: CanonicalChatLocator;
    projection?: string;
    nowMs?: number;
    onProjectionFailure?: ((failure: ProjectionFailure) => void) | null;
    operationIdentity?: OperationIdentity;
};
type WriteOptions = CommonOptions & {
    payload: unknown[];
    operation?: string;
    projectJsonl: (jsonl: string) => void;
    onAuthorityCommitted?: ((jsonl: string) => void) | null;
    condition?: { create?: boolean; version?: unknown } | null;
};
type RenameOptions = CommonOptions & {
    nextLocator: CanonicalChatLocator;
    projectRename: (jsonl: string) => void;
    onAuthorityCommitted?: ((jsonl: string | undefined) => void) | null;
    version?: string | null;
};
type DeleteOptions = CommonOptions & { projectDelete: () => void; version?: string | null };
// The store's result union includes failure and replay variants; this view
// describes the existing optional property reads without changing those branches.
type StoreResultView = { id?: string; status?: string; version?: string | null; sourceJsonl?: string; replayed?: boolean };

function buildRepairKey(locator: CanonicalChatLocator, operation: string) {
    return [
        'chat',
        locator.ownerType,
        locator.ownerId,
        encodeURIComponent(locator.sourcePath),
        operation,
    ].join(':');
}

function listStringLeaves(value: unknown, fieldPath: (string | number)[] = []): { value: string; fieldPath: (string | number)[] }[] {
    if (typeof value === 'string') {
        return [{ value, fieldPath }];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => listStringLeaves(entry, [...fieldPath, index]));
    }
    if (!value || typeof value !== 'object') {
        return [];
    }
    return Object.entries(value).flatMap(([key, entry]) => listStringLeaves(entry, [...fieldPath, key]));
}

function isManagedAttachmentCandidate(value: unknown) {
    return /^(files|assets|user\/files|user\/images|User Avatars)\//.test(String(value ?? ''));
}

function findFirstUnregisteredAttachmentPath(db: DatabaseSync, payload: unknown[]) {
    const managedPaths = new Set<string>();
    try {
        const rows = db.prepare(`
            SELECT compatibility_path
            FROM media_references
            WHERE deleted_at_ms IS NULL
        `).all();
        for (const row of rows) {
            managedPaths.add(String(row.compatibility_path));
        }
    } catch (error) {
        if (String((error as { message?: unknown } | null | undefined)?.message ?? '').includes('no such table: media_references')) {
            return null;
        }
        throw error;
    }

    for (const message of payload.slice(1)) {
        for (const leaf of listStringLeaves(message)) {
            // Chat text may mention a path; only structured fields can be attachments.
            if (leaf.fieldPath[0] !== 'mes'
                && isManagedAttachmentCandidate(leaf.value)
                && !managedPaths.has(String(leaf.value))) {
                return String(leaf.value);
            }
        }
    }

    return null;
}

/**
 * Commits one full chat session before attempting its JSONL compatibility projection.
 * A projection error is durable repair state, never a reason to restore file authority.
 */
export function writeCanonicalChatPayload({
    db,
    locator,
    payload,
    operation = 'save',
    projectJsonl,
    projection = 'sync',
    nowMs = Date.now(),
    onProjectionFailure = null,
    onAuthorityCommitted = null,
    condition = null,
    operationIdentity = null,
}: WriteOptions) {
    if (typeof projectJsonl !== 'function') {
        throw new Error('Canonical chat projection function is required.');
    }
    const unregisteredAttachmentPath = findFirstUnregisteredAttachmentPath(db, payload);
    if (unregisteredAttachmentPath) {
        return {
            ok: false,
            authorityCommitted: false,
            reason: 'unregistered_attachment',
            path: unregisteredAttachmentPath,
        };
    }

    const record = createCanonicalChatSessionRecord(db, { locator, payload, nowMs });
    const repairKey = buildRepairKey(locator, operation);
    const options: NonNullable<Parameters<typeof createCanonicalChatSession>[2]> = {
        onPersist: projection === 'off' ? txn => syncCanonicalCharacterChatStats(txn, locator, nowMs) : (txn, result) => recordCanonicalChatProjectionRepair(txn, {
            repairKey,
            sessionId: result.id,
            locator,
            operation,
            reason: 'projection_failed',
            details: {},
            nowMs,
        }),
        operation: operationIdentity,
    };
    const persisted: StoreResultView = condition?.create
        ? createCanonicalChatSession(db, record, options)
        : condition?.version
            ? saveCanonicalChatSessionIfCurrent(db, record, condition.version, options)
            : upsertCanonicalChatSession(db, record, options);
    if (persisted.status === 'conflict' || persisted.status === 'operation_mismatch') {
        return { ok: false, authorityCommitted: false, reason: persisted.status };
    }
    if (persisted.replayed) return { ok: true, authorityCommitted: true, version: persisted.version, replayed: true };
    if (projection === 'off') {
        // The chat file is an export surface now; post-commit side effects
        // (chat backups) still run but never fail the committed write.
        try {
            onAuthorityCommitted?.(record.sourceJsonl);
        } catch (error) {
            console.warn('Canonical chat post-commit side effects skipped:', error);
        }
        return {
            ok: true,
            authorityCommitted: true,
            sessionId: persisted.id,
            status: persisted.status,
            version: persisted.version,
        };
    }
    try {
        withCanonicalTransaction(db, (txn: DatabaseSync) => {
            const session = txn.prepare('SELECT source_jsonl FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(locator.ownerType, locator.ownerId, locator.sourcePath);
            if (!session) throw new Error('missing_canonical_chat_session');
            // The selected SQLite column is the JSONL text written by the store.
            projectJsonl(session.source_jsonl as string);
            recordImportLedgerEntry(txn, {
                sliceKey: 'chats',
                sourcePath: locator.sourcePath,
                contentHash: crypto.createHash('sha256').update(session.source_jsonl as string).digest('hex'),
                origin: 'projection',
                nowMs,
            });
            resolveCanonicalChatProjectionRepair(txn, { repairKey, resolvedAtMs: nowMs });
        });
    } catch (error) {
        onProjectionFailure?.({ repairKey, error, locator, operation });
        return {
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey,
            sessionId: persisted.id,
            version: persisted.version,
        };
    }

    return {
        ok: true,
        authorityCommitted: true,
        sessionId: persisted.id,
        status: persisted.status,
        version: persisted.version,
    };
}

export function parseCanonicalChatJsonl(jsonl: unknown) {
    const lines = String(jsonl ?? '').split('\n').filter(line => line.length > 0);
    if (lines.length === 0) {
        throw new Error('Chat JSONL must include a header.');
    }
    return lines.map((line, index) => {
        try {
            const payload = JSON.parse(line.endsWith('\r') ? line.slice(0, -1) : line);
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                throw new Error('payload must be an object');
            }
            return payload;
        } catch (error) {
            throw new Error(`Chat JSONL line ${index + 1} is invalid: ${String((error as { message?: unknown } | null | undefined)?.message ?? error ?? '')}`);
        }
    });
}

export function renameCanonicalChat({
    db,
    locator,
    nextLocator,
    projectRename,
    projection = 'sync',
    nowMs = Date.now(),
    onProjectionFailure = null,
    onAuthorityCommitted = null,
    version = null,
    operationIdentity = null,
}: RenameOptions) {
    if (typeof projectRename !== 'function') {
        throw new Error('Canonical chat rename projection function is required.');
    }

    const repairKey = buildRepairKey(nextLocator, 'rename');
    const renamed: StoreResultView | null = renameCanonicalChatSession(db, {
        locator, nextLocator, nowMs, version, operation: operationIdentity,
        onPersist: projection === 'off' ? txn => {
            syncCanonicalCharacterChatStats(txn, locator, nowMs);
            if (nextLocator.ownerId !== locator.ownerId) syncCanonicalCharacterChatStats(txn, nextLocator, nowMs);
        } : (txn, result) => recordCanonicalChatProjectionRepair(txn, {
            repairKey, sessionId: result.id, locator: nextLocator, operation: 'rename', reason: 'projection_failed',
            details: { previousSourcePath: locator.sourcePath }, nowMs,
        }),
    });
    if (renamed?.status === 'conflict' || renamed?.status === 'operation_mismatch') {
        return { ok: false, authorityCommitted: false, reason: renamed.status };
    }
    if (renamed?.replayed) return { ok: true, authorityCommitted: true, version: renamed.version, replayed: true };
    if (!renamed) {
        return { ok: false, authorityCommitted: false, reason: 'missing_canonical_session' };
    }
    if (projection === 'off') {
        try {
            withCanonicalTransaction(db, (txn: DatabaseSync) => {
                const current = txn.prepare('SELECT 1 FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                    .get(locator.ownerType, locator.ownerId, locator.sourcePath);
                if (current) return;
                onAuthorityCommitted?.(renamed.sourceJsonl);
                removeImportLedgerEntry(txn, { sliceKey: 'chats', sourcePath: locator.sourcePath });
            });
        } catch (error) {
            console.warn('Canonical chat post-commit side effects skipped:', error);
        }
        return { ok: true, authorityCommitted: true, sessionId: renamed.id, version: renamed.version };
    }
    try {
        withCanonicalTransaction(db, (txn: DatabaseSync) => {
            const session = txn.prepare('SELECT source_jsonl FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(nextLocator.ownerType, nextLocator.ownerId, nextLocator.sourcePath);
            const oldSession = txn.prepare('SELECT 1 FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(locator.ownerType, locator.ownerId, locator.sourcePath);
            if (!session || oldSession) throw new Error('chat_projection_path_changed');
            // This column is the JSONL text written by the canonical store.
            projectRename(session.source_jsonl as string);
            recordImportLedgerEntry(txn, {
                sliceKey: 'chats', sourcePath: nextLocator.sourcePath,
                contentHash: crypto.createHash('sha256').update(session.source_jsonl as string).digest('hex'), origin: 'projection', nowMs,
            });
            if (locator.sourcePath !== nextLocator.sourcePath) removeImportLedgerEntry(txn, { sliceKey: 'chats', sourcePath: locator.sourcePath });
            resolveCanonicalChatProjectionRepair(txn, { repairKey, resolvedAtMs: nowMs });
        });
    } catch (error) {
        onProjectionFailure?.({ repairKey, error, locator: nextLocator, operation: 'rename' });
        return {
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey,
            sessionId: renamed.id,
            version: renamed.version,
        };
    }
    return { ok: true, authorityCommitted: true, sessionId: renamed.id, version: renamed.version };
}

export function deleteCanonicalChat({
    db,
    locator,
    projectDelete,
    projection = 'sync',
    nowMs = Date.now(),
    onProjectionFailure = null,
    version = null,
    operationIdentity = null,
}: DeleteOptions) {
    if (typeof projectDelete !== 'function') {
        throw new Error('Canonical chat delete projection function is required.');
    }

    const repairKey = buildRepairKey(locator, 'delete');
    const options: NonNullable<Parameters<typeof deleteCanonicalChatSession>[2]> = {
        onPersist: projection === 'off' ? txn => syncCanonicalCharacterChatStats(txn, locator, nowMs) : txn => recordCanonicalChatProjectionRepair(txn, {
            repairKey, sessionId: null, locator, operation: 'delete', reason: 'projection_failed', details: {}, nowMs,
        }),
        operation: operationIdentity,
    };
    const deleted: StoreResultView | null = version
        ? deleteCanonicalChatSessionIfCurrent(db, locator, version, options)
        : deleteCanonicalChatSession(db, locator, options);
    if (deleted?.status === 'conflict' || deleted?.status === 'operation_mismatch') {
        return { ok: false, authorityCommitted: false, reason: deleted.status };
    }
    if (deleted?.replayed) return { ok: true, authorityCommitted: true, replayed: true };
    if (!deleted) {
        return { ok: false, authorityCommitted: false, reason: 'missing_canonical_session' };
    }
    if (projection === 'off') {
        try {
            withCanonicalTransaction(db, (txn: DatabaseSync) => {
                const current = txn.prepare('SELECT 1 FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                    .get(locator.ownerType, locator.ownerId, locator.sourcePath);
                if (current) return;
                projectDelete();
                removeImportLedgerEntry(txn, { sliceKey: 'chats', sourcePath: locator.sourcePath });
            });
        } catch (error) {
            console.warn('Canonical chat stale-file cleanup skipped:', error);
        }
        return { ok: true, authorityCommitted: true, sessionId: deleted.id };
    }
    try {
        withCanonicalTransaction(db, (txn: DatabaseSync) => {
            const session = txn.prepare('SELECT 1 FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(locator.ownerType, locator.ownerId, locator.sourcePath);
            if (session) throw new Error('chat_projection_path_reused');
            projectDelete();
            removeImportLedgerEntry(txn, { sliceKey: 'chats', sourcePath: locator.sourcePath });
            resolveCanonicalChatProjectionRepair(txn, { repairKey, resolvedAtMs: nowMs });
        });
    } catch (error) {
        onProjectionFailure?.({ repairKey, error, locator, operation: 'delete' });
        return {
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey,
            sessionId: deleted.id,
        };
    }
    return { ok: true, authorityCommitted: true, sessionId: deleted.id };
}

export { listOpenCanonicalChatProjectionRepairs };
