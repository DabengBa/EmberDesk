import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.ts';
import * as canonicalReadService from '../src/endpoints/canonical-managed-media-read-service.ts';
import {
    getCanonicalManagedMediaReadState,
    listCanonicalAssetPayload,
    listCanonicalUserImageFiles,
    listCanonicalUserImageFolders,
    readManagedMediaContent,
} from '../src/endpoints/canonical-managed-media-read-service.ts';
import { MEDIA_REQUEST_TYPE } from '../src/constants.js';
import {
    upsertCanonicalManagedMediaReference,
} from '../src/endpoints/canonical-managed-media-store.ts';

const tempRoots = [];
const managers = [];

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-managed-media-read-'));
    tempRoots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        backgrounds: path.join(root, 'backgrounds'),
        assets: path.join(root, 'assets'),
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

function seedMedia(directories, { audit = true } = {}) {
    const manager = createManager();
    const db = manager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    const records = [
        ['assets/bgm/loop.ogg', 'asset', 'asset'],
        ['assets/live2d/model/hero.model3.json', 'asset', 'asset'],
        ['assets/live2d/textures/ignored.json', 'asset', 'asset'],
        ['assets/vrm/model/hero.vrm', 'asset', 'asset'],
        ['assets/vrm/animation/idle.vrma', 'asset', 'asset'],
    ];
    for (const [compatibilityPath, ownerType, role] of records) {
        upsertCanonicalManagedMediaReference(db, {
            compatibilityPath,
            contentHash: `hash-${compatibilityPath}`,
            sizeBytes: 1,
            mediaType: compatibilityPath.endsWith('.gif') ? 'image/gif' : 'application/octet-stream',
            managedRelativePath: `managed-media/${compatibilityPath}`,
            ownerType,
            ownerId: compatibilityPath,
            role,
            displayName: path.posix.basename(compatibilityPath),
            nowMs: 1735689600000,
        });
    }
    if (audit) {
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
    }
    return { manager, db };
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical managed media read service', () => {
    test('reads canonical bytes by path and reference and preserves failure reasons', () => {
        const directories = makeDirectories();
        const { db } = seedMedia(directories);
        const saved = upsertCanonicalManagedMediaReference(db, {
            compatibilityPath: 'user/files/a.txt', contentHash: 'file-hash', sizeBytes: 5,
            mediaType: 'text/plain', managedRelativePath: 'managed/file.txt', ownerType: 'attachment',
        }).reference;
        const file = path.join(directories.storage, 'managed/file.txt');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'hello');
        expect(readManagedMediaContent(db, directories, 'user/files/a.txt').contents.toString()).toBe('hello');
        expect(readManagedMediaContent(db, directories, saved).mediaType).toBe('text/plain');
        expect(readManagedMediaContent(db, directories, { ...saved, deletedAtMs: 1 }).reason).toBe('reference_not_found');
        expect(readManagedMediaContent(db, directories, { ...saved, lifecycleState: 'deleted' }).reason).toBe('blob_not_active');
        expect(readManagedMediaContent(db, directories, { ...saved, managedRelativePath: '../escape' }).reason).toBe('unsafe_managed_path');
        expect(() => readManagedMediaContent(db, directories, { ...saved, managedRelativePath: 'managed' })).toThrow();
        fs.unlinkSync(file);
        expect(readManagedMediaContent(db, directories, saved).reason).toBe('blob_bytes_missing');
        expect(readManagedMediaContent(db, directories, 'user/files/missing').reason).toBe('reference_not_found');
    });

    test('preserves flag, database, migration and rollback blocking', () => {
        const directories = makeDirectories();
        const { manager } = seedMedia(directories);
        const flags = { enabled: true, reads: true, writes: false, strict: false };
        const base = { getFeatureFlags: () => flags, openDatabase: options => manager.open(options) };
        const state = dependencies => getCanonicalManagedMediaReadState({ handle: 'alice', directories, dependencies });
        expect(state({ ...base, getFeatureFlags: () => ({ ...flags, enabled: false }) }).reason).toBe('canonical_storage_disabled');
        expect(state({ ...base, getFeatureFlags: () => ({ ...flags, reads: false }) }).reason).toBe('canonical_reads_disabled');
        expect(state({ ...base, openDatabase: () => null }).reason).toBe('canonical_storage_unavailable');
        expect(state({ ...base, runMigrations: () => ({ ok: false }) }).reason).toBe('migration_blocked');
        expect(state({ ...base, getSlice: () => ({ auditScope: 'managed_media', getRollbackBlockers: () => ({ ok: false, blockers: [{ code: 'repair_pending' }] }) }) }).reason).toBe('repair_pending');
        expect(() => state({ ...base, getFeatureFlags: () => ({ ...flags, strict: true }), runMigrations: () => ({ ok: false }) })).toThrow('Canonical managed media reads blocked: migration_blocked');
    });

    test('filters image folders and types and orders names or source dates', () => {
        const directories = makeDirectories();
        const { db } = seedMedia(directories);
        for (const [name, time] of [['b.png', 1], ['a.jpg', 2], ['c.mp4', 3], ['nested/z.png', 4], ['ignore.xyz', 5]]) {
            upsertCanonicalManagedMediaReference(db, {
                compatibilityPath: `user/images/folder/${name}`, contentHash: `image-${name}`,
                sizeBytes: 1, ownerType: 'image', metadata: { sourceMtimeMs: time },
            });
        }
        expect(listCanonicalUserImageFolders(db)).toEqual(['folder']);
        expect(listCanonicalUserImageFiles(db, 'folder')).toEqual(['a.jpg', 'b.png']);
        expect(listCanonicalUserImageFiles(db, '/folder/', 'date')).toEqual(['b.png', 'a.jpg']);
        expect(listCanonicalUserImageFiles(db, 'folder', 'name', MEDIA_REQUEST_TYPE.VIDEO)).toEqual(['c.mp4']);
    });

    test('keeps the retired background payload out of the read-service API while preserving assets', () => {
        expect(canonicalReadService.listCanonicalBackgroundPayload).toBeUndefined();
    });

    test('uses a clean managed-media audit to rebuild the asset payload', () => {
        const directories = makeDirectories();
        const { manager } = seedMedia(directories);
        const state = getCanonicalManagedMediaReadState({
            handle: 'alice',
            directories,
            dependencies: {
                getFeatureFlags: () => ({ enabled: true, shadowImport: true, reads: true, writes: false, strict: false }),
                openDatabase: options => manager.open(options),
            },
        });

        expect(state).toEqual(expect.objectContaining({ ok: true }));
        expect(listCanonicalAssetPayload(state.db)).toEqual({
            bgm: ['assets/bgm/loop.ogg'],
            live2d: ['/assets/live2d/model/hero.model3.json'],
            vrm: {
                model: ['/assets/vrm/model/hero.vrm'],
                animation: ['/assets/vrm/animation/idle.vrma'],
            },
        });
    });

    test('falls back in non-strict mode when a managed-media audit has not run', () => {
        const directories = makeDirectories();
        const { manager } = seedMedia(directories, { audit: false });

        expect(getCanonicalManagedMediaReadState({
            handle: 'alice',
            directories,
            dependencies: {
                getFeatureFlags: () => ({ enabled: true, shadowImport: true, reads: true, writes: false, strict: false }),
                openDatabase: options => manager.open(options),
            },
        })).toEqual(expect.objectContaining({
            ok: false,
            reason: 'audit_not_run',
        }));
    });

    test('fails closed in strict mode when a managed-media audit blocks reads', () => {
        const directories = makeDirectories();
        const { manager } = seedMedia(directories, { audit: false });

        expect(() => getCanonicalManagedMediaReadState({
            handle: 'alice',
            directories,
            dependencies: {
                getFeatureFlags: () => ({ enabled: true, shadowImport: true, reads: true, writes: false, strict: true }),
                openDatabase: options => manager.open(options),
            },
        })).toThrow('Canonical managed media reads blocked: audit_not_run');
    });
});
