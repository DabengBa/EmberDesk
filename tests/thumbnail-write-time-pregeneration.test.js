import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { CharXParser } from '../src/charx.js';
import sharp from 'sharp';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';
import * as realImageProcessing from '../src/image-processing.js';
import * as realCharacterCard from '../src/character-card-parser.js';
import { setConfigFilePath } from '../src/util.js';
import { makeAnimatedImages, makeBmp } from './helpers/animated-image-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
setConfigFilePath(path.join(repoRoot, 'default/config.yaml'));
const { generateThumbnail: realGenerateThumbnail } = await import('../src/endpoints/thumbnails.js');

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
    };

    for (const dir of Object.values(directories)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return directories;
}

async function importCharacterRoutes({ generateThumbnailImpl, thumbnailsEnabled = true, parseImpl, realImages = false } = {}) {
    jest.resetModules();

    const mockGenerateThumbnail = jest.fn(generateThumbnailImpl ?? (() => Promise.resolve({ path: 'thumb.png', aspectRatio: 1, resolution: 1 })));
    const mockInvalidateThumbnail = jest.fn();
    const mockRefreshCharacterIndexEntrySafe = jest.fn(async () => {});
    const mockDeleteCharacterIndexEntrySafe = jest.fn();
    const mockUpsertCharacterIndexEntry = jest.fn();
    const mockGetFreshIndexedCharacterFullPayload = jest.fn(() => null);
    const mockListIndexedCharacterPayloads = jest.fn(async () => []);
    const mockFindCharactersBoundToWorld = jest.fn(() => []);
    const mockWrite = jest.fn(realImages ? realCharacterCard.write : () => Buffer.from('character-png'));
    const mockParse = jest.fn(parseImpl ?? (realImages ? realCharacterCard.parse : async () => '{"spec":"chara_card_v2","data":{"name":"Character"}}'));

    jest.unstable_mockModule('../src/util.js', () => ({
        deepMerge: (target, source) => ({ ...target, ...source }),
        getConfig: () => ({}),
        hasConfigFilePath: () => true,
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
        keyToEnv: key => String(key).replace(/[.-]/g, '_').toUpperCase(),
        mutateJsonString: value => value,
        formatBytes: value => `${value} B`,
        clientRelativePath: (_root, inputPath) => inputPath,
        getUniqueName: (baseName) => baseName,
        getImageBuffers: async () => new Map(),
        isPathUnderParent: (parent, target) => target === parent || target.startsWith(`${parent}${path.sep}`),
        sanitizeSafeCharacterReplacements: () => '_',
        uuidv4: () => 'test-managed-media-id',
    }));

    jest.unstable_mockModule('../src/image-processing.js', () => ({
        avatarToPng: realImages ? realImageProcessing.avatarToPng : async () => Buffer.from('cropped'),
    }));

    jest.unstable_mockModule('../src/character-card-parser.js', () => ({
        parse: mockParse,
        read: realImages ? realCharacterCard.read : () => '{"spec":"chara_card_v2","data":{"name":"Character"}}',
        write: mockWrite,
        extractImageData: realImages ? realCharacterCard.extractImageData : image => image,
    }));

    jest.unstable_mockModule('../src/constants.js', () => ({
        AVATAR_WIDTH: 400,
        AVATAR_HEIGHT: 600,
        DEFAULT_AVATAR_PATH: path.join(repoRoot, 'public/img/ai4.png'),
        MEDIA_REQUEST_TYPE: { IMAGE: 0b001, VIDEO: 0b010, AUDIO: 0b100 },
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
        findCharactersBoundToWorldFromFiles: () => [],
        readWorldInfoFile: async () => ({}),
        scanCharacterWorldBindingsFromFiles: () => ({
            avatarToWorldName: new Map(),
            worldNameToCharacters: new Map(),
        }),
        getCanonicalWorldInfoWriteState: async () => ({ ok: false }),
        writeWorldInfoProjectionFile: () => {},
    }));

    jest.unstable_mockModule('../src/endpoints/thumbnails.js', () => ({
        areThumbnailsEnabled: () => thumbnailsEnabled,
        invalidateThumbnail: mockInvalidateThumbnail,
        generateThumbnail: mockGenerateThumbnail,
    }));

    jest.unstable_mockModule('../src/users.js', () => ({
        getUserDirectories: () => ({}),
    }));

    jest.unstable_mockModule('../src/endpoints/chats.js', () => ({
        getChatInfo: async () => ({}),
        openCanonicalChatForTextReplace: async () => ({ ok: false }),
        writeCanonicalChatForTextReplace: async () => ({ ok: false }),
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

    jest.unstable_mockModule('../src/endpoints/canonical-managed-media-write-service.js', () => ({
        deleteCanonicalManagedMediaReference: async () => ({ authorityCommitted: false }),
        invalidateCanonicalManagedMediaAudit: () => false,
        writeCanonicalManagedMedia: async () => ({ authorityCommitted: false }),
    }));

    jest.unstable_mockModule('../src/endpoints/character-index.js', () => ({
        deleteCharacterIndexEntry: mockDeleteCharacterIndexEntrySafe,
        findCharactersBoundToWorld: mockFindCharactersBoundToWorld,
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

async function invokeRoute(router, method, routePath, request) {
    const layer = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods?.[method]);
    if (!layer) {
        throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
    }

    request.get ??= () => undefined;

    const response = {
        statusCode: 200,
        body: undefined,
        finished: false,
        status(code) { this.statusCode = code; return this; },
        send(payload) { this.body = payload; this.finished = true; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; this.finished = true; return this; },
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
                    if (handler.length < 3 || response.finished) {
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

// These hook tests assert the legacy PNG write behavior — pin characters
// projection to 'sync' (the mocked keyToEnv drops the EMBERDESK_ prefix).
process.env.FEATURES_STORAGE_CANONICALSQLITE_SLICES_CHARACTERS_PROJECTION = 'sync';

describe('thumbnail write-time pregeneration hooks', () => {
    test('CharX expression assets are not mapped for persistence', () => {
        const parser = new CharXParser(Buffer.alloc(0));
        const mapped = parser.mapCharXAssetsForStorage([
            { type: 'expression', name: 'happy', ext: 'png', zipPath: 'happy.png', order: 0 },
            { type: 'emotion', name: 'sad', ext: 'png', zipPath: 'sad.png', order: 1 },
            { type: 'sprite', name: 'angry', ext: 'png', zipPath: 'angry.png', order: 2 },
            { type: 'background', name: 'room', ext: 'jpg', zipPath: 'room.jpg', order: 3 },
            { type: 'custom', name: 'misc', ext: 'png', zipPath: 'misc.png', order: 4 },
        ]);

        expect(mapped.map(asset => asset.type)).toEqual(['background', 'custom']);
        expect(mapped.map(asset => asset.storageCategory)).toEqual(['background', 'misc']);
    });

    test.each(['apng', 'gif', 'webp', 'bmp'])('character create processes real %s file via the production image/card stack', async format => {
        const directories = makeUserDirectories('emberdesk-real-avatar-');
        const { router } = await importCharacterRoutes({ realImages: true, thumbnailsEnabled: false });
        const input = format === 'bmp' ? makeBmp() : (await makeAnimatedImages())[format];
        const upload = path.join(directories.root, 'upload.tmp');
        fs.writeFileSync(upload, input);
        const request = {
            body: {
                ch_name: 'ImageTest', description: '', scenario: '', first_mes: '', mes_example: '', creator_notes: '',
                system_prompt: '', post_history_instructions: '', tags: '', creator: '', talkativeness: 0.5, fav: false,
                world: '', depth_prompt_prompt: '', depth_prompt_depth: 4, depth_prompt_role: 'system',
                alternate_greetings: [], group_only_greetings: [], extensions: '{}',
            },
            file: { destination: directories.root, filename: 'upload.tmp' }, query: {},
            user: { directories, profile: { handle: 'default-user' } },
        };
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await invokeRoute(router, 'post', '/create', request);
            const cardPath = path.join(directories.characters, 'ImageTest.png');
            if (format === 'webp') {
                // The previous decoder also rejected animated WebP and the
                // path fallback cannot be used as a PNG card.
                expect(response.statusCode).toBe(500);
                expect(fs.existsSync(cardPath)).toBe(false);
                return;
            }
            expect(response.body).toBe('ImageTest.png');
            const card = fs.readFileSync(cardPath);
            expect(JSON.parse(realCharacterCard.read(card)).data.name).toBe('ImageTest');
            if (format === 'apng') {
                expect(extract(card).filter(chunk => chunk.name === 'fcTL')).toHaveLength(2);
            } else {
                expect(await sharp(card).metadata()).toMatchObject({ format: 'png', width: 2, height: 2 });
                const pixel = await sharp(card).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
                expect([...pixel]).toEqual([255, 0, 0]);
            }
        } finally {
            consoleError.mockRestore();
        }
    });

    test.each(['png', 'apng'])('imports a real %s character card and retains metadata', async format => {
        const directories = makeUserDirectories('emberdesk-real-import-');
        const { router } = await importCharacterRoutes({ realImages: true, thumbnailsEnabled: false });
        const image = format === 'apng' ? (await makeAnimatedImages()).apng : await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
        const card = realCharacterCard.write(image, JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Imported', description: 'retained', tags: [] } }));
        const upload = path.join(directories.root, 'upload.png');
        fs.writeFileSync(upload, card);
        const response = await invokeRoute(router, 'post', '/import', {
            body: { file_type: 'png' }, file: { path: upload, destination: directories.root, filename: 'upload.png' }, query: {},
            user: { directories, profile: { handle: 'default-user' } },
        });
        expect(response.statusCode).toBe(200);
        const result = fs.readFileSync(path.join(directories.characters, 'Imported.png'));
        expect(JSON.parse(realCharacterCard.read(result)).data).toMatchObject({ name: 'Imported', description: 'retained' });
        if (format === 'apng') expect(extract(result).filter(chunk => chunk.name === 'fcTL')).toHaveLength(2);
    });

    test('APNG character card pregeneration and later thumbnail read preserve animation', async () => {
        const directories = makeUserDirectories('emberdesk-apng-pregen-');
        const { router, mocks } = await importCharacterRoutes({ realImages: true, generateThumbnailImpl: realGenerateThumbnail });
        fs.writeFileSync(path.join(directories.root, 'upload.tmp'), (await makeAnimatedImages()).apng);
        const request = {
            body: { ch_name: 'Animated', description: '', scenario: '', first_mes: '', mes_example: '', creator_notes: '',
                system_prompt: '', post_history_instructions: '', tags: '', creator: '', talkativeness: 0.5, fav: false,
                world: '', depth_prompt_prompt: '', depth_prompt_depth: 4, depth_prompt_role: 'system',
                alternate_greetings: [], group_only_greetings: [], extensions: '{}' },
            file: { destination: directories.root, filename: 'upload.tmp' }, query: {},
            user: { directories, profile: { handle: 'default-user' } },
        };
        const response = await invokeRoute(router, 'post', '/create', request);
        expect(response.body).toBe('Animated.png');
        expect(mocks.generateThumbnail).toHaveBeenCalledTimes(1);
        const pregen = await mocks.generateThumbnail.mock.results[0].value;
        expect(pregen.path).toBeNull();
        const card = fs.readFileSync(path.join(directories.characters, 'Animated.png'));
        const chunks = extract(card);
        expect(chunks.filter(chunk => chunk.name === 'fcTL')).toHaveLength(2);
        const text = chunks.filter(chunk => chunk.name === 'tEXt').map(chunk => PNGtext.decode(chunk.data));
        expect(text.map(entry => entry.keyword).sort()).toEqual(['ccv3', 'chara']);
        for (const entry of text) {
            expect(JSON.parse(Buffer.from(entry.text, 'base64').toString('utf8')).data.name).toBe('Animated');
        }
        expect(fs.readdirSync(directories.thumbnailsAvatar)).toEqual([]);
        expect((await realGenerateThumbnail(directories, 'avatar', 'Animated.png')).path).toBeNull();
        expect(fs.readdirSync(directories.thumbnailsAvatar)).toEqual([]);
        expect(fs.readFileSync(path.join(directories.characters, 'Animated.png'))).toEqual(card);
    });

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
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Tester.png', true, null);
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
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Resilient.png', true, null);
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
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'tester_1.png', true, null);
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
        expect(mocks.generateThumbnail).toHaveBeenCalledWith(directories, 'avatar', 'Tester.png', true, null);
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

    test('character metadata edit rejects a missing avatar source without creating a fallback card', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-edit-missing-avatar-');
        const { router, mocks } = await importCharacterRoutes();
        const missingAvatarPath = path.join(directories.characters, 'Missing.png');
        const request = {
            body: {
                avatar_url: 'Missing.png',
                ch_name: 'Missing',
                description: 'updated',
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

        expect(response.statusCode).toBe(400);
        expect(response.body).toBe('Error: character file does not exist');
        expect(fs.existsSync(missingAvatarPath)).toBe(false);
        expect(mocks.write).not.toHaveBeenCalled();
        expect(mocks.invalidateThumbnail).not.toHaveBeenCalled();
        expect(mocks.generateThumbnail).not.toHaveBeenCalled();
    });

    test('invalid character imports return a client error and remove the uploaded file', async () => {
        const directories = makeUserDirectories('emberdesk-pregen-invalid-import-');
        const { router } = await importCharacterRoutes({
            parseImpl: async () => {
                throw new Error('invalid character card');
            },
        });
        const uploadPath = path.join(directories.root, 'upload.tmp');
        fs.writeFileSync(uploadPath, Buffer.from('not-a-card'));
        const request = {
            body: {
                file_type: 'png',
            },
            file: {
                destination: directories.root,
                filename: 'upload.tmp',
            },
            user: {
                directories,
                profile: { handle: 'default-user' },
            },
        };

        const response = await invokeRoute(router, 'post', '/import', request);

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({ error: true });
        expect(fs.existsSync(uploadPath)).toBe(false);
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

});
