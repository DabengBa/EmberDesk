import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalChatShadowImport,
    runCanonicalChatShadowImport,
} from '../src/canonical-chat-shadow-import.js';
import { setConfigFilePath } from '../src/util.js';
import {
    readCanonicalRecentChatPayload,
    searchCanonicalChatPayload,
} from '../src/endpoints/canonical-chat-query-service.js';
import {
    readRecentChatPayload,
    searchChatPayload,
} from '../src/endpoints/chat-route-service.js';

const tempRoots = [];
const managers = [];
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-query-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, [
    'backups:',
    '  chat:',
    '    enabled: false',
    '    maxTotalBackups: -1',
    '    throttleInterval: 10000',
    '    checkIntegrity: true',
    'features:',
    '  storage:',
    '    canonicalSqlite:',
    '      enabled: true',
    '      shadowImport: true',
    '      reads: true',
    '      writes: true',
    '      strict: false',
    '      slices:',
    '        chats:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
].join('\n'), 'utf8');
setConfigFilePath(configPath);

const { getChatInfo } = await import('../src/endpoints/chats.js');

function makeDirectories(prefix = 'emberdesk-canonical-chat-query-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
        groups: path.join(root, 'groups'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    tempRoots.push(root);
    return directories;
}

function writeFile(filePath, contents = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
}

function createDependencies(overrides = {}) {
    return {
        fs,
        path,
        getChatInfo: jest.fn(getChatInfo),
        warn: jest.fn(),
        ...overrides,
    };
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
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
});

describe('canonical chat query service', () => {
    test('matches legacy search payloads for character and group chats after JSONL drifts out of band', async () => {
        const directories = makeDirectories();
        const dependencies = createDependencies();
        const manager = createManager();

        writeFile(path.join(directories.chats, 'Ada', 'logic-session.jsonl'), [
            '{"chat_metadata":{"title":"Logic Session"}}',
            '{"name":"Ada","send_date":"2026-01-01T00:00:00.000Z","mes":"hello analytical engine"}',
        ].join('\n'));
        writeFile(path.join(directories.groupChats, 'shared.jsonl'), [
            '{"chat_metadata":{"title":"Shared"}}',
            '{"name":"Group","send_date":"2026-01-02T00:00:00.000Z","mes":"shared group memory"}',
        ].join('\n'));
        writeFile(path.join(directories.groups, 'broken.json'), '{');
        writeFile(path.join(directories.groups, 'target.json'), JSON.stringify({
            id: 'group-1',
            chats: ['shared', 'missing'],
        }));

        const expectedCharacter = await searchChatPayload({
            directories,
            query: 'logic',
            avatarUrl: 'Ada.png',
            dependencies,
        });
        const expectedGroup = await searchChatPayload({
            directories,
            query: 'memory',
            groupId: 'group-1',
            dependencies,
        });

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

        writeFile(path.join(directories.chats, 'Ada', 'logic-session.jsonl'), [
            '{"chat_metadata":{"title":"External"}}',
            '{"name":"Ada","send_date":"2026-02-01T00:00:00.000Z","mes":"do not read this drifted file"}',
        ].join('\n'));
        writeFile(path.join(directories.groupChats, 'shared.jsonl'), [
            '{"chat_metadata":{"title":"External"}}',
            '{"name":"Group","send_date":"2026-02-02T00:00:00.000Z","mes":"do not read this drifted group file"}',
        ].join('\n'));

        await expect(searchCanonicalChatPayload({
            db,
            directories,
            query: 'logic',
            avatarUrl: 'Ada.png',
            dependencies,
        })).resolves.toEqual(expectedCharacter);
        await expect(searchCanonicalChatPayload({
            db,
            directories,
            query: 'memory',
            groupId: 'group-1',
            dependencies,
        })).resolves.toEqual(expectedGroup);
    });

    test('matches legacy recent payloads for canonical character and group chats while preserving root-chat fallback', async () => {
        const directories = makeDirectories();
        const dependencies = createDependencies();
        const manager = createManager();

        writeFile(path.join(directories.characters, 'Ada.png'), 'png');
        writeFile(path.join(directories.chats, 'Ada', 'ada-old.jsonl'), [
            '{"chat_metadata":{"title":"ada-old"}}',
            '{"name":"Ada","send_date":"2026-01-01T00:00:00.000Z","mes":"ada old"}',
        ].join('\n'));
        writeFile(path.join(directories.groupChats, 'group-chat.jsonl'), [
            '{"chat_metadata":{"title":"group-chat"}}',
            '{"name":"Group","send_date":"2026-01-02T00:00:00.000Z","mes":"group recent"}',
        ].join('\n'));
        writeFile(path.join(directories.groups, 'group.json'), JSON.stringify({
            id: 'group-1',
            chats: ['group-chat'],
        }));
        writeFile(path.join(directories.chats, 'root.jsonl'), [
            '{"chat_metadata":{"title":"root"}}',
            '{"name":"Root","send_date":"2026-01-03T00:00:00.000Z","mes":"root recent"}',
        ].join('\n'));

        const oldDate = new Date('2026-01-01T00:00:00Z');
        const middleDate = new Date('2026-01-02T00:00:00Z');
        const newDate = new Date('2026-01-03T00:00:00Z');
        fs.utimesSync(path.join(directories.chats, 'Ada', 'ada-old.jsonl'), oldDate, oldDate);
        fs.utimesSync(path.join(directories.groupChats, 'group-chat.jsonl'), middleDate, middleDate);
        fs.utimesSync(path.join(directories.chats, 'root.jsonl'), newDate, newDate);

        const expected = await readRecentChatPayload({
            directories,
            pinned: [{ file_name: 'ada-old.jsonl', avatar: 'Ada.png' }],
            max: 2,
            metadata: true,
            dependencies,
        });

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

        writeFile(path.join(directories.chats, 'Ada', 'ada-old.jsonl'), [
            '{"chat_metadata":{"title":"external"}}',
            '{"name":"Ada","send_date":"2026-02-01T00:00:00.000Z","mes":"do not use this drifted chat"}',
        ].join('\n'));
        writeFile(path.join(directories.groupChats, 'group-chat.jsonl'), [
            '{"chat_metadata":{"title":"external"}}',
            '{"name":"Group","send_date":"2026-02-02T00:00:00.000Z","mes":"do not use this drifted group chat"}',
        ].join('\n'));

        await expect(readCanonicalRecentChatPayload({
            db,
            directories,
            pinned: [{ file_name: 'ada-old.jsonl', avatar: 'Ada.png' }],
            max: 2,
            metadata: true,
            dependencies,
        })).resolves.toEqual(expected);
    });
});
