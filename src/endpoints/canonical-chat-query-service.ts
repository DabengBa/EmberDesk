import fs from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import { formatBytes } from '../util.js';
import { createTextMatcher, getPreviewMessage } from './chat-route-service.ts';
import type { ChatInfo } from './chats.js';
import type { UserDirectoryList } from '../users.js';

type ChatDirectories = Pick<UserDirectoryList, 'chats' | 'characters'>;
type Dependencies = {
    fs?: typeof fs;
    path?: typeof path;
    getChatInfo?: (filePath: string, additionalData?: object, metadata?: boolean) => Promise<ChatInfo>;
    warn?: (...args: unknown[]) => void;
};
type Summary = {
    id: string;
    ownerType: string;
    ownerId: string;
    sourcePath: string;
    displayName: string;
    headerPayloadJson: string;
    sourceSizeBytes: number;
    sourceMtimeMs: number;
    messageCount: number;
    lastPayloadJson: string | null;
};
// These describe the existing unchecked reads, not validation of stored JSON fields.
type PayloadView = { mes?: string | null; send_date?: string | number | null; chat_metadata?: object | null };
type RecentChat = ChatInfo & { avatar?: string };
type PinnedChat = { file_name?: string; avatar?: string };
type SearchOptions = { db: DatabaseSync; query?: string; avatarUrl?: string };
type RecentOptions = {
    db: DatabaseSync;
    directories: ChatDirectories;
    pinned?: PinnedChat[];
    max?: number | string | null;
    metadata?: boolean;
    dependencies?: Dependencies;
};

function parseCanonicalPayload(payloadJson: unknown, fieldName: string): PayloadView {
    try {
        const payload = JSON.parse(String(payloadJson));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('payload must be an object');
        }
        return payload as PayloadView;
    } catch (error) {
        const caught = error as { message?: unknown } | null | undefined;
        throw new Error(`Canonical chat ${fieldName} is invalid: ${String(caught?.message ?? caught ?? '')}`);
    }
}

function normalizeDependencies(dependencies: Dependencies = {}) {
    return {
        fs: dependencies.fs ?? fs,
        path: dependencies.path ?? path,
        getChatInfo: dependencies.getChatInfo,
        warn: dependencies.warn ?? console.warn,
    };
}

function listCanonicalChatSummaries(db: DatabaseSync, {
    ownerType = null,
    ownerIds = null,
}: { ownerType?: string | null; ownerIds?: string[] | null } = {}): Summary[] {
    const where: string[] = [];
    const params: string[] = [];

    if (ownerType) {
        where.push('owner_type = ?');
        params.push(ownerType);
    }
    if (Array.isArray(ownerIds)) {
        if (ownerIds.length === 0) {
            return [];
        }
        where.push(`owner_id IN (${ownerIds.map(() => '?').join(', ')})`);
        params.push(...ownerIds);
    }

    const sql = `
        SELECT
            session.id,
            session.owner_type,
            session.owner_id,
            session.source_path,
            session.display_name,
            session.header_payload_json,
            session.source_size_bytes,
            session.source_mtime_ms,
            (
                SELECT COUNT(*)
                FROM chat_messages AS message
                WHERE message.session_id = session.id
            ) AS message_count,
            (
                SELECT payload_json
                FROM chat_messages AS message
                WHERE message.session_id = session.id
                ORDER BY message.message_order DESC
                LIMIT 1
            ) AS last_payload_json
        FROM chat_sessions AS session
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY session.source_path ASC
    `;

    return db.prepare(sql).all(...params).map(row => ({
        id: String(row.id),
        ownerType: String(row.owner_type),
        ownerId: String(row.owner_id),
        sourcePath: String(row.source_path),
        displayName: String(row.display_name),
        headerPayloadJson: String(row.header_payload_json),
        sourceSizeBytes: Number(row.source_size_bytes ?? 0),
        sourceMtimeMs: Number(row.source_mtime_ms ?? 0),
        messageCount: Number(row.message_count ?? 0),
        lastPayloadJson: row.last_payload_json == null ? null : String(row.last_payload_json),
    }));
}

function getCanonicalChatMessageTexts(db: DatabaseSync, sessionId: string): string[] {
    return db.prepare(`
        SELECT payload_json
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY message_order ASC
    `).all(sessionId).map(row => {
        const payload = parseCanonicalPayload(row.payload_json, 'message payload');
        return typeof payload.mes === 'string' ? payload.mes : '';
    });
}

function buildSearchPayload(summary: Summary) {
    const lastPayload = summary.lastPayloadJson
        ? parseCanonicalPayload(summary.lastPayloadJson, 'message payload')
        : null;
    return {
        file_name: summary.displayName,
        file_size: formatBytes(summary.sourceSizeBytes),
        message_count: summary.messageCount,
        last_mes: lastPayload?.send_date ?? new Date(Math.round(summary.sourceMtimeMs)).toISOString(),
        preview_message: getPreviewMessage(lastPayload?.mes ?? '[The chat is empty]'),
    };
}

function buildRecentPayload(summary: Summary, {
    metadata = false,
    avatar = undefined,
}: { metadata?: boolean; avatar?: string } = {}): RecentChat {
    const lastPayload = summary.lastPayloadJson
        ? parseCanonicalPayload(summary.lastPayloadJson, 'message payload')
        : null;
    const headerPayload = metadata
        ? parseCanonicalPayload(summary.headerPayloadJson, 'header payload')
        : null;

    return {
        match: true,
        file_id: summary.displayName,
        file_name: `${summary.displayName}.jsonl`,
        file_size: formatBytes(summary.sourceSizeBytes),
        chat_items: summary.messageCount,
        mes: lastPayload?.mes ?? '[The chat is empty]',
        last_mes: lastPayload?.send_date ?? new Date(Math.round(summary.sourceMtimeMs)).toISOString(),
        ...(metadata && headerPayload?.chat_metadata && typeof headerPayload.chat_metadata === 'object'
            ? { chat_metadata: headerPayload.chat_metadata }
            : {}),
        ...(avatar ? { avatar } : {}),
    };
}

function readCharacterNames(directories: ChatDirectories, deps: ReturnType<typeof normalizeDependencies>): Set<string> {
    try {
        return new Set(deps.fs.readdirSync(directories.characters, { withFileTypes: true })
            .filter(entry => entry.isFile() && deps.path.extname(entry.name) === '.png')
            .map(entry => deps.path.parse(entry.name).name));
    } catch {
        return new Set();
    }
}

async function readRootRecentPayload({
    directories,
    metadata = false,
    dependencies,
}: { directories: ChatDirectories; metadata?: boolean; dependencies?: Dependencies }): Promise<{ payload: RecentChat; mtime: number }[]> {
    const deps = normalizeDependencies(dependencies);
    if (typeof deps.getChatInfo !== 'function') {
        return [];
    }
    const depsWithChatInfo = deps as typeof deps & { getChatInfo: NonNullable<typeof deps.getChatInfo> };

    let dirents: Dirent[] = [];
    try {
        dirents = await deps.fs.promises.readdir(directories.chats, { withFileTypes: true });
    } catch {
        dirents = [];
    }

    const rootChatFiles = dirents
        .filter(entry => entry.isFile() && deps.path.extname(entry.name) === '.jsonl')
        .map(entry => deps.path.join(directories.chats, entry.name));

    const results = await Promise.allSettled(rootChatFiles.map(async filePath => {
        const stats = await deps.fs.promises.stat(filePath);
        const payload = await depsWithChatInfo.getChatInfo(filePath, {}, !!metadata);
        if (!payload?.file_name) {
            return null;
        }
        return {
            payload,
            mtime: Number(stats.mtimeMs ?? 0),
        };
    }));

    return results
        .filter((result): result is PromiseFulfilledResult<{ payload: ChatInfo; mtime: number }> => result.status === 'fulfilled' && !!result.value)
        .map(result => result.value);
}

/**
 * Build `/api/chats/search` results from canonical rows while preserving legacy
 * fragment matching for character chats.
 */
export async function searchCanonicalChatPayload({
    db,
    query = '',
    avatarUrl = '',
}: SearchOptions) {
    const matcher = createTextMatcher(query);

    const characterName = String(avatarUrl ?? '').replace('.png', '');
    if (!characterName) {
        return [];
    }

    const summaries = listCanonicalChatSummaries(db, {
        ownerType: 'character',
        ownerIds: [characterName],
    });

    const results = [];
    for (const summary of summaries) {
        const nameMatches = matcher([summary.displayName]);
        const textMatches = nameMatches || matcher(getCanonicalChatMessageTexts(db, summary.id));
        if (query && summary.messageCount === 0 && !textMatches) {
            continue;
        }
        if (!query || textMatches) {
            results.push(buildSearchPayload(summary));
        }
    }

    return results;
}

/**
 * Build `/api/characters/chats` results for one character from canonical
 * sessions. Preserves the legacy getChatInfo response shape.
 * @param {object} options Options
 * @param {import('better-sqlite3').Database} options.db Canonical database
 * @param {string} options.ownerId Character internal name (avatar sans .png)
 * @param {boolean} [options.metadata] Include chat_metadata payloads
 * @returns {object[]} Chat info payloads ordered by source path
 */
export function listCanonicalCharacterChatPayload({ db, ownerId, metadata = false }: { db: DatabaseSync; ownerId: string; metadata?: boolean }): RecentChat[] {
    return listCanonicalChatSummaries(db, {
        ownerType: 'character',
        ownerIds: [String(ownerId ?? '')],
    }).map(summary => buildRecentPayload(summary, { metadata }));
}

/**
 * Build `/api/chats/recent` results from canonical character chats while
 * preserving top-level root-chat compatibility files.
 */
export async function readCanonicalRecentChatPayload({
    db,
    directories,
    pinned = [],
    max = Number.MAX_SAFE_INTEGER,
    metadata = false,
    dependencies = {},
}: RecentOptions): Promise<RecentChat[]> {
    const deps = normalizeDependencies(dependencies);
    const allowedCharacters = readCharacterNames(directories, deps);
    const characterSummaries = listCanonicalChatSummaries(db, { ownerType: 'character' })
        .filter(summary => allowedCharacters.has(summary.ownerId));

    const canonicalResults = characterSummaries.map(summary => ({
        payload: buildRecentPayload(summary, {
            metadata,
            avatar: `${summary.ownerId}.png`,
        }),
        mtime: summary.sourceMtimeMs,
    }));
    const rootResults = await readRootRecentPayload({
        directories,
        metadata,
        dependencies: deps,
    });
    const pinnedChats = Array.isArray(pinned) ? pinned : [];
    const maxWithPinned = parseInt((max ?? Number.MAX_SAFE_INTEGER) as string) + pinnedChats.length;
    const isPinned = (chat: { payload: RecentChat }) => pinnedChats.some(entry => (
        entry.file_name === chat.payload.file_name
        && entry.avatar === chat.payload.avatar
    ));

    return [...canonicalResults, ...rootResults]
        .sort((left, right) => {
            const isLeftPinned = isPinned(left);
            const isRightPinned = isPinned(right);

            if (isLeftPinned && !isRightPinned) {
                return -1;
            }
            if (!isLeftPinned && isRightPinned) {
                return 1;
            }

            return right.mtime - left.mtime;
        })
        .slice(0, maxWithPinned)
        .map(result => result.payload);
}
