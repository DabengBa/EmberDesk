import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalChatShadowImport,
    runCanonicalChatShadowImport,
} from '../src/canonical-chat-shadow-import.js';

const roots = [];
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, [
    'backups:',
    '  chat:',
    '    enabled: false',
    '    maxTotalBackups: -1',
    '    throttleInterval: 10000',
    '    checkIntegrity: true',
    'features:',
    '  storage:',
    '    canonicalSqlite:',
    '      enabled: true',
    '      shadowImport: true',
    '      reads: true',
    '      writes: true',
    '      strict: false',
    '      slices:',
    '        chats:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
].join('\n'), 'utf8');
setConfigFilePath(configPath);

const { getChatData, router } = await import('../src/endpoints/chats.js');

function makeResponse() {
    return {
        body: undefined,
        statusCode: 200,
        send(payload) {
            this.body = payload;
            return this;
        },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        sendStatus(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
    };
}

function getRouteHandler(routePath) {
    const layer = router.stack.find(entry => entry.route?.path === routePath);
    if (!layer?.route?.stack?.length) {
        throw new Error(`Missing chats route ${routePath}`);
    }
    return layer.route.stack.at(-1).handle;
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical chat route authority', () => {
    test('keeps getChatData on JSONL even when canonical chat flags are enabled', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
        roots.push(root);
        const chatPath = path.join(root, 'chat.jsonl');
        fs.writeFileSync(chatPath, [
            '{"chat_metadata":{"integrity":"jsonl-owner"}}',
            '{"name":"User","mes":"JSONL is the runtime authority"}',
        ].join('\n'), 'utf8');

        expect(getChatData(chatPath)).toEqual([
            { chat_metadata: { integrity: 'jsonl-owner' } },
            { name: 'User', mes: 'JSONL is the runtime authority' },
        ]);
    });

    test('serves the canonical full payload from /get after a clean audit even when JSONL changes out of band', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
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
        const chatDirectory = path.join(directories.chats, 'alice');
        fs.mkdirSync(chatDirectory, { recursive: true });
        const chatPath = path.join(chatDirectory, 'first.jsonl');
        const canonicalPayload = [
            { chat_metadata: { integrity: 'canonical', custom: { keep: true } } },
            { name: 'User', mes: 'Canonical message', extra: { source: 'database' } },
            { name: 'Alice', mes: 'Canonical reply', swipes: ['Canonical reply', 'Alternate'] },
        ];
        fs.writeFileSync(chatPath, canonicalPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = canonicalSqliteManager.open({
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
        await auditCanonicalChatShadowImport({ handle: 'alice', directories, db });

        fs.writeFileSync(chatPath, [
            '{"chat_metadata":{"integrity":"external"}}',
            '{"name":"User","mes":"Do not serve this file"}',
        ].join('\n'), 'utf8');

        const response = makeResponse();
        await getRouteHandler('/get')({
            body: { avatar_url: 'alice.png', file_name: 'first' },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(canonicalPayload);
    });

    test('serves canonical search and recent results after a clean audit even when JSONL changes out of band', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
        roots.push(root);
        const directories = {
            root,
            storage: path.join(root, 'storage'),
            characters: path.join(root, 'characters'),
            chats: path.join(root, 'chats'),
            groups: path.join(root, 'groups'),
            groupChats: path.join(root, 'group chats'),
        };
        for (const directory of Object.values(directories)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        fs.writeFileSync(path.join(directories.characters, 'alice.png'), 'avatar', 'utf8');
        const chatDirectory = path.join(directories.chats, 'alice');
        fs.mkdirSync(chatDirectory, { recursive: true });
        const chatPath = path.join(chatDirectory, 'first.jsonl');
        const canonicalPayload = [
            { chat_metadata: { integrity: 'canonical' } },
            { name: 'User', send_date: '2026-01-01T00:00:00.000Z', mes: 'Canonical search term' },
        ];
        fs.writeFileSync(chatPath, canonicalPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = canonicalSqliteManager.open({
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
        await auditCanonicalChatShadowImport({ handle: 'alice', directories, db });

        fs.writeFileSync(chatPath, [
            '{"chat_metadata":{"integrity":"external"}}',
            '{"name":"User","mes":"Do not return this JSONL payload"}',
        ].join('\n'), 'utf8');

        const searchResponse = makeResponse();
        await getRouteHandler('/search')({
            body: { avatar_url: 'alice.png', query: 'canonical search' },
            user: { directories, profile: { handle: 'alice' } },
        }, searchResponse);
        expect(searchResponse.body).toEqual([
            expect.objectContaining({
                file_name: 'first',
                preview_message: 'Canonical search term',
                last_mes: '2026-01-01T00:00:00.000Z',
            }),
        ]);

        const recentResponse = makeResponse();
        await getRouteHandler('/recent')({
            body: { max: 10, metadata: true },
            user: { directories, profile: { handle: 'alice' } },
        }, recentResponse);
        expect(recentResponse.body).toEqual([
            expect.objectContaining({
                file_name: 'first.jsonl',
                mes: 'Canonical search term',
                chat_metadata: { integrity: 'canonical' },
                avatar: 'alice.png',
            }),
        ]);
    });

    test('commits /save to canonical rows before projecting the JSONL compatibility file', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
        roots.push(root);
        const directories = {
            root,
            storage: path.join(root, 'storage'),
            chats: path.join(root, 'chats'),
            groupChats: path.join(root, 'group chats'),
            backups: path.join(root, 'backups'),
        };
        for (const directory of Object.values(directories)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        const chatDirectory = path.join(directories.chats, 'alice');
        fs.mkdirSync(chatDirectory, { recursive: true });
        const chatPath = path.join(chatDirectory, 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', mes: 'Before' },
        ];
        fs.writeFileSync(chatPath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = canonicalSqliteManager.open({
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
        await auditCanonicalChatShadowImport({ handle: 'alice', directories, db });

        const nextPayload = [
            { chat_metadata: { integrity: 'clean', updated: true } },
            { name: 'User', mes: 'After' },
            { name: 'Alice', mes: 'Canonical save', swipes: ['Canonical save', 'Retry'] },
        ];
        const response = makeResponse();
        await getRouteHandler('/save')({
            body: {
                avatar_url: 'alice.png',
                file_name: 'first',
                chat: nextPayload,
                force: false,
            },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ ok: true });
        expect(db.prepare(`
            SELECT header_payload_json
            FROM chat_sessions
            WHERE owner_type = 'character' AND owner_id = 'alice'
                AND source_path = 'chats/alice/first.jsonl'
        `).get()).toEqual({
            header_payload_json: JSON.stringify(nextPayload[0]),
        });
        expect(fs.readFileSync(chatPath, 'utf8')).toBe(nextPayload.map(line => JSON.stringify(line)).join('\n'));
    });

    test('rejects /save when canonical writes are enabled without canonical reads', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
        roots.push(root);
        const directories = {
            root,
            storage: path.join(root, 'storage'),
            chats: path.join(root, 'chats'),
            groupChats: path.join(root, 'group chats'),
            backups: path.join(root, 'backups'),
        };
        for (const directory of Object.values(directories)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        const chatDirectory = path.join(directories.chats, 'alice');
        fs.mkdirSync(chatDirectory, { recursive: true });
        const chatPath = path.join(chatDirectory, 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', mes: 'Before' },
        ];
        fs.writeFileSync(chatPath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');
        const originalReadFlag = process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_READS;
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_READS = 'false';

        try {
            const response = makeResponse();
            await getRouteHandler('/save')({
                body: {
                    avatar_url: 'alice.png',
                    file_name: 'first',
                    chat: [
                        { chat_metadata: { integrity: 'clean' } },
                        { name: 'User', mes: 'Must not write the fallback projection' },
                    ],
                    force: false,
                },
                user: { directories, profile: { handle: 'alice' } },
            }, response);

            expect(response.statusCode).toBe(503);
            expect(response.body).toEqual({
                error: 'canonical_chat_write_blocked',
                reason: 'canonical_reads_disabled',
            });
            expect(fs.readFileSync(chatPath, 'utf8')).toBe(initialPayload.map(line => JSON.stringify(line)).join('\n'));
        } finally {
            if (originalReadFlag === undefined) {
                delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_READS;
            } else {
                process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_READS = originalReadFlag;
            }
        }
    });

    test('returns a client error when /save includes an unregistered managed attachment path', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
        roots.push(root);
        const directories = {
            root,
            storage: path.join(root, 'storage'),
            chats: path.join(root, 'chats'),
            groupChats: path.join(root, 'group chats'),
            backups: path.join(root, 'backups'),
        };
        for (const directory of Object.values(directories)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        const chatDirectory = path.join(directories.chats, 'alice');
        fs.mkdirSync(chatDirectory, { recursive: true });
        const chatPath = path.join(chatDirectory, 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', mes: 'Before' },
        ];
        fs.writeFileSync(chatPath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = canonicalSqliteManager.open({
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
        await auditCanonicalChatShadowImport({ handle: 'alice', directories, db });

        const response = makeResponse();
        await getRouteHandler('/save')({
            body: {
                avatar_url: 'alice.png',
                file_name: 'first',
                chat: [
                    { chat_metadata: { integrity: 'clean' } },
                    { name: 'User', mes: 'Attachment', extra: { file: 'files/unregistered.txt' } },
                ],
                force: false,
            },
            user: { directories, profile: { handle: 'alice' } },
        }, response);

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({
            error: 'canonical_chat_write_rejected',
            reason: 'unregistered_attachment',
            path: 'files/unregistered.txt',
        });
        expect(fs.readFileSync(chatPath, 'utf8')).toBe(initialPayload.map(line => JSON.stringify(line)).join('\n'));
    });
});
