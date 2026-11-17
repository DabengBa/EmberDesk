import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { auditCanonicalSecretsShadowImport, runCanonicalSecretsShadowImport } from '../src/canonical-secrets-shadow-import.ts';
import { getCanonicalSecrets } from '../src/endpoints/canonical-secrets-store.ts';

test('secrets import is idempotent and does not expose secret values in audit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-secrets-'));
    const directories = { root, storage: path.join(root, 'storage') };
    fs.mkdirSync(directories.storage, { recursive: true });
    const file = path.join(root, 'secrets.json');
    fs.writeFileSync(file, JSON.stringify({ api_key: 'private-value-a' }));
    const manager = createCanonicalSqliteManager({ logger: { info() {}, warn() {} } });
    try {
        const featureFlags = { enabled: true, shadowImport: true, reads: true, strict: false };
        const options = { handle: 'tester', directories, manager, featureFlags };
        expect(runCanonicalSecretsShadowImport(options).importedCount).toBe(1);
        expect(runCanonicalSecretsShadowImport(options).unchangedCount).toBe(1);
        const db = manager.open({ handle: 'tester', directories, featureFlags });
        fs.writeFileSync(file, JSON.stringify({ api_key: 'private-value-b' }));
        runCanonicalSecretsShadowImport(options);
        expect(getCanonicalSecrets(db).api_key[0].value).toBe('private-value-a');
        const audit = auditCanonicalSecretsShadowImport({ handle: 'tester', directories, db });
        expect(audit.blocking).toBe(true);
        expect(JSON.stringify(audit)).not.toContain('private-value-a');
        expect(JSON.stringify(audit)).not.toContain('private-value-b');
    } finally {
        manager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
