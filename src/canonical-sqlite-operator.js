import fs from 'node:fs';
import path from 'node:path';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { AVATAR_HEIGHT, AVATAR_WIDTH, DEFAULT_AVATAR_PATH } from './constants.js';
import { Jimp, JimpMime } from './jimp.js';
import { serverDirectory } from './server-directory.js';
import { withCanonicalTransaction } from './canonical-sqlite.js';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus, auditCanonicalShadowImport } from './canonical-sqlite-shadow-import.js';
import { auditCanonicalWorldInfoShadowImport, WORLD_INFO_AUDIT_SCOPE } from './canonical-world-info-shadow-import.js';
import { auditCanonicalSettingsShadowImport, SETTINGS_AUDIT_SCOPE } from './canonical-settings-shadow-import.js';
import { auditCanonicalManagedMediaShadowImport } from './canonical-managed-media-shadow-import.js';
import { repairCanonicalManagedMediaProjection } from './endpoints/canonical-managed-media-write-service.js';
import {
    auditCanonicalSecretsShadowImport,
    CANONICAL_SECRETS_AUDIT_SCOPE,
    getCanonicalSecretsProjection,
} from './canonical-secrets-shadow-import.js';
import {
    buildCanonicalRollbackBlockers,
    listOpenProjectionRepairs,
} from './canonical-sqlite-rollout-contract.js';
import {
    getCanonicalBackupRestoreReadiness,
    getDefaultCanonicalStorageSliceRegistry,
    listCanonicalStorageSliceKeys,
} from './canonical-storage-slice-registry.js';
import {
    getCanonicalCharacter,
    resolveProjectionRepair,
} from './endpoints/character-store.js';
import {
    getCanonicalWorldInfoBook,
    listOpenWorldInfoProjectionRepairs,
    normalizeCanonicalWorldInfoName,
    resolveWorldInfoProjectionRepair,
} from './endpoints/world-info-store.js';
import {
    listOpenSettingsProjectionRepairs,
    resolveSettingsProjectionRepair,
    getCanonicalSettingsDocument,
} from './endpoints/settings-store.js';
import {
    listOpenSecretProjectionRepairs,
    resolveSecretProjectionRepair,
} from './endpoints/canonical-secrets-store.js';
import { listOpenCanonicalManagedMediaRepairs } from './endpoints/canonical-managed-media-store.js';
import {
    buildCharacterFileSnapshotRow,
    calculateCharacterChatStats,
    getCharacterChatDirectory,
} from './endpoints/character-file-snapshot.js';
import { write as writeCharacterCard } from './character-card-parser.js';

function createSnapshotBuilder() {
    return (avatar, directories) => buildCharacterFileSnapshotRow({
        avatar,
        directories,
        readCharacterData: async filePath => fs.readFileSync(filePath, 'utf8'),
        getCharaCardV2: jsonObject => jsonObject,
    });
}

function getCharacterDirectoryPath(directories, avatarFilename) {
    return path.join(directories.characters, avatarFilename);
}

function parseAvatarInternalName(avatarFilename) {
    return path.parse(avatarFilename).name;
}

function toJsonData(payload) {
    if (typeof payload?.json_data === 'string') {
        return payload.json_data;
    }
    return JSON.stringify(payload);
}

async function normalizeImageToPngBuffer(sourcePath) {
    const resolvedSourcePath = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.resolve(serverDirectory, sourcePath);
    try {
        const image = await Jimp.read(resolvedSourcePath);
        image.cover({ w: AVATAR_WIDTH, h: AVATAR_HEIGHT });
        return await image.getBuffer(JimpMime.png);
    } catch {
        return fs.readFileSync(resolvedSourcePath);
    }
}

async function resolveProjectionSourceImage({ repair, directories }) {
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

async function writeProjectionFile({ directories, avatarFilename, payload, sourcePath }) {
    const outputPath = getCharacterDirectoryPath(directories, avatarFilename);
    const inputImage = await normalizeImageToPngBuffer(sourcePath);
    const outputImage = writeCharacterCard(inputImage, toJsonData(payload));
    writeFileAtomicSync(outputPath, outputImage);
    return outputPath;
}

function moveChatsIfNeeded({ oldInternalName, newInternalName, directories }) {
    const oldChatsPath = path.join(directories.chats, oldInternalName);
    const newChatsPath = path.join(directories.chats, newInternalName);
    if (fs.existsSync(oldChatsPath) && !fs.existsSync(newChatsPath)) {
        fs.cpSync(oldChatsPath, newChatsPath, { recursive: true });
        fs.rmSync(oldChatsPath, { recursive: true, force: true });
    }
}

function deleteProjectionForRepair({ repair, directories }) {
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

async function repairSingleProjection({ db, directories, repair, nowMs = Date.now() }) {
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

export function listCanonicalRepairs(db) {
    return listOpenProjectionRepairs(db);
}

export function listCanonicalWorldInfoRepairs(db) {
    return listOpenWorldInfoProjectionRepairs(db);
}

export function listCanonicalManagedMediaRepairs(db) {
    return listOpenCanonicalManagedMediaRepairs(db);
}

export function explainCanonicalRolloutBlockers({
    db,
    featureFlags,
    phase = 'writes',
    sliceKey = null,
    registry = getDefaultCanonicalStorageSliceRegistry(),
} = {}) {
    if (sliceKey) {
        const slice = registry.get(sliceKey);
        return slice.getRollbackBlockers({
            db,
            featureFlags: slice.getFeatureFlags(featureFlags),
            phase,
        });
    }

    // Compatibility aggregate used by the existing CLI/tests: character blockers
    // plus open world_info repairs for write-related phases.
    const result = buildCanonicalRollbackBlockers({
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

function sanitizeRepairKeys(repairs) {
    return (repairs ?? []).map(repair => String(repair.repairKey));
}

function summarizeSliceStatus({
    slice,
    db,
    directories,
    featureFlags,
    phase,
}) {
    const sliceFlags = slice.getFeatureFlags(featureFlags);
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
            return !fs.existsSync(managedPath);
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
        && !!migration?.ok
        && !audit.blocking
        && openRepairs.length === 0
        && rollback.ok;

    return {
        key: slice.key,
        auditScope: slice.auditScope,
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
            blockers: (rollback.blockers ?? []).map(blocker => ({
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
} = {}) {
    const keys = sliceKeys?.length
        ? sliceKeys
        : listCanonicalStorageSliceKeys(registry);
    const slices = keys.map(key => summarizeSliceStatus({
        slice: registry.get(key),
        db,
        directories,
        featureFlags,
        phase,
    }));

    const backupRestore = getCanonicalBackupRestoreReadiness({
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

export async function runCanonicalAudit({ handle, directories, db, auditedAtMs = Date.now() }) {
    return auditCanonicalShadowImport({
        handle,
        directories,
        db,
        buildSnapshotRow: createSnapshotBuilder(),
        auditedAtMs,
    });
}

export async function runCanonicalWorldInfoAudit({ handle, directories, db, auditedAtMs = Date.now() }) {
    return auditCanonicalWorldInfoShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
    });
}

export function rebuildCanonicalChatStats({ db, directories, avatars = null, nowMs = Date.now() }) {
    const rows = db.prepare(`
        SELECT id, avatar_filename
        FROM characters
        WHERE deleted_at_ms IS NULL
        ORDER BY avatar_filename COLLATE NOCASE ASC
    `).all();
    const requested = avatars ? new Set(avatars) : null;
    const rebuilt = [];

    withCanonicalTransaction(db, txnDb => {
        for (const row of rows) {
            const avatarFilename = String(row.avatar_filename);
            if (requested && !requested.has(avatarFilename)) {
                continue;
            }

            const chatsDirectory = getCharacterChatDirectory(directories, avatarFilename);
            const stats = calculateCharacterChatStats(chatsDirectory);
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

export async function repairCanonicalProjection({ db, directories, repairKeys = null, nowMs = Date.now() }) {
    const requested = repairKeys ? new Set(repairKeys) : null;
    const repairs = listOpenProjectionRepairs(db)
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = [];

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

function writeWorldInfoProjectionFile({ directories, worldName, payload }) {
    const normalizedWorldName = normalizeCanonicalWorldInfoName(worldName);
    const outputPath = path.join(directories.worlds, `${normalizedWorldName}.json`);
    fs.mkdirSync(directories.worlds, { recursive: true });
    writeFileAtomicSync(outputPath, JSON.stringify(payload, null, 4));
    return outputPath;
}

function deleteWorldInfoProjectionForRepair({ repair, directories }) {
    const normalizedWorldName = normalizeCanonicalWorldInfoName(repair.worldName);
    const outputPath = path.join(directories.worlds, `${normalizedWorldName}.json`);
    fs.rmSync(outputPath, { force: true });
}

async function repairSingleWorldInfoProjection({ db, directories, repair, nowMs = Date.now() }) {
    const operation = repair.details?.operation ?? null;
    if (operation === 'delete') {
        deleteWorldInfoProjectionForRepair({ repair, directories });
        withCanonicalTransaction(db, txnDb => {
            resolveWorldInfoProjectionRepair(txnDb, {
                repairKey: repair.repairKey,
                resolvedAtMs: nowMs,
            });
        });
        return {
            repairKey: repair.repairKey,
            status: 'repaired',
            operation,
        };
    }

    const payload = getCanonicalWorldInfoBook(db, repair.worldName);
    if (!payload) {
        return {
            repairKey: repair.repairKey,
            status: 'blocked',
            operation,
            blocker: 'missing_canonical_world_info_row',
        };
    }

    writeWorldInfoProjectionFile({
        directories,
        worldName: repair.worldName,
        payload,
    });

    withCanonicalTransaction(db, txnDb => {
        resolveWorldInfoProjectionRepair(txnDb, {
            repairKey: repair.repairKey,
            resolvedAtMs: nowMs,
        });
    });

    return {
        repairKey: repair.repairKey,
        status: 'repaired',
        operation,
    };
}

export async function repairCanonicalWorldInfoProjection({ db, directories, repairKeys = null, nowMs = Date.now() }) {
    const requested = repairKeys ? new Set(repairKeys) : null;
    const repairs = listOpenWorldInfoProjectionRepairs(db)
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = [];

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


async function runCanonicalSettingsAudit({ handle, directories, db, auditedAtMs = Date.now() }) {
    return auditCanonicalSettingsShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
    });
}

async function repairCanonicalSettingsProjection({ db, directories, repairKeys = null, nowMs = Date.now() }) {
    const requested = Array.isArray(repairKeys) && repairKeys.length > 0
        ? new Set(repairKeys.map(String))
        : null;
    const repairs = listOpenSettingsProjectionRepairs(db)
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = [];

    for (const repair of repairs) {
        const document = getCanonicalSettingsDocument(db, { userId: repair.userId });
        if (!document) {
            results.push({
                repairKey: repair.repairKey,
                status: 'skipped',
                reason: 'missing_canonical_settings_document',
            });
            continue;
        }
        try {
            const pathToSettings = path.join(directories.root, 'settings.json');
            writeFileAtomicSync(pathToSettings, JSON.stringify(document.payload, null, 4), 'utf8');
            resolveSettingsProjectionRepair(db, {
                repairKey: repair.repairKey,
                resolvedAtMs: nowMs,
            });
            results.push({
                repairKey: repair.repairKey,
                status: 'repaired',
            });
        } catch (error) {
            results.push({
                repairKey: repair.repairKey,
                status: 'failed',
                error: String(error?.message ?? error ?? ''),
            });
        }
    }

    if (results.some(result => result.status === 'repaired')) {
        invalidateCanonicalAuditStatus(db, {
            scope: SETTINGS_AUDIT_SCOPE,
            handle: null,
            reason: 'audit_stale_after_settings_projection_repair',
            source: 'canonical_repair:repair_settings_projection',
        });
    }

    return {
        ok: results.every(result => result.status === 'repaired' || result.status === 'skipped'),
        results,
    };
}

async function runCanonicalSecretsAudit({ handle, directories, db, auditedAtMs = Date.now() }) {
    return auditCanonicalSecretsShadowImport({
        handle,
        directories,
        db,
        auditedAtMs,
    });
}

export function listCanonicalSecretRepairs(db) {
    return listOpenSecretProjectionRepairs(db);
}

export async function repairCanonicalSecretProjection({
    db,
    directories,
    repairKeys = null,
    nowMs = Date.now(),
} = {}) {
    const requested = Array.isArray(repairKeys) && repairKeys.length > 0
        ? new Set(repairKeys.map(String))
        : null;
    const openRepairs = listOpenSecretProjectionRepairs(db);
    const repairs = openRepairs
        .filter(repair => !requested || requested.has(repair.repairKey));
    const results = requested
        ? Array.from(requested)
            .filter(repairKey => !openRepairs.some(repair => repair.repairKey === repairKey))
            .map(repairKey => ({
                repairKey,
                status: 'blocked',
                blocker: 'repair_not_found',
            }))
        : [];

    for (const repair of repairs) {
        try {
            const filePath = path.join(directories.root, 'secrets.json');
            writeFileAtomicSync(filePath, JSON.stringify(getCanonicalSecretsProjection(db), null, 4), 'utf8');
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
                errorClass: String(error?.name ?? 'Error'),
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
            runAudit: auditCanonicalManagedMediaShadowImport,
            runRepair: repairCanonicalManagedMediaProjection,
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
} = {}) {
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
} = {}) {
    const activeRegistry = ensureDefaultSliceRunners(registry);
    activeRegistry.get(sliceKey);
    const runners = activeRegistry.getRunners(sliceKey);
    if (typeof runners?.runRepair !== 'function') {
        throw new Error(`No repair runner registered for slice: ${sliceKey}`);
    }
    const result = await runners.runRepair({ db, directories, repairKeys, nowMs });
    return { ...result, sliceKey };
}
