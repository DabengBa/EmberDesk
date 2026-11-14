import path from 'node:path';
import crypto from 'node:crypto';
import storage from 'node-persist';
import { DEFAULT_USER } from './constants.js';
import { getConfigValue } from './util.js';

export const KEY_PREFIX = 'user:';
const AVATAR_PREFIX = 'avatar:';
let _enableAccounts: boolean | undefined;
/**
 * Whether user accounts are enabled. Lazy because getConfigValue needs
 * the config file path to be set first (done during server startup).
 */
export function getEnableAccounts(): boolean {
    if (_enableAccounts === undefined) {
        _enableAccounts = getConfigValue('enableUserAccounts', false, 'boolean') as boolean;
    }
    return _enableAccounts;
}

/** Existing persisted account shape; node-persist does not validate its values. */
export type User = {
    handle: string;
    name: string;
    created: number;
    password: string;
    salt: string;
    enabled: boolean;
    admin: boolean;
};

/** Converts a user handle to a storage key. */
export function toKey(handle: string): string {
    return `${KEY_PREFIX}${handle}`;
}

/** Converts a user handle to a storage key for avatars. */
export function toAvatarKey(handle: string): string {
    return `${AVATAR_PREFIX}${handle}`;
}

/** Initializes the user storage. */
export async function initUserStorage(dataRoot: string): Promise<void> {
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
 */
export async function needsSetup(): Promise<boolean> {
    if (!getEnableAccounts()) return false;
    const handles = await getAllUserHandles();
    if (handles.length === 0) return true;
    if (handles.length === 1) {
        const user: User | undefined = await storage.getItem(toKey(handles[0]));
        if (user && !user.password) return true;
    }
    return false;
}

/** Gets a list of all user handles. */
export async function getAllUserHandles(): Promise<string[]> {
    const keys = await storage.keys(x => x.key.startsWith(KEY_PREFIX));
    const handles = keys.map(x => x.replace(KEY_PREFIX, ''));
    return handles;
}

/** Gets the account version tag for the provided user. */
export function getAccountVersion(user: Pick<User, 'handle' | 'password' | 'salt'>): string {
    return crypto.createHash('shake256', { outputLength: 8 })
        .update(JSON.stringify([user.handle, user.password, user.salt]))
        .digest('hex');
}

/** Gets all of the users. */
async function getAllUsers(): Promise<User[]> {
    if (!getEnableAccounts()) {
        return [];
    }
    // Preserve the existing unvalidated node-persist values and their behavior.
    const users: User[] = await storage.values();
    return users;
}

/** Gets all of the enabled users. */
export async function getAllEnabledUsers(): Promise<User[]> {
    const users = await getAllUsers();
    return users.filter(x => x.enabled);
}
