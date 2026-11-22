import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sanitize from 'sanitize-filename';
import type { UserDirectoryList } from '../user-types.ts';

type SnapshotPayload = Record<string, unknown> & {
    name?: string; avatar?: string; json_data?: string; create_date?: unknown;
    data?: Record<string, unknown> & { extensions?: { world?: unknown }; character_book?: unknown };
};
type SnapshotOptions = {
    avatar: string;
    directories: UserDirectoryList;
    readCharacterData: (inputFile: string) => Promise<string | undefined>;
    getCharaCardV2: (jsonObject: Parameters<typeof import('./character-card-v2.ts').getCharaCardV2>[0], directories: UserDirectoryList, hoistDate?: boolean) => object;
};

import { calculateDataSize, toShallow } from './character-card-helpers.ts';

/**
 * @param {import('../user-types.ts').UserDirectoryList} directories
 * @param {string} avatar
 * @returns {string}
 */
export function getCharacterChatDirectory(directories: UserDirectoryList, avatar: string) {
    return path.join(directories.chats, avatar.replace('.png', ''));
}

/**
 * @param {string} characterChatDirectory
 * @returns {{ chatCount: number, chatSize: number, dateLastChat: number }}
 */
export function calculateCharacterChatStats(characterChatDirectory: string) {
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
export function statCharacterSnapshotFile(filePath: string) {
    const fileStat = fs.statSync(filePath);
    return {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
    };
}

/**
 * @param {import('../user-types.ts').UserDirectoryList} directories
 * @param {object} fullPayload
 * @returns {{
 *   sourceWorldName: string,
 *   sourceWorldMtimeMs: number,
 *   sourceWorldSize: number,
 * }}
 */
export function getCharacterSnapshotWorldMetadata(directories: UserDirectoryList, fullPayload: SnapshotPayload) {
    let sourceWorldName = '';
    let sourceWorldMtimeMs = -1;
    let sourceWorldSize = -1;
    let rawCard;

    try {
        rawCard = JSON.parse(fullPayload.json_data!);
    } catch (error) {
        console.warn(`Character file snapshot world metadata skipped for ${fullPayload.avatar ?? '(unknown avatar)'}:`, error);
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
            if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                console.warn(`Character file snapshot world metadata skipped for ${fullPayload.avatar ?? '(unknown avatar)'}:`, error);
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
 * @param {import('../user-types.ts').UserDirectoryList} options.directories
 * @param {(inputFile: string) => Promise<string | undefined>} options.readCharacterData
 * @param {(jsonObject: object, directories: import('../user-types.ts').UserDirectoryList, hoistDate?: boolean) => object} options.getCharaCardV2
 * @returns {Promise<object>}
 */
export async function processCharacterFileSnapshot({
    avatar,
    directories,
    readCharacterData,
    getCharaCardV2,
}: SnapshotOptions): Promise<SnapshotPayload> {
    try {
        const imageFilePath = path.join(directories.characters, avatar);
        const imageData = await readCharacterData(imageFilePath);
        if (imageData === undefined) {
            throw new Error('Failed to read character file');
        }

        const jsonObject = getCharaCardV2(JSON.parse(imageData), directories, false) as SnapshotPayload;
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
 * @param {import('../user-types.ts').UserDirectoryList} options.directories
 * @param {(inputFile: string) => Promise<string | undefined>} options.readCharacterData
 * @param {(jsonObject: object, directories: import('../user-types.ts').UserDirectoryList, hoistDate?: boolean) => object} options.getCharaCardV2
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
}: SnapshotOptions) {
    const fullPayload = await processCharacterFileSnapshot({
        avatar,
        directories,
        readCharacterData,
        getCharaCardV2,
    });

    if (!fullPayload?.name) {
        throw new Error(`Could not build character file snapshot row for ${avatar}`);
    }

    // Canonical snapshots must stay deterministic and free of derived content:
    // every rebuild feeds import/audit drift-compares against stored card_json.
    let rawCard = null;
    try {
        rawCard = JSON.parse(fullPayload.json_data!);
    } catch {
        rawCard = null;
    }

    // A card that never stored `chat` gets a wall-clock default from the V2
    // normalizer. Derive it from the file-backed create_date instead so two
    // snapshots of an unchanged file stay byte-identical.
    if (rawCard?.chat === undefined && rawCard?.data?.chat === undefined) {
        fullPayload.chat = `${fullPayload.name} - ${fullPayload.create_date}`;
    }

    // `data.character_book` filled from the linked World Info file is a
    // derived, volatile copy — storing it would freeze stale lorebook content
    // in card_json. Persist only the card-native embedded book; canonical
    // reads re-resolve the linked book at serve time.
    const linkedWorld = String(fullPayload.data?.extensions?.world ?? fullPayload.world ?? '').trim();
    if (linkedWorld && fullPayload.data && typeof fullPayload.data === 'object') {
        const cardNativeBook = rawCard?.data?.character_book;
        if (cardNativeBook === undefined) {
            delete fullPayload.data.character_book;
        } else {
            fullPayload.data.character_book = cardNativeBook;
        }
    }

    const filePath = path.join(directories.characters, avatar);
    const stat = statCharacterSnapshotFile(filePath);
    const worldMetadata = getCharacterSnapshotWorldMetadata(directories, fullPayload);
    // Source-byte hash feeds the import ledger so later scans can tell a
    // stale projected file apart from a genuinely new/edited one.
    const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

    return {
        avatar,
        fullPayload,
        shallowPayload: toShallow(fullPayload),
        sourceMtimeMs: stat.mtimeMs,
        sourceSize: stat.size,
        sourceHash,
        ...worldMetadata,
    };
}
