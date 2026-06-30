import path from 'node:path';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    CHAT_IMPORT_ERROR_KINDS,
    CHAT_IMPORT_UPLOAD_CLEANUP,
    createCharacterChatImportPlan,
} from '../src/endpoints/chat-import-service.js';

const FIXED_ISO_DATE = '2026-06-30T08:00:00.000Z';

function makeDirectories() {
    return {
        chats: '/data/default-user/chats',
    };
}

function makeBaseOptions(overrides = {}) {
    return {
        directories: makeDirectories(),
        avatarUrl: 'Ada',
        characterName: 'Ada',
        userName: 'User',
        timestampLabel: () => '2026-06-30 @08h00m00s',
        uploadPath: '/tmp/upload/chat-upload',
        ...overrides,
    };
}

describe('chat import service', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(FIXED_ISO_DATE));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('plans supported JSON imports as atomic character-chat writes', () => {
        const result = createCharacterChatImportPlan(makeBaseOptions({
            format: 'json',
            data: JSON.stringify({
                data_visible: [
                    ['hello', 'hi'],
                ],
            }),
        }));

        expect(result).toMatchObject({
            ok: true,
            fileNames: ['Ada - 2026-06-30 @08h00m00s imported.jsonl'],
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED,
            shouldMarkChatStatsDirty: true,
        });
        expect(result.writes).toEqual([
            expect.objectContaining({
                kind: 'atomic-write',
                filePath: path.join('/data/default-user/chats', 'Ada', 'Ada - 2026-06-30 @08h00m00s imported.jsonl'),
            }),
        ]);
        expect(result.writes[0].contents.split('\n').map(line => JSON.parse(line))).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'User', is_user: true, send_date: FIXED_ISO_DATE, mes: 'hello', extra: {} },
            { name: 'Ada', is_user: false, send_date: FIXED_ISO_DATE, mes: 'hi', extra: {} },
        ]);
    });

    test('plans CAI JSON histories as separate imported chat files', () => {
        const timestampLabels = ['first', 'second'];
        const result = createCharacterChatImportPlan(makeBaseOptions({
            format: 'json',
            timestampLabel: () => timestampLabels.shift(),
            data: JSON.stringify({
                histories: {
                    histories: [
                        { msgs: [{ src: { is_human: true }, text: 'one' }] },
                        { msgs: [{ src: { is_human: false }, text: 'two' }] },
                    ],
                },
            }),
        }));

        expect(result).toMatchObject({
            ok: true,
            fileNames: [
                'Ada - first imported.jsonl',
                'Ada - second imported.jsonl',
            ],
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED,
            shouldMarkChatStatsDirty: true,
        });
        expect(result.writes.map(write => path.basename(write.filePath))).toEqual(result.fileNames);
        expect(result.writes).toHaveLength(2);
    });

    test('classifies unsupported and malformed JSON without changing response ownership', () => {
        expect(createCharacterChatImportPlan(makeBaseOptions({
            format: 'json',
            data: JSON.stringify({ unknown: true }),
        }))).toEqual({
            ok: false,
            errorKind: CHAT_IMPORT_ERROR_KINDS.UNSUPPORTED_JSON_FORMAT,
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED,
        });

        const malformedJsonResult = createCharacterChatImportPlan(makeBaseOptions({
            format: 'json',
            data: '{',
        }));
        expect(malformedJsonResult).toMatchObject({
            ok: false,
            errorKind: CHAT_IMPORT_ERROR_KINDS.PARSE_FAILED,
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.ALREADY_CLEANED,
        });
        expect(malformedJsonResult.error).toBeInstanceOf(SyntaxError);
    });

    test('classifies unsupported top-level file types without claiming upload cleanup', () => {
        expect(createCharacterChatImportPlan(makeBaseOptions({
            format: 'txt',
            data: 'not a supported chat import',
        }))).toEqual({
            ok: false,
            errorKind: CHAT_IMPORT_ERROR_KINDS.UNSUPPORTED_FORMAT,
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.NONE,
        });
    });

    test('plans valid JSONL imports as upload copies and cleans up only after success', () => {
        const data = [
            JSON.stringify({ user_name: 'User', character_name: 'Ada' }),
            JSON.stringify({ name: 'Ada', mes: 'plain message' }),
        ].join('\n');

        const result = createCharacterChatImportPlan(makeBaseOptions({
            format: 'jsonl',
            data,
        }));

        expect(result).toEqual({
            ok: true,
            fileNames: ['Ada - 2026-06-30 @08h00m00s imported.jsonl'],
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS,
            shouldMarkChatStatsDirty: true,
            writes: [{
                kind: 'copy-upload',
                filePath: path.join('/data/default-user/chats', 'Ada', 'Ada - 2026-06-30 @08h00m00s imported.jsonl'),
                uploadPath: '/tmp/upload/chat-upload',
            }],
        });
    });

    test('plans flattened Chub JSONL imports as atomic writes', () => {
        const data = [
            JSON.stringify({ chat_metadata: {} }),
            JSON.stringify({ mes: { message: 'nested' }, swipes: [{ message: 'first' }] }),
        ].join('\n');

        const result = createCharacterChatImportPlan(makeBaseOptions({
            format: 'jsonl',
            data,
        }));

        expect(result).toMatchObject({
            ok: true,
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.AFTER_SUCCESS,
            writes: [{
                kind: 'atomic-write',
                filePath: path.join('/data/default-user/chats', 'Ada', 'Ada - 2026-06-30 @08h00m00s imported.jsonl'),
                contents: [
                    JSON.stringify({ chat_metadata: {} }),
                    JSON.stringify({ mes: 'nested', swipes: ['first'] }),
                ].join('\n'),
            }],
        });
    });

    test('keeps invalid JSONL cleanup conservative', () => {
        expect(createCharacterChatImportPlan(makeBaseOptions({
            format: 'jsonl',
            data: JSON.stringify({ unsupported: true }),
        }))).toEqual({
            ok: false,
            errorKind: CHAT_IMPORT_ERROR_KINDS.INVALID_JSONL_FORMAT,
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.NONE,
        });

        const malformedJsonlResult = createCharacterChatImportPlan(makeBaseOptions({
            format: 'jsonl',
            data: '{',
        }));
        expect(malformedJsonlResult).toMatchObject({
            ok: false,
            errorKind: CHAT_IMPORT_ERROR_KINDS.PARSE_FAILED,
            uploadCleanup: CHAT_IMPORT_UPLOAD_CLEANUP.NONE,
        });
        expect(malformedJsonlResult.error).toBeInstanceOf(SyntaxError);
    });
});
