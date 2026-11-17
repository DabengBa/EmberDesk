import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from '@jest/globals';

import { ensureCanonicalSliceBackend, resetCanonicalBackendsForTests } from '../src/canonical-backend.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { getCanonicalSettingsDocument, upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.ts';
import { invalidateCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.ts';
import { SETTINGS_AUDIT_SCOPE } from '../src/canonical-settings-shadow-import.ts';
import { setConfigFilePath } from '../src/util.js';

const roots = [];
afterEach(() => {
    resetCanonicalBackendsForTests();
    canonicalSqliteManager.dispose();
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('the settings backend retains SQLite authority across a stale file audit and repeated initialization', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-settings-consumer-'));
    roots.push(root);
    const directories = { root, storage: path.join(root, 'storage'), backups: path.join(root, 'backups') };
    fs.mkdirSync(directories.storage);
    fs.mkdirSync(directories.backups);
    const config = path.join(root, 'config.yaml');
    fs.writeFileSync(config, 'port: 8000\n');
    setConfigFilePath(config);
    const file = path.join(root, 'settings.json');
    const legacy = '{"marker":"stale-file"}';
    fs.writeFileSync(file, legacy);

    const first = await ensureCanonicalSliceBackend('settings', directories, 'alice');
    expect(first.ok).toBe(true);
    upsertCanonicalSettingsDocument(first.db, { userId: 'alice', payload: { marker: 'sqlite' }, expectedRevision: 0 });
    invalidateCanonicalAuditStatus(first.db, {
        scope: SETTINGS_AUDIT_SCOPE,
        handle: 'alice',
        reason: 'audit_stale_after_settings_file_write',
        source: 'u004-test',
    });
    resetCanonicalBackendsForTests();

    const second = await ensureCanonicalSliceBackend('settings', directories, 'alice');
    expect(second.ok).toBe(true);
    expect(second.auditResult.blocking).toBe(false);
    expect(getCanonicalSettingsDocument(second.db, { userId: 'alice' }).payload).toEqual({ marker: 'sqlite' });
    expect(fs.readFileSync(file, 'utf8')).toBe(legacy);
    resetCanonicalBackendsForTests();
    const third = await ensureCanonicalSliceBackend('settings', directories, 'alice');
    expect(third.ok).toBe(true);
    expect(getCanonicalSettingsDocument(third.db, { userId: 'alice' }).payload).toEqual({ marker: 'sqlite' });
});
