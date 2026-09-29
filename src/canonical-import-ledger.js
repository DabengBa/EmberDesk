import crypto from 'node:crypto';

/**
 * Canonical import ledger (migration v10 `import_ledger`).
 *
 * Compatibility files are no longer a second authority once canonical slices
 * are active — they are either known exports of canonical state or pending
 * import candidates. The ledger records, per (slice, source path), the last
 * content hash the canonical side has already accounted for, together with
 * how that hash entered the record:
 *
 *  - 'import'     : file content was imported into canonical storage
 *  - 'projection' : file content was produced by a canonical write projection
 *  - 'export'     : file content was produced by an explicit export (export-all)
 *
 * Scan-time classification:
 *  - file hash === ledger hash            → 'known'     (already accounted for)
 *  - path tracked but hash differs        → 'candidate' (out-of-band change)
 *  - path untracked                       → 'candidate' (never seen)
 *
 * The candidate classification is what lets post-projection-off installs treat
 * a stale compatibility file as inert instead of regressing canonical rows.
 */

/** @param {string|Buffer} contents */
export function hashImportLedgerContents(contents) {
    return crypto.createHash('sha256').update(contents).digest('hex');
}

function normalizeSourcePath(sourcePath) {
    const normalized = String(sourcePath ?? '').split(pathSepPattern).join('/');
    if (!normalized) {
        throw new Error('import ledger source path is required');
    }
    return normalized;
}

const pathSepPattern = /\\/g;

function normalizeRow(row) {
    return {
        sliceKey: String(row.slice_key),
        sourcePath: String(row.source_path),
        contentHash: String(row.content_hash),
        origin: String(row.origin),
        importedAtMs: Number(row.imported_at_ms),
    };
}

/**
 * Records that canonical storage has accounted for `contentHash` at
 * `sourcePath` for `sliceKey`. Idempotent: re-recording the same hash is a
 * timestamp refresh, recording a different hash supersedes the prior entry.
 */
export function recordImportLedgerEntry(db, {
    sliceKey,
    sourcePath,
    contentHash,
    origin,
    nowMs = Date.now(),
}) {
    if (!db) {
        throw new Error('import ledger requires a canonical database handle');
    }
    const normalizedSlice = String(sliceKey ?? '');
    if (!normalizedSlice) {
        throw new Error('import ledger slice key is required');
    }
    const normalizedOrigin = String(origin ?? '');
    if (!['import', 'projection', 'export'].includes(normalizedOrigin)) {
        throw new Error(`import ledger origin is invalid: ${normalizedOrigin}`);
    }
    const normalizedPath = normalizeSourcePath(sourcePath);
    const normalizedHash = String(contentHash ?? '');
    if (!normalizedHash) {
        throw new Error('import ledger content hash is required');
    }
    db.prepare(`
        INSERT INTO import_ledger (slice_key, source_path, content_hash, origin, imported_at_ms)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(slice_key, source_path) DO UPDATE SET
            content_hash = excluded.content_hash,
            origin = excluded.origin,
            imported_at_ms = excluded.imported_at_ms
    `).run(normalizedSlice, normalizedPath, normalizedHash, normalizedOrigin, Number(nowMs));
    return { sliceKey: normalizedSlice, sourcePath: normalizedPath, contentHash: normalizedHash, origin: normalizedOrigin };
}

export function getImportLedgerEntry(db, { sliceKey, sourcePath }) {
    const row = db.prepare(`
        SELECT slice_key, source_path, content_hash, origin, imported_at_ms
        FROM import_ledger
        WHERE slice_key = ? AND source_path = ?
    `).get(String(sliceKey ?? ''), normalizeSourcePath(sourcePath));
    return row ? normalizeRow(row) : null;
}

/**
 * Classifies a compatibility file against the ledger.
 * @returns {'known'|'candidate'}
 */
export function classifyImportCandidate(db, { sliceKey, sourcePath, contentHash }) {
    const entry = getImportLedgerEntry(db, { sliceKey, sourcePath });
    if (!entry) {
        return 'candidate';
    }
    return entry.contentHash === String(contentHash ?? '') ? 'known' : 'candidate';
}

export function listImportLedgerEntries(db, { sliceKey = null } = {}) {
    const rows = sliceKey == null
        ? db.prepare(`
            SELECT slice_key, source_path, content_hash, origin, imported_at_ms
            FROM import_ledger
            ORDER BY slice_key ASC, source_path ASC
        `).all()
        : db.prepare(`
            SELECT slice_key, source_path, content_hash, origin, imported_at_ms
            FROM import_ledger
            WHERE slice_key = ?
            ORDER BY source_path ASC
        `).all(String(sliceKey));
    return rows.map(normalizeRow);
}

/**
 * Resolves the persisted audit reason for a slice audit that carries
 * ledger classification in entry details.
 *
 *  - 'candidate' file drift means the file changed since canonical storage
 *    last accounted for it — import heals it, so the slice reports
 *    'audit_stale_file_changes' (routes to shadow import on next init).
 *  - 'known' file drift means the file matches the last accounted state
 *    while the DB diverged — projection lag; stays 'audit_drift_blocked'
 *    until repair replays the projection.
 *
 * @param {boolean} blocking
 * @param {Array<{status: string, details?: object}>} entries
 */
export function resolveAuditDriftReason(blocking, entries) {
    if (!blocking) {
        return null;
    }
    const hasImportCandidate = entries.some(entry =>
        entry.status === 'drift' && entry.details?.import_classification === 'candidate');
    return hasImportCandidate ? 'audit_stale_file_changes' : 'audit_drift_blocked';
}

export function removeImportLedgerEntry(db, { sliceKey, sourcePath }) {
    db.prepare('DELETE FROM import_ledger WHERE slice_key = ? AND source_path = ?')
        .run(String(sliceKey ?? ''), normalizeSourcePath(sourcePath));
}
