import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import {
    upsertCanonicalManagedMediaReference,
} from '../src/endpoints/canonical-managed-media-store.js';
import { setConfigFilePath } from '../src/util.js';

const tempRoots = [];
const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-managed-media-routes-config-'));
const configPath = path.join(configDirectory, 'config.yaml');
let assetsRouter;
let imageMetadataRouter;

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-managed-media-routes-'));
    tempRoots.push(root);
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        backgrounds: path.join(root, 'backgrounds'),
        assets: path.join(root, 'assets'),
        thumbnailsBg: path.join(root, 'thumbnails', 'bg'),
    };
    for (const directory of Object.values(directories)) {
        if (directory !== root) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }
    return directories;
}

function createResponse() {
    return {
        body: undefined,
        statusCode: 200,
        json(payload) { this.body = payload; return this; },
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
        status(code) { this.statusCode = code; return this; },
    };
}

async function invokeRoute(router, routePath, directories, requestOverrides = {}) {
    const layer = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods?.post);
    if (!layer) {
        throw new Error(`Route not found: POST ${routePath}`);
    }
    const response = createResponse();
    await layer.route.stack[0].handle({
        ...requestOverrides,
        user: {
            profile: { handle: 'alice' },
            directories,
            ...requestOverrides.user,
        },
    }, response);
    return response;
}

function setManagedMediaEnv({ enabled = true, shadowImport = true, reads = true, writes = false, strict = false } = {}) {
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_MANAGEDMEDIA_ENABLED = String(enabled);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_MANAGEDMEDIA_SHADOWIMPORT = String(shadowImport);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_MANAGEDMEDIA_READS = String(reads);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_MANAGEDMEDIA_WRITES = String(writes);
    process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_MANAGEDMEDIA_STRICT = String(strict);
}

function clearManagedMediaEnv() {
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_MANAGEDMEDIA_')) {
            delete process.env[key];
        }
    }
}

function seedCanonicalMedia(directories, { audit = true } = {}) {
    const db = canonicalSqliteManager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    for (const compatibilityPath of [
        'backgrounds/canonical.gif',
        'assets/bgm/canonical.ogg',
    ]) {
        upsertCanonicalManagedMediaReference(db, {
            compatibilityPath,
            contentHash: `hash-${compatibilityPath}`,
            sizeBytes: 1,
            mediaType: compatibilityPath.endsWith('.gif') ? 'image/gif' : 'audio/ogg',
            managedRelativePath: `managed-media/${compatibilityPath}`,
            ownerType: compatibilityPath.startsWith('backgrounds/') ? 'background' : 'asset',
            ownerId: compatibilityPath,
            role: compatibilityPath.startsWith('backgrounds/') ? 'background' : 'asset',
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
}

beforeAll(async () => {
    fs.writeFileSync(configPath, [
        'features:',
        '  storage:',
        '    canonicalSqlite:',
        '      enabled: false',
        '      shadowImport: false',
        '      reads: false',
        '      writes: false',
        '      strict: false',
        '      slices:',
        '        managedMedia:',
        '          enabled: false',
        '          shadowImport: false',
        '          reads: false',
        '          writes: false',
        '          strict: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
    ({ router: assetsRouter } = await import('../src/endpoints/assets.js'));
    ({ router: imageMetadataRouter } = await import('../src/endpoints/image-metadata.js'));
});

afterEach(() => {
    canonicalSqliteManager.dispose();
    clearManagedMediaEnv();
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical managed media route service', () => {
    test('keeps generic image metadata routes while retiring folder management routes', () => {
        const postPaths = imageMetadataRouter.stack
            .filter(layer => layer.route?.methods?.post)
            .map(layer => layer.route.path);

        expect(postPaths).toEqual(expect.arrayContaining(['/', '/all', '/cleanup']));
        expect(postPaths.some(routePath => routePath.startsWith('/folders/'))).toBe(false);
    });

    test('uses the clean catalog instead of compatibility-directory scans for asset lists', async () => {
        const directories = makeDirectories();
        fs.mkdirSync(path.join(directories.assets, 'bgm'), { recursive: true });
        fs.writeFileSync(path.join(directories.assets, 'bgm', 'filesystem-only.ogg'), 'file');
        seedCanonicalMedia(directories);
        setManagedMediaEnv();

        const response = await invokeRoute(assetsRouter, '/get', directories);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            bgm: ['assets/bgm/canonical.ogg'],
        });
    });

    test('rejects strict managed-media reads when the persisted audit is missing', async () => {
        const directories = makeDirectories();
        seedCanonicalMedia(directories, { audit: false });
        setManagedMediaEnv({ strict: true });

        const response = await invokeRoute(assetsRouter, '/get', directories);

        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ error: 'Failed to fetch managed assets' });
    });

});
