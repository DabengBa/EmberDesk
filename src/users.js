// Re-export all symbols from the split modules for backward compatibility.
// Importers of './users.js' continue to work unchanged.
export {
    KEY_PREFIX,
    getEnableAccounts,
    toKey,
    toAvatarKey,
    initUserStorage,
    getAllUserHandles,
    getAllEnabledUsers,
    needsSetup,
    getAccountVersion,
} from './user-storage.js';

export {
    getUserDirectories,
    getUserDirectoriesList,
    ensurePublicDirectoriesExist,
    cleanUploads,
    getUserAvatar,
} from './user-directories.js';

export {
    migrateUserData,
    migrateSystemPrompts,
    migratePublicOverrides,
} from './user-migrations.js';

export {
    getCookieSecret,
    getPasswordSalt,
    getCookieSessionName,
    getSessionCookieAge,
    getPasswordHash,
    getCsrfSecret,
    shouldRedirectToLogin,
    tryAutoLogin,
} from './user-auth.js';

// Native Node Modules
import path from 'node:path';
import fs from 'node:fs';

// Express and other dependencies
import storage from 'node-persist';
import express from 'express';
import archiver from 'archiver';

import { DEFAULT_USER, PUBLIC_DIRECTORIES } from './constants.js';
import { getConfigValue, color, generateTimestamp, isPathUnderParent, invalidateFirefoxCache } from './util.js';
import { allowKeysExposure, SECRETS_FILE } from './endpoints/secrets.js';
import { extensionsEnabledFeatureGuard } from './endpoints/extensions.js';
import { serverDirectory } from './server-directory.js';
import { getEnableAccounts, toKey, getAccountVersion, getAllEnabledUsers, needsSetup } from './user-storage.js';
import { getUserDirectories } from './user-directories.js';
import { tryAutoLogin } from './user-auth.js';

/**
 * @typedef {Object} User
 * @property {string} handle - The user's short handle. Used for directories and other references
 * @property {string} name - The user's name. Displayed in the UI
 * @property {number} created - The timestamp when the user was created
 * @property {string} password - Scrypt hash of the user's password
 * @property {string} salt - Salt used for hashing the password
 * @property {boolean} enabled - Whether the user is enabled
 * @property {boolean} admin - Whether the user is an admin (can manage other users)
 */

/**
 * @typedef {Object} UserViewModel
 * @property {string} handle - The user's short handle. Used for directories and other references
 * @property {string} name - The user's name. Displayed in the UI
 * @property {string} avatar - The user's avatar image
 * @property {boolean} [admin] - Whether the user is an admin (can manage other users)
 * @property {boolean} password - Whether the user is password protected
 * @property {boolean} [enabled] - Whether the user is enabled
 * @property {number} [created] - The timestamp when the user was created
 */

/**
 * @typedef {Object} UserDirectoryList
 * @property {string} root - The root directory for the user
 * @property {string} thumbnails - The directory where the thumbnails are stored
 * @property {string} thumbnailsBg - The directory where the background thumbnails are stored
 * @property {string} thumbnailsAvatar - The directory where the avatar thumbnails are stored
 * @property {string} thumbnailsPersona - The directory where the persona thumbnails are stored
 * @property {string} worlds - The directory where the WI are stored
 * @property {string} user - The directory where the user's public data is stored
 * @property {string} avatars - The directory where the avatars are stored
 * @property {string} userImages - The directory where the images are stored
 * @property {string} groups - The directory where the groups are stored
 * @property {string} groupChats - The directory where the group chats are stored
 * @property {string} chats - The directory where the chats are stored
 * @property {string} characters - The directory where the characters are stored
 * @property {string} backgrounds - The directory where the backgrounds are stored
 * @property {string} novelAI_Settings - The directory where the NovelAI settings are stored
 * @property {string} koboldAI_Settings - The directory where the KoboldAI settings are stored
 * @property {string} openAI_Settings - The directory where the OpenAI settings are stored
 * @property {string} textGen_Settings - The directory where the TextGen settings are stored
 * @property {string} themes - The directory where the themes are stored
 * @property {string} movingUI - The directory where the moving UI data is stored
 * @property {string} extensions - The directory where the extensions are stored
 * @property {string} instruct - The directory where the instruct templates is stored
 * @property {string} context - The directory where the context templates is stored
 * @property {string} quickreplies - The directory where the quick replies are stored
 * @property {string} assets - The directory where the assets are stored
 * @property {string} comfyWorkflows - The directory where the ComfyUI workflows are stored
 * @property {string} files - The directory where the uploaded files are stored
 * @property {string} vectors - The directory where the vectors are stored
 * @property {string} backups - The directory where the backups are stored
 * @property {string} sysprompt - The directory where the system prompt data is stored
 * @property {string} reasoning - The directory where the reasoning templates are stored
 */

/**
 * Prints an error message and exits the process if necessary
 * @param {string} message The error message to print
 * @returns {void}
 */
function logSecurityAlert(message) {
    const { basicAuthMode, whitelistMode } = globalThis.COMMAND_LINE_ARGS;
    if (basicAuthMode || whitelistMode || getEnableAccounts()) return; // safe!
    console.error(color.red(message));
    if (getConfigValue('securityOverride', false, 'boolean')) {
        console.warn(color.red('Security has been overridden. If it\'s not a trusted network, change the settings.'));
        return;
    }
    process.exit(1);
}

/**
 * Verifies the security settings and prints warnings if necessary
 * @returns {Promise<void>}
 */
export async function verifySecuritySettings() {
    const { listen, basicAuthMode } = globalThis.COMMAND_LINE_ARGS;

    // Skip all security checks as listen is set to false
    if (!listen) {
        return;
    }

    if (!getEnableAccounts()) {
        logSecurityAlert('Your current EmberDesk configuration is insecure (listening to non-localhost). Enable user accounts or whitelisting.');
    }

    const users = await getAllEnabledUsers();
    const unprotectedUsers = users.filter(x => !x.password);
    const unprotectedAdminUsers = unprotectedUsers.filter(x => x.admin);

    if (unprotectedUsers.length > 0) {
        console.warn(color.blue('A friendly reminder that the following users are not password protected:'));
        unprotectedUsers.map(x => `${color.yellow(x.handle)} ${color.red(x.admin ? '(admin)' : '')}`).forEach(x => console.warn(x));
        console.log();
        console.warn(`Consider setting a password in the admin panel or by using the ${color.blue('recover.js')} script.`);
        console.log();

        if (unprotectedAdminUsers.length > 0) {
            logSecurityAlert('Set a password for all admin users via the admin panel or recover.js.');
        }
    }

    // Legacy: basicAuthMode is deprecated but still functional for backward compatibility
    if (basicAuthMode) {
        const basicAuthUserName = getConfigValue('basicAuthUser.username', '');
        const basicAuthUserPassword = getConfigValue('basicAuthUser.password', '');
        if (!basicAuthUserName || !basicAuthUserPassword) {
            console.warn(color.yellow(
                'Basic Authentication is enabled, but username or password is not set or empty!',
            ));
        }
    }
}

/**
 * Middleware to add user data to the request object.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 * @param {import('express').NextFunction} next Next function
 */
export async function setUserDataMiddleware(request, response, next) {
    // If user accounts are disabled, use the default user
    if (!getEnableAccounts()) {
        const handle = DEFAULT_USER.handle;
        const directories = getUserDirectories(handle);
        request.user = {
            profile: DEFAULT_USER,
            directories: directories,
        };
        return next();
    }

    if (!request.session) {
        console.error('Session not available');
        return response.sendStatus(500);
    }

    // If user accounts are enabled, get the user from the session
    let handle = request.session?.handle;

    // If we have the only user and it's not password protected, use it
    if (!handle) {
        return next();
    }

    /** @type {User} */
    const user = await storage.getItem(toKey(handle));

    if (!user) {
        console.error('User not found:', handle);
        return next();
    }

    if (!user.enabled) {
        console.error('User is disabled:', handle);
        return next();
    }

    if (Object.hasOwn(request.session, 'version')) {
        if (request.session.version !== getAccountVersion(user)) {
            console.warn('User data has changed since the session was created. Invalidating session for user:', handle);
            request.session.handle = null;
            request.session.csrfToken = null;
            request.session.version = null;
            request.session = null;
            return response.sendStatus(403);
        }
    } else {
        // If there is no version in the session, it means it's an old session. Upgrade it by adding the version.
        request.session.version = getAccountVersion(user);
    }

    const directories = getUserDirectories(handle);
    request.user = {
        profile: user,
        directories: directories,
    };

    // Touch the session if loading the home page
    if (request.method === 'GET' && request.path === '/') {
        request.session.touch = Date.now();
    }

    return next();
}

/**
 * Middleware to add user data to the request object.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 * @param {import('express').NextFunction} next Next function
 */
export function requireLoginMiddleware(request, response, next) {
    if (!request.user) {
        return response.sendStatus(403);
    }

    return next();
}

/**
 * Middleware to host the login page.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
export async function loginPageMiddleware(request, response) {
    if (!getEnableAccounts()) {
        console.log('User accounts are disabled. Redirecting to index page.');
        return response.redirect('/');
    }

    try {
        const { basicAuthMode } = globalThis.COMMAND_LINE_ARGS;
        const autoLogin = await tryAutoLogin(request, basicAuthMode);

        if (autoLogin) {
            return response.redirect('/');
        }
    } catch (error) {
        console.error('Error during auto-login:', error);
    }

    return response.sendFile('login.html', { root: path.join(serverDirectory, 'public') });
}

/**
 * Middleware to host the first-time setup page.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
export async function setupPageMiddleware(request, response) {
    if (await needsSetup()) {
        return response.sendFile('setup.html', { root: path.join(serverDirectory, 'public') });
    }
    return response.redirect('/login');
}

/**
 * Creates a route handler for serving files from a specific directory.
 * @param {(req: import('express').Request) => string} directoryFn A function that returns the directory path to serve files from
 * @returns {import('express').RequestHandler}
 */
function createRouteHandler(directoryFn) {
    return async (req, res) => {
        try {
            const directory = directoryFn(req);
            const filePath = decodeURIComponent(req.params[0]);
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
            return res.sendStatus(500);
        }
    };
}

/**
 * Creates a route handler for serving extensions.
 * @param {(req: import('express').Request) => string} directoryFn A function that returns the directory path to serve files from
 * @returns {import('express').RequestHandler}
 */
function createExtensionsRouteHandler(directoryFn) {
    return async (req, res) => {
        try {
            const directory = directoryFn(req);
            const filePath = decodeURIComponent(req.params[0]);
            const localPath = path.join(directory, filePath);
            if (!isPathUnderParent(directory, path.resolve(localPath))) {
                return res.sendStatus(403);
            }
            const existsLocal = fs.existsSync(localPath);
            if (existsLocal) {
                return res.sendFile(filePath, { root: directory });
            }

            const globalPath = path.join(PUBLIC_DIRECTORIES.globalExtensions, filePath);
            if (!isPathUnderParent(PUBLIC_DIRECTORIES.globalExtensions, path.resolve(globalPath))) {
                return res.sendStatus(403);
            }
            const existsGlobal = fs.existsSync(globalPath);
            if (existsGlobal) {
                return res.sendFile(filePath, { root: PUBLIC_DIRECTORIES.globalExtensions });
            }

            return res.sendStatus(404);
        } catch (error) {
            return res.sendStatus(500);
        }
    };
}

/**
 * Verifies that the current user is an admin.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 * @param {import('express').NextFunction} next Next function
 * @returns {any}
 */
export function requireAdminMiddleware(request, response, next) {
    if (!request.user) {
        return response.sendStatus(403);
    }

    if (request.user.profile.admin) {
        return next();
    }

    console.warn('Unauthorized access to admin endpoint:', request.originalUrl);
    return response.sendStatus(403);
}

/**
 * Creates an archive of the user's data root directory.
 * @param {string} handle User handle
 * @param {import('express').Response} response Express response object to write to
 * @returns {Promise<void>} Promise that resolves when the archive is created
 */
export async function createBackupArchive(handle, response) {
    const directories = getUserDirectories(handle);

    console.info('Backup requested for', handle);
    const archive = archiver('zip');

    archive.on('error', function (err) {
        response.status(500).send({ error: err.message });
    });

    // On stream closed we can end the request
    archive.on('end', function () {
        console.info('Archive wrote %d bytes', archive.pointer());
        response.end(); // End the Express response
    });

    const timestamp = generateTimestamp();

    // Set the archive name
    response.attachment(`${handle}-${timestamp}.zip`);

    // This is the streaming magic
    // @ts-ignore
    archive.pipe(response);

    // Append files from a sub-directory, putting its contents at the root of archive
    const ignore = allowKeysExposure ? [] : [SECRETS_FILE, 'backups/secrets_migration_*.json'];
    archive.glob('**/*', {
        cwd: directories.root,
        follow: false,
        stat: true,
        dot: true,
        ignore,
    });
    archive.finalize();
}

/**
 * Express router for serving files from the user's directories.
 */
export const router = express.Router();
router.use('/backgrounds/*', createRouteHandler(req => req.user.directories.backgrounds));
router.use('/characters/*', createRouteHandler(req => req.user.directories.characters));
router.use('/User%20Avatars/*', createRouteHandler(req => req.user.directories.avatars));
router.use('/assets/*', createRouteHandler(req => req.user.directories.assets));
router.use('/user/images/*', createRouteHandler(req => req.user.directories.userImages));
router.use('/user/files/*', createRouteHandler(req => req.user.directories.files));
router.use('/scripts/extensions/third-party/*', extensionsEnabledFeatureGuard, createExtensionsRouteHandler(req => req.user.directories.extensions));
