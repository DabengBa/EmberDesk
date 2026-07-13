import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalShadowImport } from '../src/canonical-sqlite-shadow-import.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { recordProjectionRepair } from '../src/endpoints/character-store.js';
import {
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from '../src/endpoints/world-info-store.js';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.js';

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
        expect(repairHelp).toContain('Usage: node scripts/canonical-sqlite-repair.mjs');
        expect(repairHelp).toContain('list-repairs');
        expect(repairHelp).toContain('repair-world-info-projection');
        expect(repairHelp).toContain('status');
        expect(repairHelp).toContain('--slice');
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
        expect(parsed.slices.map(slice => slice.key)).toEqual(['characters', 'world_info']);
        expect(parsed.slices.find(slice => slice.key === 'characters').openRepairCount).toBe(1);
        expect(output).not.toContain('top-secret-value');
    });

});
