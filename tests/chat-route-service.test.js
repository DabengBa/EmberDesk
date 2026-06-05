import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
    readRecentChatPayload,
    searchChatPayload,
} from '../src/endpoints/chat-route-service.js';

const tempRoots = [];

function makeDirectories(prefix = 'emberdesk-chat-route-service-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const directories = {
        root,
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        groupChats: path.join(root, 'group chats'),
        groups: path.join(root, 'groups'),
    };
    for (const directory of Object.values(directories)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    tempRoots.push(root);
    return directories;
}

function writeFile(filePath, contents = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
}

function createDependencies(overrides = {}) {
    return {
        fs,
        path,
        getChatInfo: jest.fn(async (filePath, additionalData = {}, withMetadata = false, matcher = null) => {
            const fileId = path.basename(filePath, '.jsonl');
            const text = fs.readFileSync(filePath, 'utf8');
            const lines = text ? text.trim().split('\n') : [];
            const messages = lines.slice(1).map(line => JSON.parse(line).mes ?? '');
            const matched = typeof matcher === 'function' ? matcher(messages) : true;

            return {
                file_id: fileId,
                file_name: `${fileId}.jsonl`,
                file_size: `${text.length} B`,
                chat_items: Math.max(lines.length - 1, 0),
                mes: messages.at(-1) ?? '[The chat is empty]',
                last_mes: fileId,
                match: matched,
                ...(withMetadata ? { chat_metadata: { title: fileId } } : {}),
                ...additionalData,
            };
        }),
        warn: jest.fn(),
        ...overrides,
    };
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
});

describe('chat route service', () => {
    test('searches character chat files by message fragments and file name fallback', async () => {
        const directories = makeDirectories();
        const adaChats = path.join(directories.chats, 'Ada');
        writeFile(path.join(adaChats, 'logic-session.jsonl'), '{"chat_metadata":{}}\n{"mes":"hello analytical engine"}');
        writeFile(path.join(adaChats, 'empty-match.jsonl'), '');

        const result = await searchChatPayload({
            directories,
            query: 'logic',
            avatarUrl: 'Ada.png',
            dependencies: createDependencies(),
        });

        expect(result).toEqual([
            {
                file_name: 'logic-session',
                file_size: '54 B',
                message_count: 1,
                last_mes: 'logic-session',
                preview_message: 'hello analytical engine',
            },
        ]);
    });

    test('searches group chat IDs while skipping corrupt group JSON and missing files', async () => {
        const directories = makeDirectories();
        writeFile(path.join(directories.groups, 'broken.json'), '{');
        writeFile(path.join(directories.groups, 'target.json'), JSON.stringify({
            id: 'group-1',
            chats: ['shared', 'missing'],
        }));
        writeFile(path.join(directories.groupChats, 'shared.jsonl'), '{"chat_metadata":{}}\n{"mes":"shared group memory"}');

        const dependencies = createDependencies();
        const result = await searchChatPayload({
            directories,
            query: 'memory',
            groupId: 'group-1',
            dependencies,
        });

        expect(result).toEqual([
            expect.objectContaining({
                file_name: 'shared',
                message_count: 1,
                preview_message: 'shared group memory',
            }),
        ]);
        expect(dependencies.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'), expect.anything(), expect.anything());
    });

    test('returns recent character, group, and root chats with pinned chats first and metadata preserved', async () => {
        const directories = makeDirectories();
        writeFile(path.join(directories.characters, 'Ada.png'), 'png');
        writeFile(path.join(directories.chats, 'Ada', 'ada-old.jsonl'), '{"chat_metadata":{}}\n{"mes":"ada old"}');
        writeFile(path.join(directories.groupChats, 'group-chat.jsonl'), '{"chat_metadata":{}}\n{"mes":"group recent"}');
        writeFile(path.join(directories.groups, 'group.json'), JSON.stringify({
            id: 'group-1',
            chats: ['group-chat'],
        }));
        writeFile(path.join(directories.chats, 'root.jsonl'), '{"chat_metadata":{}}\n{"mes":"root recent"}');

        const oldDate = new Date('2026-01-01T00:00:00Z');
        const middleDate = new Date('2026-01-02T00:00:00Z');
        const newDate = new Date('2026-01-03T00:00:00Z');
        fs.utimesSync(path.join(directories.chats, 'Ada', 'ada-old.jsonl'), oldDate, oldDate);
        fs.utimesSync(path.join(directories.groupChats, 'group-chat.jsonl'), middleDate, middleDate);
        fs.utimesSync(path.join(directories.chats, 'root.jsonl'), newDate, newDate);

        const dependencies = createDependencies();
        const result = await readRecentChatPayload({
            directories,
            pinned: [{ file_name: 'ada-old.jsonl', avatar: 'Ada.png' }],
            max: 2,
            metadata: true,
            dependencies,
        });

        expect(result.map(chat => chat.file_name)).toEqual(['ada-old.jsonl', 'root.jsonl', 'group-chat.jsonl']);
        expect(result[0]).toMatchObject({ avatar: 'Ada.png', chat_metadata: { title: 'ada-old' } });
        expect(result[2]).toMatchObject({ group: 'group-1', chat_metadata: { title: 'group-chat' } });
        expect(dependencies.getChatInfo).toHaveBeenCalledWith(expect.stringContaining('ada-old.jsonl'), { avatar: 'Ada.png' }, true);
    });
});
