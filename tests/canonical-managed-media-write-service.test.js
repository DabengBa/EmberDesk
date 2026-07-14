import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import {
    collectCanonicalManagedMediaGarbage,
    deleteCanonicalManagedMediaReference,
    invalidateCanonicalManagedMediaAudit,
    repairCanonicalManagedMediaProjection,
    writeCanonicalManagedMediaFolderState,
    writeCanonicalManagedMedia,
} from '../src/endpoints/canonical-managed-media-write-service.js';
import {
    getCanonicalManagedMediaFolderState,
    listCanonicalManagedMediaReferences,
    upsertCanonicalManagedMediaReference,
} from '../src/endpoints/canonical-managed-media-store.js';

const tempRoots = [];
const managers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-managed-media-write-'));
    tempRoots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
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
    const manager = createCanonicalSqliteManager({ logger: { info: jest.fn(), warn: jest.fn() } });
    managers.push(manager);
    return manager;
}

function seedCleanAudit(manager, directories) {
    const db = manager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    persistCanonicalAuditStatus(db, {
        ok: true,
        handle: 'alice',
        hasDrift: false,
        blocking: false,
        entries: [],
    }, {
        scope: 'managed_media',
        auditedAtMs: 1735689600001,
    });
    return db;
}

function dependencies(manager) {
    return {
        getFeatureFlags: () => ({
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            strict: false,
        }),
        openDatabase: options => manager.open(options),
    };
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical managed media write service', () => {
    test('commits a staged blob before projection and records a replayable repair when projection fails', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);

        const result = await writeCanonicalManagedMedia({
            handle: 'alice',
            directories,
            compatibilityPath: 'backgrounds/sky.png',
            ownerType: 'background',
            ownerId: 'backgrounds/sky.png',
            role: 'background',
            displayName: 'sky.png',
            contents: Buffer.from('sky-content'),
            dependencies: dependencies(manager),
            projectCompatibility: () => {
                throw new Error('projection disk full');
            },
            nowMs: 1735689600100,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey: expect.stringContaining('managed_media:project:'),
        }));
        const [reference] = listCanonicalManagedMediaReferences(db);
        expect(reference).toEqual(expect.objectContaining({
            compatibilityPath: 'backgrounds/sky.png',
            contentHash: expect.any(String),
        }));
        expect(fs.readFileSync(path.join(directories.storage, reference.managedRelativePath), 'utf8')).toBe('sky-content');
        expect(fs.existsSync(path.join(directories.backgrounds, 'sky.png'))).toBe(false);

        const repair = await repairCanonicalManagedMediaProjection({
            db,
            directories,
            repairKeys: [result.repairKey],
            nowMs: 1735689600200,
        });

        expect(repair).toEqual(expect.objectContaining({ ok: true }));
        expect(fs.readFileSync(path.join(directories.backgrounds, 'sky.png'), 'utf8')).toBe('sky-content');
    });

    test('tombstones only the final reference and leaves managed-file removal to audited GC dry runs', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);
        const options = { handle: 'alice', directories, dependencies: dependencies(manager), nowMs: 1735689600100 };
        const first = await writeCanonicalManagedMedia({
            ...options,
            compatibilityPath: 'user/files/first.txt',
            ownerType: 'attachment',
            ownerId: 'first',
            role: 'attachment',
            displayName: 'first.txt',
            contents: Buffer.from('shared-content'),
        });
        const second = await writeCanonicalManagedMedia({
            ...options,
            compatibilityPath: 'user/files/second.txt',
            ownerType: 'attachment',
            ownerId: 'second',
            role: 'attachment',
            displayName: 'second.txt',
            contents: Buffer.from('shared-content'),
        });
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);

        const firstDelete = await deleteCanonicalManagedMediaReference({
            ...options,
            compatibilityPath: 'user/files/first.txt',
        });
        expect(firstDelete).toEqual(expect.objectContaining({ ok: true, blobTombstoned: false }));

        const secondDelete = await deleteCanonicalManagedMediaReference({
            ...options,
            compatibilityPath: 'user/files/second.txt',
        });
        expect(secondDelete).toEqual(expect.objectContaining({ ok: true, blobTombstoned: true }));
        const managedPath = path.join(directories.storage, secondDelete.managedRelativePath);
        expect(fs.existsSync(managedPath)).toBe(true);

        const dryRun = await collectCanonicalManagedMediaGarbage({
            ...options,
            db,
        });
        expect(dryRun).toEqual(expect.objectContaining({ ok: true, dryRun: true, deletedCount: 0, candidateCount: 1 }));
        expect(fs.existsSync(managedPath)).toBe(true);

        const collected = await collectCanonicalManagedMediaGarbage({
            ...options,
            db,
            dryRun: false,
        });
        expect(collected).toEqual(expect.objectContaining({ ok: true, dryRun: false, deletedCount: 1 }));
        expect(fs.existsSync(managedPath)).toBe(false);
    });

    test('does not create a canonical database to invalidate an audit when the managed-media slice is disabled', () => {
        const directories = makeDirectories();
        const openDatabase = jest.fn();

        expect(invalidateCanonicalManagedMediaAudit({
            handle: 'alice',
            directories,
            reason: 'filesystem_write',
            dependencies: {
                getFeatureFlags: () => ({ enabled: false }),
                openDatabase,
            },
        })).toBe(false);
        expect(openDatabase).not.toHaveBeenCalled();
    });

    test('commits canonical folder membership before projection and replays an interrupted metadata projection', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);
        upsertCanonicalManagedMediaReference(db, {
            compatibilityPath: 'backgrounds/sky.png',
            contentHash: 'folder-sky-hash',
            sizeBytes: 1,
            mediaType: 'image/png',
            managedRelativePath: 'managed-media/folder-sky-hash',
            ownerType: 'background',
            ownerId: 'backgrounds/sky.png',
            role: 'background',
            displayName: 'sky.png',
            nowMs: 1735689600100,
        });

        const folderState = {
            folders: [{ id: 'sky', name: 'Sky', thumbnailFile: 'sky.png' }],
            imageFolderMap: { 'sky.png': ['sky'] },
        };
        const result = await writeCanonicalManagedMediaFolderState({
            handle: 'alice',
            directories,
            folderState,
            dependencies: dependencies(manager),
            projectFolderState: () => {
                throw new Error('metadata projection disk full');
            },
            nowMs: 1735689600200,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            authorityCommitted: true,
            reason: 'projection_failed',
            repairKey: expect.stringContaining('managed_media:folder_projection:'),
        }));
        expect(getCanonicalManagedMediaFolderState(db)).toEqual(folderState);

        const repair = await repairCanonicalManagedMediaProjection({
            db,
            directories,
            repairKeys: [result.repairKey],
            nowMs: 1735689600300,
        });
        expect(repair).toEqual(expect.objectContaining({ ok: true }));
        expect(JSON.parse(fs.readFileSync(path.join(directories.root, 'image-metadata.json'), 'utf8'))).toEqual(expect.objectContaining({
            folders: folderState.folders,
            images: expect.objectContaining({
                'backgrounds/sky.png': expect.objectContaining({ folderIds: ['sky'] }),
            }),
        }));
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: 'managed_media',
            auditedAtMs: 1735689600350,
        });

        const deletion = await writeCanonicalManagedMediaFolderState({
            handle: 'alice',
            directories,
            folderState: { folders: [], imageFolderMap: {} },
            dependencies: dependencies(manager),
            nowMs: 1735689600400,
        });
        expect(deletion).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        expect(getCanonicalManagedMediaFolderState(db)).toEqual({ folders: [], imageFolderMap: {} });
    });
});
