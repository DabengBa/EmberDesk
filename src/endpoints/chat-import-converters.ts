import { tryParse } from '../util.js';

type OobaChatImport = { data_visible: [unknown?, unknown?][] };
type AgnaiChatImport = { messages: { userId?: unknown; msg?: unknown }[] };
type CaiHistory = { msgs: { src: { is_human: unknown }; text?: unknown }[] };
type CaiChatImport = { histories: { histories?: CaiHistory[] | null } };
type KoboldLiteChatImport = {
    savedsettings?: { chatname?: unknown; chatopponent?: unknown } | null;
    actions: string[];
    prompt?: string;
};
type RisuChatImport = {
    data: { message: { role?: unknown; name?: unknown; time?: unknown; data?: unknown }[] };
};
type JsonChatImportSelectors = {
    savedsettings?: unknown;
    histories?: unknown;
    data_visible?: unknown;
    messages?: unknown;
    type?: unknown;
};
type ChubChatLine = {
    mes?: { message?: unknown };
    swipes?: unknown;
    swipe_id?: unknown;
    swipe_info?: unknown;
};
type JsonChatImportConverter = (userName: string, characterName: string, jsonData: unknown) => string | string[];

// These views describe the existing format reads, not validated payloads. Keep the
// unchecked boundary: malformed shapes must still throw in the selected converter
// rather than becoming parse errors or unsupported-format results.

/**
 * Imports a chat from Ooba's format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {unknown} jsonData JSON data
 * @returns {string} Chat data
 */
export function importOobaChat(userName: string, characterName: string, jsonData: unknown): string {
    const data = jsonData as OobaChatImport;
    const chat: Record<string, unknown>[] = [{
        chat_metadata: {},
        user_name: 'unused',
        character_name: 'unused',
    }];

    for (const arr of data.data_visible) {
        if (arr[0]) {
            const userMessage = {
                name: userName,
                is_user: true,
                send_date: new Date().toISOString(),
                mes: arr[0],
                extra: {},
            };
            chat.push(userMessage);
        }
        if (arr[1]) {
            const charMessage = {
                name: characterName,
                is_user: false,
                send_date: new Date().toISOString(),
                mes: arr[1],
                extra: {},
            };
            chat.push(charMessage);
        }
    }

    return chat.map(obj => JSON.stringify(obj)).join('\n');
}

/**
 * Imports a chat from Agnai's format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {unknown} jsonData Chat data
 * @returns {string} Chat data
 */
export function importAgnaiChat(userName: string, characterName: string, jsonData: unknown): string {
    const data = jsonData as AgnaiChatImport;
    const chat: Record<string, unknown>[] = [{
        chat_metadata: {},
        user_name: 'unused',
        character_name: 'unused',
    }];

    for (const message of data.messages) {
        const isUser = !!message.userId;
        chat.push({
            name: isUser ? userName : characterName,
            is_user: isUser,
            send_date: new Date().toISOString(),
            mes: message.msg,
            extra: {},
        });
    }

    return chat.map(obj => JSON.stringify(obj)).join('\n');
}

/**
 * Imports a chat from CAI Tools format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {unknown} jsonData JSON data
 * @returns {string[]} Converted data
 */
export function importCAIChat(userName: string, characterName: string, jsonData: unknown): string[] {
    const data = jsonData as CaiChatImport;
    /**
     * Converts the chat data to suitable format.
     * @param {object} history Imported chat data
     * @returns {object[]} Converted chat data
     */
    function convert(history: CaiHistory): Record<string, unknown>[] {
        const starter = {
            chat_metadata: {},
            user_name: 'unused',
            character_name: 'unused',
        };

        const historyData = history.msgs.map((msg) => ({
            name: msg.src.is_human ? userName : characterName,
            is_user: msg.src.is_human,
            send_date: new Date().toISOString(),
            mes: msg.text,
            extra: {},
        }));

        return [starter, ...historyData];
    }

    const newChats = (data.histories.histories ?? []).map(history => convert(history).map(obj => JSON.stringify(obj)).join('\n'));
    return newChats;
}

/**
 * Imports a chat from Kobold Lite format.
 * @param {string} _userName User name
 * @param {string} _characterName Character name
 * @param {unknown} jsonData JSON data
 * @returns {string} Chat data
 */
export function importKoboldLiteChat(_userName: string, _characterName: string, jsonData: unknown): string {
    const data = jsonData as KoboldLiteChatImport;
    const inputToken = '{{[INPUT]}}';
    const outputToken = '{{[OUTPUT]}}';

    function processKoboldMessage(msg: string): Record<string, unknown> {
        const isUser = msg.includes(inputToken);
        return {
            name: isUser ? userName : characterName,
            is_user: isUser,
            mes: msg.replaceAll(inputToken, '').replaceAll(outputToken, '').trim(),
            send_date: new Date().toISOString(),
            extra: {},
        };
    }

    // Create the header
    const userName = String(data.savedsettings?.chatname ?? _userName);
    const characterName = String(data.savedsettings?.chatopponent ?? _characterName).split('||$||')[0];
    const header = {
        chat_metadata: {},
        user_name: 'unused',
        character_name: 'unused',
    };
    // Format messages
    const formattedMessages = data.actions.map(processKoboldMessage);
    // Add prompt if available
    if (data.prompt) {
        formattedMessages.unshift(processKoboldMessage(data.prompt));
    }
    // Combine header and messages
    const chatData = [header, ...formattedMessages];
    return chatData.map(obj => JSON.stringify(obj)).join('\n');
}

/**
 * Flattens nested `msg` data and drops swipe fields from Chub Chat format.
 * Only changes enough to make it compatible with the standard chat serialization format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {string[]|null|undefined} lines serialised JSONL data
 * @returns {string} Converted data
 */
export function flattenChubChat(userName: string, characterName: string, lines: string[] | null | undefined): string {
    function convert(line: string): string {
        const parsed: unknown = tryParse(line);
        const lineData = parsed as ChubChatLine | null;
        if (!lineData) return line;

        if (lineData.mes && lineData.mes.message) {
            lineData.mes = lineData?.mes.message;
        }

        delete lineData.swipes;
        delete lineData.swipe_id;
        delete lineData.swipe_info;

        return JSON.stringify(lineData);
    }

    return (lines ?? []).map(convert).join('\n');
}

/**
 * Imports a chat from RisuAI format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {unknown} jsonData Imported chat data
 * @returns {string} Chat data
 */
export function importRisuChat(userName: string, characterName: string, jsonData: unknown): string {
    const data = jsonData as RisuChatImport;
    const chat: Record<string, unknown>[] = [{
        chat_metadata: {},
        user_name: 'unused',
        character_name: 'unused',
    }];

    for (const message of data.data.message) {
        const isUser = message.role === 'user';
        chat.push({
            name: message.name ?? (isUser ? userName : characterName),
            is_user: isUser,
            send_date: new Date(Number(message.time ?? Date.now())).toISOString(),
            mes: message.data ?? '',
            extra: {},
        });
    }

    return chat.map(obj => JSON.stringify(obj)).join('\n');
}

/**
 * Selects the JSON chat import converter using the existing branch order.
 * @param {unknown} jsonData JSON import payload
 * @returns {JsonChatImportConverter|null} Converter function
 */
export function getJsonChatImportConverter(jsonData: unknown): JsonChatImportConverter | null {
    const data = jsonData as JsonChatImportSelectors;
    if (data.savedsettings !== undefined) { // Kobold Lite format
        return importKoboldLiteChat;
    }
    if (data.histories !== undefined) { // CAI Tools format
        return importCAIChat;
    }
    if (Array.isArray(data.data_visible)) { // oobabooga's format
        return importOobaChat;
    }
    if (Array.isArray(data.messages)) { // Agnai's format
        return importAgnaiChat;
    }
    if (data.type === 'risuChat') { // RisuAI format
        return importRisuChat;
    }
    return null;
}
