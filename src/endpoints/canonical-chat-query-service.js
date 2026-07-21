import fs from 'node:fs';
import path from 'node:path';

import { formatBytes } from '../util.js';
import { createTextMatcher, getPreviewMessage } from './chat-route-service.js';

function parseCanonicalPayload(payloadJson, fieldName) {
    try {
        const payload = JSON.parse(String(payloadJson));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('payload must be an object');
        }
        return payload;
    } catch (error) {
        throw new Error(`Canonical chat ${fieldName} is invalid: ${String(error?.message ?? error ?? '')}`);
    }
}

function normalizeDependencies(dependencies = {}) {
    return {
        fs: dependencies.fs ?? fs,
        path: dependencies.path ?? path,
        getChatInfo: dependencies.getChatInfo,
        warn: dependencies.warn ?? console.warn,
    };
}

function listCanonicalChatSummaries(db, {
    ownerType = null,
    ownerIds = null,
} = {}) {
    const where = [];
    const params = [];

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

function getCanonicalChatMessageTexts(db, sessionId) {
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

function buildSearchPayload(summary) {
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

function buildRecentPayload(summary, {
    metadata = false,
    avatar = undefined,
    group = undefined,
} = {}) {
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
        ...(group ? { group } : {}),
    };
}

function readCharacterNames(directories, deps) {
    try {
        return new Set(deps.fs.readdirSync(directories.characters, { withFileTypes: true })
            .filter(entry => entry.isFile() && deps.path.extname(entry.name) === '.png')
            .map(entry => deps.path.parse(entry.name).name));
    } catch {
        return new Set();
    }
}

function readGroupChatMap(directories, deps) {
    const map = new Map();
    let groupFiles = [];
    try {
        groupFiles = []; // group chat retirement: do not read group definitions
    } catch {
        groupFiles = [];
    }

    for (const groupFile of groupFiles) {
        try {
            const groupData = JSON.parse(deps.fs.readFileSync(deps.path.join(directories.groups, groupFile), 'utf8'));
            if (!groupData?.id || !Array.isArray(groupData.chats)) {
                continue;
            }
            for (const chatId of groupData.chats) {
                map.set(String(chatId), String(groupData.id));
            }
        } catch (error) {
            deps.warn(groupFile, 'group file is corrupted:', error);
        }
    }

    return map;
}

async function readRootRecentPayload({
    directories,
    metadata = false,
    dependencies,
}) {
    const deps = normalizeDependencies(dependencies);
    if (typeof deps.getChatInfo !== 'function') {
        return [];
    }

    let dirents = [];
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
        const payload = await deps.getChatInfo(filePath, {}, !!metadata);
        if (!payload?.file_name) {
            return null;
        }
        return {
            payload,
            mtime: Number(stats.mtimeMs ?? 0),
        };
    }));

    return results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
}

/**
 * Build `/api/chats/search` results from canonical rows while preserving legacy
 * fragment matching and group-owner semantics.
 */
export async function searchCanonicalChatPayload({
    db,
    directories,
    query = '',
    avatarUrl = '',
    groupId,
    dependencies = {},
}) {
    const deps = normalizeDependencies(dependencies);
    const matcher = createTextMatcher(query);

    if (groupId) {
        // Group chat retirement: ignore group-owned query paths.
        return [];
        let targetGroup = null;
        try {
            const groupFiles = []; // group chat retirement: do not read group definitions
            for (const groupFile of groupFiles) {
                try {
                    const groupData = JSON.parse(deps.fs.readFileSync(deps.path.join(directories.groups, groupFile), 'utf8'));
                    if (groupData?.id === groupId) {
                        targetGroup = groupData;
                        break;
                    }
                } catch (error) {
                    deps.warn(groupFile, 'group file is corrupted:', error);
                }
            }
        } catch {
            targetGroup = null;
        }

        if (!Array.isArray(targetGroup?.chats)) {
            return [];
        }

        const summariesByChatId = new Map(listCanonicalChatSummaries(db, {
            ownerType: 'group',
            ownerIds: targetGroup.chats.map(String),
        }).map(summary => [summary.ownerId, summary]));
        const results = [];

        for (const chatId of targetGroup.chats.map(String)) {
            const summary = summariesByChatId.get(chatId);
            if (!summary) {
                continue;
            }
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
 * Build `/api/chats/recent` results from canonical rows for character/group
 * chats while preserving top-level root-chat compatibility files.
 */
export async function readCanonicalRecentChatPayload({
    db,
    directories,
    pinned = [],
    max = Number.MAX_SAFE_INTEGER,
    metadata = false,
    dependencies = {},
}) {
    const deps = normalizeDependencies(dependencies);
    const allowedCharacters = readCharacterNames(directories, deps);
    const groupByChatId = readGroupChatMap(directories, deps);
    const characterSummaries = listCanonicalChatSummaries(db, { ownerType: 'character' })
        .filter(summary => allowedCharacters.has(summary.ownerId));
    const groupSummaries = listCanonicalChatSummaries(db, {
        ownerType: 'group',
        ownerIds: Array.from(groupByChatId.keys()),
    });

    const canonicalResults = [
        ...characterSummaries.map(summary => ({
            payload: buildRecentPayload(summary, {
                metadata,
                avatar: `${summary.ownerId}.png`,
            }),
            mtime: summary.sourceMtimeMs,
        })),
        ...groupSummaries
            .filter(summary => groupByChatId.has(summary.ownerId))
            .map(summary => ({
                payload: buildRecentPayload(summary, {
                    metadata,
                    group: groupByChatId.get(summary.ownerId),
                }),
                mtime: summary.sourceMtimeMs,
            })),
    ];
    const rootResults = await readRootRecentPayload({
        directories,
        metadata,
        dependencies: deps,
    });
    const pinnedChats = Array.isArray(pinned) ? pinned : [];
    const maxWithPinned = parseInt(max ?? Number.MAX_SAFE_INTEGER) + pinnedChats.length;
    const isPinned = chat => pinnedChats.some(entry => (
        entry.file_name === chat.payload.file_name
        && (entry.avatar === chat.payload.avatar || entry.group === chat.payload.group)
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
