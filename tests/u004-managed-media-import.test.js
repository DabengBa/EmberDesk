import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { runCanonicalManagedMediaShadowImport, auditCanonicalManagedMediaShadowImport } from '../src/canonical-managed-media-shadow-import.ts';
import { listCanonicalManagedMediaReferences } from '../src/endpoints/canonical-managed-media-store.ts';
import { readManagedMediaContent } from '../src/endpoints/canonical-managed-media-read-service.ts';

test('media import retries preserve catalog identity and projection-off audit suppresses file drift', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-media-'));
    const directories = { root, storage: path.join(root, 'storage'), files: path.join(root, 'files') };
    fs.mkdirSync(directories.storage, { recursive: true });
    fs.mkdirSync(directories.files, { recursive: true });
    const file = path.join(directories.files, 'photo.png');
    fs.writeFileSync(file, 'fixture content');
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    try {
        const featureFlags = { enabled: true, shadowImport: true, strict: false };
        const options = { handle: 'tester', directories, manager, featureFlags };
        expect((await runCanonicalManagedMediaShadowImport(options)).importedCount).toBe(1);
        expect((await runCanonicalManagedMediaShadowImport(options)).unchangedCount).toBe(1);
        const db = manager.open({ handle: 'tester', directories, featureFlags });
        expect(listCanonicalManagedMediaReferences(db)).toHaveLength(1);
        fs.unlinkSync(file);
        expect(readManagedMediaContent(db, directories, 'files/photo.png')).toMatchObject({
            ok: true, contents: Buffer.from('fixture content'),
        });
        const sync = await auditCanonicalManagedMediaShadowImport({ handle: 'tester', directories, db });
        expect(sync.blocking).toBe(true);
        const off = await auditCanonicalManagedMediaShadowImport({ handle: 'tester', directories, db, projection: 'off' });
        expect(off.blocking).toBe(false);
        expect(off.entries).toEqual(expect.arrayContaining([expect.objectContaining({ drift_types: ['missing'], details: expect.objectContaining({ suppressed: true }) })]));
    } finally {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
