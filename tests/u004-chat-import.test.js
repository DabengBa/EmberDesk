import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { runCanonicalChatShadowImport, reconcileCanonicalChatSources, auditCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.ts';
import { listCanonicalChatSessions, getCanonicalChatMessagePayloads } from '../src/endpoints/canonical-chat-store.ts';

test('chat JSONL imports once and request reconciliation never overwrites an existing session', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-chat-'));
    const directories = { root, storage: path.join(root, 'storage'), chats: path.join(root, 'chats'), groupChats: path.join(root, 'group chats') };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(path.join(directories.chats, 'Alice'), { recursive: true });
    fs.mkdirSync(directories.groupChats, { recursive: true });
    const file = path.join(directories.chats, 'Alice', 'one.jsonl');
    fs.writeFileSync(file, '{"user_name":"user"}\n{"name":"Alice","mes":"original"}\n');
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    try {
        const featureFlags = { enabled: true, shadowImport: true, strict: false };
        const options = { handle: 'tester', directories, manager, featureFlags };
        expect((await runCanonicalChatShadowImport(options)).importedCount).toBe(1);
        expect((await runCanonicalChatShadowImport(options)).unchangedCount).toBe(1);
        const db = manager.open({ handle: 'tester', directories, featureFlags });
        const session = listCanonicalChatSessions(db)[0];
        fs.writeFileSync(file, '{"user_name":"user"}\n{"name":"Alice","mes":"stale"}\n');
        expect(reconcileCanonicalChatSources({ db, directories, ownerType: 'character', ownerId: 'Alice' }).imported).toBe(0);
        expect(getCanonicalChatMessagePayloads(db, session.id)[0].payloadJson).toContain('original');
        expect((await auditCanonicalChatShadowImport({ handle: 'tester', directories, db })).blocking).toBe(true);
    } finally {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
