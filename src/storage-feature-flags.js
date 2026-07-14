import { getConfig, getConfigValue, keyToEnv } from './util.js';

const STORAGE_FLAG_PREFIX = 'features.storage.canonicalSqlite';
const BASE_STORAGE_FLAG_NAMES = Object.freeze([
    'enabled',
    'shadowImport',
    'reads',
    'writes',
    'strict',
]);

function getStorageFlagNames(supportsChatStats) {
    return supportsChatStats
        ? ['enabled', 'shadowImport', 'reads', 'writes', 'chatStats', 'strict']
        : BASE_STORAGE_FLAG_NAMES;
}

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

function getObjectValue(object, path) {
    return path.split('.').reduce((value, key) => (
        value != null && Object.prototype.hasOwnProperty.call(value, key)
            ? value[key]
            : undefined
    ), object);
}

function getExplicitConfigValue(path) {
    const environmentKey = keyToEnv(path);
    if (Object.prototype.hasOwnProperty.call(process.env, environmentKey)) {
        return {
            present: true,
            value: process.env[environmentKey],
        };
    }

    const value = getObjectValue(getConfig(), path);
    return {
        present: value !== undefined,
        value,
    };
}

function parseExplicitBoolean(value) {
    if (typeof value === 'boolean') {
        return { ok: true, value };
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
            return { ok: true, value: true };
        }
        if (normalized === 'false') {
            return { ok: true, value: false };
        }
    }
    return { ok: false, value: false };
}

function getSliceOverride(overrides, flagKey) {
    const snakeCaseFlagKey = flagKey.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return overrides?.slices?.[flagKey]
        ?? overrides?.slices?.[snakeCaseFlagKey]
        ?? overrides?.[flagKey]
        ?? overrides?.[snakeCaseFlagKey]
        ?? null;
}

function buildDisabledSnapshot({ flagNames, reasonCode = null, source = 'disabled_by_enabled' }) {
    return {
        featureFlags: Object.fromEntries(flagNames.map(flagName => [flagName, false])),
        sources: Object.fromEntries(flagNames.map(flagName => [flagName, source])),
        resolution: {
            ok: reasonCode == null,
            reasonCode,
        },
    };
}

function buildGlobalOverrideFlags(overrides, flagNames) {
    const values = {};
    for (const flagName of flagNames) {
        const parsed = parseExplicitBoolean(overrides?.[flagName] ?? false);
        if (!parsed.ok) {
            return {
                ok: false,
                flags: null,
            };
        }
        values[flagName] = parsed.value;
    }

    const enabled = values.enabled;
    for (const flagName of flagNames) {
        if (flagName !== 'enabled') {
            values[flagName] = enabled && values[flagName];
        }
    }
    return {
        ok: true,
        flags: values,
    };
}

/**
 * Resolve the effective feature flags for one canonical storage slice.
 * Explicit per-slice settings override matching global settings field-by-field.
 */
export function getCanonicalStorageSliceFeatureFlagSnapshot(options) {
    const {
        flagKey,
        supportsChatStats = false,
        fallbackToGlobal = true,
        overrides = null,
    } = options ?? {};
    const flagNames = getStorageFlagNames(supportsChatStats);

    if (typeof flagKey !== 'string' || flagKey.length === 0) {
        throw new Error('Canonical storage slice flagKey is required.');
    }

    const sliceOverride = overrides == null
        ? null
        : getSliceOverride(overrides, flagKey);
    const globalSource = overrides == null ? 'global' : 'global_override';
    const sliceSource = overrides == null ? 'slice' : 'slice_override';
    const globalFeatureFlags = overrides == null ? getCanonicalSqliteFeatureFlags() : null;
    const globalResult = overrides == null
        ? {
            ok: true,
            flags: Object.fromEntries(flagNames.map(flagName => [
                flagName,
                globalFeatureFlags[flagName] ?? false,
            ])),
        }
        : buildGlobalOverrideFlags(overrides, flagNames);

    if (!globalResult.ok) {
        return buildDisabledSnapshot({
            flagNames,
            reasonCode: 'invalid_slice_flag_configuration',
            source: 'invalid',
        });
    }

    const featureFlags = {};
    const sources = {};
    for (const flagName of flagNames) {
        let value = globalResult.flags[flagName];
        let source = globalSource;
        let explicit = null;

        if (overrides == null) {
            explicit = getExplicitConfigValue(`${STORAGE_FLAG_PREFIX}.slices.${flagKey}.${flagName}`);
        } else if (sliceOverride != null && Object.prototype.hasOwnProperty.call(sliceOverride, flagName)) {
            explicit = {
                present: true,
                value: sliceOverride[flagName],
            };
        }

        if (explicit?.present) {
            const parsed = parseExplicitBoolean(explicit.value);
            if (!parsed.ok) {
                return buildDisabledSnapshot({
                    flagNames,
                    reasonCode: 'invalid_slice_flag_configuration',
                    source: 'invalid',
                });
            }
            value = parsed.value;
            source = sliceSource;
        } else if (!fallbackToGlobal) {
            value = false;
            source = 'default';
        }

        featureFlags[flagName] = value;
        sources[flagName] = source;
    }

    if (!featureFlags.enabled) {
        for (const flagName of flagNames) {
            if (flagName !== 'enabled') {
                featureFlags[flagName] = false;
                sources[flagName] = 'disabled_by_enabled';
            }
        }
    }

    return {
        featureFlags,
        sources,
        resolution: {
            ok: true,
            reasonCode: null,
        },
    };
}

export function getCanonicalManagedMediaFeatureFlags() {
    return getCanonicalStorageSliceFeatureFlagSnapshot({
        flagKey: 'managedMedia',
        fallbackToGlobal: false,
    }).featureFlags;
}
