import path from 'node:path';
import crypto from 'node:crypto';
import storage from 'node-persist';
import { DEFAULT_USER } from './constants.js';
import { getConfigValue } from './util.js';

export const KEY_PREFIX = 'user:';
const AVATAR_PREFIX = 'avatar:';
let _enableAccounts;
/**
 * Whether user accounts are enabled. Lazy because getConfigValue needs
 * the config file path to be set first (done during server startup).
 * @returns {boolean}
 */
export function getEnableAccounts() {
    if (_enableAccounts === undefined) {
        _enableAccounts = getConfigValue('enableUserAccounts', false, 'boolean');
    }
    return _enableAccounts;
}

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
 * Converts a user handle to a storage key.
 * @param {string} handle User handle
 * @returns {string} The key for the user storage
 */
export function toKey(handle) {
    return `${KEY_PREFIX}${handle}`;
}

/**
 * Converts a user handle to a storage key for avatars.
 * @param {string} handle User handle
 * @returns {string} The key for the avatar storage
 */
export function toAvatarKey(handle) {
    return `${AVATAR_PREFIX}${handle}`;
}

/**
 * Initializes the user storage.
 * @param {string} dataRoot The root directory for user data
 * @returns {Promise<void>}
 */
export async function initUserStorage(dataRoot) {
    console.log('Using data root:', dataRoot);
    await storage.init({
        dir: path.join(dataRoot, '_storage'),
        ttl: false, // Never expire
        expiredInterval: 0,
    });

    const keys = await getAllUserHandles();

    // If accounts are disabled and there are no users, create the default user
    // When accounts are enabled, storage starts empty — the setup page creates the first admin
    if (!getEnableAccounts() && keys.length === 0) {
        await storage.setItem(toKey(DEFAULT_USER.handle), DEFAULT_USER);
    }
}

/**
 * Checks whether the first-time setup page should be shown.
 * Returns true when:
 * - user accounts are enabled and no users exist in storage (fresh deploy), OR
 * - the only user is the legacy default-user with no password (existing deploy upgrade)
 * @returns {Promise<boolean>}
 */
export async function needsSetup() {
    if (!getEnableAccounts()) return false;
    const handles = await getAllUserHandles();
    if (handles.length === 0) return true;
    if (handles.length === 1) {
        const user = await storage.getItem(toKey(handles[0]));
        if (user && !user.password) return true;
    }
    return false;
}

/**
 * Gets a list of all user handles.
 * @returns {Promise<string[]>} - The list of user handles
 */
export async function getAllUserHandles() {
    const keys = await storage.keys(x => x.key.startsWith(KEY_PREFIX));
    const handles = keys.map(x => x.replace(KEY_PREFIX, ''));
    return handles;
}

/**
 * Gets the account version tag for the provided user.
 * @param {User} user User account object
 * @returns {string} Account version tag
 */
export function getAccountVersion(user) {
    return crypto.createHash('shake256', { outputLength: 8 })
        .update(JSON.stringify([user.handle, user.password, user.salt]))
        .digest('hex');
}

/**
 * Gets all of the users.
 * @returns {Promise<User[]>}
 */
async function getAllUsers() {
    if (!getEnableAccounts()) {
        return [];
    }
    /** @type {User[]} */
    const users = await storage.values();
    return users;
}

/**
 * Gets all of the enabled users.
 * @returns {Promise<User[]>}
 */
export async function getAllEnabledUsers() {
    const users = await getAllUsers();
    return users.filter(x => x.enabled);
}
