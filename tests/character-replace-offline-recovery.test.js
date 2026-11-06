import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    claimReplaceIntent,
    claimWorkspaceWrite,
    createReplaceIntent,
    createWorkspaceWriteSession,
    markReplaceIntentReady,
    registerIntentWrites,
} from '../src/character-replace-write-coordinator.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'scripts', 'character-replace-recovery.mjs');
let root;
let databasePath;
let sessionId;

function run(...args) {
    return spawnSync(process.execPath, [cli, ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
}

function invoke(command, ...extra) {
    return run(command, '--data-root', root, '--handle', 'alice', ...extra);
}

function inspectRows() {
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
        return {
            session: db.prepare('SELECT status FROM workspace_write_sessions WHERE session_id = ?').get(sessionId).status,
            writes: db.prepare('SELECT operation_id, status, outcome FROM workspace_write_operations ORDER BY operation_id').all(),
            intents: db.prepare('SELECT intent_id, status, outcome FROM character_replace_intents ORDER BY intent_id').all(),
            marker: db.prepare('SELECT value FROM recovery_test_data').get().value,
            migrations: db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count,
        };
    } finally {
        db.close();
    }
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-replace-offline-'));
    const storage = path.join(root, 'alice', 'storage');
    fs.mkdirSync(storage, { recursive: true });
    databasePath = path.join(storage, 'emberdesk.sqlite');
    const db = new DatabaseSync(databasePath);
    try {
        db.exec('PRAGMA foreign_keys = ON');
        runCanonicalMigrations(db, { strict: true });
        db.exec('CREATE TABLE recovery_test_data (value TEXT); INSERT INTO recovery_test_data VALUES (\'canonical contents\');');
        sessionId = createWorkspaceWriteSession(db).sessionId;
        const target = { avatar: 'alice.png', chat: 'chat-a', world: 'book-a', card: true, chatSelected: true, worldSelected: true };
        createReplaceIntent(db, { sessionId, intentId: 'in-flight', target });
        markReplaceIntentReady(db, { sessionId, intentId: 'in-flight' });
        claimReplaceIntent(db, { sessionId, intentId: 'in-flight' });
        createReplaceIntent(db, { sessionId, intentId: 'preparing', target });
        registerIntentWrites(db, { sessionId, intentId: 'preparing', operationIds: ['never-arrived'] });
        createReplaceIntent(db, { sessionId, intentId: 'ready', target });
        markReplaceIntentReady(db, { sessionId, intentId: 'ready' });
        claimWorkspaceWrite(db, { sessionId, operationId: 'saving', kind: 'chat', target: 'chat-a' });
    } finally {
        db.close();
    }
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('offline character replacement recovery', () => {
    test('preview lists durable sessions, operations and targets without changing the database', () => {
        const before = inspectRows();
        const result = invoke('preview');
        expect(result.status).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.sessions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                sessionId,
                status: 'open',
                writes: expect.arrayContaining([expect.objectContaining({ operationId: 'saving', status: 'running' })]),
                intents: expect.arrayContaining([
                    expect.objectContaining({ intentId: 'in-flight', status: 'running', target: expect.objectContaining({ avatar: 'alice.png' }) }),
                ]),
            }),
        ]));
        expect(inspectRows()).toEqual(before);
    });

    test('interruption requires explicit confirmation and never modifies canonical contents', () => {
        const before = inspectRows();
        const refused = invoke('interrupt', '--session', sessionId);
        expect(refused.status).not.toBe(0);
        expect(refused.stderr).toMatch(/confirm-stopped/);
        expect(inspectRows()).toEqual(before);

        const result = invoke('interrupt', '--session', sessionId, '--confirm-stopped');
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({ sessionId, status: 'closed' });
        const after = inspectRows();
        expect(after.session).toBe('closed');
        expect(after.writes).toEqual(expect.arrayContaining([
            expect.objectContaining({ operation_id: 'saving', status: 'interrupted', outcome: 'unknown' }),
            expect.objectContaining({ operation_id: 'never-arrived', status: 'cancelled' }),
        ]));
        expect(after.intents).toEqual(expect.arrayContaining([
            expect.objectContaining({ intent_id: 'in-flight', status: 'interrupted', outcome: 'unknown_partial' }),
            expect.objectContaining({ intent_id: 'preparing', status: 'interrupted', outcome: 'unknown_partial' }),
            expect.objectContaining({ intent_id: 'ready', status: 'cancelled' }),
        ]));
        expect(after.marker).toBe(before.marker);
        expect(after.migrations).toBe(before.migrations);
    });

    test('rejects traversal and missing databases without creating directories or databases', () => {
        const traversal = run('preview', '--data-root', root, '--handle', '../escape');
        expect(traversal.status).not.toBe(0);
        expect(traversal.stderr).toMatch(/handle/i);
        const missing = run('preview', '--data-root', root, '--handle', 'missing');
        expect(missing.status).not.toBe(0);
        expect(fs.existsSync(path.join(root, 'missing'))).toBe(false);
    });

    test('refuses databases without the expected migration without upgrading them', () => {
        const otherStorage = path.join(root, 'bob', 'storage');
        fs.mkdirSync(otherStorage, { recursive: true });
        const db = new DatabaseSync(path.join(otherStorage, 'emberdesk.sqlite'));
        db.exec('CREATE TABLE untouched (value TEXT)');
        db.close();
        const result = run('preview', '--data-root', root, '--handle', 'bob');
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/migration/i);
        const readOnly = new DatabaseSync(path.join(otherStorage, 'emberdesk.sqlite'), { readOnly: true });
        try {
            expect(readOnly.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name').all().map(row => row.name)).toEqual(['untouched']);
        } finally {
            readOnly.close();
        }
    });
});
