/**
 * Wire log viewer API.
 *
 * Exposes the diagnostic records written by `wire-log-recorder.js` for the
 * in-app viewer. The store root is always derived from the authenticated
 * user's directories; a client can filter, read and delete, but can never
 * name a path.
 *
 * Every record id and date reaching the store is validated there, so a
 * traversal attempt surfaces as a rejected promise with `invalid` in the
 * message. Those are mapped to 400 here instead of bubbling into the global
 * error handler, which would report them as server faults.
 */

import express from 'express';
import path from 'node:path';

import { deleteRecord, listRecords, readRecord } from '../wire-log-store.js';
import { normalizeWireLogOptions } from '../wire-log-recorder.js';
import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { ensureCanonicalSliceBackend } from '../canonical-backend.js';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { getDefaultTemplateFile } from './content-manager.js';
import {
    ensureCanonicalSettingsDocument,
    getCanonicalSettingsDocument,
    upsertCanonicalSettingsDocument,
} from './settings-store.js';

const SETTINGS_FEATURE_KEY = 'feature_settings';
const WIRE_LOG_SETTINGS_KEY = 'wire_log';
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

/**
 * Resolves the wire log root for the authenticated user.
 * @param {import('express').Request} request Express request
 * @returns {string} Absolute wire log root
 */
function getStoreRoot(request) {
    return path.join(request.user.directories.root, 'wire-logs');
}

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

/**
 * Mirrors the settings router gate: canonical flags are only readable once the
 * CLI args or an environment override exist.
 * @returns {boolean} Whether canonical flags can be read
 */
function canReadCanonicalFeatureFlags() {
    if (globalThis.COMMAND_LINE_ARGS != null) {
        return true;
    }
    return Object.keys(process.env).some(key => key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_'));
}

/**
 * Opens the canonical settings database for a request.
 * @param {import('express').Request} request Express request
 * @param {{enabled: boolean, strict: boolean}} featureFlags Settings slice flags
 * @returns {object|null} Database handle, or null when unavailable
 */
function openSettingsDb(request, featureFlags, phase = 'reads') {
    const handle = getRequestHandle(request);
    try {
        const db = canonicalSqliteManager.open({
            handle,
            directories: request.user.directories,
            featureFlags: {
                enabled: true,
                strict: !!featureFlags.strict,
            },
        });
        if (!db) {
            return null;
        }
        const migrationStatus = runCanonicalMigrations(db, { strict: !!featureFlags.strict });
        if (!migrationStatus.ok) return null;
        const slice = getCanonicalStorageSlice('settings');
        const persistedAuditStatus = getPersistedCanonicalAuditStatus(db, { scope: slice.auditScope });
        if (persistedAuditStatus.blocking) return null;
        const rollback = slice.getRollbackBlockers({ db, featureFlags, phase, persistedAuditStatus });
        return rollback.ok ? db : null;
    } catch {
        return null;
    }
}

/**
 * Reads the persisted wire log options from the canonical settings document.
 * @param {import('express').Request} request Express request
 * @returns {Promise<{ok: true, raw: object} | {ok: false, reason: string}>} Stored fragment
 */
export async function readWireLogSettings(request) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }
    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled' };
    }
    if (!featureFlags.reads) {
        return { ok: false, reason: 'canonical_reads_disabled' };
    }
    await ensureCanonicalSliceBackend('settings', request.user.directories, getRequestHandle(request));
    const db = openSettingsDb(request, featureFlags);
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable' };
    }
    const ensured = ensureCanonicalSettingsDocument(db, {
        userId: getRequestHandle(request),
        defaults: getDefaultTemplateFile('settings-defaults.json') ?? {},
    });
    if (!ensured.ok || !ensured.document) {
        return { ok: false, reason: ensured.reason ?? 'settings_document_missing' };
    }
    const featureSettings = ensured.document.payload?.[SETTINGS_FEATURE_KEY];
    const raw = featureSettings && typeof featureSettings === 'object' && !Array.isArray(featureSettings)
        ? featureSettings[WIRE_LOG_SETTINGS_KEY]
        : undefined;
    return { ok: true, raw: raw && typeof raw === 'object' ? raw : {} };
}

/**
 * Merges a wire log patch into the canonical settings document. Only the
 * `feature_settings.wire_log` leaf is replaced; every other key is preserved
 * byte-for-byte so this route cannot clobber unrelated settings.
 * @param {import('express').Request} request Express request
 * @param {unknown} patch Requested settings fragment
 * @returns {Promise<object>} Normalized options, or a failure descriptor
 */
async function writeWireLogSettings(request, patch) {
    if (!canReadCanonicalFeatureFlags()) {
        return { ok: false, reason: 'canonical_flags_unavailable' };
    }
    const settingsSlice = getCanonicalStorageSlice('settings');
    const featureFlags = settingsSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled' };
    }
    if (!featureFlags.reads || !featureFlags.writes) {
        return { ok: false, reason: !featureFlags.reads ? 'canonical_reads_disabled' : 'canonical_writes_disabled' };
    }
    await ensureCanonicalSliceBackend('settings', request.user.directories, getRequestHandle(request));
    const db = openSettingsDb(request, featureFlags, 'writes');
    if (!db) {
        return { ok: false, reason: 'canonical_storage_unavailable' };
    }
    const handle = getRequestHandle(request);
    const ensured = ensureCanonicalSettingsDocument(db, {
        userId: handle,
        defaults: getDefaultTemplateFile('settings-defaults.json') ?? {},
    });
    if (!ensured.ok || !ensured.document) {
        return { ok: false, reason: ensured.reason ?? 'settings_document_missing' };
    }

    const current = getCanonicalSettingsDocument(db, { userId: handle });
    if (!current) {
        return { ok: false, reason: 'settings_document_missing' };
    }
    const payload = current.payload && typeof current.payload === 'object' && !Array.isArray(current.payload)
        ? current.payload
        : {};
    const featureSettings = payload[SETTINGS_FEATURE_KEY] && typeof payload[SETTINGS_FEATURE_KEY] === 'object'
        && !Array.isArray(payload[SETTINGS_FEATURE_KEY])
        ? { ...payload[SETTINGS_FEATURE_KEY] }
        : {};
    const existing = featureSettings[WIRE_LOG_SETTINGS_KEY] && typeof featureSettings[WIRE_LOG_SETTINGS_KEY] === 'object'
        && !Array.isArray(featureSettings[WIRE_LOG_SETTINGS_KEY])
        ? featureSettings[WIRE_LOG_SETTINGS_KEY]
        : {};
    const merged = { ...existing, ...patch };
    const normalized = normalizeWireLogOptions(merged);
    featureSettings[WIRE_LOG_SETTINGS_KEY] = normalized;

    const saved = upsertCanonicalSettingsDocument(db, {
        userId: handle,
        payload: { ...payload, [SETTINGS_FEATURE_KEY]: featureSettings },
        expectedRevision: current.revision,
    });
    if (!saved.ok) {
        return { ok: false, reason: 'settings_revision_conflict' };
    }
    return { ok: true, options: normalized };
}

/**
 * Recognizes the store's validation failures without depending on its message
 * being a stable contract beyond the `invalid` marker.
 * @param {unknown} error Thrown value
 * @returns {boolean} Whether the failure was a rejected id or date
 */
function isInvalidInputError(error) {
    return /invalid/.test(String(error?.message ?? ''));
}

function sendBadRequest(response, error) {
    return response.status(400).json({
        error: true,
        message: String(error?.message ?? 'invalid request'),
    });
}

/**
 * Parses the `limit` query parameter, clamping to the viewer's page size.
 * @param {unknown} raw Raw query value
 * @returns {number} Effective limit
 */
function parseLimit(raw) {
    if (raw == null || raw === '') {
        return DEFAULT_LIST_LIMIT;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_LIST_LIMIT;
    }
    return Math.min(Math.floor(value), MAX_LIST_LIMIT);
}

function firstQueryValue(raw) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value == null || value === '') {
        return undefined;
    }
    return String(value);
}

export const router = express.Router();

router.get('/', async (request, response) => {
    try {
        const records = await listRecords(getStoreRoot(request), {
            date: firstQueryValue(request.query.date),
            status: firstQueryValue(request.query.status),
            type: firstQueryValue(request.query.type),
            chatId: firstQueryValue(request.query.chatId),
            limit: parseLimit(firstQueryValue(request.query.limit)),
        });
        return response.json(records);
    } catch (error) {
        if (isInvalidInputError(error)) {
            return sendBadRequest(response, error);
        }
        console.error(error);
        return response.sendStatus(500);
    }
});

// Registered before `/:id`, otherwise `config` is captured as a record id.
router.get('/config', async (request, response) => {
    try {
        const state = await readWireLogSettings(request);
        if (!state.ok) {
            // The viewer still gets a usable answer: logging is opt-out, so an
            // unreadable settings document resolves to "on with defaults".
            return response.json({ ...normalizeWireLogOptions({}), persisted: false, reason: state.reason });
        }
        return response.json({ ...normalizeWireLogOptions(state.raw), persisted: true });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/config', async (request, response) => {
    try {
        const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
            ? request.body
            : {};
        const state = await writeWireLogSettings(request, body);
        if (!state.ok) {
            return response.status(503).json({
                error: true,
                message: 'canonical settings unavailable',
                reason: state.reason,
            });
        }
        return response.json(state.options);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.get('/:id', async (request, response) => {
    try {
        const record = await readRecord(getStoreRoot(request), request.params.id);
        if (!record) {
            return response.status(404).json({ error: true, message: 'wire log record not found' });
        }
        return response.json(record);
    } catch (error) {
        if (isInvalidInputError(error)) {
            return sendBadRequest(response, error);
        }
        console.error(error);
        return response.sendStatus(500);
    }
});

router.delete('/:id', async (request, response) => {
    try {
        const deleted = await deleteRecord(getStoreRoot(request), request.params.id);
        return response.json({ ok: true, deleted });
    } catch (error) {
        if (isInvalidInputError(error)) {
            return sendBadRequest(response, error);
        }
        console.error(error);
        return response.sendStatus(500);
    }
});
