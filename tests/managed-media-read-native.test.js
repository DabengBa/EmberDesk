import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test.each(['fallback', 'managed-first', 'clean-media-repair', 'legacy-chat', 'delete-shared', 'delete-chat-linked'])(
    'native managed-media integration: %s', scenario => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-media-read-native-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n');
        const url = name => new URL(`../src/${name}`, import.meta.url).href;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import path from 'node:path';
            import express from 'express';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const scenario = process.argv[14];
            const directories = {
                root: process.argv[3], storage: path.join(process.argv[3], 'storage'),
                files: path.join(process.argv[3], 'user/files'),
                userImages: path.join(process.argv[3], 'user/images'),
                chats: path.join(process.argv[3], 'chats'),
            };
            const { canonicalSqliteManager } = await import(process.argv[4]);
            const { runCanonicalMigrations } = await import(process.argv[5]);
            const { persistCanonicalAuditStatus } = await import(process.argv[6]);
            const store = await import(process.argv[7]);
            await import(process.argv[8]);
            const { router } = await import(process.argv[9]);
            await import(process.argv[10]);
            const { router: imagesRouter } = await import(process.argv[11]);
            await import(process.argv[12]);
            await import(process.argv[13]);
            const { ensureCanonicalSliceBackend } = await import(process.argv[15]);
            const db = canonicalSqliteManager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: true } });
            runCanonicalMigrations(db);
            const bytes = Buffer.from('native managed bytes');
            fs.mkdirSync(path.join(directories.storage, 'blobs'), { recursive: true });
            fs.writeFileSync(path.join(directories.storage, 'blobs/file.txt'), bytes);
            store.upsertCanonicalManagedMediaReference(db, {
                compatibilityPath: 'user/files/native.txt', contentHash: store.hashCanonicalManagedMediaBuffer(bytes),
                sizeBytes: bytes.length, mediaType: 'text/plain', managedRelativePath: 'blobs/file.txt', ownerType: 'attachment',
            });
            if (scenario !== 'legacy-chat') {
                persistCanonicalAuditStatus(db, { ok: true, handle: 'alice', hasDrift: false, blocking: false, entries: [] }, { scope: 'managed_media' });
            }
            const write = (relativePath, contents) => {
                const target = path.join(directories.root, relativePath);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(target, contents);
                return target;
            };
            function registerOld(relativePath, contents, ownerType = 'attachment') {
                const hash = store.hashCanonicalManagedMediaBuffer(contents);
                const managedRelativePath = 'managed-media/' + hash;
                store.upsertCanonicalManagedMediaReference(db, {
                    compatibilityPath: relativePath, contentHash: hash, sizeBytes: contents.length, managedRelativePath, ownerType,
                });
                return path.join(directories.storage, managedRelativePath);
            }
            if (scenario === 'managed-first') write('user/files/native.txt', 'stale projection');
            if (scenario === 'clean-media-repair') {
                const repairPath = 'user/files/repair.txt';
                const old = write(repairPath, bytes);
                const managedPath = registerOld(repairPath, bytes);
                const changedPath = 'user/files/changed.txt';
                const mismatched = registerOld(changedPath, Buffer.from('original'));
                write(changedPath, 'external edit');
                const initialized = await ensureCanonicalSliceBackend('managed_media', directories, 'alice');
                assert.equal(initialized.ok, true);
                assert.equal(initialized.importResult, undefined);
                assert.deepEqual(fs.readFileSync(managedPath), bytes);
                assert.equal(fs.existsSync(mismatched), false);
                assert.equal(store.getCanonicalManagedMediaReference(db, changedPath).contentHash, store.hashCanonicalManagedMediaBuffer('original'));
                fs.unlinkSync(old);
            }
            const firstImage = 'user/images/gallery/first.png';
            const secondImage = 'user/images/gallery/second.png';
            const imageBytes = Buffer.from('fixture image');
            let managedImage;
            let unrelatedOrphan;
            if (scenario === 'legacy-chat' || scenario.startsWith('delete-')) {
                write(firstImage, imageBytes);
                if (scenario.startsWith('delete-')) {
                    managedImage = registerOld(firstImage, imageBytes, 'user_image');
                    fs.mkdirSync(path.dirname(managedImage), { recursive: true });
                    fs.writeFileSync(managedImage, imageBytes);
                }
                if (scenario === 'delete-shared') {
                    write(secondImage, imageBytes);
                    registerOld(secondImage, imageBytes, 'user_image');
                    const orphanPath = registerOld('user/images/gallery/unrelated.png', 'unrelated', 'user_image');
                    fs.writeFileSync(orphanPath, 'unrelated');
                    db.exec("UPDATE media_references SET deleted_at_ms = 1 WHERE compatibility_path LIKE '%/unrelated.png'");
                    db.exec("UPDATE managed_blobs SET lifecycle_state = 'tombstoned', deleted_at_ms = 1 WHERE id IN (SELECT blob_id FROM media_references WHERE compatibility_path LIKE '%/unrelated.png')");
                    unrelatedOrphan = orphanPath;
                }
                if (scenario === 'legacy-chat' || scenario === 'delete-chat-linked') {
                    const message = { mes: '/' + firstImage, extra: { image: '/' + firstImage } };
                    write('chats/alice/fixture.jsonl', JSON.stringify({ chat_metadata: {} }) + '\\n' + JSON.stringify(message) + '\\n');
                }
                if (scenario === 'legacy-chat') {
                    await ensureCanonicalSliceBackend('chats', directories, 'alice');
                    const stored = db.prepare('SELECT payload_json FROM chat_messages').get();
                    assert.deepEqual(JSON.parse(stored.payload_json), { mes: '/' + firstImage, extra: { image: '/' + firstImage } });
                    const attachments = db.prepare('SELECT blob_id, compatibility_json FROM chat_attachment_refs').all();
                    assert.deepEqual(attachments.map(row => [row.blob_id, JSON.parse(row.compatibility_json)]), [[
                        store.getCanonicalManagedMediaReference(db, firstImage).blobId,
                        { path: '/' + firstImage, fieldPath: ['extra', 'image'] },
                    ]]);
                    fs.unlinkSync(path.join(directories.root, firstImage));
                }
            }
            const app = express();
            app.use(express.json());
            app.use((req, res, next) => { req.user = { directories, profile: { handle: 'alice' } }; next(); });
            app.use('/api/images', imagesRouter);
            app.use(router);
            const server = app.listen(0, '127.0.0.1');
            try {
                await new Promise(resolve => server.once('listening', resolve));
                const base = 'http://127.0.0.1:' + server.address().port;
                if (scenario.startsWith('delete-')) {
                    const remove = async relativePath => {
                        const response = await fetch(base + '/api/images/delete', {
                            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '/' + relativePath }),
                        });
                        assert.equal(response.status, 200, await response.text());
                        assert.equal(fs.existsSync(path.join(directories.root, relativePath)), false);
                    };
                    await remove(firstImage);
                    assert.deepEqual(fs.readFileSync(managedImage), imageBytes);
                    if (scenario === 'delete-shared') {
                        await remove(secondImage);
                        assert.equal(fs.existsSync(managedImage), false);
                        assert.equal(fs.existsSync(unrelatedOrphan), true);
                    } else {
                        assert.equal(store.getCanonicalManagedMediaReference(db, firstImage).lifecycleState, 'active');
                        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_attachment_refs').get().count, 1);
                    }
                } else {
                    const relativePath = scenario === 'legacy-chat' ? firstImage
                        : scenario === 'clean-media-repair' ? 'user/files/repair.txt' : 'user/files/native.txt';
                    const response = await fetch(base + '/' + relativePath);
                    assert.equal(response.status, 200);
                    if (scenario !== 'legacy-chat' && scenario !== 'clean-media-repair') assert.match(response.headers.get('content-type'), /^text\\/plain/);
                    assert.deepEqual(Buffer.from(await response.arrayBuffer()), scenario === 'legacy-chat' ? imageBytes : bytes);
                    if (scenario === 'managed-first') {
                        const partial = await fetch(base + '/' + relativePath, { headers: { Range: 'bytes=0-5' } });
                        assert.equal(partial.status, 206);
                        assert.equal(partial.headers.get('content-range'), 'bytes 0-5/' + bytes.length);
                        assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(0, 6));
                    }
                }
            } finally {
                await new Promise(resolve => server.close(resolve));
                canonicalSqliteManager.dispose();
            }
            console.log('managed-media-read:native-route');
        `, url('util.ts'), config, root, url('canonical-sqlite.ts'), url('canonical-sqlite-migrations.ts'),
        url('canonical-sqlite-shadow-import.ts'), url('endpoints/canonical-managed-media-store.ts'),
        url('endpoints/canonical-managed-media-read-service.ts'), url('user-files.ts'), url('endpoints/assets.ts'),
        url('endpoints/images.ts'), url('endpoints/files.ts'), url('canonical-avatar-blob-service.ts'), scenario, url('canonical-backend.ts')],
        { encoding: 'utf8', timeout: 20_000 });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('managed-media-read:native-route');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
