import {
    createCanonicalChatSessionRecord,
    deleteCanonicalChatSession,
    listOpenCanonicalChatProjectionRepairs,
    renameCanonicalChatSession,
    recordCanonicalChatProjectionRepair,
    upsertCanonicalChatSession,
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
    return /^(files|backgrounds|assets|user\/files|user\/images|User Avatars)\//.test(String(value ?? ''));
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
    nowMs = Date.now(),
    onProjectionFailure = null,
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
    const persisted = upsertCanonicalChatSession(db, record);
    try {
        projectJsonl(record.sourceJsonl);
    } catch (error) {
        const repairKey = buildRepairKey(locator, operation);
        recordCanonicalChatProjectionRepair(db, {
            repairKey,
            sessionId: persisted.id,
            locator,
            operation,
            reason: 'projection_failed',
            details: {
                message: String(error?.message ?? error ?? ''),
            },
            nowMs,
        });
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
    nowMs = Date.now(),
    onProjectionFailure = null,
}) {
    if (typeof projectRename !== 'function') {
        throw new Error('Canonical chat rename projection function is required.');
    }

    const renamed = renameCanonicalChatSession(db, { locator, nextLocator, nowMs });
    if (!renamed) {
        return { ok: false, authorityCommitted: false, reason: 'missing_canonical_session' };
    }
    try {
        projectRename();
    } catch (error) {
        const repairKey = buildRepairKey(nextLocator, 'rename');
        recordCanonicalChatProjectionRepair(db, {
            repairKey,
            sessionId: renamed.id,
            locator: nextLocator,
            operation: 'rename',
            reason: 'projection_failed',
            details: {
                previousSourcePath: locator.sourcePath,
                message: String(error?.message ?? error ?? ''),
            },
            nowMs,
        });
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
    nowMs = Date.now(),
    onProjectionFailure = null,
}) {
    if (typeof projectDelete !== 'function') {
        throw new Error('Canonical chat delete projection function is required.');
    }

    const deleted = deleteCanonicalChatSession(db, locator);
    if (!deleted) {
        return { ok: false, authorityCommitted: false, reason: 'missing_canonical_session' };
    }
    try {
        projectDelete();
    } catch (error) {
        const repairKey = buildRepairKey(locator, 'delete');
        recordCanonicalChatProjectionRepair(db, {
            repairKey,
            sessionId: null,
            locator,
            operation: 'delete',
            reason: 'projection_failed',
            details: {
                message: String(error?.message ?? error ?? ''),
            },
            nowMs,
        });
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
