import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { createCanonicalChatSession, createCanonicalChatSessionRecord } from '../src/endpoints/canonical-chat-store.js';
import {
    readCanonicalChatPayload,
    readCanonicalChatVersionedPayload,
    serializeCanonicalChatPayload,
} from '../src/endpoints/canonical-chat-read-service.ts';

const roots = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-read-'));
    roots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    fs.mkdirSync(path.join(directories.chats, 'alice'), { recursive: true });
    return directories;
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical read boundaries', () => {
    const locator = { ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/first.jsonl' };

    function fixture() {
        const directories = makeDirectories();
        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        const db = manager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: false } });
        runCanonicalMigrations(db);
        const record = createCanonicalChatSessionRecord(db, { locator, payload: [{ header: true }, { mes: 'first' }, { mes: 'second' }] });
        createCanonicalChatSession(db, record);
        const other = new DatabaseSync(path.join(directories.storage, 'emberdesk.sqlite'));
        other.exec('PRAGMA busy_timeout = 0');
        return { db, other, close() { other.close(); manager.dispose(); } };
    }

    test('missing sessions return null from all three exports', () => {
        const { db, close } = fixture();
        try {
            const missing = { ...locator, sourcePath: 'chats/alice/missing.jsonl' };
            expect(readCanonicalChatPayload(db, missing)).toBeNull();
            expect(readCanonicalChatVersionedPayload(db, missing)).toBeNull();
            expect(serializeCanonicalChatPayload(db, missing)).toBeNull();
            expect(db.isTransaction).toBe(false);
        } finally { close(); }
    });

    test('JSONL retains raw row bytes and order while reads preserve opaque fields and null version', () => {
        const { db, close } = fixture();
        try {
            const header = ' { "z": 1, "custom": {"x":true} } ';
            const first = '{ "mes" : "hello", "opaque": [1,2] }';
            const second = '{"mes":"world", "escaped":"\\u0061"}';
            db.prepare('UPDATE chat_sessions SET header_payload_json = ?, concurrency_token = NULL WHERE source_path = ?').run(header, locator.sourcePath);
            const id = db.prepare('SELECT id FROM chat_sessions WHERE source_path = ?').get(locator.sourcePath).id;
            db.prepare('UPDATE chat_messages SET payload_json = ? WHERE session_id = ? AND message_order = 0').run(first, id);
            db.prepare('UPDATE chat_messages SET payload_json = ? WHERE session_id = ? AND message_order = 1').run(second, id);
            const payload = [JSON.parse(header), JSON.parse(first), JSON.parse(second)];
            expect(readCanonicalChatPayload(db, locator)).toEqual(payload);
            expect(readCanonicalChatVersionedPayload(db, locator)).toEqual({ version: null, payload });
            expect(serializeCanonicalChatPayload(db, locator)).toBe([header, first, second].join('\n'));
        } finally { close(); }
    });

    test.each([
        ['header_payload_json', '{', 'header payload', 'invalid'],
        ['header_payload_json', '[]', 'header payload', 'payload must be an object'],
        ['payload_json', '{', 'message payload', 'invalid'],
        ['payload_json', 'null', 'message payload', 'payload must be an object'],
    ])('rejects corrupt %s %s with stable field errors and rolls back versioned reads', (column, value, field, reason) => {
        const { db, close } = fixture();
        try {
            if (column === 'header_payload_json') db.prepare('UPDATE chat_sessions SET header_payload_json = ? WHERE source_path = ?').run(value, locator.sourcePath);
            else db.prepare('UPDATE chat_messages SET payload_json = ? WHERE message_order = 0').run(value);
            for (const read of [readCanonicalChatPayload, serializeCanonicalChatPayload, readCanonicalChatVersionedPayload]) {
                expect(() => read(db, locator)).toThrow(`Canonical chat ${field} is invalid:`);
                expect(() => read(db, locator)).toThrow(reason);
                expect(db.isTransaction).toBe(false);
            }
            expect(db.prepare('SELECT 1 AS ok').get().ok).toBe(1);
        } finally { close(); }
    });

    test('session and message queries share a real transaction which blocks another writer', () => {
        const { db, other, close } = fixture();
        const observed = [];
        try {
            const intercepted = new Proxy(db, {
                get(target, property) {
                    if (property === 'prepare') return sql => {
                        const statement = target.prepare(sql);
                        const kind = sql.includes('FROM chat_sessions') ? 'session' : sql.includes('FROM chat_messages') ? 'messages' : null;
                        if (!kind) return statement;
                        return new Proxy(statement, {
                            get(stmt, method) {
                                if (method === 'get' || method === 'all') return (...args) => {
                                    observed.push([kind, target.isTransaction]);
                                    expect(() => other.prepare('UPDATE chat_sessions SET display_name = ? WHERE source_path = ?').run('concurrent', locator.sourcePath)).toThrow(/locked/);
                                    return stmt[method](...args);
                                };
                                const value = stmt[method];
                                return typeof value === 'function' ? value.bind(stmt) : value;
                            },
                        });
                    };
                    const value = target[property];
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
            const version = db.prepare('SELECT concurrency_token FROM chat_sessions WHERE source_path = ?').get(locator.sourcePath).concurrency_token;
            expect(readCanonicalChatVersionedPayload(intercepted, locator)).toEqual({ version, payload: [{ header: true }, { mes: 'first' }, { mes: 'second' }] });
            expect(observed).toEqual([['session', true], ['messages', true]]);
            expect(db.isTransaction).toBe(false);
            expect(other.prepare('UPDATE chat_sessions SET display_name = ? WHERE source_path = ?').run('after', locator.sourcePath).changes).toBe(1);
        } finally { close(); }
    });
});

describe('canonical chat read service', () => {
    test('rebuilds the full character payload and JSONL export from canonical rows after the JSONL projection drifts', async () => {
        const directories = makeDirectories();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        const originalPayload = [
            {
                user_name: 'User',
                character_name: 'Alice',
                chat_metadata: { integrity: 'clean', custom: { preserved: true } },
                unknown_header: 'keep',
            },
            {
                name: 'User',
                is_user: true,
                mes: 'Hello',
                extra: { source: 'canonical' },
            },
            {
                name: 'Alice',
                mes: 'Hi',
                swipes: ['Hi', 'Hello'],
                swipe_id: 1,
                unknown_message: { preserved: true },
            },
        ];
        fs.writeFileSync(sourcePath, originalPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
        });

        fs.writeFileSync(sourcePath, [
            '{"chat_metadata":{"integrity":"external-drift"}}',
            '{"name":"User","mes":"JSONL should not be read"}',
        ].join('\n'), 'utf8');

        const payload = readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        });

        expect(payload).toEqual(originalPayload);
        expect(serializeCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })).toBe(originalPayload.map(line => JSON.stringify(line)).join('\n'));

        manager.dispose();
    });

    test('keeps group payload order and metadata intact', async () => {
        const directories = makeDirectories();
        const sourcePath = path.join(directories.groupChats, 'party.jsonl');
        const payload = [
            { name: 'Group', chat_metadata: { group_id: 'party', nested: { keep: true } } },
            { name: 'User', mes: 'First' },
            { name: 'Alice', mes: 'Second', swipes: ['Second', 'Alternative'] },
        ];
        fs.writeFileSync(sourcePath, payload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
        });

        expect(readCanonicalChatPayload(db, {
            ownerType: 'group',
            ownerId: 'party',
            sourcePath: 'group chats/party.jsonl',
        })).toEqual(payload);

        manager.dispose();
    });
});
