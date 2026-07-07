import { describe, expect, jest, test } from '@jest/globals';

import {
    createCharacterCard,
    deleteCharacterCard,
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
    canonicalResult = null,
    repairResult = { ok: true },
    includeCanonicalSeam = true,
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
        invalidateCanonicalAudit: jest.fn((handle, directories, source) => calls.push(['invalidate-audit', handle, directories, source])),
        invalidateThumbnail: jest.fn((directories, type, avatar) => calls.push(['invalidate-thumb', type, avatar])),
        bustCache: jest.fn(() => calls.push(['cache-bust'])),
    };

    if (includeCanonicalSeam) {
        dependencies.performCanonicalWrite = jest.fn(async (operation, payload) => {
            calls.push(['canonical-write', operation, payload]);
            return canonicalResult;
        });
        dependencies.recordProjectionRepair = jest.fn(async repair => {
            calls.push(['repair', repair]);
            return repairResult;
        });
    }

    return { calls, dependencies };
}

describe('character write service', () => {
    test('creates a default-avatar character card without touching the retired index', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({ includeCanonicalSeam: false });

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
            ['write', 'default-avatar.png', '{"name":"Tester"}', 'Tester', undefined, {}],
        ]);
    });

    test('uses canonical authority first for create when the write seam is enabled', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:create:Tester.png',
            },
        });

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
        expect(calls).toEqual([
            ['mkdir', 'user/chats/Tester'],
            ['canonical-write', 'create', expect.objectContaining({
                avatarName: 'Tester.png',
                internalName: 'Tester',
                characterData: '{"name":"Tester"}',
            })],
            ['write', 'default-avatar.png', '{"name":"Tester"}', 'Tester', undefined, { skipCanonicalAuditInvalidation: true }],
        ]);
    });

    test('creates an uploaded-avatar character card and cleans up the upload without touching the retired index', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Uploaded'],
            includeCanonicalSeam: false,
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
            ['write', 'tmp/upload.tmp', '{"name":"Uploaded"}', 'Uploaded', crop, {}],
            ['unlink', 'tmp/upload.tmp'],
        ]);
    });

    test('does not refresh the index or claim success when create write fails', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({ writeResult: false, includeCanonicalSeam: false });

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
            ['write', 'default-avatar.png', '{"name":"Broken"}', 'Broken', undefined, {}],
        ]);
    });

    test('records a repair intent instead of treating files as authority when create projection fails after canonical commit', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            writeResult: false,
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:create:Broken.png',
            },
        });

        const result = await createCharacterCard({
            request,
            body: { ch_name: 'Broken' },
            dependencies,
        });

        expect(result).toEqual({
            ok: false,
            reason: 'projection_failed',
            message: 'Error: character data committed to canonical storage but compatibility projection failed',
            avatarName: 'Broken.png',
            repairKey: 'repair:create:Broken.png',
            authorityCommitted: true,
        });
        expect(calls).toEqual([
            ['mkdir', 'user/chats/Broken'],
            ['canonical-write', 'create', expect.objectContaining({
                avatarName: 'Broken.png',
                internalName: 'Broken',
            })],
            ['write', 'default-avatar.png', '{"name":"Broken"}', 'Broken', undefined, { skipCanonicalAuditInvalidation: true }],
            ['repair', expect.objectContaining({
                repairKey: 'repair:create:Broken.png',
                repairType: 'character_projection',
                avatarName: 'Broken.png',
                reason: 'projection_failed',
                operation: 'create',
                details: expect.objectContaining({
                    internalName: 'Broken',
                    chatsDirectoryName: 'Broken',
                    sourceImage: 'default-avatar.png',
                }),
            })],
        ]);
    });

    test('does not silently fall back to file writes when canonical authority blocks in strict mode', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const error = new Error('Canonical write blocked: projection_repair_pending');
        const { dependencies } = makeDependencies();
        dependencies.performCanonicalWrite.mockRejectedValue(error);

        await expect(createCharacterCard({
            request,
            body: { ch_name: 'Blocked' },
            dependencies,
        })).rejects.toThrow('Canonical write blocked: projection_repair_pending');

        expect(dependencies.writeCharacterData).not.toHaveBeenCalled();
    });

    test('edits card data without replacing the avatar or regenerating thumbnails', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/characters/Tester.png'],
            includeCanonicalSeam: false,
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
        ]);
    });

    test('uses canonical authority first for edit when the write seam is enabled', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/characters/Tester.png'],
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:edit:Tester.png',
            },
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

        expect(result).toEqual({ ok: true, avatarName: 'Tester.png' });
        expect(calls[0]).toEqual(['canonical-write', 'edit', expect.objectContaining({
            avatarName: 'Tester.png',
            internalName: 'Tester',
        })]);
    });

    test('edits a replacement avatar by cleaning up upload and busting cache without touching the retired index', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const response = {};
        const crop = { want_resize: true };
        const { calls, dependencies } = makeDependencies({ includeCanonicalSeam: false });

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
            ['write', 'tmp/avatar.tmp', '{"name":"Tester"}', 'Tester', crop, {}],
            ['unlink', 'tmp/avatar.tmp'],
            ['cache-bust'],
        ]);
    });

    test('renames a card by deleting the old file without touching the retired index', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Old'],
            includeCanonicalSeam: false,
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
            ['write', 'user/characters/Old.png', '{"name":"New","data":{"name":"New"}}', 'New', undefined, {}],
            ['copy', 'user/chats/Old', 'user/chats/New'],
            ['remove-dir', 'user/chats/Old'],
            ['unlink', 'user/characters/Old.png'],
        ]);
    });

    test('uses canonical authority first for rename when the write seam is enabled', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Old'],
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:rename:New.png',
            },
        });

        const result = await renameCharacterCard({
            request,
            body: {
                avatar_url: 'Old.png',
                new_name: 'New',
            },
            dependencies,
        });

        expect(result).toEqual({ ok: true, avatarName: 'New.png' });
        expect(calls).toContainEqual(['canonical-write', 'rename', expect.objectContaining({
            oldAvatarName: 'Old.png',
            newAvatarName: 'New.png',
            oldInternalName: 'Old',
            newInternalName: 'New',
        })]);
    });

    test('does not copy chats or delete the old avatar when rename write fails', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Old'],
            writeResult: false,
            includeCanonicalSeam: false,
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
            ['write', 'user/characters/Old.png', '{"name":"New","data":{"name":"New"}}', 'New', undefined, {}],
        ]);
    });

    test('deletes the compatibility file and invalidates audit without touching the retired index when canonical writes are disabled', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/characters/Tester.png'],
            includeCanonicalSeam: false,
        });

        const result = await deleteCharacterCard({
            request,
            avatarName: 'Tester.png',
            deleteChats: false,
            dependencies,
        });

        expect(result).toEqual({ ok: true, avatarName: 'Tester.png' });
        expect(calls).toEqual([
            ['unlink', 'user/characters/Tester.png'],
            ['invalidate-thumb', 'avatar', 'Tester.png'],
            ['invalidate-audit', 'default-user', directories, 'character_delete:Tester.png'],
        ]);
    });

    test('uses canonical authority first for delete when the write seam is enabled', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/characters/Tester.png'],
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:delete:Tester.png',
            },
        });

        const result = await deleteCharacterCard({
            request,
            avatarName: 'Tester.png',
            deleteChats: false,
            dependencies,
        });

        expect(result).toEqual({ ok: true, avatarName: 'Tester.png' });
        expect(calls[0]).toEqual(['canonical-write', 'delete', expect.objectContaining({
            avatarName: 'Tester.png',
        })]);
        expect(calls).not.toContainEqual(['invalidate-audit', 'default-user', directories, 'character_delete:Tester.png']);
    });

    test('records a repair intent when delete projection fails after canonical commit', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/characters/Tester.png'],
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:delete:Tester.png',
            },
        });
        dependencies.unlinkFile.mockImplementation(() => {
            throw new Error('unlink failed');
        });

        const result = await deleteCharacterCard({
            request,
            avatarName: 'Tester.png',
            deleteChats: true,
            dependencies,
        });

        expect(result).toEqual({
            ok: false,
            reason: 'projection_failed',
            message: 'Error: character data committed to canonical storage but compatibility projection failed',
            avatarName: 'Tester.png',
            repairKey: 'repair:delete:Tester.png',
            authorityCommitted: true,
        });
        expect(calls).toContainEqual(['repair', expect.objectContaining({
            repairKey: 'repair:delete:Tester.png',
            repairType: 'character_projection',
            avatarName: 'Tester.png',
            operation: 'delete',
            details: expect.objectContaining({
                avatarName: 'Tester.png',
                deleteChats: true,
                chatsDirectoryName: 'Tester',
                sourceAvatarPath: 'user/characters/Tester.png',
            }),
        })]);
    });

    test('records rename repair metadata that is sufficient for projection replay', async () => {
        const directories = {
            characters: 'user/characters',
            chats: 'user/chats',
        };
        const request = makeRequest(directories);
        const { calls, dependencies } = makeDependencies({
            existingPaths: ['user/chats/Old'],
            writeResult: false,
            canonicalResult: {
                enabled: true,
                authorityCommitted: true,
                repairKey: 'repair:rename:New.png',
            },
        });

        const result = await renameCharacterCard({
            request,
            body: {
                avatar_url: 'Old.png',
                new_name: 'New',
            },
            dependencies,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            reason: 'projection_failed',
            avatarName: 'New.png',
        }));
        expect(calls).toContainEqual(['repair', expect.objectContaining({
            repairKey: 'repair:rename:New.png',
            operation: 'rename',
            details: expect.objectContaining({
                oldAvatarName: 'Old.png',
                newAvatarName: 'New.png',
                oldInternalName: 'Old',
                newInternalName: 'New',
                oldChatsPath: 'user/chats/Old',
                newChatsPath: 'user/chats/New',
                sourceImage: 'user/characters/Old.png',
            }),
        })]);
    });
});
