import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const DEFAULT_MODE_ENV_VAR = 'EMBERDESK_DERIVED_SQLITE_MODE';
const DEFAULT_RESET_THRESHOLD = 3;
const META_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`;

export const DERIVED_SQLITE_MODES = Object.freeze({
    AUTO: 'auto',
    FORCE_ON: 'force_on',
    FORCE_OFF: 'force_off',
});

function loadDatabaseSync() {
    try {
        return require('node:sqlite').DatabaseSync;
    } catch {
        return undefined;
    }
}

function hasOption(options, key) {
    return Object.prototype.hasOwnProperty.call(options, key);
}

function getStateKey(userRoot, key) {
    return `${userRoot}\0${key}`;
}

function removeDatabaseFiles(dbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
}

function normalizeErrorMessage(error) {
    return String(error?.message ?? error ?? '');
}

/**
 * @param {object} [options]
 * @param {typeof import('node:sqlite').DatabaseSync} [options.DatabaseSync]
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [options.env]
 * @param {{info?: Function, warn?: Function}} [options.logger]
 * @param {number} [options.resetThreshold]
 */
export function createDerivedSqliteManager(options = {}) {
    const DatabaseSync = hasOption(options, 'DatabaseSync') ? options.DatabaseSync : loadDatabaseSync();
    const env = options.env ?? process.env;
    const logger = options.logger ?? console;
    const resetThreshold = options.resetThreshold ?? DEFAULT_RESET_THRESHOLD;
    const states = new Map();

    /**
     * @param {string|undefined} value
     */
    function parseMode(value) {
        const mode = String(value ?? DERIVED_SQLITE_MODES.AUTO).toLowerCase();
        if (mode === DERIVED_SQLITE_MODES.FORCE_ON || mode === DERIVED_SQLITE_MODES.FORCE_OFF) {
            return mode;
        }
        return DERIVED_SQLITE_MODES.AUTO;
    }

    /**
     * @param {string} modeEnvVar
     */
    function getMode(modeEnvVar = DEFAULT_MODE_ENV_VAR) {
        return parseMode(env[modeEnvVar]);
    }

    /**
     * @param {string} userRoot
     * @param {string} key
     */
    function getOrCreateState(userRoot, key) {
        const stateKey = getStateKey(userRoot, key);
        let state = states.get(stateKey);
        if (!state) {
            state = {
                key,
                userRoot,
                db: null,
                dbPath: null,
                schemaVersion: null,
                resetCount: 0,
                disabledReason: null,
            };
            states.set(stateKey, state);
        }
        return state;
    }

    /**
     * @param {object} details
     */
    function logStatus(details) {
        logger.info?.('Derived SQLite sidecar status', details);
    }

    /**
     * @param {{
     *   userRoot: string,
     *   key: string,
     *   filename: string,
     *   schemaVersion: number,
     *   modeEnvVar?: string,
     * }} options
     */
    function getStatus(options) {
        const mode = getMode(options.modeEnvVar);
        const state = states.get(getStateKey(options.userRoot, options.key));
        const dbPath = state?.dbPath ?? path.join(options.userRoot, '_cache', options.filename);
        const nodeSqliteAvailable = typeof DatabaseSync === 'function';
        const modeDisabled = mode === DERIVED_SQLITE_MODES.FORCE_OFF;
        const disabledReason = state?.disabledReason ?? (modeDisabled ? 'force_off' : (!nodeSqliteAvailable ? 'unsupported' : null));

        return {
            supported: nodeSqliteAvailable && !modeDisabled && !state?.disabledReason,
            mode,
            dbPath,
            open: !!state?.db,
            schemaVersion: state?.schemaVersion ?? options.schemaVersion,
            resetCount: state?.resetCount ?? 0,
            disabledReason,
        };
    }

    /**
     * @param {{
     *   key: string,
     *   schemaVersion: number,
     *   modeEnvVar?: string,
     * }} options
     */
    function getStartupStatus(options) {
        const mode = getMode(options.modeEnvVar);
        const nodeSqliteAvailable = typeof DatabaseSync === 'function';
        const modeDisabled = mode === DERIVED_SQLITE_MODES.FORCE_OFF;
        return {
            supported: nodeSqliteAvailable && !modeDisabled,
            mode,
            nodeSqliteAvailable,
            schemaVersion: options.schemaVersion,
            action: modeDisabled ? 'disabled' : (nodeSqliteAvailable ? 'available' : 'unsupported'),
            disabledReason: modeDisabled ? 'force_off' : (!nodeSqliteAvailable ? 'unsupported' : null),
        };
    }

    /**
     * @param {{
     *   key: string,
     *   schemaVersion: number,
     *   modeEnvVar?: string,
     * }} options
     */
    function logStartupStatus(options) {
        logStatus({
            ...getStartupStatus(options),
            key: options.key,
            dbPath: null,
        });
    }

    /**
     * @param {import('node:sqlite').DatabaseSync} db
     */
    function applyPragmas(db) {
        db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA temp_store = MEMORY;
        `);
    }

    /**
     * @param {{
     *   userRoot: string,
     *   key: string,
     *   filename: string,
     *   schemaVersion: number,
     *   initialize: (db: import('node:sqlite').DatabaseSync) => void,
     *   resetSchema: (db: import('node:sqlite').DatabaseSync) => void,
     *   modeEnvVar?: string,
     * }} options
     * @param {boolean} allowRetry
     * @returns {import('node:sqlite').DatabaseSync|null}
     */
    function openInternal(options, allowRetry) {
        const mode = getMode(options.modeEnvVar);
        const state = getOrCreateState(options.userRoot, options.key);
        const dbPath = path.join(options.userRoot, '_cache', options.filename);
        state.dbPath = dbPath;
        state.schemaVersion = options.schemaVersion;

        if (mode === DERIVED_SQLITE_MODES.FORCE_OFF) {
            logStatus({
                mode,
                nodeSqliteAvailable: typeof DatabaseSync === 'function',
                dbPath,
                schemaVersion: options.schemaVersion,
                action: 'disabled',
                disabledReason: 'force_off',
            });
            return null;
        }

        if (state.disabledReason) {
            logStatus({
                mode,
                nodeSqliteAvailable: typeof DatabaseSync === 'function',
                dbPath,
                schemaVersion: options.schemaVersion,
                action: 'disabled',
                disabledReason: state.disabledReason,
            });
            return null;
        }

        if (typeof DatabaseSync !== 'function') {
            logStatus({
                mode,
                nodeSqliteAvailable: false,
                dbPath,
                schemaVersion: options.schemaVersion,
                action: 'unsupported',
                disabledReason: 'unsupported',
            });
            return null;
        }

        if (state.db) {
            return state.db;
        }

        let db = null;
        try {
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            db = new DatabaseSync(dbPath);
            applyPragmas(db);
            db.exec(META_TABLE_SQL);
            options.initialize(db);

            let action = 'opened';
            const currentVersion = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version')?.value;
            if (Number(currentVersion) !== Number(options.schemaVersion)) {
                options.resetSchema(db);
                db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(options.schemaVersion));
                action = 'migrated';
            }

            state.db = db;
            state.dbPath = dbPath;
            state.schemaVersion = options.schemaVersion;
            state.disabledReason = null;
            logStatus({
                mode,
                nodeSqliteAvailable: true,
                dbPath,
                schemaVersion: options.schemaVersion,
                action,
                resetCount: state.resetCount,
            });
            return db;
        } catch (error) {
            if (db) {
                try {
                    db.close();
                } catch {
                    // Ignore close failures while recovering derived state.
                }
            }
            reset(options.userRoot, options.key, {
                dbPath,
                reason: normalizeErrorMessage(error),
                removeFiles: true,
            });
            if (allowRetry) {
                return openInternal(options, false);
            }
            throw error;
        }
    }

    /**
     * @param {{
     *   userRoot: string,
     *   key: string,
     *   filename: string,
     *   schemaVersion: number,
     *   initialize: (db: import('node:sqlite').DatabaseSync) => void,
     *   resetSchema: (db: import('node:sqlite').DatabaseSync) => void,
     *   modeEnvVar?: string,
     * }} options
     */
    function open(options) {
        return openInternal(options, true);
    }

    /**
     * @param {string} userRoot
     * @param {string} key
     * @param {{dbPath?: string, reason?: string, removeFiles?: boolean}} [options]
     */
    function reset(userRoot, key, options = {}) {
        const state = states.get(getStateKey(userRoot, key));
        if (!state) {
            return;
        }
        const dbPath = options.dbPath ?? state.dbPath;
        if (state.db) {
            try {
                state.db.close();
            } catch {
                // Ignore close failures while recovering derived state.
            }
            state.db = null;
        }

        state.resetCount++;
        if (options.removeFiles && dbPath) {
            removeDatabaseFiles(dbPath);
        }
        if (state.resetCount >= resetThreshold) {
            state.disabledReason = 'reset_threshold_exceeded';
        }
    }

    /**
     * @param {string} [key]
     */
    function dispose(key) {
        for (const [stateKey, state] of states.entries()) {
            if (key && state.key !== key) {
                continue;
            }
            if (state.db) {
                try {
                    state.db.close();
                } catch {
                    // Ignore shutdown close failures.
                }
                state.db = null;
            }
            states.delete(stateKey);
        }
    }

    return {
        parseMode,
        getMode,
        getStartupStatus,
        logStartupStatus,
        getStatus(userRoot, key, options) {
            return getStatus({ userRoot, key, ...options });
        },
        open,
        reset,
        dispose,
    };
}

export const derivedSqliteManager = createDerivedSqliteManager();

export const parseDerivedSqliteMode = derivedSqliteManager.parseMode;
export const getDerivedSqliteMode = derivedSqliteManager.getMode;
export const getDerivedSqliteStartupStatus = derivedSqliteManager.getStartupStatus;
export const logDerivedSqliteStartupStatus = derivedSqliteManager.logStartupStatus;
export const getDerivedSqliteSidecarStatus = derivedSqliteManager.getStatus;
export const openDerivedSqliteSidecar = derivedSqliteManager.open;
export const resetDerivedSqliteSidecar = derivedSqliteManager.reset;
export const disposeDerivedSqliteSidecars = derivedSqliteManager.dispose;
