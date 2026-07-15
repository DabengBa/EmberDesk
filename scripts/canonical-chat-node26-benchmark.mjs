import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalChatShadowImport,
    runCanonicalChatShadowImport,
} from '../src/canonical-chat-shadow-import.js';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.js';
import { searchCanonicalChatPayload, readCanonicalRecentChatPayload } from '../src/endpoints/canonical-chat-query-service.js';
import { writeCanonicalChatPayload } from '../src/endpoints/canonical-chat-write-service.js';
import { createCanonicalChatBackup } from '../src/endpoints/canonical-chat-backup-restore-service.js';

const EXPECTED_NODE_VERSION = 'v26.3.0';
const FIXTURE = Object.freeze({
    characterCount: 12,
    chatsPerCharacter: 3,
    messagesPerChat: 180,
    concurrentReads: 8,
});
const THRESHOLDS_MS = Object.freeze({
    search: 50,
    recent: 35,
    save: 25,
    concurrentReadTotal: 30,
    backup: 20,
});

function parseArgs(argv) {
    const args = { out: null };
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] === '--out' && argv[index + 1]) {
            args.out = argv[index + 1];
            index++;
        }
    }
    return args;
}

function makeDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
        groups: path.join(root, 'groups'),
        backups: path.join(root, 'backups'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    return directories;
}

function buildChatPayload({ characterName, chatIndex, messageCount }) {
    const header = {
        chat_metadata: {
            benchmark: true,
            characterName,
            chatIndex,
        },
    };
    const messages = Array.from({ length: messageCount }, (_, index) => ({
        name: index % 2 === 0 ? 'User' : characterName,
        send_date: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        mes: `${characterName} chat ${chatIndex} message ${index} benchmark token`,
    }));
    return [header, ...messages];
}

function writeFixtureFiles(directories) {
    for (let characterIndex = 0; characterIndex < FIXTURE.characterCount; characterIndex++) {
        const characterName = `bench-${characterIndex}`;
        fs.writeFileSync(path.join(directories.characters, `${characterName}.png`), 'png', 'utf8');
        const chatRoot = path.join(directories.chats, characterName);
        fs.mkdirSync(chatRoot, { recursive: true });
        for (let chatIndex = 0; chatIndex < FIXTURE.chatsPerCharacter; chatIndex++) {
            const payload = buildChatPayload({
                characterName,
                chatIndex,
                messageCount: FIXTURE.messagesPerChat,
            });
            const filePath = path.join(chatRoot, `session-${chatIndex}.jsonl`);
            fs.writeFileSync(filePath, payload.map(line => JSON.stringify(line)).join('\n'), 'utf8');
        }
    }
}

async function timeOperation(fn) {
    const startedAt = performance.now();
    const result = await fn();
    const elapsedMs = Number((performance.now() - startedAt).toFixed(3));
    return { result, elapsedMs };
}

function assertThresholds(metrics) {
    const failures = Object.entries(THRESHOLDS_MS)
        .filter(([key, threshold]) => metrics[key]?.elapsedMs > threshold)
        .map(([key, threshold]) => `${key}=${metrics[key].elapsedMs}ms > ${threshold}ms`);
    if (failures.length > 0) {
        throw new Error(`Canonical chat benchmark exceeded thresholds: ${failures.join(', ')}`);
    }
}

async function main() {
    if (process.version !== EXPECTED_NODE_VERSION) {
        throw new Error(`Expected Node ${EXPECTED_NODE_VERSION} but found ${process.version}`);
    }

    const args = parseArgs(process.argv.slice(2));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-node26-'));
    const directories = makeDirectories(root);
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });

    try {
        writeFixtureFiles(directories);
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
        await auditCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689601000,
        });

        const metrics = {};
        metrics.search = await timeOperation(() => searchCanonicalChatPayload({
            db,
            directories,
            query: 'benchmark token 179',
            avatarUrl: 'bench-0.png',
        }));
        metrics.recent = await timeOperation(() => readCanonicalRecentChatPayload({
            db,
            directories,
            max: 20,
            metadata: true,
        }));
        const savePayload = buildChatPayload({
            characterName: 'bench-0',
            chatIndex: 0,
            messageCount: FIXTURE.messagesPerChat + 1,
        });
        metrics.save = await timeOperation(() => writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'bench-0',
                sourcePath: 'chats/bench-0/session-0.jsonl',
            },
            payload: savePayload,
            projectJsonl(jsonl) {
                fs.writeFileSync(path.join(directories.chats, 'bench-0', 'session-0.jsonl'), jsonl, 'utf8');
            },
            nowMs: 1735689602000,
        }));
        metrics.concurrentReadTotal = await timeOperation(() => Promise.all(
            Array.from({ length: FIXTURE.concurrentReads }, () => Promise.resolve().then(() => readCanonicalChatPayload(db, {
                ownerType: 'character',
                ownerId: 'bench-0',
                sourcePath: 'chats/bench-0/session-0.jsonl',
            }))),
        ));
        delete metrics.concurrentReadTotal.result;
        metrics.backup = await timeOperation(() => createCanonicalChatBackup({
            db,
            createdAtMs: 1735689603000,
        }));

        const summary = {
            nodeVersion: process.version,
            fixture: FIXTURE,
            thresholdsMs: THRESHOLDS_MS,
            search: {
                elapsedMs: metrics.search.elapsedMs,
                resultCount: metrics.search.result.length,
            },
            recent: {
                elapsedMs: metrics.recent.elapsedMs,
                resultCount: metrics.recent.result.length,
            },
            save: {
                elapsedMs: metrics.save.elapsedMs,
                ok: metrics.save.result.ok,
            },
            concurrentReadTotal: {
                elapsedMs: metrics.concurrentReadTotal.elapsedMs,
                readCount: FIXTURE.concurrentReads,
            },
            backup: {
                elapsedMs: metrics.backup.elapsedMs,
                sessionCount: metrics.backup.result.sessions.length,
            },
        };
        assertThresholds({
            search: summary.search,
            recent: summary.recent,
            save: summary.save,
            concurrentReadTotal: summary.concurrentReadTotal,
            backup: summary.backup,
        });

        const output = JSON.stringify(summary, null, 2);
        if (args.out) {
            fs.mkdirSync(path.dirname(args.out), { recursive: true });
            fs.writeFileSync(args.out, `${output}\n`, 'utf8');
        }
        console.log(output);
    } finally {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
}

await main();
