import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import color from 'chalk';
import _ from 'lodash';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { serverDirectory } from './server-directory.ts';
import { keyToEnv, setConfigFilePath } from './util.ts';
import { canonicalConfigPath, parseConfig, readConfigFile, validateConfig } from './config-file.ts';
import type { AppConfig } from './config-schema.ts';

type KeyMigration = {
    oldKey: string;
    newKey: string;
    migrate: (value: unknown) => unknown;
    remove?: boolean;
};

const keyMigrationMap: KeyMigration[] = [
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
function isLegacyCanonicalSqliteBlock(block: unknown): boolean {
    if (block == null || typeof block !== 'object' || Array.isArray(block)) {
        return false;
    }
    const { slices, ...rest } = block as Record<string, unknown>;
    const expectedTopLevel = Object.fromEntries(LEGACY_CANONICAL_SQLITE_FLAG_KEYS.map(key => [key, false]));
    if (!_.isEqual(rest, expectedTopLevel)) {
        return false;
    }
    return slices === undefined
        || _.isEqual(slices, { managedMedia: LEGACY_CANONICAL_SQLITE_MANAGED_MEDIA_BLOCK });
}

function migrateKeys(config: Record<string, unknown>) {
    for (const { oldKey, newKey, migrate, remove } of keyMigrationMap) {
        const oldEnvKey = keyToEnv(oldKey);
        const newEnvKey = keyToEnv(newKey);
        if (process.env[oldEnvKey] && !process.env[newEnvKey]) {
            process.env[newEnvKey] = String(migrate(process.env[oldEnvKey]));
            delete process.env[oldEnvKey];
            console.warn(color.yellow(`Warning: Using a deprecated environment variable: ${oldEnvKey}. Please use ${newEnvKey} instead.`));
        }
        if (_.has(config, oldKey)) {
            if (!remove) _.set(config, newKey, migrate(_.get(config, oldKey)));
            _.unset(config, oldKey);
        }
    }

    if (isLegacyCanonicalSqliteBlock(_.get(config, 'features.storage.canonicalSqlite'))) {
        _.unset(config, 'features.storage.canonicalSqlite');
    }
}

function applyDefaults(config: Record<string, unknown>, defaults: AppConfig) {
    return _.mergeWith({}, defaults, config, (_defaultValue, value) => Array.isArray(value) ? value : undefined);
}

/** Prepare the canonical config, migrating an adjacent legacy YAML file once. */
export function prepareConfig(requestedPath: string): { configPath: string; config: AppConfig } {
    const configPath = canonicalConfigPath(requestedPath);
    const templatePath = path.join(serverDirectory, 'default/config.jsonc');
    const template = fs.readFileSync(templatePath, 'utf8');
    const defaults = parseConfig(template, templatePath);

    if (fs.existsSync(configPath)) {
        const config = readConfigFile(configPath);
        migrateKeys(config);
        return { configPath, config: validateConfig(applyDefaults(config, defaults), configPath) };
    }

    const legacyPaths = configPath !== requestedPath ? [requestedPath] : /\.jsonc$/i.test(configPath)
        ? ['.yaml', '.yml'].map(extension => configPath.replace(/\.jsonc$/i, extension)) : [];
    const legacyPath = legacyPaths.find(filename => fs.existsSync(filename));
    if (legacyPath) {
        const value: unknown = yaml.parse(fs.readFileSync(legacyPath, 'utf8')) ?? {};
        if (!_.isPlainObject(value)) throw new Error(`Invalid configuration in ${legacyPath}: expected a mapping`);
        const original = value as Record<string, unknown>;
        const config = _.cloneDeep(original);
        migrateKeys(config);
        // The old YAML loader expanded arrays only when missing or migrated keys caused a rewrite.
        if (!_.isEqual(config, original) || !_.isEqual(config, applyDefaults(config, defaults))) {
            _.defaultsDeep(config, defaults);
        }
        for (const key of ['port', 'browserLaunch.port', 'heartbeatInterval', 'cors.maxAge']) {
            const value = _.get(config, key);
            if (typeof value === 'string' && Number.isFinite(Number.parseFloat(value))) {
                _.set(config, key, Number.parseFloat(value));
            }
        }
        const migrated = validateConfig(config, legacyPath);
        const output = `// Migrated from ${JSON.stringify(path.basename(legacyPath))}. The original file was kept.\n${JSON.stringify(migrated, null, 2)}\n`;
        writeFileAtomicSync(configPath, output, { mode: fs.statSync(legacyPath).mode & 0o777 });
        console.log(`Migrated ${legacyPath} to ${configPath}.`);
        return { configPath, config: migrated };
    }

    migrateKeys(defaults);
    console.warn(color.yellow(`Warning: configuration not found at ${configPath}. Creating a new one with default values.`));
    writeFileAtomicSync(configPath, template);
    return { configPath, config: defaults };
}

export function initConfig(requestedPath: string): string {
    const { configPath, config } = prepareConfig(requestedPath);
    console.log('Using config path:', color.green(configPath));
    setConfigFilePath(configPath, config);
    return configPath;
}
