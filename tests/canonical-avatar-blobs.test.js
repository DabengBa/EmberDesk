import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';
import {
    CHARACTER_AVATAR_ROLE,
    CHARACTER_AVATAR_VIRTUAL_ROOT,
    countMissingCharacterAvatarBlobs,
    getCharacterAvatarBlobReference,
    renameCharacterAvatarBlobReference,
    retireCharacterAvatarBlobReference,
} from '../src/canonical-avatar-blobs.js';
import {
    backfillCharacterAvatarBlobs,
    recordCharacterAvatarBlob,
} from '../src/canonical-avatar-blob-service.js';
import { resetCanonicalBackendsForTests } from '../src/canonical-backend.js';
import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    auditCanonicalManagedMediaShadowImport,
} from '../src/canonical-managed-media-shadow-import.js';
import {
    listCanonicalManagedMediaReferences,
} from '../src/endpoints/canonical-managed-media-store.js';
import { readManagedMediaContent } from '../src/endpoints/canonical-managed-media-read-service.js';
import { extractImageData, write } from '../src/character-card-parser.js';
import encode from '../src/png/encode.js';
import { getImportLedgerEntry } from '../src/canonical-import-ledger.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL_AVATAR_PNG = path.join(REPO_ROOT, 'public', 'img', 'ai4.png');
const REAL_AVATAR_PNG_ALT = path.join(REPO_ROOT, 'public', 'img', 'apple-icon-144x144.png');

const tempRoots = [];
const managers = [];

const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-avatar-blobs-config-'));
fs.writeFileSync(path.join(configRoot, 'config.yaml'), 'port: 8000\n', 'utf8');
setConfigFilePath(path.join(configRoot, 'config.yaml'));

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-avatar-blobs-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        handle: 'alice',
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        thumbnailsAvatar: path.join(root, 'thumbnails', 'avatar'),
        backgrounds: path.join(root, 'backgrounds'),
        assets: path.join(root, 'assets'),
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

function openDb(manager, directories) {
    const db = manager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    return db;
}

function insertCharacter(db, avatarFilename, { deleted = false } = {}) {
    db.prepare(`
        INSERT INTO characters (id, avatar_filename, internal_name, display_name, card_json, shallow_json, world_name, created_at_ms, updated_at_ms, deleted_at_ms)
        VALUES (?, ?, ?, ?, '{}', '{}', '', 1, 1, ?)
    `).run(`char-${avatarFilename}`, avatarFilename, avatarFilename.replace(/\.png$/i, ''), avatarFilename, deleted ? 5 : null);
}

function makePng(seed = 0) {
    return Buffer.from(encode([
        { name: 'IHDR', data: new Uint8Array(13).fill(seed) },
        { name: 'IDAT', data: new Uint8Array([seed, seed + 1, seed + 2]) },
        { name: 'IEND', data: new Uint8Array(0) },
    ]));
}

function hash(contents) {
    return crypto.createHash('sha256').update(contents).digest('hex');
}

afterEach(() => {
    resetCanonicalBackendsForTests();
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('character avatar blobs', () => {
    test('extractImageData strips card text chunks and stays stable across card edits', () => {
        const basePng = makePng(1);
        const withCardA = write(basePng, JSON.stringify({ name: 'Alpha' }));
        const withCardB = write(basePng, JSON.stringify({ name: 'Alpha', description: 'edited' }));

        const imageA = extractImageData(withCardA);
        const imageB = extractImageData(withCardB);
        expect(imageA.equals(imageB)).toBe(true);
        expect(imageA.equals(basePng)).toBe(true);
    });

    test('recordCharacterAvatarBlob registers a virtual-path reference without projecting a file', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);
        const png = write(makePng(2), JSON.stringify({ name: 'Beta' }));

        const result = await recordCharacterAvatarBlob({
            handle: 'alice',
            directories,
            avatarFilename: 'beta.png',
            contents: png,
            nowMs: 1735689600200,
        });

        expect(result).toEqual(expect.objectContaining({ ok: true, authorityCommitted: true }));
        const reference = getCharacterAvatarBlobReference(db, 'beta.png');
        expect(reference).toEqual(expect.objectContaining({
            compatibilityPath: 'character-avatars/beta.png',
            ownerType: 'character',
            ownerId: 'beta.png',
            role: CHARACTER_AVATAR_ROLE,
            contentHash: hash(extractImageData(png)),
        }));
        // Virtual path: no file materialized under the user root.
        expect(fs.existsSync(path.join(root, 'character-avatars', 'beta.png'))).toBe(false);
        // Managed blob bytes exist.
        expect(fs.existsSync(path.join(directories.storage, 'managed-media', reference.contentHash))).toBe(true);
        // No ledger entry is recorded — nothing was projected to a real file.
        expect(getImportLedgerEntry(db, { sliceKey: 'managed_media', sourcePath: 'character-avatars/beta.png' })).toBeNull();
    });

    test('managed-media audit does not flag virtual avatar references as drift', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);

        await recordCharacterAvatarBlob({
            handle: 'alice',
            directories,
            avatarFilename: 'gamma.png',
            contents: write(makePng(3), JSON.stringify({ name: 'Gamma' })),
        });

        const audit = await auditCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689600300,
        });

        expect(audit.entries).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ compatibility_path: expect.stringContaining(CHARACTER_AVATAR_VIRTUAL_ROOT) }),
        ]));
    });

    test('backfill registers avatar blobs for live rows and stays idempotent', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);

        const png = write(makePng(4), JSON.stringify({ name: 'Delta' }));
        fs.writeFileSync(path.join(directories.characters, 'delta.png'), png);
        insertCharacter(db, 'delta.png');
        insertCharacter(db, 'gone.png'); // row without a file on disk

        expect(countMissingCharacterAvatarBlobs(db)).toBe(2);

        const first = await backfillCharacterAvatarBlobs({ handle: 'alice', directories, db });
        expect(first).toEqual(expect.objectContaining({ checked: 2, backfilled: 1, missingFile: 1 }));
        expect(countMissingCharacterAvatarBlobs(db)).toBe(1);

        const second = await backfillCharacterAvatarBlobs({ handle: 'alice', directories, db });
        expect(second).toEqual(expect.objectContaining({ checked: 1, backfilled: 0, missingFile: 1 }));
    });

    test('rename migrates the reference owner; delete retires it and tombstones the blob', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);
        const png = write(makePng(5), JSON.stringify({ name: 'Epsilon' }));

        await recordCharacterAvatarBlob({
            handle: 'alice',
            directories,
            avatarFilename: 'eps.png',
            contents: png,
            nowMs: 1735689600400,
        });
        const before = getCharacterAvatarBlobReference(db, 'eps.png');

        renameCharacterAvatarBlobReference(db, 'eps.png', 'eps2.png', { nowMs: 1735689600500 });
        expect(getCharacterAvatarBlobReference(db, 'eps.png')).toBeNull();
        expect(getCharacterAvatarBlobReference(db, 'eps2.png')).toEqual(expect.objectContaining({
            blobId: before.blobId,
            ownerId: 'eps2.png',
        }));

        retireCharacterAvatarBlobReference(db, 'eps2.png', { nowMs: 1735689600600 });
        expect(getCharacterAvatarBlobReference(db, 'eps2.png')).toBeNull();
        const tombstone = db.prepare(`SELECT lifecycle_state FROM managed_blobs WHERE id = ?`).get(before.blobId);
        expect(tombstone.lifecycle_state).toBe('tombstoned');
    });

    test('readManagedMediaContent serves avatar bytes by path or reference', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);
        const png = write(makePng(6), JSON.stringify({ name: 'Zeta' }));

        await recordCharacterAvatarBlob({
            handle: 'alice',
            directories,
            avatarFilename: 'zeta.png',
            contents: png,
        });

        const byPath = readManagedMediaContent(db, directories, 'character-avatars/zeta.png');
        expect(byPath).toEqual(expect.objectContaining({ ok: true, mediaType: 'image/png' }));
        expect(byPath.contents.equals(extractImageData(png))).toBe(true);

        const reference = getCharacterAvatarBlobReference(db, 'zeta.png');
        const byRef = readManagedMediaContent(db, directories, reference);
        expect(byRef.ok).toBe(true);
        expect(byRef.contents.equals(byPath.contents)).toBe(true);

        retireCharacterAvatarBlobReference(db, 'zeta.png');
        expect(readManagedMediaContent(db, directories, 'character-avatars/zeta.png').ok).toBe(false);
        expect(readManagedMediaContent(db, directories, 'character-avatars/missing.png'))
            .toEqual(expect.objectContaining({ ok: false, reason: 'reference_not_found' }));
    });

    test('avatar thumbnail cache is gated by the blob content hash sidecar', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);

        const pngV1 = write(fs.readFileSync(REAL_AVATAR_PNG), JSON.stringify({ name: 'Eta' }));
        fs.writeFileSync(path.join(directories.characters, 'eta.png'), pngV1);
        insertCharacter(db, 'eta.png');
        await backfillCharacterAvatarBlobs({ handle: 'alice', directories, db });
        const referenceV1 = getCharacterAvatarBlobReference(db, 'eta.png');

        // Loaded lazily: image-metadata reads config at module eval time, so the
        // module must be imported after setConfigFilePath ran in this file.
        const { generateThumbnail } = await import('../src/endpoints/thumbnails.js');

        // Seed a cached thumbnail + hash sidecar as if a prior generation ran.
        const cachedPath = path.join(directories.thumbnailsAvatar, 'eta.png');
        const sidecarPath = `${cachedPath}.srchash`;
        fs.mkdirSync(path.dirname(cachedPath), { recursive: true });
        fs.writeFileSync(cachedPath, fs.readFileSync(REAL_AVATAR_PNG));
        fs.writeFileSync(sidecarPath, referenceV1.contentHash);

        // Make the compatibility file look newer than the cache: the file-mtime
        // branch would regenerate (and fail on Jimp in this environment), so a
        // cache hit here can only come from the blob-hash branch.
        const future = new Date(Date.now() + 60_000);
        fs.utimesSync(path.join(directories.characters, 'eta.png'), future, future);

        // Matching hash → cache hit serves without regeneration.
        const hit = await generateThumbnail(directories, 'avatar', 'eta.png');
        expect(hit.path).toBe(cachedPath);

        // Blob content moves (avatar replaced) → hash mismatch → regeneration
        // is attempted instead of serving the stale cache.
        const pngV2 = write(fs.readFileSync(REAL_AVATAR_PNG_ALT), JSON.stringify({ name: 'Eta' }));
        await recordCharacterAvatarBlob({
            handle: 'alice',
            directories,
            avatarFilename: 'eta.png',
            contents: pngV2,
        });
        const referenceV2 = getCharacterAvatarBlobReference(db, 'eta.png');
        expect(referenceV2.contentHash).not.toBe(referenceV1.contentHash);

        const stale = await generateThumbnail(directories, 'avatar', 'eta.png');
        expect(stale.path).not.toBe(cachedPath);
    });

    test('deleted characters do not count as missing avatar blobs', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = openDb(manager, directories);

        insertCharacter(db, 'kept.png');
        insertCharacter(db, 'deleted.png', { deleted: true });
        expect(countMissingCharacterAvatarBlobs(db)).toBe(1);
        expect(listCanonicalManagedMediaReferences(db)).toHaveLength(0);
    });
});
