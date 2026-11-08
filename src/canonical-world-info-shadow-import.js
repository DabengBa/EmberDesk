import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    classifyImportCandidate,
    recordImportLedgerEntry,
    resolveAuditDriftReason,
} from './canonical-import-ledger.js';
import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatusInTransaction } from './canonical-sqlite-shadow-import.js';
import { withCanonicalTransaction } from './canonical-sqlite.js';
import {
    WORLD_PROJECTION_INTENT_PREFIX,
    moveWorldFileToLocalQuarantine,
    resolveWorldProjectionPath,
} from './canonical-world-info-projection.js';
import {
    getCanonicalWorldInfoBook,
    listCanonicalWorldInfoBookRows,
    upsertCanonicalWorldInfoBookInTransaction,
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
    const contents = fs.readFileSync(filePath, 'utf8');
    const payload = JSON.parse(contents);
    if (!payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
        payload.entries = {};
    }
    return {
        name: getWorldNameFromFilename(filename),
        payload,
        sourceMtimeMs: Number(stat.mtimeMs ?? 0),
        sourceSizeBytes: Number(stat.size ?? 0),
        sourceHash: crypto.createHash('sha256').update(contents).digest('hex'),
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

function buildAuditSummary({ handle, migrationStatus, entries, ignoreSuppressed = false }) {
    // Suppressed entries (projection off) and entries explained by a pending v1
    // intent are expected state: the authority transaction committed and the
    // shared worker has not settled the file yet. Legacy rows and drift without
    // an intent stay blocking.
    const active = entries.filter(entry => !(ignoreSuppressed && entry.details?.suppressed)
        && entry.details?.expected_projection_pending !== true);
    const driftEntries = active.filter(entry => entry.status === 'drift');
    const errorEntries = active.filter(entry => entry.status === 'error');
    const blocking = driftEntries.length > 0 || errorEntries.length > 0;
    return {
        ok: !blocking,
        handle,
        hasDrift: driftEntries.length > 0,
        blocking,
        reason: resolveAuditDriftReason(blocking, entries),
        migrationStatus,
        entries,
    };
}

function listPendingWriteIntents(db) {
    const rows = db.prepare(`
        SELECT repair_key, world_book_id, world_name, details_json
        FROM world_info_projection_repairs
        WHERE resolved_at_ms IS NULL AND repair_key LIKE ?
    `).all(`${WORLD_PROJECTION_INTENT_PREFIX}%`);
    const pending = [];
    for (const row of rows) {
        let details = null;
        try {
            details = row.details_json ? JSON.parse(String(row.details_json)) : null;
        } catch {
            details = null;
        }
        pending.push({
            repairKey: String(row.repair_key),
            worldBookId: row.world_book_id == null ? null : String(row.world_book_id),
            worldName: String(row.world_name ?? ''),
            action: details?.action ?? null,
            version: details?.version ?? null,
        });
    }
    return pending;
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
            const canonicalFilename = `${worldName}.json`;
            const legacyFilename = filename !== canonicalFilename && path.extname(filename).toLowerCase() === '.json'
                && filename.slice(0, -path.extname(filename).length) === worldName ? filename : null;
            const entry = withCanonicalTransaction(db, txn => {
                const resolved = resolveWorldProjectionPath(txn, directories, worldName, { legacyFilename });
                if (legacyFilename && fs.readdirSync(directories.worlds).includes(canonicalFilename)) throw new Error('world_projection_filename_alias');
                if (!legacyFilename && path.basename(resolved.target) !== filename) throw new Error('world_projection_filename_alias');
                const projection = readWorldInfoProjection(directories, filename);
                const sourcePath = path.relative(directories.root, resolved.target);

                const existing = getCanonicalWorldInfoBook(txn, worldName);
                const intent = txn.prepare('SELECT * FROM world_info_projection_repairs WHERE repair_key = ? OR (world_name = ? AND resolved_at_ms IS NULL)').all(resolved.key, worldName);
                const deleted = txn.prepare('SELECT deleted_at_ms FROM world_books WHERE name = ?').get(worldName)?.deleted_at_ms != null;
                const conflictingIntent = intent.some(row => row.resolved_at_ms == null || row.repair_key !== resolved.key);
                if (deleted || conflictingIntent || (intent.length && !existing)) {
                    throw new Error('world_projection_import_blocked');
                }
                // A missing audit or ledger entry cannot establish that a differing
                // file predates canonical authority; fail closed even at bootstrap.
                if (existing && stableJson(existing) !== stableJson(projection.payload)) {
                    throw new Error('world_projection_import_blocked');
                }
                if (existing && stableJson(existing) === stableJson(projection.payload)) {
                    recordImportLedgerEntry(txn, {
                        sliceKey: 'world_info',
                        sourcePath,
                        contentHash: projection.sourceHash,
                        origin: 'import',
                        nowMs,
                    });
                    return { world_name: worldName, status: 'unchanged', sourceHash: projection.sourceHash };
                }

                upsertCanonicalWorldInfoBookInTransaction(txn, {
                    name: worldName,
                    payload: projection.payload,
                    sourceMtimeMs: projection.sourceMtimeMs,
                    sourceSizeBytes: projection.sourceSizeBytes,
                    nowMs,
                });
                recordImportLedgerEntry(txn, {
                    sliceKey: 'world_info',
                    sourcePath,
                    contentHash: projection.sourceHash,
                    origin: 'import',
                    nowMs,
                });
                return { world_name: worldName, status: existing ? 'updated' : 'imported', sourceHash: projection.sourceHash };
            });
            if (legacyFilename) {
                // The authority must be committed before moving the alias. A crash
                // before this point leaves replay blocked by the original filename.
                withCanonicalTransaction(db, txn => {
                    const resolved = resolveWorldProjectionPath(txn, directories, worldName, { legacyFilename });
                    if (fs.readdirSync(directories.worlds).includes(canonicalFilename)) throw new Error('world_projection_filename_alias');
                    const pending = txn.prepare('SELECT 1 FROM world_info_projection_repairs WHERE world_name = ? AND resolved_at_ms IS NULL').get(worldName);
                    const projection = readWorldInfoProjection(directories, filename);
                    const existing = getCanonicalWorldInfoBook(txn, worldName);
                    if (pending || !existing || projection.sourceHash !== entry.sourceHash || stableJson(existing) !== stableJson(projection.payload)) {
                        throw new Error('world_projection_import_blocked');
                    }
                    // First move to a unique private location, then publish with
                    // an exclusive hard link. Neither step overwrites a racing
                    // target, and a replaced source remains recoverable.
                    const saved = moveWorldFileToLocalQuarantine(directories, path.join(directories.worlds, filename));
                    const savedHash = crypto.createHash('sha256').update(fs.readFileSync(saved)).digest('hex');
                    if (savedHash !== entry.sourceHash) throw new Error('world_projection_import_blocked');
                    fs.linkSync(saved, resolved.target);
                });
            }
            delete entry.sourceHash;
            entries.push(entry);
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

export async function auditCanonicalWorldInfoShadowImport(options) {
    return withCanonicalTransaction(options.db, () => auditWorldInfoInTransaction(options));
}

function auditWorldInfoInTransaction({
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
    projection = 'sync',
    importResult = null,
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

    const suppressFileSide = projection === 'off';
    const suppressDetails = suppressFileSide
        ? { projection_mode: 'off', suppressed: true }
        : {};
    const pendingIntents = listPendingWriteIntents(db);
    const pendingWriteForBook = worldBookId => pendingIntents.some(intent =>
        intent.version === 1
        && intent.action === 'write'
        && intent.worldBookId != null
        && intent.worldBookId === String(worldBookId));
    const pendingDeleteForName = worldName => pendingIntents.some(intent =>
        intent.version === 1
        && intent.action === 'delete'
        && intent.worldName === worldName);

    const entries = [];
    if (importResult && !importResult.ok) {
        entries.push(buildAuditEntry({
            handle,
            worldName: '',
            status: 'error',
            driftTypes: ['shadow_import_failed'],
            details: { reason: importResult.reason, failed_count: importResult.failedCount },
            auditedAtMs,
        }));
    }
    const projectionNames = new Set();
    for (const filename of listWorldInfoJsonFiles(directories)) {
        const worldName = getWorldNameFromFilename(filename);
        projectionNames.add(worldName);
        const stored = getCanonicalWorldInfoBook(db, worldName);
        const storedRow = db.prepare('SELECT id FROM world_books WHERE name = ? AND deleted_at_ms IS NULL').get(worldName);
        try {
            const resolved = resolveWorldProjectionPath(db, directories, worldName);
            if (path.basename(resolved.target) !== filename) throw new Error('world_projection_filename_alias');
            const projection = readWorldInfoProjection(directories, filename);
            const importClassification = classifyImportCandidate(db, {
                sliceKey: 'world_info',
                sourcePath: path.relative(directories.root, path.join(directories.worlds, filename)),
                contentHash: projection.sourceHash,
            });
            if (!stored) {
                entries.push(buildAuditEntry({
                    handle,
                    worldName,
                    status: 'drift',
                    driftTypes: ['missing_db_world_info'],
                    details: {
                        import_classification: importClassification,
                        ...(pendingDeleteForName(worldName) ? { expected_projection_pending: true } : {}),
                        ...suppressDetails,
                    },
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
                        import_classification: importClassification,
                        ...(storedRow && pendingWriteForBook(storedRow.id) ? { expected_projection_pending: true } : {}),
                        ...suppressDetails,
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
            details: {
                ...(pendingWriteForBook(row.id) ? { expected_projection_pending: true } : {}),
                ...suppressDetails,
            },
            auditedAtMs,
        }));
    }

    // Legacy repair rows have no proven protocol/intent baseline. They are
    // never explained by an expected pending write, so surface them as drift.
    const legacyRepairs = db.prepare(`
        SELECT repair_key, world_name
        FROM world_info_projection_repairs
        WHERE resolved_at_ms IS NULL AND repair_key NOT LIKE ?
    `).all(`${WORLD_PROJECTION_INTENT_PREFIX}%`);
    for (const repair of legacyRepairs) {
        entries.push(buildAuditEntry({
            handle,
            worldName: String(repair.world_name ?? ''),
            status: 'drift',
            driftTypes: ['legacy_projection_repair_unresolved'],
            details: { repair_key: String(repair.repair_key) },
            auditedAtMs,
        }));
    }

    const result = buildAuditSummary({
        handle,
        migrationStatus,
        entries,
        ignoreSuppressed: suppressFileSide,
    });
    persistCanonicalAuditStatusInTransaction(db, result, {
        scope: WORLD_INFO_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}
