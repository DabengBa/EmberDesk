import fs from 'node:fs';
import path from 'node:path';

import { withCanonicalTransaction } from './canonical-sqlite.js';
import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import {
    calculateCharacterChatStats,
    getCharacterChatDirectory,
} from './endpoints/character-file-snapshot.js';
import { normalizeCanonicalCharacterPayload } from './endpoints/character-store.js';
import { uuidv4 } from './util.js';

function listCharacterAvatarFiles(directories) {
    return fs.readdirSync(directories.characters)
        .filter(file => file.endsWith('.png'))
        .sort((left, right) => left.localeCompare(right));
}

function normalizeWorldName(snapshotRow) {
    return String(snapshotRow?.fullPayload?.data?.extensions?.world ?? snapshotRow?.fullPayload?.world ?? '').trim();
}

function buildCanonicalCharacterRecord(snapshotRow, existingId = null) {
    const avatarFilename = snapshotRow.avatar;
    const internalName = path.parse(avatarFilename).name;
    const normalizedFullPayload = normalizeCanonicalCharacterPayload(snapshotRow.fullPayload);
    const normalizedShallowPayload = normalizeCanonicalCharacterPayload(snapshotRow.shallowPayload);
    return {
        id: existingId ?? uuidv4(),
        avatar_filename: avatarFilename,
        internal_name: internalName,
        display_name: String(normalizedFullPayload.name),
        card_json: JSON.stringify(normalizedFullPayload),
        shallow_json: JSON.stringify(normalizedShallowPayload),
        world_name: normalizeWorldName({ fullPayload: normalizedFullPayload }),
        created_at_ms: Number(normalizedFullPayload.date_added ?? snapshotRow.sourceMtimeMs ?? 0),
        updated_at_ms: Number(snapshotRow.sourceMtimeMs ?? 0),
        deleted_at_ms: null,
    };
}

function buildCanonicalChatStatsRecord(directories, snapshotRow, characterId, nowMs) {
    const chatsDirectory = getCharacterChatDirectory(directories, snapshotRow.avatar);
    const { chatCount, chatSize, dateLastChat } = calculateCharacterChatStats(chatsDirectory);
    return {
        character_id: characterId,
        chat_count: chatCount,
        chat_size_bytes: chatSize,
        date_last_chat_ms: dateLastChat,
        stats_updated_at_ms: nowMs,
    };
}

function getStoredCanonicalRow(db, avatarFilename) {
    return db.prepare(`
        SELECT
            characters.id,
            characters.avatar_filename,
            characters.internal_name,
            characters.display_name,
            characters.card_json,
            characters.shallow_json,
            characters.world_name,
            characters.created_at_ms,
            characters.updated_at_ms,
            characters.deleted_at_ms,
            character_chat_stats.chat_count,
            character_chat_stats.chat_size_bytes,
            character_chat_stats.date_last_chat_ms,
            character_chat_stats.stats_updated_at_ms
        FROM characters
        LEFT JOIN character_chat_stats
            ON character_chat_stats.character_id = characters.id
        WHERE characters.avatar_filename = ?
    `).get(avatarFilename);
}

function isSameCharacterRecord(storedRow, nextCharacterRecord) {
    return storedRow
        && storedRow.id === nextCharacterRecord.id
        && storedRow.avatar_filename === nextCharacterRecord.avatar_filename
        && storedRow.internal_name === nextCharacterRecord.internal_name
        && storedRow.display_name === nextCharacterRecord.display_name
        && storedRow.card_json === nextCharacterRecord.card_json
        && storedRow.shallow_json === nextCharacterRecord.shallow_json
        && storedRow.world_name === nextCharacterRecord.world_name
        && Number(storedRow.created_at_ms) === Number(nextCharacterRecord.created_at_ms)
        && Number(storedRow.updated_at_ms) === Number(nextCharacterRecord.updated_at_ms)
        && storedRow.deleted_at_ms === nextCharacterRecord.deleted_at_ms;
}

function isSameChatStatsRecord(storedRow, nextStatsRecord) {
    // stats_updated_at_ms is a write-time clock, not content. Ignoring it keeps re-imports idempotent.
    return storedRow
        && Number(storedRow.chat_count) === Number(nextStatsRecord.chat_count)
        && Number(storedRow.chat_size_bytes) === Number(nextStatsRecord.chat_size_bytes)
        && Number(storedRow.date_last_chat_ms) === Number(nextStatsRecord.date_last_chat_ms);
}

function upsertCanonicalCharacter(db, characterRecord, chatStatsRecord) {
    withCanonicalTransaction(db, txnDb => {
        txnDb.prepare(`
            INSERT INTO characters (
                id,
                avatar_filename,
                internal_name,
                display_name,
                card_json,
                shallow_json,
                world_name,
                created_at_ms,
                updated_at_ms,
                deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(avatar_filename) DO UPDATE SET
                internal_name = excluded.internal_name,
                display_name = excluded.display_name,
                card_json = excluded.card_json,
                shallow_json = excluded.shallow_json,
                world_name = excluded.world_name,
                created_at_ms = excluded.created_at_ms,
                updated_at_ms = excluded.updated_at_ms,
                deleted_at_ms = excluded.deleted_at_ms
        `).run(
            characterRecord.id,
            characterRecord.avatar_filename,
            characterRecord.internal_name,
            characterRecord.display_name,
            characterRecord.card_json,
            characterRecord.shallow_json,
            characterRecord.world_name,
            characterRecord.created_at_ms,
            characterRecord.updated_at_ms,
            characterRecord.deleted_at_ms,
        );

        txnDb.prepare(`
            INSERT INTO character_chat_stats (
                character_id,
                chat_count,
                chat_size_bytes,
                date_last_chat_ms,
                stats_updated_at_ms
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(character_id) DO UPDATE SET
                chat_count = excluded.chat_count,
                chat_size_bytes = excluded.chat_size_bytes,
                date_last_chat_ms = excluded.date_last_chat_ms,
                stats_updated_at_ms = excluded.stats_updated_at_ms
        `).run(
            chatStatsRecord.character_id,
            chatStatsRecord.chat_count,
            chatStatsRecord.chat_size_bytes,
            chatStatsRecord.date_last_chat_ms,
            chatStatsRecord.stats_updated_at_ms,
        );
    });
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

function buildAuditEntry({ handle, avatarFilename, characterId, status, driftTypes, details, auditedAtMs }) {
    return {
        handle,
        avatar_filename: avatarFilename,
        character_id: characterId,
        status,
        drift_types: driftTypes,
        details,
        audited_at_ms: auditedAtMs,
    };
}

function countEntriesByStatus(entries, status) {
    return entries.filter(entry => entry.status === status).length;
}

function normalizePersistedAuditState(row) {
    if (!row) {
        return {
            ok: false,
            blocking: true,
            reason: 'audit_not_run',
            status: 'missing',
            driftCount: 0,
            errorCount: 0,
            entryCount: 0,
            auditedAtMs: null,
            details: {},
        };
    }

    let details = {};
    try {
        details = JSON.parse(String(row.details_json ?? '{}'));
    } catch {
        details = {};
    }

    return {
        ok: !Boolean(row.blocking),
        blocking: Boolean(row.blocking),
        reason: row.reason ? String(row.reason) : null,
        status: String(row.status),
        driftCount: Number(row.drift_count ?? 0),
        errorCount: Number(row.error_count ?? 0),
        entryCount: Number(row.entry_count ?? 0),
        auditedAtMs: Number(row.audited_at_ms ?? 0),
        details,
    };
}

export function getPersistedCanonicalAuditStatus(db, { scope = 'character_metadata_and_chat_stats' } = {}) {
    let row = null;
    try {
        row = db.prepare(`
            SELECT
                audit_scope,
                status,
                reason,
                blocking,
                drift_count,
                error_count,
                entry_count,
                audited_at_ms,
                details_json
            FROM canonical_audit_state
            WHERE audit_scope = ?
        `).get(scope);
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: canonical_audit_state')) {
            return normalizePersistedAuditState(null);
        }
        throw error;
    }

    return normalizePersistedAuditState(row);
}

export function persistCanonicalAuditStatus(db, auditResult, { scope = 'character_metadata_and_chat_stats', auditedAtMs = Date.now() } = {}) {
    const driftCount = countEntriesByStatus(auditResult.entries ?? [], 'drift');
    const errorCount = countEntriesByStatus(auditResult.entries ?? [], 'error');
    const persistedState = {
        status: auditResult.blocking ? 'drift' : 'clean',
        reason: auditResult.blocking ? (auditResult.reason ?? 'audit_drift_blocked') : null,
        blocking: auditResult.blocking ? 1 : 0,
        driftCount,
        errorCount,
        entryCount: Array.isArray(auditResult.entries) ? auditResult.entries.length : 0,
        auditedAtMs,
        details: {
            handle: auditResult.handle ?? null,
            migrationStatus: auditResult.migrationStatus ?? null,
            hasDrift: !!auditResult.hasDrift,
        },
    };

    withCanonicalTransaction(db, txnDb => {
        txnDb.prepare(`
            INSERT INTO canonical_audit_state (
                audit_scope,
                status,
                reason,
                blocking,
                drift_count,
                error_count,
                entry_count,
                audited_at_ms,
                details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(audit_scope) DO UPDATE SET
                status = excluded.status,
                reason = excluded.reason,
                blocking = excluded.blocking,
                drift_count = excluded.drift_count,
                error_count = excluded.error_count,
                entry_count = excluded.entry_count,
                audited_at_ms = excluded.audited_at_ms,
                details_json = excluded.details_json
        `).run(
            scope,
            persistedState.status,
            persistedState.reason,
            persistedState.blocking,
            persistedState.driftCount,
            persistedState.errorCount,
            persistedState.entryCount,
            persistedState.auditedAtMs,
            JSON.stringify(persistedState.details),
        );
    });

    return {
        ok: !Boolean(persistedState.blocking),
        blocking: Boolean(persistedState.blocking),
        reason: persistedState.reason,
        status: persistedState.status,
        driftCount: persistedState.driftCount,
        errorCount: persistedState.errorCount,
        entryCount: persistedState.entryCount,
        auditedAtMs: persistedState.auditedAtMs,
        details: persistedState.details,
    };
}

export function invalidateCanonicalAuditStatus(db, {
    scope = 'character_metadata_and_chat_stats',
    auditedAtMs = Date.now(),
    reason = 'projection_stale',
    source = null,
    handle = null,
} = {}) {
    return persistCanonicalAuditStatus(db, {
        ok: false,
        handle,
        hasDrift: false,
        blocking: true,
        reason,
        migrationStatus: null,
        entries: [],
        invalidatedBy: source,
    }, {
        scope,
        auditedAtMs,
    });
}

export async function runCanonicalShadowImport({
    handle,
    directories,
    featureFlags,
    manager,
    buildSnapshotRow,
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
            skipped: false,
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
            skipped: false,
            reason: 'migration_blocked',
            entries: [],
            migrationStatus,
        });
    }

    const entries = [];
    for (const avatarFilename of listCharacterAvatarFiles(directories)) {
        const storedRow = getStoredCanonicalRow(db, avatarFilename);
        try {
            const snapshotRow = await buildSnapshotRow(avatarFilename, directories);

            const characterRecord = buildCanonicalCharacterRecord(snapshotRow, storedRow?.id);
            const chatStatsRecord = buildCanonicalChatStatsRecord(directories, snapshotRow, characterRecord.id, nowMs);

            if (isSameCharacterRecord(storedRow, characterRecord) && isSameChatStatsRecord(storedRow, chatStatsRecord)) {
                entries.push({
                    avatar_filename: avatarFilename,
                    character_id: characterRecord.id,
                    status: 'unchanged',
                });
                continue;
            }

            upsertCanonicalCharacter(db, characterRecord, chatStatsRecord);
            entries.push({
                avatar_filename: avatarFilename,
                character_id: characterRecord.id,
                status: storedRow ? 'updated' : 'imported',
            });
        } catch (error) {
            entries.push({
                avatar_filename: avatarFilename,
                character_id: storedRow?.id ?? null,
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

export async function auditCanonicalShadowImport({
    handle,
    directories,
    db,
    buildSnapshotRow,
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

    for (const avatarFilename of listCharacterAvatarFiles(directories)) {
        const storedRow = getStoredCanonicalRow(db, avatarFilename);
        try {
            const snapshotRow = await buildSnapshotRow(avatarFilename, directories);

            const characterRecord = buildCanonicalCharacterRecord(snapshotRow, storedRow?.id ?? null);
            const chatStatsRecord = buildCanonicalChatStatsRecord(directories, snapshotRow, storedRow?.id ?? null, auditedAtMs);

            if (!storedRow) {
                entries.push(buildAuditEntry({
                    handle,
                    avatarFilename,
                    characterId: null,
                    status: 'drift',
                    driftTypes: ['missing_db_character'],
                    details: {
                        expected_avatar_filename: avatarFilename,
                    },
                    auditedAtMs,
                }));
                continue;
            }

            const driftTypes = [];
            const details = {};

            if (!isSameCharacterRecord(storedRow, characterRecord)) {
                if (storedRow.card_json !== characterRecord.card_json || storedRow.shallow_json !== characterRecord.shallow_json) {
                    driftTypes.push('payload_mismatch');
                    details.payload = {
                        expected_card_json: characterRecord.card_json,
                        actual_card_json: storedRow.card_json,
                        expected_shallow_json: characterRecord.shallow_json,
                        actual_shallow_json: storedRow.shallow_json,
                    };
                }

                if (storedRow.world_name !== characterRecord.world_name) {
                    driftTypes.push('world_binding_mismatch');
                    details.world_binding = {
                        expected_world_name: characterRecord.world_name,
                        actual_world_name: storedRow.world_name,
                    };
                }
            }

            if (!isSameChatStatsRecord(storedRow, chatStatsRecord)) {
                driftTypes.push('chat_stats_mismatch');
                details.chat_stats = {
                    expected_chat_count: chatStatsRecord.chat_count,
                    actual_chat_count: Number(storedRow.chat_count ?? 0),
                    expected_chat_size_bytes: chatStatsRecord.chat_size_bytes,
                    actual_chat_size_bytes: Number(storedRow.chat_size_bytes ?? 0),
                    expected_date_last_chat_ms: chatStatsRecord.date_last_chat_ms,
                    actual_date_last_chat_ms: Number(storedRow.date_last_chat_ms ?? 0),
                };
            }

            if (driftTypes.length === 0) {
                entries.push(buildAuditEntry({
                    handle,
                    avatarFilename,
                    characterId: characterRecord.id,
                    status: 'clean',
                    driftTypes: [],
                    details: {},
                    auditedAtMs,
                }));
                continue;
            }

            entries.push(buildAuditEntry({
                handle,
                avatarFilename,
                characterId: characterRecord.id,
                status: 'drift',
                driftTypes,
                details,
                auditedAtMs,
            }));
        } catch (error) {
            entries.push(buildAuditEntry({
                handle,
                avatarFilename,
                characterId: storedRow?.id ?? null,
                status: 'error',
                driftTypes: ['audit_error'],
                details: {
                    errorMessage: String(error?.message ?? error ?? ''),
                },
                auditedAtMs,
            }));
        }
    }

    const hasDrift = entries.some(entry => entry.status === 'drift' || entry.status === 'error');
    const result = {
        ok: !hasDrift,
        handle,
        hasDrift,
        blocking: hasDrift,
        ...(hasDrift ? { reason: 'audit_drift_blocked' } : {}),
        entries,
    };
    persistCanonicalAuditStatus(db, result, { auditedAtMs });
    return result;
}
