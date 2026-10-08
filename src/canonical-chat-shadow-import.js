import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    classifyImportCandidate,
    recordImportLedgerEntry,
    resolveAuditDriftReason,
} from './canonical-import-ledger.js';
import { getCanonicalMigrationStatus, runCanonicalMigrations } from './canonical-sqlite-migrations.js';
import { persistCanonicalAuditStatus } from './canonical-sqlite-shadow-import.js';
import {
    getCanonicalChatMessagePayloads,
    getCanonicalChatSession,
    listCanonicalChatSessions,
    listOpenCanonicalChatProjectionRepairs,
    upsertCanonicalChatSession,
} from './endpoints/canonical-chat-store.js';

export const CANONICAL_CHAT_AUDIT_SCOPE = 'chats';

function hashIdentity(...parts) {
    const hash = crypto.createHash('sha256');
    for (const part of parts) {
        hash.update(String(part));
        hash.update('\u0000');
    }
    return hash.digest('hex');
}

function toSourcePath(directories, filePath) {
    return path.relative(directories.root, filePath).split(path.sep).join('/');
}

function listJsonlFiles(root) {
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.jsonl')
        .map(entry => path.join(root, entry.name))
        .sort((left, right) => left.localeCompare(right));
}

function listChatProjectionFiles(directories) {
    const characterFiles = [];
    let characterDirectories = [];
    try {
        characterDirectories = fs.readdirSync(directories?.chats, { withFileTypes: true });
    } catch {
        characterDirectories = [];
    }
    for (const entry of characterDirectories) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            continue;
        }
        const root = path.join(directories.chats, entry.name);
        for (const filePath of listJsonlFiles(root)) {
            characterFiles.push({
                ownerType: 'character',
                ownerId: entry.name,
                sourcePath: toSourcePath(directories, filePath),
                filePath,
            });
        }
    }

    const groupFiles = listJsonlFiles(directories?.groupChats).map(filePath => ({
        ownerType: 'group',
        ownerId: path.parse(filePath).name,
        sourcePath: toSourcePath(directories, filePath),
        filePath,
    }));
    return [...characterFiles, ...groupFiles].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

function parseJsonlProjection(item) {
    const sourceJsonl = fs.readFileSync(item.filePath, 'utf8');
    const lines = sourceJsonl.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    if (lines.length === 0 || lines[0] === '') {
        throw new Error('Chat JSONL must contain a header.');
    }
    const parseLine = line => JSON.parse(line.endsWith('\r') ? line.slice(0, -1) : line);
    const header = parseLine(lines[0]);
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
        throw new Error('Chat JSONL header must be an object.');
    }
    const messages = lines.slice(1).map((line, order) => ({
        order,
        payloadJson: line.endsWith('\r') ? line.slice(0, -1) : line,
        payload: parseLine(line),
    }));
    if (messages.some(message => !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload))) {
        throw new Error('Chat JSONL messages must be objects.');
    }
    const stat = fs.statSync(item.filePath);
    return {
        ...item,
        sourceJsonl,
        headerPayloadJson: lines[0].endsWith('\r') ? lines[0].slice(0, -1) : lines[0],
        messages,
        sourceMtimeMs: Number(stat.mtimeMs ?? 0),
        sourceSizeBytes: Number(stat.size ?? 0),
    };
}

function buildSessionSourceKey(projection) {
    return hashIdentity(
        projection.ownerType,
        projection.ownerId,
        projection.headerPayloadJson,
    );
}

function getMessageIdentityBase(message) {
    const payload = message.payload;
    return payload.id
        ?? payload.mesid
        ?? payload?.extra?.id
        ?? hashIdentity(payload.name ?? '', payload.send_date ?? '', message.payloadJson);
}

function listStringLeaves(value, fieldPath = []) {
    if (typeof value === 'string') {
        return [{ value, fieldPath }];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => listStringLeaves(entry, [...fieldPath, index]));
    }
    if (!value || typeof value !== 'object') {
        return [];
    }
    return Object.entries(value).flatMap(([key, entry]) => listStringLeaves(entry, [...fieldPath, key]));
}

function isManagedAttachmentCandidate(value) {
    return /^(files|assets|user-images)\//.test(value);
}

function getManagedMediaByCompatibilityPath(db) {
    try {
        return new Map(db.prepare(`
            SELECT compatibility_path, blob_id
            FROM media_references
            WHERE deleted_at_ms IS NULL
        `).all().map(row => [row.compatibility_path, row.blob_id]));
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: media_references')) {
            return new Map();
        }
        throw error;
    }
}

function buildChatRecord(projection, db, nowMs) {
    const sourceKey = buildSessionSourceKey(projection);
    const occurrenceByBase = new Map();
    const mediaByPath = getManagedMediaByCompatibilityPath(db);
    return {
        id: `chat-session-${sourceKey}`,
        ownerType: projection.ownerType,
        ownerId: projection.ownerId,
        sourceKey,
        sourcePath: projection.sourcePath,
        displayName: path.parse(projection.filePath).name,
        headerPayloadJson: projection.headerPayloadJson,
        sourceJsonl: projection.sourceJsonl,
        sourceMtimeMs: projection.sourceMtimeMs,
        sourceSizeBytes: projection.sourceSizeBytes,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        messages: projection.messages.map(message => {
            const base = String(getMessageIdentityBase(message));
            const occurrence = occurrenceByBase.get(base) ?? 0;
            occurrenceByBase.set(base, occurrence + 1);
            const identityKey = hashIdentity(base, occurrence);
            const attachments = listStringLeaves(message.payload)
                .filter(leaf => mediaByPath.has(leaf.value))
                .map(leaf => ({
                    blobId: mediaByPath.get(leaf.value),
                    role: 'attachment',
                    compatibility: {
                        path: leaf.value,
                        fieldPath: leaf.fieldPath,
                    },
                }));
            return {
                id: `chat-message-${hashIdentity(sourceKey, identityKey)}`,
                order: message.order,
                identityKey,
                payloadJson: message.payloadJson,
                payload: message.payload,
                createdAtMs: Number(message.payload.send_date ?? 0) || null,
                attachments,
            };
        }),
    };
}

function summarizeImport({ handle, entries, skipped = false, reason = null, migrationStatus = null }) {
    const count = status => entries.filter(entry => entry.status === status).length;
    return {
        ok: skipped || (reason == null && count('error') === 0 && migrationStatus?.ok !== false),
        handle,
        skipped,
        reason,
        importedCount: count('imported'),
        updatedCount: count('updated'),
        unchangedCount: count('unchanged'),
        failedCount: count('error'),
        migrationStatus,
        entries,
    };
}

function getImportDatabase({ handle, directories, db, manager, featureFlags }) {
    if (db) {
        return db;
    }
    return manager?.open({
        handle,
        directories,
        featureFlags: { enabled: true, strict: !!featureFlags?.strict },
    }) ?? null;
}

export async function runCanonicalChatShadowImport({
    handle,
    directories,
    db = null,
    manager = null,
    featureFlags,
    nowMs = Date.now(),
} = {}) {
    if (!featureFlags?.enabled) {
        return summarizeImport({ handle, skipped: true, reason: 'canonical_storage_disabled', entries: [] });
    }
    if (!featureFlags?.shadowImport) {
        return summarizeImport({ handle, skipped: true, reason: 'shadow_import_disabled', entries: [] });
    }
    const activeDb = getImportDatabase({ handle, directories, db, manager, featureFlags });
    if (!activeDb) {
        return summarizeImport({ handle, reason: 'canonical_storage_unavailable', entries: [] });
    }
    const migrationStatus = runCanonicalMigrations(activeDb, { strict: !!featureFlags.strict, nowMs });
    if (!migrationStatus.ok) {
        return summarizeImport({ handle, reason: 'migration_blocked', entries: [], migrationStatus });
    }

    const entries = [];
    const projections = [];
    for (const item of listChatProjectionFiles(directories)) {
        try {
            const projection = parseJsonlProjection(item);
            projections.push(projection);
        } catch (error) {
            entries.push({
                source_path: item.sourcePath,
                status: 'error',
                errorMessage: String(error?.message ?? error ?? ''),
            });
        }
    }
    const counts = new Map();
    for (const projection of projections) {
        const key = `${projection.ownerType}\u0000${projection.ownerId}\u0000${buildSessionSourceKey(projection)}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const projection of projections) {
        const key = `${projection.ownerType}\u0000${projection.ownerId}\u0000${buildSessionSourceKey(projection)}`;
        if (counts.get(key) > 1) {
            entries.push({
                source_path: projection.sourcePath,
                status: 'error',
                errorMessage: 'Duplicate canonical chat session identity.',
            });
            continue;
        }
        const result = upsertCanonicalChatSession(activeDb, buildChatRecord(projection, activeDb, nowMs));
        recordImportLedgerEntry(activeDb, {
            sliceKey: 'chats',
            sourcePath: projection.sourcePath,
            contentHash: crypto.createHash('sha256').update(projection.sourceJsonl).digest('hex'),
            origin: 'import',
            nowMs,
        });
        entries.push({
            source_path: projection.sourcePath,
            session_id: result.id,
            status: result.status,
        });
    }
    return summarizeImport({ handle, entries, migrationStatus });
}

/**
 * Imports on-disk chat JSONL projections that have no canonical session yet,
 * scoped to one owner chat directory or to explicit file paths. The lazy
 * per-slice shadow import runs at most once per process, so chat files that
 * appear afterwards (drops, restores, test seeding) would stay invisible to
 * canonical reads until the next init pass; this closes that gap for the
 * scope a request actually needs.
 *
 * Files that already have a canonical session are left untouched — canonical
 * stays authoritative for committed sessions and out-of-band file edits are
 * handled by the init-time audit/import cycle, not per request. Paths with
 * open projection repairs are skipped so a stale file can never regress a
 * committed canonical revision.
 *
 * @param {object} options
 * @param {import('node:sqlite').DatabaseSync} options.db Canonical database
 * @param {object} options.directories User directories
 * @param {'character'|'group'} options.ownerType Chat owner type
 * @param {string} options.ownerId Chat owner id (character internal name, or group chat file base name)
 * @param {string[]} [options.filePaths] Explicit file paths to reconcile; defaults to the owner's chat directory
 * @param {number} [options.nowMs]
 * @returns {{imported: number, errors: {sourcePath: string, message: string}[]}}
 */
export function reconcileCanonicalChatSources({
    db,
    directories,
    ownerType,
    ownerId,
    filePaths = null,
    nowMs = Date.now(),
} = {}) {
    const result = { imported: 0, errors: [] };
    if (!db || !directories) {
        return result;
    }

    const items = Array.isArray(filePaths)
        ? filePaths.map(filePath => ({
            ownerType,
            ownerId,
            filePath,
            sourcePath: toSourcePath(directories, filePath),
        }))
        : ownerType === 'character'
            ? listJsonlFiles(path.join(directories.chats, String(ownerId))).map(filePath => ({
                ownerType,
                ownerId,
                filePath,
                sourcePath: toSourcePath(directories, filePath),
            }))
            : ownerType === 'group'
                ? listJsonlFiles(directories.groupChats)
                    .filter(filePath => path.parse(filePath).name === String(ownerId))
                    .map(filePath => ({
                        ownerType,
                        ownerId,
                        filePath,
                        sourcePath: toSourcePath(directories, filePath),
                    }))
                : [];

    const openRepairPaths = new Set(listOpenCanonicalChatProjectionRepairs(db).map(repair => repair.sourcePath));
    for (const item of items) {
        if (openRepairPaths.has(item.sourcePath)) {
            continue;
        }
        try {
            if (getCanonicalChatSession(db, item)) {
                continue;
            }
            const projection = parseJsonlProjection(item);
            const persisted = upsertCanonicalChatSession(db, buildChatRecord(projection, db, nowMs));
            if (persisted.status === 'unchanged') {
                continue;
            }
            recordImportLedgerEntry(db, {
                sliceKey: 'chats',
                sourcePath: projection.sourcePath,
                contentHash: crypto.createHash('sha256').update(projection.sourceJsonl).digest('hex'),
                origin: 'import',
                nowMs,
            });
            result.imported++;
        } catch (error) {
            result.errors.push({
                sourcePath: item.sourcePath,
                message: String(error?.message ?? error ?? ''),
            });
        }
    }
    return result;
}

function buildAuditSummary({ handle, migrationStatus, entries, ignoreSuppressed = false }) {
    const active = entries.filter(entry => !(ignoreSuppressed && entry.details?.suppressed));
    const blocking = active.some(entry => entry.status === 'drift' || entry.status === 'error');
    return {
        ok: !blocking,
        handle,
        hasDrift: active.some(entry => entry.status === 'drift'),
        blocking,
        reason: resolveAuditDriftReason(blocking, entries),
        migrationStatus,
        entries,
    };
}

function buildAuditEntry({ projection, stored, status, driftTypes, details, auditedAtMs }) {
    return {
        source_path: projection?.sourcePath ?? stored?.source_path ?? null,
        session_id: stored?.id ?? null,
        status,
        drift_types: driftTypes,
        details,
        audited_at_ms: auditedAtMs,
    };
}

function collectDanglingAttachments(projection, mediaByPath) {
    return projection.messages.flatMap(message => listStringLeaves(message.payload)
        .filter(leaf => isManagedAttachmentCandidate(leaf.value) && !mediaByPath.has(leaf.value))
        .map(leaf => ({ messageOrder: message.order, path: leaf.value, fieldPath: leaf.fieldPath })));
}

function compareMessageOrder(projection, storedMessages) {
    const projectionPayloads = projection.messages.map(message => message.payloadJson);
    const storedPayloads = storedMessages.map(message => message.payloadJson);
    if (projectionPayloads.length === storedPayloads.length
        && projectionPayloads.every((payload, index) => payload === storedPayloads[index])) {
        return null;
    }
    const sortedProjection = [...projectionPayloads].sort();
    const sortedStored = [...storedPayloads].sort();
    return JSON.stringify(sortedProjection) === JSON.stringify(sortedStored)
        ? 'order_drift'
        : 'payload_drift';
}

export async function auditCanonicalChatShadowImport({
    handle,
    directories,
    db,
    auditedAtMs = Date.now(),
    projection = 'sync',
} = {}) {
    const migrationStatus = getCanonicalMigrationStatus(db);
    if (!migrationStatus.ok || migrationStatus.currentVersion !== migrationStatus.targetVersion) {
        return {
            ok: false,
            handle,
            hasDrift: false,
            blocking: true,
            reason: migrationStatus.ok ? 'migration_not_applied' : 'migration_blocked',
            migrationStatus,
            entries: [],
        };
    }

    const suppressFileSide = projection === 'off';
    const suppressDetails = suppressFileSide
        ? { projection_mode: 'off', suppressed: true }
        : {};

    const entries = [];
    const projections = [];
    for (const item of listChatProjectionFiles(directories)) {
        try {
            projections.push(parseJsonlProjection(item));
        } catch (error) {
            entries.push(buildAuditEntry({
                projection: item,
                status: 'error',
                driftTypes: ['parse_failure'],
                details: { errorMessage: String(error?.message ?? error ?? ''), ...suppressDetails },
                auditedAtMs,
            }));
        }
    }
    const mediaByPath = getManagedMediaByCompatibilityPath(db);
    const sourcePaths = new Set();
    const identityCounts = new Map();
    for (const projection of projections) {
        const sourceKey = buildSessionSourceKey(projection);
        const key = `${projection.ownerType}\u0000${projection.ownerId}\u0000${sourceKey}`;
        identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
    }

    for (const projection of projections) {
        sourcePaths.add(projection.sourcePath);
        const sourceKey = buildSessionSourceKey(projection);
        const identityKey = `${projection.ownerType}\u0000${projection.ownerId}\u0000${sourceKey}`;
        const stored = getCanonicalChatSession(db, {
            ownerType: projection.ownerType,
            ownerId: projection.ownerId,
            sourcePath: projection.sourcePath,
        });
        const importClassification = classifyImportCandidate(db, {
            sliceKey: 'chats',
            sourcePath: projection.sourcePath,
            contentHash: crypto.createHash('sha256').update(projection.sourceJsonl).digest('hex'),
        });
        if (identityCounts.get(identityKey) > 1) {
            entries.push(buildAuditEntry({
                projection,
                stored,
                status: 'drift',
                driftTypes: ['duplicate_identity'],
                details: { import_classification: importClassification, ...suppressDetails },
                auditedAtMs,
            }));
            continue;
        }
        if (!stored) {
            entries.push(buildAuditEntry({
                projection,
                status: 'drift',
                driftTypes: ['unregistered_file'],
                details: { import_classification: importClassification, ...suppressDetails },
                auditedAtMs,
            }));
            continue;
        }
        const driftType = compareMessageOrder(projection, getCanonicalChatMessagePayloads(db, stored.id));
        if (stored.source_jsonl !== projection.sourceJsonl
            || stored.header_payload_json !== projection.headerPayloadJson
            || driftType) {
            entries.push(buildAuditEntry({
                projection,
                stored,
                status: 'drift',
                driftTypes: [driftType ?? 'payload_drift'],
                details: { import_classification: importClassification, ...suppressDetails },
                auditedAtMs,
            }));
        }
        for (const attachment of collectDanglingAttachments(projection, mediaByPath)) {
            entries.push(buildAuditEntry({
                projection,
                stored,
                status: 'drift',
                driftTypes: ['dangling_attachment'],
                details: { ...attachment, ...suppressDetails },
                auditedAtMs,
            }));
        }
    }

    for (const stored of listCanonicalChatSessions(db)) {
        if (!sourcePaths.has(stored.source_path)) {
            entries.push(buildAuditEntry({
                stored,
                status: 'drift',
                driftTypes: ['missing_file'],
                details: { ...suppressDetails },
                auditedAtMs,
            }));
        }
    }
    const result = buildAuditSummary({ handle, migrationStatus, entries, ignoreSuppressed: suppressFileSide });
    persistCanonicalAuditStatus(db, result, {
        scope: CANONICAL_CHAT_AUDIT_SCOPE,
        auditedAtMs,
    });
    return result;
}
