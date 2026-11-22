import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('Node resolves the production managed media graph without a loader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-media-native-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n');
        const url = name => new URL(`../src/${name}`, import.meta.url).href;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            import { DatabaseSync } from 'node:sqlite';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const store = await import(process.argv[4]);
            const { router } = await import(process.argv[5]);
            await import(process.argv[6]);
            await import(process.argv[7]);
            const { runCanonicalMigrations } = await import(process.argv[8]);
            const db = new DatabaseSync(':memory:');
            runCanonicalMigrations(db);
            const saved = store.upsertCanonicalManagedMediaReference(db, {
                compatibilityPath: 'user/files/native.txt',
                contentHash: store.hashCanonicalManagedMediaBuffer(Buffer.from('native')),
                sizeBytes: 6, ownerType: 'attachment',
            });
            assert.equal(saved.status, 'imported');
            assert.equal(store.getCanonicalManagedMediaReference(db, 'user/files/native.txt').sizeBytes, 6);
            assert.equal(typeof router, 'function');
            db.close();
            console.log('media-callers:native');
        `, url('util.ts'), config, root, url('endpoints/canonical-managed-media-store.ts'),
        url('endpoints/files.ts'), url('canonical-sqlite-operator.ts'), url('canonical-sqlite-export.ts'),
        url('canonical-sqlite-migrations.ts')], { encoding: 'utf8', timeout: 10_000 });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('media-callers:native');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
