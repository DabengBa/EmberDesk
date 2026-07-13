#!/usr/bin/env node

import path from 'node:path';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    explainCanonicalRolloutBlockers,
    getCanonicalStorageControlPlaneStatus,
    listCanonicalRepairs,
    listCanonicalWorldInfoRepairs,
    rebuildCanonicalChatStats,
    repairCanonicalProjection,
    repairCanonicalWorldInfoProjection,
    runCanonicalAudit,
    runCanonicalSliceAudit,
    runCanonicalSliceRepair,
    runCanonicalWorldInfoAudit,
} from '../src/canonical-sqlite-operator.js';
import { getUserDirectories } from '../src/user-directories.js';

const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });

function printUsage() {
    process.stdout.write([
        'Usage: node scripts/canonical-sqlite-repair.mjs <command> --data-root <path> --handle <user> [options]',
        '',
        'Commands:',
        '  audit                Run the same read-only audit as canonical-sqlite-audit.mjs',
        '  audit-world-info     Run the canonical World Info audit',
        '  list-repairs         List unresolved projection repairs',
        '  list-world-info-repairs',
        '                       List unresolved World Info projection repairs',
        '  repair-projection    Replay projection for one or more repair keys',
        '  repair-world-info-projection',
        '                       Replay World Info projection for one or more repair keys',
        '  rebuild-chat-stats   Rebuild canonical chat stats from JSONL chat files',
        '  explain-blockers     Summarize rollout / rollback blockers for a phase',
        '  status               Print per-slice control-plane readiness status',
        '',
        'Options:',
        '  --repair-key <key>   Repeatable for repair-projection',
        '  --avatar <avatar>    Repeatable for rebuild-chat-stats',
        '  --phase <phase>      reads | writes | chatStats for explain-blockers/status',
        '  --slice <key>        characters | world_info for status/audit/repair/blockers',
        '  --feature <k=v>      Repeatable feature flag override for explain-blockers/status',
        '  --json               Print JSON output',
        '  --strict             Open the DB in strict mode',
    ].join('\n'));
}

function parseArgs(argv) {
    if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
        return { command: null, help: true };
    }

    const options = {
        command: argv[0],
        dataRoot: null,
        handle: null,
        json: false,
        strict: false,
        help: false,
        repairKeys: [],
        avatars: [],
        phase: 'writes',
        featureFlags: {},
        slice: null,
    };

    for (let index = 1; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--data-root':
                options.dataRoot = argv[++index] ?? null;
                break;
            case '--handle':
                options.handle = argv[++index] ?? null;
                break;
            case '--repair-key':
                options.repairKeys.push(argv[++index] ?? '');
                break;
            case '--avatar':
                options.avatars.push(argv[++index] ?? '');
                break;
            case '--phase':
                options.phase = argv[++index] ?? 'writes';
                break;
            case '--feature': {
                const [key, rawValue] = String(argv[++index] ?? '').split('=');
                if (!key || rawValue === undefined) {
                    throw new Error('Feature overrides must use --feature key=value.');
                }
                options.featureFlags[key] = rawValue === 'true';
                break;
            }
            case '--slice':
                options.slice = argv[++index] ?? null;
                break;
            case '--json':
                options.json = true;
                break;
            case '--strict':
                options.strict = true;
                break;
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

function openContext(options) {
    globalThis.DATA_ROOT = path.resolve(options.dataRoot);
    const directories = getUserDirectories(options.handle);
    const featureFlags = {
        enabled: true,
        shadowImport: true,
        reads: true,
        writes: true,
        chatStats: false,
        strict: options.strict,
        ...options.featureFlags,
    };
    const db = manager.open({
        handle: options.handle,
        directories,
        featureFlags: { enabled: true, strict: options.strict },
    });

    if (!db) {
        throw new Error('Canonical SQLite database is unavailable.');
    }

    runCanonicalMigrations(db, { strict: options.strict });
    return { db, directories, featureFlags };
}

function formatListRepairs(repairs) {
    const lines = [
        'Canonical SQLite repairs',
        `open: ${repairs.length}`,
    ];
    for (const repair of repairs) {
        lines.push(`- ${repair.repairKey} | ${repair.details.operation ?? 'unknown'} | ${repair.avatarFilename} | ${repair.reason}`);
    }
    return `${lines.join('\n')}\n`;
}

function formatListWorldInfoRepairs(repairs) {
    const lines = [
        'Canonical SQLite World Info repairs',
        `open: ${repairs.length}`,
    ];
    for (const repair of repairs) {
        lines.push(`- ${repair.repairKey} | ${repair.details.operation ?? 'unknown'} | ${repair.worldName} | ${repair.reason}`);
    }
    return `${lines.join('\n')}\n`;
}

function formatRepairProjection(result) {
    const repaired = result.results.filter(item => item.status === 'repaired').length;
    const blocked = result.results.filter(item => item.status === 'blocked').length;
    const lines = [
        'Canonical SQLite repair-projection',
        `repaired: ${repaired}`,
        `blocked: ${blocked}`,
    ];
    for (const item of result.results) {
        lines.push(`- ${item.repairKey} | ${item.status} | ${item.operation ?? 'unknown'}${item.blocker ? ` | ${item.blocker}` : ''}`);
    }
    return `${lines.join('\n')}\n`;
}

function formatRebuild(result) {
    const lines = [
        'Canonical SQLite rebuild-chat-stats',
        `rebuilt: ${result.rebuilt.length}`,
    ];
    for (const item of result.rebuilt) {
        lines.push(`- ${item.avatarFilename} | chats=${item.chatCount} | bytes=${item.chatSizeBytes}`);
    }
    return `${lines.join('\n')}\n`;
}

function formatStatus(result) {
    const lines = [
        'Canonical SQLite control-plane status',
        `handle: ${result.handle ?? ''}`,
        `phase: ${result.phase}`,
        `status: ${result.ok ? 'ready' : 'blocked'}`,
    ];
    for (const slice of result.slices) {
        lines.push(`- ${slice.key} | ${slice.ready ? 'ready' : 'blocked'} | repairs=${slice.openRepairCount} | audit=${slice.audit.blocking ? 'blocking' : 'ok'}`);
        for (const blocker of slice.rollback.blockers) {
            lines.push(`  blocker: ${blocker.code}`);
        }
    }
    return `${lines.join('\n')}\n`;
}

function formatBlockers(result) {
    const lines = [
        'Canonical SQLite blockers',
        `phase: ${result.phase}`,
        `status: ${result.ok ? 'clear' : 'blocked'}`,
    ];
    for (const blocker of result.blockers) {
        lines.push(`- ${blocker.code}`);
    }
    return `${lines.join('\n')}\n`;
}

function formatAudit(result) {
    const driftCount = result.entries.filter(entry => entry.status === 'drift').length;
    const errorCount = result.entries.filter(entry => entry.status === 'error').length;
    const lines = [
        'Canonical SQLite audit',
        `status: ${result.ok ? 'clean' : 'blocked'}`,
        `entries: ${result.entries.length}`,
        `drift: ${driftCount}`,
        `error: ${errorCount}`,
    ];
    if (result.reason) {
        lines.push(`reason: ${result.reason}`);
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
    const { db, directories, featureFlags } = openContext(options);
    let result;
    let formatter;

    switch (options.command) {
        case 'audit':
            result = await runCanonicalAudit({ handle: options.handle, directories, db });
            formatter = formatAudit;
            break;
        case 'audit-world-info':
            result = await runCanonicalWorldInfoAudit({ handle: options.handle, directories, db });
            formatter = formatAudit;
            break;
        case 'list-repairs':
            result = listCanonicalRepairs(db);
            formatter = formatListRepairs;
            break;
        case 'list-world-info-repairs':
            result = listCanonicalWorldInfoRepairs(db);
            formatter = formatListWorldInfoRepairs;
            break;
        case 'repair-projection':
            result = await repairCanonicalProjection({
                db,
                directories,
                repairKeys: options.repairKeys.length ? options.repairKeys : null,
            });
            formatter = formatRepairProjection;
            break;
        case 'repair-world-info-projection':
            result = await repairCanonicalWorldInfoProjection({
                db,
                directories,
                repairKeys: options.repairKeys.length ? options.repairKeys : null,
            });
            formatter = formatRepairProjection;
            break;
        case 'rebuild-chat-stats':
            result = rebuildCanonicalChatStats({
                db,
                directories,
                avatars: options.avatars.length ? options.avatars : null,
            });
            formatter = formatRebuild;
            break;
        case 'explain-blockers':
            result = explainCanonicalRolloutBlockers({
                db,
                featureFlags,
                phase: options.phase,
                sliceKey: options.slice,
            });
            formatter = formatBlockers;
            break;
        case 'status':
            result = getCanonicalStorageControlPlaneStatus({
                handle: options.handle,
                directories,
                db,
                featureFlags,
                phase: options.phase,
                sliceKeys: options.slice ? [options.slice] : null,
            });
            formatter = formatStatus;
            break;
        case 'audit-slice':
            result = await runCanonicalSliceAudit({
                sliceKey: options.slice ?? 'characters',
                handle: options.handle,
                directories,
                db,
            });
            formatter = formatAudit;
            break;
        case 'repair-slice':
            result = await runCanonicalSliceRepair({
                sliceKey: options.slice ?? 'characters',
                db,
                directories,
                repairKeys: options.repairKeys.length ? options.repairKeys : null,
            });
            formatter = formatRepairProjection;
            break;
        default:
            throw new Error(`Unknown command: ${options.command}`);
    }

    process.stdout.write(options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatter(result));

    // status is a report command: blocked slice readiness is still a successful query.
    if ((options.command === 'audit' || options.command === 'audit-world-info' || options.command === 'repair-projection' || options.command === 'repair-world-info-projection' || options.command === 'explain-blockers' || options.command === 'audit-slice' || options.command === 'repair-slice') && result.ok === false) {
        process.exitCode = 1;
    }
}

await main().finally(() => {
    manager.dispose();
});
