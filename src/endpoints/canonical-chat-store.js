import crypto from 'node:crypto';
import path from 'node:path';

import { withCanonicalTransaction } from '../canonical-sqlite.js';

function hashIdentity(...parts) {
    const hash = crypto.createHash('sha256');
    for (const part of parts) {
        hash.update(String(part));
        hash.update('\u0000');
    }
    return hash.digest('hex');
}

function parsePayloadObject(payload, fieldName) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`Canonical chat ${fieldName} must be an object.`);
    }
    return payload;
}

function getMessageIdentityBase(message, payloadJson) {
    return message.id
        ?? message.mesid
        ?? message?.extra?.id
        ?? hashIdentity(message.name ?? '', message.send_date ?? '', payloadJson);
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

function getManagedMediaByCompatibilityPath(db) {
    try {
        return new Map(db.prepare(`
            SELECT compatibility_path, blob_id
            FROM media_references
            WHERE deleted_at_ms IS NULL
        `).all().map(row => [row.compatibility_path, row.blob_id]));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: media_references')) {
            return new Map();
        }
        throw error;
    }
}

function getSessionBySourceKey(db, { ownerType, ownerId, sourceKey }) {
    return db.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE owner_type = ? AND owner_id = ? AND source_key = ?
    `).get(ownerType, ownerId, sourceKey) ?? null;
}

function getGroupSessionBySourceJsonl(db, { sourceJsonl }) {
    const matches = db.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE owner_type = 'group' AND source_jsonl = ?
    `).all(sourceJsonl);
    return matches.length === 1 ? matches[0] : null;
}

export function getCanonicalChatSession(db, { ownerType, ownerId, sourcePath }) {
    return db.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE owner_type = ? AND owner_id = ? AND source_path = ?
    `).get(ownerType, ownerId, sourcePath) ?? null;
}

/**
 * Converts a route-visible full chat payload into an opaque canonical session record.
 * Unknown header/message fields remain in payload JSON unchanged.
 */
export function createCanonicalChatSessionRecord(db, {
    locator,
    payload,
    nowMs = Date.now(),
}) {
    if (!locator || !['character', 'group'].includes(locator.ownerType)
        || !locator.ownerId || !locator.sourcePath) {
        throw new Error('Canonical chat locator is invalid.');
    }
    if (!Array.isArray(payload) || payload.length === 0) {
        throw new Error('Canonical chat payload must include a header.');
    }

    const header = parsePayloadObject(payload[0], 'header');
    const existing = getCanonicalChatSession(db, locator);
    const sourceKey = existing?.source_key ?? hashIdentity(
        locator.ownerType,
        locator.ownerId,
        locator.sourcePath,
    );
    const mediaByPath = getManagedMediaByCompatibilityPath(db);
    const occurrences = new Map();
    const headerPayloadJson = JSON.stringify(header);
    const messages = payload.slice(1).map((value, order) => {
        const message = parsePayloadObject(value, 'message');
        const payloadJson = JSON.stringify(message);
        const base = String(getMessageIdentityBase(message, payloadJson));
        const occurrence = occurrences.get(base) ?? 0;
        occurrences.set(base, occurrence + 1);
        const identityKey = hashIdentity(base, occurrence);
        const attachments = listStringLeaves(message)
            .filter(leaf => mediaByPath.has(leaf.value))
            .map(leaf => ({
                blobId: mediaByPath.get(leaf.value),
                role: 'attachment',
                compatibility: {
                    path: leaf.value,
                    fieldPath: leaf.fieldPath,
                },
            }));

        return {
            id: `chat-message-${hashIdentity(sourceKey, identityKey)}`,
            order,
            identityKey,
            payloadJson,
            payload: message,
            createdAtMs: Number(message.send_date ?? 0) || null,
            attachments,
        };
    });
    const sourceJsonl = [headerPayloadJson, ...messages.map(message => message.payloadJson)].join('\n');

    return {
        id: existing?.id ?? `chat-session-${sourceKey}`,
        ownerType: locator.ownerType,
        ownerId: String(locator.ownerId),
        sourceKey,
        sourcePath: String(locator.sourcePath),
        displayName: path.posix.parse(String(locator.sourcePath)).name,
        headerPayloadJson,
        sourceJsonl,
        sourceMtimeMs: Number(nowMs),
        sourceSizeBytes: Buffer.byteLength(sourceJsonl),
        createdAtMs: Number(existing?.created_at_ms ?? nowMs),
        updatedAtMs: Number(nowMs),
        messages,
    };
}

function getExistingSession(db, record) {
    return getSessionBySourceKey(db, record)
        ?? getCanonicalChatSession(db, record)
        ?? (record.ownerType === 'group' ? getGroupSessionBySourceJsonl(db, record) : null);
}

export function listCanonicalChatSessions(db) {
    return db.prepare('SELECT * FROM chat_sessions ORDER BY owner_type ASC, owner_id ASC, source_path ASC').all();
}

export function serializeCanonicalChatSession(db, sessionId) {
    const session = db.prepare('SELECT source_jsonl FROM chat_sessions WHERE id = ?').get(sessionId);
    return session?.source_jsonl ?? null;
}

function extractSwipes(payload) {
    return Array.isArray(payload?.swipes) ? payload.swipes : [];
}

function getExistingMessageIds(db, sessionId) {
    return new Map(db.prepare(`
        SELECT id, identity_key
        FROM chat_messages
        WHERE session_id = ?
    `).all(sessionId).map(message => [message.identity_key, message.id]));
}

function getAttachmentSnapshot(db, sessionId) {
    return db.prepare(`
        SELECT message.identity_key, reference.blob_id, reference.role, reference.compatibility_json
        FROM chat_attachment_refs AS reference
        JOIN chat_messages AS message ON message.id = reference.message_id
        WHERE message.session_id = ?
        ORDER BY message.identity_key ASC, reference.blob_id ASC, reference.role ASC, reference.compatibility_json ASC
    `).all(sessionId);
}

function getExpectedAttachmentSnapshot(record) {
    return record.messages.flatMap(message => message.attachments.map(attachment => ({
        identity_key: message.identityKey,
        blob_id: attachment.blobId,
        role: attachment.role,
        compatibility_json: JSON.stringify(attachment.compatibility),
    }))).sort((left, right) => (
        left.identity_key.localeCompare(right.identity_key)
        || left.blob_id.localeCompare(right.blob_id)
        || left.role.localeCompare(right.role)
        || left.compatibility_json.localeCompare(right.compatibility_json)
    ));
}

function hasMatchingAttachmentSnapshot(db, sessionId, record) {
    return JSON.stringify(getAttachmentSnapshot(db, sessionId))
        === JSON.stringify(getExpectedAttachmentSnapshot(record));
}

export function upsertCanonicalChatSession(db, record) {
    const existing = getExistingSession(db, record);
    const sourceUnchanged = existing?.source_jsonl === record.sourceJsonl;
    const attachmentSnapshotMatches = existing
        ? hasMatchingAttachmentSnapshot(db, existing.id, record)
        : false;
    if (sourceUnchanged
        && existing.source_path === record.sourcePath
        && attachmentSnapshotMatches) {
        return { id: existing.id, status: 'unchanged' };
    }

    const id = existing?.id ?? record.id;
    const existingMessageIds = existing ? getExistingMessageIds(db, id) : new Map();
    withCanonicalTransaction(db, txnDb => {
        if (existing) {
            txnDb.prepare(`
                UPDATE chat_sessions
                SET
                    source_key = ?,
                    owner_id = ?,
                    source_path = ?,
                    display_name = ?,
                    header_payload_json = ?,
                    source_jsonl = ?,
                    source_mtime_ms = ?,
                    source_size_bytes = ?,
                    updated_at_ms = ?
                WHERE id = ?
            `).run(
                record.sourceKey,
                record.ownerId,
                record.sourcePath,
                record.displayName,
                record.headerPayloadJson,
                record.sourceJsonl,
                record.sourceMtimeMs,
                record.sourceSizeBytes,
                record.updatedAtMs,
                id,
            );
        } else {
            txnDb.prepare(`
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
                id,
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
        }

        if (sourceUnchanged && attachmentSnapshotMatches) {
            return;
        }

        txnDb.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id);
        const insertMessage = txnDb.prepare(`
            INSERT INTO chat_messages (
                id,
                session_id,
                message_order,
                identity_key,
                payload_json,
                created_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertSwipe = txnDb.prepare(`
            INSERT INTO chat_message_swipes (message_id, swipe_order, payload_json)
            VALUES (?, ?, ?)
        `);
        const insertAttachment = txnDb.prepare(`
            INSERT INTO chat_attachment_refs (message_id, blob_id, role, compatibility_json)
            VALUES (?, ?, ?, ?)
        `);

        for (const message of record.messages) {
            const messageId = existingMessageIds.get(message.identityKey) ?? message.id;
            insertMessage.run(
                messageId,
                id,
                message.order,
                message.identityKey,
                message.payloadJson,
                message.createdAtMs,
            );
            for (const [swipeOrder, swipe] of extractSwipes(message.payload).entries()) {
                insertSwipe.run(messageId, swipeOrder, JSON.stringify(swipe));
            }
            for (const attachment of message.attachments) {
                insertAttachment.run(
                    messageId,
                    attachment.blobId,
                    attachment.role,
                    JSON.stringify(attachment.compatibility),
                );
            }
        }
    });

    return {
        id,
        status: existing ? 'updated' : 'imported',
    };
}

export function renameCanonicalChatSession(db, {
    locator,
    nextLocator,
    nowMs = Date.now(),
}) {
    const session = getCanonicalChatSession(db, locator);
    if (!session) {
        return null;
    }
    if (getCanonicalChatSession(db, nextLocator)) {
        throw new Error('Canonical chat rename destination already exists.');
    }

    withCanonicalTransaction(db, txnDb => {
        txnDb.prepare(`
            UPDATE chat_sessions
            SET
                owner_id = ?,
                source_path = ?,
                display_name = ?,
                updated_at_ms = ?
            WHERE id = ?
        `).run(
            nextLocator.ownerId,
            nextLocator.sourcePath,
            path.posix.parse(String(nextLocator.sourcePath)).name,
            Number(nowMs),
            session.id,
        );
    });

    return {
        id: session.id,
        sourceJsonl: session.source_jsonl,
    };
}

export function deleteCanonicalChatSession(db, locator) {
    const session = getCanonicalChatSession(db, locator);
    if (!session) {
        return null;
    }

    withCanonicalTransaction(db, txnDb => {
        txnDb.prepare('DELETE FROM chat_sessions WHERE id = ?').run(session.id);
    });
    return {
        id: session.id,
        sourceJsonl: session.source_jsonl,
    };
}

export function getCanonicalChatMessagePayloads(db, sessionId) {
    return db.prepare(`
        SELECT id, message_order, payload_json
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY message_order ASC
    `).all(sessionId).map(row => ({
        id: row.id,
        order: Number(row.message_order),
        payloadJson: String(row.payload_json),
    }));
}

export function recordCanonicalChatProjectionRepair(db, {
    repairKey,
    sessionId = null,
    locator,
    operation,
    reason,
    details = {},
    nowMs = Date.now(),
}) {
    db.prepare(`
        INSERT INTO chat_projection_repairs (
            repair_key,
            session_id,
            owner_type,
            owner_id,
            source_path,
            operation,
            reason,
            details_json,
            created_at_ms,
            updated_at_ms,
            last_attempt_at_ms,
            resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(repair_key) DO UPDATE SET
            session_id = excluded.session_id,
            owner_type = excluded.owner_type,
            owner_id = excluded.owner_id,
            source_path = excluded.source_path,
            operation = excluded.operation,
            reason = excluded.reason,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            resolved_at_ms = NULL
    `).run(
        repairKey,
        sessionId,
        locator.ownerType,
        locator.ownerId,
        locator.sourcePath,
        operation,
        reason,
        JSON.stringify(details),
        Number(nowMs),
        Number(nowMs),
    );
}

export function listOpenCanonicalChatProjectionRepairs(db) {
    try {
        return db.prepare(`
            SELECT
                repair_key,
                session_id,
                owner_type,
                owner_id,
                source_path,
                operation,
                reason,
                details_json,
                created_at_ms,
                updated_at_ms,
                last_attempt_at_ms,
                resolved_at_ms
            FROM chat_projection_repairs
            WHERE resolved_at_ms IS NULL
            ORDER BY created_at_ms ASC, repair_key ASC
        `).all().map(row => {
            let details = {};
            try {
                details = JSON.parse(String(row.details_json ?? '{}'));
            } catch {
                details = {};
            }
            return {
                repairKey: String(row.repair_key),
                sessionId: row.session_id == null ? null : String(row.session_id),
                ownerType: String(row.owner_type),
                ownerId: String(row.owner_id),
                sourcePath: String(row.source_path),
                operation: String(row.operation),
                reason: String(row.reason),
                details,
                createdAtMs: Number(row.created_at_ms),
                updatedAtMs: Number(row.updated_at_ms),
                lastAttemptAtMs: row.last_attempt_at_ms == null ? null : Number(row.last_attempt_at_ms),
                resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
            };
        });
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: chat_projection_repairs')) {
            return [];
        }
        throw error;
    }
}

export function resolveCanonicalChatProjectionRepair(db, {
    repairKey,
    resolvedAtMs = Date.now(),
}) {
    return db.prepare(`
        UPDATE chat_projection_repairs
        SET resolved_at_ms = ?,
            updated_at_ms = ?,
            last_attempt_at_ms = ?
        WHERE repair_key = ?
            AND resolved_at_ms IS NULL
    `).run(
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        repairKey,
    );
}
