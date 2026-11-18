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
} from './user-storage.ts';

export {
    getUserDirectories,
    getUserDirectoriesList,
    ensurePublicDirectoriesExist,
    cleanUploads,
    getUserAvatar,
} from './user-directories.ts';

export {
    migrateUserData,
    migratePublicOverrides,
} from './user-migrations.ts';

export {
    getCookieSecret,
    getPasswordSalt,
    getCookieSessionName,
    getSessionCookieAge,
    getPasswordHash,
    getCsrfSecret,
    shouldRedirectToLogin,
    tryAutoLogin,
} from './user-auth.ts';

// Native Node Modules
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Express and other dependencies
import storage from 'node-persist';
import express from 'express';
import archiver from 'archiver';

import { DEFAULT_USER } from './constants.js';
import { getConfigValue, color, generateTimestamp, isPathUnderParent, invalidateFirefoxCache } from './util.js';
import { SECRETS_FILE, SECRET_KEYS } from './endpoints/secrets.js';
import { canonicalSqliteManager, resolveCanonicalDatabasePath } from './canonical-sqlite.ts';
import { exportCanonicalStorageToFiles } from './canonical-sqlite-export.ts';
import { getEnableAccounts, toKey, getAccountVersion, getAllEnabledUsers, needsSetup } from './user-storage.ts';
import { getUserDirectories } from './user-directories.ts';
import { shouldRedirectToLogin, tryAutoLogin } from './user-auth.ts';
import { hasReactLoginBuild, sendReactLoginIndex } from './middleware/react-login-serve.js';

/**
 * @typedef {import('./user-storage.ts').User} User
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
 * @property {string} thumbnailsAvatar - The directory where the avatar thumbnails are stored
 * @property {string} worlds - The directory where the WI are stored
 * @property {string} avatars - The directory where the avatars are stored
 * @property {string} userImages - The directory where the images are stored
 * @property {string} chats - The directory where the chats are stored
 * @property {string} characters - The directory where the characters are stored
 * @property {string} backgrounds - The directory where the backgrounds are stored
 * @property {string} openAI_Settings - The directory where the OpenAI settings are stored
 * @property {string} assets - The directory where the assets are stored
 * @property {string} files - The directory where the uploaded files are stored
 * @property {string} backups - The directory where the backups are stored
 * @property {string} storage - The directory where the durable canonical storage files are stored
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
 * @param {object} [options]
 * @param {string} [options.reactLoginDistRoot]
 * @returns {import('express').RequestHandler}
 */
/**
 * Send a clear failure when the required React auth app build is missing.
 * @param {import('express').Response} response
 * @param {string} pageName
 * @returns {void}
 */
function sendMissingReactAuthBuild(response, pageName) {
    response.status(503).type('text/plain').send(
        `React ${pageName} build is missing. Run "pnpm run build:react" and restart the server.`,
    );
}

/**
 * Redirect a legacy `.html` auth URL to its canonical route while preserving the query string.
 * @param {string} canonicalPath
 * @returns {import('express').RequestHandler}
 */
export function createLegacyAuthHtmlRedirectMiddleware(canonicalPath) {
    return function legacyAuthHtmlRedirectMiddleware(request, response) {
        const queryIndex = request.originalUrl.indexOf('?');
        const query = queryIndex >= 0 ? request.originalUrl.slice(queryIndex) : '';
        return response.redirect(302, `${canonicalPath}${query}`);
    };
}

export function createLegacyLoginHtmlRedirectMiddleware() {
    return createLegacyAuthHtmlRedirectMiddleware('/login');
}

export function createLegacySetupHtmlRedirectMiddleware() {
    return createLegacyAuthHtmlRedirectMiddleware('/setup');
}

export function createLoginPageMiddleware({ reactLoginDistRoot } = {}) {
    return async function loginPageMiddleware(request, response) {
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

        if (hasReactLoginBuild(reactLoginDistRoot)) {
            return sendReactLoginIndex(response, reactLoginDistRoot);
        }

        console.error('React login build is required but app/dist/index.html was not found.');
        return sendMissingReactAuthBuild(response, 'login');
    };
}

/**
 * Middleware to host the first-time setup page.
 * @param {object} [options]
 * @param {string} [options.reactLoginDistRoot]
 * @returns {import('express').RequestHandler}
 */
export function createSetupPageMiddleware({ reactLoginDistRoot, forceNeedsSetup = false } = {}) {
    return async function setupPageMiddleware(request, response) {
        if (!forceNeedsSetup && !await needsSetup()) {
            return response.redirect('/login');
        }

        if (hasReactLoginBuild(reactLoginDistRoot)) {
            return sendReactLoginIndex(response, reactLoginDistRoot);
        }

        console.error('React setup build is required but app/dist/index.html was not found.');
        return sendMissingReactAuthBuild(response, 'setup');
    };
}

/**
 * Middleware to host the React settings page or fall back to the legacy workspace.
 * @param {object} [options]
 * @param {string} [options.reactLoginDistRoot]
 * @returns {import('express').RequestHandler}
 */
export function createSettingsPageMiddleware({ reactLoginDistRoot } = {}) {
    return function settingsPageMiddleware(request, response) {
        if (shouldRedirectToLogin(request)) {
            return response.redirect('/login');
        }

        if (hasReactLoginBuild(reactLoginDistRoot)) {
            return sendReactLoginIndex(response, reactLoginDistRoot);
        }

        console.error('React settings build is required but app/dist/index.html was not found.');
        return sendMissingReactAuthBuild(response, 'settings');
    };
}

export const loginPageMiddleware = createLoginPageMiddleware();
export const setupPageMiddleware = createSetupPageMiddleware();
export const settingsPageMiddleware = createSettingsPageMiddleware();

/**
 * Creates a route handler for serving files from a specific directory.
 * @param {(req: import('express').Request) => string} directoryFn A function that returns the directory path to serve files from
 * @returns {import('express').RequestHandler}
 */
function createRouteHandler(directoryFn) {
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
export function getWildcardFilePath(req) {
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

    // Stage compatibility files separately so SQLite and secret history never
    // enter the ordinary user export; canonical rows replace projections.
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-user-export-'));
    const staging = path.join(temporary, 'archive');
    const canonical = path.join(temporary, 'canonical');
    try {
        const sourceRoot = fs.realpathSync(directories.root);
        fs.cpSync(sourceRoot, staging, {
            recursive: true,
            verbatimSymlinks: true,
            filter(source) {
                const relative = path.relative(sourceRoot, source).split(path.sep).join('/');
                return relative !== 'storage' && relative !== SECRETS_FILE && !/^backups\/secrets_migration_.*\.json$/.test(relative);
            },
        });
        const { dbPath } = resolveCanonicalDatabasePath(directories);
        if (fs.existsSync(dbPath)) {
            fs.mkdirSync(canonical);
            // Preserve existing avatar image bytes for the exporter without
            // following a link in the source or in the staged tree.
            if (fs.existsSync(directories.characters) && !fs.lstatSync(directories.characters).isSymbolicLink()) {
                fs.cpSync(directories.characters, path.join(canonical, path.relative(directories.root, directories.characters)), {
                    recursive: true,
                    filter: source => !fs.lstatSync(source).isSymbolicLink(),
                });
            }
            const db = canonicalSqliteManager.open({ handle, directories, featureFlags: { enabled: true } });
            const result = exportCanonicalStorageToFiles({ db, directories, handle, outDir: canonical, sliceKeys: ['characters', 'world_info', 'settings', 'chats', 'managed_media', 'presets'] });
            if (!result.ok) throw new Error('Canonical user export failed');

            // Replace only links that collide with canonical output; all other
            // links keep the original no-follow archive behavior.
            const merge = (source, destination) => {
                for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
                    const from = path.join(source, entry.name);
                    const to = path.join(destination, entry.name);
                    let existing;
                    try { existing = fs.lstatSync(to); } catch (error) { if (error.code !== 'ENOENT') throw error; }
                    if (existing?.isSymbolicLink()) fs.unlinkSync(to);
                    if (entry.isDirectory()) {
                        fs.mkdirSync(to, { recursive: true });
                        merge(from, to);
                    } else {
                        fs.copyFileSync(from, to);
                    }
                }
            };
            merge(canonical, staging);
        }

        // Settings and presets from both canonical export and older on-disk
        // copies may predate migration to the secret store. Sanitize only the
        // staged copies, retaining ordinary settings and connection metadata.
        const safeSecretKeys = new Set([SECRET_KEYS.LIBRE_URL, SECRET_KEYS.LINGVA_URL, SECRET_KEYS.ONERING_URL, SECRET_KEYS.DEEPLX_URL]);
        const credentialKeys = new Set([...Object.values(SECRET_KEYS).filter(key => !safeSecretKeys.has(key)), 'api_key_openai_fallback', 'proxy_password', 'custom_include_headers']);
        const scrub = value => {
            if (Array.isArray(value)) return value.map(scrub);
            if (!value || typeof value !== 'object') return value;
            return Object.fromEntries(Object.entries(value)
                .filter(([key]) => !credentialKeys.has(key) && !key.startsWith('api_key_'))
                .map(([key, item]) => [key, scrub(item)]));
        };
        const sanitizeSettings = (directory, inPresets = false) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const item = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    sanitizeSettings(item, inPresets || entry.name === 'OpenAI Settings');
                } else if (entry.isFile() && (inPresets || /^settings(?:[._-].*)?\.json$/i.test(entry.name)) && entry.name.endsWith('.json')) {
                    try {
                        const parsed = JSON.parse(fs.readFileSync(item, 'utf8'));
                        fs.writeFileSync(item, JSON.stringify(scrub(parsed), null, 2));
                    } catch (error) {
                        // Unparseable settings cannot be safely scrubbed.
                        if (error instanceof SyntaxError) fs.unlinkSync(item);
                        else throw error;
                    }
                }
            }
        };
        sanitizeSettings(staging);
    } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
    }

    console.info('Backup requested for', handle);
    const archive = archiver('zip');

    response.once('close', () => {
        archive.abort();
        fs.rmSync(temporary, { recursive: true, force: true });
    });

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

    archive.glob('**/*', { cwd: staging, follow: false, stat: true, dot: true });
    archive.finalize();
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
async function tryResolveManagedMediaFile(req, fullPath) {
    try {
        const directories = req.user.directories;
        const handle = directories.handle ?? path.basename(path.resolve(directories.root));
        const compatibilityPath = path.relative(directories.root, fullPath).split(path.sep).join(path.posix.sep);
        const { ensureCanonicalSliceBackend } = await import('./canonical-backend.js');
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
function createManagedMediaRouteHandler(directoryFn) {
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
            return fileHandler(req, res);
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
function createCharacterRouteHandler() {
    const fileHandler = createRouteHandler(req => req.user.directories.characters);
    return async (req, res) => {
        try {
            const filePath = getWildcardFilePath(req);
            const isRootAvatar = !filePath.includes('/') && filePath.toLowerCase().endsWith('.png');
            if (isRootAvatar) {
                const directories = req.user.directories;
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
            return fileHandler(req, res);
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
