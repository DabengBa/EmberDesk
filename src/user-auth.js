import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { Buffer } from 'node:buffer';
import storage from 'node-persist';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import ipMatching from 'ip-matching';
import { getEnableAccounts, toKey, getAllUserHandles, getAccountVersion } from './user-storage.js';
import { getConfigValue, color } from './util.js';
import { readSecret, writeSecret } from './endpoints/secrets.js';
import { filterValidIpPatterns, getIpFromRequest } from './express-common.js';

const AUTHELIA_AUTH = getConfigValue('sso.autheliaAuth', false, 'boolean');
const AUTHENTIK_AUTH = getConfigValue('sso.authentikAuth', false, 'boolean');
const PER_USER_BASIC_AUTH = getConfigValue('perUserBasicAuth', false, 'boolean');
const ANON_CSRF_SECRET = crypto.randomBytes(64).toString('base64');
const TRUSTED_PROXIES = filterValidIpPatterns(getConfigValue('sso.trustedProxies', ['127.0.0.1', '::1']) ?? [], (entry, message) => `${color.red('Warning')}: Ignoring invalid sso.trustedProxies entry ${color.yellow(entry)} - ${message}`);

const STORAGE_KEYS = {
    csrfSecret: 'csrfSecret',
    /**
     * @deprecated Read from COOKIE_SECRET_PATH in DATA_ROOT instead.
     */
    cookieSecret: 'cookieSecret',
};

const COOKIE_SECRET_PATH = 'cookie-secret.txt';

/**
 * Get the cookie secret from the config. If it doesn't exist, generate a new one.
 * @param {string} dataRoot The root directory for user data
 * @returns {string} The cookie secret
 */
export function getCookieSecret(dataRoot) {
    const cookieSecretPath = path.join(dataRoot, COOKIE_SECRET_PATH);

    if (fs.existsSync(cookieSecretPath)) {
        const stat = fs.statSync(cookieSecretPath);
        if (stat.size > 0) {
            return fs.readFileSync(cookieSecretPath, 'utf8');
        }
    }

    const oldSecret = getConfigValue(STORAGE_KEYS.cookieSecret);
    if (oldSecret) {
        console.log('Migrating cookie secret from config.yaml...');
        writeFileAtomicSync(cookieSecretPath, oldSecret, { encoding: 'utf8' });
        return oldSecret;
    }

    console.warn(color.yellow('Cookie secret is missing from data root. Generating a new one...'));
    const secret = crypto.randomBytes(64).toString('base64');
    writeFileAtomicSync(cookieSecretPath, secret, { encoding: 'utf8' });
    return secret;
}

/**
 * Generates a random password salt.
 * @returns {string} The password salt
 */
export function getPasswordSalt() {
    return crypto.randomBytes(16).toString('base64');
}

/**
 * Get the session name for the current server.
 * @returns {string} The session name
 */
export function getCookieSessionName() {
    // Get server hostname and hash it to generate a session suffix
    const hostname = os.hostname() || 'localhost';
    const suffix = crypto.createHash('sha256').update(hostname).digest('hex').slice(0, 8);
    return `session-${suffix}`;
}

export function getSessionCookieAge() {
    // Defaults to "no expiration" if not set
    const configValue = getConfigValue('sessionTimeout', -1, 'number');

    // Convert to milliseconds
    if (configValue > 0) {
        return configValue * 1000;
    }

    // "No expiration" is just 400 days as per RFC 6265
    if (configValue < 0) {
        return 400 * 24 * 60 * 60 * 1000;
    }

    // 0 means session cookie is deleted when the browser session ends
    // (depends on the implementation of the browser)
    return undefined;
}

/**
 * Hashes a password using scrypt with the provided salt.
 * @param {string} password Password to hash
 * @param {string} salt Salt to use for hashing
 * @returns {string} Hashed password
 */
export function getPasswordHash(password, salt) {
    return crypto.scryptSync(password.normalize(), salt, 64).toString('base64');
}

/**
 * Get the CSRF secret from the storage.
 * @param {import('express').Request} [request] HTTP request object
 * @returns {string} The CSRF secret
 */
export function getCsrfSecret(request) {
    if (!request || !request.user) {
        return ANON_CSRF_SECRET;
    }

    let csrfSecret = readSecret(request.user.directories, STORAGE_KEYS.csrfSecret);

    if (!csrfSecret) {
        csrfSecret = crypto.randomBytes(64).toString('base64');
        writeSecret(request.user.directories, STORAGE_KEYS.csrfSecret, csrfSecret);
    }

    return csrfSecret;
}

/**
 * Checks if the user should be redirected to the login page.
 * @param {import('express').Request} request Request object
 * @returns {boolean} Whether the user should be redirected to the login page
 */
export function shouldRedirectToLogin(request) {
    return getEnableAccounts() && !request.user;
}

/**
 * Tries auto-login if there is only one user and it's not password protected.
 * or another configured method such authlia or basic
 * @param {import('express').Request} request Request object
 * @param {boolean} basicAuthMode If Basic auth mode is enabled
 * @returns {Promise<boolean>} Whether auto-login was performed
 */
export async function tryAutoLogin(request, basicAuthMode) {
    if (!getEnableAccounts() || request.user || !request.session) {
        return false;
    }

    if (!request.query.noauto) {
        if (await singleUserLogin(request)) {
            return true;
        }

        if (AUTHELIA_AUTH && await autheliaUserLogin(request)) {
            return true;
        }

        if (AUTHENTIK_AUTH && await authentikUserLogin(request)) {
            return true;
        }

        if (basicAuthMode && PER_USER_BASIC_AUTH && await basicUserLogin(request)) {
            return true;
        }
    }

    return false;
}

/**
 * Tries auto-login if there is only one user and it's not password protected.
 * @param {import('express').Request} request Request object
 * @returns {Promise<boolean>} Whether auto-login was performed
 */
async function singleUserLogin(request) {
    if (!request.session) {
        return false;
    }

    const userHandles = await getAllUserHandles();
    if (userHandles.length === 1) {
        const user = await storage.getItem(toKey(userHandles[0]));
        if (user && !user.password) {
            request.session.handle = userHandles[0];
            request.session.version = getAccountVersion(user);
            return true;
        }
    }
    return false;
}

/**
 * Attempts auto-login using an Authelia header.
 * https://www.authelia.com/integration/trusted-header-sso/introduction/
 * @param {import('express').Request} request Request object
 * @returns {Promise<boolean>} Whether auto-login was performed
 */
async function autheliaUserLogin(request) {
    return headerUserLogin(request, 'Remote-User');
}

/**
 * Attempts auto-login using an Authentik header.
 * https://docs.goauthentik.io/add-secure-apps/providers/proxy/forward_auth/
 * @param {import('express').Request} request Request object
 * @returns {Promise<boolean>} Whether auto-login was performed
 */
async function authentikUserLogin(request) {
    return headerUserLogin(request, 'X-Authentik-Username');
}

/**
 * Check if the request can authenticate SSO users based on the trusted proxies configuration and the request's IP address.
 * @param {string} ip The IP address of the request
 * @return {boolean} If the request is from a trusted proxy based on the configuration
 */
function isRequestFromTrustedProxy(ip) {
    if (!Array.isArray(TRUSTED_PROXIES)) {
        console.warn(color.yellow('sso.trustedProxies is not an array. Please check your config.yaml. SSO auto-login will not work.'));
        return false;
    }

    // Bypass magic value check if the user explicitly configured
    if (TRUSTED_PROXIES.length === 1 && TRUSTED_PROXIES[0] === '*') {
        console.warn(color.yellow('sso.trustedProxies is set to accept all IPs. This is not recommended for production environments.'));
        return true;
    }

    // If the IP is missing or unknown, we can't trust it
    if (!ip || ip === 'unknown') {
        return false;
    }

    // At least one entry in the trusted proxies list must match the request IP for it to be considered trusted
    for (const entry of TRUSTED_PROXIES) {
        try {
            // This will throw if the entry is not a valid IP or CIDR
            const match = ipMatching.getMatch(entry);
            if (ipMatching.matches(ip, match)) {
                return true;
            }
        } catch (e) {
            continue;
        }
    }

    return false;
}

/**
 * Tries auto-login with a given header.
 * @param {import('express').Request} request Request object
 * @param {string} [header='Remote-User'] The header to use for the trusted user
 * @returns {Promise<boolean>} Whether auto-login was performed
 */
async function headerUserLogin(request, header = 'Remote-User') {
    if (!request.session) {
        return false;
    }

    const remoteUser = request.get(header);
    if (!remoteUser) {
        return false;
    }
    console.debug(`Attempting auto-login for user from header ${header}: ${remoteUser}`);

    const ip = getIpFromRequest(request);
    const isTrusted = isRequestFromTrustedProxy(ip);
    if (!isTrusted) {
        console.warn(color.yellow(`Received ${header} header from untrusted IP ${ip}. Ignoring for auto-login.`));
        return false;
    }

    const userHandles = await getAllUserHandles();
    for (const userHandle of userHandles) {
        if (remoteUser.toLowerCase() === userHandle) {
            const user = await storage.getItem(toKey(userHandle));
            if (user && user.enabled) {
                request.session.handle = userHandle;
                request.session.version = getAccountVersion(user);
                return true;
            }
        }
    }
    return false;
}

/**
 * Tries auto-login with basic auth username.
 * @param {import('express').Request} request Request object
 * @returns {Promise<boolean>} Whether auto-login was performed
 */
async function basicUserLogin(request) {
    if (!request.session) {
        return false;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader) {
        return false;
    }

    const [scheme, credentials] = authHeader.split(' ');

    if (scheme !== 'Basic' || !credentials) {
        return false;
    }

    const [username, ...passwordParts] = Buffer.from(credentials, 'base64')
        .toString('utf8')
        .split(':');
    const password = passwordParts.join(':');

    const userHandles = await getAllUserHandles();
    for (const userHandle of userHandles) {
        if (username === userHandle) {
            const user = await storage.getItem(toKey(userHandle));
            // Verify pass again here just to be sure
            if (user && user.enabled && user.password && user.password === getPasswordHash(password, user.salt)) {
                request.session.handle = userHandle;
                request.session.version = getAccountVersion(user);
                return true;
            }
        }
    }

    return false;
}
