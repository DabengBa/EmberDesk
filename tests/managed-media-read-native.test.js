import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('native Node reads managed bytes through the real users fallback route', () => {
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
            const directories = {
                root: process.argv[3], storage: path.join(process.argv[3], 'storage'),
                files: path.join(process.argv[3], 'user/files'),
            };
            const { canonicalSqliteManager } = await import(process.argv[4]);
            const { runCanonicalMigrations } = await import(process.argv[5]);
            const { persistCanonicalAuditStatus } = await import(process.argv[6]);
            const store = await import(process.argv[7]);
            const read = await import(process.argv[8]);
            const { router } = await import(process.argv[9]);
            await import(process.argv[10]);
            await import(process.argv[11]);
            await import(process.argv[12]);
            await import(process.argv[13]);
            const db = canonicalSqliteManager.open({ handle: 'alice', directories, featureFlags: { enabled: true, strict: true } });
            runCanonicalMigrations(db);
            const bytes = Buffer.from('native managed bytes');
            fs.mkdirSync(path.join(directories.storage, 'blobs'), { recursive: true });
            fs.writeFileSync(path.join(directories.storage, 'blobs/file.txt'), bytes);
            store.upsertCanonicalManagedMediaReference(db, {
                compatibilityPath: 'user/files/native.txt', contentHash: store.hashCanonicalManagedMediaBuffer(bytes),
                sizeBytes: bytes.length, mediaType: 'text/plain', managedRelativePath: 'blobs/file.txt', ownerType: 'attachment',
            });
            persistCanonicalAuditStatus(db, { ok: true, handle: 'alice', hasDrift: false, blocking: false, entries: [] }, { scope: 'managed_media' });
            assert.equal(fs.existsSync(path.join(directories.files, 'native.txt')), false);
            const state = read.getCanonicalManagedMediaReadState({ handle: 'alice', directories });
            assert.equal(state.ok, true);
            assert.deepEqual(read.readManagedMediaContent(state.db, directories, 'user/files/native.txt').contents, bytes);
            const app = express();
            app.use((req, res, next) => { req.user = { directories }; next(); });
            app.use(router);
            const server = app.listen(0, '127.0.0.1');
            try {
                await new Promise(resolve => server.once('listening', resolve));
                const response = await fetch('http://127.0.0.1:' + server.address().port + '/user/files/native.txt');
                assert.equal(response.status, 200);
                assert.match(response.headers.get('content-type'), /^text\\/plain/);
                assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
            } finally {
                await new Promise(resolve => server.close(resolve));
                canonicalSqliteManager.dispose();
            }
            console.log('managed-media-read:native-route');
        `, url('util.js'), config, root, url('canonical-sqlite.ts'), url('canonical-sqlite-migrations.ts'),
        url('canonical-sqlite-shadow-import.ts'), url('endpoints/canonical-managed-media-store.ts'),
        url('endpoints/canonical-managed-media-read-service.ts'), url('users.js'), url('endpoints/assets.js'),
        url('endpoints/images.js'), url('endpoints/files.js'), url('canonical-avatar-blob-service.ts')],
        { encoding: 'utf8', timeout: 20_000 });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('managed-media-read:native-route');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
