function parseRequiredJson(value, fieldName) {
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`Canonical character row has invalid ${fieldName}: ${String(error?.message ?? error ?? '')}`);
    }
}

function normalizeWorldName(fullPayload) {
    return String(fullPayload?.data?.extensions?.world ?? fullPayload?.world ?? '').trim();
}

function getDisplayName(fullPayload, avatarFilename) {
    return String(fullPayload?.name ?? fullPayload?.data?.name ?? avatarFilename);
}

function getInternalName(avatarFilename) {
    return avatarFilename.replace(/\.png$/i, '');
}

function cloneCanonicalPayload(payload) {
    return structuredClone(payload);
}

export function normalizeCanonicalCharacterPayload(payload) {
    return cloneCanonicalPayload(payload);
}

function applyCanonicalChatStats(payload, row) {
    payload.chat_size = Number(row.chat_size_bytes ?? 0);
    payload.date_last_chat = Number(row.date_last_chat_ms ?? 0);
    return payload;
}

function clearCanonicalChatStats(payload) {
    payload.chat_size = 0;
    payload.date_last_chat = 0;
    return payload;
}

function mapCanonicalRowToPayload(row, useShallowPayload, options = {}) {
    const rawPayload = useShallowPayload
        ? parseRequiredJson(row.shallow_json, 'shallow_json')
        : parseRequiredJson(row.card_json, 'card_json');
    const payload = cloneCanonicalPayload(rawPayload);

    payload.avatar = row.avatar_filename;
    return options.includeChatStats === false
        ? clearCanonicalChatStats(payload)
        : applyCanonicalChatStats(payload, row);
}

export function listCanonicalCharacters(db, { useShallowPayload, includeChatStats = true }) {
    const rows = db.prepare(`
        SELECT
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

    return rows.map(row => mapCanonicalRowToPayload(row, useShallowPayload, { includeChatStats }));
}

export function getCanonicalCharacter(db, avatarFilename, { includeChatStats = true } = {}) {
    const row = db.prepare(`
        SELECT
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

    return mapCanonicalRowToPayload(row, false, { includeChatStats });
}

export function upsertCanonicalCharacter(db, {
    id,
    avatarFilename,
    fullPayload,
    shallowPayload,
    createdAtMs,
    updatedAtMs,
}) {
    const normalizedFullPayload = normalizeCanonicalCharacterPayload(fullPayload);
    const normalizedShallowPayload = normalizeCanonicalCharacterPayload(shallowPayload);

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

export function renameCanonicalCharacter(db, {
    oldAvatarFilename,
    newAvatarFilename,
    fullPayload,
    shallowPayload,
    updatedAtMs,
}) {
    const normalizedFullPayload = normalizeCanonicalCharacterPayload(fullPayload);
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

export function markCanonicalCharacterDeleted(db, {
    avatarFilename,
    deletedAtMs,
}) {
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

export function recordProjectionRepair(db, {
    repairKey,
    repairType,
    characterId = null,
    avatarFilename = '',
    reason,
    details = {},
    nowMs = Date.now(),
}) {
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

export function resolveProjectionRepair(db, {
    repairKey,
    resolvedAtMs = Date.now(),
}) {
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
