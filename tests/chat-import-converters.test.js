import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    flattenChubChat,
    getJsonChatImportConverter,
    importAgnaiChat,
    importCAIChat,
    importKoboldLiteChat,
    importOobaChat,
    importRisuChat,
} from '../src/endpoints/chat-import-converters.js';

const FIXED_ISO_DATE = '2026-06-02T00:00:00.000Z';

function parseJsonl(jsonl) {
    return jsonl.split('\n').map(line => JSON.parse(line));
}

describe('chat import converters', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(FIXED_ISO_DATE));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('imports oobabooga visible chat pairs and skips empty sides', () => {
        const chat = parseJsonl(importOobaChat('User', 'Bot', {
            data_visible: [
                ['hello', 'hi'],
                ['', 'bot only'],
                ['user only', null],
            ],
        }));

        expect(chat).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'User', is_user: true, send_date: FIXED_ISO_DATE, mes: 'hello', extra: {} },
            { name: 'Bot', is_user: false, send_date: FIXED_ISO_DATE, mes: 'hi', extra: {} },
            { name: 'Bot', is_user: false, send_date: FIXED_ISO_DATE, mes: 'bot only', extra: {} },
            { name: 'User', is_user: true, send_date: FIXED_ISO_DATE, mes: 'user only', extra: {} },
        ]);
    });

    test('imports Agnai messages by userId presence', () => {
        const chat = parseJsonl(importAgnaiChat('User', 'Bot', {
            messages: [
                { userId: 'user-1', msg: 'from user' },
                { msg: 'from bot' },
            ],
        }));

        expect(chat).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'User', is_user: true, send_date: FIXED_ISO_DATE, mes: 'from user', extra: {} },
            { name: 'Bot', is_user: false, send_date: FIXED_ISO_DATE, mes: 'from bot', extra: {} },
        ]);
    });

    test('imports CAI Tools histories as separate chats', () => {
        expect(importCAIChat('User', 'Bot', {
            histories: {
                histories: [],
            },
        })).toEqual([]);

        const chats = importCAIChat('User', 'Bot', {
            histories: {
                histories: [
                    {
                        msgs: [
                            { src: { is_human: true }, text: 'hello' },
                            { src: { is_human: false }, text: 'hi' },
                        ],
                    },
                ],
            },
        });

        expect(chats).toHaveLength(1);
        expect(parseJsonl(chats[0])).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'User', is_user: true, send_date: FIXED_ISO_DATE, mes: 'hello', extra: {} },
            { name: 'Bot', is_user: false, send_date: FIXED_ISO_DATE, mes: 'hi', extra: {} },
        ]);
    });

    test('imports Kobold Lite using savedsettings names and prompt markers', () => {
        const chat = parseJsonl(importKoboldLiteChat('Ignored User', 'Ignored Bot', {
            savedsettings: {
                chatname: 'Kobold User',
                chatopponent: 'Kobold Bot||$||metadata',
            },
            prompt: '{{[OUTPUT]}} opening prompt',
            actions: [
                '{{[INPUT]}} user action',
                '{{[OUTPUT]}} bot action',
            ],
        }));

        expect(chat).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'Kobold Bot', is_user: false, mes: 'opening prompt', send_date: FIXED_ISO_DATE, extra: {} },
            { name: 'Kobold User', is_user: true, mes: 'user action', send_date: FIXED_ISO_DATE, extra: {} },
            { name: 'Kobold Bot', is_user: false, mes: 'bot action', send_date: FIXED_ISO_DATE, extra: {} },
        ]);
    });

    test('imports Kobold Lite with argument names when savedsettings are missing', () => {
        const chat = parseJsonl(importKoboldLiteChat('Fallback User', 'Fallback Bot', {
            actions: [
                '{{[INPUT]}} user action',
                '{{[OUTPUT]}} bot action',
            ],
        }));

        expect(chat).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'Fallback User', is_user: true, mes: 'user action', send_date: FIXED_ISO_DATE, extra: {} },
            { name: 'Fallback Bot', is_user: false, mes: 'bot action', send_date: FIXED_ISO_DATE, extra: {} },
        ]);
    });

    test('flattens Chub JSONL nested message fields and keeps unparsable lines', () => {
        const flattened = flattenChubChat('User', 'Bot', [
            JSON.stringify({
                user_name: 'User',
                mes: { message: 'nested message' },
                swipes: [
                    { message: 'first swipe' },
                    'plain swipe',
                ],
            }),
            'not-json',
        ]);

        expect(flattened.split('\n')).toEqual([
            JSON.stringify({
                user_name: 'User',
                mes: 'nested message',
                swipes: ['first swipe', 'plain swipe'],
            }),
            'not-json',
        ]);
    });

    test('imports RisuAI messages with role, name, time, and data fallbacks', () => {
        const chat = parseJsonl(importRisuChat('User', 'Bot', {
            type: 'risuChat',
            data: {
                message: [
                    { role: 'user', time: '1782921600000', data: 'from user' },
                    { role: 'assistant', name: 'Custom Bot', data: 'from bot' },
                    { role: 'assistant' },
                ],
            },
        }));

        expect(chat).toEqual([
            { chat_metadata: {}, user_name: 'unused', character_name: 'unused' },
            { name: 'User', is_user: true, send_date: '2026-07-01T16:00:00.000Z', mes: 'from user', extra: {} },
            { name: 'Custom Bot', is_user: false, send_date: FIXED_ISO_DATE, mes: 'from bot', extra: {} },
            { name: 'Bot', is_user: false, send_date: FIXED_ISO_DATE, mes: '', extra: {} },
        ]);
    });

    test('selects JSON import converters in the existing branch order', () => {
        expect(getJsonChatImportConverter({ savedsettings: {}, histories: {}, data_visible: [], messages: [], type: 'risuChat' }))
            .toBe(importKoboldLiteChat);
        expect(getJsonChatImportConverter({ histories: {}, data_visible: [], messages: [], type: 'risuChat' }))
            .toBe(importCAIChat);
        expect(getJsonChatImportConverter({ data_visible: [], messages: [], type: 'risuChat' }))
            .toBe(importOobaChat);
        expect(getJsonChatImportConverter({ messages: [], type: 'risuChat' }))
            .toBe(importAgnaiChat);
        expect(getJsonChatImportConverter({ type: 'risuChat' }))
            .toBe(importRisuChat);
        expect(getJsonChatImportConverter({ unknown: true })).toBeNull();
    });
});
