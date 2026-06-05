import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
    readCharacterFullPayload,
    readCharacterListPayload,
    readCharacterSummaryPayload,
} from '../src/endpoints/character-read-service.js';

/**
 * @param {string} prefix
 * @returns {{ root: string, characters: string, chats: string, worlds: string }}
 */
function makeDirectories(prefix = 'emberdesk-character-read-service-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const directories = {
        root,
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        worlds: path.join(root, 'worlds'),
    };
    fs.mkdirSync(directories.characters, { recursive: true });
    fs.mkdirSync(directories.chats, { recursive: true });
    fs.mkdirSync(directories.worlds, { recursive: true });
    tempRoots.push(root);
    return directories;
}

/**
 * @param {{ characters: string }} directories
 * @param {string} avatar
 */
function writeAvatar(directories, avatar) {
    fs.writeFileSync(path.join(directories.characters, avatar), avatar, 'utf8');
}

/**
 * @param {object} overrides
 * @returns {object}
 */
function createDependencies(overrides = {}) {
    return {
        isCharacterIndexSupported: jest.fn(() => false),
        listIndexedCharacterPayloads: jest.fn(),
        getFreshIndexedCharacterFullPayload: jest.fn(),
        upsertCharacterIndexEntry: jest.fn(),
        processCharacter: jest.fn(async (avatar, _directories, { shallow }) => ({
            avatar,
            name: `${shallow ? 'Shallow' : 'Full'} ${avatar}`,
            json_data: shallow ? undefined : `json:${avatar}`,
        })),
        buildCharacterIndexRow: jest.fn(),
        statCharacterFile: jest.fn((filePath) => {
            const stat = fs.statSync(filePath);
            return { mtimeMs: stat.mtimeMs, size: stat.size };
        }),
        toShallow: jest.fn(payload => ({
            avatar: payload.avatar,
            name: payload.name,
        })),
        getCharacterIndexWorldMetadata: jest.fn(() => ({
            sourceWorldName: '',
            sourceWorldMtimeMs: -1,
            sourceWorldSize: -1,
        })),
        warn: jest.fn(),
        ...overrides,
    };
}

const tempRoots = [];

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
});

describe('character read service', () => {
    test('reads /all through the index and returns an internal snapshot envelope', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'beta.png');
        writeAvatar(directories, 'alpha.png');
        fs.writeFileSync(path.join(directories.characters, 'notes.txt'), 'ignore', 'utf8');

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            listIndexedCharacterPayloads: jest.fn(async () => [
                { avatar: 'alpha.png', name: 'Alpha' },
                { avatar: 'beta.png', name: 'Beta' },
            ]),
        });

        const result = await readCharacterListPayload({
            directories,
            shallow: true,
            filter: { query: 'ignored', tags: ['ignored'], sort: 'name' },
            pagination: { offset: 10, limit: 20 },
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [
                    { avatar: 'alpha.png', name: 'Alpha' },
                    { avatar: 'beta.png', name: 'Beta' },
                ],
            },
            interactionPath: 'characters_all:indexed',
            latencyHint: 'instant',
        });
        expect(dependencies.listIndexedCharacterPayloads).toHaveBeenCalledWith(expect.objectContaining({
            userRoot: directories.root,
            directories,
            avatarFiles: ['alpha.png', 'beta.png'],
            useShallowPayload: true,
            buildRow: expect.any(Function),
        }));
        expect(dependencies.processCharacter).not.toHaveBeenCalled();
    });

    test('falls back to filesystem snapshot when indexed /all read fails', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        writeAvatar(directories, 'broken.png');

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            listIndexedCharacterPayloads: jest.fn(async () => {
                throw new Error('index unavailable');
            }),
            processCharacter: jest.fn(async (avatar) => avatar === 'broken.png'
                ? { avatar, date_added: 0 }
                : { avatar, name: `Live ${avatar}` }),
        });

        const result = await readCharacterListPayload({
            directories,
            shallow: false,
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Live alpha.png' }],
            },
            interactionPath: 'characters_all:filesystem',
            latencyHint: 'slow',
        });
        expect(dependencies.warn).toHaveBeenCalledWith(
            'Falling back to filesystem-backed character list after index read failure:',
            expect.any(Error),
        );
    });

    test('reads /list as shallow summary and keeps future context no-op', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');

        const dependencies = createDependencies();

        const result = await readCharacterSummaryPayload({
            directories,
            filter: { query: 'alpha' },
            pagination: { offset: 0, limit: 1 },
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Shallow alpha.png', json_data: undefined }],
            },
            latencyHint: 'slow',
        });
        expect(dependencies.processCharacter).toHaveBeenCalledWith('alpha.png', directories, { shallow: true });
    });

    test('serves /get from a fresh indexed full payload', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const indexedPayload = { avatar: 'alpha.png', name: 'Indexed Alpha' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            getFreshIndexedCharacterFullPayload: jest.fn(() => indexedPayload),
        });

        const result = await readCharacterFullPayload({
            directories,
            avatarUrl: 'alpha.png',
            dependencies,
        });

        expect(result).toEqual({
            status: 'found',
            result: {
                mode: 'snapshot',
                data: indexedPayload,
            },
            interactionPath: 'characters_get:indexed',
            latencyHint: 'instant',
        });
        expect(dependencies.processCharacter).not.toHaveBeenCalled();
    });

    test('falls back to filesystem /get and refreshes the index row', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            getFreshIndexedCharacterFullPayload: jest.fn(() => null),
            processCharacter: jest.fn(async () => livePayload),
        });

        const result = await readCharacterFullPayload({
            directories,
            avatarUrl: 'alpha.png',
            dependencies,
        });

        expect(result).toEqual({
            status: 'found',
            result: {
                mode: 'snapshot',
                data: livePayload,
            },
            interactionPath: 'characters_get:filesystem',
            latencyHint: 'fast',
        });
        expect(dependencies.upsertCharacterIndexEntry).toHaveBeenCalledWith(directories.root, 'alpha.png', expect.objectContaining({
            avatar: 'alpha.png',
            fullPayload: livePayload,
            shallowPayload: { avatar: 'alpha.png', name: 'Live Alpha' },
        }));
    });

    test('reports missing avatar as not_found without reparsing', async () => {
        const directories = makeDirectories();
        const dependencies = createDependencies();

        const result = await readCharacterFullPayload({
            directories,
            avatarUrl: 'missing.png',
            dependencies,
        });

        expect(result).toEqual({
            status: 'not_found',
            interactionPath: 'characters_get:filesystem',
            latencyHint: 'instant',
        });
        expect(dependencies.processCharacter).not.toHaveBeenCalled();
    });
});
