import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';
import { resetCanonicalBackendsForTests } from '../src/canonical-backend.js';
import { canonicalSqliteManager, disposeCanonicalDatabases } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalChatShadowImport,
    runCanonicalChatShadowImport,
} from '../src/canonical-chat-shadow-import.js';

const roots = [];
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-chat-memory-persistence-config-'));
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

const { router } = await import('../src/endpoints/chats.js');

/** Chat memory metadata as the client writes it into the chat header. */
function makeChatMemoryMetadata() {
    return {
        disabled: false,
        keepTurns: 3,
        role: 'system',
        prompt: 'Summarize the closed turn.',
        wrap: '[MEMORY]\n{{summary}}\n[/MEMORY]',
        maxTokens: 256,
        summaries: [{
            id: 'summary-1',
            turnKey: 'turn-0',
            turnIndex: 0,
            messageIds: ['msg-user-0', 'msg-char-0'],
            contentHash: 'hash-turn-0',
            status: 'active',
            text: 'They discussed the ferry schedule.',
        }],
        notes: [{ id: 'note-1', text: 'Prefers short replies.' }],
        history: [{
            id: 'history-1',
            action: 'summarize',
            turnKey: 'turn-0',
            status: 'success',
            at: '2024-01-01T00:00:01.000Z',
        }],
    };
}

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

async function createSeededUser() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-chat-memory-persistence-'));
    roots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
        backups: path.join(root, 'backups'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    const chatDirectory = path.join(directories.chats, 'alice');
    fs.mkdirSync(chatDirectory, { recursive: true });
    const chatPath = path.join(chatDirectory, 'memory.jsonl');
    const initialPayload = [
        { chat_metadata: { integrity: 'clean' } },
        { name: 'User', mes: 'Can you check the ferry schedule?', is_user: true, extra: { id: 'msg-user-0' } },
        { name: 'Alice', mes: 'Tomorrow at noon.', extra: { id: 'msg-char-0' } },
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

    return { directories, chatPath };
}

function callRoute(routePath, request) {
    const response = makeResponse();
    return getRouteHandler(routePath)(request, response).then(() => response);
}

afterEach(() => {
    resetCanonicalBackendsForTests();
    disposeCanonicalDatabases();
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// Each case spins up a fresh data root and lazy canonical init (migrations,
// shadow import, audit), which can exceed the default timeout under load.
const CASE_TIMEOUT_MS = 20000;

describe('chat memory persistence', () => {
    test('round-trips chat_metadata.chat_memory through /save and /get', async () => {
        const { directories, chatPath } = await createSeededUser();
        const chatMemory = makeChatMemoryMetadata();
        const payload = [
            { chat_metadata: { integrity: 'clean', chat_memory: chatMemory } },
            { name: 'User', mes: 'Can you check the ferry schedule?', is_user: true, extra: { id: 'msg-user-0' } },
            { name: 'Alice', mes: 'Tomorrow at noon.', extra: { id: 'msg-char-0' } },
        ];

        const saveResponse = await callRoute('/save', {
            body: { avatar_url: 'alice.png', file_name: 'memory', chat: payload, force: false },
            user: { directories, profile: { handle: 'alice' } },
        });
        expect(saveResponse.statusCode).toBe(200);
        expect(saveResponse.body).toEqual({ ok: true });
        expect(JSON.parse(fs.readFileSync(chatPath, 'utf8').split('\n')[0]).chat_metadata.chat_memory)
            .toEqual(chatMemory);

        const getResponse = await callRoute('/get', {
            body: { avatar_url: 'alice.png', file_name: 'memory' },
            user: { directories, profile: { handle: 'alice' } },
        });
        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.body[0].chat_metadata.chat_memory).toEqual(chatMemory);
    }, CASE_TIMEOUT_MS);

    test('reloads chat_metadata.chat_memory from canonical storage after the projection file is gone', async () => {
        const { directories, chatPath } = await createSeededUser();
        const chatMemory = makeChatMemoryMetadata();
        const payload = [
            { chat_metadata: { integrity: 'clean', chat_memory: chatMemory } },
            { name: 'User', mes: 'Can you check the ferry schedule?', is_user: true, extra: { id: 'msg-user-0' } },
            { name: 'Alice', mes: 'Tomorrow at noon.', extra: { id: 'msg-char-0' } },
        ];

        expect((await callRoute('/save', {
            body: { avatar_url: 'alice.png', file_name: 'memory', chat: payload, force: false },
            user: { directories, profile: { handle: 'alice' } },
        })).statusCode).toBe(200);

        fs.rmSync(chatPath, { force: true });
        resetCanonicalBackendsForTests();

        const getResponse = await callRoute('/get', {
            body: { avatar_url: 'alice.png', file_name: 'memory' },
            user: { directories, profile: { handle: 'alice' } },
        });
        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.body[0].chat_metadata.chat_memory).toEqual(chatMemory);
    }, CASE_TIMEOUT_MS);
});
