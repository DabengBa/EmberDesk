import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@jest/globals';
import { CANONICAL_SQLITE_MIGRATIONS } from '../src/canonical-sqlite-migrations.js';
import {
    assertCanonicalCharacterCardCurrent, clearCanonicalCharacterWorldBinding,
    getCanonicalCharacter, listCanonicalCharacters, markCanonicalCharacterDeleted,
    normalizeCanonicalCharacterPayload, recordProjectionRepair, resolveProjectionRepair,
    scanCanonicalCharacterWorldBindings, upsertCanonicalCharacter,
} from '../src/endpoints/character-store.ts';

test('canonical storage retains stats, identity, world binding and repair semantics', () => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec(CANONICAL_SQLITE_MIGRATIONS[0].sql);
        const card = { name: 'Alice', world: 'Book', data: { extensions: { world: 'Book' } }, chat_size: 999 };
        const clone = normalizeCanonicalCharacterPayload(card);
        clone.data.extensions.world = 'other';
        expect(card.data.extensions.world).toBe('Book');
        upsertCanonicalCharacter(db, { id: 'old', avatarFilename: 'Alice.png', fullPayload: card, shallowPayload: card, createdAtMs: 1, updatedAtMs: 2 });
        db.prepare('INSERT INTO character_chat_stats (character_id, chat_count, chat_size_bytes, date_last_chat_ms, stats_updated_at_ms) VALUES (?, ?, ?, ?, ?)').run('old', 1, 123, 456, 2);
        expect(getCanonicalCharacter(db, 'Alice.png')).toMatchObject({ canonical_id: 'old', avatar: 'Alice.png', chat_size: 123, date_last_chat: 456 });
        expect(listCanonicalCharacters(db, { useShallowPayload: true, includeChatStats: false })[0]).toMatchObject({ chat_size: 0, date_last_chat: 0 });
        expect(scanCanonicalCharacterWorldBindings(db).avatarToWorldName.get('Alice.png')).toBe('Book');
        expect(clearCanonicalCharacterWorldBinding(db, { avatarFilename: 'Alice.png', nowMs: 3 })).toBe(true);
        expect(getCanonicalCharacter(db, 'Alice.png')).toMatchObject({ world: '', data: { extensions: { world: '' } } });
        expect(clearCanonicalCharacterWorldBinding(db, { avatarFilename: 'missing.png' })).toBe(false);
        expect(() => assertCanonicalCharacterCardCurrent(db, 'Alice.png', 'stale')).toThrow(expect.objectContaining({ message: 'character_card_conflict', code: 'CHARACTER_CARD_CONFLICT' }));
        recordProjectionRepair(db, { repairKey: 'r', repairType: 'card', reason: 'failure', details: { nested: true }, nowMs: 4 });
        resolveProjectionRepair(db, { repairKey: 'r', resolvedAtMs: 5 });
        recordProjectionRepair(db, { repairKey: 'r', repairType: 'card', reason: 'again', nowMs: 6 });
        expect(db.prepare('SELECT created_at_ms, updated_at_ms, last_attempt_at_ms, resolved_at_ms FROM projection_repairs WHERE repair_key = ?').get('r')).toEqual({ created_at_ms: 4, updated_at_ms: 6, last_attempt_at_ms: 5, resolved_at_ms: null });
        markCanonicalCharacterDeleted(db, { avatarFilename: 'Alice.png', deletedAtMs: 7 });
        upsertCanonicalCharacter(db, { id: 'new', avatarFilename: 'Alice.png', fullPayload: card, shallowPayload: card, createdAtMs: 8, updatedAtMs: 8 });
        expect(getCanonicalCharacter(db, 'Alice.png')).toMatchObject({ canonical_id: 'new', chat_size: 0, date_last_chat: 0 });
        expect(db.prepare('SELECT COUNT(*) AS count FROM character_chat_stats').get().count).toBe(0);
        db.prepare('UPDATE characters SET card_json = ? WHERE avatar_filename = ?').run('{', 'Alice.png');
        expect(() => getCanonicalCharacter(db, 'Alice.png')).toThrow('Canonical character row has invalid card_json:');
    } finally {
        db.close();
    }
});
