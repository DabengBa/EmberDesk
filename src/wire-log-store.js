/**
 * Wire log storage.
 *
 * Owns the on-disk shape of upstream request/response traces. One generation
 * is one JSON file under `<storeRoot>/<YYYY-MM-DD>/`, written through a
 * temp file plus rename so a crash never leaves a half-written record.
 *
 * Wire logs are derived diagnostic data, never canonical user data: losing or
 * purging them must be harmless, and nothing else in the app may read them as
 * a source of truth.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const REDACTION_MASK = '***redacted***';
const ID_PATTERN = /^wl_[A-Za-z0-9_-]{6,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * @typedef {object} WireLogContext
 * @property {string} [type] Generation type (`normal`, `quiet`, ...)
 * @property {string} [model] Model id sent upstream
 * @property {string} [source] Chat completion source
 * @property {string} [chatId] Chat file the turn belongs to
 * @property {string} [charName] Character name
 * @property {string} [pipelineRun] Active reply-pipeline run id
 * @property {string} [pipelineStep] Active reply-pipeline step tool
 * @property {boolean} [regenerate] Whether the turn was a regenerate
 */

/**
 * Masks sensitive header values. Comparison is case-insensitive while the
 * original header casing is preserved for readability.
 * @param {unknown} headers Raw header map
 * @param {string[]} [names] Lowercase header names to mask
 * @returns {Record<string, string>} Header map with masked values
 */
export function redactHeaders(headers, names = []) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
        return {};
    }
    const masked = new Set((Array.isArray(names) ? names : []).map(name => String(name).toLowerCase()));
    /** @type {Record<string, string>} */
    const result = {};
    for (const [key, value] of Object.entries(headers)) {
        result[key] = masked.has(key.toLowerCase()) ? REDACTION_MASK : String(value);
    }
    return result;
}

/**
 * Replaces an oversized body with a marker so one pathological request cannot
 * fill the disk while still leaving evidence that something was dropped.
 * @param {unknown} body Body value about to be stored
 * @param {number} [limitBytes] Serialized size limit
 * @returns {{value: unknown, truncated: boolean, bytes: number}}
 */
export function truncateBody(body, limitBytes = DEFAULT_MAX_FILE_BYTES) {
    let serialized = '';
    try {
        serialized = JSON.stringify(body ?? null) ?? '';
    } catch {
        // A body that cannot serialize (cycles) is itself the anomaly: keep a
        // marker rather than throwing on the logging path.
        return { value: { __unserializable: true }, truncated: true, bytes: 0 };
    }
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes <= limitBytes) {
        return { value: body ?? null, truncated: false, bytes };
    }
    return {
        value: { __truncated: true, bytes, limit: limitBytes },
        truncated: true,
        bytes,
    };
}

function buildRecordId(timestamp = Date.now()) {
    const iso = new Date(timestamp).toISOString().replace(/[-:.TZ]/g, '');
    return `wl_${iso}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function datePartition(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Validates a record id before it is used as a path segment.
 * @param {unknown} id Candidate id
 * @returns {string} The validated id
 * @throws {Error} When the id is not a well-formed wire log id
 */
function assertRecordId(id) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        throw new Error(`invalid wire log id: ${String(id)}`);
    }
    return id;
}

/**
 * Validates a date partition before it is used as a path segment.
 * @param {unknown} date Candidate `YYYY-MM-DD`
 * @returns {string} The validated date
 * @throws {Error} When the date is malformed
 */
function assertDatePartition(date) {
    if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
        throw new Error(`invalid wire log date: ${String(date)}`);
    }
    return date;
}

/**
 * Builds the pending record for one generation, before any response arrives.
 * @param {object} args
 * @param {string} args.url Upstream endpoint URL
 * @param {Record<string, unknown>} args.headers Request headers
 * @param {unknown} args.body Request body actually sent upstream
 * @param {WireLogContext} [args.context] Who initiated the generation
 * @param {string[]} [args.redact] Header names to mask
 * @param {number} [args.maxFileBytes] Body size limit
 * @returns {object} Record with `status: 'pending'`
 */
export function createWireRecord({
    url,
    headers,
    body,
    context = {},
    redact = [],
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
}) {
    const ts = Date.now();
    const truncated = truncateBody(body, maxFileBytes);
    return {
        id: buildRecordId(ts),
        ts,
        status: 'pending',
        request: {
            url: String(url ?? ''),
            method: 'POST',
            headers: redactHeaders(headers, redact),
            body: truncated.value,
            bytes: truncated.bytes,
            truncated: truncated.truncated,
            messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
            toolCount: Array.isArray(body?.tools) ? body.tools.length : 0,
        },
        response: null,
        error: null,
        context: sanitizeContext(context),
    };
}

/**
 * Keeps only the known context fields so a client-supplied `_trace` can never
 * inject arbitrary structure into a stored record.
 * @param {unknown} context Raw context
 * @returns {WireLogContext} Sanitized context
 */
export function sanitizeContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return {};
    }
    /** @type {WireLogContext} */
    const result = {};
    const stringFields = ['type', 'model', 'source', 'chatId', 'charName', 'pipelineRun', 'pipelineStep'];
    for (const field of stringFields) {
        const value = context[field];
        if (typeof value === 'string' && value) {
            result[field] = value.slice(0, 512);
        }
    }
    if (typeof context.regenerate === 'boolean') {
        result.regenerate = context.regenerate;
    }
    return result;
}

/**
 * Writes a record atomically: temp file in the same directory, then rename.
 * @param {string} storeRoot Wire log root for the active user
 * @param {object} record Record to persist
 * @returns {Promise<string>} Written file path
 */
export async function writeRecord(storeRoot, record) {
    const id = assertRecordId(record?.id);
    const directory = path.join(storeRoot, datePartition(record.ts ?? Date.now()));
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, `${id}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(record, null, 2), 'utf8');
    try {
        await fs.rename(temporary, target);
    } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
    }
    return target;
}

/**
 * Locates an existing record file by scanning date partitions newest-first,
 * because the partition is derived from the record timestamp, not the id.
 * @param {string} storeRoot Wire log root
 * @param {string} id Record id
 * @returns {Promise<string|null>} File path when found
 */
async function findRecordPath(storeRoot, id) {
    const partitions = await readPartitions(storeRoot);
    for (const partition of partitions) {
        const candidate = path.join(storeRoot, partition, `${id}.json`);
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * @param {string} storeRoot Wire log root
 * @returns {Promise<string[]>} Existing `YYYY-MM-DD` directories, newest first
 */
async function readPartitions(storeRoot) {
    let entries = [];
    try {
        entries = await fs.readdir(storeRoot, { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .filter(entry => entry.isDirectory() && DATE_PATTERN.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => right.localeCompare(left));
}

/**
 * Reads one full record.
 * @param {string} storeRoot Wire log root
 * @param {string} id Record id
 * @returns {Promise<object|null>} Record, or null when it does not exist
 */
export async function readRecord(storeRoot, id) {
    const safeId = assertRecordId(id);
    const filePath = await findRecordPath(storeRoot, safeId);
    if (!filePath) {
        return null;
    }
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        // A corrupted record must not break the viewer listing.
        return null;
    }
}

/**
 * Builds the list projection of a record: enough to render a row, never the
 * full request/response bodies.
 * @param {object} record Full record
 * @returns {object} Metadata-only entry
 */
function toListItem(record) {
    return {
        id: record.id,
        ts: record.ts,
        status: record.status,
        error: record.error ? String(record.error.message ?? record.error).slice(0, 300) : null,
        context: record.context ?? {},
        request: {
            url: record.request?.url ?? '',
            bytes: record.request?.bytes ?? 0,
            truncated: Boolean(record.request?.truncated),
            toolCount: record.request?.toolCount ?? 0,
            messageCount: record.request?.messageCount ?? 0,
        },
        response: record.response
            ? {
                status: record.response.status ?? null,
                streamed: Boolean(record.response.streamed),
                bytes: record.response.bytes ?? 0,
                durationMs: record.response.durationMs ?? null,
                ttftMs: record.response.ttftMs ?? null,
                chunks: record.response.chunks ?? null,
                // Token counts are metadata, not prompt text, so they belong on
                // the row. Older records predate the field: null, never 0.
                usage: record.response.usage ?? null,
            }
            : null,
    };
}

/**
 * Lists record metadata, newest first.
 * @param {string} storeRoot Wire log root
 * @param {object} [options] Filters
 * @param {string} [options.date] Restrict to one `YYYY-MM-DD` partition
 * @param {string} [options.status] Restrict to one status
 * @param {string} [options.type] Restrict to one generation type
 * @param {string} [options.chatId] Restrict to one chat session
 * @param {number} [options.limit] Maximum entries to return
 * @returns {Promise<object[]>} Metadata entries
 */
export async function listRecords(storeRoot, { date, status, type, chatId, limit } = {}) {
    const partitions = date
        ? [assertDatePartition(date)]
        : await readPartitions(storeRoot);
    const chatFilter = typeof chatId === 'string' && chatId ? chatId : null;
    /** @type {object[]} */
    const entries = [];

    for (const partition of partitions) {
        const directory = path.join(storeRoot, partition);
        let files = [];
        try {
            files = await fs.readdir(directory);
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }
            const id = file.slice(0, -'.json'.length);
            if (!ID_PATTERN.test(id)) {
                continue;
            }
            const record = await readRecord(storeRoot, id);
            if (!record) {
                continue;
            }
            if (status && record.status !== status) {
                continue;
            }
            if (type && record.context?.type !== type) {
                continue;
            }
            if (chatFilter && record.context?.chatId !== chatFilter) {
                continue;
            }
            entries.push(toListItem(record));
        }
        // Partitions are date-ordered; within a partition the id carries the
        // timestamp, so a plain descending sort is enough for a global order.
        if (entries.length > 0 && (limit == null || entries.length >= limit)) {
            break;
        }
    }

    entries.sort((left, right) => (right.ts ?? 0) - (left.ts ?? 0));
    return typeof limit === 'number' && limit > 0 ? entries.slice(0, limit) : entries;
}

/**
 * Deletes one record.
 * @param {string} storeRoot Wire log root
 * @param {string} id Record id
 * @returns {Promise<boolean>} Whether a file was removed
 */
export async function deleteRecord(storeRoot, id) {
    const safeId = assertRecordId(id);
    const filePath = await findRecordPath(storeRoot, safeId);
    if (!filePath) {
        return false;
    }
    await fs.rm(filePath, { force: true });
    return true;
}

/**
 * Removes individual records whose timestamp is older than the retention
 * window. `purgeExpired` only drops whole day partitions, which is correct for
 * "clear yesterday and older" but leaves files from up to ~72h ago behind when
 * the window is 48h. This is the sweep that actually honours the TTL.
 * @param {string} storeRoot Wire log root
 * @param {object} [options]
 * @param {number} [options.retentionDays] Days to keep, counted back from `now`
 * @param {Date} [options.now] Reference clock
 * @returns {Promise<number>} Number of records removed
 */
export async function purgeExpiredRecords(storeRoot, { retentionDays = 2, now = new Date() } = {}) {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        return 0;
    }
    const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const partition of await readPartitions(storeRoot)) {
        const directory = path.join(storeRoot, partition);
        let files = [];
        try {
            files = await fs.readdir(directory);
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }
            const record = await readRecord(storeRoot, file.slice(0, -'.json'.length));
            // An unreadable record has no trustworthy timestamp, so it is left
            // for the partition sweep rather than deleted on a guess.
            const ts = Number(record?.ts);
            if (!Number.isFinite(ts) || ts >= cutoff) {
                continue;
            }
            await fs.rm(path.join(directory, file), { force: true });
            removed += 1;
        }
    }
    return removed;
}

/**
 * Removes date partitions older than the retention window. Day granularity is
 * the whole point: a user reasons in days, not bytes.
 * @param {string} storeRoot Wire log root
 * @param {object} [options]
 * @param {number} [options.retentionDays] Days to keep, including today
 * @param {Date} [options.now] Reference clock
 * @returns {Promise<number>} Number of partitions removed
 */
export async function purgeExpired(storeRoot, { retentionDays = 2, now = new Date() } = {}) {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        return 0;
    }
    const partitions = await readPartitions(storeRoot);
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffPartition = datePartition(cutoff.getTime());
    // Keep the cutoff day for record-level cleanup; delete only older days.

    let removed = 0;
    for (const partition of partitions) {
        if (partition >= cutoffPartition) {
            continue;
        }
        await fs.rm(path.join(storeRoot, partition), { recursive: true, force: true });
        removed += 1;
    }
    return removed;
}
