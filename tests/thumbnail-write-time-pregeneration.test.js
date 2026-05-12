import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tempRoots = [];

function makeUserDirectories(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);

    const directories = {
        root,
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        avatars: path.join(root, 'User Avatars'),
        thumbnailsAvatar: path.join(root, 'thumbnails', 'avatar'),
        thumbnailsPersona: path.join(root, 'thumbnails', 'persona'),
        thumbnailsBg: path.join(root, 'thumbnails', 'bg'),
    };

    for (const dir of Object.values(directories)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return directories;
}

async function importCharacterRoutes({ generateThumbnailImpl, thumbnailsEnabled = true } = {}) {
    jest.resetModules();

    const mockGenerateThumbnail = jest.fn(generateThumbnailImpl ?? (() => Promise.resolve({ path: 'thumb.png', aspectRatio: 1, resolution: 1 })));
    const mockInvalidateThumbnail = jest.fn();
    const mockRefreshCharacterIndexEntrySafe = jest.fn(async () => {});
    const mockDeleteCharacterIndexEntrySafe = jest.fn();
    const mockUpsertCharacterIndexEntry = jest.fn();
    const mockBuildCharacterIndexRow = jest.fn();
    const mockApplyInteractionPerfHeaders = jest.fn();
    const mockProcessCharacter = jest.fn(async () => ({ name: 'Character' }));
    const mockToShallow = jest.fn(character => character);
    const mockGetFreshIndexedCharacterFullPayload = jest.fn(() => null);
    const mockListIndexedCharacterPayloads = jest.fn(async () => []);
    const mockWrite = jest.fn(() => Buffer.from('character-png'));
    const mockParse = jest.fn(async () => '{"spec":"chara_card_v2","data":{"name":"Character"}}');

    jest.unstable_mockModule('../src/util.js', () => ({
        deepMerge: (target, source) => ({ ...target, ...source }),
        humanizedDateTime: () => '2026-05-13',
        tryParse: () => undefined,
        MemoryLimitedMap: class MemoryLimitedMap extends Map {
            constructor() {
                super();
            }
        },
        getConfigValue: (key, defaultValue) => {
            switch (key) {
                case 'performance.lazyLoadCharacters':
                    return false;
                case 'performance.useDiskCache':
                    return false;
                case 'performance.memoryCacheCapacity':
                    return '100mb';
                default:
                    return defaultValue;
            }
        },
        mutateJsonString: value => value,
        clientRelativePath: (_root, inputPath) => inputPath,
        getUniqueName: (baseName) => baseName,
        sanitizeSafeCharacterReplacements: () => '_',
    }));

    jest.unstable_mockModule('../src/jimp.js', () => ({
        Jimp: class FakeJimp {
            constructor() {
                this.bitmap = { width: 64, height: 64 };
            }

            static async read() {
                return new FakeJimp();
            }

            static async fromBuffer() {
                return new FakeJimp();
            }

            crop() {}
            cover() {}
            resize() {}
            async getBuffer() {
                return Buffer.from('cropped');
            }
        },
        JimpMime: { png: 'image/png' },
    }));

    jest.unstable_mockModule('../src/character-card-parser.js', () => ({
        parse: mockParse,
        read: () => '{"spec":"chara_card_v2","data":{"name":"Character"}}',
        write: mockWrite,
    }));

    jest.unstable_mockModule('../src/constants.js', () => ({
        AVATAR_WIDTH: 400,
        AVATAR_HEIGHT: 600,
        DEFAULT_AVATAR_PATH: path.join(repoRoot, 'public/img/ai4.png'),
    }));

    jest.unstable_mockModule('../src/middleware/validateFileName.js', () => ({
        default: (_request, _response, next) => next(),
        getFileNameValidationFunction: () => (_request, _response, next) => next(),
        forbiddenRegExp: /[<>:"|?*]/,
    }));

    jest.unstable_mockModule('../src/validator/TavernCardValidator.js', () => ({
        TavernCardValidator: class {
            validate() { return true; }
            get lastValidationError() { return null; }
        },
    }));

    jest.unstable_mockModule('../src/endpoints/worldinfo.js', () => ({
        readWorldInfoFile: async () => ({}),
    }));

    jest.unstable_mockModule('../src/endpoints/thumbnails.js', () => ({
        areThumbnailsEnabled: () => thumbnailsEnabled,
        invalidateThumbnail: mockInvalidateThumbnail,
        generateThumbnail: mockGenerateThumbnail,
    }));

    jest.unstable_mockModule('../src/endpoints/sprites.js', () => ({
        importRisuSprites: () => {},
    }));

    jest.unstable_mockModule('../src/users.js', () => ({
        getUserDirectories: () => ({}),
    }));

    jest.unstable_mockModule('../src/endpoints/chats.js', () => ({
        getChatInfo: async () => ({}),
    }));

    jest.unstable_mockModule('../src/byaf.js', () => ({
        ByafParser: class {},
    }));

    jest.unstable_mockModule('../src/charx.js', () => ({
        CharXParser: class {},
        persistCharXAssets: () => ({}),
    }));

    jest.unstable_mockModule('../src/middleware/cacheBuster.js', () => ({
        default: { bust: jest.fn() },
    }));

    jest.unstable_mockModule('../src/endpoints/character-index.js', () => ({
        deleteCharacterIndexEntry: mockDeleteCharacterIndexEntrySafe,
        getFreshIndexedCharacterFullPayload: mockGetFreshIndexedCharacterFullPayload,
        isCharacterIndexSupported: () => false,
        listIndexedCharacterPayloads: mockListIndexedCharacterPayloads,
        upsertCharacterIndexEntry: mockUpsertCharacterIndexEntry,
    }));

    jest.unstable_mockModule('node-persist', () => ({
        default: { create: async () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getDatumPath: () => 'datum' }) },
    }));

    jest.unstable_mockModule('write-file-atomic', () => ({
        sync: (targetPath, data) => fs.writeFileSync(targetPath, data),
    }));

    const module = await import('../src/endpoints/characters.js');
    return {
        router: module.router,
        mocks: {
            generateThumbnail: mockGenerateThumbnail,
            invalidateThumbnail: mockInvalidateThumbnail,
            refreshCharacterIndexEntrySafe: mockRefreshCharacterIndexEntrySafe,
            write: mockWrite,
        },
    };
}

async function importAvatarRoutes({ generateThumbnailImpl, thumbnailsEnabled = true } = {}) {
    jest.resetModules();

    const mockGenerateThumbnail = jest.fn(generateThumbnailImpl ?? (() => Promise.resolve({ path: 'thumb.png', aspectRatio: 1, resolution: 1 })));
    const mockInvalidateThumbnail = jest.fn();
    const mockBust = jest.fn();

    jest.unstable_mockModule('../src/jimp.js', () => ({
        Jimp: class FakeJimp {
            static async read() {
                return {
                    bitmap: { width: 64, height: 64 },
                    crop() {},
                    cover() {},
                    resize() {},
                    async getBufferAsync() {
                        return Buffer.from('persona-image');
                    },
                };
            }
        },
    }));

    jest.unstable_mockModule('../src/util.js', () => ({
        getImages: () => [],
        tryParse: () => undefined,
    }));

    jest.unstable_mockModule('../src/middleware/validateFileName.js', () => ({
        getFileNameValidationFunction: () => (_request, _response, next) => next(),
    }));

    jest.unstable_mockModule('../src/endpoints/characters.js', () => ({
        applyAvatarCropResize: async () => Buffer.from('persona-image'),
    }));

    jest.unstable_mockModule('../src/endpoints/thumbnails.js', () => ({
        areThumbnailsEnabled: () => thumbnailsEnabled,
        invalidateThumbnail: mockInvalidateThumbnail,
        generateThumbnail: mockGenerateThumbnail,
    }));

    jest.unstable_mockModule('../src/middleware/cacheBuster.js', () => ({
        default: { bust: mockBust },
    }));

    jest.unstable_mockModule('write-file-atomic', () => ({
        sync: (targetPath, data) => fs.writeFileSync(targetPath, data),
    }));

    const module = await import('../src/endpoints/avatars.js');
    return {
        router: module.router,
        mocks: {
            generateThumbnail: mockGenerateThumbnail,
            invalidateThumbnail: mockInvalidateThumbnail,
            bust: mockBust,
        },
    };
}

async function invokeRoute(router, method, routePath, request) {
    const layer = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods?.[method]);
    if (!layer) {
        throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
    }

    const response = {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
    };

    await new Promise((resolve, reject) => {
        let index = 0;
        const next = (error) => {
            if (error) {
                reject(error);
                return;
            }

            const handler = layer.route.stack[index++]?.handle;
            if (!handler) {
                resolve();
                return;
            }

            Promise.resolve(handler(request, response, next))
                .then(() => {
                    if (handler.length < 3) {
                        resolve();
                    }
                })
                .catch(reject);
        };

        next();
    });

    return response;
}

afterEach(() => {
    while (tempRoots.length > 0) {
        const root = tempRoots.pop();
        fs.rmSync(root, { recursive: true, force: true });
    }
    jest.resetModules();
    jest.clearAllMocks();
});

describe('thumbnail write-time pregeneration hooks', () => {
    test('character create kicks off avatar pregeneration without awaiting it', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-character-');
        let sawWrittenCharacter = false;
        const { router, mocks } = await importCharacterRoutes({
            generateThumbnailImpl: () => {
                sawWrittenCharacter = fs.existsSync(path.join(directories.characters, 'Tester.png'));
                return new Promise(() => {});
            },
        });
        const request = {
            body: {
                ch_name: 'Tester',
                description: '',
                personality: '',
                scenario: '',
                first_mes: '',
                mes_example: '',
                creator_notes: '',
                system_prompt: '',
                post_history_instructions: '',
                tags: '',
                creator: '',
                talkativeness: 0.5,
                fav: false,
                world: '',
                depth_prompt_prompt: '',
                depth_prompt_depth: 4,
                depth_prompt_role: 'system',
                alternate_greetings: [],
                group_only_greetings: [],
                extensions: '{}',
            },
            file: undefined,
            query: {},
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/create', request);

        expect(response.body).toBe('Tester.png');
        expect(sawWrittenCharacter).toBe(true);
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Tester.png', true, false);
    });

    test('character create remains successful when avatar pregeneration rejects', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const directories = makeUserDirectories('emberdesk-pregen-character-failure-');
        const { router, mocks } = await importCharacterRoutes({
            generateThumbnailImpl: async () => {
                throw new Error('pregeneration failed');
            },
        });
        const request = {
            body: {
                ch_name: 'Resilient',
                description: '',
                personality: '',
                scenario: '',
                first_mes: '',
                mes_example: '',
                creator_notes: '',
                system_prompt: '',
                post_history_instructions: '',
                tags: '',
                creator: '',
                talkativeness: 0.5,
                fav: false,
                world: '',
                depth_prompt_prompt: '',
                depth_prompt_depth: 4,
                depth_prompt_role: 'system',
                alternate_greetings: [],
                group_only_greetings: [],
                extensions: '{}',
            },
            file: undefined,
            query: {},
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/create', request);
        await Promise.resolve();

        expect(response.body).toBe('Resilient.png');
        expect(fs.existsSync(path.join(directories.characters, 'Resilient.png'))).toBe(true);
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Resilient.png', true, false);
        expect(warnSpy).toHaveBeenCalledWith('Thumbnail pregeneration skipped for avatar/Resilient.png:', expect.any(Error));
        warnSpy.mockRestore();
    });

    test('character create skips pregeneration when thumbnails are disabled', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-disabled-character-');
        const { router, mocks } = await importCharacterRoutes({
            thumbnailsEnabled: false,
        });
        const request = {
            body: {
                ch_name: 'Disabled',
                description: '',
                personality: '',
                scenario: '',
                first_mes: '',
                mes_example: '',
                creator_notes: '',
                system_prompt: '',
                post_history_instructions: '',
                tags: '',
                creator: '',
                talkativeness: 0.5,
                fav: false,
                world: '',
                depth_prompt_prompt: '',
                depth_prompt_depth: 4,
                depth_prompt_role: 'system',
                alternate_greetings: [],
                group_only_greetings: [],
                extensions: '{}',
            },
            file: undefined,
            query: {},
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/create', request);

        expect(response.body).toBe('Disabled.png');
        expect(mocks.generateThumbnail).not.toHaveBeenCalled();
    });

    test('duplicate kicks off avatar pregeneration for the copied character', async () => {
        const { router, mocks } = await importCharacterRoutes();
        const directories = makeUserDirectories('emberdesk-pregen-duplicate-');
        const sourcePath = path.join(directories.characters, 'tester.png');
        fs.writeFileSync(sourcePath, Buffer.from('png'));
        const request = {
            body: { avatar_url: 'tester.png' },
            user: { directories, profile: { handle: 'default-user' } },
        };

        const response = await invokeRoute(router, 'post', '/duplicate', request);

        expect(response.body).toEqual({ path: 'tester_1.png' });
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'tester_1.png', true, false);
    });

    test('character avatar overwrite invalidates the previous thumbnail before pregeneration', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-edit-avatar-');
        const { router, mocks } = await importCharacterRoutes();
        const uploadPath = path.join(directories.root, 'upload.tmp');
        const characterPath = path.join(directories.characters, 'Tester.png');
        fs.writeFileSync(uploadPath, Buffer.from('upload'));
        fs.writeFileSync(characterPath, Buffer.from('png'));
        const request = {
            body: { avatar_url: 'Tester.png' },
            file: { destination: directories.root, filename: 'upload.tmp' },
            query: {},
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/edit-avatar', request);

        expect(response.statusCode).toBe(200);
        expect(mocks.invalidateThumbnail).toHaveBeenCalledTimes(1);
        expect(mocks.invalidateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Tester.png');
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Tester.png', true, false);
        expect(mocks.invalidateThumbnail.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateThumbnail.mock.invocationCallOrder[0]);
    });

    test('character metadata edit without a new upload does not invalidate or pregenerate thumbnails', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-edit-metadata-');
        const { router, mocks } = await importCharacterRoutes();
        const avatarPath = path.join(directories.characters, 'Tester.png');
        fs.writeFileSync(avatarPath, Buffer.from('png'));
        const request = {
            body: {
                avatar_url: 'Tester.png',
                ch_name: 'Tester',
                description: 'updated',
                personality: '',
                scenario: '',
                first_mes: '',
                mes_example: '',
                creator_notes: '',
                system_prompt: '',
                post_history_instructions: '',
                tags: '',
                creator: '',
                talkativeness: 0.5,
                fav: false,
                world: '',
                depth_prompt_prompt: '',
                depth_prompt_depth: 4,
                depth_prompt_role: 'system',
                alternate_greetings: [],
                group_only_greetings: [],
                extensions: '{}',
                chat: 'existing-chat',
                create_date: '2026-05-13T00:00:00.000Z',
            },
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/edit', request);

        expect(response.statusCode).toBe(200);
        expect(mocks.invalidateThumbnail).not.toHaveBeenCalled();
        expect(mocks.generateThumbnail).not.toHaveBeenCalled();
    });

    test('metadata-only character edits do not invalidate or pregenerate thumbnails', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-edit-attribute-');
        const { router, mocks } = await importCharacterRoutes();
        const avatarPath = path.join(directories.characters, 'Tester.png');
        fs.writeFileSync(avatarPath, Buffer.from('png'));
        const request = {
            body: {
                avatar_url: 'Tester.png',
                ch_name: 'Tester',
                field: 'name',
                value: 'Updated Tester',
            },
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/edit-attribute', request);

        expect(response.statusCode).toBe(200);
        expect(mocks.invalidateThumbnail).not.toHaveBeenCalled();
        expect(mocks.generateThumbnail).not.toHaveBeenCalled();
    });

    test('merge-attributes single-character updates do not invalidate or pregenerate thumbnails', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-merge-single-');
        const { router, mocks } = await importCharacterRoutes();
        const avatarPath = path.join(directories.characters, 'Tester.png');
        fs.writeFileSync(avatarPath, Buffer.from('png'));
        const request = {
            body: {
                avatar: 'Tester.png',
                data: {
                    data: {
                        creator_notes: 'updated',
                    },
                },
            },
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/merge-attributes', request);

        expect(response.statusCode).toBe(200);
        expect(mocks.invalidateThumbnail).not.toHaveBeenCalled();
        expect(mocks.generateThumbnail).not.toHaveBeenCalled();
    });

    test('persona upload kicks off persona pregeneration after canonical write', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-persona-');
        let sawWrittenPersona = false;
        const { router, mocks } = await importAvatarRoutes({
            generateThumbnailImpl: () => {
                sawWrittenPersona = fs.existsSync(path.join(directories.avatars, 'persona.png'));
                return Promise.resolve({ path: 'thumb.png', aspectRatio: 1, resolution: 1 });
            },
        });
        const tempUploadPath = path.join(directories.root, 'upload.tmp');
        fs.writeFileSync(tempUploadPath, Buffer.from('upload'));
        const request = {
            body: { overwrite_name: 'persona.png' },
            file: { destination: directories.root, filename: 'upload.tmp' },
            query: {},
            user: { directories },
        };

        const response = await invokeRoute(router, 'post', '/upload', request);

        expect(response.body).toEqual({ path: 'persona.png' });
        expect(sawWrittenPersona).toBe(true);
        expect(mocks.invalidateThumbnail).toHaveBeenCalledWith(directories, 'persona', 'persona.png');
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'persona', 'persona.png', true, null);
        expect(mocks.invalidateThumbnail.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateThumbnail.mock.invocationCallOrder[0]);
    });

    test('persona upload skips pregeneration when thumbnails are disabled', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-disabled-persona-');
        const { router, mocks } = await importAvatarRoutes({
            thumbnailsEnabled: false,
        });
        const tempUploadPath = path.join(directories.root, 'upload.tmp');
        fs.writeFileSync(tempUploadPath, Buffer.from('upload'));
        const request = {
            body: { overwrite_name: 'persona.png' },
            file: { destination: directories.root, filename: 'upload.tmp' },
            query: {},
            user: { directories },
        };

        const response = await invokeRoute(router, 'post', '/upload', request);

        expect(response.body).toEqual({ path: 'persona.png' });
        expect(mocks.generateThumbnail).not.toHaveBeenCalled();
    });
});
