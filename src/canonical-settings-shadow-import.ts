import type { DatabaseSync } from 'node:sqlite';

import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.ts';

export const SETTINGS_AUDIT_SCOPE = 'settings';

type MigrationStatus = ReturnType<typeof runCanonicalMigrations>;
type SettingsImportEntry = { status: string; reason: string };
type ImportOptions = {
    handle: string;
    directories: { root: string; storage?: string };
    featureFlags: { enabled?: boolean; shadowImport?: boolean; strict?: boolean } | null | undefined;
    manager: {
        open(options: {
            handle: string;
            directories: { root: string; storage?: string };
            featureFlags: { enabled: boolean; strict: boolean };
        }): DatabaseSync | null;
    };
    nowMs?: number;
};

function summarizeImportResult({ handle, skipped = false, reason = null, entries, migrationStatus = null }: {
    handle: string;
    skipped?: boolean;
    reason?: string | null;
    entries: SettingsImportEntry[];
    migrationStatus?: MigrationStatus | null;
}) {
    return {
        ok: skipped || (reason === null && !(migrationStatus && migrationStatus.ok === false)),
        handle,
        skipped,
        reason,
        importedCount: 0,
        updatedCount: 0,
        unchangedCount: entries.filter(entry => entry.status === 'unchanged').length,
        failedCount: 0,
        migrationStatus,
        entries,
    };
}

/**
 * Settings have no file-side surface: canonical storage is authoritative, the
 * legacy `settings.json` contract path was retired, and the legacy
 * `public/settings.json` migration path writes the document directly. The
 * import pass only needs to guarantee schema migrations ran; there is nothing
 * left to ingest.
 */
export async function runCanonicalSettingsShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    nowMs = Date.now(),
}: ImportOptions) {
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

    return summarizeImportResult({
        handle,
        entries: [{
            status: 'unchanged',
            reason: 'no_file_surfaces',
        }],
        migrationStatus,
    });
}

/**
 * The audit persists a clean verdict once schema migrations are satisfied so
 * lazy slice init can trust the 'skip' decision. No file exists that could
 * drift, so there are no drift entries to record.
 */
export async function auditCanonicalSettingsShadowImport({
    handle,
    db,
    auditedAtMs = Date.now(),
}: { handle: string; db: DatabaseSync; auditedAtMs?: number }) {
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
        if (String((error as { message?: unknown } | null | undefined)?.message ?? '').includes('no such table: settings_documents')) {
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
        scope: SETTINGS_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}
