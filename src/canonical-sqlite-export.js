import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { write as writeCharacterCard } from './character-card-parser.js';
import { listImportLedgerEntries, recordImportLedgerEntry } from './canonical-import-ledger.js';
import { resolveCanonicalChatProjectionPath } from './endpoints/canonical-chat-projection-path.js';
import { listCanonicalChatSessions } from './endpoints/canonical-chat-store.js';
import { getCanonicalManagedMediaReference, listCanonicalManagedMediaReferences } from './endpoints/canonical-managed-media-store.js';
import { getCanonicalSecretsProjection } from './canonical-secrets-shadow-import.js';
import { getCanonicalSettingsDocument } from './endpoints/settings-store.js';
import { listCanonicalWorldInfoBookRows } from './endpoints/world-info-store.js';

const DEFAULT_AVATAR_FILE = fileURLToPath(new URL('../public/img/ai4.png', import.meta.url));

/**
 * Materializes canonical SQLite rows back into the compatibility file tree.
 * This is the rollback escape hatch used before deploying a file-authoritative
 * build — every slice reproduces the on-disk shape its compatibility path
 * expects, and each written file is recorded in the import ledger as an
 * 'export' so later scans do not treat it as novel content.
 */

function rebaseDirectories(directories, outDir) {
    if (!outDir) {
        return directories;
    }
    const root = path.resolve(directories.root);
    const rebased = { ...directories, root: path.resolve(outDir) };
    for (const key of Object.keys(rebased)) {
        if (key === 'root' || typeof directories[key] !== 'string') {
            continue;
        }
        const relative = path.relative(root, directories[key]);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            rebased[key] = path.join(rebased.root, relative);
        }
    }
    return rebased;
}

function recordExport(db, { sliceKey, root, absolutePath, contents, nowMs }) {
    const sourcePath = path.relative(root, absolutePath).split(path.sep).join('/');
    recordImportLedgerEntry(db, {
        sliceKey,
        sourcePath,
        contentHash: hashContents(contents),
        origin: 'export',
        nowMs,
    });
}

function writeExportFile(target, contents) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (Buffer.isBuffer(contents)) {
        writeFileAtomicSync(target, contents);
        return;
    }
    writeFileAtomicSync(target, String(contents), 'utf8');
}

function hashContents(contents) {
    const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(String(contents), 'utf8');
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function exportCharactersSlice(db, directories, nowMs) {
    const rows = db.prepare(`
        SELECT avatar_filename, card_json
        FROM characters
        WHERE deleted_at_ms IS NULL
        ORDER BY avatar_filename COLLATE NOCASE ASC
    `).all();

    const results = [];
    for (const row of rows) {
        const avatar = String(row.avatar_filename);
        const target = path.join(directories.characters, avatar);
        try {
            const image = resolveAvatarImage(db, directories, avatar, target);
            if (!image) {
                throw new Error('no avatar image source available');
            }
            const png = writeCharacterCard(image, String(row.card_json));
            writeExportFile(target, png);
            recordExport(db, { sliceKey: 'characters', root: directories.root, absolutePath: target, contents: png, nowMs });
            results.push({ avatar, path: target, status: 'exported' });
        } catch (error) {
            // Fall back to a JSON sidecar so the card data is never stranded.
            try {
                const fallbackPath = `${target}.json`;
                writeExportFile(fallbackPath, String(row.card_json));
                results.push({ avatar, path: fallbackPath, status: 'json_fallback', reason: String(error?.message ?? error) });
            } catch (fallbackError) {
                results.push({ avatar, status: 'error', error: String(fallbackError?.message ?? fallbackError) });
            }
        }
    }
    return results;
}

function resolveAvatarImage(db, directories, avatar, fileTarget) {
    // P1+ canonical avatar blob (character-avatars/<avatar> virtual path).
    const reference = getCanonicalManagedMediaReference(db, `character-avatars/${avatar}`);
    if (reference?.managedRelativePath) {
        const blobPath = path.resolve(directories.storage, reference.managedRelativePath);
        if (fs.existsSync(blobPath)) {
            try {
                return fs.readFileSync(blobPath);
            } catch {
                // fall through to other sources
            }
        }
    }
    // Current projection bytes — text chunks are replaced by write().
    if (fs.existsSync(fileTarget)) {
        try {
            return fs.readFileSync(fileTarget);
        } catch {
            // fall through to default avatar
        }
    }
    if (fs.existsSync(DEFAULT_AVATAR_FILE)) {
        return fs.readFileSync(DEFAULT_AVATAR_FILE);
    }
    return null;
}

function exportWorldInfoSlice(db, directories, nowMs) {
    const results = [];
    for (const row of listCanonicalWorldInfoBookRows(db)) {
        if (row.deletedAtMs != null) {
            continue;
        }
        const target = path.join(directories.worlds, `${row.name}.json`);
        try {
            const contents = JSON.stringify(row.payload, null, 4);
            writeExportFile(target, contents);
            recordExport(db, { sliceKey: 'world_info', root: directories.root, absolutePath: target, contents, nowMs });
            results.push({ name: row.name, path: target, status: 'exported' });
        } catch (error) {
            results.push({ name: row.name, status: 'error', error: String(error?.message ?? error) });
        }
    }
    return results;
}

function exportSettingsSlice(db, directories, handle, nowMs) {
    const document = getCanonicalSettingsDocument(db, { userId: handle });
    if (!document) {
        return [{ status: 'skipped', reason: 'no_canonical_settings_document' }];
    }
    const target = path.join(directories.root, 'settings.json');
    try {
        writeExportFile(target, document.payloadJson);
        recordExport(db, { sliceKey: 'settings', root: directories.root, absolutePath: target, contents: document.payloadJson, nowMs });
        return [{ status: 'exported', path: target, revision: document.revision }];
    } catch (error) {
        return [{ status: 'error', error: String(error?.message ?? error) }];
    }
}

function exportSecretsSlice(db, directories, nowMs) {
    const projection = getCanonicalSecretsProjection(db);
    const target = path.join(directories.root, 'secrets.json');
    try {
        const contents = JSON.stringify(projection, null, 4);
        writeExportFile(target, contents);
        recordExport(db, { sliceKey: 'secrets', root: directories.root, absolutePath: target, contents, nowMs });
        return [{ status: 'exported', path: target, keyCount: Object.keys(projection).length }];
    } catch (error) {
        return [{ status: 'error', error: String(error?.message ?? error) }];
    }
}

function exportChatsSlice(db, directories, nowMs) {
    const results = [];
    for (const session of listCanonicalChatSessions(db)) {
        try {
            const target = resolveCanonicalChatProjectionPath({
                directories,
                ownerType: session.owner_type,
                ownerId: session.owner_id,
                sourcePath: session.source_path,
            });
            const jsonl = String(session.source_jsonl ?? '');
            writeExportFile(target, jsonl);
            recordExport(db, { sliceKey: 'chats', root: directories.root, absolutePath: target, contents: jsonl, nowMs });
            results.push({ sessionId: session.id, path: target, status: 'exported' });
        } catch (error) {
            results.push({ sessionId: session.id, sourcePath: session.source_path, status: 'error', error: String(error?.message ?? error) });
        }
    }
    return results;
}

function exportManagedMediaSlice(db, directories, nowMs) {
    const results = [];
    const storageRoot = path.resolve(directories.storage);
    for (const reference of listCanonicalManagedMediaReferences(db)) {
        try {
            const source = path.resolve(storageRoot, reference.managedRelativePath);
            const target = path.resolve(directories.root, reference.compatibilityPath);
            if (!target.startsWith(`${path.resolve(directories.root)}${path.sep}`)) {
                throw new Error(`compatibility path escapes root: ${reference.compatibilityPath}`);
            }
            if (!fs.existsSync(source)) {
                const status = fs.existsSync(target) ? 'already_exported' : 'skipped';
                results.push({ path: reference.compatibilityPath, status, reason: 'blob_not_materialized' });
                continue;
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(source, target);
            recordExport(db, {
                sliceKey: 'managed_media',
                root: directories.root,
                absolutePath: target,
                contents: fs.readFileSync(target),
                nowMs,
            });
            results.push({ path: reference.compatibilityPath, status: 'exported' });
        } catch (error) {
            results.push({ path: reference.compatibilityPath, status: 'error', error: String(error?.message ?? error) });
        }
    }
    return results;
}

const SLICE_EXPORTERS = {
    characters: exportCharactersSlice,
    world_info: exportWorldInfoSlice,
    settings: exportSettingsSlice,
    secrets: exportSecretsSlice,
    chats: exportChatsSlice,
    managed_media: exportManagedMediaSlice,
};

/**
 * @param {object} options
 * @param {object} options.db Canonical database handle
 * @param {import('./users.js').UserDirectoryList} options.directories
 * @param {string} options.handle User handle (settings document user id)
 * @param {string[]} [options.sliceKeys] Slices to export; defaults to all
 * @param {string} [options.outDir] Alternate root to materialize into
 * @returns {{ok: boolean, slices: Array<{slice: string, results: object[]}>}}
 */
export function exportCanonicalStorageToFiles({ db, directories, handle, sliceKeys = null, outDir = null, nowMs = Date.now() }) {
    const dirs = rebaseDirectories(directories, outDir);
    const keys = sliceKeys?.length ? sliceKeys : Object.keys(SLICE_EXPORTERS);
    const slices = [];
    for (const key of keys) {
        const exporter = SLICE_EXPORTERS[key];
        if (!exporter) {
            slices.push({ slice: key, results: [{ status: 'error', error: `unknown slice: ${key}` }] });
            continue;
        }
        const results = key === 'settings'
            ? exporter(db, dirs, handle, nowMs)
            : exporter(db, dirs, nowMs);
        slices.push({ slice: key, results });
    }

    // Manifest lets a fresh install (or an operator) verify what the export
    // materialized and which source files the canonical side accounted for.
    const manifest = {
        format: 'emberdesk-canonical-export',
        version: 1,
        handle,
        exportedAtMs: nowMs,
        slices: slices.map(slice => ({
            slice: slice.slice,
            exported: slice.results.filter(result => result.status === 'exported').length,
            skipped: slice.results.filter(result => result.status !== 'exported' && result.status !== 'error').length,
            errors: slice.results.filter(result => result.status === 'error').length,
        })),
        importLedger: listImportLedgerEntries(db),
    };
    const manifestPath = path.join(dirs.root, 'export-manifest.json');
    writeExportFile(manifestPath, JSON.stringify(manifest, null, 4));

    return {
        ok: slices.every(slice => slice.results.every(result => result.status !== 'error')),
        manifestPath,
        slices,
    };
}
