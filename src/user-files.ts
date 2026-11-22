import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { isPathUnderParent, invalidateFirefoxCache } from './util.ts';

/**
 * Creates a route handler for serving files from a specific directory.
 * @param {(req: import('express').Request) => string} directoryFn A function that returns the directory path to serve files from
 * @returns {import('express').RequestHandler}
 */
function createRouteHandler(directoryFn: (req: Request) => string): RequestHandler {
    return async (req, res) => {
        try {
            const directory = directoryFn(req);
            const filePath = getWildcardFilePath(req);
            const fullPath = path.join(directory, filePath);
            if (!isPathUnderParent(directory, path.resolve(fullPath))) {
                return res.sendStatus(403);
            }
            const exists = fs.existsSync(fullPath);
            if (!exists) {
                return res.sendStatus(404);
            }

            invalidateFirefoxCache(filePath, req, res);
            return res.sendFile(filePath, { root: directory });
        } catch (error) {
            console.error('Failed to serve user file:', error);
            return res.sendStatus(500);
        }
    };
}

/**
 * Gets the wildcard file path captured by Express 4 or Express 5 route syntax.
 * @param {import('express').Request} req Request object
 * @returns {string} File path
 */
export function getWildcardFilePath(req: Request) {
    if (Array.isArray(req.params.filePath)) {
        return req.params.filePath.join('/');
    }

    if (typeof req.params.filePath === 'string') {
        return req.params.filePath;
    }

    const legacyCaptured = req.params[0] ?? '';
    return decodeURIComponent(legacyCaptured);
}

/**
 * Express router for serving files from the user's directories.
 */
export const router = express.Router();

/**
 * Resolves a managed-media compatibility path to a canonical blob file.
 * @param {import('express').Request} req Request object
 * @param {string} fullPath Absolute compatibility file path
 * @returns {Promise<{path: string, mediaType?: string}|null>} Blob file or null
 */
async function tryResolveManagedMediaFile(req: Request, fullPath: string) {
    try {
        const directories = req.user.directories as typeof req.user.directories & { handle?: string };
        const handle = directories.handle ?? path.basename(path.resolve(directories.root));
        const compatibilityPath = path.relative(directories.root, fullPath).split(path.sep).join(path.posix.sep);
        const { ensureCanonicalSliceBackend } = await import('./canonical-backend.ts');
        await ensureCanonicalSliceBackend('managed_media', directories, handle);
        const {
            getCanonicalManagedMediaReadState,
            resolveManagedMediaPath,
        } = await import('./endpoints/canonical-managed-media-read-service.ts');
        const state = getCanonicalManagedMediaReadState({ handle, directories });
        if (!state.ok) {
            return null;
        }
        const blob = resolveManagedMediaPath(state.db, directories, compatibilityPath);
        return blob.ok ? { path: blob.managedPath, mediaType: blob.reference.mediaType } : null;
    } catch {
        return null;
    }
}

/**
 * Route handler for managed-media domains (assets, user images, user files).
 * Canonical bytes take precedence over any compatibility projection.
 * @param {(req: import('express').Request) => string} directoryFn A function that returns the directory path to serve files from
 * @returns {import('express').RequestHandler}
 */
function createManagedMediaRouteHandler(directoryFn: (req: Request) => string): RequestHandler {
    const fileHandler = createRouteHandler(directoryFn);
    return async (req, res) => {
        try {
            const directory = directoryFn(req);
            const filePath = getWildcardFilePath(req);
            const fullPath = path.join(directory, filePath);
            if (isPathUnderParent(directory, path.resolve(fullPath))) {
                const blob = await tryResolveManagedMediaFile(req, path.resolve(fullPath));
                if (blob) {
                    res.setHeader('Content-Type', blob.mediaType ?? 'application/octet-stream');
                    invalidateFirefoxCache(filePath, req, res);
                    return res.sendFile(path.basename(blob.path), { root: path.dirname(blob.path) });
                }
            }
            return (fileHandler as (req: Request, res: Response) => unknown)(req, res);
        } catch (error) {
            console.error('Failed to serve managed media:', error);
            return res.sendStatus(500);
        }
    };
}

/**
 * Route handler for character files. Root-level `<name>.png` avatars are
 * served from the canonical avatar blob when available; subdirectory assets
 * (sprites, live2d, …) keep their file-backed path.
 * @returns {import('express').RequestHandler}
 */
function createCharacterRouteHandler(): RequestHandler {
    const fileHandler = createRouteHandler(req => req.user.directories.characters);
    return async (req, res) => {
        try {
            const filePath = getWildcardFilePath(req);
            const isRootAvatar = !filePath.includes('/') && filePath.toLowerCase().endsWith('.png');
            if (isRootAvatar) {
                const directories = req.user.directories as typeof req.user.directories & { handle?: string };
                let blob = null;
                try {
                    const handle = directories.handle ?? path.basename(path.resolve(directories.root));
                    // Lazy import keeps this barrel's eval-time surface unchanged.
                    const { getCharacterAvatarBlobContents } = await import('./canonical-avatar-blob-service.ts');
                    blob = await getCharacterAvatarBlobContents({
                        handle,
                        directories,
                        avatarFilename: filePath,
                    });
                } catch {
                    blob = null;
                }
                if (blob) {
                    res.setHeader('Content-Type', blob.mediaType ?? 'image/png');
                    invalidateFirefoxCache(filePath, req, res);
                    return res.send(blob.contents);
                }
            }
            return (fileHandler as (req: Request, res: Response) => unknown)(req, res);
        } catch (error) {
            console.error('Failed to serve character file:', error);
            return res.sendStatus(500);
        }
    };
}

router.use('/backgrounds/*filePath', createRouteHandler(req => req.user.directories.backgrounds));
router.use('/characters/*filePath', createCharacterRouteHandler());
router.use('/User%20Avatars/*filePath', createRouteHandler(req => req.user.directories.avatars));
router.use('/assets/*filePath', createManagedMediaRouteHandler(req => req.user.directories.assets));
router.use('/user/images/*filePath', createManagedMediaRouteHandler(req => req.user.directories.userImages));
router.use('/user/files/*filePath', createManagedMediaRouteHandler(req => req.user.directories.files));
