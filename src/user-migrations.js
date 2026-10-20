import path from 'node:path';
import fs from 'node:fs';
import { DEFAULT_USER, PUBLIC_DIRECTORIES, SETTINGS_MIGRATION_FILE } from './constants.js';
import { color, delay, setPermissionsSync } from './util.js';
import { serverDirectory } from './server-directory.js';
import { getUserDirectories } from './user-directories.js';

/**
 * Perform migration from the old user data format to the new one.
 */
export async function migrateUserData() {
    const publicDirectory = path.join(process.cwd(), 'public');

    // No need to migrate if the characters directory doesn't exists
    if (!fs.existsSync(path.join(publicDirectory, 'characters'))) {
        return;
    }

    const TIMEOUT = 10;

    console.log();
    console.log(color.magenta('Preparing to migrate user data...'));
    console.log(`All public data will be moved to the ${globalThis.DATA_ROOT} directory.`);
    console.log('This process may take a while depending on the amount of data to move.');
    console.log(`Backups will be placed in the ${PUBLIC_DIRECTORIES.backups} directory.`);
    console.log(`The process will start in ${TIMEOUT} seconds. Press Ctrl+C to cancel.`);

    for (let i = TIMEOUT; i > 0; i--) {
        console.log(`${i}...`);
        await delay(1000);
    }

    console.log(color.magenta('Starting migration... Do not interrupt the process!'));

    const userDirectories = getUserDirectories(DEFAULT_USER.handle);

    const dataMigrationMap = [
        {
            old: path.join(publicDirectory, 'assets'),
            new: userDirectories.assets,
            file: false,
        },
        {
            old: path.join(publicDirectory, 'backgrounds'),
            new: userDirectories.backgrounds,
            file: false,
        },
        {
            old: path.join(publicDirectory, 'characters'),
            new: userDirectories.characters,
            file: false,
        },
        {
            old: path.join(publicDirectory, 'chats'),
            new: userDirectories.chats,
            file: false,
        },
        {
            old: path.join(publicDirectory, 'OpenAI Settings'),
            new: userDirectories.openAI_Settings,
            file: false,
        },
        {
            old: path.join(publicDirectory, 'User Avatars'),
            new: userDirectories.avatars,
            file: false,
        },
        {
            old: path.join(publicDirectory, 'worlds'),
            new: userDirectories.worlds,
            file: false,
        },
        {
            old: path.join(process.cwd(), 'thumbnails'),
            new: userDirectories.thumbnails,
            file: false,
        },
        {
            old: path.join(process.cwd(), 'secrets.json'),
            new: path.join(userDirectories.root, 'secrets.json'),
            file: true,
        },
        {
            // Lands under a non-contract name: the canonical settings shadow
            // import consumes it once and deletes it (no settings.json is
            // (re)created for migrated users).
            old: path.join(publicDirectory, 'settings.json'),
            new: path.join(userDirectories.root, SETTINGS_MIGRATION_FILE),
            file: true,
        },
    ];

    const currentDate = new Date().toISOString().split('T')[0];
    const backupDirectory = path.join(process.cwd(), PUBLIC_DIRECTORIES.backups, '_migration', currentDate);

    if (!fs.existsSync(backupDirectory)) {
        fs.mkdirSync(backupDirectory, { recursive: true });
    }

    const errors = [];

    for (const migration of dataMigrationMap) {
        console.log(`Migrating ${migration.old} to ${migration.new}...`);

        try {
            if (!fs.existsSync(migration.old)) {
                console.log(color.yellow(`Skipping migration of ${migration.old} as it does not exist.`));
                continue;
            }

            if (migration.file) {
                // Copy the file to the new location
                fs.cpSync(migration.old, migration.new, { force: true });
                // Move the file to the backup location
                fs.cpSync(
                    migration.old,
                    path.join(backupDirectory, path.basename(migration.old)),
                    { recursive: true, force: true },
                );
                fs.rmSync(migration.old, { recursive: true, force: true });
            } else {
                // Copy the directory to the new location
                fs.cpSync(migration.old, migration.new, { recursive: true, force: true });
                // Move the directory to the backup location
                fs.cpSync(
                    migration.old,
                    path.join(backupDirectory, path.basename(migration.old)),
                    { recursive: true, force: true },
                );
                fs.rmSync(migration.old, { recursive: true, force: true });
            }
        } catch (error) {
            console.error(color.red(`Error migrating ${migration.old} to ${migration.new}:`), error.message);
            errors.push(migration.old);
        }
    }

    if (errors.length > 0) {
        console.log(color.red('Migration completed with errors. Move the following files manually:'));
        errors.forEach(error => console.error(error));
    }

    console.log(color.green('Migration completed!'));
}

export async function migratePublicOverrides() {
    const migrationMap = [
        {
            oldPath: path.join(serverDirectory, 'public', 'error', 'forbidden-by-whitelist.html'),
            newPath: path.join(globalThis.DATA_ROOT, '_errors', 'forbidden-by-whitelist.html'),
        },
        {
            oldPath: path.join(serverDirectory, 'public', 'error', 'host-not-allowed.html'),
            newPath: path.join(globalThis.DATA_ROOT, '_errors', 'host-not-allowed.html'),
        },
        {
            oldPath: path.join(serverDirectory, 'public', 'error', 'unauthorized.html'),
            newPath: path.join(globalThis.DATA_ROOT, '_errors', 'unauthorized.html'),
        },
        {
            oldPath: path.join(serverDirectory, 'public', 'error', 'url-not-found.html'),
            newPath: path.join(globalThis.DATA_ROOT, '_errors', 'url-not-found.html'),
        },
        {
            oldPath: path.join(serverDirectory, 'public', 'css', 'user.css'),
            newPath: path.join(globalThis.DATA_ROOT, '_css', 'user.css'),
        },
    ];

    for (const { oldPath, newPath } of migrationMap) {
        try {
            if (fs.existsSync(newPath)) {
                continue;
            }
            if (fs.existsSync(oldPath)) {
                fs.mkdirSync(path.dirname(newPath), { recursive: true });
                fs.cpSync(oldPath, newPath, { force: true });
                fs.unlinkSync(oldPath);
                setPermissionsSync(newPath);
                console.log(`Migrated ${path.basename(oldPath)} to data root.`);
            }
        } catch (error) {
            console.error(`Error migrating ${oldPath} to ${newPath}:`, error);
        }
    }
}
