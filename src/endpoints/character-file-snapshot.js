import fs from 'node:fs';
import path from 'node:path';

import sanitize from 'sanitize-filename';

import { calculateDataSize, toShallow } from './character-card-helpers.js';

/**
 * @param {import('../users.js').UserDirectoryList} directories
 * @param {string} avatar
 * @returns {string}
 */
export function getCharacterChatDirectory(directories, avatar) {
    return path.join(directories.chats, avatar.replace('.png', ''));
}

/**
 * @param {string} characterChatDirectory
 * @returns {{ chatCount: number, chatSize: number, dateLastChat: number }}
 */
export function calculateCharacterChatStats(characterChatDirectory) {
    let chatCount = 0;
    let chatSize = 0;
    let dateLastChat = 0;

    if (fs.existsSync(characterChatDirectory)) {
        const chats = fs.readdirSync(characterChatDirectory);
        if (Array.isArray(chats) && chats.length) {
            chatCount = chats.length;
            for (const chat of chats) {
                const chatStat = fs.statSync(path.join(characterChatDirectory, chat));
                chatSize += chatStat.size;
                dateLastChat = Math.max(dateLastChat, chatStat.mtimeMs);
            }
        }
    }

    return { chatCount, chatSize, dateLastChat };
}

/**
 * @param {string} filePath
 * @returns {{ mtimeMs: number, size: number }}
 */
export function statCharacterSnapshotFile(filePath) {
    const fileStat = fs.statSync(filePath);
    return {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
    };
}

/**
 * @param {import('../users.js').UserDirectoryList} directories
 * @param {object} fullPayload
 * @returns {{
 *   sourceWorldName: string,
 *   sourceWorldMtimeMs: number,
 *   sourceWorldSize: number,
 * }}
 */
export function getCharacterSnapshotWorldMetadata(directories, fullPayload) {
    let sourceWorldName = '';
    let sourceWorldMtimeMs = -1;
    let sourceWorldSize = -1;
    let rawCard;

    try {
        rawCard = JSON.parse(fullPayload.json_data);
    } catch (error) {
        console.warn(`Character index world metadata skipped for ${fullPayload.avatar ?? '(unknown avatar)'}:`, error);
        return {
            sourceWorldName,
            sourceWorldMtimeMs,
            sourceWorldSize,
        };
    }

    if (!rawCard?.spec && typeof rawCard?.world === 'string' && rawCard.world) {
        sourceWorldName = sanitize(rawCard.world);
        if (!sourceWorldName) {
            return {
                sourceWorldName: '',
                sourceWorldMtimeMs,
                sourceWorldSize,
            };
        }

        try {
            const worldFileName = `${sourceWorldName}.json`;
            const worldFilePath = path.join(directories.worlds, worldFileName);
            const worldStat = fs.statSync(worldFilePath);
            sourceWorldMtimeMs = worldStat.mtimeMs;
            sourceWorldSize = worldStat.size;
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                console.warn(`Character index world metadata skipped for ${fullPayload.avatar ?? '(unknown avatar)'}:`, error);
            }
        }
    }

    return {
        sourceWorldName,
        sourceWorldMtimeMs,
        sourceWorldSize,
    };
}

/**
 * @param {object} options
 * @param {string} options.avatar
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {(inputFile: string) => Promise<string | undefined>} options.readCharacterData
 * @param {(jsonObject: object, directories: import('../users.js').UserDirectoryList, hoistDate?: boolean) => object} options.getCharaCardV2
 * @returns {Promise<object>}
 */
export async function processCharacterFileSnapshot({
    avatar,
    directories,
    readCharacterData,
    getCharaCardV2,
}) {
    try {
        const imageFilePath = path.join(directories.characters, avatar);
        const imageData = await readCharacterData(imageFilePath);
        if (imageData === undefined) {
            throw new Error('Failed to read character file');
        }

        const jsonObject = getCharaCardV2(JSON.parse(imageData), directories, false);
        jsonObject.avatar = avatar;
        const character = jsonObject;
        character.json_data = imageData;
        const characterStat = fs.statSync(imageFilePath);
        character.date_added = characterStat.ctimeMs;
        character.create_date = jsonObject.create_date || new Date(Math.round(characterStat.ctimeMs)).toISOString();

        const chatsDirectory = getCharacterChatDirectory(directories, avatar);
        const { chatSize, dateLastChat } = calculateCharacterChatStats(chatsDirectory);
        character.chat_size = chatSize;
        character.date_last_chat = dateLastChat;
        character.data_size = calculateDataSize(jsonObject?.data);
        return character;
    } catch (error) {
        console.error(`Could not process character: ${avatar}`);

        if (error instanceof SyntaxError) {
            console.error(`${avatar} does not contain a valid JSON object.`);
        } else {
            console.error('An unexpected error occurred: ', error);
        }

        return {
            date_added: 0,
            date_last_chat: 0,
            chat_size: 0,
        };
    }
}

/**
 * @param {object} options
 * @param {string} options.avatar
 * @param {import('../users.js').UserDirectoryList} options.directories
 * @param {(inputFile: string) => Promise<string | undefined>} options.readCharacterData
 * @param {(jsonObject: object, directories: import('../users.js').UserDirectoryList, hoistDate?: boolean) => object} options.getCharaCardV2
 * @returns {Promise<{
 *   avatar: string,
 *   fullPayload: object,
 *   shallowPayload: object,
 *   sourceMtimeMs: number,
 *   sourceSize: number,
 *   sourceWorldName: string,
 *   sourceWorldMtimeMs: number,
 *   sourceWorldSize: number,
 * }>}
 */
export async function buildCharacterFileSnapshotRow({
    avatar,
    directories,
    readCharacterData,
    getCharaCardV2,
}) {
    const fullPayload = await processCharacterFileSnapshot({
        avatar,
        directories,
        readCharacterData,
        getCharaCardV2,
    });

    if (!fullPayload?.name) {
        throw new Error(`Could not build character index row for ${avatar}`);
    }

    const filePath = path.join(directories.characters, avatar);
    const stat = statCharacterSnapshotFile(filePath);
    const worldMetadata = getCharacterSnapshotWorldMetadata(directories, fullPayload);

    return {
        avatar,
        fullPayload,
        shallowPayload: toShallow(fullPayload),
        sourceMtimeMs: stat.mtimeMs,
        sourceSize: stat.size,
        ...worldMetadata,
    };
}
