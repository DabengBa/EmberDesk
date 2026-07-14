import path from 'node:path';
import fs from 'node:fs';

import express from 'express';
import sanitize from 'sanitize-filename';
import { Jimp } from '../jimp.js';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getImages, tryParse } from '../util.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';
import { applyAvatarCropResize } from './characters.js';
import { areThumbnailsEnabled, generateThumbnail, invalidateThumbnail } from './thumbnails.js';
import cacheBuster from '../middleware/cacheBuster.js';
import {
    deleteCanonicalManagedMediaReference,
    invalidateCanonicalManagedMediaAudit,
    writeCanonicalManagedMedia,
} from './canonical-managed-media-write-service.js';

export const router = express.Router();

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function invalidateManagedMediaAudit(request, reason) {
    invalidateCanonicalManagedMediaAudit({
        handle: getRequestHandle(request),
        directories: request.user.directories,
        reason,
    });
}

/**
 * Starts thumbnail pregeneration without blocking the caller.
 * @param {import('../users.js').UserDirectoryList} directories
 * @param {'persona'} type
 * @param {string} file
 */
function startThumbnailPregeneration(directories, type, file) {
    if (!areThumbnailsEnabled()) {
        return;
    }

    void generateThumbnail(directories, type, file, true, null).catch(error => {
        console.warn(`Thumbnail pregeneration skipped for ${type}/${file}:`, error);
    });
}

router.post('/get', function (request, response) {
    const images = getImages(request.user.directories.avatars);
    response.send(images);
});

router.post('/delete', getFileNameValidationFunction('avatar'), async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    if (request.body.avatar !== sanitize(request.body.avatar)) {
        console.error('Malicious avatar name prevented');
        return response.sendStatus(403);
    }

    const fileName = path.join(request.user.directories.avatars, sanitize(request.body.avatar));

    if (fs.existsSync(fileName)) {
        const avatar = sanitize(request.body.avatar);
        const compatibilityPath = path.posix.join('User Avatars', avatar);
        const canonicalResult = await deleteCanonicalManagedMediaReference({
            handle: getRequestHandle(request),
            directories: request.user.directories,
            compatibilityPath,
        });
        if (canonicalResult.authorityCommitted) {
            if (!canonicalResult.ok) {
                return response.status(500).send({ error: 'Avatar deletion committed but compatibility projection failed' });
            }
            invalidateThumbnail(request.user.directories, 'persona', avatar);
            return response.send({ result: 'ok' });
        }
        fs.unlinkSync(fileName);
        invalidateManagedMediaAudit(request, `avatar_delete:${avatar}`);
        invalidateThumbnail(request.user.directories, 'persona', avatar);
        return response.send({ result: 'ok' });
    }

    return response.sendStatus(404);
});

router.post('/upload', getFileNameValidationFunction('overwrite_name'), async (request, response) => {
    if (!request.file) return response.sendStatus(400);

    try {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        const crop = tryParse(request.query.crop);
        const rawImg = await Jimp.read(pathToUpload);
        const image = await applyAvatarCropResize(rawImg, crop);

        // Remove previous thumbnail and bust cache if overwriting
        if (request.body.overwrite_name) {
            invalidateThumbnail(request.user.directories, 'persona', sanitize(request.body.overwrite_name));
            cacheBuster.bust(request, response);
        }

        const filename = sanitize(request.body.overwrite_name || `${Date.now()}.png`);
        const pathToNewFile = path.join(request.user.directories.avatars, filename);
        const compatibilityPath = path.posix.join('User Avatars', filename);
        const canonicalResult = await writeCanonicalManagedMedia({
            handle: getRequestHandle(request),
            directories: request.user.directories,
            compatibilityPath,
            ownerType: 'persona_avatar',
            ownerId: compatibilityPath,
            role: 'persona_avatar',
            displayName: filename,
            contents: image,
        });
        if (canonicalResult.authorityCommitted && !canonicalResult.ok) {
            fs.unlinkSync(pathToUpload);
            return response.status(500).send('Avatar upload committed but compatibility projection failed');
        }
        if (!canonicalResult.authorityCommitted) {
            writeFileAtomicSync(pathToNewFile, image);
            invalidateManagedMediaAudit(request, `avatar_upload:${filename}`);
        }
        startThumbnailPregeneration(request.user.directories, 'persona', filename);
        fs.unlinkSync(pathToUpload);
        return response.send({ path: filename });
    } catch (err) {
        console.error('Error uploading user avatar:', err);
        return response.status(400).send('Is not a valid image');
    }
});
