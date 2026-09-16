import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { getCanonicalChatSession } from '../src/endpoints/canonical-chat-store.js';
import { readCanonicalChatPayload } from '../src/endpoints/canonical-chat-read-service.js';
import {
    createCanonicalChatBackup,
    restoreCanonicalChatBackup,
} from '../src/endpoints/canonical-chat-backup-restore-service.js';
import {
    readCanonicalRecentChatPayload,
    searchCanonicalChatPayload,
} from '../src/endpoints/canonical-chat-query-service.js';
import {
    readRecentChatPayload,
    searchChatPayload,
} from '../src/endpoints/chat-route-service.js';
import { setConfigFilePath } from '../src/util.js';

const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-historical-config-'));
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
const { DataMaidService } = await import('../src/endpoints/data-maid.js');

const tempRoots = [];
const managers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-historical-'));
    tempRoots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
        groups: path.join(root, 'groups'),
        files: path.join(root, 'files'),
        backups: path.join(root, 'backups'),
        avatars: path.join(root, 'User Avatars'),
        backgrounds: path.join(root, 'backgrounds'),
        userImages: path.join(root, 'user images'),
        thumbnailsAvatar: path.join(root, 'thumbnails', 'avatar'),
        thumbnailsBg: path.join(root, 'thumbnails', 'bg'),
        thumbnailsPersona: path.join(root, 'thumbnails', 'persona'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    return directories;
}

function writeFile(filePath, contents = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
}

function createManager() {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    return manager;
}

function openDb(manager, directories) {
    const db = manager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    return db;
}

function createDependencies() {
    return { fs, path, getChatInfo: jest.fn(getChatInfo), warn: jest.fn() };
}

const GROUP_CHAT_CONTENTS = [
    '{"name":"Party","chat_metadata":{"group_id":"party","note":"historical"}}',
    '{"name":"User","is_user":true,"mes":"Ready"}',
    '{"name":"Alice","is_user":false,"mes":"Here"}',
].join('\n');

afterEach(() => {
    for (const manager of managers.splice(0)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
});

describe('data maid historical group chats', () => {
    test('discovers historical group JSONL files and reports only unreferenced ones as loose', async () => {
        const directories = makeDirectories();
        writeFile(path.join(directories.groups, 'party.json'), JSON.stringify({
            id: 'party',
            chats: ['party'],
        }));
        writeFile(path.join(directories.groupChats, 'party.jsonl'), GROUP_CHAT_CONTENTS);
        writeFile(path.join(directories.groupChats, 'orphan.jsonl'), GROUP_CHAT_CONTENTS);
        writeFile(path.join(directories.chats, 'Ada', 'solo.jsonl'), [
            '{"chat_metadata":{"title":"Solo"}}',
            '{"name":"Ada","mes":"hello"}',
        ].join('\n'));

        const service = new DataMaidService('alice', directories);
        const report = await service.generateReport();

        expect(report.groupChats).toEqual([path.join(directories.groupChats, 'orphan.jsonl')]);
        expect(report.groupChats).not.toEqual(expect.arrayContaining([
            path.join(directories.groupChats, 'party.jsonl'),
        ]));
        expect(report.chats).not.toEqual(expect.arrayContaining([
            expect.stringContaining('group chats'),
        ]));

        const sanitized = await service.sanitizeReport(report);
        expect(sanitized.groupChats).toEqual([
            expect.objectContaining({
                name: 'orphan.jsonl',
                hash: expect.any(String),
                size: expect.any(Number),
            }),
        ]);
    });
});

describe('canonical backup restore preserves group sessions', () => {
    test('round-trips an owner_type=group session through backup and restore', async () => {
        const directories = makeDirectories();
        const groupChatPath = path.join(directories.groupChats, 'party.jsonl');
        writeFile(groupChatPath, GROUP_CHAT_CONTENTS);
        const manager = createManager();
        const db = openDb(manager, directories);

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

        const backup = createCanonicalChatBackup({ db, createdAtMs: 1735689601000 });
        expect(backup.sessions).toEqual(expect.arrayContaining([
            expect.objectContaining({ ownerType: 'group', ownerId: 'party' }),
        ]));

        fs.writeFileSync(groupChatPath, '{"chat_metadata":{"title":"Drifted"}}\n{"name":"X","mes":"drift"}\n', 'utf8');

        const restored = await restoreCanonicalChatBackup({
            db,
            backup,
            handle: 'alice',
            directories,
            nowMs: 1735689602000,
        });

        expect(restored).toEqual(expect.objectContaining({ ok: true, status: 'restored' }));
        const restoredSession = getCanonicalChatSession(db, {
            ownerType: 'group',
            ownerId: 'party',
            sourcePath: 'group chats/party.jsonl',
        });
        expect(restoredSession).toEqual(expect.objectContaining({
            id: session.id,
            owner_type: 'group',
        }));
        expect(readCanonicalChatPayload(db, {
            ownerType: 'group',
            ownerId: 'party',
            sourcePath: 'group chats/party.jsonl',
        })).toEqual(GROUP_CHAT_CONTENTS.split('\n').map(line => JSON.parse(line)));
        expect(fs.readFileSync(groupChatPath, 'utf8')).toBe(GROUP_CHAT_CONTENTS);
    });
});

describe('user-facing chat routes never expose canonical group rows', () => {
    test('canonical and file-backed search/recent exclude historical group chats while rows stay queryable', async () => {
        const directories = makeDirectories();
        const dependencies = createDependencies();
        const manager = createManager();

        writeFile(path.join(directories.characters, 'Ada.png'), 'png');
        writeFile(path.join(directories.chats, 'Ada', 'ada.jsonl'), [
            '{"chat_metadata":{"title":"ada"}}',
            '{"name":"Ada","send_date":"2026-01-01T00:00:00.000Z","mes":"ada message"}',
        ].join('\n'));
        writeFile(path.join(directories.groupChats, 'party.jsonl'), GROUP_CHAT_CONTENTS);
        writeFile(path.join(directories.groups, 'party.json'), JSON.stringify({
            id: 'party',
            chats: ['party'],
        }));

        const db = openDb(manager, directories);
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });

        expect(getCanonicalChatSession(db, {
            ownerType: 'group',
            ownerId: 'party',
            sourcePath: 'group chats/party.jsonl',
        })).toEqual(expect.objectContaining({ owner_type: 'group' }));
        expect(db.prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE owner_type = ?').get('group').count).toBe(1);

        const canonicalRecent = await readCanonicalRecentChatPayload({
            db,
            directories,
            max: 50,
            metadata: true,
            dependencies,
        });
        expect(canonicalRecent.length).toBeGreaterThan(0);
        for (const entry of canonicalRecent) {
            expect(entry.payload?.file_name ?? entry.file_name).not.toContain('party');
        }
        expect(JSON.stringify(canonicalRecent)).not.toContain('group chats');

        const canonicalSearch = await searchCanonicalChatPayload({
            db,
            query: 'Ready',
            avatarUrl: 'party',
        });
        expect(canonicalSearch).toEqual([]);

        const fileRecent = await readRecentChatPayload({
            directories,
            max: 50,
            metadata: true,
            dependencies,
        });
        expect(JSON.stringify(fileRecent)).not.toContain('party.jsonl');
        expect(JSON.stringify(fileRecent)).not.toContain('group chats');

        const fileSearch = await searchChatPayload({
            directories,
            query: 'Ready',
            avatarUrl: 'party',
            dependencies,
        });
        expect(fileSearch).toEqual([]);
    });
});
