import { withCanonicalTransaction } from '../canonical-sqlite.js';

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
