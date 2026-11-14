import type { DatabaseSync, SQLInputValue, SQLOutputValue, StatementResultingChanges } from 'node:sqlite';

// Stored JSON is historically accepted without schema validation. This shape
// describes only properties accessed here; it is not a new input gate.
type CharacterPayload = {
    name?: unknown;
    world?: unknown;
    data?: { name?: unknown; extensions?: { world?: unknown } };
    avatar?: SQLOutputValue;
    canonical_id?: SQLOutputValue;
    chat_size?: number;
    date_last_chat?: number;
};
type CharacterRow = {
    id: SQLOutputValue;
    avatar_filename: SQLOutputValue;
    card_json: SQLOutputValue;
    shallow_json: SQLOutputValue;
    chat_size_bytes: SQLOutputValue;
    date_last_chat_ms: SQLOutputValue;
};
type CharacterWrite = {
    fullPayload: object;
    shallowPayload: object;
    updatedAtMs?: unknown;
};

function parseRequiredJson(value: SQLOutputValue, fieldName: string): CharacterPayload {
    try {
        return JSON.parse(value as string) as CharacterPayload;
    } catch (error) {
        throw new Error(`Canonical character row has invalid ${fieldName}: ${String((error as { message?: unknown } | null)?.message ?? error ?? '')}`);
    }
}

function normalizeWorldName(fullPayload: CharacterPayload): string {
    return String(fullPayload?.data?.extensions?.world ?? fullPayload?.world ?? '').trim();
}

function getDisplayName(fullPayload: CharacterPayload, avatarFilename: string): string {
    return String(fullPayload?.name ?? fullPayload?.data?.name ?? avatarFilename);
}

function getInternalName(avatarFilename: string): string {
    return avatarFilename.replace(/\.png$/i, '');
}

function cloneCanonicalPayload<T>(payload: T): T {
    return structuredClone(payload);
}

export function normalizeCanonicalCharacterPayload<T>(payload: T): T {
    return cloneCanonicalPayload(payload);
}

function applyCanonicalChatStats(payload: CharacterPayload, row: CharacterRow): CharacterPayload {
    payload.chat_size = Number(row.chat_size_bytes ?? 0);
    payload.date_last_chat = Number(row.date_last_chat_ms ?? 0);
    return payload;
}

function clearCanonicalChatStats(payload: CharacterPayload): CharacterPayload {
    payload.chat_size = 0;
    payload.date_last_chat = 0;
    return payload;
}

function mapCanonicalRowToPayload(row: CharacterRow, useShallowPayload: boolean, options: { includeChatStats?: boolean } = {}): CharacterPayload {
    const rawPayload = useShallowPayload
        ? parseRequiredJson(row.shallow_json, 'shallow_json')
        : parseRequiredJson(row.card_json, 'card_json');
    const payload = cloneCanonicalPayload(rawPayload);

    payload.avatar = row.avatar_filename;
    payload.canonical_id = row.id;
    return options.includeChatStats === false
        ? clearCanonicalChatStats(payload)
        : applyCanonicalChatStats(payload, row);
}

export function listCanonicalCharacters(db: DatabaseSync, { useShallowPayload, includeChatStats = true }: { useShallowPayload: boolean; includeChatStats?: boolean }): CharacterPayload[] {
    const rows = db.prepare(`
        SELECT
            characters.id,
            characters.avatar_filename,
            characters.card_json,
            characters.shallow_json,
            character_chat_stats.chat_size_bytes,
            character_chat_stats.date_last_chat_ms
        FROM characters
        LEFT JOIN character_chat_stats
            ON character_chat_stats.character_id = characters.id
        WHERE characters.deleted_at_ms IS NULL
        ORDER BY characters.avatar_filename COLLATE NOCASE ASC
    `).all();

    return rows.map(row => mapCanonicalRowToPayload(row as CharacterRow, useShallowPayload, { includeChatStats }));
}

export function getCanonicalCharacter(db: DatabaseSync, avatarFilename: string, { includeChatStats = true }: { includeChatStats?: boolean } = {}): CharacterPayload | null {
    const row = db.prepare(`
        SELECT
            characters.id,
            characters.avatar_filename,
            characters.card_json,
            characters.shallow_json,
            character_chat_stats.chat_size_bytes,
            character_chat_stats.date_last_chat_ms
        FROM characters
        LEFT JOIN character_chat_stats
            ON character_chat_stats.character_id = characters.id
        WHERE characters.avatar_filename = ?
            AND characters.deleted_at_ms IS NULL
    `).get(avatarFilename);

    if (!row) {
        return null;
    }

    return mapCanonicalRowToPayload(row as CharacterRow, false, { includeChatStats });
}

/**
 * Lists live characters bound to a World Info book by name.
 * @returns {Array<{ avatar: string, name: string }>}
 */
export function listCanonicalCharactersBoundToWorld(db: DatabaseSync, worldName: unknown): Array<{ avatar: string; name: string }> {
    return db.prepare(`
        SELECT avatar_filename, display_name
        FROM characters
        WHERE world_name = ?
            AND deleted_at_ms IS NULL
        ORDER BY avatar_filename COLLATE NOCASE ASC
    `).all(String(worldName ?? '')).map(row => ({
        avatar: String(row.avatar_filename),
        name: String(row.display_name ?? row.avatar_filename),
    }));
}

/**
 * Returns the canonical world-binding maps matching the file-scan contract:
 * characters grouped by bound world plus a direct avatar lookup.
 */
export function scanCanonicalCharacterWorldBindings(db: DatabaseSync): { worldNameToCharacters: Map<string, Array<{ avatar: string; name: string }>>; avatarToWorldName: Map<string, string> } {
    const rows = db.prepare(`
        SELECT avatar_filename, display_name, world_name
        FROM characters
        WHERE world_name != ''
            AND deleted_at_ms IS NULL
        ORDER BY avatar_filename COLLATE NOCASE ASC
    `).all();

    const worldNameToCharacters = new Map<string, Array<{ avatar: string; name: string }>>();
    const avatarToWorldName = new Map<string, string>();
    for (const row of rows) {
        const avatar = String(row.avatar_filename);
        const worldName = String(row.world_name);
        avatarToWorldName.set(avatar, worldName);
        if (!worldNameToCharacters.has(worldName)) {
            worldNameToCharacters.set(worldName, []);
        }
        (worldNameToCharacters.get(worldName) as Array<{ avatar: string; name: string }>).push({
            avatar,
            name: String(row.display_name ?? avatar),
        });
    }

    return { worldNameToCharacters, avatarToWorldName };
}

/**
 * Clears the World Info binding on one canonical character by rewriting the
 * stored card payloads (world_name is derived from card_json, so both must
 * move together).
 */
export function clearCanonicalCharacterWorldBinding(db: DatabaseSync, { avatarFilename, nowMs = Date.now() }: { avatarFilename: string; nowMs?: number }): boolean {
    const row = db.prepare(`
        SELECT id, card_json, shallow_json, created_at_ms
        FROM characters
        WHERE avatar_filename = ?
            AND deleted_at_ms IS NULL
    `).get(String(avatarFilename));
    if (!row) {
        return false;
    }
    const clearWorld = (payload: CharacterPayload): CharacterPayload => {
        if (payload?.data?.extensions && typeof payload.data.extensions === 'object') {
            payload.data.extensions.world = '';
        }
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'world')) {
            payload.world = '';
        }
        return payload;
    };
    const fullPayload = clearWorld(parseRequiredJson(row.card_json, 'card_json'));
    const shallowPayload = row.shallow_json == null
        ? fullPayload
        : clearWorld(parseRequiredJson(row.shallow_json, 'shallow_json'));
    upsertCanonicalCharacter(db, {
        id: row.id as SQLInputValue,
        avatarFilename: String(avatarFilename),
        fullPayload,
        shallowPayload,
        createdAtMs: row.created_at_ms,
        updatedAtMs: nowMs,
    });
    return true;
}

export function assertCanonicalCharacterCardCurrent(db: DatabaseSync, avatarFilename: string, expectedCardJson: string): void {
    const row = db.prepare('SELECT card_json FROM characters WHERE avatar_filename = ? AND deleted_at_ms IS NULL').get(avatarFilename);
    if (!row || row.card_json !== expectedCardJson) {
        const error: Error & { code?: string } = new Error('character_card_conflict');
        error.code = 'CHARACTER_CARD_CONFLICT';
        throw error;
    }
}

export function upsertCanonicalCharacter(db: DatabaseSync, {
    id,
    avatarFilename,
    fullPayload,
    shallowPayload,
    createdAtMs,
    updatedAtMs,
}: CharacterWrite & { id: SQLInputValue; avatarFilename: string; createdAtMs?: unknown }): StatementResultingChanges {
    const normalizedFullPayload = normalizeCanonicalCharacterPayload(fullPayload) as CharacterPayload;
    const normalizedShallowPayload = normalizeCanonicalCharacterPayload(shallowPayload);

    // A soft-deleted avatar may be recreated, but its old canonical identity
    // must not be revived. Drop stats before changing the referenced primary
    // key; no other canonical table uses characters.id as a foreign key.
    const deletedExisting = db.prepare(`
        SELECT id FROM characters
        WHERE avatar_filename = ? AND deleted_at_ms IS NOT NULL
    `).get(avatarFilename);
    if (deletedExisting && deletedExisting.id !== id) {
        db.prepare('DELETE FROM character_chat_stats WHERE character_id = ?').run(deletedExisting.id);
        db.prepare('UPDATE characters SET id = ? WHERE id = ? AND deleted_at_ms IS NOT NULL').run(id, deletedExisting.id);
    }

    return db.prepare(`
        INSERT INTO characters (
            id,
            avatar_filename,
            internal_name,
            display_name,
            card_json,
            shallow_json,
            world_name,
            created_at_ms,
            updated_at_ms,
            deleted_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(avatar_filename) DO UPDATE SET
            internal_name = excluded.internal_name,
            display_name = excluded.display_name,
            card_json = excluded.card_json,
            shallow_json = excluded.shallow_json,
            world_name = excluded.world_name,
            created_at_ms = excluded.created_at_ms,
            updated_at_ms = excluded.updated_at_ms,
            deleted_at_ms = NULL
    `).run(
        id,
        avatarFilename,
        getInternalName(avatarFilename),
        getDisplayName(normalizedFullPayload, avatarFilename),
        JSON.stringify(normalizedFullPayload),
        JSON.stringify(normalizedShallowPayload),
        normalizeWorldName(normalizedFullPayload),
        Number(createdAtMs ?? 0),
        Number(updatedAtMs ?? 0),
    );
}

export function renameCanonicalCharacter(db: DatabaseSync, {
    oldAvatarFilename,
    newAvatarFilename,
    fullPayload,
    shallowPayload,
    updatedAtMs,
}: CharacterWrite & { oldAvatarFilename: string; newAvatarFilename: string }): StatementResultingChanges {
    const normalizedFullPayload = normalizeCanonicalCharacterPayload(fullPayload) as CharacterPayload;
    const normalizedShallowPayload = normalizeCanonicalCharacterPayload(shallowPayload);

    return db.prepare(`
        UPDATE characters
        SET avatar_filename = ?,
            internal_name = ?,
            display_name = ?,
            card_json = ?,
            shallow_json = ?,
            world_name = ?,
            updated_at_ms = ?,
            deleted_at_ms = NULL
        WHERE avatar_filename = ?
            AND deleted_at_ms IS NULL
    `).run(
        newAvatarFilename,
        getInternalName(newAvatarFilename),
        getDisplayName(normalizedFullPayload, newAvatarFilename),
        JSON.stringify(normalizedFullPayload),
        JSON.stringify(normalizedShallowPayload),
        normalizeWorldName(normalizedFullPayload),
        Number(updatedAtMs ?? 0),
        oldAvatarFilename,
    );
}

export function markCanonicalCharacterDeleted(db: DatabaseSync, {
    avatarFilename,
    deletedAtMs,
}: { avatarFilename: string; deletedAtMs?: unknown }): StatementResultingChanges {
    return db.prepare(`
        UPDATE characters
        SET deleted_at_ms = ?,
            updated_at_ms = ?
        WHERE avatar_filename = ?
            AND deleted_at_ms IS NULL
    `).run(
        Number(deletedAtMs ?? 0),
        Number(deletedAtMs ?? 0),
        avatarFilename,
    );
}

export function recordProjectionRepair(db: DatabaseSync, {
    repairKey,
    repairType,
    characterId = null,
    avatarFilename = '',
    reason,
    details = {},
    nowMs = Date.now(),
}: { repairKey: string; repairType: string; characterId?: SQLInputValue; avatarFilename?: string; reason: string; details?: object; nowMs?: number }): void {
    db.prepare(`
        INSERT INTO projection_repairs (
            repair_key,
            repair_type,
            character_id,
            avatar_filename,
            reason,
            details_json,
            created_at_ms,
            updated_at_ms,
            last_attempt_at_ms,
            resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(repair_key) DO UPDATE SET
            repair_type = excluded.repair_type,
            character_id = excluded.character_id,
            avatar_filename = excluded.avatar_filename,
            reason = excluded.reason,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            resolved_at_ms = NULL
    `).run(
        repairKey,
        repairType,
        characterId,
        avatarFilename,
        reason,
        JSON.stringify(details),
        Number(nowMs),
        Number(nowMs),
    );
}

export function resolveProjectionRepair(db: DatabaseSync, {
    repairKey,
    resolvedAtMs = Date.now(),
}: { repairKey: string; resolvedAtMs?: number }): StatementResultingChanges {
    return db.prepare(`
        UPDATE projection_repairs
        SET resolved_at_ms = ?,
            updated_at_ms = ?,
            last_attempt_at_ms = ?
        WHERE repair_key = ?
    `).run(
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        repairKey,
    );
}
