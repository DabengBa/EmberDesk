import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalChatShadowImport,
    CANONICAL_CHAT_AUDIT_SCOPE,
    runCanonicalChatShadowImport,
} from '../src/canonical-chat-shadow-import.js';
import {
    getCanonicalChatSession,
    serializeCanonicalChatSession,
} from '../src/endpoints/canonical-chat-store.js';

const roots = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-'));
    roots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
        files: path.join(root, 'files'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    fs.mkdirSync(path.join(directories.chats, 'alice'), { recursive: true });
    return directories;
}

function writeCharacterChat(directories, filename = 'first.jsonl') {
    const contents = [
        '{"user_name":"User","character_name":"Alice","chat_metadata":{"integrity":"stable","custom_header":{"keep":true}},"unknown_header":"value"}',
        '{"name":"User","is_user":true,"send_date":100,"mes":"Hello","extra":{"unknown_message":{"preserve":[1,2]},"file":"files/notes.txt"}}',
        '{"name":"Alice","is_user":false,"send_date":200,"mes":"Hi","swipes":["Hi","Hello"],"swipe_id":1,"reasoning":"because","unknown_message":true}',
    ].join('\n');
    const filePath = path.join(directories.chats, 'alice', filename);
    fs.writeFileSync(filePath, contents, 'utf8');
    return { contents, filePath };
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical chat foundation', () => {
    test('shadows a character JSONL losslessly and keeps stable identities across repeat import and rename', async () => {
        const directories = makeDirectories();
        const { contents, filePath } = writeCharacterChat(directories);
        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        const first = await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });
        expect(first).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 1,
            unchangedCount: 0,
        }));
        const firstSession = getCanonicalChatSession(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        });
        expect(serializeCanonicalChatSession(db, firstSession.id)).toBe(contents);
        const firstMessageIds = db.prepare(`
            SELECT id
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY message_order ASC
        `).all(firstSession.id).map(row => row.id);

        const second = await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689601000,
        });
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 0,
            unchangedCount: 1,
        }));

        fs.renameSync(filePath, path.join(directories.chats, 'alice', 'renamed.jsonl'));
        const renamed = await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689602000,
        });
        expect(renamed).toEqual(expect.objectContaining({
            ok: true,
            updatedCount: 1,
        }));
        const renamedSession = getCanonicalChatSession(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/renamed.jsonl',
        });
        expect(renamedSession.id).toBe(firstSession.id);
        expect(db.prepare(`
            SELECT id
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY message_order ASC
        `).all(renamedSession.id).map(row => row.id)).toEqual(firstMessageIds);
        expect(serializeCanonicalChatSession(db, renamedSession.id)).toBe(contents);

        manager.dispose();
    });

    test('blocks audit when the JSONL cannot be parsed', async () => {
        const directories = makeDirectories();
        const { filePath } = writeCharacterChat(directories);
        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
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
        fs.writeFileSync(filePath, '{"chat_metadata":\n', 'utf8');

        const audit = await auditCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689603000,
        });
        expect(audit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_drift_blocked',
        }));
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'error',
                drift_types: ['parse_failure'],
            }),
        ]));
        expect(db.prepare(`
            SELECT audit_scope, blocking
            FROM canonical_audit_state
            WHERE audit_scope = ?
        `).get(CANONICAL_CHAT_AUDIT_SCOPE)).toEqual({
            audit_scope: CANONICAL_CHAT_AUDIT_SCOPE,
            blocking: 1,
        });

        manager.dispose();
    });

    test('shadows group JSONL sessions with the same lossless contract', async () => {
        const directories = makeDirectories();
        const contents = [
            '{"name":"Group","chat_metadata":{"group_id":"party","unknown_header":"keep"}}',
            '{"name":"User","is_user":true,"mes":"Ready"}',
            '{"name":"Alice","is_user":false,"mes":"Here","swipes":["Here","Present"]}',
        ].join('\n');
        fs.writeFileSync(path.join(directories.groupChats, 'party.jsonl'), contents, 'utf8');
        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
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

        const session = getCanonicalChatSession(db, {
            ownerType: 'group',
            ownerId: 'party',
            sourcePath: 'group chats/party.jsonl',
        });
        expect(session).toEqual(expect.objectContaining({ owner_type: 'group' }));
        expect(serializeCanonicalChatSession(db, session.id)).toBe(contents);

        manager.dispose();
    });

    test('records managed attachment references without copying media bytes and audits the shadow clean', async () => {
        const directories = makeDirectories();
        const { contents } = writeCharacterChat(directories);
        const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        db.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path,
                lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'blob-notes',
            'content-hash',
            12,
            'text/plain',
            'managed-media/content-hash',
            'active',
            1735689600000,
            1735689600000,
            null,
        );
        db.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name,
                compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'reference-notes',
            'blob-notes',
            'attachment',
            'files/notes.txt',
            'attachment',
            'notes.txt',
            'files/notes.txt',
            '{}',
            1735689600000,
            1735689600000,
            null,
        );

        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        expect(db.prepare(`
            SELECT blob_id, role, compatibility_json
            FROM chat_attachment_refs
        `).all()).toEqual([{
            blob_id: 'blob-notes',
            role: 'attachment',
            compatibility_json: JSON.stringify({
                path: 'files/notes.txt',
                fieldPath: ['extra', 'file'],
            }),
        }]);
        expect(serializeCanonicalChatSession(db, getCanonicalChatSession(db, {
            ownerType: 'character',
            ownerId: 'alice',
            sourcePath: 'chats/alice/first.jsonl',
        }).id)).toBe(contents);
        await expect(auditCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689604000,
        })).resolves.toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            entries: [],
        }));

        manager.dispose();
    });

});
