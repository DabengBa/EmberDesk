import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { withCanonicalTransaction } from './canonical-sqlite.js';
import { recordImportLedgerEntry, removeImportLedgerEntry } from './canonical-import-ledger.js';
import {
    normalizeCanonicalWorldInfoName,
    getCanonicalWorldInfoBook,
    recordWorldInfoProjectionRepair,
    resolveWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBookInTransaction,
} from './endpoints/world-info-store.js';

export const WORLD_PROJECTION_INTENT_PREFIX = 'world-path-v1:';
const PREFIX = WORLD_PROJECTION_INTENT_PREFIX;
const identity = name => String(name).normalize('NFC').toLowerCase();

// A private subdirectory of worlds is on the same device and is not scanned
// as an import candidate. Keep the moved file there even after recovery.
export function moveWorldFileToLocalQuarantine(directories, source) {
    const batch = fs.mkdtempSync(path.join(directories.worlds, '.world-info-quarantine-'));
    fs.chmodSync(batch, 0o700);
    const destination = path.join(batch, path.basename(source));
    fs.renameSync(source, destination);
    return destination;
}

export function resolveWorldProjectionPath(db, directories, name, { legacyFilename = null } = {}) {
    const normalized = normalizeCanonicalWorldInfoName(name);
    const filename = `${normalized}.json`;
    if (!normalized || normalized !== name || sanitize(filename) !== filename) throw new Error('unsafe_world_projection_name');
    const root = path.resolve(directories.worlds);
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_world_projection_directory');
    for (const row of db.prepare('SELECT name FROM world_books').all()) {
        if (row.name !== normalized && identity(`${row.name}.json`) === identity(filename)) throw new Error('world_projection_ownership_conflict');
    }
    for (const entry of fs.readdirSync(root)) {
        if (entry !== filename && entry !== legacyFilename && identity(entry) === identity(filename)) throw new Error('world_projection_filename_alias');
    }
    const target = path.join(root, filename);
    try {
        if (fs.lstatSync(target).isSymbolicLink()) throw new Error('world_projection_symlink');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const key = PREFIX + crypto.createHash('sha256').update(`${fs.realpathSync(root)}\0${identity(filename)}`).digest('hex');
    return { key, target, normalized };
}

// Caller must hold BEGIN IMMEDIATE and have already changed the authority.
export function recordWorldProjectionIntent(db, { directories, name, action, mode, nowMs = Date.now() }) {
    if (!['write', 'delete'].includes(action) || !['sync', 'off'].includes(mode)) throw new Error('invalid_world_projection_intent');
    const { key, normalized } = resolveWorldProjectionPath(db, directories, name);
    const previous = db.prepare('SELECT details_json FROM world_info_projection_repairs WHERE repair_key = ?').get(key);
    const old = previous ? JSON.parse(previous.details_json) : null;
    if (old && old.version !== 1) throw new Error('unsupported_world_projection_intent');
    const row = db.prepare('SELECT id FROM world_books WHERE name = ?').get(normalized);
    const details = { version: 1, generation: Number(old?.generation ?? 0) + 1, action, mode, worldBookId: row?.id ?? null };
    recordWorldInfoProjectionRepair(db, { repairKey: key, worldName: normalized, reason: 'world_path_intent', details, nowMs });
    return key;
}

// One transaction for the authority change and its intent. Callers that
// change the book elsewhere must use recordWorldProjectionIntent directly
// inside their own transaction.
export function commitWorldBookWithProjectionIntent(db, {
    directories,
    name,
    payload,
    mode,
    nowMs = Date.now(),
    sourceMtimeMs = null,
    sourceSizeBytes = null,
    expectedPayload = undefined,
}) {
    return withCanonicalTransaction(db, txn => {
        if (expectedPayload !== undefined && JSON.stringify(getCanonicalWorldInfoBook(txn, name)) !== JSON.stringify(expectedPayload)) {
            const error = new Error('world_book_conflict');
            error.code = 'WORLD_BOOK_CONFLICT';
            throw error;
        }
        upsertCanonicalWorldInfoBookInTransaction(txn, {
            name,
            payload,
            nowMs,
            sourceMtimeMs,
            sourceSizeBytes,
        });
        return recordWorldProjectionIntent(txn, {
            directories,
            name,
            action: 'write',
            mode,
            nowMs,
        });
    });
}

// Re-read intent and authority while holding the same SQLite writer lock.
export function replayWorldProjection(db, { directories, repairKey, nowMs = Date.now() }) {
    if (!String(repairKey).startsWith(PREFIX)) throw new Error('legacy_world_projection_repair_blocked');
    return withCanonicalTransaction(db, txn => {
        const row = txn.prepare('SELECT * FROM world_info_projection_repairs WHERE repair_key = ?').get(repairKey);
        if (!row) throw new Error('world_projection_intent_not_found');
        const details = JSON.parse(row.details_json);
        if (details.version !== 1 || !Number.isSafeInteger(details.generation)
            || !['write', 'delete'].includes(details.action) || !['sync', 'off'].includes(details.mode)) {
            throw new Error('unsupported_world_projection_intent');
        }
        const { key, target } = resolveWorldProjectionPath(txn, directories, row.world_name);
        if (key !== repairKey) throw new Error('world_projection_path_changed');
        if (row.resolved_at_ms != null) return { repairKey, status: 'repaired', operation: details.action };
        const book = txn.prepare('SELECT id, payload_json, deleted_at_ms FROM world_books WHERE name = ?').get(row.world_name);
        if ((book?.id ?? null) !== details.worldBookId) throw new Error('world_projection_owner_changed');
        const sourcePath = path.relative(directories.root, target);
        if (details.action === 'write' && book && book.deleted_at_ms == null) {
            if (details.mode === 'sync') {
                const contents = JSON.stringify(JSON.parse(book.payload_json), null, 4);
                writeFileAtomicSync(target, contents, 'utf8');
                recordImportLedgerEntry(txn, { sliceKey: 'world_info', sourcePath, contentHash: crypto.createHash('sha256').update(contents).digest('hex'), origin: 'projection', nowMs });
            } else {
                if (fs.existsSync(target)) {
                    const quarantine = path.join(directories.storage, 'world-info-quarantine');
                    fs.mkdirSync(quarantine, { recursive: true, mode: 0o700 });
                    const batch = fs.mkdtempSync(path.join(quarantine, 'world-'));
                    const destination = path.join(batch, path.basename(target));
                    try {
                        fs.renameSync(target, destination);
                    } catch (error) {
                        if (error.code !== 'EXDEV') throw error;
                        // Never unlink the shared path after copying: it may
                        // already refer to an unrelated replacement file.
                        moveWorldFileToLocalQuarantine(directories, target);
                    }
                }
                removeImportLedgerEntry(txn, { sliceKey: 'world_info', sourcePath });
            }
        } else if (details.action === 'delete' && (!book || book.deleted_at_ms != null)) {
            fs.rmSync(target, { force: true });
            removeImportLedgerEntry(txn, { sliceKey: 'world_info', sourcePath });
        } else throw new Error('world_projection_authority_conflict');
        resolveWorldInfoProjectionRepair(txn, { repairKey, resolvedAtMs: nowMs });
        return { repairKey, status: 'repaired', operation: details.action };
    });
}
