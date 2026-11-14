import path from 'node:path';

import type { UserDirectoryList } from '../users.js';

import {
    flattenChubChat,
    getJsonChatImportConverter,
} from './chat-import-converters.ts';

export const CHAT_IMPORT_ERROR_KINDS = Object.freeze({
    INVALID_JSONL_FORMAT: 'invalid-jsonl-format',
    PARSE_FAILED: 'parse-failed',
    UNSUPPORTED_FORMAT: 'unsupported-format',
    UNSUPPORTED_JSON_FORMAT: 'unsupported-json-format',
});

export const CHAT_IMPORT_UPLOAD_CLEANUP = Object.freeze({
    AFTER_SUCCESS: 'after-success',
    ALREADY_CLEANED: 'already-cleaned',
    NONE: 'none',
});

type ChatImportErrorKind = typeof CHAT_IMPORT_ERROR_KINDS[keyof typeof CHAT_IMPORT_ERROR_KINDS];
type ChatImportUploadCleanup = typeof CHAT_IMPORT_UPLOAD_CLEANUP[keyof typeof CHAT_IMPORT_UPLOAD_CLEANUP];

type AtomicChatWrite = { kind: 'atomic-write'; filePath: string; contents: string };
type ChatImportWrite = AtomicChatWrite | { kind: 'copy-upload'; filePath: string; uploadPath: string };

type FailedChatImportPlan = {
    ok: false;
    errorKind: ChatImportErrorKind;
    uploadCleanup: ChatImportUploadCleanup;
    error?: unknown;
};
type SuccessfulChatImportPlan = {
    ok: true;
    fileNames: string[];
    shouldMarkChatStatsDirty: true;
    uploadCleanup: ChatImportUploadCleanup;
    writes: ChatImportWrite[];
};
type ChatImportPlan = FailedChatImportPlan | SuccessfulChatImportPlan;

type ChatImportOptions = {
    format: string;
    data: string;
    directories: Pick<UserDirectoryList, 'chats'>;
    avatarUrl: string;
    characterName: string;
    userName: string;
    timestampLabel: () => string;
    uploadPath: string;
    warn?: (message: string, error: unknown) => void;
};
type ChatWritePlanOptions = Pick<ChatImportOptions, 'directories' | 'avatarUrl' | 'characterName' | 'timestampLabel'> & { contents: string };

function createImportedChatFileName(characterName: string, timestampLabel: () => string): string {
    return `${characterName} - ${timestampLabel()} imported.jsonl`;
}

function createChatWritePlan({
    directories,
    avatarUrl,
    characterName,
    timestampLabel,
    contents,
}: ChatWritePlanOptions): { fileName: string; write: AtomicChatWrite } {
    const fileName = createImportedChatFileName(characterName, timestampLabel);
    return {
        fileName,
        write: {
            kind: 'atomic-write',
            filePath: path.join(directories.chats, avatarUrl, fileName),
            contents,
        },
    };
}

function createFailedImportPlan(errorKind: ChatImportErrorKind, uploadCleanup: ChatImportUploadCleanup, error?: unknown): FailedChatImportPlan {
    const plan: FailedChatImportPlan = {
        ok: false,
        errorKind,
        uploadCleanup,
    };

    if (error) {
        plan.error = error;
    }

    return plan;
}

function parseChatImportJson(data: string, uploadCleanup: ChatImportUploadCleanup): { ok: true; jsonData: unknown } | FailedChatImportPlan {
    try {
        return {
            ok: true,
            jsonData: JSON.parse(data),
        };
    } catch (error) {
        return createFailedImportPlan(CHAT_IMPORT_ERROR_KINDS.PARSE_FAILED, uploadCleanup, error);
    }
}

function createJsonChatImportPlan({
    data,
    directories,
    avatarUrl,
    characterName,
    userName,
    timestampLabel,
}: ChatImportOptions): ChatImportPlan {
    const parsed = parseChatImportJson(data, CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED);
    if (!parsed.ok) {
        return parsed;
    }

    const importFunc = getJsonChatImportConverter(parsed.jsonData);
    if (!importFunc) {
        return createFailedImportPlan(
            CHAT_IMPORT_ERROR_KINDS.UNSUPPORTED_JSON_FORMAT,
            CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED,
        );
    }

    const importedChat = importFunc(userName, characterName, parsed.jsonData);
    const chats = Array.isArray(importedChat) ? importedChat : [importedChat];
    const plannedWrites = chats.map(contents => createChatWritePlan({
        directories,
        avatarUrl,
        characterName,
        timestampLabel,
        contents,
    }));

    return {
        ok: true,
        fileNames: plannedWrites.map(plan => plan.fileName),
        shouldMarkChatStatsDirty: true,
        uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED,
        writes: plannedWrites.map(plan => plan.write),
    };
}

function isJsonlChatHeader(jsonData: unknown): boolean {
    // Preserve legacy property access, including a TypeError for a null header.
    const header = jsonData as { user_name?: unknown; name?: unknown; chat_metadata?: unknown };
    return header.user_name !== undefined || header.name !== undefined || header.chat_metadata !== undefined;
}

function createJsonlChatImportPlan({
    data,
    directories,
    avatarUrl,
    characterName,
    userName,
    timestampLabel,
    uploadPath,
    warn = console.warn,
}: ChatImportOptions): ChatImportPlan {
    const lines = data.split('\n');
    const parsed = parseChatImportJson(lines[0], CHAT_IMPORT_UPLOAD_CLEANUP.NONE);
    if (!parsed.ok) {
        return parsed;
    }

    if (!isJsonlChatHeader(parsed.jsonData)) {
        return createFailedImportPlan(
            CHAT_IMPORT_ERROR_KINDS.INVALID_JSONL_FORMAT,
            CHAT_IMPORT_UPLOAD_CLEANUP.NONE,
        );
    }

    let flattenedChat = data;
    try {
        flattenedChat = flattenChubChat(userName, characterName, lines);
    } catch (error) {
        warn('Failed to flatten Chub Chat data: ', error);
    }

    const fileName = createImportedChatFileName(characterName, timestampLabel);
    const filePath = path.join(directories.chats, avatarUrl, fileName);
    const write: ChatImportWrite = flattenedChat !== data
        ? {
            kind: 'atomic-write',
            filePath,
            contents: flattenedChat,
        }
        : {
            kind: 'copy-upload',
            filePath,
            uploadPath,
        };

    return {
        ok: true,
        fileNames: [fileName],
        shouldMarkChatStatsDirty: true,
        uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS,
        writes: [write],
    };
}

export function createCharacterChatImportPlan(options: ChatImportOptions): ChatImportPlan {
    if (options.format === 'json') {
        return createJsonChatImportPlan(options);
    }

    if (options.format === 'jsonl') {
        return createJsonlChatImportPlan(options);
    }

    return createFailedImportPlan(
        CHAT_IMPORT_ERROR_KINDS.UNSUPPORTED_FORMAT,
        CHAT_IMPORT_UPLOAD_CLEANUP.NONE,
    );
}
