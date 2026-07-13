import fs from 'node:fs';
import path from 'node:path';

import { SETTINGS_FILE } from './constants.js';
import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import {
    getCanonicalSettingsDocument,
    getCanonicalSettingsRevision,
    hashSettingsPayload,
    upsertCanonicalSettingsDocument,
} from './endpoints/settings-store.js';

export const SETTINGS_AUDIT_SCOPE = 'settings';

function getSettingsFilePath(directories) {
    return path.join(directories.root, SETTINGS_FILE);
}

function readSettingsFileRaw(directories) {
    const filePath = getSettingsFilePath(directories);
    if (!fs.existsSync(filePath)) {
        return {
            exists: false,
            filePath,
            raw: null,
            payload: null,
            error: null,
        };
    }

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const payload = JSON.parse(raw);
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
            return {
                exists: true,
                filePath,
                raw,
                payload: null,
                error: new Error('settings.json root must be a JSON object'),
            };
        }
        return {
            exists: true,
            filePath,
            raw,
            payload,
            error: null,
        };
    } catch (error) {
        return {
            exists: true,
            filePath,
            raw: null,
            payload: null,
            error,
        };
    }
}

function summarizeImportResult({ handle, skipped = false, reason = null, entries, migrationStatus = null }) {
    const importedCount = entries.filter(entry => entry.status === 'imported').length;
    const updatedCount = entries.filter(entry => entry.status === 'updated').length;
    const unchangedCount = entries.filter(entry => entry.status === 'unchanged').length;
    const failedCount = entries.filter(entry => entry.status === 'error').length;
    return {
        ok: skipped || (failedCount === 0 && reason === null && !(migrationStatus && migrationStatus.ok === false)),
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

function buildAuditEntry({ handle, status, driftTypes, details, auditedAtMs }) {
    return {
        handle,
        status,
        drift_types: driftTypes,
        details,
        audited_at_ms: auditedAtMs,
    };
}

function buildAuditSummary({ handle, migrationStatus, entries }) {
    const driftEntries = entries.filter(entry => entry.status === 'drift');
    const errorEntries = entries.filter(entry => entry.status === 'error');
    const blocking = driftEntries.length > 0 || errorEntries.length > 0;
    return {
        ok: !blocking,
        handle,
        hasDrift: driftEntries.length > 0,
        blocking,
        reason: blocking ? 'audit_drift_blocked' : null,
        migrationStatus,
        entries,
    };
}

export async function runCanonicalSettingsShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    nowMs = Date.now(),
}) {
    if (!featureFlags?.enabled) {
        return summarizeImportResult({
            handle,
            skipped: true,
            reason: 'canonical_storage_disabled',
            entries: [],
        });
    }

    if (!featureFlags?.shadowImport) {
        return summarizeImportResult({
            handle,
            skipped: true,
            reason: 'shadow_import_disabled',
            entries: [],
        });
    }

    const db = manager.open({
        handle,
        directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return summarizeImportResult({
            handle,
            reason: 'canonical_storage_unavailable',
            entries: [],
        });
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
        nowMs,
    });
    if (!migrationStatus.ok) {
        return summarizeImportResult({
            handle,
            reason: 'migration_blocked',
            entries: [],
            migrationStatus,
        });
    }

    const entries = [];
    const file = readSettingsFileRaw(directories);
    if (!file.exists) {
        return summarizeImportResult({
            handle,
            entries: [{
                status: 'unchanged',
                reason: 'missing_settings_file',
            }],
            migrationStatus,
        });
    }

    if (file.error) {
        entries.push({
            status: 'error',
            errorMessage: String(file.error?.message ?? file.error ?? ''),
        });
        return summarizeImportResult({
            handle,
            entries,
            migrationStatus,
        });
    }

    try {
        const existing = getCanonicalSettingsDocument(db, { userId: handle });
        const fileHash = hashSettingsPayload(file.payload);
        if (existing && existing.contentHash === fileHash) {
            entries.push({ status: 'unchanged' });
        } else {
            const expectedRevision = existing ? existing.revision : 0;
            const saved = upsertCanonicalSettingsDocument(db, {
                userId: handle,
                payload: file.payload,
                expectedRevision,
                nowMs,
            });
            if (!saved.ok) {
                // Concurrent import race: re-check hash against winner.
                const latest = getCanonicalSettingsDocument(db, { userId: handle });
                if (latest && latest.contentHash === fileHash) {
                    entries.push({ status: 'unchanged' });
                } else {
                    entries.push({
                        status: 'error',
                        errorMessage: 'revision_conflict_during_import',
                        currentRevision: saved.currentRevision,
                    });
                }
            } else {
                entries.push({
                    status: existing ? 'updated' : 'imported',
                    revision: saved.revision,
                });
            }
        }
    } catch (error) {
        entries.push({
            status: 'error',
            errorMessage: String(error?.message ?? error ?? ''),
        });
    }

    return summarizeImportResult({
        handle,
        entries,
        migrationStatus,
    });
}

export async function auditCanonicalSettingsShadowImport({
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
}) {
    const migrationStatus = getCanonicalMigrationStatus(db);
    if (!migrationStatus.ok) {
        return {
            ok: false,
            handle,
            hasDrift: false,
            blocking: true,
            reason: 'migration_blocked',
            migrationStatus,
            entries: [],
        };
    }

    if (migrationStatus.currentVersion !== migrationStatus.targetVersion) {
        return {
            ok: false,
            handle,
            hasDrift: false,
            blocking: true,
            reason: 'migration_not_applied',
            migrationStatus,
            entries: [],
        };
    }

    // Settings document tables arrive in migration v4. If older DBs somehow
    // report target parity without the table, treat as schema not ready.
    try {
        db.prepare('SELECT 1 FROM settings_documents LIMIT 1').get();
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: settings_documents')) {
            return {
                ok: false,
                handle,
                hasDrift: false,
                blocking: true,
                reason: 'migration_not_applied',
                migrationStatus,
                entries: [],
            };
        }
        throw error;
    }

    const entries = [];
    const file = readSettingsFileRaw(directories);
    const stored = getCanonicalSettingsDocument(db, { userId: handle });

    if (file.exists && file.error) {
        entries.push(buildAuditEntry({
            handle,
            status: 'error',
            driftTypes: ['invalid_json'],
            details: {
                errorMessage: String(file.error?.message ?? file.error ?? ''),
            },
            auditedAtMs,
        }));
    } else if (file.exists && !stored) {
        entries.push(buildAuditEntry({
            handle,
            status: 'drift',
            driftTypes: ['missing_db_settings'],
            details: {},
            auditedAtMs,
        }));
    } else if (!file.exists && stored) {
        entries.push(buildAuditEntry({
            handle,
            status: 'drift',
            driftTypes: ['missing_projection_file'],
            details: {
                revision: stored.revision,
            },
            auditedAtMs,
        }));
    } else if (file.exists && stored) {
        const fileHash = hashSettingsPayload(file.payload);
        if (fileHash !== stored.contentHash) {
            entries.push(buildAuditEntry({
                handle,
                status: 'drift',
                driftTypes: ['payload_mismatch'],
                details: {
                    expected_content_hash: fileHash,
                    actual_content_hash: stored.contentHash,
                    revision: stored.revision,
                },
                auditedAtMs,
            }));
        }
    }

    const result = buildAuditSummary({
        handle,
        migrationStatus,
        entries,
    });
    persistCanonicalAuditStatus(db, result, {
        scope: SETTINGS_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}

export function getSettingsFileContentHash(directories) {
    const file = readSettingsFileRaw(directories);
    if (!file.exists || file.error || !file.payload) {
        return null;
    }
    return hashSettingsPayload(file.payload);
}

export function getCurrentSettingsDocumentRevision(db, handle) {
    return getCanonicalSettingsRevision(db, { userId: handle });
}
