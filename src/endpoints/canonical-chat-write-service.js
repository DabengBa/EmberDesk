import crypto from 'node:crypto';
import { withCanonicalTransaction } from '../canonical-sqlite.js';

import {
    recordImportLedgerEntry,
    removeImportLedgerEntry,
} from '../canonical-import-ledger.js';
import {
    createCanonicalChatSessionRecord,
    deleteCanonicalChatSession,
    listOpenCanonicalChatProjectionRepairs,
    renameCanonicalChatSession,
    recordCanonicalChatProjectionRepair,
    resolveCanonicalChatProjectionRepair,
    upsertCanonicalChatSession,
    syncCanonicalCharacterChatStats,
} from './canonical-chat-store.js';

function buildRepairKey(locator, operation) {
    return [
        'chat',
        locator.ownerType,
        locator.ownerId,
        encodeURIComponent(locator.sourcePath),
        operation,
    ].join(':');
}

function listStringLeaves(value, fieldPath = []) {
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

function isManagedAttachmentCandidate(value) {
    return /^(files|assets|user\/files|user\/images|User Avatars)\//.test(String(value ?? ''));
}

function findFirstUnregisteredAttachmentPath(db, payload) {
    const managedPaths = new Set();
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
        if (String(error?.message ?? '').includes('no such table: media_references')) {
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
}) {
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
    const persisted = upsertCanonicalChatSession(db, record, {
        onPersist: projection === 'off' ? txn => syncCanonicalCharacterChatStats(txn, locator, nowMs) : (txn, result) => recordCanonicalChatProjectionRepair(txn, {
            repairKey,
            sessionId: result.id,
            locator,
            operation,
            reason: 'projection_failed',
            details: {},
            nowMs,
        }),
    });
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
        };
    }
    try {
        withCanonicalTransaction(db, txn => {
            const session = txn.prepare('SELECT source_jsonl FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(locator.ownerType, locator.ownerId, locator.sourcePath);
            if (!session) throw new Error('missing_canonical_chat_session');
            projectJsonl(session.source_jsonl);
            recordImportLedgerEntry(txn, {
                sliceKey: 'chats',
                sourcePath: locator.sourcePath,
                contentHash: crypto.createHash('sha256').update(session.source_jsonl).digest('hex'),
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
        };
    }

    return {
        ok: true,
        authorityCommitted: true,
        sessionId: persisted.id,
        status: persisted.status,
    };
}

export function parseCanonicalChatJsonl(jsonl) {
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
            throw new Error(`Chat JSONL line ${index + 1} is invalid: ${String(error?.message ?? error ?? '')}`);
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
}) {
    if (typeof projectRename !== 'function') {
        throw new Error('Canonical chat rename projection function is required.');
    }

    const repairKey = buildRepairKey(nextLocator, 'rename');
    const renamed = renameCanonicalChatSession(db, {
        locator, nextLocator, nowMs,
        onPersist: projection === 'off' ? txn => {
            syncCanonicalCharacterChatStats(txn, locator, nowMs);
            if (nextLocator.ownerId !== locator.ownerId) syncCanonicalCharacterChatStats(txn, nextLocator, nowMs);
        } : (txn, result) => recordCanonicalChatProjectionRepair(txn, {
            repairKey, sessionId: result.id, locator: nextLocator, operation: 'rename', reason: 'projection_failed',
            details: { previousSourcePath: locator.sourcePath }, nowMs,
        }),
    });
    if (!renamed) {
        return { ok: false, authorityCommitted: false, reason: 'missing_canonical_session' };
    }
    if (projection === 'off') {
        try {
            onAuthorityCommitted?.(renamed.sourceJsonl);
        } catch (error) {
            console.warn('Canonical chat post-commit side effects skipped:', error);
        }
        removeImportLedgerEntry(db, { sliceKey: 'chats', sourcePath: locator.sourcePath });
        return { ok: true, authorityCommitted: true, sessionId: renamed.id };
    }
    try {
        withCanonicalTransaction(db, txn => {
            const session = txn.prepare('SELECT source_jsonl FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(nextLocator.ownerType, nextLocator.ownerId, nextLocator.sourcePath);
            const oldSession = txn.prepare('SELECT 1 FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(locator.ownerType, locator.ownerId, locator.sourcePath);
            if (!session || oldSession) throw new Error('chat_projection_path_changed');
            projectRename(session.source_jsonl);
            recordImportLedgerEntry(txn, {
                sliceKey: 'chats', sourcePath: nextLocator.sourcePath,
                contentHash: crypto.createHash('sha256').update(session.source_jsonl).digest('hex'), origin: 'projection', nowMs,
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
        };
    }
    return { ok: true, authorityCommitted: true, sessionId: renamed.id };
}

export function deleteCanonicalChat({
    db,
    locator,
    projectDelete,
    projection = 'sync',
    nowMs = Date.now(),
    onProjectionFailure = null,
}) {
    if (typeof projectDelete !== 'function') {
        throw new Error('Canonical chat delete projection function is required.');
    }

    const repairKey = buildRepairKey(locator, 'delete');
    const deleted = deleteCanonicalChatSession(db, locator, {
        onPersist: projection === 'off' ? txn => syncCanonicalCharacterChatStats(txn, locator, nowMs) : txn => recordCanonicalChatProjectionRepair(txn, {
            repairKey, sessionId: null, locator, operation: 'delete', reason: 'projection_failed', details: {}, nowMs,
        }),
    });
    if (!deleted) {
        return { ok: false, authorityCommitted: false, reason: 'missing_canonical_session' };
    }
    if (projection === 'off') {
        try {
            projectDelete();
        } catch (error) {
            console.warn('Canonical chat stale-file cleanup skipped:', error);
        }
        removeImportLedgerEntry(db, { sliceKey: 'chats', sourcePath: locator.sourcePath });
        return { ok: true, authorityCommitted: true, sessionId: deleted.id };
    }
    try {
        withCanonicalTransaction(db, txn => {
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
