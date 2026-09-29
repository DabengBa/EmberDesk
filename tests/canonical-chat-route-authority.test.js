import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

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
    '          projection: sync',
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
    // Each case spins up a fresh data root and lazy canonical init (migrations
    // + shadow import + audit), which can exceed the default 5s under load.
    jest.setTimeout(20000);

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

    test('rejects /save when the canonical chats slice is frozen', async () => {
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
        const originalEnabledFlag = process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_ENABLED;
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_ENABLED = 'false';

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
                reason: 'canonical_storage_disabled',
            });
            expect(fs.readFileSync(chatPath, 'utf8')).toBe(initialPayload.map(line => JSON.stringify(line)).join('\n'));
        } finally {
            if (originalEnabledFlag === undefined) {
                delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_ENABLED;
            } else {
                process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_ENABLED = originalEnabledFlag;
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

describe('chats projection off', () => {
    const PROJECTION_ENV = 'EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHATS_PROJECTION';

    function makeDirectories() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-off-'));
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
        return directories;
    }

    async function seedCanonicalChat(directories, payload) {
        fs.mkdirSync(path.join(directories.chats, 'alice'), { recursive: true });
        const chatPath = path.join(directories.chats, 'alice', 'first.jsonl');
        fs.writeFileSync(chatPath, payload.map(line => JSON.stringify(line)).join('\n'), 'utf8');
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
        await auditCanonicalChatShadowImport({ handle: 'alice', directories, db, projection: 'off' });
        return { db, chatPath };
    }

    test('commits /save to canonical rows without writing the JSONL compatibility file', async () => {
        process.env[PROJECTION_ENV] = 'off';
        try {
            const directories = makeDirectories();
            const { db } = await seedCanonicalChat(directories, [
                { chat_metadata: { integrity: 'clean' } },
                { name: 'User', mes: 'Before' },
            ]);

            const nextPayload = [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', mes: 'After' },
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
            expect(db.prepare(`SELECT header_payload_json FROM chat_sessions WHERE owner_id = 'alice'`).get())
                .toEqual({ header_payload_json: JSON.stringify(nextPayload[0]) });
            // Canonical save replaces the stale projection file's authority entirely.
            expect(fs.readFileSync(path.join(directories.chats, 'alice', 'first.jsonl'), 'utf8'))
                .not.toContain('After');
        } finally {
            delete process.env[PROJECTION_ENV];
        }
    });

    test('/save under projection off leaves a brand-new chat entirely fileless', async () => {
        process.env[PROJECTION_ENV] = 'off';
        try {
            const directories = makeDirectories();
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
            await auditCanonicalChatShadowImport({ handle: 'alice', directories, db, projection: 'off' });

            const response = makeResponse();
            await getRouteHandler('/save')({
                body: {
                    avatar_url: 'alice.png',
                    file_name: 'fresh',
                    chat: [
                        { chat_metadata: { integrity: 'clean' } },
                        { name: 'Alice', mes: 'DB only' },
                    ],
                    force: false,
                },
                user: { directories, profile: { handle: 'alice' } },
            }, response);

            expect(response.statusCode).toBe(200);
            expect(db.prepare(`SELECT COUNT(*) AS n FROM chat_sessions WHERE source_path = 'chats/alice/fresh.jsonl'`).get().n).toBe(1);
            expect(fs.existsSync(path.join(directories.chats, 'alice', 'fresh.jsonl'))).toBe(false);
        } finally {
            delete process.env[PROJECTION_ENV];
        }
    });

    test('canonical /rename updates source_path and removes the stale file without writing a new one', async () => {
        process.env[PROJECTION_ENV] = 'off';
        try {
            const directories = makeDirectories();
            const { db } = await seedCanonicalChat(directories, [
                { chat_metadata: { integrity: 'clean' } },
                { name: 'User', mes: 'Before' },
            ]);

            const response = makeResponse();
            await getRouteHandler('/rename')({
                body: {
                    avatar_url: 'alice.png',
                    original_file: 'first.jsonl',
                    renamed_file: 'renamed.jsonl',
                },
                user: { directories, profile: { handle: 'alice' } },
            }, response);

            expect(response.statusCode).toBe(200);
            expect(db.prepare(`SELECT source_path FROM chat_sessions WHERE owner_id = 'alice'`).get())
                .toEqual({ source_path: 'chats/alice/renamed.jsonl' });
            expect(fs.existsSync(path.join(directories.chats, 'alice', 'first.jsonl'))).toBe(false);
            expect(fs.existsSync(path.join(directories.chats, 'alice', 'renamed.jsonl'))).toBe(false);
        } finally {
            delete process.env[PROJECTION_ENV];
        }
    });

    test('canonical /delete removes the session without requiring the JSONL file', async () => {
        process.env[PROJECTION_ENV] = 'off';
        try {
            const directories = makeDirectories();
            const { db } = await seedCanonicalChat(directories, [
                { chat_metadata: { integrity: 'clean' } },
                { name: 'User', mes: 'Before' },
            ]);
            fs.unlinkSync(path.join(directories.chats, 'alice', 'first.jsonl'));

            const response = makeResponse();
            await getRouteHandler('/delete')({
                body: {
                    avatar_url: 'alice.png',
                    chatfile: 'first.jsonl',
                },
                user: { directories, profile: { handle: 'alice' } },
            }, response);

            expect(response.statusCode).toBe(200);
            expect(db.prepare(`SELECT COUNT(*) AS n FROM chat_sessions WHERE owner_id = 'alice'`).get().n).toBe(0);
        } finally {
            delete process.env[PROJECTION_ENV];
        }
    });

    test('audit suppresses stale JSONL drift under projection off but blocks under sync', async () => {
        const directories = makeDirectories();
        const { db, chatPath } = await seedCanonicalChat(directories, [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', mes: 'Before' },
        ]);
        fs.writeFileSync(chatPath, [
            JSON.stringify({ chat_metadata: { integrity: 'stale' } }),
            JSON.stringify({ name: 'User', mes: 'Stale edit' }),
        ].join('\n'), 'utf8');

        const offAudit = await auditCanonicalChatShadowImport({
            handle: 'alice', directories, db, projection: 'off',
        });
        expect(offAudit.blocking).toBe(false);
        expect(offAudit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'drift',
                drift_types: ['payload_drift'],
                details: expect.objectContaining({ suppressed: true }),
            }),
        ]));

        const syncAudit = await auditCanonicalChatShadowImport({
            handle: 'alice', directories, db, projection: 'sync',
        });
        expect(syncAudit.blocking).toBe(true);
    });
});
