import { expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import { scanCharacterDeleteWorldReferences } from '../src/endpoints/character-delete-preflight-routes.ts';

test.each(['legacy', 'current'])('deleted cards cease protecting their %s primary and auxiliary books, but surviving references still protect shared books', (format) => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec(`CREATE TABLE characters(avatar_filename TEXT, display_name TEXT, world_name TEXT, deleted_at_ms INTEGER);
            INSERT INTO characters VALUES ('one.png', 'One', 'Primary', NULL), ('two.png', 'Two', 'Shared', NULL);
            CREATE TABLE settings_documents(user_id TEXT, payload_json TEXT);
            CREATE TABLE chat_sessions(header_payload_json TEXT);
            INSERT INTO chat_sessions VALUES ('{"chat_metadata":{"world_info":"Chat"}}');`);
        const worldInfo = { world_info: { globalSelect: ['Global'], charLore: [{ name: 'one', extraBooks: ['Extra', 'Shared', 'Global', 'Chat'] }] } };
        const settings = format === 'current' ? { world_info: { globalSelect: ['Stale'] }, world_info_settings: worldInfo } : worldInfo;
        db.prepare('INSERT INTO settings_documents VALUES (?, ?)').run('user', JSON.stringify(settings));
        const before = scanCharacterDeleteWorldReferences(db, 'user');
        expect(before.worldsByAvatar.get('one.png')).toEqual(new Set(['Primary', 'Extra', 'Shared', 'Global', 'Chat']));
        db.exec("UPDATE characters SET deleted_at_ms = 1 WHERE avatar_filename = 'one.png'");
        const after = scanCharacterDeleteWorldReferences(db, 'user');
        expect(after.worldsByAvatar.has('one.png')).toBe(false);
        expect([...before.worldsByAvatar.get('one.png')].filter(name => !after.boundCharacters.has(name) && !after.otherReferences.has(name))).toEqual(['Primary', 'Extra']);
    } finally {
        db.close();
    }
});
