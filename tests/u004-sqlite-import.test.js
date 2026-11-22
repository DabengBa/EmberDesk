import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@jest/globals';

import { ensureCanonicalSliceBackend, resetCanonicalBackendsForTests } from '../src/canonical-backend.ts';
import { canonicalSqliteManager } from '../src/canonical-sqlite.ts';
import { buildCharacterFileSnapshotRow } from '../src/endpoints/character-file-snapshot.ts';
import { auditCanonicalShadowImport, getPersistedCanonicalAuditStatus, runCanonicalShadowImport } from '../src/canonical-sqlite-shadow-import.ts';
import { setConfigFilePath } from '../src/util.ts';

test('character shadow import preserves ids, chat statistics and persisted drift audit on retry', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u004-sqlite-'));
    const directories = Object.fromEntries(['storage', 'characters', 'chats', 'worlds'].map(name => [name, path.join(root, name)]));
    directories.root = root;
    for (const dir of Object.values(directories)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(directories.characters, 'alpha.png');
    const payload = name => JSON.stringify({ name, data: { name, extensions: { world: 'Lore' }, tags: [] }, tags: [] });
    fs.writeFileSync(file, payload('Alpha'));
    fs.mkdirSync(path.join(directories.chats, 'alpha'));
    fs.writeFileSync(path.join(directories.chats, 'alpha', 'one.jsonl'), '{"mes":"hello"}\n');
    const buildSnapshotRow = (avatar, dirs) => buildCharacterFileSnapshotRow({ avatar, directories: dirs, readCharacterData: async filePath => fs.readFileSync(filePath, 'utf8'), getCharaCardV2: value => value });
    const configPath = path.join(root, 'config.yaml');
    fs.writeFileSync(configPath, 'port: 8000\n');
    setConfigFilePath(configPath);
    try {
        // The character library can be opened before any chat request.
        const { db, featureFlags, importResult } = await ensureCanonicalSliceBackend('characters', directories, 'alice', { buildSnapshotRow });
        expect(importResult.importedCount).toBe(1);
        const row = db.prepare('SELECT id, world_name FROM characters WHERE avatar_filename = ?').get('alpha.png');
        expect(row.world_name).toBe('Lore');
        expect(db.prepare('SELECT chat_count FROM character_chat_stats WHERE character_id = ?').get(row.id).chat_count).toBe(1);
        const options = { handle: 'alice', directories, featureFlags, manager: canonicalSqliteManager, buildSnapshotRow };
        expect((await runCanonicalShadowImport(options)).unchangedCount).toBe(1);
        expect(db.prepare('SELECT id FROM characters WHERE avatar_filename = ?').get('alpha.png').id).toBe(row.id);
        fs.writeFileSync(file, payload('Changed'));
        const audit = await auditCanonicalShadowImport({ handle: 'alice', directories, db, buildSnapshotRow });
        expect(audit.blocking).toBe(true);
        expect(audit.entries[0].drift_types).toContain('payload_mismatch');
        expect(getPersistedCanonicalAuditStatus(db).blocking).toBe(true);
        expect(db.prepare('SELECT display_name FROM characters WHERE id = ?').get(row.id).display_name).toBe('Alpha');
    } finally {
        resetCanonicalBackendsForTests();
        canonicalSqliteManager.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
