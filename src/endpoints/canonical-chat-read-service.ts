import type { DatabaseSync } from 'node:sqlite';

import {
    getCanonicalChatMessagePayloads,
    getCanonicalChatSession,
} from './canonical-chat-store.js';
import { withCanonicalTransaction } from '../canonical-sqlite.js';

export type CanonicalChatLocator = {
    ownerType: 'character' | 'group';
    ownerId: string;
    sourcePath: string;
};

type CanonicalSession = { id: string; header_payload_json: string; concurrency_token: string | null };
type CanonicalMessage = { payloadJson: string };
type CanonicalPayloadRows = { session: CanonicalSession; messages: CanonicalMessage[] };
export type CanonicalChatVersionedPayload = { version: string | null; payload: object[] };

function parseCanonicalPayload(payloadJson: unknown, fieldName: string): object {
    try {
        const payload: unknown = JSON.parse(String(payloadJson));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('payload must be an object');
        }
        return payload;
    } catch (error) {
        const caught = error as { message?: unknown } | null | undefined;
        throw new Error(`Canonical chat ${fieldName} is invalid: ${String(caught?.message ?? caught ?? '')}`);
    }
}

function getCanonicalPayloadRows(db: DatabaseSync, locator: CanonicalChatLocator): CanonicalPayloadRows | null {
    const session: CanonicalSession | null = getCanonicalChatSession(db, locator);
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
 */
export function readCanonicalChatPayload(db: DatabaseSync, locator: CanonicalChatLocator): object[] | null {
    const rows = getCanonicalPayloadRows(db, locator);
    if (!rows) {
        return null;
    }

    return [
        parseCanonicalPayload(rows.session.header_payload_json, 'header payload'),
        ...rows.messages.map(message => parseCanonicalPayload(message.payloadJson, 'message payload')),
    ];
}

/** Read the payload and the version that guards it from the same snapshot. */
export function readCanonicalChatVersionedPayload(db: DatabaseSync, locator: CanonicalChatLocator): CanonicalChatVersionedPayload | null {
    return withCanonicalTransaction(db, (txn: DatabaseSync) => {
        const rows = getCanonicalPayloadRows(txn, locator);
        if (!rows) return null;
        return {
            version: rows.session.concurrency_token,
            payload: [
                parseCanonicalPayload(rows.session.header_payload_json, 'header payload'),
                ...rows.messages.map(message => parseCanonicalPayload(message.payloadJson, 'message payload')),
            ],
        };
    });
}

/** Serialize canonical rows to the JSONL compatibility/export format. */
export function serializeCanonicalChatPayload(db: DatabaseSync, locator: CanonicalChatLocator): string | null {
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
