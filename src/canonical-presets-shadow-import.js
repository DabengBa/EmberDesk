import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import { recordImportLedgerEntry } from './canonical-import-ledger.js';
import { importPresetFile, PRESETS_OPENAI_API_ID } from './endpoints/presets-store.js';

export const PRESETS_AUDIT_SCOPE = 'presets';

function summarizeImportResult({ handle, skipped = false, reason = null, entries = [], migrationStatus = null }) {
    return {
        ok: skipped || (reason === null && !(migrationStatus && migrationStatus.ok === false)),
        handle,
        skipped,
        reason,
        importedCount: entries.filter(entry => entry.status === 'imported').length,
        updatedCount: 0,
        unchangedCount: entries.filter(entry => entry.status === 'unchanged').length,
        failedCount: entries.filter(entry => entry.status === 'error').length,
        migrationStatus,
        entries,
    };
}

/**
 * One-shot migration of `Open AI Settings/*.json` files into canonical
 * `preset_documents`. Consumption is marker-driven (`preset_migration_markers`),
 * not audit-driven: a file is imported exactly once and then permanently inert,
 * so an audit-stale re-run can never let a stale file overwrite canonical rows.
 * @param {{handle: string, directories: object, featureFlags: object, manager: object, nowMs?: number}} args
 */
export async function runCanonicalPresetsShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    nowMs = Date.now(),
} = {}) {
    if (!featureFlags?.enabled) {
        return summarizeImportResult({ handle, skipped: true, reason: 'canonical_storage_disabled' });
    }
    if (!featureFlags?.shadowImport) {
        return summarizeImportResult({ handle, skipped: true, reason: 'shadow_import_disabled' });
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
        return summarizeImportResult({ handle, reason: 'canonical_storage_unavailable' });
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
        nowMs,
    });
    if (!migrationStatus.ok) {
        return summarizeImportResult({ handle, reason: 'migration_blocked', migrationStatus });
    }

    const presetDir = directories?.openAI_Settings;
    const entries = [];
    if (presetDir && fs.existsSync(presetDir)) {
        let files = [];
        try {
            files = fs.readdirSync(presetDir)
                .filter(file => path.parse(file).ext === '.json')
                .sort((a, b) => a.localeCompare(b));
        } catch (error) {
            return summarizeImportResult({
                handle,
                reason: 'preset_dir_unreadable',
                migrationStatus,
                entries: [{ status: 'error', errorClass: error?.name || 'Error' }],
            });
        }

        for (const file of files) {
            const filePath = path.join(presetDir, file);
            const markerKey = path.relative(directories.root, filePath).split(path.sep).join('/');
            let raw;
            try {
                raw = fs.readFileSync(filePath, 'utf8');
            } catch (error) {
                entries.push({ status: 'error', path: markerKey, errorClass: error?.name || 'Error' });
                continue;
            }
            let payload;
            try {
                payload = JSON.parse(raw);
            } catch {
                console.warn(`Preset file ${file} is not valid JSON; skipped by canonical import`);
                entries.push({ status: 'error', path: markerKey, errorClass: 'invalid_json' });
                continue;
            }
            const sourceHash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
            const result = importPresetFile(db, {
                apiId: PRESETS_OPENAI_API_ID,
                name: file.replace(/\.[^/.]+$/, ''),
                payloadJson: typeof payload === 'object' ? raw : payload,
                markerKey,
                sourceHash,
                nowMs,
            });
            if (result.status === 'imported') {
                recordImportLedgerEntry(db, {
                    sliceKey: 'presets',
                    sourcePath: markerKey,
                    contentHash: sourceHash,
                    origin: 'import',
                    nowMs,
                });
            }
            entries.push({ status: result.status, path: markerKey, name: result.preset?.name });
        }
    }

    return summarizeImportResult({ handle, entries, migrationStatus });
}

/**
 * The audit persists a clean verdict once schema migrations are satisfied.
 * Preset files are not probed: after the one-shot import they have no runtime
 * semantics, so there is no file-side drift to detect.
 */
export async function auditCanonicalPresetsShadowImport({
    handle,
    db,
    auditedAtMs = Date.now(),
} = {}) {
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

    try {
        db.prepare('SELECT 1 FROM preset_documents LIMIT 1').get();
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: preset_documents')) {
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

    const result = {
        ok: true,
        handle,
        hasDrift: false,
        blocking: false,
        reason: null,
        migrationStatus,
        entries: [],
    };
    persistCanonicalAuditStatus(db, result, {
        scope: PRESETS_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}
