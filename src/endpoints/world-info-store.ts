import sanitize from 'sanitize-filename';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { withCanonicalTransaction } from '../canonical-sqlite.ts';
import { uuidv4 } from '../util.ts';

// Views describe the existing unchecked JSON access, not runtime validation.
type EntryView = { uid?: unknown; key?: unknown; keysecondary?: unknown; content?: unknown; comment?: unknown; order?: unknown; enabled?: unknown; selective?: unknown; constant?: unknown; position?: unknown; role?: unknown; probability?: unknown; depth?: unknown; extensions?: unknown };
type BookView = { name?: unknown; entries?: Record<string, unknown>; extensions?: unknown };
type UpsertOptions = { name: unknown; payload?: unknown; sourceMtimeMs?: unknown; sourceSizeBytes?: unknown; nowMs?: unknown };
type EntryOptions = { worldBookId: SQLInputValue; entryKey: string; entry: unknown; nowMs?: unknown };

function cloneJson(payload: unknown): unknown {
    return structuredClone(payload ?? {});
}

function parseRequiredJson(value: unknown, fieldName: string): unknown {
    try {
        return JSON.parse(String(value ?? '{}'));
    } catch (error) {
        const caught = error as { message?: unknown } | null | undefined;
        throw new Error(`Canonical World Info row has invalid ${fieldName}: ${String(caught?.message ?? caught ?? '')}`);
    }
}

function getRouteVisibleName(name: string, payload: BookView) {
    return String(payload?.name || name);
}

function getExtensions(payload: EntryView | BookView) {
    const extensions = payload?.extensions;
    return extensions && typeof extensions === 'object' && !Array.isArray(extensions) ? cloneJson(extensions) : {};
}

export function normalizeCanonicalWorldInfoName(name: unknown) {
    return sanitize(String(name ?? '').trim()).trim();
}

function getExistingWorldBookRow(db: DatabaseSync, name: string) {
    return db.prepare(`
        SELECT id, name, payload_json, metadata_json, deleted_at_ms, revision
        FROM world_books
        WHERE name = ?
    `).get(name);
}

function normalizeEntryRecord({ worldBookId, entryKey, entry, nowMs }: EntryOptions) {
    const payload = cloneJson(entry) as EntryView;
    return {
        id: uuidv4(),
        world_book_id: worldBookId,
        entry_key: String(entryKey),
        uid: Number.isInteger(payload.uid) ? payload.uid as number : null,
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

function replaceWorldBookEntries(db: DatabaseSync, { worldBookId, entries, nowMs }: { worldBookId: SQLInputValue; entries: Record<string, unknown>; nowMs?: unknown }) {
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

export function upsertCanonicalWorldInfoBookInTransaction(db: DatabaseSync, {
    name,
    payload,
    sourceMtimeMs = 0,
    sourceSizeBytes = 0,
    nowMs = Date.now(),
}: UpsertOptions) {
    const normalizedName = normalizeCanonicalWorldInfoName(name);
    if (!normalizedName) {
        throw new Error('Canonical World Info book name is required');
    }

    const normalizedPayload = cloneJson(payload) as BookView;
    if (!normalizedPayload.entries || typeof normalizedPayload.entries !== 'object' || Array.isArray(normalizedPayload.entries)) {
        normalizedPayload.entries = {};
    }

    const metadata = {
        routeName: getRouteVisibleName(normalizedName, normalizedPayload),
        extensions: getExtensions(normalizedPayload),
    };

    const existing = getExistingWorldBookRow(db, normalizedName);
    const worldBookId = existing?.id ?? uuidv4();
    db.prepare(`
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
                revision = world_books.revision + 1,
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

    replaceWorldBookEntries(db, {
        worldBookId,
        entries: normalizedPayload.entries,
        nowMs,
    });
    return { id: worldBookId, name: normalizedName, revision: Number(existing?.revision ?? 0) + 1 };
}

export function getCanonicalWorldInfoRevision(db: DatabaseSync, name: unknown) {
    const row = getExistingWorldBookRow(db, normalizeCanonicalWorldInfoName(name));
    return row && row.deleted_at_ms == null ? Number(row.revision) : 0;
}

export function upsertCanonicalWorldInfoBook(db: DatabaseSync, options: UpsertOptions) {
    return withCanonicalTransaction(db, (txnDb: DatabaseSync) => upsertCanonicalWorldInfoBookInTransaction(txnDb, options));
}

export function getCanonicalWorldInfoBook(db: DatabaseSync, name: unknown) {
    return getCanonicalWorldInfoBookSnapshot(db, name)?.payload ?? null;
}

export function getCanonicalWorldInfoBookSnapshot(db: DatabaseSync, name: unknown) {
    const row = db.prepare(`
        SELECT payload_json, revision
        FROM world_books
        WHERE name = ?
            AND deleted_at_ms IS NULL
    `).get(normalizeCanonicalWorldInfoName(name));

    if (!row) {
        return null;
    }

    return { payload: parseRequiredJson(row.payload_json, 'payload_json'), revision: Number(row.revision) };
}

export function listCanonicalWorldInfoBooks(db: DatabaseSync) {
    const rows = db.prepare(`
        SELECT name, payload_json, metadata_json
        FROM world_books
        WHERE deleted_at_ms IS NULL
        ORDER BY name COLLATE NOCASE ASC
    `).all();

    return rows.map(row => {
        const payload = parseRequiredJson(row.payload_json, 'payload_json') as BookView;
        const metadata = parseRequiredJson(row.metadata_json, 'metadata_json') as { routeName?: unknown; extensions?: unknown };
        return {
            file_id: String(row.name),
            name: String(metadata.routeName || payload.name || row.name),
            extensions: metadata.extensions && typeof metadata.extensions === 'object' && !Array.isArray(metadata.extensions)
                ? metadata.extensions
                : {},
        };
    });
}

export function listCanonicalWorldInfoBookRows(db: DatabaseSync) {
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

export function markCanonicalWorldInfoBookDeleted(db: DatabaseSync, {
    name,
    deletedAtMs = Date.now(),
}: { name: unknown; deletedAtMs?: unknown }) {
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

export function recordWorldInfoProjectionRepair(db: DatabaseSync, {
    repairKey,
    worldName,
    reason,
    details = {},
    nowMs = Date.now(),
}: { repairKey: SQLInputValue; worldName: unknown; reason: unknown; details?: unknown; nowMs?: unknown }) {
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

export function resolveWorldInfoProjectionRepair(db: DatabaseSync, {
    repairKey,
    resolvedAtMs = Date.now(),
}: { repairKey: SQLInputValue; resolvedAtMs?: unknown }) {
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

export function listOpenWorldInfoProjectionRepairs(db: DatabaseSync) {
    let rows: ReturnType<ReturnType<DatabaseSync['prepare']>['all']> = [];
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
        const caught = error as { message?: unknown } | null | undefined;
        if (String(caught?.message ?? '').includes('no such table: world_info_projection_repairs')) {
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
