import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import {
    getCanonicalManagedMediaReadState,
    listCanonicalAssetPayload,
    listCanonicalBackgroundPayload,
} from '../src/endpoints/canonical-managed-media-read-service.js';
import {
    replaceCanonicalManagedMediaFolders,
    upsertCanonicalManagedMediaReference,
} from '../src/endpoints/canonical-managed-media-store.js';

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
        ['backgrounds/sky.webp', 'background', 'background'],
        ['backgrounds/animated.gif', 'background', 'background'],
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
    replaceCanonicalManagedMediaFolders(db, {
        folders: [{ id: 'sky', name: 'Sky', thumbnailFile: 'sky.webp' }],
        imageFolderMap: { 'sky.webp': ['sky'] },
        nowMs: 1735689600000,
    });
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
    test('uses a clean managed-media audit to rebuild background, folder, and asset payloads', () => {
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
        expect(listCanonicalBackgroundPayload(state.db, {
            metadataByPath: {
                'backgrounds/sky.webp': { isAnimated: false },
                'backgrounds/animated.gif': { isAnimated: true },
            },
        })).toEqual({
            images: [
                { filename: 'animated.gif', isAnimated: true },
                { filename: 'sky.webp', isAnimated: false },
            ],
            folders: [{ id: 'sky', name: 'Sky', thumbnailFile: 'sky.webp' }],
            imageFolderMap: { 'sky.webp': ['sky'] },
        });
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
