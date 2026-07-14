import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import {
    readCanonicalChatPayload,
    serializeCanonicalChatPayload,
} from '../src/endpoints/canonical-chat-read-service.js';

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
