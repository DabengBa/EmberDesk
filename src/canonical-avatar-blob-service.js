import fs from 'node:fs';
import path from 'node:path';

import { extractImageData } from './character-card-parser.js';
import { ensureCanonicalSliceBackend } from './canonical-backend.js';
import {
    CHARACTER_AVATAR_OWNER_TYPE,
    CHARACTER_AVATAR_ROLE,
    getCharacterAvatarBlobPath,
    listCharacterRowsMissingAvatarBlob,
} from './canonical-avatar-blobs.js';
import { writeCanonicalManagedMedia } from './endpoints/canonical-managed-media-write-service.js';
import {
    getCanonicalManagedMediaReadState,
    readManagedMediaContent,
} from './endpoints/canonical-managed-media-read-service.js';

/**
 * Registers the pure image bytes of a character card PNG as a managed-media
 * blob under a virtual compatibility path (no file projection). Idempotent:
 * identical image bytes resolve to the same content hash and reference.
 * @returns {Promise<{ok: boolean, reason?: string, reference?: object}>}
 */
export async function recordCharacterAvatarBlob({
    handle,
    directories,
    avatarFilename,
    contents,
    nowMs = Date.now(),
} = {}) {
    const imageBytes = extractImageData(contents);
    // The managed_media slice must have audited once before its write gate opens.
    await ensureCanonicalSliceBackend('managed_media', directories, handle);
    return writeCanonicalManagedMedia({
        handle,
        directories,
        compatibilityPath: getCharacterAvatarBlobPath(avatarFilename),
        ownerType: CHARACTER_AVATAR_OWNER_TYPE,
        ownerId: avatarFilename,
        role: CHARACTER_AVATAR_ROLE,
        displayName: avatarFilename,
        contents: imageBytes,
        mediaType: 'image/png',
        projection: 'off',
        metadata: { source: 'character_card_image' },
        nowMs,
    });
}

/**
 * Resolves the avatar blob bytes for a character when canonical managed-media
 * reads are healthy. Returns null when the slice is disabled, the audit is
 * not clean, or no avatar blob exists — callers fall back to the PNG file.
 * @returns {Promise<{contents: Buffer, contentHash: string, mediaType: string, reference: object}|null>}
 */
export async function getCharacterAvatarBlobContents({ handle, directories, avatarFilename } = {}) {
    try {
        await ensureCanonicalSliceBackend('managed_media', directories, handle);
        const state = getCanonicalManagedMediaReadState({ handle, directories });
        if (!state.ok) {
            return null;
        }
        const read = readManagedMediaContent(state.db, directories, getCharacterAvatarBlobPath(avatarFilename));
        return read.ok ? read : null;
    } catch {
        return null;
    }
}

/**
 * Idempotent backfill: registers avatar blobs for every live character row
 * whose PNG still exists on disk but has no live avatar reference. Safe to
 * run on every backend init — existing references short-circuit the scan.
 * @returns {Promise<{checked: number, backfilled: number, missingFile: number, errors: string[]}>}
 */
export async function backfillCharacterAvatarBlobs({
    handle,
    directories,
    db,
    nowMs = Date.now(),
} = {}) {
    const result = { checked: 0, backfilled: 0, missingFile: 0, errors: [] };
    const rows = listCharacterRowsMissingAvatarBlob(db);
    if (rows.length === 0) {
        return result;
    }

    const mediaInit = await ensureCanonicalSliceBackend('managed_media', directories, handle);
    if (!mediaInit?.ok) {
        result.errors.push(`managed_media_unavailable:${mediaInit?.reason ?? 'unknown'}`);
        return result;
    }

    for (const row of rows) {
        const avatarFilename = String(row.avatar_filename ?? '');
        if (!avatarFilename) {
            continue;
        }
        result.checked += 1;
        const filePath = path.join(directories.characters, avatarFilename);
        if (!fs.existsSync(filePath)) {
            result.missingFile += 1;
            continue;
        }
        try {
            const write = await recordCharacterAvatarBlob({
                handle,
                directories,
                avatarFilename,
                contents: fs.readFileSync(filePath),
                nowMs,
            });
            if (write?.ok) {
                result.backfilled += 1;
            } else {
                result.errors.push(`${avatarFilename}:${write?.reason ?? 'write_blocked'}`);
            }
        } catch (error) {
            result.errors.push(`${avatarFilename}:${String(error?.message ?? error ?? '')}`);
        }
    }
    return result;
}
