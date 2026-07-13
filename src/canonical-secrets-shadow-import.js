import fs from 'node:fs';
import path from 'node:path';

import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import {
    getCanonicalSecrets,
    getSecretMigrationMarker,
    hashCanonicalSecretValue,
    listOpenSecretProjectionRepairs,
    replaceCanonicalSecretRecords,
} from './endpoints/canonical-secrets-store.js';
import { uuidv4 } from './util.js';

export const CANONICAL_SECRETS_AUDIT_SCOPE = 'secrets';
export const CANONICAL_SECRETS_FILE = 'secrets.json';
const MIGRATED_KEY = '_migrated';

function getSecretsFilePath(directories) {
    return path.join(directories.root, CANONICAL_SECRETS_FILE);
}

function readSecretsFile(directories) {
    const filePath = getSecretsFilePath(directories);
    if (!fs.existsSync(filePath)) {
        return { exists: false, payload: {}, error: null };
    }
    try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
            return { exists: true, payload: {}, error: new Error('secrets.json root must be an object') };
        }
        return { exists: true, payload, error: null };
    } catch (error) {
        return { exists: true, payload: {}, error };
    }
}

function normalizeSecretRecords(payload, nowMs, existingByKey = {}) {
    const recordsByKey = {};
    const seenRecordIds = new Set();

    const registerRecordId = id => {
        if (seenRecordIds.has(id)) {
            const error = new Error('Secret record IDs must be unique.');
            error.name = 'DuplicateSecretRecordIdError';
            throw error;
        }
        seenRecordIds.add(id);
        return id;
    };

    for (const [key, value] of Object.entries(payload)) {
        if (key === MIGRATED_KEY) {
            continue;
        }
        if (Array.isArray(value)) {
            const records = value
                .filter(record => record && typeof record === 'object' && typeof record.value === 'string')
                .map((record, index) => ({
                    id: registerRecordId(typeof record.id === 'string' && record.id ? record.id : uuidv4()),
                    value: record.value,
                    label: typeof record.label === 'string' ? record.label : key,
                    active: Boolean(record.active),
                    createdAtMs: nowMs + index,
                    updatedAtMs: nowMs + index,
                }));
            if (records.length > 0 && !records.some(record => record.active)) {
                records[0].active = true;
            }
            if (records.length > 0) {
                let activeSeen = false;
                for (const record of records) {
                    if (record.active && activeSeen) {
                        record.active = false;
                    }
                    activeSeen ||= record.active;
                }
                recordsByKey[key] = records;
            }
            continue;
        }
        if (typeof value === 'string' && value.trim()) {
            const existing = (existingByKey[key] ?? [])
                .find(record => record.active && record.value === value);
            recordsByKey[key] = [{
                id: registerRecordId(existing?.id ?? uuidv4()),
                value,
                label: key,
                active: true,
                createdAtMs: existing?.createdAtMs ?? nowMs,
                updatedAtMs: nowMs,
            }];
        }
    }
    return recordsByKey;
}

function getSnapshotHash(recordsByKey) {
    const canonical = Object.keys(recordsByKey).sort().map(key => ({
        key,
        records: recordsByKey[key].map(record => ({
            id: record.id,
            label: record.label,
            active: record.active,
            valueHash: hashCanonicalSecretValue(record.value),
        })),
    }));
    return hashCanonicalSecretValue(JSON.stringify(canonical));
}

function summarizeImport({ handle, entries, reason = null, migrationStatus = null, skipped = false }) {
    const importedCount = entries.filter(entry => entry.status === 'imported').length;
    const updatedCount = entries.filter(entry => entry.status === 'updated').length;
    const unchangedCount = entries.filter(entry => entry.status === 'unchanged').length;
    const failedCount = entries.filter(entry => entry.status === 'error').length;
    return {
        ok: skipped || (reason == null && failedCount === 0 && migrationStatus?.ok !== false),
        handle,
        skipped,
        reason,
        importedCount,
        updatedCount,
        unchangedCount,
        failedCount,
        migrationStatus,
        entries,
    };
}

function keysFromRecords(recordsByKey) {
    return Object.keys(recordsByKey).sort();
}

export function runCanonicalSecretsShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    nowMs = Date.now(),
} = {}) {
    if (!featureFlags?.enabled) {
        return summarizeImport({ handle, skipped: true, reason: 'canonical_storage_disabled', entries: [] });
    }
    if (!featureFlags?.shadowImport) {
        return summarizeImport({ handle, skipped: true, reason: 'shadow_import_disabled', entries: [] });
    }

    const db = manager.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: !!featureFlags.strict },
    });
    if (!db) {
        return summarizeImport({ handle, reason: 'canonical_storage_unavailable', entries: [] });
    }
    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
        nowMs,
    });
    if (!migrationStatus.ok) {
        return summarizeImport({ handle, reason: 'migration_blocked', entries: [], migrationStatus });
    }

    const file = readSecretsFile(directories);
    if (file.error) {
        return summarizeImport({
            handle,
            migrationStatus,
            entries: [{ status: 'error', errorClass: file.error.name || 'Error' }],
        });
    }

    const existingByKey = getCanonicalSecrets(db);
    let recordsByKey;
    try {
        recordsByKey = normalizeSecretRecords(file.payload, nowMs, existingByKey);
    } catch (error) {
        return summarizeImport({
            handle,
            reason: 'invalid_secret_record_ids',
            migrationStatus,
            entries: [{ status: 'error', errorClass: error.name || 'Error' }],
        });
    }
    const snapshotHash = getSnapshotHash(recordsByKey);
    const marker = getSecretMigrationMarker(db);
    const entries = [];

    if (featureFlags.reads && marker) {
        for (const key of keysFromRecords(recordsByKey)) {
            entries.push({ key, status: 'unchanged' });
        }
        return summarizeImport({ handle, entries, migrationStatus });
    }

    const changed = !marker || marker.sourceHash !== snapshotHash;
    if (changed) {
        replaceCanonicalSecretRecords(db, {
            recordsByKey,
            sourceHash: snapshotHash,
            nowMs,
        });
    }
    for (const key of keysFromRecords(recordsByKey)) {
        entries.push({
            key,
            status: changed && !marker ? 'imported' : changed ? 'updated' : 'unchanged',
        });
    }
    return summarizeImport({ handle, entries, migrationStatus });
}

function buildAuditEntry({ key, status, driftTypes, details, auditedAtMs }) {
    return {
        key,
        status,
        drift_types: driftTypes,
        details,
        audited_at_ms: auditedAtMs,
    };
}

export function auditCanonicalSecretsShadowImport({
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
} = {}) {
    const migrationStatus = getCanonicalMigrationStatus(db);
    if (!migrationStatus.ok || migrationStatus.currentVersion !== migrationStatus.targetVersion) {
        return {
            ok: false,
            handle,
            blocking: true,
            hasDrift: false,
            reason: migrationStatus.ok ? 'migration_not_applied' : 'migration_blocked',
            migrationStatus,
            entries: [],
        };
    }
    try {
        db.prepare('SELECT 1 FROM secret_records LIMIT 1').get();
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: secret_records')) {
            return {
                ok: false,
                handle,
                blocking: true,
                hasDrift: false,
                reason: 'migration_not_applied',
                migrationStatus,
                entries: [],
            };
        }
        throw error;
    }

    const file = readSecretsFile(directories);
    const entries = [];
    if (file.error) {
        entries.push(buildAuditEntry({
            key: null,
            status: 'error',
            driftTypes: ['invalid_json'],
            details: { errorClass: file.error.name || 'Error' },
            auditedAtMs,
        }));
    } else {
        const actual = getCanonicalSecrets(db);
        let expected = null;
        try {
            expected = normalizeSecretRecords(file.payload, auditedAtMs, actual);
        } catch (error) {
            entries.push(buildAuditEntry({
                key: null,
                status: 'error',
                driftTypes: ['invalid_secret_record_ids'],
                details: { errorClass: error.name || 'Error' },
                auditedAtMs,
            }));
        }

        if (expected) {
            const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
            for (const key of Array.from(keys).sort()) {
                const expectedRecords = expected[key] ?? [];
                const actualRecords = actual[key] ?? [];
                const expectedComparable = expectedRecords.map(record => ({
                    id: record.id,
                    label: record.label,
                    active: record.active,
                    valueHash: hashCanonicalSecretValue(record.value),
                }));
                const actualComparable = actualRecords.map(record => ({
                    id: record.id,
                    label: record.label,
                    active: record.active,
                    valueHash: hashCanonicalSecretValue(record.value),
                }));
                if (JSON.stringify(expectedComparable) === JSON.stringify(actualComparable)) {
                    entries.push(buildAuditEntry({
                        key,
                        status: 'clean',
                        driftTypes: [],
                        details: {},
                        auditedAtMs,
                    }));
                    continue;
                }
                const driftTypes = [];
                if (expectedRecords.length === 0) {
                    driftTypes.push('missing_projection_records');
                } else if (actualRecords.length === 0) {
                    driftTypes.push('missing_db_records');
                } else {
                    if (expectedComparable.some((record, index) => record.id !== actualComparable[index]?.id)) {
                        driftTypes.push('record_id_mismatch');
                    }
                    if (expectedComparable.some((record, index) => record.label !== actualComparable[index]?.label)) {
                        driftTypes.push('label_mismatch');
                    }
                    if (expectedComparable.some((record, index) => record.active !== actualComparable[index]?.active)) {
                        driftTypes.push('active_state_mismatch');
                    }
                    if (expectedComparable.some((record, index) => record.valueHash !== actualComparable[index]?.valueHash)) {
                        driftTypes.push('value_hash_mismatch');
                    }
                }
                entries.push(buildAuditEntry({
                    key,
                    status: 'drift',
                    driftTypes,
                    details: {
                        expectedRecordCount: expectedRecords.length,
                        actualRecordCount: actualRecords.length,
                    },
                    auditedAtMs,
                }));
            }
        }
    }

    for (const repair of listOpenSecretProjectionRepairs(db)) {
        entries.push(buildAuditEntry({
            key: repair.key,
            status: 'drift',
            driftTypes: ['open_secret_projection_repair'],
            details: {
                repairKey: repair.repairKey,
                operation: repair.operation,
                errorClass: repair.errorClass,
            },
            auditedAtMs,
        }));
    }

    const blocking = entries.some(entry => entry.status === 'drift' || entry.status === 'error');
    const result = {
        ok: !blocking,
        handle,
        blocking,
        hasDrift: blocking,
        reason: blocking ? 'audit_drift_blocked' : null,
        migrationStatus,
        entries,
    };
    persistCanonicalAuditStatus(db, result, {
        scope: CANONICAL_SECRETS_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}

export function getCanonicalSecretsProjection(db) {
    const secrets = getCanonicalSecrets(db);
    secrets[MIGRATED_KEY] = [];
    return secrets;
}
