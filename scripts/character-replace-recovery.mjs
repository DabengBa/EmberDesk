#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

import sanitize from 'sanitize-filename';

import { resolveCanonicalDatabasePath } from '../src/canonical-sqlite.js';
import { CANONICAL_SQLITE_MIGRATIONS } from '../src/canonical-sqlite-migrations.js';
import { getReplaceIntent, interruptWorkspaceWriteSessionOffline } from '../src/character-replace-write-coordinator.js';
import { getUserDirectories } from '../src/user-directories.js';
import { isPathUnderParent } from '../src/util.js';

const usage = [
    'Usage: node scripts/character-replace-recovery.mjs preview --data-root <path> --handle <user>',
    '       node scripts/character-replace-recovery.mjs interrupt --data-root <path> --handle <user> --session <id> --confirm-stopped',
    '',
    'Preview is read-only and does not migrate or create a database.',
    'Before interrupting, stop ALL processes and clients that can write this data root,',
    'including old instances and automatic restarts. SQLite cannot verify this condition.',
    'An interrupted operation may already have committed; it will NOT be replayed.',
].join('\n');

function getOptions(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        strict: true,
        options: {
            'data-root': { type: 'string' },
            handle: { type: 'string' },
            session: { type: 'string' },
            'confirm-stopped': { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (values.help) return { help: true };
    if (positionals.length !== 1 || !['preview', 'interrupt'].includes(positionals[0])) {
        throw new Error('Specify preview or interrupt.');
    }
    if (!values['data-root'] || !values.handle) throw new Error('Both --data-root and --handle are required.');
    if (values.handle === '.' || values.handle === '..' || sanitize(values.handle) !== values.handle || path.basename(values.handle) !== values.handle) {
        throw new Error('Invalid user handle.');
    }
    if (positionals[0] === 'interrupt' && (!values.session || !values['confirm-stopped'])) {
        throw new Error('Interrupt requires --session and --confirm-stopped after all writers have stopped.');
    }
    if (positionals[0] === 'preview' && (values.session || values['confirm-stopped'])) {
        throw new Error('Preview does not accept --session or --confirm-stopped.');
    }
    return { command: positionals[0], dataRoot: values['data-root'], handle: values.handle, sessionId: values.session };
}

function existingDatabasePath(options) {
    globalThis.DATA_ROOT = path.resolve(options.dataRoot);
    const directories = getUserDirectories(options.handle);
    const { dbPath } = resolveCanonicalDatabasePath(directories);
    // Resolve symlinks as well as lexical paths: a handle or storage link must
    // not silently point the operator at a different user's data root.
    const realRoot = fs.realpathSync(globalThis.DATA_ROOT);
    const realUserRoot = fs.realpathSync(directories.root);
    const realDatabase = fs.realpathSync(dbPath);
    if (!isPathUnderParent(realRoot, realUserRoot) || !isPathUnderParent(realUserRoot, realDatabase)) {
        throw new Error('User database path escapes the data root.');
    }
    if (!fs.statSync(realDatabase).isFile()) throw new Error('Canonical database is not a regular file.');
    return realDatabase;
}

function requireCurrentMigrationJournal(db) {
    const table = db.prepare('SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = \'schema_migrations\'').get();
    if (!table) throw new Error('Canonical migration journal is missing; this command does not perform migrations.');
    const applied = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
    if (applied.length !== CANONICAL_SQLITE_MIGRATIONS.length || applied.some((item, index) => (
        item.version !== CANONICAL_SQLITE_MIGRATIONS[index].version || item.name !== CANONICAL_SQLITE_MIGRATIONS[index].name
    ))) {
        throw new Error('Canonical migration journal does not match this version; this command does not perform migrations.');
    }
}

function preview(db) {
    const sessions = db.prepare(`
        SELECT session_id, status FROM workspace_write_sessions AS session
        WHERE status = 'open'
           OR EXISTS (SELECT 1 FROM workspace_write_operations AS operation
                      WHERE operation.session_id = session.session_id AND operation.status IN ('running', 'interrupted'))
           OR EXISTS (SELECT 1 FROM character_replace_intents AS intent
                      WHERE intent.session_id = session.session_id AND intent.acknowledged = 0)
        ORDER BY created_at_ms, session_id
    `).all();
    return {
        sessions: sessions.map(session => ({
            sessionId: session.session_id,
            status: session.status,
            writes: db.prepare(`
                SELECT operation_id AS operationId, kind, target, status, outcome
                FROM workspace_write_operations WHERE session_id = ? ORDER BY created_at_ms, operation_id
            `).all(session.session_id),
            intents: db.prepare(`
                SELECT intent_id FROM character_replace_intents WHERE session_id = ? ORDER BY created_at_ms, intent_id
            `).all(session.session_id).map(row => getReplaceIntent(db, { sessionId: session.session_id, intentId: row.intent_id })),
        })),
    };
}

function main() {
    const options = getOptions(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${usage}\n`);
        return;
    }
    const dbPath = existingDatabasePath(options);
    // Do not use the normal manager: it creates paths, changes pragmas and the
    // usual operator command also applies migrations even for its preview.
    const db = new DatabaseSync(dbPath, { readOnly: options.command === 'preview' });
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        requireCurrentMigrationJournal(db);
        const result = options.command === 'preview'
            ? preview(db)
            : interruptWorkspaceWriteSessionOffline(db, { sessionId: options.sessionId });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
        db.close();
    }
}

try {
    main();
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
}
