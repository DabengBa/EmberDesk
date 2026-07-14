#!/usr/bin/env node

import path from 'node:path';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { runCanonicalAudit, runCanonicalSliceAudit } from '../src/canonical-sqlite-operator.js';
import { getUserDirectories } from '../src/user-directories.js';

const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });

class UsageError extends Error {}

function printUsage(output = process.stdout) {
    output.write([
        'Usage: node scripts/canonical-sqlite-audit.mjs --data-root <path> --handle <user> [--json] [--strict]',
        '',
        'Runs a read-only canonical SQLite audit.',
        '',
        'Options:',
        '  --scope <scope>      character_metadata_and_chat_stats | world_info | settings | secrets | managed_media | chats',
        '  --slice <key>        characters | world_info | settings | secrets | managed_media | chats (alias for scope)',
        '  --import-chats       Refresh chat shadow rows before auditing the chats slice',
    ].join('\n'));
}

function parseArgs(argv) {
    const options = {
        dataRoot: null,
        handle: null,
        json: false,
        strict: false,
        scope: 'character_metadata_and_chat_stats',
        importChats: false,
        help: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--data-root':
                options.dataRoot = argv[++index] ?? null;
                break;
            case '--handle':
                options.handle = argv[++index] ?? null;
                break;
            case '--json':
                options.json = true;
                break;
            case '--strict':
                options.strict = true;
                break;
            case '--scope':
                options.scope = argv[++index] ?? options.scope;
                break;
            case '--slice': {
                const slice = argv[++index] ?? null;
                if (slice === 'characters') {
                    options.scope = 'character_metadata_and_chat_stats';
                } else if (slice === 'world_info') {
                    options.scope = 'world_info';
                } else if (slice === 'settings') {
                    options.scope = 'settings';
                } else if (slice === 'secrets') {
                    options.scope = 'secrets';
                } else if (slice === 'managed_media') {
                    options.scope = 'managed_media';
                } else if (slice === 'chats') {
                    options.scope = 'chats';
                } else if (slice) {
                    throw new UsageError(`Unknown slice: ${slice}`);
                }
                break;
            }
            case '--import-chats':
                options.importChats = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                throw new UsageError(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function ensureRequired(options) {
    if (!options.dataRoot || !options.handle) {
        throw new UsageError('Both --data-root and --handle are required.');
    }
}

function formatAuditResult(result) {
    const driftCount = result.entries.filter(entry => entry.status === 'drift').length;
    const errorCount = result.entries.filter(entry => entry.status === 'error').length;
    const lines = [
        'Canonical SQLite audit',
        `handle: ${result.handle}`,
        `status: ${result.ok ? 'clean' : 'blocked'}`,
        `entries: ${result.entries.length}`,
        `drift: ${driftCount}`,
        `error: ${errorCount}`,
    ];

    if (result.reason) {
        lines.push(`reason: ${result.reason}`);
    }

    if (result.chatImport) {
        lines.push(`chat import: imported=${result.chatImport.importedCount} updated=${result.chatImport.updatedCount} unchanged=${result.chatImport.unchangedCount} failed=${result.chatImport.failedCount}`);
    }

    for (const entry of result.entries) {
        lines.push(`- ${entry.avatar_filename ?? entry.world_name ?? entry.key ?? 'document'} | ${entry.status} | ${entry.drift_types.join(',') || 'clean'}`);
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    ensureRequired(options);
    globalThis.DATA_ROOT = path.resolve(options.dataRoot);

    const directories = getUserDirectories(options.handle);
    const featureFlags = {
        enabled: true,
        shadowImport: options.importChats,
        strict: options.strict,
    };
    const db = manager.open({
        handle: options.handle,
        directories,
        featureFlags,
    });

    if (!db) {
        throw new Error('Canonical SQLite database is unavailable.');
    }

    runCanonicalMigrations(db, { strict: options.strict });
    if (options.importChats && options.scope !== 'chats') {
        throw new UsageError('--import-chats requires --scope chats or --slice chats.');
    }
    const chatImport = options.importChats
        ? await runCanonicalChatShadowImport({
            handle: options.handle,
            directories,
            db,
            featureFlags,
        })
        : null;
    let result;
    if (options.scope === 'world_info' || options.scope === 'settings' || options.scope === 'secrets' || options.scope === 'managed_media' || options.scope === 'chats') {
        result = await runCanonicalSliceAudit({
            sliceKey: options.scope,
            handle: options.handle,
            directories,
            db,
        });
    } else {
        result = await runCanonicalAudit({
            handle: options.handle,
            directories,
            db,
        });
    }
    if (chatImport) {
        result = { ...result, chatImport };
    }

    process.stdout.write(options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatAuditResult(result));

    if (!result.ok) {
        process.exitCode = 1;
    }
}

try {
    await main();
} catch (error) {
    if (error instanceof UsageError) {
        process.stderr.write(`${error.message}\n`);
        printUsage(process.stderr);
        process.exitCode = 1;
    } else {
        throw error;
    }
} finally {
    manager.dispose();
}
