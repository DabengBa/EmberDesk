import sanitize from 'sanitize-filename';

import { withCanonicalTransaction } from '../canonical-sqlite.js';
import { uuidv4 } from '../util.js';

function cloneJson(payload) {
    return JSON.parse(JSON.stringify(payload ?? {}));
}

function parseRequiredJson(value, fieldName) {
    try {
        return JSON.parse(String(value ?? '{}'));
    } catch (error) {
        throw new Error(`Canonical World Info row has invalid ${fieldName}: ${String(error?.message ?? error ?? '')}`);
    }
}

function getRouteVisibleName(name, payload) {
    return String(payload?.name || name);
}

function getExtensions(payload) {
    const extensions = payload?.extensions;
    return extensions && typeof extensions === 'object' && !Array.isArray(extensions) ? cloneJson(extensions) : {};
}

export function normalizeCanonicalWorldInfoName(name) {
    return sanitize(String(name ?? '').trim()).trim();
}

function getExistingWorldBookRow(db, name) {
    return db.prepare(`
        SELECT id, name, payload_json, metadata_json, deleted_at_ms
        FROM world_books
        WHERE name = ?
    `).get(name);
}

function normalizeEntryRecord({ worldBookId, entryKey, entry, nowMs }) {
    const payload = cloneJson(entry);
    return {
        id: uuidv4(),
        world_book_id: worldBookId,
        entry_key: String(entryKey),
        uid: Number.isInteger(payload.uid) ? payload.uid : null,
        key_json: JSON.stringify(Array.isArray(payload.key) ? payload.key : []),
        keysecondary_json: JSON.stringify(Array.isArray(payload.keysecondary) ? payload.keysecondary : []),
        content: String(payload.content ?? ''),
        comment: String(payload.comment ?? ''),
        order_value: Number.isFinite(Number(payload.order)) ? Number(payload.order) : 0,
        enabled: payload.enabled === false ? 0 : 1,
        selective: payload.selective === true ? 1 : 0,
        constant: payload.constant === true ? 1 : 0,
        position: payload.position == null ? null : Number(payload.position),
        role: payload.role == null ? null : Number(payload.role),
        probability: payload.probability == null ? null : Number(payload.probability),
        depth: payload.depth == null ? null : Number(payload.depth),
        extensions_json: JSON.stringify(getExtensions(payload)),
        payload_json: JSON.stringify(payload),
        updated_at_ms: Number(nowMs ?? Date.now()),
        deleted_at_ms: null,
    };
}

function replaceWorldBookEntries(db, { worldBookId, entries, nowMs }) {
    db.prepare('DELETE FROM world_book_entries WHERE world_book_id = ?').run(worldBookId);

    const insert = db.prepare(`
        INSERT INTO world_book_entries (
            id,
            world_book_id,
            entry_key,
            uid,
            key_json,
            keysecondary_json,
            content,
            comment,
            order_value,
            enabled,
            selective,
            constant,
            position,
            role,
            probability,
            depth,
            extensions_json,
            payload_json,
            updated_at_ms,
            deleted_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [entryKey, entry] of Object.entries(entries ?? {})) {
        const record = normalizeEntryRecord({ worldBookId, entryKey, entry, nowMs });
        insert.run(
            record.id,
            record.world_book_id,
            record.entry_key,
            record.uid,
            record.key_json,
            record.keysecondary_json,
            record.content,
            record.comment,
            record.order_value,
            record.enabled,
            record.selective,
            record.constant,
            record.position,
            record.role,
            record.probability,
            record.depth,
            record.extensions_json,
            record.payload_json,
            record.updated_at_ms,
            record.deleted_at_ms,
        );
    }
}

export function upsertCanonicalWorldInfoBook(db, {
    name,
    payload,
    sourceMtimeMs = 0,
    sourceSizeBytes = 0,
    nowMs = Date.now(),
}) {
    const normalizedName = normalizeCanonicalWorldInfoName(name);
    if (!normalizedName) {
        throw new Error('Canonical World Info book name is required');
    }

    const normalizedPayload = cloneJson(payload);
    if (!normalizedPayload.entries || typeof normalizedPayload.entries !== 'object' || Array.isArray(normalizedPayload.entries)) {
        normalizedPayload.entries = {};
    }

    const existing = getExistingWorldBookRow(db, normalizedName);
    const worldBookId = existing?.id ?? uuidv4();
    const metadata = {
        routeName: getRouteVisibleName(normalizedName, normalizedPayload),
        extensions: getExtensions(normalizedPayload),
    };

    withCanonicalTransaction(db, txnDb => {
        txnDb.prepare(`
            INSERT INTO world_books (
                id,
                name,
                payload_json,
                metadata_json,
                source_mtime_ms,
                source_size_bytes,
                created_at_ms,
                updated_at_ms,
                deleted_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(name) DO UPDATE SET
                payload_json = excluded.payload_json,
                metadata_json = excluded.metadata_json,
                source_mtime_ms = excluded.source_mtime_ms,
                source_size_bytes = excluded.source_size_bytes,
                updated_at_ms = excluded.updated_at_ms,
                deleted_at_ms = NULL
        `).run(
            worldBookId,
            normalizedName,
            JSON.stringify(normalizedPayload),
            JSON.stringify(metadata),
            Number(sourceMtimeMs ?? 0),
            Number(sourceSizeBytes ?? 0),
            Number(nowMs),
            Number(nowMs),
        );

        replaceWorldBookEntries(txnDb, {
            worldBookId,
            entries: normalizedPayload.entries,
            nowMs,
        });
    });

    return { id: worldBookId, name: normalizedName };
}

export function getCanonicalWorldInfoBook(db, name) {
    const row = db.prepare(`
        SELECT payload_json
        FROM world_books
        WHERE name = ?
            AND deleted_at_ms IS NULL
    `).get(normalizeCanonicalWorldInfoName(name));

    if (!row) {
        return null;
    }

    return parseRequiredJson(row.payload_json, 'payload_json');
}

export function listCanonicalWorldInfoBooks(db) {
    const rows = db.prepare(`
        SELECT name, payload_json, metadata_json
        FROM world_books
        WHERE deleted_at_ms IS NULL
        ORDER BY name COLLATE NOCASE ASC
    `).all();

    return rows.map(row => {
        const payload = parseRequiredJson(row.payload_json, 'payload_json');
        const metadata = parseRequiredJson(row.metadata_json, 'metadata_json');
        return {
            file_id: String(row.name),
            name: String(metadata.routeName || payload.name || row.name),
            extensions: metadata.extensions && typeof metadata.extensions === 'object' && !Array.isArray(metadata.extensions)
                ? metadata.extensions
                : {},
        };
    });
}

export function listCanonicalWorldInfoBookRows(db) {
    return db.prepare(`
        SELECT
            id,
            name,
            payload_json,
            metadata_json,
            source_mtime_ms,
            source_size_bytes,
            created_at_ms,
            updated_at_ms,
            deleted_at_ms
        FROM world_books
        ORDER BY name COLLATE NOCASE ASC
    `).all().map(row => ({
        id: String(row.id),
        name: String(row.name),
        payload: parseRequiredJson(row.payload_json, 'payload_json'),
        metadata: parseRequiredJson(row.metadata_json, 'metadata_json'),
        sourceMtimeMs: Number(row.source_mtime_ms ?? 0),
        sourceSizeBytes: Number(row.source_size_bytes ?? 0),
        createdAtMs: Number(row.created_at_ms ?? 0),
        updatedAtMs: Number(row.updated_at_ms ?? 0),
        deletedAtMs: row.deleted_at_ms == null ? null : Number(row.deleted_at_ms),
    }));
}

export function markCanonicalWorldInfoBookDeleted(db, {
    name,
    deletedAtMs = Date.now(),
}) {
    return db.prepare(`
        UPDATE world_books
        SET deleted_at_ms = ?,
            updated_at_ms = ?
        WHERE name = ?
            AND deleted_at_ms IS NULL
    `).run(
        Number(deletedAtMs),
        Number(deletedAtMs),
        normalizeCanonicalWorldInfoName(name),
    );
}

export function recordWorldInfoProjectionRepair(db, {
    repairKey,
    worldName,
    reason,
    details = {},
    nowMs = Date.now(),
}) {
    const normalizedWorldName = normalizeCanonicalWorldInfoName(worldName);
    const row = getExistingWorldBookRow(db, normalizedWorldName);
    db.prepare(`
        INSERT INTO world_info_projection_repairs (
            repair_key,
            world_book_id,
            world_name,
            reason,
            details_json,
            created_at_ms,
            updated_at_ms,
            last_attempt_at_ms,
            resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(repair_key) DO UPDATE SET
            world_book_id = excluded.world_book_id,
            world_name = excluded.world_name,
            reason = excluded.reason,
            details_json = excluded.details_json,
            updated_at_ms = excluded.updated_at_ms,
            resolved_at_ms = NULL
    `).run(
        repairKey,
        row?.id ?? null,
        normalizedWorldName,
        String(reason ?? ''),
        JSON.stringify(details),
        Number(nowMs),
        Number(nowMs),
    );
}

export function resolveWorldInfoProjectionRepair(db, {
    repairKey,
    resolvedAtMs = Date.now(),
}) {
    return db.prepare(`
        UPDATE world_info_projection_repairs
        SET resolved_at_ms = ?,
            updated_at_ms = ?,
            last_attempt_at_ms = ?
        WHERE repair_key = ?
    `).run(
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        Number(resolvedAtMs),
        repairKey,
    );
}

export function listOpenWorldInfoProjectionRepairs(db) {
    let rows = [];
    try {
        rows = db.prepare(`
            SELECT
                repair_key,
                world_book_id,
                world_name,
                reason,
                details_json,
                created_at_ms,
                updated_at_ms,
                last_attempt_at_ms,
                resolved_at_ms
            FROM world_info_projection_repairs
            WHERE resolved_at_ms IS NULL
            ORDER BY created_at_ms ASC, repair_key ASC
        `).all();
    } catch (error) {
        if (String(error?.message ?? '').includes('no such table: world_info_projection_repairs')) {
            return [];
        }
        throw error;
    }

    return rows.map(row => ({
        repairKey: String(row.repair_key),
        worldBookId: row.world_book_id ? String(row.world_book_id) : null,
        worldName: String(row.world_name ?? ''),
        reason: String(row.reason ?? ''),
        details: parseRequiredJson(row.details_json, 'details_json'),
        createdAtMs: Number(row.created_at_ms ?? 0),
        updatedAtMs: Number(row.updated_at_ms ?? 0),
        lastAttemptAtMs: row.last_attempt_at_ms == null ? null : Number(row.last_attempt_at_ms),
        resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
    }));
}
