import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { CANONICAL_SQLITE_MIGRATIONS, runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    getCanonicalManagedMediaFolderState,
    listCanonicalManagedMediaReferences,
} from '../src/endpoints/canonical-managed-media-store.js';
import {
    MANAGED_MEDIA_AUDIT_SCOPE,
    auditCanonicalManagedMediaShadowImport,
    runCanonicalManagedMediaShadowImport,
} from '../src/canonical-managed-media-shadow-import.js';
import { getPersistedCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-managed-media-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
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
    const manager = createCanonicalSqliteManager({
        logger: { info: jest.fn(), warn: jest.fn() },
    });
    managers.push(manager);
    return manager;
}

function writeCompatibilityFile(directories, relativePath, contents) {
    const filePath = path.join(directories.root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return filePath;
}

function hash(contents) {
    return crypto.createHash('sha256').update(contents).digest('hex');
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical managed media catalog', () => {
    test('imports compatibility media without moving files, deduplicates content, and migrates background folder membership', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const backgroundPath = writeCompatibilityFile(directories, 'backgrounds/sky.png', 'shared-media');
        const attachmentPath = writeCompatibilityFile(directories, 'user/files/copy.png', 'shared-media');
        writeCompatibilityFile(directories, 'assets/bgm/loop.ogg', 'music');
        writeCompatibilityFile(directories, 'User Avatars/persona.png', 'persona');
        writeCompatibilityFile(directories, 'user/images/scene/generated.webp', 'upload');
        fs.writeFileSync(path.join(root, 'image-metadata.json'), JSON.stringify({
            version: 1,
            folders: [{ id: 'folder-sky', name: 'Sky', thumbnailFile: 'sky.png' }],
            images: {
                'backgrounds/sky.png': { folderIds: ['folder-sky'] },
            },
        }), 'utf8');

        const first = await runCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, reads: false, strict: false },
            manager,
            nowMs: 1735689600000,
        });
        const second = await runCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, reads: false, strict: false },
            manager,
            nowMs: 1735689601000,
        });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        const references = listCanonicalManagedMediaReferences(db);
        const folders = getCanonicalManagedMediaFolderState(db);
        const audit = await auditCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689602000,
        });

        expect(CANONICAL_SQLITE_MIGRATIONS.map(migration => migration.version)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(first).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 5,
            unchangedCount: 0,
        }));
        expect(second).toEqual(expect.objectContaining({
            ok: true,
            importedCount: 0,
            unchangedCount: 5,
        }));
        expect(fs.readFileSync(backgroundPath, 'utf8')).toBe('shared-media');
        expect(fs.readFileSync(attachmentPath, 'utf8')).toBe('shared-media');
        expect(references).toEqual(expect.arrayContaining([
            expect.objectContaining({
                compatibilityPath: 'backgrounds/sky.png',
                ownerType: 'background',
                contentHash: hash('shared-media'),
            }),
            expect.objectContaining({
                compatibilityPath: 'user/files/copy.png',
                ownerType: 'attachment',
                contentHash: hash('shared-media'),
            }),
        ]));
        const sharedReferences = references.filter(reference => reference.contentHash === hash('shared-media'));
        expect(new Set(sharedReferences.map(reference => reference.blobId)).size).toBe(1);
        expect(folders).toEqual({
            folders: [{ id: 'folder-sky', name: 'Sky', thumbnailFile: 'sky.png' }],
            imageFolderMap: { 'sky.png': ['folder-sky'] },
        });
        expect(audit).toEqual(expect.objectContaining({ ok: true, blocking: false }));
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                compatibility_path: 'backgrounds/sky.png',
                status: 'clean',
                drift_types: expect.arrayContaining(['registered', 'duplicate_content']),
            }),
        ]));
        expect(getPersistedCanonicalAuditStatus(db, { scope: MANAGED_MEDIA_AUDIT_SCOPE })).toEqual(expect.objectContaining({
            ok: true,
            blocking: false,
        }));
    });

    test('audits orphan, missing, hash mismatch, and unsafe catalog paths without touching compatibility files', async () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        writeCompatibilityFile(directories, 'backgrounds/changed.png', 'original');
        writeCompatibilityFile(directories, 'User Avatars/missing.png', 'will disappear');

        await runCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, shadowImport: true, reads: false, strict: false },
            manager,
            nowMs: 1735689600000,
        });
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        fs.writeFileSync(path.join(directories.backgrounds, 'changed.png'), 'changed');
        fs.rmSync(path.join(directories.avatars, 'missing.png'));
        writeCompatibilityFile(directories, 'user/files/orphan.txt', 'orphan');
        db.prepare(`
            INSERT INTO managed_blobs (
                id, content_hash, size_bytes, media_type, relative_path, lifecycle_state, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('unsafe-blob', hash('unsafe'), 6, 'application/octet-stream', '../unsafe', 'active', 1, 1);
        db.prepare(`
            INSERT INTO media_references (
                id, blob_id, owner_type, owner_id, role, display_name, compatibility_path, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run('unsafe-reference', 'unsafe-blob', 'attachment', 'unsafe', 'attachment', 'unsafe', '../unsafe', '{}', 1, 1);

        const audit = await auditCanonicalManagedMediaShadowImport({
            handle: 'alice',
            directories,
            db,
            auditedAtMs: 1735689601000,
        });

        expect(audit).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_drift_blocked',
        }));
        expect(audit.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ compatibility_path: 'backgrounds/changed.png', drift_types: ['hash_mismatch'] }),
            expect.objectContaining({ compatibility_path: 'User Avatars/missing.png', drift_types: ['missing'] }),
            expect.objectContaining({ compatibility_path: 'user/files/orphan.txt', drift_types: ['orphan'] }),
            expect.objectContaining({ compatibility_path: '../unsafe', drift_types: ['unsafe_path'] }),
        ]));
        expect(fs.readFileSync(path.join(directories.backgrounds, 'changed.png'), 'utf8')).toBe('changed');
        expect(fs.existsSync(path.join(directories.files, 'orphan.txt'))).toBe(true);
        expect(getPersistedCanonicalAuditStatus(db, { scope: MANAGED_MEDIA_AUDIT_SCOPE })).toEqual(expect.objectContaining({
            ok: false,
            blocking: true,
            reason: 'audit_drift_blocked',
        }));
    });

    test('creates the media schema idempotently for databases already at migration five', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });

        const first = runCanonicalMigrations(db, { nowMs: 1735689600000 });
        const second = runCanonicalMigrations(db, { nowMs: 1735689601000 });

        expect(first).toEqual(expect.objectContaining({
            ok: true,
            currentVersion: 6,
            targetVersion: 6,
        }));
        expect(second).toEqual(expect.objectContaining({ ok: true, appliedVersions: [] }));
        for (const table of ['managed_blobs', 'media_references', 'media_folders', 'media_folder_memberships', 'managed_media_repairs']) {
            expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table)).toBeTruthy();
        }
    });
});
