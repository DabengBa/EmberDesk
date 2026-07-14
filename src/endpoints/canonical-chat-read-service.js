import {
    getCanonicalChatMessagePayloads,
    getCanonicalChatSession,
} from './canonical-chat-store.js';

function parseCanonicalPayload(payloadJson, fieldName) {
    try {
        const payload = JSON.parse(String(payloadJson));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('payload must be an object');
        }
        return payload;
    } catch (error) {
        throw new Error(`Canonical chat ${fieldName} is invalid: ${String(error?.message ?? error ?? '')}`);
    }
}

function getCanonicalPayloadRows(db, locator) {
    const session = getCanonicalChatSession(db, locator);
    if (!session) {
        return null;
    }

    return {
        session,
        messages: getCanonicalChatMessagePayloads(db, session.id),
    };
}

/**
 * Rebuild the existing full chat array contract from canonical rows.
 * Message payloads remain opaque JSON so extensions keep their unknown fields.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ownerType: 'character'|'group', ownerId: string, sourcePath: string}} locator
 * @returns {Array<object>|null}
 */
export function readCanonicalChatPayload(db, locator) {
    const rows = getCanonicalPayloadRows(db, locator);
    if (!rows) {
        return null;
    }

    return [
        parseCanonicalPayload(rows.session.header_payload_json, 'header payload'),
        ...rows.messages.map(message => parseCanonicalPayload(message.payloadJson, 'message payload')),
    ];
}

/**
 * Serialize canonical rows to the JSONL compatibility/export format.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ownerType: 'character'|'group', ownerId: string, sourcePath: string}} locator
 * @returns {string|null}
 */
export function serializeCanonicalChatPayload(db, locator) {
    const rows = getCanonicalPayloadRows(db, locator);
    if (!rows) {
        return null;
    }

    // Validate rows before returning raw JSON to avoid exporting a corrupt DB payload.
    parseCanonicalPayload(rows.session.header_payload_json, 'header payload');
    for (const message of rows.messages) {
        parseCanonicalPayload(message.payloadJson, 'message payload');
    }

    return [
        rows.session.header_payload_json,
        ...rows.messages.map(message => message.payloadJson),
    ].join('\n');
}
