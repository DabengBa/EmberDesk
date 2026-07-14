#!/usr/bin/env node

import path from 'node:path';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalAudit, runCanonicalSliceAudit } from '../src/canonical-sqlite-operator.js';
import { getUserDirectories } from '../src/user-directories.js';

const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });

function printUsage() {
    process.stdout.write([
        'Usage: node scripts/canonical-sqlite-audit.mjs --data-root <path> --handle <user> [--json] [--strict]',
        '',
        'Runs a read-only canonical SQLite audit.',
        '',
        'Options:',
        '  --scope <scope>      character_metadata_and_chat_stats | world_info | settings | secrets | managed_media | chats',
        '  --slice <key>        characters | world_info | settings | secrets | managed_media | chats (alias for scope)',
    ].join('\n'));
}

function parseArgs(argv) {
    const options = {
        dataRoot: null,
        handle: null,
        json: false,
        strict: false,
        scope: 'character_metadata_and_chat_stats',
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
                    throw new Error(`Unknown slice: ${slice}`);
                }
                break;
            }
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function ensureRequired(options) {
    if (!options.dataRoot || !options.handle) {
        throw new Error('Both --data-root and --handle are required.');
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

    process.stdout.write(options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatAuditResult(result));

    if (!result.ok) {
        process.exitCode = 1;
    }
}

await main().finally(() => {
    manager.dispose();
});
