import { withCanonicalTransaction } from '../canonical-sqlite.js';

function getSessionBySourceKey(db, { ownerType, ownerId, sourceKey }) {
    return db.prepare(`
        SELECT *
        FROM chat_sessions
        WHERE owner_type = ? AND owner_id = ? AND source_key = ?
    `).get(ownerType, ownerId, sourceKey) ?? null;
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
        ?? getCanonicalChatSession(db, record);
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

export function upsertCanonicalChatSession(db, record) {
    const existing = getExistingSession(db, record);
    if (existing?.source_jsonl === record.sourceJsonl && existing.source_path === record.sourcePath) {
        return { id: existing.id, status: 'unchanged' };
    }

    const id = existing?.id ?? record.id;
    withCanonicalTransaction(db, txnDb => {
        if (existing) {
            txnDb.prepare(`
                UPDATE chat_sessions
                SET
                    source_key = ?,
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

        if (existing?.source_jsonl === record.sourceJsonl) {
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
            insertMessage.run(
                message.id,
                id,
                message.order,
                message.identityKey,
                message.payloadJson,
                message.createdAtMs,
            );
            for (const [swipeOrder, swipe] of extractSwipes(message.payload).entries()) {
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
