import fs from 'node:fs';
import path from 'node:path';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { AVATAR_HEIGHT, AVATAR_WIDTH, DEFAULT_AVATAR_PATH } from './constants.js';
import { Jimp, JimpMime } from './jimp.js';
import { serverDirectory } from './server-directory.js';
import { withCanonicalTransaction } from './canonical-sqlite.js';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus, auditCanonicalShadowImport } from './canonical-sqlite-shadow-import.js';
import { auditCanonicalWorldInfoShadowImport, WORLD_INFO_AUDIT_SCOPE } from './canonical-world-info-shadow-import.js';
import {
    buildCanonicalRollbackBlockers,
    listOpenProjectionRepairs,
} from './canonical-sqlite-rollout-contract.js';
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

export function explainCanonicalRolloutBlockers({ db, featureFlags, phase = 'writes' }) {
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
    }

    return result;
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
