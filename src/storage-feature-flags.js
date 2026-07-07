import { getConfigValue } from './util.js';

const STORAGE_FLAG_PREFIX = 'features.storage.canonicalSqlite';

function getStorageFlag(flagName) {
    return getConfigValue(`${STORAGE_FLAG_PREFIX}.${flagName}`, false, 'boolean');
}

export function getCanonicalSqliteFeatureFlags() {
    const enabled = getStorageFlag('enabled');
    return {
        enabled,
        shadowImport: enabled && getStorageFlag('shadowImport'),
        reads: enabled && getStorageFlag('reads'),
        writes: enabled && getStorageFlag('writes'),
        chatStats: enabled && getStorageFlag('chatStats'),
        strict: enabled && getStorageFlag('strict'),
    };
}
