import fs from 'node:fs';
import path from 'node:path';

import type { ChatInfo } from './chats.js';
import type { UserDirectoryList } from '../users.js';

type TextMatcher = (textArray: string[]) => boolean;
type GetChatInfo = (pathToFile: string, additionalData?: object, withMetadata?: boolean, matcher?: TextMatcher | null) => Promise<ChatInfo>;
type ChatRouteServiceDependencies = {
    fs?: typeof fs;
    path?: typeof path;
    getChatInfo: GetChatInfo;
    warn?: (...args: unknown[]) => void;
};
type ChatDirectories = Pick<UserDirectoryList, 'chats' | 'characters'>;
type SearchChatOptions = {
    directories: Pick<ChatDirectories, 'chats'>;
    query?: string;
    avatarUrl?: string;
    dependencies: ChatRouteServiceDependencies;
};
type SearchChatResult = {
    file_name: ChatInfo['file_id'];
    file_size: ChatInfo['file_size'];
    message_count: ChatInfo['chat_items'];
    last_mes: ChatInfo['last_mes'];
    preview_message: string;
};
type ChatFile = { pngFile?: string; filePath: string; mtime: number };
type PinnedChat = { file_name?: string; avatar?: string };
type RecentChatOptions = {
    directories: ChatDirectories;
    pinned?: PinnedChat[];
    max?: number | string;
    metadata?: boolean;
    dependencies: ChatRouteServiceDependencies;
};

/**
 * Gets a preview message from a chat message string.
 * @param {string} [lastMessage] The message to truncate.
 * @returns {string} A truncated preview of the last message or empty string if no messages.
 */
export function getPreviewMessage(lastMessage?: string): string {
    const strlen = 400;

    if (!lastMessage) {
        return '';
    }

    return lastMessage.length > strlen
        ? '...' + lastMessage.substring(lastMessage.length - strlen)
        : lastMessage;
}

function normalizeDependencies(dependencies: ChatRouteServiceDependencies): Required<ChatRouteServiceDependencies> {
    return {
        fs: dependencies.fs ?? fs,
        path: dependencies.path ?? path,
        getChatInfo: dependencies.getChatInfo,
        warn: dependencies.warn ?? console.warn,
    };
}

export function createTextMatcher(query?: string): TextMatcher {
    const fragments = query ? query.trim().toLowerCase().split(/\s+/).filter(x => x) : [];

    return (textArray) => {
        if (fragments.length === 0) {
            return true;
        }
        return fragments.every(fragment => {
            const isNumericFragment = /^\d+$/.test(fragment);

            return textArray.some(text => {
                const normalizedText = String(text ?? '').toLowerCase();
                if (!isNumericFragment) {
                    return normalizedText.includes(fragment);
                }

                const numericTokens: string[] = normalizedText.match(/\d+/g) ?? [];
                return numericTokens.includes(fragment);
            });
        });
    };
}

export async function searchChatPayload({
    directories,
    query = '',
    avatarUrl = '',
    dependencies,
}: SearchChatOptions): Promise<SearchChatResult[]> {
    const deps = normalizeDependencies(dependencies);
    const characterName = String(avatarUrl ?? '').replace('.png', '');
    if (!characterName) {
        return [];
    }
    const directoryPath = deps.path.join(directories.chats, characterName);

    if (!deps.fs.existsSync(directoryPath)) {
        return [];
    }

    const chatFiles = deps.fs.readdirSync(directoryPath)
        .filter(file => deps.path.extname(file) === '.jsonl')
        .map(fileName => deps.path.join(directoryPath, fileName));

    const results: SearchChatResult[] = [];
    const hasTextMatch = createTextMatcher(query);

    for (const chatFile of chatFiles) {
        const matcher = query ? hasTextMatch : null;
        const chatInfo = await deps.getChatInfo(chatFile, {}, false, matcher);
        const hasMatch = chatInfo.match || hasTextMatch([chatInfo.file_id ?? '']);

        if (!chatInfo.file_name) {
            continue;
        }

        if (query && chatInfo.chat_items === 0 && !hasMatch) {
            continue;
        }

        if (!query || hasMatch) {
            results.push({
                file_name: chatInfo.file_id,
                file_size: chatInfo.file_size,
                message_count: chatInfo.chat_items,
                last_mes: chatInfo.last_mes,
                preview_message: getPreviewMessage(chatInfo.mes),
            });
        }
    }

    return results;
}

export async function readRecentChatPayload({
    directories,
    pinned = [],
    max = Number.MAX_SAFE_INTEGER,
    metadata = false,
    dependencies,
}: RecentChatOptions): Promise<ChatInfo[]> {
    const deps = normalizeDependencies(dependencies);
    const allChatFiles: ChatFile[] = [];
    const pinnedChats: PinnedChat[] = Array.isArray(pinned) ? pinned : [];

    const getCharacterChatFiles = async () => {
        const pngDirents = await deps.fs.promises.readdir(directories.characters, { withFileTypes: true });
        const pngFiles = pngDirents.filter(e => e.isFile() && deps.path.extname(e.name) === '.png').map(e => e.name);

        for (const pngFile of pngFiles) {
            const chatsDirectory = pngFile.replace('.png', '');
            const pathToChats = deps.path.join(directories.chats, chatsDirectory);
            if (!deps.fs.existsSync(pathToChats)) {
                continue;
            }
            const pathStats = await deps.fs.promises.stat(pathToChats);
            if (pathStats.isDirectory()) {
                const chatFiles = await deps.fs.promises.readdir(pathToChats);
                const jsonlFiles = chatFiles.filter(file => deps.path.extname(file) === '.jsonl');

                for (const file of jsonlFiles) {
                    const filePath = deps.path.join(pathToChats, file);
                    const stats = await deps.fs.promises.stat(filePath);
                    allChatFiles.push({ pngFile, filePath, mtime: stats.mtimeMs });
                }
            }
        }
    };

    const getRootChatFiles = async () => {
        const dirents = await deps.fs.promises.readdir(directories.chats, { withFileTypes: true });
        const chatFiles = dirents.filter(e => e.isFile() && deps.path.extname(e.name) === '.jsonl').map(e => e.name);

        for (const file of chatFiles) {
            const filePath = deps.path.join(directories.chats, file);
            const stats = await deps.fs.promises.stat(filePath);
            allChatFiles.push({ filePath, mtime: stats.mtimeMs });
        }
    };

    await Promise.allSettled([getCharacterChatFiles(), getRootChatFiles()]);

    const maxWithPinned = parseInt(`${max ?? Number.MAX_SAFE_INTEGER}`) + pinnedChats.length;
    const isPinned = (chatFile: ChatFile) => pinnedChats.some(p => p.file_name === deps.path.basename(chatFile.filePath) && p.avatar === chatFile.pngFile);
    const recentChats = allChatFiles.sort((a, b) => {
        const isAPinned = isPinned(a);
        const isBPinned = isPinned(b);

        if (isAPinned && !isBPinned) return -1;
        if (!isAPinned && isBPinned) return 1;

        return b.mtime - a.mtime;
    }).slice(0, maxWithPinned);

    const jsonFilesPromise = recentChats.map((file) => {
        const withMetadata = !!metadata;
        return deps.getChatInfo(file.filePath, { avatar: file.pngFile }, withMetadata);
    });

    const chatData = (await Promise.allSettled(jsonFilesPromise)).filter(x => x.status === 'fulfilled').map(x => x.value);
    return chatData.filter(i => i.file_name);
}
