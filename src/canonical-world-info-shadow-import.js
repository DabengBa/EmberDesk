import fs from 'node:fs';
import path from 'node:path';

import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import {
    getCanonicalWorldInfoBook,
    listCanonicalWorldInfoBookRows,
    upsertCanonicalWorldInfoBook,
} from './endpoints/world-info-store.js';

export const WORLD_INFO_AUDIT_SCOPE = 'world_info';

function listWorldInfoJsonFiles(directories) {
    if (!directories?.worlds) {
        return [];
    }

    let files = [];
    try {
        files = fs.readdirSync(directories.worlds, { withFileTypes: true });
    } catch {
        return [];
    }

    return files
        .filter(file => file.isFile() && path.extname(file.name).toLowerCase() === '.json')
        .map(file => file.name)
        .sort((left, right) => left.localeCompare(right));
}

function getWorldNameFromFilename(filename) {
    return path.parse(filename).name;
}

function readWorldInfoProjection(directories, filename) {
    const filePath = path.join(directories.worlds, filename);
    const stat = fs.statSync(filePath);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
        payload.entries = {};
    }
    return {
        name: getWorldNameFromFilename(filename),
        payload,
        sourceMtimeMs: Number(stat.mtimeMs ?? 0),
        sourceSizeBytes: Number(stat.size ?? 0),
    };
}

function stableJson(value) {
    return JSON.stringify(value);
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

function buildAuditEntry({ handle, worldName, worldBookId = null, status, driftTypes, details, auditedAtMs }) {
    return {
        handle,
        world_name: worldName,
        world_book_id: worldBookId,
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

export async function runCanonicalWorldInfoShadowImport({
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
    for (const filename of listWorldInfoJsonFiles(directories)) {
        const worldName = getWorldNameFromFilename(filename);
        try {
            const projection = readWorldInfoProjection(directories, filename);
            const existing = getCanonicalWorldInfoBook(db, worldName);
            if (existing && stableJson(existing) === stableJson(projection.payload)) {
                entries.push({
                    world_name: worldName,
                    status: 'unchanged',
                });
                continue;
            }

            upsertCanonicalWorldInfoBook(db, {
                name: worldName,
                payload: projection.payload,
                sourceMtimeMs: projection.sourceMtimeMs,
                sourceSizeBytes: projection.sourceSizeBytes,
                nowMs,
            });
            entries.push({
                world_name: worldName,
                status: existing ? 'updated' : 'imported',
            });
        } catch (error) {
            entries.push({
                world_name: worldName,
                status: 'error',
                errorMessage: String(error?.message ?? error ?? ''),
            });
        }
    }

    return summarizeImportResult({
        handle,
        entries,
        migrationStatus,
    });
}

export async function auditCanonicalWorldInfoShadowImport({
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

    const entries = [];
    const projectionNames = new Set();
    for (const filename of listWorldInfoJsonFiles(directories)) {
        const worldName = getWorldNameFromFilename(filename);
        projectionNames.add(worldName);
        const stored = getCanonicalWorldInfoBook(db, worldName);
        try {
            const projection = readWorldInfoProjection(directories, filename);
            if (!stored) {
                entries.push(buildAuditEntry({
                    handle,
                    worldName,
                    status: 'drift',
                    driftTypes: ['missing_db_world_info'],
                    details: {},
                    auditedAtMs,
                }));
                continue;
            }

            if (stableJson(stored) !== stableJson(projection.payload)) {
                entries.push(buildAuditEntry({
                    handle,
                    worldName,
                    status: 'drift',
                    driftTypes: ['payload_mismatch'],
                    details: {
                        expected_payload_json: stableJson(projection.payload),
                        actual_payload_json: stableJson(stored),
                    },
                    auditedAtMs,
                }));
                continue;
            }
        } catch (error) {
            entries.push(buildAuditEntry({
                handle,
                worldName,
                status: 'error',
                driftTypes: ['audit_error'],
                details: {
                    errorMessage: String(error?.message ?? error ?? ''),
                },
                auditedAtMs,
            }));
        }
    }

    for (const row of listCanonicalWorldInfoBookRows(db)) {
        if (row.deletedAtMs != null || projectionNames.has(row.name)) {
            continue;
        }

        entries.push(buildAuditEntry({
            handle,
            worldName: row.name,
            worldBookId: row.id,
            status: 'drift',
            driftTypes: ['missing_projection_file'],
            details: {},
            auditedAtMs,
        }));
    }

    const result = buildAuditSummary({
        handle,
        migrationStatus,
        entries,
    });
    persistCanonicalAuditStatus(db, result, {
        scope: WORLD_INFO_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}
