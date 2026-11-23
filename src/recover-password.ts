import storage from 'node-persist';
import { initUserStorage, toKey } from './user-storage.ts';
import { getPasswordSalt, getPasswordHash } from './user-auth.ts';
import { getConfigValue } from './util.ts';

/**
 * Initializes the storage with the data root specified in the config file.
 */
async function initStorage() {
    const dataRoot = getConfigValue('dataRoot');

    if (!dataRoot) {
        console.error('No "dataRoot" setting found in the application configuration.');
        process.exit(1);
    }

    await initUserStorage(dataRoot);
}

/**
 * Recovers a user account by enabling it and optionally setting a new password.

 * @param {string} userAccount - The username of the account to recover.
 * @param {string} [userPassword] - The new password for the account. If not provided, sets an empty password.
 */
export async function recoverPassword(userAccount: string, userPassword?: string) {
    await initStorage();

    /**
     * @type {import('./users').User}
     */
    const user = await storage.get(toKey(userAccount));

    if (!user) {
        console.error(`User "${userAccount}" not found.`);
        process.exit(1);
    }

    if (!user.enabled) {
        console.log('User is disabled. Enabling...');
        user.enabled = true;
    }

    if (userPassword) {
        console.log('Setting new password...');
        const salt = getPasswordSalt();
        const passwordHash = getPasswordHash(userPassword, salt);
        user.password = passwordHash;
        user.salt = salt;
    } else {
        console.log('Setting an empty password...');
        user.password = '';
        user.salt = '';
    }

    await storage.setItem(toKey(userAccount), user);
    console.log('User recovered. A program will exit now.');
}
