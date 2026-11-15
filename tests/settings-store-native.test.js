import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

test('Node resolves the production settings and presets graphs without a loader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-native-'));
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
            const { router } = await import(process.argv[4]);
            const presets = await import(process.argv[5]);
            const settings = await import(process.argv[6]);
            const { runCanonicalMigrations } = await import(process.argv[7]);
            const { router: presetsRouter } = await import(process.argv[8]);
            const db = new DatabaseSync(':memory:');
            runCanonicalMigrations(db);
            const saved = settings.upsertCanonicalSettingsDocument(db, {
                userId: 'native-user', payload: { example: true }, expectedRevision: 0,
            });
            assert.equal(saved.ok, true);
            assert.equal(settings.getCanonicalSettingsDocument(db, { userId: 'native-user' }).revision, 1);
            assert.equal(typeof router, 'function');
            assert.equal(typeof presets.ensureCanonicalPreset, 'function');
            assert.equal(typeof presetsRouter, 'function');
            const preset = presets.upsertCanonicalPreset(db, { name: 'Native', payload: { z: 1, a: 2 } });
            assert.equal(preset.ok, true);
            const persisted = presets.getCanonicalPreset(db, { name: 'Native' });
            assert.equal(persisted.payloadJson, settings.stableSettingsPayloadJson({ z: 1, a: 2 }));
            assert.equal(persisted.contentHash, settings.hashSettingsPayload(persisted.payloadJson));
            db.close();
            console.log('settings-callers:native');
        `, url('util.js'), config, root, url('endpoints/settings.js'),
        url('endpoints/presets-store.ts'), url('endpoints/settings-store.ts'), url('canonical-sqlite-migrations.js'),
        url('endpoints/presets.js')], {
            encoding: 'utf8', timeout: 10_000,
        });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('settings-callers:native');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
