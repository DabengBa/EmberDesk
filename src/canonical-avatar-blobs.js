import { getCanonicalManagedMediaReference } from './endpoints/canonical-managed-media-store.js';

export const CHARACTER_AVATAR_OWNER_TYPE = 'character';
export const CHARACTER_AVATAR_ROLE = 'avatar';
export const CHARACTER_AVATAR_VIRTUAL_ROOT = 'character-avatars';

/**
 * Virtual compatibility path for a character's avatar blob. The path is a
 * stable ledger/reference key only — avatar blobs never project a file there.
 * @param {string} avatarFilename Character avatar filename (e.g. `x.png`)
 * @returns {string} Virtual compatibility path
 */
export function getCharacterAvatarBlobPath(avatarFilename) {
    return `${CHARACTER_AVATAR_VIRTUAL_ROOT}/${avatarFilename}`;
}

export function isVirtualAvatarReference(reference) {
    return reference?.ownerType === CHARACTER_AVATAR_OWNER_TYPE
        && reference?.role === CHARACTER_AVATAR_ROLE
        && String(reference?.compatibilityPath ?? '').startsWith(`${CHARACTER_AVATAR_VIRTUAL_ROOT}/`);
}

export function getCharacterAvatarBlobReference(db, avatarFilename) {
    const reference = getCanonicalManagedMediaReference(db, getCharacterAvatarBlobPath(avatarFilename));
    return reference?.deletedAtMs == null ? reference : null;
}

const MISSING_AVATAR_REF_FILTER = `
    SELECT 1 FROM media_references mr
    WHERE mr.owner_type = ?
      AND mr.owner_id = c.avatar_filename
      AND mr.role = ?
      AND mr.deleted_at_ms IS NULL
`;

export function listCharacterRowsMissingAvatarBlob(db) {
    try {
        return db.prepare(`
            SELECT c.avatar_filename
            FROM characters c
            WHERE c.deleted_at_ms IS NULL
              AND NOT EXISTS (${MISSING_AVATAR_REF_FILTER})
        `).all(CHARACTER_AVATAR_OWNER_TYPE, CHARACTER_AVATAR_ROLE);
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table')) {
            return [];
        }
        throw error;
    }
}

/**
 * Counts live character rows that do not have a live avatar blob reference.
 * Informational — the count never blocks the audit.
 * @returns {number}
 */
export function countMissingCharacterAvatarBlobs(db) {
    try {
        const row = db.prepare(`
            SELECT COUNT(*) AS missing
            FROM characters c
            WHERE c.deleted_at_ms IS NULL
              AND NOT EXISTS (${MISSING_AVATAR_REF_FILTER})
        `).get(CHARACTER_AVATAR_OWNER_TYPE, CHARACTER_AVATAR_ROLE);
        return Number(row?.missing ?? 0);
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table')) {
            return 0;
        }
        throw error;
    }
}

/**
 * Migrates the avatar blob reference when a character is renamed. The blob
 * bytes are untouched — only the reference's path/owner follow the new name.
 * Call inside the canonical rename transaction.
 */
export function renameCharacterAvatarBlobReference(db, oldAvatarFilename, newAvatarFilename, { nowMs = Date.now() } = {}) {
    if (!oldAvatarFilename || !newAvatarFilename || oldAvatarFilename === newAvatarFilename) {
        return;
    }
    // A tombstoned reference may already occupy the target path — reclaim it so
    // the UNIQUE constraint does not block the rename migration.
    db.prepare(`
        DELETE FROM media_references
        WHERE compatibility_path = ? AND deleted_at_ms IS NOT NULL
    `).run(getCharacterAvatarBlobPath(newAvatarFilename));
    db.prepare(`
        UPDATE media_references
        SET compatibility_path = ?, owner_id = ?, display_name = ?, updated_at_ms = ?
        WHERE compatibility_path = ? AND deleted_at_ms IS NULL
    `).run(
        getCharacterAvatarBlobPath(newAvatarFilename),
        newAvatarFilename,
        newAvatarFilename,
        Number(nowMs),
        getCharacterAvatarBlobPath(oldAvatarFilename),
    );
}

/**
 * Soft-deletes the avatar blob reference when a character is deleted and
 * tombstones the blob if no other live reference keeps it. Call inside the
 * canonical delete transaction; blob bytes are reclaimed by GC later.
 */
export function retireCharacterAvatarBlobReference(db, avatarFilename, { nowMs = Date.now() } = {}) {
    if (!avatarFilename) {
        return;
    }
    const reference = getCharacterAvatarBlobReference(db, avatarFilename);
    if (!reference) {
        return;
    }
    db.prepare(`
        UPDATE media_references
        SET deleted_at_ms = ?, updated_at_ms = ?
        WHERE compatibility_path = ? AND deleted_at_ms IS NULL
    `).run(Number(nowMs), Number(nowMs), reference.compatibilityPath);

    const stillReferenced = db.prepare(`
        SELECT 1 FROM media_references
        WHERE blob_id = ? AND deleted_at_ms IS NULL
        LIMIT 1
    `).get(reference.blobId);
    if (!stillReferenced) {
        db.prepare(`
            UPDATE managed_blobs
            SET lifecycle_state = 'tombstoned', deleted_at_ms = ?, updated_at_ms = ?
            WHERE id = ?
        `).run(Number(nowMs), Number(nowMs), reference.blobId);
    }
}
