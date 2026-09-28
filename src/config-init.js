import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import color from 'chalk';
import _ from 'lodash';
import { serverDirectory } from './server-directory.js';
import { keyToEnv, setConfigFilePath } from './util.js';

const keyMigrationMap = [
    {
        oldKey: 'disableThumbnails',
        newKey: 'thumbnails.enabled',
        migrate: (value) => !value,
    },
    {
        oldKey: 'thumbnailsQuality',
        newKey: 'thumbnails.quality',
        migrate: (value) => value,
    },
    {
        oldKey: 'avatarThumbnailsPng',
        newKey: 'thumbnails.format',
        migrate: (value) => (value ? 'png' : 'jpg'),
    },
    {
        oldKey: 'disableChatBackup',
        newKey: 'backups.chat.enabled',
        migrate: (value) => !value,
    },
    {
        oldKey: 'numberOfBackups',
        newKey: 'backups.common.numberOfBackups',
        migrate: (value) => value,
    },
    {
        oldKey: 'maxTotalChatBackups',
        newKey: 'backups.chat.maxTotalBackups',
        migrate: (value) => value,
    },
    {
        oldKey: 'chatBackupThrottleInterval',
        newKey: 'backups.chat.throttleInterval',
        migrate: (value) => value,
    },
    {
        oldKey: 'enableExtensions',
        newKey: 'extensions.enabled',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'enableExtensionsAutoUpdate',
        newKey: 'extensions.autoUpdate',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'extras.disableAutoDownload',
        newKey: 'extensions.models.autoDownload',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'extras.classificationModel',
        newKey: 'extensions.models.classification',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'extras.captioningModel',
        newKey: 'extensions.models.captioning',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'extras.speechToTextModel',
        newKey: 'extensions.models.speechToText',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'minLogLevel',
        newKey: 'logging.minLogLevel',
        migrate: (value) => value,
    },
    {
        oldKey: 'cardsCacheCapacity',
        newKey: 'performance.memoryCacheCapacity',
        migrate: (value) => `${value}mb`,
    },
    {
        oldKey: 'cookieSecret',
        newKey: 'cookieSecret',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'autorun',
        newKey: 'browserLaunch.enabled',
        migrate: (value) => value,
    },
    {
        oldKey: 'autorunHostname',
        newKey: 'browserLaunch.hostname',
        migrate: (value) => value,
    },
    {
        oldKey: 'autorunPortOverride',
        newKey: 'browserLaunch.port',
        migrate: (value) => value,
    },
    {
        oldKey: 'avoidLocalhost',
        newKey: 'browserLaunch.avoidLocalhost',
        migrate: (value) => value,
    },
    {
        oldKey: 'extras.promptExpansionModel',
        newKey: 'extras.promptExpansionModel',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'autheliaAuth',
        newKey: 'sso.autheliaAuth',
        migrate: (value) => value,
    },
    {
        oldKey: 'authentikAuth',
        newKey: 'sso.authentikAuth',
        migrate: (value) => value,
    },
];

const LEGACY_CANONICAL_SQLITE_FLAG_KEYS = ['enabled', 'shadowImport', 'reads', 'writes', 'chatStats', 'strict'];
const LEGACY_CANONICAL_SQLITE_MANAGED_MEDIA_BLOCK = {
    enabled: false,
    shadowImport: false,
    reads: false,
    writes: false,
    strict: false,
};

/**
 * Returns true when the block matches the shipped rollout template where every
 * gate was disabled, including the managedMedia slice example. Blocks that a
 * user actually edited are left untouched.
 * @param {unknown} block Value of features.storage.canonicalSqlite
 * @returns {boolean}
 */
function isLegacyCanonicalSqliteBlock(block) {
    if (block == null || typeof block !== 'object' || Array.isArray(block)) {
        return false;
    }
    const { slices, ...rest } = block;
    const expectedTopLevel = Object.fromEntries(LEGACY_CANONICAL_SQLITE_FLAG_KEYS.map(key => [key, false]));
    if (!_.isEqual(rest, expectedTopLevel)) {
        return false;
    }
    return slices === undefined
        || _.isEqual(slices, { managedMedia: LEGACY_CANONICAL_SQLITE_MANAGED_MEDIA_BLOCK });
}

/**
 * Gets all keys from an object recursively.
 * @param {object} obj Object to get all keys from
 * @param {string} prefix Prefix to prepend to all keys
 * @returns {string[]} Array of all keys in the object
 */
function getAllKeys(obj, prefix = '') {
    if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
        return [];
    }

    return _.flatMap(Object.keys(obj), key => {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            return getAllKeys(obj[key], newPrefix);
        } else {
            return [newPrefix];
        }
    });
}

/**
 * Compares the current config.yaml with the default config.yaml and adds any missing values.
 * @param {string} configPath Path to config.yaml
 */
export function addMissingConfigValues(configPath) {
    try {
        const defaultConfig = yaml.parse(fs.readFileSync(path.join(serverDirectory, './default/config.yaml'), 'utf8'));

        if (!fs.existsSync(configPath)) {
            console.warn(color.yellow(`Warning: config.yaml not found at ${configPath}. Creating a new one with default values.`));
            fs.writeFileSync(configPath, yaml.stringify(defaultConfig));
            return;
        }

        let config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

        // Migrate old keys to new keys
        const migratedKeys = [];
        for (const { oldKey, newKey, migrate, remove } of keyMigrationMap) {
            // Migrate environment variables
            const oldEnvKey = keyToEnv(oldKey);
            const newEnvKey = keyToEnv(newKey);
            if (process.env[oldEnvKey] && !process.env[newEnvKey]) {
                const oldValue = process.env[oldEnvKey];
                const newValue = migrate(oldValue);
                process.env[newEnvKey] = newValue;
                delete process.env[oldEnvKey];
                console.warn(color.yellow(`Warning: Using a deprecated environment variable: ${oldEnvKey}. Please use ${newEnvKey} instead.`));
                console.log(`Redirecting ${color.blue(oldEnvKey)}=${oldValue} -> ${color.blue(newEnvKey)}=${newValue}`);
            }

            if (_.has(config, oldKey)) {
                if (remove) {
                    _.unset(config, oldKey);
                    migratedKeys.push({
                        oldKey,
                        newValue: void 0,
                    });
                    continue;
                }

                const oldValue = _.get(config, oldKey);
                const newValue = migrate(oldValue);
                _.set(config, newKey, newValue);
                _.unset(config, oldKey);

                migratedKeys.push({
                    oldKey,
                    newKey,
                    oldValue,
                    newValue,
                });
            }
        }

        // The canonical SQLite rollout block shipped disabled by default. An
        // untouched copy of that template must not keep existing installs on
        // the file-backed path now that canonical storage is the default
        // authority; stripping it lets defaultsDeep apply the new values.
        const canonicalSqliteBlock = _.get(config, 'features.storage.canonicalSqlite');
        if (isLegacyCanonicalSqliteBlock(canonicalSqliteBlock)) {
            _.unset(config, 'features.storage.canonicalSqlite');
            migratedKeys.push({
                oldKey: 'features.storage.canonicalSqlite',
                newKey: 'features.storage.canonicalSqlite',
                newValue: 'default-on template',
            });
        }

        // Get all keys from the original config
        const originalKeys = getAllKeys(config);

        // Use lodash's defaultsDeep function to recursively apply default properties
        config = _.defaultsDeep(config, defaultConfig);

        // Get all keys from the updated config
        const updatedKeys = getAllKeys(config);

        // Find the keys that were added
        const addedKeys = _.difference(updatedKeys, originalKeys);

        if (addedKeys.length === 0 && migratedKeys.length === 0) {
            return;
        }

        if (addedKeys.length > 0) {
            console.log('Adding missing config values to config.yaml:', addedKeys);
        }

        if (migratedKeys.length > 0) {
            console.log('Migrating config values in config.yaml:', migratedKeys);
        }

        fs.writeFileSync(configPath, yaml.stringify(config));
    } catch (error) {
        console.warn(color.yellow('Could not add missing config values to config.yaml'), error);
    }
}

/**
 * Performs early initialization tasks before the server starts.
 * @param {string} configPath Path to config.yaml
 */
export function initConfig(configPath) {
    console.log('Using config path:', color.green(configPath));
    setConfigFilePath(configPath);
    addMissingConfigValues(configPath);
}
