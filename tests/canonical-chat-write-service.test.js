import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.js';
import {
    deleteCanonicalChat,
    listOpenCanonicalChatProjectionRepairs,
    renameCanonicalChat,
    writeCanonicalChatPayload,
} from '../src/endpoints/canonical-chat-write-service.js';

const roots = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-write-'));
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

describe('canonical chat write service', () => {
    test('keeps the canonical payload and records a repair when JSONL projection fails', async () => {
        const directories = makeDirectories();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', mes: 'Before' },
        ];
        fs.writeFileSync(sourcePath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

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

        const nextPayload = [
            { chat_metadata: { integrity: 'clean', updated: true } },
            { name: 'User', mes: 'After' },
            { name: 'Alice', mes: 'Committed before projection', swipes: ['Committed before projection', 'Retry'] },
        ];
        const result = writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: nextPayload,
            operation: 'save',
            projectJsonl() {
                throw new Error('disk full');
            },
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })).toEqual(nextPayload);
        expect(fs.readFileSync(sourcePath, 'utf8')).toBe(initialPayload.map(line => JSON.stringify(line)).join('\n'));
        expect(listOpenCanonicalChatProjectionRepairs(db)).toEqual([
            expect.objectContaining({
                repairKey: result.repairKey,
                operation: 'save',
                reason: 'projection_failed',
                sourcePath: 'chats/alice/first.jsonl',
            }),
        ]);

        manager.dispose();
    });

    test('keeps stable session identity across rename and records delete projection repair after canonical deletion', async () => {
        const directories = makeDirectories();
        const sourcePath = path.join(directories.groupChats, 'party.jsonl');
        const payload = [
            { chat_metadata: { group_id: 'party' } },
            { name: 'User', mes: 'Original' },
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
        const before = db.prepare(`
            SELECT id
            FROM chat_sessions
            WHERE owner_type = 'group' AND owner_id = 'party'
        `).get();

        const renamed = renameCanonicalChat({
            db,
            locator: {
                ownerType: 'group',
                ownerId: 'party',
                sourcePath: 'group chats/party.jsonl',
            },
            nextLocator: {
                ownerType: 'group',
                ownerId: 'renamed-party',
                sourcePath: 'group chats/renamed-party.jsonl',
            },
            projectRename() {
                throw new Error('read-only filesystem');
            },
        });

        expect(renamed).toEqual(expect.objectContaining({
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
        }));
        expect(db.prepare(`
            SELECT id, owner_id, source_path
            FROM chat_sessions
            WHERE id = ?
        `).get(before.id)).toEqual({
            id: before.id,
            owner_id: 'renamed-party',
            source_path: 'group chats/renamed-party.jsonl',
        });

        const deleted = deleteCanonicalChat({
            db,
            locator: {
                ownerType: 'group',
                ownerId: 'renamed-party',
                sourcePath: 'group chats/renamed-party.jsonl',
            },
            projectDelete() {
                throw new Error('read-only filesystem');
            },
        });
        expect(deleted).toEqual(expect.objectContaining({
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
        }));
        expect(db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(before.id)).toBeUndefined();
        expect(listOpenCanonicalChatProjectionRepairs(db)).toEqual(expect.arrayContaining([
            expect.objectContaining({ operation: 'rename', sourcePath: 'group chats/renamed-party.jsonl' }),
            expect.objectContaining({ operation: 'delete', sourcePath: 'group chats/renamed-party.jsonl' }),
        ]));

        manager.dispose();
    });
});
