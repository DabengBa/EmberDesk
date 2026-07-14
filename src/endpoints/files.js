import path from 'node:path';
import fs from 'node:fs';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileSyncAtomic } from 'write-file-atomic';

import { validateAssetFileName } from './assets.js';
import { clientRelativePath } from '../util.js';
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

router.post('/sanitize-filename', async (request, response) => {
    try {
        const fileName = String(request.body.fileName);
        if (!fileName) {
            return response.status(400).send('No fileName specified');
        }

        const sanitizedFilename = sanitize(fileName);
        return response.send({ fileName: sanitizedFilename });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/upload', async (request, response) => {
    try {
        if (!request.body.name) {
            return response.status(400).send('No upload name specified');
        }

        if (!request.body.data) {
            return response.status(400).send('No upload data specified');
        }

        // Validate filename
        const validation = validateAssetFileName(request.body.name);
        if (validation.error)
            return response.status(400).send(validation.message);

        const pathToUpload = path.join(request.user.directories.files, request.body.name);
        const url = clientRelativePath(request.user.directories.root, pathToUpload);
        const canonicalResult = await writeCanonicalManagedMedia({
            handle: getRequestHandle(request),
            directories: request.user.directories,
            compatibilityPath: url.split(path.sep).join(path.posix.sep),
            ownerType: 'attachment',
            ownerId: url,
            role: 'attachment',
            displayName: request.body.name,
            contents: Buffer.from(request.body.data, 'base64'),
        });
        if (canonicalResult.authorityCommitted && !canonicalResult.ok) {
            return response.status(500).send('File upload committed but compatibility projection failed');
        }
        if (!canonicalResult.authorityCommitted) {
            writeFileSyncAtomic(pathToUpload, request.body.data, 'base64');
            invalidateManagedMediaAudit(request, `attachment_upload:${url}`);
        }
        console.info(`Uploaded file: ${url} from ${request.user.profile.handle}`);
        return response.send({ path: url });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/delete', async (request, response) => {
    try {
        if (!request.body.path) {
            return response.status(400).send('No path specified');
        }

        const pathToDelete = path.join(request.user.directories.root, request.body.path);
        if (!pathToDelete.startsWith(request.user.directories.files)) {
            return response.status(400).send('Invalid path');
        }

        if (!fs.existsSync(pathToDelete)) {
            return response.status(404).send('File not found');
        }

        const compatibilityPath = clientRelativePath(request.user.directories.root, pathToDelete).split(path.sep).join(path.posix.sep);
        const canonicalResult = await deleteCanonicalManagedMediaReference({
            handle: getRequestHandle(request),
            directories: request.user.directories,
            compatibilityPath,
        });
        if (canonicalResult.authorityCommitted) {
            if (!canonicalResult.ok) {
                return response.status(500).send('File deletion committed but compatibility projection failed');
            }
            console.info(`Deleted file: ${request.body.path} from ${request.user.profile.handle}`);
            return response.sendStatus(200);
        }

        fs.unlinkSync(pathToDelete);
        invalidateManagedMediaAudit(request, `attachment_delete:${compatibilityPath}`);
        console.info(`Deleted file: ${request.body.path} from ${request.user.profile.handle}`);
        return response.sendStatus(200);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/verify', async (request, response) => {
    try {
        if (!Array.isArray(request.body.urls)) {
            return response.status(400).send('No URLs specified');
        }

        const verified = {};

        for (const url of request.body.urls) {
            const pathToVerify = path.join(request.user.directories.root, url);
            if (!pathToVerify.startsWith(request.user.directories.files)) {
                console.warn(`File verification: Invalid path: ${pathToVerify}`);
                continue;
            }
            const fileExists = fs.existsSync(pathToVerify);
            verified[url] = fileExists;
        }

        return response.send(verified);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});
