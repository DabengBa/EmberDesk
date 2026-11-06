import { randomUUID } from 'node:crypto';

import { withCanonicalTransaction } from './canonical-sqlite.js';

// Each database belongs to one authenticated user. These records deliberately
// contain resource identifiers and result codes, never card or chat contents.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const WRITE_KINDS = new Set(['card', 'chat', 'world']);
const WRITE_OUTCOMES = new Set(['committed', 'not_committed', 'unknown']);
const INTENT_OUTCOMES = new Set(['completed', 'unknown_partial']);
const AREA_OUTCOMES = new Set(['not_attempted', 'unchanged', 'committed', 'not_committed', 'unknown']);
const WARNINGS = new Set(['card_projection_failed', 'chat_projection_failed', 'world_projection_failed', 'world_book_snapshot_not_confirmed']);

function requireId(id) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        throw new TypeError('Invalid workspace write identifier');
    }
}

function requireSession(db, sessionId) {
    requireId(sessionId);
    const session = db.prepare('SELECT status FROM workspace_write_sessions WHERE session_id = ?').get(sessionId);
    if (!session) {
        throw new Error('Workspace write session does not exist');
    }
    return session;
}

function validateTarget(target) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new TypeError('Invalid replacement target');
    }
    const result = {};
    for (const key of ['avatar', 'chat', 'world']) {
        const value = target[key];
        if (typeof value !== 'string' || value.length > 1024 || value.includes('\0')) {
            throw new TypeError(`Invalid replacement target ${key}`);
        }
        result[key] = value;
    }
    if (!result.avatar) {
        throw new TypeError('Missing replacement target avatar');
    }
    for (const key of ['card', 'chatSelected', 'worldSelected']) {
        if (typeof target[key] !== 'boolean') {
            throw new TypeError(`Invalid replacement target ${key}`);
        }
        result[key] = target[key];
    }
    return result;
}

function validateResult(areas, warnings) {
    const result = { areas: {}, warnings: [] };
    if (areas !== undefined) {
        if (!areas || typeof areas !== 'object' || Array.isArray(areas)) {
            throw new TypeError('Invalid replacement result');
        }
        for (const key of ['card', 'chat', 'worldBook']) {
            if (areas[key] !== undefined) {
                if (!AREA_OUTCOMES.has(areas[key])) {
                    throw new TypeError('Invalid replacement area result');
                }
                result.areas[key] = areas[key];
            }
        }
    }
    if (warnings !== undefined) {
        if (!Array.isArray(warnings) || warnings.some(warning => !WARNINGS.has(warning))) {
            throw new TypeError('Invalid replacement warnings');
        }
        result.warnings = [...new Set(warnings)];
    }
    return result;
}

function readWrite(db, sessionId, operationId) {
    const row = db.prepare(`
        SELECT operation_id, kind, target, status, outcome
        FROM workspace_write_operations WHERE session_id = ? AND operation_id = ?
    `).get(sessionId, operationId);
    return row ? { operationId: row.operation_id, kind: row.kind, target: row.target, status: row.status, outcome: row.outcome } : null;
}

function readIntent(db, sessionId, intentId) {
    const row = db.prepare(`
        SELECT intent_id, target_json, status, outcome, result_json, acknowledged
        FROM character_replace_intents WHERE session_id = ? AND intent_id = ?
    `).get(sessionId, intentId);
    if (!row) return null;
    const operationIds = db.prepare(`
        SELECT operation_id FROM character_replace_intent_writes
        WHERE session_id = ? AND intent_id = ? ORDER BY operation_id
    `).all(sessionId, intentId).map(item => item.operation_id);
    return {
        intentId: row.intent_id,
        target: row.target_json ? JSON.parse(row.target_json) : null,
        status: row.status,
        outcome: row.outcome,
        result: row.result_json ? JSON.parse(row.result_json) : null,
        acknowledged: !!row.acknowledged,
        operationIds,
    };
}

function requireIntent(db, sessionId, intentId) {
    requireSession(db, sessionId);
    requireId(intentId);
    const intent = readIntent(db, sessionId, intentId);
    if (!intent) throw new Error('Replacement intent does not exist');
    return intent;
}

function hasUnresolvedIntentWrites(db, sessionId, intentId) {
    return !!db.prepare(`
        SELECT 1 FROM character_replace_intent_writes AS linked
        LEFT JOIN workspace_write_operations AS operation
            ON operation.session_id = linked.session_id AND operation.operation_id = linked.operation_id
        WHERE linked.session_id = ? AND linked.intent_id = ?
            AND (operation.status IS NULL OR operation.status = 'running')
        LIMIT 1
    `).get(sessionId, intentId);
}

function fenceUnseenSessionWrites(db, sessionId, now) {
    db.prepare(`
        INSERT INTO workspace_write_operations
            (session_id, operation_id, status, created_at_ms, updated_at_ms)
        SELECT linked.session_id, linked.operation_id, 'cancelled', ?, ?
        FROM character_replace_intent_writes AS linked
        LEFT JOIN workspace_write_operations AS operation
            ON operation.session_id = linked.session_id AND operation.operation_id = linked.operation_id
        WHERE linked.session_id = ? AND operation.operation_id IS NULL
    `).run(now, now, sessionId);
}

export function createWorkspaceWriteSession(db) {
    const sessionId = randomUUID();
    const now = Date.now();
    db.prepare(`
        INSERT INTO workspace_write_sessions (session_id, status, created_at_ms, updated_at_ms)
        VALUES (?, 'open', ?, ?)
    `).run(sessionId, now, now);
    return { sessionId, status: 'open' };
}

export function getWorkspaceWrite(db, { sessionId, operationId }) {
    requireSession(db, sessionId);
    requireId(operationId);
    return readWrite(db, sessionId, operationId);
}

export function claimWorkspaceWrite(db, { sessionId, operationId, kind, target = null }) {
    requireId(operationId);
    if (!WRITE_KINDS.has(kind)) throw new TypeError('Invalid workspace write kind');
    if (target !== null && (typeof target !== 'string' || target.length > 1024 || target.includes('\0'))) {
        throw new TypeError('Invalid workspace write target');
    }
    return withCanonicalTransaction(db, () => {
        const session = requireSession(db, sessionId);
        const existing = readWrite(db, sessionId, operationId);
        if (existing) return { claimed: false, ...existing };
        if (session.status !== 'open') return { claimed: false, status: 'session_closed' };
        const now = Date.now();
        db.prepare(`
            INSERT INTO workspace_write_operations
                (session_id, operation_id, kind, target, status, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, ?, 'running', ?, ?)
        `).run(sessionId, operationId, kind, target, now, now);
        return { claimed: true, ...readWrite(db, sessionId, operationId) };
    });
}

export function fenceWorkspaceWrite(db, { sessionId, operationId }) {
    requireId(operationId);
    return withCanonicalTransaction(db, () => {
        const session = requireSession(db, sessionId);
        const existing = readWrite(db, sessionId, operationId);
        if (existing) return existing;
        if (session.status !== 'open') return { operationId, status: 'session_closed' };
        const now = Date.now();
        db.prepare(`
            INSERT INTO workspace_write_operations
                (session_id, operation_id, status, created_at_ms, updated_at_ms)
            VALUES (?, ?, 'cancelled', ?, ?)
        `).run(sessionId, operationId, now, now);
        return readWrite(db, sessionId, operationId);
    });
}

export function finishWorkspaceWrite(db, { sessionId, operationId, outcome }) {
    requireId(operationId);
    if (!WRITE_OUTCOMES.has(outcome)) throw new TypeError('Invalid workspace write outcome');
    return withCanonicalTransaction(db, () => {
        requireSession(db, sessionId);
        const existing = readWrite(db, sessionId, operationId);
        if (!existing) throw new Error('Workspace write does not exist');
        if (existing.status !== 'running') return existing;
        db.prepare(`
            UPDATE workspace_write_operations SET status = 'finished', outcome = ?, updated_at_ms = ?
            WHERE session_id = ? AND operation_id = ? AND status = 'running'
        `).run(outcome, Date.now(), sessionId, operationId);
        return readWrite(db, sessionId, operationId);
    });
}

// The callback must await every write that belongs to this operation. Socket
// closure and HTTP response delivery are deliberately not completion signals.
export async function executeWorkspaceWrite(db, params, execute) {
    const claim = claimWorkspaceWrite(db, params);
    if (!claim.claimed) return claim;

    let execution;
    try {
        execution = await execute();
    } catch (error) {
        try {
            finishWorkspaceWrite(db, { ...params, outcome: 'unknown' });
        } catch (terminalError) {
            throw new AggregateError([error, terminalError], 'Write and terminal status recording failed');
        }
        throw error;
    }
    const terminal = finishWorkspaceWrite(db, { ...params, outcome: execution?.outcome });
    if (terminal.status !== 'finished' || terminal.outcome !== execution.outcome) {
        throw new Error('Workspace write terminal status was not recorded');
    }
    return { claimed: true, ...terminal, value: execution.value };
}

export function createReplaceIntent(db, { sessionId, intentId, target }) {
    requireId(intentId);
    const targetJson = JSON.stringify(validateTarget(target));
    return withCanonicalTransaction(db, () => {
        const session = requireSession(db, sessionId);
        const existing = readIntent(db, sessionId, intentId);
        if (existing) {
            if (existing.target && JSON.stringify(existing.target) !== targetJson) {
                throw new Error('Replacement intent target differs from existing intent');
            }
            return { created: false, ...existing };
        }
        if (session.status !== 'open') return { created: false, status: 'session_closed' };
        const now = Date.now();
        db.prepare(`
            INSERT INTO character_replace_intents
                (session_id, intent_id, target_json, status, created_at_ms, updated_at_ms)
            VALUES (?, ?, ?, 'preparing', ?, ?)
        `).run(sessionId, intentId, targetJson, now, now);
        return { created: true, ...readIntent(db, sessionId, intentId) };
    });
}

export function getReplaceIntent(db, { sessionId, intentId }) {
    requireSession(db, sessionId);
    requireId(intentId);
    return readIntent(db, sessionId, intentId);
}

export function listUnacknowledgedReplaceIntents(db) {
    return db.prepare(`
        SELECT session_id, intent_id FROM character_replace_intents
        WHERE acknowledged = 0 ORDER BY created_at_ms, session_id, intent_id
    `).all().map(row => ({ sessionId: row.session_id, ...readIntent(db, row.session_id, row.intent_id) }));
}

export function registerIntentWrites(db, { sessionId, intentId, operationIds }) {
    if (!Array.isArray(operationIds) || operationIds.length > 1000) throw new TypeError('Invalid intent write list');
    for (const id of operationIds) requireId(id);
    return withCanonicalTransaction(db, () => {
        const intent = requireIntent(db, sessionId, intentId);
        const knownIds = new Set(intent.operationIds);
        const newIds = [...new Set(operationIds)].filter(id => !knownIds.has(id));
        if (newIds.length && (intent.status !== 'preparing' || requireSession(db, sessionId).status !== 'open')) {
            throw new Error('Replacement intent is not accepting writes');
        }
        const insert = db.prepare(`
            INSERT INTO character_replace_intent_writes (session_id, intent_id, operation_id) VALUES (?, ?, ?)
        `);
        for (const id of newIds) insert.run(sessionId, intentId, id);
        return readIntent(db, sessionId, intentId);
    });
}

export function markReplaceIntentReady(db, { sessionId, intentId }) {
    return withCanonicalTransaction(db, () => {
        const intent = requireIntent(db, sessionId, intentId);
        if (intent.status === 'ready') return intent;
        if (intent.status !== 'preparing' || requireSession(db, sessionId).status !== 'open') {
            throw new Error('Replacement intent is not preparing');
        }
        if (hasUnresolvedIntentWrites(db, sessionId, intentId)) {
            throw new Error('Replacement intent has unresolved writes');
        }
        db.prepare(`
            UPDATE character_replace_intents SET status = 'ready', updated_at_ms = ?
            WHERE session_id = ? AND intent_id = ? AND status = 'preparing'
        `).run(Date.now(), sessionId, intentId);
        return readIntent(db, sessionId, intentId);
    });
}

export function claimReplaceIntent(db, { sessionId, intentId }) {
    return withCanonicalTransaction(db, () => {
        const intent = requireIntent(db, sessionId, intentId);
        if (intent.status !== 'ready' || requireSession(db, sessionId).status !== 'open') {
            return { claimed: false, ...intent };
        }
        db.prepare(`
            UPDATE character_replace_intents SET status = 'running', updated_at_ms = ?
            WHERE session_id = ? AND intent_id = ? AND status = 'ready'
        `).run(Date.now(), sessionId, intentId);
        return { claimed: true, ...readIntent(db, sessionId, intentId) };
    });
}

export function fenceReplaceIntent(db, { sessionId, intentId }) {
    requireId(intentId);
    return withCanonicalTransaction(db, () => {
        const session = requireSession(db, sessionId);
        const intent = readIntent(db, sessionId, intentId);
        if (!intent) {
            if (session.status !== 'open') return { intentId, status: 'session_closed' };
            const now = Date.now();
            db.prepare(`
                INSERT INTO character_replace_intents (session_id, intent_id, status, created_at_ms, updated_at_ms)
                VALUES (?, ?, 'cancelled', ?, ?)
            `).run(sessionId, intentId, now, now);
        } else if (intent.status === 'preparing' || intent.status === 'ready') {
            db.prepare(`
                UPDATE character_replace_intents SET status = 'cancelled', updated_at_ms = ?
                WHERE session_id = ? AND intent_id = ? AND status IN ('preparing', 'ready')
            `).run(Date.now(), sessionId, intentId);
        }
        return readIntent(db, sessionId, intentId);
    });
}

export function finishReplaceIntent(db, { sessionId, intentId, outcome, areas, warnings }) {
    if (!INTENT_OUTCOMES.has(outcome)) throw new TypeError('Invalid replacement outcome');
    const result = validateResult(areas, warnings);
    return withCanonicalTransaction(db, () => {
        const intent = requireIntent(db, sessionId, intentId);
        if (intent.status !== 'running') return intent;
        db.prepare(`
            UPDATE character_replace_intents SET status = 'finished', outcome = ?, result_json = ?, updated_at_ms = ?
            WHERE session_id = ? AND intent_id = ? AND status = 'running'
        `).run(outcome, JSON.stringify(result), Date.now(), sessionId, intentId);
        return readIntent(db, sessionId, intentId);
    });
}

export async function executeReplaceIntent(db, params, execute) {
    const claim = claimReplaceIntent(db, params);
    if (!claim.claimed) return claim;

    let execution;
    try {
        execution = await execute(claim.target);
    } catch (error) {
        try {
            finishReplaceIntent(db, { ...params, outcome: 'unknown_partial' });
        } catch (terminalError) {
            throw new AggregateError([error, terminalError], 'Replacement and terminal status recording failed');
        }
        throw error;
    }
    const terminal = finishReplaceIntent(db, {
        ...params,
        outcome: execution?.outcome,
        areas: execution?.areas,
        warnings: execution?.warnings,
    });
    if (terminal.status !== 'finished' || terminal.outcome !== execution.outcome) {
        throw new Error('Replacement terminal status was not recorded');
    }
    return { claimed: true, ...terminal, value: execution.value };
}

export function acknowledgeReplaceIntent(db, { sessionId, intentId }) {
    return withCanonicalTransaction(db, () => {
        const intent = requireIntent(db, sessionId, intentId);
        if (!['finished', 'cancelled', 'interrupted'].includes(intent.status) || hasUnresolvedIntentWrites(db, sessionId, intentId)) {
            throw new Error('Replacement intent is not settled');
        }
        db.prepare(`
            UPDATE character_replace_intents SET acknowledged = 1, updated_at_ms = ?
            WHERE session_id = ? AND intent_id = ?
        `).run(Date.now(), sessionId, intentId);
        return readIntent(db, sessionId, intentId);
    });
}

export function closeWorkspaceWriteSession(db, { sessionId }) {
    return withCanonicalTransaction(db, () => {
        requireSession(db, sessionId);
        const now = Date.now();
        db.prepare('UPDATE workspace_write_sessions SET status = ?, updated_at_ms = ? WHERE session_id = ?').run('closed', now, sessionId);
        fenceUnseenSessionWrites(db, sessionId, now);
        db.prepare(`
            UPDATE character_replace_intents SET status = 'cancelled', updated_at_ms = ?
            WHERE session_id = ? AND status IN ('preparing', 'ready')
        `).run(now, sessionId);
        return { sessionId, status: 'closed' };
    });
}

export function removeSettledWorkspaceWriteDetails(db, { sessionId }) {
    return withCanonicalTransaction(db, () => {
        const session = requireSession(db, sessionId);
        const pendingWrite = db.prepare('SELECT 1 FROM workspace_write_operations WHERE session_id = ? AND status = ? LIMIT 1').get(sessionId, 'running');
        const pendingIntent = db.prepare('SELECT 1 FROM character_replace_intents WHERE session_id = ? AND acknowledged = 0 LIMIT 1').get(sessionId);
        if (session.status !== 'closed' || pendingWrite || pendingIntent) {
            throw new Error('Workspace write session is not settled');
        }
        db.prepare('DELETE FROM character_replace_intent_writes WHERE session_id = ?').run(sessionId);
        db.prepare('DELETE FROM character_replace_intents WHERE session_id = ?').run(sessionId);
        db.prepare('DELETE FROM workspace_write_operations WHERE session_id = ?').run(sessionId);
        // Keep the closed session tombstone: arbitrarily late requests must remain rejected.
        return { sessionId, status: 'closed' };
    });
}

// Caller must establish that every process able to write this user's database
// has stopped. SQLite alone cannot establish that precondition.
export function interruptWorkspaceWriteSessionOffline(db, { sessionId }) {
    return withCanonicalTransaction(db, () => {
        requireSession(db, sessionId);
        const now = Date.now();
        db.prepare('UPDATE workspace_write_sessions SET status = ?, updated_at_ms = ? WHERE session_id = ?').run('closed', now, sessionId);
        fenceUnseenSessionWrites(db, sessionId, now);
        db.prepare(`
            UPDATE workspace_write_operations SET status = 'interrupted', outcome = 'unknown', updated_at_ms = ?
            WHERE session_id = ? AND status = 'running'
        `).run(now, sessionId);
        db.prepare(`
            UPDATE character_replace_intents SET status = 'interrupted', outcome = 'unknown_partial', updated_at_ms = ?
            WHERE session_id = ? AND status IN ('preparing', 'running')
        `).run(now, sessionId);
        db.prepare(`
            UPDATE character_replace_intents SET status = 'cancelled', updated_at_ms = ?
            WHERE session_id = ? AND status = 'ready'
        `).run(now, sessionId);
        return { sessionId, status: 'closed' };
    });
}
