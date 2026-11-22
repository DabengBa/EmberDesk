import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { UserDirectoryList } from './user-types.ts';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { AVATAR_HEIGHT, AVATAR_WIDTH, DEFAULT_AVATAR_PATH } from './constants.ts';
import { avatarToPngSized } from './image-processing.ts';
import { serverDirectory } from './server-directory.ts';
import { withCanonicalTransaction } from './canonical-sqlite.ts';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus, auditCanonicalShadowImport } from './canonical-sqlite-shadow-import.ts';
import { auditCanonicalWorldInfoShadowImport, WORLD_INFO_AUDIT_SCOPE } from './canonical-world-info-shadow-import.ts';
import { auditCanonicalSettingsShadowImport } from './canonical-settings-shadow-import.ts';
import { auditCanonicalManagedMediaShadowImport } from './canonical-managed-media-shadow-import.ts';
import {
    auditCanonicalChatShadowImport,
    CANONICAL_CHAT_AUDIT_SCOPE,
} from './canonical-chat-shadow-import.ts';
import { recordImportLedgerEntry, removeImportLedgerEntry } from './canonical-import-ledger.ts';
import { replayWorldProjection } from './canonical-world-info-projection.ts';
import { repairCanonicalManagedMediaProjection } from './endpoints/canonical-managed-media-write-service.ts';
import {
    auditCanonicalSecretsShadowImport,
    CANONICAL_SECRETS_AUDIT_SCOPE,
    getCanonicalSecretsProjection,
} from './canonical-secrets-shadow-import.ts';
import {
    buildCanonicalRollbackBlockers,
    listOpenProjectionRepairs,
} from './canonical-sqlite-rollout-contract.ts';
import {
    getCanonicalBackupRestoreReadiness,
    getCanonicalStorageSlice,
    getDefaultCanonicalStorageSliceRegistry,
    listCanonicalStorageSliceKeys,
} from './canonical-storage-slice-registry.ts';
import {
    getCanonicalCharacter,
    resolveProjectionRepair,
} from './endpoints/character-store.ts';
import {
    listOpenWorldInfoProjectionRepairs,
} from './endpoints/world-info-store.ts';
import {
    listOpenSettingsProjectionRepairs,
    resolveSettingsProjectionRepair,
} from './endpoints/settings-store.ts';
import {
    listOpenSecretProjectionRepairs,
    resolveSecretProjectionRepair,
} from './endpoints/canonical-secrets-store.ts';
import { listOpenCanonicalManagedMediaRepairs } from './endpoints/canonical-managed-media-store.ts';
import {
    calculateCanonicalCharacterChatStats,
    listOpenCanonicalChatProjectionRepairs,
    resolveCanonicalChatProjectionRepair,

} from './endpoints/canonical-chat-store.ts';
import { resolveCanonicalChatProjectionPath } from './endpoints/canonical-chat-projection-path.ts';
import {
    buildCharacterFileSnapshotRow,
    calculateCharacterChatStats,
    getCharacterChatDirectory,
} from './endpoints/character-file-snapshot.ts';
import { getCharaCardV2 } from './endpoints/character-card-v2.ts';
import { parse as parseCharacterCard, write as writeCharacterCard } from './character-card-parser.ts';

type CharacterRepair = ReturnType<typeof listOpenProjectionRepairs>[number];
type WorldRepair = ReturnType<typeof listOpenWorldInfoProjectionRepairs>[number];
type ChatRepair = ReturnType<typeof listOpenCanonicalChatProjectionRepairs>[number];
type RepairResult = { repairKey: string; status: string; operation?: string | null; blocker?: string; reason?: string; errorClass?: string };
type RepairOptions = { db: DatabaseSync; directories: UserDirectoryList; repairKeys?: string[] | null; nowMs?: number };
type AuditOptions = { handle: string; directories: UserDirectoryList; db: DatabaseSync; auditedAtMs?: number };
type Registry = ReturnType<typeof getDefaultCanonicalStorageSliceRegistry>;
type Blocker = { code: string | null; severity?: string; details?: { repairCount?: number; repairKeys?: string[]; illegalFlags?: string[]; sliceKey?: string | null; auditReason?: string | null; auditBlocking?: boolean } };
type RollbackResult = { ok: boolean; phase: string; blockers: Blocker[] };

function createSnapshotBuilder() {
    return (avatar: string, directories: Parameters<typeof auditCanonicalShadowImport>[0]['directories']) => buildCharacterFileSnapshotRow({
        avatar,
        directories: directories as UserDirectoryList,
        readCharacterData: filePath => parseCharacterCard(filePath, 'png'),
        getCharaCardV2: getCharaCardV2 as Parameters<typeof buildCharacterFileSnapshotRow>[0]['getCharaCardV2'],
    });
}

function getCharacterDirectoryPath(directories: UserDirectoryList, avatarFilename: string) {
    return path.join(directories.characters, avatarFilename);
}

function parseAvatarInternalName(avatarFilename: string) {
    return path.parse(avatarFilename).name;
}

function toJsonData(payload: object) {
    if (typeof (payload as { json_data?: unknown })?.json_data === 'string') {
        return (payload as { json_data: string }).json_data;
    }
    return JSON.stringify(payload);
}

async function normalizeImageToPngBuffer(sourcePath: string) {
    const resolvedSourcePath = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.resolve(serverDirectory, sourcePath);
    try {
        return await avatarToPngSized(resolvedSourcePath, AVATAR_WIDTH, AVATAR_HEIGHT);
    } catch {
        return fs.readFileSync(resolvedSourcePath);
    }
}

async function resolveProjectionSourceImage({ repair, directories }: { repair: CharacterRepair; directories: UserDirectoryList }): Promise<{ ok: true; sourcePath: string } | { ok: false; blocker: string }> {
    const detailSource = typeof repair.details?.sourceImage === 'string' ? repair.details.sourceImage : null;
    const targetPath = repair.avatarFilename ? getCharacterDirectoryPath(directories, repair.avatarFilename) : null;

    if (detailSource && detailSource !== 'buffer' && fs.existsSync(detailSource)) {
        return { ok: true, sourcePath: detailSource };
    }
    if (targetPath && fs.existsSync(targetPath)) {
        return { ok: true, sourcePath: targetPath };
    }
    if (repair.details?.sourceAvatarPath && fs.existsSync(repair.details.sourceAvatarPath)) {
        return { ok: true, sourcePath: repair.details.sourceAvatarPath };
    }
    if (repair.details?.operation === 'create' || repair.reason === 'projection_failed') {
        return { ok: true, sourcePath: DEFAULT_AVATAR_PATH };
    }

    return {
        ok: false,
        blocker: 'missing_projection_source_image',
    };
}

async function writeProjectionFile({ directories, avatarFilename, payload, sourcePath }: { directories: UserDirectoryList; avatarFilename: string; payload: object; sourcePath: string }) {
    const outputPath = getCharacterDirectoryPath(directories, avatarFilename);
    const inputImage = await normalizeImageToPngBuffer(sourcePath);
    const outputImage = writeCharacterCard(inputImage, toJsonData(payload));
    writeFileAtomicSync(outputPath, outputImage);
    return outputPath;
}

function moveChatsIfNeeded({ oldInternalName, newInternalName, directories }: { oldInternalName: string; newInternalName: string; directories: UserDirectoryList }) {
    const oldChatsPath = path.join(directories.chats, oldInternalName);
    const newChatsPath = path.join(directories.chats, newInternalName);
    if (fs.existsSync(oldChatsPath) && !fs.existsSync(newChatsPath)) {
        fs.cpSync(oldChatsPath, newChatsPath, { recursive: true });
        fs.rmSync(oldChatsPath, { recursive: true, force: true });
    }
}

function toRequestedRepairKeySet(repairKeys: unknown) {
    return Array.isArray(repairKeys) && repairKeys.length > 0
        ? new Set(repairKeys.map(String))
        : null;
}

function buildMissingRepairResults(requested: Set<string> | null, openRepairs: { repairKey: unknown }[] | null | undefined): RepairResult[] {
    if (!requested) {
        return [];
    }

    const openRepairKeys = new Set((openRepairs ?? []).map(repair => String(repair.repairKey)));
    return Array.from(requested)
        .filter(repairKey => !openRepairKeys.has(repairKey))
        .map(repairKey => ({
            repairKey,
            status: 'blocked',
            blocker: 'repair_not_found',
        }));
}

function deleteProjectionForRepair({ repair, directories }: { repair: CharacterRepair; directories: UserDirectoryList }) {
    const avatarPath = getCharacterDirectoryPath(directories, repair.avatarFilename);
    if (fs.existsSync(avatarPath)) {
        fs.rmSync(avatarPath, { force: true });
    }
    if (repair.details?.deleteChats) {
        const chatsDirectoryName = repair.details?.chatsDirectoryName ?? parseAvatarInternalName(repair.avatarFilename);
        const chatsPath = path.join(directories.chats, chatsDirectoryName);
        fs.rmSync(chatsPath, { recursive: true, force: true });
    }
}

async function repairSingleProjection({ db, directories, repair, nowMs = Date.now() }: { db: DatabaseSync; directories: UserDirectoryList; repair: CharacterRepair; nowMs?: number }): Promise<RepairResult> {
    const operation = repair.details?.operation ?? null;

    if (operation === 'delete') {
        deleteProjectionForRepair({ repair, directories });
        withCanonicalTransaction(db, txnDb => {
            resolveProjectionRepair(txnDb, {
                repairKey: repair.repairKey,
                resolvedAtMs: nowMs,
            });
        });
        return { repairKey: repair.repairKey, status: 'repaired', operation };
    }

    const payload = getCanonicalCharacter(db, repair.avatarFilename, { includeChatStats: true });
    if (!payload) {
        return {
            repairKey: repair.repairKey,
            status: 'blocked',
            operation,
            blocker: 'missing_canonical_row',
        };
    }

    const sourceImage = await resolveProjectionSourceImage({ repair, directories });
    if (!sourceImage.ok) {
        return {
            repairKey: repair.repairKey,
            status: 'blocked',
            operation,
            blocker: sourceImage.blocker,
        };
    }

    await writeProjectionFile({
        directories,
        avatarFilename: repair.avatarFilename,
        payload,
        sourcePath: sourceImage.sourcePath,
    });

    if (operation === 'rename') {
        const oldAvatarName = repair.details?.oldAvatarName;
        if (oldAvatarName) {
            const oldAvatarPath = getCharacterDirectoryPath(directories, oldAvatarName);
            if (fs.existsSync(oldAvatarPath)) {
                fs.rmSync(oldAvatarPath, { force: true });
            }
        }

        if (repair.details?.oldInternalName && repair.details?.newInternalName) {
            moveChatsIfNeeded({
                oldInternalName: repair.details.oldInternalName,
                newInternalName: repair.details.newInternalName,
                directories,
            });
        }
    }

    withCanonicalTransaction(db, txnDb => {
        resolveProjectionRepair(txnDb, {
            repairKey: repair.repairKey,
            resolvedAtMs: nowMs,
        });
    });
    return { repairKey: repair.repairKey, status: 'repaired', operation };
}

export function listCanonicalRepairs(db: DatabaseSync) {
    return listOpenProjectionRepairs(db);
}

export function listCanonicalWorldInfoRepairs(db: DatabaseSync) {
    return listOpenWorldInfoProjectionRepairs(db);
}

export function listCanonicalManagedMediaRepairs(db: DatabaseSync) {
    return listOpenCanonicalManagedMediaRepairs(db);
}

export function listCanonicalChatRepairs(db: DatabaseSync) {
    return listOpenCanonicalChatProjectionRepairs(db);
}

export function explainCanonicalRolloutBlockers({
    db,
    featureFlags,
    phase = 'writes',
    sliceKey = null,
    registry = getDefaultCanonicalStorageSliceRegistry(),
}: { db: DatabaseSync; featureFlags?: Record<string, unknown> | null; phase?: string; sliceKey?: string | null; registry?: Registry } = {} as { db: DatabaseSync }) {
    if (sliceKey) {
        const slice = registry.get(sliceKey);
        return slice.getRollbackBlockers({
            db,
            featureFlags: slice.getFeatureFlags(featureFlags),
            phase,
        });
    }

    // The JS dependency's inferred defaults omit accepted audit/flag values.
    const buildBlockers = buildCanonicalRollbackBlockers as unknown as (options: { db: DatabaseSync; featureFlags?: Record<string, unknown> | null; persistedAuditStatus: ReturnType<typeof getPersistedCanonicalAuditStatus>; phase: string }) => RollbackResult;
    const result = buildBlockers({
        db,
        featureFlags,
        persistedAuditStatus: getPersistedCanonicalAuditStatus(db),
        phase,
    });

    if (phase === 'writes' || phase === 'chatStats') {
        const worldInfoRepairs = listOpenWorldInfoProjectionRepairs(db);
        if (worldInfoRepairs.length > 0) {
            result.blockers.push({
                code: 'open_world_info_projection_repairs',
                severity: 'error',
                details: {
                    repairCount: worldInfoRepairs.length,
                    repairKeys: worldInfoRepairs.map(repair => repair.repairKey),
                },
            });
            result.ok = false;
        }
        const settingsRepairs = listOpenSettingsProjectionRepairs(db);
        if (settingsRepairs.length > 0) {
            result.blockers.push({
                code: 'open_settings_projection_repairs',
                severity: 'error',
                details: {
                    repairCount: settingsRepairs.length,
                    repairKeys: settingsRepairs.map(repair => repair.repairKey),
                },
            });
            result.ok = false;
        }
        const secretRepairs = listOpenSecretProjectionRepairs(db);
        if (secretRepairs.length > 0) {
            result.blockers.push({
                code: 'open_secret_projection_repairs',
                severity: 'error',
                details: {
                    repairCount: secretRepairs.length,
                    repairKeys: secretRepairs.map(repair => repair.repairKey),
                },
            });
            result.ok = false;
        }
    }

    return result;
}

function sanitizeRepairKeys(repairs: { repairKey: unknown }[] | null | undefined) {
    return (repairs ?? []).map(repair => String(repair.repairKey));
}

function summarizeSliceStatus({
    slice,
    db,
    directories,
    featureFlags,
    phase,
}: { slice: ReturnType<Registry['get']> & { authorityMode?: string }; db: DatabaseSync; directories: UserDirectoryList; featureFlags: Record<string, unknown> | null; phase: string }) {
    const flagSnapshot = slice.getFeatureFlagSnapshot?.(featureFlags) ?? {
        featureFlags: slice.getFeatureFlags(featureFlags),
        sources: {},
        resolution: { ok: true, reasonCode: null },
    };
    const sliceFlags = flagSnapshot.featureFlags;
    const migration = slice.getMigrationReadiness(db);
    const audit = getPersistedCanonicalAuditStatus(db, { scope: slice.auditScope });
    const openRepairs = slice.listOpenRepairs(db) ?? [];
    const rollback = slice.getRollbackBlockers({
        db,
        featureFlags: sliceFlags,
        phase,
        persistedAuditStatus: audit,
    });
    const backupManagedPaths = slice.getBackupManagedPaths(directories);
    // Per-slice path presence only. Full backup/restore readiness is top-level.
    const missingPaths = backupManagedPaths.filter(managedPath => {
        try {
            return !fs.existsSync(managedPath as string);
        } catch {
            return true;
        }
    });
    const backup = {
        managedPathCount: backupManagedPaths.length,
        managedPathsPresent: missingPaths.length === 0,
        ready: missingPaths.length === 0,
        blockers: missingPaths.map(pathValue => ({
            code: 'missing_managed_path',
            details: { path: pathValue, sliceKey: slice.key },
        })),
    };

    const enabled = !!sliceFlags.enabled;
    const ready = enabled
        && flagSnapshot.resolution.ok
        && !!migration?.ok
        && !audit.blocking
        && openRepairs.length === 0
        && rollback.ok;

    return {
        key: slice.key,
        auditScope: slice.auditScope,
        authorityMode: slice.authorityMode ?? 'cutover_capable',
        enabled,
        featureFlags: {
            enabled: !!sliceFlags.enabled,
            shadowImport: !!sliceFlags.shadowImport,
            reads: !!sliceFlags.reads,
            writes: !!sliceFlags.writes,
            ...(Object.prototype.hasOwnProperty.call(sliceFlags, 'chatStats')
                ? { chatStats: !!sliceFlags.chatStats }
                : {}),
            strict: !!sliceFlags.strict,
        },
        flagSources: flagSnapshot.sources,
        flagResolution: {
            ok: !!flagSnapshot.resolution.ok,
            reasonCode: flagSnapshot.resolution.reasonCode ?? null,
            blockers: flagSnapshot.resolution.ok
                ? []
                : [{
                    code: flagSnapshot.resolution.reasonCode ?? 'invalid_slice_flag_configuration',
                    severity: 'error',
                    details: { sliceKey: slice.key },
                }],
        },
        migration: {
            ok: !!migration?.ok,
            currentVersion: migration?.currentVersion ?? null,
            targetVersion: migration?.targetVersion ?? null,
            blockedReason: migration?.blockedReason ?? null,
        },
        audit: {
            scope: slice.auditScope,
            ok: !audit.blocking,
            blocking: !!audit.blocking,
            reason: audit.reason ?? null,
            status: audit.status ?? null,
            driftCount: audit.driftCount ?? 0,
            errorCount: audit.errorCount ?? 0,
            entryCount: audit.entryCount ?? 0,
            auditedAtMs: audit.auditedAtMs ?? null,
        },
        openRepairCount: openRepairs.length,
        openRepairKeys: sanitizeRepairKeys(openRepairs),
        rollback: {
            ok: !!rollback.ok,
            phase: rollback.phase ?? phase,
            blockers: (rollback.blockers ?? []).map((blocker: Blocker) => ({
                code: blocker.code,
                severity: blocker.severity ?? 'error',
                details: {
                    ...(blocker.details?.repairCount != null
                        ? { repairCount: blocker.details.repairCount }
                        : {}),
                    ...(Array.isArray(blocker.details?.repairKeys)
                        ? { repairKeys: blocker.details.repairKeys }
                        : {}),
                    ...(blocker.details?.illegalFlags
                        ? { illegalFlags: blocker.details.illegalFlags }
                        : {}),
                    ...(blocker.details?.sliceKey
                        ? { sliceKey: blocker.details.sliceKey }
                        : {}),
                    ...(blocker.details?.auditReason != null
                        ? { auditReason: blocker.details.auditReason }
                        : {}),
                    ...(blocker.details?.auditBlocking != null
                        ? { auditBlocking: !!blocker.details.auditBlocking }
                        : {}),
                },
            })),
        },
        backup,
        ready,
    };
}

/**
 * Machine-readable operator status for all registered slices.
 * Never includes repair details, card JSON, secrets, or file bodies.
 */
export function getCanonicalStorageControlPlaneStatus({
    handle,
    directories,
    db,
    featureFlags = null,
    phase = 'writes',
    sliceKeys = null,
    registry = getDefaultCanonicalStorageSliceRegistry(),
    managedFileManifest = null,
}: { handle?: string; directories: UserDirectoryList; db: DatabaseSync; featureFlags?: Record<string, unknown> | null; phase?: string; sliceKeys?: string[] | null; registry?: Registry; managedFileManifest?: unknown } = {} as { directories: UserDirectoryList; db: DatabaseSync }) {
    const keys: string[] = sliceKeys?.length
        ? sliceKeys
        : listCanonicalStorageSliceKeys(registry);
    const slices = keys.map(key => summarizeSliceStatus({
        slice: registry.get(key),
        db,
        directories,
        featureFlags,
        phase,
    }));

    // JS-inferred defaults on the registry can be narrower than its runtime contract.
    const getBackupReadiness = getCanonicalBackupRestoreReadiness as (options: { directories: UserDirectoryList; db: DatabaseSync; registry: Registry; managedFileManifest: unknown }) => { ready: boolean; ok: boolean; managedFileManifestVersion: unknown; blockers: { code: string; severity: string; details?: object }[] };
    const backupRestore = getBackupReadiness({
        directories,
        db,
        registry,
        managedFileManifest,
    });

    return {
        handle: handle ?? null,
        phase,
        sliceKeys: keys,
        slices,
        backupRestore: {
            ready: backupRestore.ready,
            ok: backupRestore.ok,
            mutatesData: false,
            managedFileManifestVersion: backupRestore.managedFileManifestVersion,
            blockers: backupRestore.blockers.map(blocker => ({
                code: blocker.code,
                severity: blocker.severity,
                details: blocker.details ?? {},
            })),
        },
        ok: slices.every(slice => slice.ready),
    };
}

export async function runCanonicalAudit({ handle, directories, db, auditedAtMs = Date.now() }: AuditOptions) {
    return auditCanonicalShadowImport({
        handle,
        directories,
        db,
        buildSnapshotRow: createSnapshotBuilder(),
        auditedAtMs,
        projection: getCanonicalStorageSlice('characters').getProjectionMode(),
    });
}

async function runCanonicalChatAudit({ handle, directories, db, auditedAtMs = Date.now() }: NonNullable<Parameters<typeof auditCanonicalChatShadowImport>[0]>) {
    return auditCanonicalChatShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
        projection: getCanonicalStorageSlice('chats').getProjectionMode(),
    });
}

export async function runCanonicalWorldInfoAudit({ handle, directories, db, auditedAtMs = Date.now() }: AuditOptions) {
    return auditCanonicalWorldInfoShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
        projection: getCanonicalStorageSlice('world_info').getProjectionMode(),
    });
}

export function rebuildCanonicalChatStats({ db, directories, avatars = null, nowMs = Date.now() }: { db: DatabaseSync; directories: UserDirectoryList; avatars?: string[] | null; nowMs?: number }) {
    const rows = db.prepare(`
        SELECT id, avatar_filename
        FROM characters
        WHERE deleted_at_ms IS NULL
        ORDER BY avatar_filename COLLATE NOCASE ASC
    `).all();
    const requested = avatars ? new Set(avatars) : null;
    const rebuilt: { avatarFilename: string; chatCount: number; chatSizeBytes: number; dateLastChatMs: number | null }[] = [];

    withCanonicalTransaction(db, txnDb => {
        for (const row of rows) {
            const avatarFilename = String(row.avatar_filename);
            if (requested && !requested.has(avatarFilename)) {
                continue;
            }

            const chatsSlice = getCanonicalStorageSlice('chats');
            const chatsFlags = chatsSlice.getFeatureFlags();
            const stats = chatsFlags.enabled && chatsFlags.writes && chatsSlice.getProjectionMode() === 'off'
                ? calculateCanonicalCharacterChatStats(db, avatarFilename.replace(/\.png$/i, ''))
                : calculateCharacterChatStats(getCharacterChatDirectory(directories, avatarFilename));
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
                row.id,
                stats.chatCount,
                stats.chatSize,
                stats.dateLastChat,
                Number(nowMs),
            );

            rebuilt.push({
                avatarFilename,
                chatCount: stats.chatCount,
                chatSizeBytes: stats.chatSize,
                dateLastChatMs: stats.dateLastChat,
            });
        }
    });

    invalidateCanonicalAuditStatus(db, {
        handle: null,
        reason: 'audit_stale_after_chat_stats_rebuild',
        source: 'canonical_repair:rebuild_chat_stats',
    });

    return {
        ok: true,
        rebuilt,
    };
}

export async function repairCanonicalProjection({ db, directories, repairKeys = null, nowMs = Date.now() }: RepairOptions) {
    const requested = toRequestedRepairKeySet(repairKeys);
    const openRepairs = listOpenProjectionRepairs(db);
    const repairs = openRepairs
        .filter((repair: CharacterRepair) => !requested || requested.has(repair.repairKey));
    const results = buildMissingRepairResults(requested, openRepairs);

    for (const repair of repairs) {
        results.push(await repairSingleProjection({ db, directories, repair, nowMs }));
    }

    if (results.some(result => result.status === 'repaired')) {
        invalidateCanonicalAuditStatus(db, {
            handle: null,
            reason: 'audit_stale_after_projection_repair',
            source: 'canonical_repair:repair_projection',
        });
    }

    return {
        ok: results.every(result => result.status === 'repaired'),
        results,
    };
}

async function repairSingleWorldInfoProjection({ db, directories, repair, nowMs = Date.now() }: { db: DatabaseSync; directories: UserDirectoryList; repair: WorldRepair; nowMs?: number }): Promise<RepairResult> {
    if (!repair.repairKey.startsWith('world-path-v1:')) {
        return {
            repairKey: repair.repairKey,
            status: 'blocked',
            operation: (repair.details as { operation?: string } | null)?.operation ?? null,
            blocker: 'legacy_world_projection_repair_blocked',
        };
    }
    return replayWorldProjection(db, { directories, repairKey: repair.repairKey, nowMs });
}

export async function repairCanonicalWorldInfoProjection({ db, directories, repairKeys = null, nowMs = Date.now() }: RepairOptions) {
    const requested = toRequestedRepairKeySet(repairKeys);
    const openRepairs = listOpenWorldInfoProjectionRepairs(db);
    const repairs = openRepairs
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = buildMissingRepairResults(requested, openRepairs);

    for (const repair of repairs) {
        results.push(await repairSingleWorldInfoProjection({ db, directories, repair, nowMs }));
    }

    if (results.some(result => result.status === 'repaired')) {
        invalidateCanonicalAuditStatus(db, {
            scope: WORLD_INFO_AUDIT_SCOPE,
            handle: null,
            reason: 'audit_stale_after_world_info_projection_repair',
            source: 'canonical_repair:repair_world_info_projection',
        });
    }

    return {
        ok: results.every(result => result.status === 'repaired'),
        results,
    };
}

function getCanonicalChatProjectionPath(directories: UserDirectoryList, sourcePath: string, ownerType: string, ownerId: string) {
    return resolveCanonicalChatProjectionPath({
        directories,
        ownerType,
        ownerId,
        sourcePath,
    });
}

function repairSingleCanonicalChatProjection({ db, directories, repair, nowMs = Date.now() }: { db: DatabaseSync; directories: UserDirectoryList; repair: ChatRepair; nowMs?: number }): RepairResult {
    const operation = repair.operation;
    try {
        return withCanonicalTransaction(db, txn => {
            const current = listOpenCanonicalChatProjectionRepairs(txn).find(item => item.repairKey === repair.repairKey);
            if (!current) return { repairKey: repair.repairKey, status: 'repaired', operation };
            repair = current;
            const filePath = getCanonicalChatProjectionPath(
                directories,
                repair.sourcePath,
                repair.ownerType,
                repair.ownerId,
            );
            const currentSession = txn.prepare('SELECT source_jsonl FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                .get(repair.ownerType, repair.ownerId, repair.sourcePath);
            if (!currentSession && repair.operation !== 'delete') {
                return { repairKey: repair.repairKey, status: 'blocked', operation: repair.operation, blocker: 'missing_canonical_chat_session' };
            }
            if (!currentSession) {
                fs.rmSync(filePath, { force: true });
                removeImportLedgerEntry(txn, {
                    sliceKey: 'chats',
                    sourcePath: repair.sourcePath,
                });
            } else {
                const jsonl = currentSession.source_jsonl as string;
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                writeFileAtomicSync(filePath, jsonl, 'utf8');
                recordImportLedgerEntry(txn, {
                    sliceKey: 'chats',
                    sourcePath: repair.sourcePath,
                    contentHash: crypto.createHash('sha256').update(jsonl).digest('hex'),
                    origin: 'projection',
                    nowMs,
                });

                if (operation === 'rename' && (repair.details as { previousSourcePath?: string })?.previousSourcePath) {
                    const previousPath = getCanonicalChatProjectionPath(
                        directories,
                        (repair.details as { previousSourcePath: string }).previousSourcePath,
                        repair.ownerType,
                        repair.ownerId,
                    );
                    if (previousPath !== filePath) {
                        const previous = txn.prepare('SELECT 1 FROM chat_sessions WHERE owner_type = ? AND owner_id = ? AND source_path = ?')
                            .get(repair.ownerType, repair.ownerId, (repair.details as { previousSourcePath: string }).previousSourcePath);
                        if (!previous) {
                            fs.rmSync(previousPath, { force: true });
                            removeImportLedgerEntry(txn, {
                                sliceKey: 'chats',
                                sourcePath: (repair.details as { previousSourcePath: string }).previousSourcePath,
                            });
                        }
                    }
                }
            }

            resolveCanonicalChatProjectionRepair(txn, {
                repairKey: repair.repairKey,
                resolvedAtMs: nowMs,
            });
            return {
                repairKey: repair.repairKey,
                status: 'repaired',
                operation,
            };
        });
    } catch (error) {
        return {
            repairKey: repair.repairKey,
            status: 'failed',
            operation,
            errorClass: String((error as { name?: unknown } | null)?.name ?? 'Error'),
        };
    }
}

export async function repairCanonicalChatProjection({ db, directories, repairKeys = null, nowMs = Date.now() }: RepairOptions) {
    const requested = toRequestedRepairKeySet(repairKeys);
    const openRepairs = listOpenCanonicalChatProjectionRepairs(db);
    const repairs = openRepairs
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = [
        ...buildMissingRepairResults(requested, openRepairs),
        ...repairs.map(repair => repairSingleCanonicalChatProjection({
            db,
            directories,
            repair,
            nowMs,
        })),
    ];

    if (results.some(result => result.status === 'repaired')) {
        invalidateCanonicalAuditStatus(db, {
            scope: CANONICAL_CHAT_AUDIT_SCOPE,
            handle: null,
            reason: 'audit_stale_after_chat_projection_repair',
            source: 'canonical_repair:repair_chat_projection',
        });
    }

    return {
        ok: results.every(result => result.status === 'repaired'),
        results,
    };
}


async function runCanonicalSettingsAudit({ handle, directories, db, auditedAtMs = Date.now() }: AuditOptions) {
    return auditCanonicalSettingsShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
        projection: getCanonicalStorageSlice('settings').getProjectionMode(),
    } as Parameters<typeof auditCanonicalSettingsShadowImport>[0]);
}

async function repairCanonicalSettingsProjection({ db, directories: _directories, repairKeys = null, nowMs = Date.now() }: RepairOptions) {
    const requested = toRequestedRepairKeySet(repairKeys);
    const openRepairs = listOpenSettingsProjectionRepairs(db);
    const repairs = openRepairs
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = buildMissingRepairResults(requested, openRepairs);

    for (const repair of repairs) {
        // The settings projection was removed: there is no file to rewrite.
        // Any leftover open row is historical noise (migration v12 resolves
        // them at boot) — close it so the repair queue stays empty.
        resolveSettingsProjectionRepair(db, {
            repairKey: repair.repairKey,
            resolvedAtMs: nowMs,
        });
        results.push({
            repairKey: repair.repairKey,
            status: 'repaired',
            reason: 'projection_removed',
        });
    }

    return {
        ok: results.every(result => result.status === 'repaired' || result.status === 'skipped'),
        results,
    };
}

async function runCanonicalSecretsAudit({ handle, directories, db, auditedAtMs = Date.now() }: AuditOptions) {
    return auditCanonicalSecretsShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
        projection: getCanonicalStorageSlice('secrets').getProjectionMode(),
    });
}

export function listCanonicalSecretRepairs(db: DatabaseSync) {
    return listOpenSecretProjectionRepairs(db);
}

export async function repairCanonicalSecretProjection({
    db,
    directories,
    repairKeys = null,
    nowMs = Date.now(),
}: RepairOptions = {} as RepairOptions) {
    const requested = toRequestedRepairKeySet(repairKeys);
    const openRepairs = listOpenSecretProjectionRepairs(db);
    const repairs = openRepairs
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = buildMissingRepairResults(requested, openRepairs);

    for (const repair of repairs) {
        try {
            const filePath = path.join(directories.root, 'secrets.json');
            const contents = JSON.stringify(getCanonicalSecretsProjection(db), null, 4);
            writeFileAtomicSync(filePath, contents, 'utf8');
            recordImportLedgerEntry(db, {
                sliceKey: 'secrets',
                sourcePath: 'secrets.json',
                contentHash: crypto.createHash('sha256').update(contents).digest('hex'),
                origin: 'projection',
                nowMs,
            });
            resolveSecretProjectionRepair(db, {
                repairKey: repair.repairKey,
                resolvedAtMs: nowMs,
            });
            results.push({
                repairKey: repair.repairKey,
                status: 'repaired',
                operation: repair.operation,
            });
        } catch (error) {
            results.push({
                repairKey: repair.repairKey,
                status: 'failed',
                operation: repair.operation,
                errorClass: String((error as { name?: unknown } | null)?.name ?? 'Error'),
            });
        }
    }

    if (results.some(result => result.status === 'repaired')) {
        invalidateCanonicalAuditStatus(db, {
            scope: CANONICAL_SECRETS_AUDIT_SCOPE,
            handle: null,
            reason: 'audit_stale_after_secret_projection_repair',
            source: 'canonical_repair:repair_secret_projection',
        });
    }

    return {
        ok: results.every(result => result.status === 'repaired'),
        results,
    };
}

function ensureDefaultSliceRunners(registry = getDefaultCanonicalStorageSliceRegistry()) {
    if (typeof registry.setRunners !== 'function' || typeof registry.getRunners !== 'function') {
        return registry;
    }
    if (!registry.getRunners('characters')) {
        registry.setRunners('characters', {
            runAudit: runCanonicalAudit,
            runRepair: repairCanonicalProjection,
        });
    }
    if (!registry.getRunners('world_info')) {
        registry.setRunners('world_info', {
            runAudit: runCanonicalWorldInfoAudit,
            runRepair: repairCanonicalWorldInfoProjection,
        });
    }
    if (!registry.getRunners('settings')) {
        registry.setRunners('settings', {
            runAudit: runCanonicalSettingsAudit,
            runRepair: repairCanonicalSettingsProjection,
        });
    }
    if (!registry.getRunners('secrets')) {
        registry.setRunners('secrets', {
            runAudit: runCanonicalSecretsAudit,
            runRepair: repairCanonicalSecretProjection,
        });
    }
    if (!registry.getRunners('managed_media')) {
        registry.setRunners('managed_media', {
            runAudit: ({ handle, directories, db, auditedAtMs }: AuditOptions) => auditCanonicalManagedMediaShadowImport({
                handle,
                directories,
                db,
                auditedAtMs,
                projection: getCanonicalStorageSlice('managed_media').getProjectionMode(),
            }),
            runRepair: repairCanonicalManagedMediaProjection,
        });
    }
    if (!registry.getRunners('chats')) {
        registry.setRunners('chats', {
            runAudit: runCanonicalChatAudit,
            runRepair: repairCanonicalChatProjection,
        });
    }
    return registry;
}

export async function runCanonicalSliceAudit({
    sliceKey,
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
    registry = getDefaultCanonicalStorageSliceRegistry(),
}: AuditOptions & { sliceKey: string; registry?: Registry } = {} as AuditOptions & { sliceKey: string }) {
    const activeRegistry = ensureDefaultSliceRunners(registry);
    activeRegistry.get(sliceKey);
    const runners = activeRegistry.getRunners(sliceKey);
    if (typeof runners?.runAudit !== 'function') {
        throw new Error(`No audit runner registered for slice: ${sliceKey}`);
    }
    const result = await runners.runAudit({ handle, directories, db, auditedAtMs });
    return { ...result, sliceKey };
}

export async function runCanonicalSliceRepair({
    sliceKey,
    db,
    directories,
    repairKeys = null,
    nowMs = Date.now(),
    registry = getDefaultCanonicalStorageSliceRegistry(),
}: RepairOptions & { sliceKey: string; registry?: Registry } = {} as RepairOptions & { sliceKey: string }) {
    const activeRegistry = ensureDefaultSliceRunners(registry);
    activeRegistry.get(sliceKey);
    const runners = activeRegistry.getRunners(sliceKey);
    if (typeof runners?.runRepair !== 'function') {
        throw new Error(`No repair runner registered for slice: ${sliceKey}`);
    }
    const result = await runners.runRepair({ db, directories, repairKeys, nowMs });
    const requested = toRequestedRepairKeySet(repairKeys);
    const missingResults = buildMissingRepairResults(requested, activeRegistry.get(sliceKey).listOpenRepairs(db) ?? [])
        .filter(missing => !(result.results ?? []).some((entry: { repairKey: unknown }) => String(entry.repairKey) === missing.repairKey));
    if (missingResults.length === 0) {
        return { ...result, sliceKey };
    }

    return {
        ...result,
        ok: false,
        results: [...missingResults, ...(result.results ?? [])],
        sliceKey,
    };
}
