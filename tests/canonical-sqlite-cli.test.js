import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalShadowImport } from '../src/canonical-sqlite-shadow-import.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { runCanonicalManagedMediaShadowImport } from '../src/canonical-managed-media-shadow-import.js';
import { runCanonicalChatShadowImport } from '../src/canonical-chat-shadow-import.js';
import { recordProjectionRepair } from '../src/endpoints/character-store.js';
import {
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from '../src/endpoints/world-info-store.js';
import {
    recordSecretProjectionRepair,
    writeCanonicalSecret,
} from '../src/endpoints/canonical-secrets-store.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';
import { writeCanonicalChatPayload } from '../src/endpoints/canonical-chat-write-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-cli-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        worlds: path.join(root, 'worlds'),
        backgrounds: path.join(root, 'backgrounds'),
        assets: path.join(root, 'assets'),
        avatars: path.join(root, 'User Avatars'),
        files: path.join(root, 'user', 'files'),
        userImages: path.join(root, 'user', 'images'),
    };
    for (const directory of Object.values(directories)) {
        if (directory !== root) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }
    return directories;
}

function createManager() {
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    managers.push(manager);
    return manager;
}

function writeCharacterFile(directories, avatar, payload) {
    fs.writeFileSync(path.join(directories.characters, avatar), JSON.stringify(payload), 'utf8');
}

function writeChatFile(directories, avatar, fileName, contents) {
    const chatDirectory = path.join(directories.chats, path.parse(avatar).name);
    fs.mkdirSync(chatDirectory, { recursive: true });
    fs.writeFileSync(path.join(chatDirectory, fileName), contents, 'utf8');
}

function createSnapshotBuilder() {
    return (avatar, directories) => buildCharacterFileSnapshotRow({
        avatar,
        directories,
        readCharacterData: async filePath => fs.readFileSync(filePath, 'utf8'),
        getCharaCardV2: jsonObject => jsonObject,
    });
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical sqlite CLI scripts', () => {
    test('print help output for audit and repair scripts', () => {
        const auditHelp = execFileSync('node', ['scripts/canonical-sqlite-audit.mjs', '--help'], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        const repairHelp = execFileSync('node', ['scripts/canonical-sqlite-repair.mjs', '--help'], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(auditHelp).toContain('Usage: node scripts/canonical-sqlite-audit.mjs');
        expect(auditHelp).toContain('--scope <scope>');
        expect(auditHelp).toContain('--import-chats');
        expect(auditHelp).toContain('managed_media');
        expect(repairHelp).toContain('Usage: node scripts/canonical-sqlite-repair.mjs');
        expect(repairHelp).toContain('list-repairs');
        expect(repairHelp).toContain('repair-world-info-projection');
        expect(repairHelp).toContain('repair-managed-media-projection');
        expect(repairHelp).toContain('repair-chat-projection');
        expect(repairHelp).toContain('list-chat-repairs');
        expect(repairHelp).toContain('backup-chat');
        expect(repairHelp).toContain('restore-chat');
        expect(repairHelp).toContain('chat-restore-status');
        expect(repairHelp).toContain('gc-managed-media');
        expect(repairHelp).toContain('status');
        expect(repairHelp).toContain('--slice');
        expect(repairHelp).toContain('--backup-file');
    });

    test('runs a clean managed media audit through the audit CLI', async () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const manager = createManager();
        fs.writeFileSync(path.join(directories.backgrounds, 'sky.png'), 'background', 'utf8');

        const imported = await runCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, reads: false, writes: false, strict: false },
            manager,
            nowMs: 1735689600000,
        });
        expect(imported.ok).toBe(true);
        manager.dispose();

        const output = execFileSync('node', [
            'scripts/canonical-sqlite-audit.mjs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--slice', 'managed_media',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(output)).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            sliceKey: 'managed_media',
        }));
    });

    test('imports chat shadow rows through the opt-in audit CLI command', () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const chatDirectory = path.join(directories.chats, 'alice');
        fs.mkdirSync(chatDirectory, { recursive: true });
        fs.writeFileSync(path.join(chatDirectory, 'first.jsonl'), [
            '{"chat_metadata":{"integrity":"stable"}}',
            '{"name":"User","is_user":true,"mes":"Hello"}',
        ].join('\n'), 'utf8');

        const output = execFileSync('node', [
            'scripts/canonical-sqlite-audit.mjs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--slice', 'chats',
            '--import-chats',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(output)).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            sliceKey: 'chats',
            chatImport: expect.objectContaining({
                ok: true,
                importedCount: 1,
            }),
        }));

        const textOutput = execFileSync('node', [
            'scripts/canonical-sqlite-audit.mjs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--slice', 'chats',
            '--import-chats',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        expect(textOutput).toContain('chat import: imported=0 updated=0 unchanged=1 failed=0');
    });

    test('explains how to recover when chat import is used outside the chats slice', () => {
        const result = spawnSync('node', [
            'scripts/canonical-sqlite-audit.mjs',
            '--data-root', makeRoot(),
            '--handle', 'alice',
            '--import-chats',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('--import-chats requires --scope chats or --slice chats.');
        expect(result.stderr).toContain('Usage: node scripts/canonical-sqlite-audit.mjs');
        expect(result.stderr).not.toContain('at main');
    });

    test('lists repairs and replays projection from the repair CLI', async () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const manager = createManager();
        const buildSnapshotRow = createSnapshotBuilder();

        writeCharacterFile(directories, 'alpha.png', {
            name: 'Alpha',
            chat: 'Alpha - chat',
            fav: false,
            tags: [],
            data: { name: 'Alpha', extensions: { fav: false, world: '' }, tags: [] },
        });

        await runCanonicalShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            manager,
            buildSnapshotRow,
            nowMs: 1735689600000,
        });

        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        fs.rmSync(path.join(directories.characters, 'alpha.png'));
        recordProjectionRepair(db, {
            repairKey: 'repair:create:alpha.png',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: { operation: 'create', sourceImage: 'default-avatar.png' },
            nowMs: 1735689601111,
        });

        const listOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'list-repairs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(listOutput)).toEqual([
            expect.objectContaining({
                repairKey: 'repair:create:alpha.png',
                avatarFilename: 'alpha.png',
            }),
        ]);

        const repairOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'repair-projection',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--repair-key', 'repair:create:alpha.png',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(repairOutput)).toEqual(expect.objectContaining({
            ok: true,
            results: [
                expect.objectContaining({
                    repairKey: 'repair:create:alpha.png',
                    status: 'repaired',
                }),
            ],
        }));
        expect(fs.existsSync(path.join(directories.characters, 'alpha.png'))).toBe(true);
    });

    test('lists and repairs world info projection repairs from the repair CLI', () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        upsertCanonicalWorldInfoBook(db, {
            name: 'Lorebook',
            payload: { name: 'Lorebook', entries: { one: { content: 'cli' } } },
            nowMs: 1735689600000,
        });
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:edit',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689601111,
        });

        const listOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'list-world-info-repairs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(listOutput)).toEqual([
            expect.objectContaining({
                repairKey: 'world_info:Lorebook:edit',
                worldName: 'Lorebook',
            }),
        ]);

        const repairOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'repair-world-info-projection',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--repair-key', 'world_info:Lorebook:edit',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(repairOutput)).toEqual(expect.objectContaining({
            ok: true,
            results: [
                expect.objectContaining({
                    repairKey: 'world_info:Lorebook:edit',
                    status: 'repaired',
                }),
            ],
        }));
        expect(JSON.parse(fs.readFileSync(path.join(directories.worlds, 'Lorebook.json'), 'utf8'))).toEqual({
            name: 'Lorebook',
            entries: { one: { content: 'cli' } },
        });
    });

    test('reports repair_not_found for a missing canonical chat repair key', async () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        writeChatFile(directories, 'alice.png', 'first.jsonl', [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","mes":"Before"}',
        ].join('\n'));
        await runCanonicalChatShadowImport({
            handle: 'alice',
            directories,
            db,
            featureFlags: { enabled: true, shadowImport: true, strict: false },
            nowMs: 1735689600000,
        });
        writeCanonicalChatPayload({
            db,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', mes: 'After' },
            ],
            projectJsonl() {
                throw new Error('projection unavailable');
            },
            nowMs: 1735689601000,
        });
        manager.dispose();

        let unmatchedRepairError;
        try {
            execFileSync('node', [
                'scripts/canonical-sqlite-repair.mjs',
                'repair-chat-projection',
                '--data-root', dataRoot,
                '--handle', 'alice',
                '--repair-key', 'chat:character:alice:missing.jsonl:save',
                '--json',
            ], {
                cwd: repoRoot,
                encoding: 'utf8',
            });
        } catch (error) {
            unmatchedRepairError = error;
        }

        expect(unmatchedRepairError).toEqual(expect.objectContaining({
            status: 1,
        }));
        expect(JSON.parse(unmatchedRepairError.stdout)).toEqual(expect.objectContaining({
            ok: false,
            results: [expect.objectContaining({
                repairKey: 'chat:character:alice:missing.jsonl:save',
                status: 'blocked',
                blocker: 'repair_not_found',
            })],
        }));
    });

    test('creates, restores, and reports a canonical chat backup through the repair CLI', async () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const backupFile = path.join(dataRoot, 'canonical-chat-backup.json');
        const manager = createManager();
        writeChatFile(directories, 'alice.png', 'first.jsonl', [
            '{"chat_metadata":{"integrity":"clean"}}',
            '{"name":"User","mes":"Before"}',
        ].join('\n'));

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
        manager.dispose();

        const backupOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'backup-chat',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--backup-file', backupFile,
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        expect(JSON.parse(backupOutput)).toEqual(expect.objectContaining({
            ok: true,
            backupFile,
            sessionCount: 1,
        }));

        const currentManager = createManager();
        const currentDb = currentManager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        writeCanonicalChatPayload({
            db: currentDb,
            locator: {
                ownerType: 'character',
                ownerId: 'alice',
                sourcePath: 'chats/alice/first.jsonl',
            },
            payload: [
                { chat_metadata: { integrity: 'clean', updated: true } },
                { name: 'User', mes: 'After' },
            ],
            projectJsonl(jsonl) {
                fs.writeFileSync(path.join(directories.chats, 'alice', 'first.jsonl'), jsonl, 'utf8');
            },
            nowMs: 1735689601000,
        });
        currentManager.dispose();

        const restoreOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'restore-chat',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--backup-file', backupFile,
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        expect(JSON.parse(restoreOutput)).toEqual(expect.objectContaining({
            ok: true,
            status: 'restored',
        }));

        const statusOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'chat-restore-status',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        expect(JSON.parse(statusOutput)).toEqual(expect.objectContaining({
            status: 'restored',
        }));
    });

    test('audits, lists, and repairs secrets without serializing secret values', () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const canary = 'canonical-cli-secret-canary-do-not-leak';
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        writeCanonicalSecret(db, {
            key: 'api_key_openai',
            value: canary,
            label: 'CLI canary',
            id: 'cli-secret',
            nowMs: 1735689600000,
        });
        recordSecretProjectionRepair(db, {
            repairKey: 'secrets:api_key_openai:cli-secret:write',
            key: 'api_key_openai',
            recordId: 'cli-secret',
            operation: 'write',
            errorClass: 'Error',
            nowMs: 1735689601111,
        });
        manager.dispose();

        const listOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'list-secret-repairs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(listOutput)).toEqual([
            expect.objectContaining({
                repairKey: 'secrets:api_key_openai:cli-secret:write',
                key: 'api_key_openai',
                operation: 'write',
            }),
        ]);
        expect(listOutput).not.toContain(canary);

        let unmatchedRepairError;
        try {
            execFileSync('node', [
                'scripts/canonical-sqlite-repair.mjs',
                'repair-secret-projection',
                '--data-root', dataRoot,
                '--handle', 'alice',
                '--repair-key', 'secrets:api_key_openai:missing:write',
                '--json',
            ], {
                cwd: repoRoot,
                encoding: 'utf8',
            });
        } catch (error) {
            unmatchedRepairError = error;
        }
        expect(unmatchedRepairError).toEqual(expect.objectContaining({
            status: 1,
        }));
        expect(JSON.parse(unmatchedRepairError.stdout)).toEqual(expect.objectContaining({
            ok: false,
            results: [expect.objectContaining({
                repairKey: 'secrets:api_key_openai:missing:write',
                status: 'blocked',
                blocker: 'repair_not_found',
            })],
        }));
        expect(unmatchedRepairError.stdout).not.toContain(canary);

        const repairOutput = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'repair-secret-projection',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--repair-key', 'secrets:api_key_openai:cli-secret:write',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(repairOutput)).toEqual(expect.objectContaining({
            ok: true,
            results: [
                expect.objectContaining({
                    repairKey: 'secrets:api_key_openai:cli-secret:write',
                    status: 'repaired',
                }),
            ],
        }));
        expect(repairOutput).not.toContain(canary);

        const auditOutput = execFileSync('node', [
            'scripts/canonical-sqlite-audit.mjs',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--slice', 'secrets',
            '--json',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(JSON.parse(auditOutput)).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
            sliceKey: 'secrets',
        }));
        expect(auditOutput).not.toContain(canary);
    });

    test('prints sanitized multi-slice control-plane status from the repair CLI', () => {
        const dataRoot = makeRoot();
        const directories = createDirectories(path.join(dataRoot, 'alice'));
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        recordProjectionRepair(db, {
            repairKey: 'repair:create:alpha.png',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: {
                operation: 'create',
                secret: 'top-secret-value',
            },
            nowMs: 1735689601111,
        });
        manager.dispose();

        const output = execFileSync('node', [
            'scripts/canonical-sqlite-repair.mjs',
            'status',
            '--data-root', dataRoot,
            '--handle', 'alice',
            '--json',
            '--feature', 'enabled=true',
            '--feature', 'shadowImport=true',
            '--feature', 'reads=true',
            '--feature', 'writes=true',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        const parsed = JSON.parse(output);
        expect(parsed.slices.map(slice => slice.key)).toEqual(['characters', 'world_info', 'settings', 'secrets', 'managed_media', 'chats']);
        expect(parsed.slices.find(slice => slice.key === 'characters').openRepairCount).toBe(1);
        expect(output).not.toContain('top-secret-value');
    });

});
