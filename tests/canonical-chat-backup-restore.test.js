import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.js';
import {
    createCanonicalChatBackup,
    getCanonicalChatRestoreStatus,
    restoreCanonicalChatBackup,
} from '../src/endpoints/canonical-chat-backup-restore-service.js';
import { writeCanonicalChatPayload } from '../src/endpoints/canonical-chat-write-service.js';

const roots = [];
const managers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-backup-'));
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

function createManager() {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    return manager;
}

afterEach(() => {
    for (const manager of managers.splice(0)) {
        manager.dispose();
    }
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical chat backup and restore service', () => {
    test('restores a validated backup bundle and records a completed restore journal entry', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', send_date: '2026-01-01T00:00:00.000Z', mes: 'Before' },
        ];
        fs.writeFileSync(sourcePath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const backup = createCanonicalChatBackup({
            db,
            createdAtMs: 1735689601000,
        });

        writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'After' },
            ],
            projectJsonl(jsonl) {
                fs.writeFileSync(sourcePath, jsonl, 'utf8');
            },
            nowMs: 1735689602000,
        });

        const restored = restoreCanonicalChatBackup({
            db,
            backup,
            nowMs: 1735689603000,
        });

        expect(restored).toEqual(expect.objectContaining({
            ok: true,
            status: 'restored',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })).toEqual(initialPayload);
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({
            status: 'restored',
            reasonCode: null,
        }));
    });

    test('blocks restore when the managed attachment manifest can no longer be satisfied and keeps current authority intact', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const sourcePath = path.join(directories.chats, 'alice', 'first.jsonl');
        const initialPayload = [
            { chat_metadata: { integrity: 'clean' } },
            { name: 'User', send_date: '2026-01-01T00:00:00.000Z', mes: 'Attachment', extra: { file: 'files/notes.txt' } },
        ];
        fs.writeFileSync(sourcePath, initialPayload.map(line => JSON.stringify(line)).join('\n'), 'utf8');

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path, lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('blob-notes', 'hash', 4, 'text/plain', 'managed-media/hash', 'active', 1735689600000, 1735689600000);
        db.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name, compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('ref-notes', 'blob-notes', 'attachment', 'files/notes.txt', 'attachment', 'notes.txt', 'files/notes.txt', '{}', 1735689600000, 1735689600000);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        const backup = createCanonicalChatBackup({
            db,
            createdAtMs: 1735689601000,
        });
        db.prepare('DELETE FROM media_references WHERE id = ?').run('ref-notes');
        writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'Current authority' },
            ],
            projectJsonl(jsonl) {
                fs.writeFileSync(sourcePath, jsonl, 'utf8');
            },
            nowMs: 1735689602000,
        });

        const restored = restoreCanonicalChatBackup({
            db,
            backup,
            nowMs: 1735689603000,
        });

        expect(restored).toEqual(expect.objectContaining({
            ok: false,
            status: 'blocked',
            reasonCode: 'missing_attachment_reference',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        })).toEqual([
            { chat_metadata: { integrity: 'clean', updated: true } },
            { name: 'User', send_date: '2026-02-01T00:00:00.000Z', mes: 'Current authority' },
        ]);
        expect(getCanonicalChatRestoreStatus(db)).toEqual(expect.objectContaining({
            status: 'blocked',
            reasonCode: 'missing_attachment_reference',
        }));
    });
});
