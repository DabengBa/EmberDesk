import { describe, expect, jest, test } from '@jest/globals';

import {
    createCharacterCard,
    editCharacterCard,
    renameCharacterCard,
} from '../src/endpoints/character-write-service.js';

function makeRequest(directories) {
    return {
        user: {
            directories,
            profile: { handle: 'default-user' },
        },
    };
}

function makeDependencies({
    existingPaths = [],
    writeResult = true,
    rawCharacterData = '{"name":"Old","data":{"name":"Old"}}',
} = {}) {
    const calls = [];
    const existing = new Set(existingPaths);
    const joinPath = (...parts) => parts.join('/');

    const dependencies = {
        defaultAvatarPath: 'default-avatar.png',
        sanitizeName: jest.fn(value => value.replace(/[^\w.-]/g, '')),
        formatCharacterData: jest.fn(body => ({ name: body.ch_name })),
        getPngName: jest.fn(name => name),
        writeCharacterData: jest.fn(async (inputFile, data, outputFile, request, crop, options) => {
            calls.push(['write', inputFile, data, outputFile, crop, options]);
            return writeResult;
        }),
        fileExists: jest.fn(target => existing.has(target)),
        makeDirectory: jest.fn(target => calls.push(['mkdir', target])),
        unlinkFile: jest.fn(target => calls.push(['unlink', target])),
        copyDirectory: jest.fn((from, to) => calls.push(['copy', from, to])),
        removeDirectory: jest.fn(target => calls.push(['remove-dir', target])),
        joinPath,
        parsePath: target => ({ name: target.replace(/\.png$/i, '') }),
        readCharacterData: jest.fn(async target => {
            calls.push(['read', target]);
            return rawCharacterData;
        }),
        getCharaCardV2: jest.fn(value => value),
        setValue: jest.fn((target, key, value) => {
            calls.push(['set', key, value]);
            const path = key.split('.');
            let current = target;
            for (const segment of path.slice(0, -1)) {
                current[segment] ??= {};
                current = current[segment];
            }
            current[path.at(-1)] = value;
        }),
        refreshCharacterIndexEntry: jest.fn(async (_directories, avatar, operation) => calls.push(['refresh-index', avatar, operation])),
        deleteCharacterIndexEntry: jest.fn((_directories, avatar, operation) => calls.push(['delete-index', avatar, operation])),
        bustCache: jest.fn(() => calls.push(['cache-bust'])),
    };

    return { calls, dependencies };
}

describe('character write service', () => {
    test('creates a default-avatar character card and refreshes the index after the write', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies();

        const result = await createCharacterCard({
            request,
            body: { ch_name: 'Tester' },
            dependencies,
        });

        expect(result).toEqual({
            ok: true,
            avatarName: 'Tester.png',
            internalName: 'Tester',
        });
        expect(dependencies.formatCharacterData).toHaveBeenCalledWith({ ch_name: 'Tester' }, directories);
        expect(calls).toEqual([
            ['mkdir', 'user/chats/Tester'],
            ['write', 'default-avatar.png', '{"name":"Tester"}', 'Tester', undefined, undefined],
            ['refresh-index', 'Tester.png', 'create'],
        ]);
    });

    test('creates an uploaded-avatar character card, cleans up the upload, then refreshes the index', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Uploaded'],
        });
        const crop = { x: 1, y: 2, width: 3, height: 4 };

        const result = await createCharacterCard({
            request,
            body: { ch_name: 'Uploaded' },
            file: { destination: 'tmp', filename: 'upload.tmp' },
            crop,
            dependencies,
        });

        expect(result).toMatchObject({ ok: true, avatarName: 'Uploaded.png' });
        expect(calls).toEqual([
            ['write', 'tmp/upload.tmp', '{"name":"Uploaded"}', 'Uploaded', crop, undefined],
            ['unlink', 'tmp/upload.tmp'],
            ['refresh-index', 'Uploaded.png', 'create'],
        ]);
    });

    test('does not refresh the index or claim success when create write fails', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({ writeResult: false });

        const result = await createCharacterCard({
            request,
            body: { ch_name: 'Broken' },
            dependencies,
        });

        expect(result).toEqual({
            ok: false,
            reason: 'write_failed',
            message: 'Error: failed to write character data',
            avatarName: 'Broken.png',
        });
        expect(calls).toEqual([
            ['mkdir', 'user/chats/Broken'],
            ['write', 'default-avatar.png', '{"name":"Broken"}', 'Broken', undefined, undefined],
        ]);
    });

    test('edits card data without replacing the avatar or regenerating thumbnails', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/characters/Tester.png'],
        });

        const result = await editCharacterCard({
            request,
            body: {
                avatar_url: 'Tester.png',
                ch_name: 'Tester',
                chat: 'existing-chat',
                create_date: '2026-06-09T00:00:00.000Z',
            },
            dependencies,
        });

        expect(result).toEqual({
            ok: true,
            avatarName: 'Tester.png',
        });
        expect(calls).toEqual([
            [
                'write',
                'user/characters/Tester.png',
                '{"name":"Tester","chat":"existing-chat","create_date":"2026-06-09T00:00:00.000Z"}',
                'Tester',
                undefined,
                { shouldRegenerateThumbnail: false },
            ],
            ['refresh-index', 'Tester.png', 'edit'],
        ]);
    });

    test('edits a replacement avatar by cleaning up upload, busting cache, then refreshing the index', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const response = {};
        const crop = { want_resize: true };
        const { calls, dependencies } = makeDependencies();

        const result = await editCharacterCard({
            request,
            response,
            body: {
                avatar_url: 'Tester.png',
                ch_name: 'Tester',
            },
            file: { destination: 'tmp', filename: 'avatar.tmp' },
            crop,
            dependencies,
        });

        expect(result).toEqual({
            ok: true,
            avatarName: 'Tester.png',
        });
        expect(dependencies.bustCache).toHaveBeenCalledWith(request, response);
        expect(calls).toEqual([
            ['write', 'tmp/avatar.tmp', '{"name":"Tester"}', 'Tester', crop, undefined],
            ['unlink', 'tmp/avatar.tmp'],
            ['cache-bust'],
            ['refresh-index', 'Tester.png', 'edit'],
        ]);
    });

    test('renames a card by deleting the old file and index row before refreshing the new row', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Old'],
        });

        const result = await renameCharacterCard({
            request,
            body: {
                avatar_url: 'Old.png',
                new_name: 'New',
            },
            dependencies,
        });

        expect(result).toEqual({
            ok: true,
            avatarName: 'New.png',
        });
        expect(calls).toEqual([
            ['read', 'user/characters/Old.png'],
            ['set', 'data.name', 'New'],
            ['set', 'name', 'New'],
            ['write', 'user/characters/Old.png', '{"name":"New","data":{"name":"New"}}', 'New', undefined, undefined],
            ['copy', 'user/chats/Old', 'user/chats/New'],
            ['remove-dir', 'user/chats/Old'],
            ['unlink', 'user/characters/Old.png'],
            ['delete-index', 'Old.png', 'rename'],
            ['refresh-index', 'New.png', 'rename'],
        ]);
    });

    test('does not copy chats, delete the old avatar, or refresh indexes when rename write fails', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Old'],
            writeResult: false,
        });

        const result = await renameCharacterCard({
            request,
            body: {
                avatar_url: 'Old.png',
                new_name: 'New',
            },
            dependencies,
        });

        expect(result).toEqual({
            ok: false,
            reason: 'write_failed',
            message: 'Error: failed to write character data',
            avatarName: 'New.png',
        });
        expect(calls).toEqual([
            ['read', 'user/characters/Old.png'],
            ['set', 'data.name', 'New'],
            ['set', 'name', 'New'],
            ['write', 'user/characters/Old.png', '{"name":"New","data":{"name":"New"}}', 'New', undefined, undefined],
        ]);
    });
});
