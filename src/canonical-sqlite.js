import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { isPathUnderParent } from './util.js';

const require = createRequire(import.meta.url);

export const DEFAULT_CANONICAL_SQLITE_FILENAME = 'emberdesk.sqlite';

export class CanonicalSqliteDisabledError extends Error {
    /**
     * @param {string} message
     * @param {string} reason
     */
    constructor(message, reason) {
        super(message);
        this.name = 'CanonicalSqliteDisabledError';
        this.reason = reason;
    }
}

function loadDatabaseSync() {
    try {
        return require('node:sqlite').DatabaseSync;
    } catch {
        return undefined;
    }
}

function normalizeStatePath(value) {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getStateKey(dbPath) {
    return normalizeStatePath(dbPath);
}

function normalizeErrorMessage(error) {
    return String(error?.message ?? error ?? '');
}

function normalizeFeatureFlags(featureFlags = {}) {
    return {
        enabled: !!featureFlags.enabled,
        strict: !!featureFlags.strict,
    };
}

function isPromiseLike(value) {
    return !!value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}

export function resolveCanonicalStorageRoot(directories) {
    if (!directories?.root) {
        throw new Error('Canonical SQLite requires user directories.root');
    }

    const userRoot = path.resolve(directories.root);
    const storageRoot = path.resolve(directories.storage ?? path.join(userRoot, 'storage'));
    if (storageRoot === userRoot || !isPathUnderParent(userRoot, storageRoot)) {
        throw new Error(`Canonical SQLite storage path escapes user root: ${storageRoot}`);
    }

    return storageRoot;
}

export function resolveCanonicalDatabasePath(directories, filename = DEFAULT_CANONICAL_SQLITE_FILENAME) {
    const storageRoot = resolveCanonicalStorageRoot(directories);
    const dbPath = path.resolve(storageRoot, filename);
    if (dbPath === storageRoot || !isPathUnderParent(storageRoot, dbPath)) {
        throw new Error(`Canonical SQLite path escapes storage directory: ${filename}`);
    }
    return { storageRoot, dbPath };
}

export function applyCanonicalPragmas(db) {
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        PRAGMA temp_store = MEMORY;
    `);
}

export function withCanonicalTransaction(db, fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = fn(db);
        if (isPromiseLike(result)) {
            throw new TypeError('withCanonicalTransaction only supports synchronous callbacks');
        }
        db.exec('COMMIT');
        return result;
    } catch (error) {
        try {
            db.exec('ROLLBACK');
        } catch {
            // Ignore rollback failures and rethrow the original error.
        }
        throw error;
    }
}

/**
 * @param {object} [options]
 * @param {typeof import('node:sqlite').DatabaseSync} [options.DatabaseSync]
 * @param {{info?: Function, warn?: Function}} [options.logger]
 */
export function createCanonicalSqliteManager(options = {}) {
    const DatabaseSync = Object.prototype.hasOwnProperty.call(options, 'DatabaseSync')
        ? options.DatabaseSync
        : loadDatabaseSync();
    const logger = options.logger ?? console;
    const states = new Map();

    function logStatus(details) {
        logger.info?.('Canonical SQLite status', details);
    }

    function getState(directories, filename = DEFAULT_CANONICAL_SQLITE_FILENAME) {
        const { storageRoot, dbPath } = resolveCanonicalDatabasePath(directories, filename);
        const stateKey = getStateKey(dbPath);
        let state = states.get(stateKey);
        if (!state) {
            state = {
                db: null,
                storageRoot,
                dbPath,
                lastAction: 'idle',
                lastError: null,
            };
            states.set(stateKey, state);
        } else {
            state.storageRoot = storageRoot;
            state.dbPath = dbPath;
        }
        return state;
    }

    function buildStatus({
        handle,
        directories,
        filename = DEFAULT_CANONICAL_SQLITE_FILENAME,
        featureFlags,
        migrationBlockedReason = null,
    }) {
        const { storageRoot, dbPath } = resolveCanonicalDatabasePath(directories, filename);
        const flags = normalizeFeatureFlags(featureFlags);
        const state = states.get(getStateKey(dbPath));
        let disabledReason = null;
        if (!flags.enabled) {
            disabledReason = 'disabled';
        } else if (typeof DatabaseSync !== 'function') {
            disabledReason = 'unsupported';
        } else if (migrationBlockedReason) {
            disabledReason = 'migration_blocked';
        }

        return {
            handle,
            filename,
            storageRoot,
            dbPath,
            enabled: flags.enabled,
            strict: flags.strict,
            supported: typeof DatabaseSync === 'function',
            open: !!state?.db,
            disabledReason,
            migrationBlockedReason: migrationBlockedReason ?? null,
            lastAction: state?.lastAction ?? 'idle',
            lastError: state?.lastError ?? null,
        };
    }

    function open({
        handle,
        directories,
        filename = DEFAULT_CANONICAL_SQLITE_FILENAME,
        featureFlags,
        migrationBlockedReason = null,
    }) {
        const status = buildStatus({
            handle,
            directories,
            filename,
            featureFlags,
            migrationBlockedReason,
        });
        const state = getState(directories, filename);

        if (!status.enabled) {
            state.lastAction = 'disabled';
            logStatus({ ...status, action: 'disabled' });
            return null;
        }

        if (!status.supported) {
            state.lastAction = 'unsupported';
            logStatus({ ...status, action: 'unsupported' });
            if (status.strict) {
                throw new CanonicalSqliteDisabledError(
                    `Canonical SQLite is unavailable: ${status.disabledReason}`,
                    status.disabledReason,
                );
            }
            return null;
        }

        if (status.disabledReason === 'migration_blocked') {
            state.lastAction = 'migration_blocked';
            logStatus({ ...status, action: 'migration_blocked' });
            if (status.strict) {
                throw new CanonicalSqliteDisabledError(
                    `Canonical SQLite is blocked: ${migrationBlockedReason}`,
                    'migration_blocked',
                );
            }
            return null;
        }

        if (state.db) {
            return state.db;
        }

        let db = null;
        try {
            fs.mkdirSync(state.storageRoot, { recursive: true });
            db = new DatabaseSync(state.dbPath);
            applyCanonicalPragmas(db);
            state.db = db;
            state.lastAction = 'opened';
            state.lastError = null;
            logStatus({
                ...buildStatus({ handle, directories, filename, featureFlags, migrationBlockedReason }),
                action: 'opened',
            });
            return db;
        } catch (error) {
            if (db) {
                try {
                    db.close();
                } catch {
                    // Ignore close failures while failing closed.
                }
            }
            state.db = null;
            state.lastAction = 'open_failed';
            state.lastError = normalizeErrorMessage(error);
            logStatus({
                ...buildStatus({ handle, directories, filename, featureFlags, migrationBlockedReason }),
                action: 'open_failed',
                lastError: state.lastError,
            });
            if (status.strict) {
                throw error;
            }
            return null;
        }
    }

    function close(directories, filename = DEFAULT_CANONICAL_SQLITE_FILENAME) {
        const { dbPath } = resolveCanonicalDatabasePath(directories, filename);
        const state = states.get(getStateKey(dbPath));
        if (!state?.db) {
            return false;
        }

        try {
            state.db.close();
            state.db = null;
            state.lastAction = 'closed';
            state.lastError = null;
        } catch (error) {
            state.lastAction = 'close_failed';
            state.lastError = normalizeErrorMessage(error);
            throw error;
        }
        return true;
    }

    function dispose() {
        for (const state of states.values()) {
            if (state.db) {
                try {
                    state.db.close();
                } catch {
                    // Ignore shutdown close failures.
                }
                state.db = null;
            }
        }
        states.clear();
    }

    return {
        getStatus(options) {
            return buildStatus(options);
        },
        open,
        close,
        withTransaction: withCanonicalTransaction,
        dispose,
    };
}

export const canonicalSqliteManager = createCanonicalSqliteManager();
export const getCanonicalStorageStatus = canonicalSqliteManager.getStatus;
export const openCanonicalDatabase = canonicalSqliteManager.open;
export const closeCanonicalDatabase = canonicalSqliteManager.close;
export const disposeCanonicalDatabases = canonicalSqliteManager.dispose;
