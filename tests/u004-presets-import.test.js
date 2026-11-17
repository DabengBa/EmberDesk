import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { runCanonicalPresetsShadowImport, auditCanonicalPresetsShadowImport } from '../src/canonical-presets-shadow-import.ts';
import { getCanonicalPreset, upsertCanonicalPreset } from '../src/endpoints/presets-store.ts';

test('preset importer preserves canonical edits and one-shot markers across retries', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-presets-'));
    const directories = { root, storage: path.join(root, 'storage'), openAI_Settings: path.join(root, 'OpenAI Settings') };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(directories.openAI_Settings, { recursive: true });
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    try {
        const file = path.join(directories.openAI_Settings, 'Alpha.json');
        fs.writeFileSync(file, JSON.stringify({ value: 'legacy' }));
        const featureFlags = { enabled: true, shadowImport: true, strict: false };
        const options = { handle: 'tester', directories, manager, featureFlags };
        const first = await runCanonicalPresetsShadowImport(options);
        expect(first.importedCount).toBe(1);
        const db = manager.open({ handle: 'tester', directories, featureFlags });
        upsertCanonicalPreset(db, { name: 'Alpha', payload: { value: 'canonical' }, source: 'user' });
        fs.writeFileSync(file, JSON.stringify({ value: 'stale' }));
        const second = await runCanonicalPresetsShadowImport(options);
        expect(second.importedCount).toBe(0);
        expect(second.entries).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'skipped_marker' })]));
        expect(JSON.parse(getCanonicalPreset(db, { name: 'Alpha' }).payloadJson)).toEqual({ value: 'canonical' });
        expect((await auditCanonicalPresetsShadowImport({ handle: 'tester', db })).ok).toBe(true);
    } finally {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
