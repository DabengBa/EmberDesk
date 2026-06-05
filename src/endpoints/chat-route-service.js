import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {import('./chats.js').ChatInfo} ChatInfo
 * @typedef {(pathToFile: string, additionalData?: object, withMetadata?: boolean, matcher?: ((textArray: string[]) => boolean) | null) => Promise<ChatInfo>} GetChatInfo
 * @typedef {{ fs?: typeof fs, path?: typeof path, getChatInfo: GetChatInfo, warn?: (...args: unknown[]) => void }} ChatRouteServiceDependencies
 */

/**
 * Gets a preview message from a chat message string.
 * @param {string} [lastMessage] The message to truncate.
 * @returns {string} A truncated preview of the last message or empty string if no messages.
 */
export function getPreviewMessage(lastMessage) {
    const strlen = 400;

    if (!lastMessage) {
        return '';
    }

    return lastMessage.length > strlen
        ? '...' + lastMessage.substring(lastMessage.length - strlen)
        : lastMessage;
}

/**
 * @param {ChatRouteServiceDependencies} dependencies
 */
function normalizeDependencies(dependencies) {
    return {
        fs: dependencies.fs ?? fs,
        path: dependencies.path ?? path,
        getChatInfo: dependencies.getChatInfo,
        warn: dependencies.warn ?? console.warn,
    };
}

/**
 * @param {string} query
 * @returns {(textArray: string[]) => boolean}
 */
function createTextMatcher(query) {
    const fragments = query ? query.trim().toLowerCase().split(/\s+/).filter(x => x) : [];

    return (textArray) => {
        if (fragments.length === 0) {
            return true;
        }
        return fragments.every(fragment => textArray.some(text => String(text ?? '').toLowerCase().includes(fragment)));
    };
}

/**
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {string} [options.query]
 * @param {string} [options.avatarUrl]
 * @param {string} [options.groupId]
 * @param {ChatRouteServiceDependencies} options.dependencies
 * @returns {Promise<object[]>}
 */
export async function searchChatPayload({
    directories,
    query = '',
    avatarUrl = '',
    groupId,
    dependencies,
}) {
    const deps = normalizeDependencies(dependencies);
    /** @type {string[]} */
    let chatFiles = [];

    if (groupId) {
        const groupFiles = deps.fs.readdirSync(directories.groups)
            .filter(file => deps.path.extname(file) === '.json');

        let targetGroup;
        for (const groupFile of groupFiles) {
            try {
                const groupData = JSON.parse(deps.fs.readFileSync(deps.path.join(directories.groups, groupFile), 'utf8'));
                if (groupData.id === groupId) {
                    targetGroup = groupData;
                    break;
                }
            } catch (error) {
                deps.warn(groupFile, 'group file is corrupted:', error);
            }
        }

        if (!Array.isArray(targetGroup?.chats)) {
            return [];
        }

        chatFiles = targetGroup.chats
            .map(chatId => deps.path.join(directories.groupChats, `${chatId}.jsonl`))
            .filter(fileName => deps.fs.existsSync(fileName));
    } else {
        const characterName = avatarUrl.replace('.png', '');
        const directoryPath = deps.path.join(directories.chats, characterName);

        if (!deps.fs.existsSync(directoryPath)) {
            return [];
        }

        chatFiles = deps.fs.readdirSync(directoryPath)
            .filter(file => deps.path.extname(file) === '.jsonl')
            .map(fileName => deps.path.join(directoryPath, fileName));
    }

    const results = [];
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

/**
 * @typedef {{pngFile?: string, groupId?: string, filePath: string, mtime: number}} ChatFile
 */

/**
 * @param {object} options
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {import('../../public/scripts/welcome-screen.js').PinnedChat[]} [options.pinned]
 * @param {number|string} [options.max]
 * @param {boolean} [options.metadata]
 * @param {ChatRouteServiceDependencies} options.dependencies
 * @returns {Promise<object[]>}
 */
export async function readRecentChatPayload({
    directories,
    pinned = [],
    max = Number.MAX_SAFE_INTEGER,
    metadata = false,
    dependencies,
}) {
    const deps = normalizeDependencies(dependencies);
    /** @type {ChatFile[]} */
    const allChatFiles = [];
    const pinnedChats = Array.isArray(pinned) ? pinned : [];

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

    const getGroupChatFiles = async () => {
        const groupDirents = await deps.fs.promises.readdir(directories.groups, { withFileTypes: true });
        const groups = groupDirents.filter(e => e.isFile() && deps.path.extname(e.name) === '.json').map(e => e.name);

        for (const group of groups) {
            try {
                const groupPath = deps.path.join(directories.groups, group);
                const groupContents = await deps.fs.promises.readFile(groupPath, 'utf8');
                const groupData = JSON.parse(groupContents);

                if (Array.isArray(groupData.chats)) {
                    for (const chat of groupData.chats) {
                        const filePath = deps.path.join(directories.groupChats, `${chat}.jsonl`);
                        if (!deps.fs.existsSync(filePath)) {
                            continue;
                        }
                        const stats = await deps.fs.promises.stat(filePath);
                        allChatFiles.push({ groupId: groupData.id, filePath, mtime: stats.mtimeMs });
                    }
                }
            } catch {
                continue;
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

    await Promise.allSettled([getCharacterChatFiles(), getGroupChatFiles(), getRootChatFiles()]);

    const maxWithPinned = parseInt(max ?? Number.MAX_SAFE_INTEGER) + pinnedChats.length;
    const isPinned = (/** @type {ChatFile} */ chatFile) => pinnedChats.some(p => p.file_name === deps.path.basename(chatFile.filePath) && (p.avatar === chatFile.pngFile || p.group === chatFile.groupId));
    const recentChats = allChatFiles.sort((a, b) => {
        const isAPinned = isPinned(a);
        const isBPinned = isPinned(b);

        if (isAPinned && !isBPinned) return -1;
        if (!isAPinned && isBPinned) return 1;

        return b.mtime - a.mtime;
    }).slice(0, maxWithPinned);

    const jsonFilesPromise = recentChats.map((file) => {
        const withMetadata = !!metadata;
        return file.groupId
            ? deps.getChatInfo(file.filePath, { group: file.groupId }, withMetadata)
            : deps.getChatInfo(file.filePath, { avatar: file.pngFile }, withMetadata);
    });

    const chatData = (await Promise.allSettled(jsonFilesPromise)).filter(x => x.status === 'fulfilled').map(x => x.value);
    return chatData.filter(i => i.file_name);
}
