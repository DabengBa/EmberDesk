import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { runCanonicalWorldInfoShadowImport, auditCanonicalWorldInfoShadowImport } from '../src/canonical-world-info-shadow-import.ts';
import { getCanonicalWorldInfoBook } from '../src/endpoints/world-info-store.ts';

test('world importer is idempotent and blocks a changed file from overwriting SQLite', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-world-'));
    const directories = { root, storage: path.join(root, 'storage'), worlds: path.join(root, 'worlds') };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(directories.worlds, { recursive: true });
    const file = path.join(directories.worlds, 'Alpha.json');
    const initial = { entries: { '1': { uid: 1, content: 'legacy' } } };
    fs.writeFileSync(file, JSON.stringify(initial));
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    try {
        const featureFlags = { enabled: true, shadowImport: true, strict: false };
        const options = { handle: 'tester', directories, manager, featureFlags };
        expect((await runCanonicalWorldInfoShadowImport(options)).importedCount).toBe(1);
        expect((await runCanonicalWorldInfoShadowImport(options)).unchangedCount).toBe(1);
        const db = manager.open({ handle: 'tester', directories, featureFlags });
        fs.writeFileSync(file, JSON.stringify({ entries: { '1': { uid: 1, content: 'stale' } } }));
        expect((await runCanonicalWorldInfoShadowImport(options)).failedCount).toBe(1);
        expect(getCanonicalWorldInfoBook(db, 'Alpha')).toEqual(initial);
        const audit = await auditCanonicalWorldInfoShadowImport({ handle: 'tester', directories, db });
        expect(audit.blocking).toBe(true);
        expect(audit.entries).toEqual(expect.arrayContaining([expect.objectContaining({ drift_types: ['payload_mismatch'] })]));
    } finally {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
