import type { DatabaseSync } from 'node:sqlite';

export class ChatGenerationBusyError extends Error {
    constructor() {
        super('chat_generation_busy');
    }
}

// A persisted running row alone is not a live lock after process restart.
const liveRuns = new Map<string, string | DatabaseSync>();
export const generationDatabaseIdentity = (db: DatabaseSync) => db.location() ?? db;

export function trackLiveChatGeneration(db: DatabaseSync, id: string) {
    liveRuns.set(id, generationDatabaseIdentity(db));
    return () => { liveRuns.delete(id); };
}

export function isLiveChatGeneration(db: DatabaseSync, id: string) {
    return liveRuns.get(id) === generationDatabaseIdentity(db);
}

export function isChatGenerationActive(db: DatabaseSync, chatId: string) {
    if (!liveRuns.size || !hasRunTable(db)) return false;
    const row = db.prepare("SELECT id FROM chat_generation_runs WHERE chat_id = ? AND status = 'running'").get(chatId);
    return !!row && isLiveChatGeneration(db, String(row.id));
}

export function assertNoActiveChatGenerations(db: DatabaseSync, ownerId?: string) {
    if (!liveRuns.size || !hasRunTable(db)) return;
    const active = ownerId === undefined
        ? db.prepare("SELECT id FROM chat_generation_runs WHERE status = 'running'").all()
        : db.prepare(`
            SELECT run.id FROM chat_generation_runs AS run JOIN chat_sessions AS chat ON chat.id = run.chat_id
            WHERE run.status = 'running' AND chat.owner_type = 'character' AND chat.owner_id = ?
        `).all(ownerId);
    if (active.some(row => isLiveChatGeneration(db, String(row.id)))) throw new ChatGenerationBusyError();
}

// Also used by canonical import tools operating on a pre-generation schema.
function hasRunTable(db: DatabaseSync) {
    return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'chat_generation_runs'").get();
}
