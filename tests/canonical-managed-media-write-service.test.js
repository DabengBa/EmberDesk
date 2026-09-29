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
    writeCanonicalManagedMedia,
} from '../src/endpoints/canonical-managed-media-write-service.js';
import {
    listCanonicalManagedMediaReferences,
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

function dependencies(manager, { projection = 'sync' } = {}) {
    return {
        getFeatureFlags: () => ({
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            strict: false,
        }),
        getProjectionMode: () => projection,
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
    test('commits a staged asset blob before projection and records a replayable repair when projection fails', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);

        const result = await writeCanonicalManagedMedia({
            handle: 'alice',
            directories,
            compatibilityPath: 'assets/sky.png',
            ownerType: 'asset',
            ownerId: 'assets/sky.png',
            role: 'asset',
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
            compatibilityPath: 'assets/sky.png',
            contentHash: expect.any(String),
        }));
        expect(fs.readFileSync(path.join(directories.storage, reference.managedRelativePath), 'utf8')).toBe('sky-content');
        expect(fs.existsSync(path.join(directories.assets, 'sky.png'))).toBe(false);

        const repair = await repairCanonicalManagedMediaProjection({
            db,
            directories,
            repairKeys: [result.repairKey],
            nowMs: 1735689600200,
        });

        expect(repair).toEqual(expect.objectContaining({ ok: true }));
        expect(fs.readFileSync(path.join(directories.assets, 'sky.png'), 'utf8')).toBe('sky-content');
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
            operation: 'filesystem_write',
            dependencies: {
                getFeatureFlags: () => ({ enabled: false }),
                openDatabase,
            },
        })).toBe(false);
        expect(openDatabase).not.toHaveBeenCalled();
    });

    test('projection off commits the blob without materializing the compatibility file', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);
        const offDependencies = dependencies(manager, { projection: 'off' });

        const result = await writeCanonicalManagedMedia({
            handle: 'alice',
            directories,
            compatibilityPath: 'user/files/notes.txt',
            ownerType: 'attachment',
            ownerId: 'user/files/notes.txt',
            role: 'attachment',
            displayName: 'notes.txt',
            contents: Buffer.from('hello-blob'),
            dependencies: offDependencies,
            nowMs: 1735689600100,
        });

        expect(result).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        expect(fs.existsSync(path.join(directories.files, 'notes.txt'))).toBe(false);

        const { readManagedMediaContent } = await import('../src/endpoints/canonical-managed-media-read-service.js');
        const served = readManagedMediaContent(db, directories, 'user/files/notes.txt');
        expect(served.ok).toBe(true);
        expect(served.contents.toString()).toBe('hello-blob');
    });

    test('projection off suppresses file-side drift but keeps unsafe_path blocking', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);
        const offDependencies = dependencies(manager, { projection: 'off' });

        const result = await writeCanonicalManagedMedia({
            handle: 'alice',
            directories,
            compatibilityPath: 'assets/sky.png',
            ownerType: 'asset',
            ownerId: 'assets/sky.png',
            role: 'asset',
            displayName: 'sky.png',
            contents: Buffer.from('sky-content'),
            dependencies: offDependencies,
            nowMs: 1735689600100,
        });
        expect(result.ok).toBe(true);
        // Out-of-band leftover file with no reference → orphan under sync.
        fs.writeFileSync(path.join(directories.files, 'loose.bin'), 'loose-bytes');

        const { auditCanonicalManagedMediaShadowImport } = await import('../src/canonical-managed-media-shadow-import.js');
        const offAudit = await auditCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600200,
            projection: 'off',
        });
        expect(offAudit.blocking).toBe(false);
        expect(offAudit.ok).toBe(true);
        const suppressed = offAudit.entries.filter(entry => entry.details?.suppressed);
        expect(suppressed.map(entry => entry.drift_types[0]).sort()).toEqual(['missing', 'orphan']);

        const syncAudit = await auditCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600300,
            projection: 'sync',
        });
        expect(syncAudit.blocking).toBe(true);

        // unsafe_path is a canonical-row integrity issue, not file drift.
        db.prepare(`
            UPDATE media_references
            SET compatibility_path = '../escape.bin'
            WHERE compatibility_path = 'assets/sky.png'
        `).run();
        const unsafeAudit = await auditCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600400,
            projection: 'off',
        });
        expect(unsafeAudit.blocking).toBe(true);
        expect(unsafeAudit.entries.some(entry => entry.drift_types.includes('unsafe_path') && !entry.details?.suppressed)).toBe(true);
    });

    test('projection off rename clears the stale file without writing the new one', async () => {
        const directories = makeDirectories();
        const manager = createManager();
        const db = seedCleanAudit(manager, directories);
        const offDependencies = dependencies(manager, { projection: 'off' });
        const options = { handle: 'alice', directories, dependencies: offDependencies, nowMs: 1735689600100 };

        await writeCanonicalManagedMedia({
            ...options,
            compatibilityPath: 'assets/old.png',
            ownerType: 'asset',
            ownerId: 'assets/old.png',
            role: 'asset',
            displayName: 'old.png',
            contents: Buffer.from('image-bytes'),
        });
        // Pre-existing stale projection at the old path must be removed.
        fs.writeFileSync(path.join(directories.assets, 'old.png'), 'stale-bytes');

        const { renameCanonicalManagedMediaReference } = await import('../src/endpoints/canonical-managed-media-write-service.js');
        const renamed = await renameCanonicalManagedMediaReference({
            ...options,
            oldCompatibilityPath: 'assets/old.png',
            newCompatibilityPath: 'assets/new.png',
        });
        expect(renamed).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        expect(fs.existsSync(path.join(directories.assets, 'old.png'))).toBe(false);
        expect(fs.existsSync(path.join(directories.assets, 'new.png'))).toBe(false);
        expect(db.prepare('SELECT compatibility_path FROM media_references WHERE deleted_at_ms IS NULL').all())
            .toEqual([{ compatibility_path: 'assets/new.png' }]);
    });

});
