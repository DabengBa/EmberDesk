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
        getCanonicalSqliteFeatureFlags: jest.fn(() => ({
            enabled: false,
            shadowImport: false,
            reads: false,
            writes: false,
            chatStats: false,
            strict: false,
        })),
        getCanonicalStorageStatus: jest.fn(() => ({
            enabled: false,
            strict: false,
            supported: true,
            disabledReason: 'disabled',
            lastAction: 'disabled',
            lastError: null,
        })),
        openCanonicalDatabase: jest.fn(() => null),
        runCanonicalMigrations: jest.fn(() => ({ ok: true, currentVersion: 1, targetVersion: 1, appliedVersions: [1] })),
        getCanonicalAuditStatus: jest.fn(() => ({ ok: true, blocking: false, reason: null })),
        listCanonicalCharacters: jest.fn(),
        getCanonicalCharacter: jest.fn(),
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
    test('reads /all through canonical sqlite when DB-first reads are enabled', async () => {
        const directories = makeDirectories();
        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: false,
                chatStats: false,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            listCanonicalCharacters: jest.fn(async () => [
                { avatar: 'alpha.png', name: 'Alpha' },
                { avatar: 'beta.png', name: 'Beta' },
            ]),
        });

        const result = await readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: true,
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
            interactionPath: 'characters_all:canonical',
            latencyHint: 'instant',
        });
        expect(dependencies.listCanonicalCharacters).toHaveBeenCalledWith(
            { kind: 'db' },
            expect.objectContaining({
                useShallowPayload: true,
                includeChatStats: false,
            }),
        );
        expect(dependencies.processCharacter).not.toHaveBeenCalled();
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
    });

    test('falls back to filesystem /all with an explicit canonical fallback reason when reads are disabled', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: false,
                writes: false,
                chatStats: false,
                strict: false,
            })),
        });

        const result = await readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: false,
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Full alpha.png', json_data: 'json:alpha.png' }],
            },
            interactionPath: 'characters_all:filesystem',
            latencyHint: 'slow',
            fallbackReason: 'canonical_reads_disabled',
        });
    });

    test('reads /all from filesystem even when the retired index is supported', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        writeAvatar(directories, 'beta.png');
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
                    { avatar: 'alpha.png', name: 'Shallow alpha.png', json_data: undefined },
                    { avatar: 'beta.png', name: 'Shallow beta.png', json_data: undefined },
                ],
            },
            interactionPath: 'characters_all:filesystem',
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
        expect(dependencies.processCharacter).toHaveBeenCalledTimes(2);
    });

    test('does not consult the retired index or warn when /all can read compatibility files', async () => {
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
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
        expect(dependencies.warn).not.toHaveBeenCalled();
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
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.processCharacter).toHaveBeenCalledWith('alpha.png', directories, { shallow: true });
    });

    test('includes explicit fallback reason for /list filesystem fallback when canonical reads are blocked', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: false,
                chatStats: false,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalAuditStatus: jest.fn(() => ({
                ok: false,
                blocking: true,
                reason: 'audit_not_run',
            })),
        });

        const result = await readCharacterSummaryPayload({
            handle: 'alice',
            directories,
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Shallow alpha.png', json_data: undefined }],
            },
            latencyHint: 'slow',
            fallbackReason: 'audit_not_run',
        });
    });

    test('reads /list summaries from filesystem even when the retired index is supported', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        writeAvatar(directories, 'beta.png');
        fs.writeFileSync(path.join(directories.characters, 'notes.txt'), 'ignore', 'utf8');

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            listIndexedCharacterPayloads: jest.fn(async () => [
                { avatar: 'alpha.png', name: 'Alpha' },
                { avatar: 'beta.png', name: 'Beta' },
            ]),
        });

        const result = await readCharacterSummaryPayload({
            directories,
            filter: { query: 'ignored' },
            pagination: { offset: 0, limit: 10 },
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [
                    { avatar: 'alpha.png', name: 'Shallow alpha.png', json_data: undefined },
                    { avatar: 'beta.png', name: 'Shallow beta.png', json_data: undefined },
                ],
            },
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
        expect(dependencies.processCharacter).toHaveBeenCalledTimes(2);
    });

    test('does not consult the retired index or warn when /list can read compatibility files', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        writeAvatar(directories, 'broken.png');

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            listIndexedCharacterPayloads: jest.fn(async () => {
                throw new Error('summary index unavailable');
            }),
            processCharacter: jest.fn(async (avatar) => avatar === 'broken.png'
                ? { avatar, date_added: 0 }
                : { avatar, name: `Summary ${avatar}` }),
        });

        const result = await readCharacterSummaryPayload({
            directories,
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Summary alpha.png' }],
            },
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
        expect(dependencies.warn).not.toHaveBeenCalled();
    });

    test('serves /get from filesystem even when the retired index has a fresh payload', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const indexedPayload = { avatar: 'alpha.png', name: 'Indexed Alpha' };
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            getFreshIndexedCharacterFullPayload: jest.fn(() => indexedPayload),
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
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.getFreshIndexedCharacterFullPayload).not.toHaveBeenCalled();
        expect(dependencies.upsertCharacterIndexEntry).not.toHaveBeenCalled();
    });

    test('serves /get from canonical sqlite even when the compatibility file is missing', async () => {
        const directories = makeDirectories();
        const canonicalPayload = { avatar: 'alpha.png', name: 'Canonical Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: false,
                chatStats: false,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalCharacter: jest.fn(async () => canonicalPayload),
        });

        const result = await readCharacterFullPayload({
            handle: 'alice',
            directories,
            avatarUrl: 'alpha.png',
            dependencies,
        });

        expect(result).toEqual({
            status: 'found',
            result: {
                mode: 'snapshot',
                data: canonicalPayload,
            },
            interactionPath: 'characters_get:canonical',
            latencyHint: 'instant',
        });
        expect(dependencies.processCharacter).not.toHaveBeenCalled();
        expect(dependencies.getCanonicalCharacter).toHaveBeenCalledWith({ kind: 'db' }, 'alpha.png', {
            includeChatStats: false,
        });
    });

    test('drops canonical chat stats from DB-first reads until the chatStats flag is enabled', async () => {
        const directories = makeDirectories();
        const canonicalPayload = { avatar: 'alpha.png', name: 'Alpha', chat_size: 99, date_last_chat: 111 };

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: false,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            listCanonicalCharacters: jest.fn(async () => [{ ...canonicalPayload, chat_size: 0, date_last_chat: 0 }]),
            getCanonicalCharacter: jest.fn(async () => ({ ...canonicalPayload, chat_size: 0, date_last_chat: 0 })),
        });

        const listResult = await readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: false,
            dependencies,
        });
        const getResult = await readCharacterFullPayload({
            handle: 'alice',
            directories,
            avatarUrl: 'alpha.png',
            dependencies,
        });

        expect(listResult.result.data[0]).toEqual({ avatar: 'alpha.png', name: 'Alpha', chat_size: 0, date_last_chat: 0 });
        expect(getResult.result.data).toEqual({ avatar: 'alpha.png', name: 'Alpha', chat_size: 0, date_last_chat: 0 });
    });

    test('warns and falls back when canonical /get misses the avatar row', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: false,
                chatStats: false,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalCharacter: jest.fn(() => null),
            processCharacter: jest.fn(async () => livePayload),
        });

        const result = await readCharacterFullPayload({
            handle: 'alice',
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
            latencyHint: 'slow',
            fallbackReason: 'canonical_db_row_missing',
        });
        expect(dependencies.warn).toHaveBeenCalledWith('Canonical character row missing for alpha.png; falling back to file-backed read.');
    });

    test('does not revive the derived character index after a canonical /get miss', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            getFreshIndexedCharacterFullPayload: jest.fn(() => ({ avatar: 'alpha.png', name: 'Indexed Alpha' })),
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: true,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalCharacter: jest.fn(() => null),
            processCharacter: jest.fn(async () => livePayload),
        });

        const result = await readCharacterFullPayload({
            handle: 'alice',
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
            latencyHint: 'slow',
            fallbackReason: 'canonical_db_row_missing',
        });
        expect(dependencies.getFreshIndexedCharacterFullPayload).not.toHaveBeenCalled();
        expect(dependencies.upsertCharacterIndexEntry).not.toHaveBeenCalled();
    });

    test('rejects instead of silently falling back when strict canonical reads are blocked by audit drift', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: false,
                chatStats: false,
                strict: true,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: true,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalAuditStatus: jest.fn(() => ({
                ok: false,
                blocking: true,
                reason: 'audit_drift_blocked',
            })),
        });

        await expect(readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: false,
            dependencies,
        })).rejects.toThrow('audit_drift_blocked');

        expect(dependencies.processCharacter).not.toHaveBeenCalled();
    });

    test.each([
        {
            name: 'unsupported runtime before the canonical DB opens',
            expectedFallbackReason: 'canonical_runtime_unsupported',
            overrides: {
                getCanonicalStorageStatus: jest.fn(() => ({
                    enabled: true,
                    strict: false,
                    supported: false,
                    disabledReason: 'unsupported',
                    lastAction: 'disabled',
                    lastError: null,
                })),
            },
        },
        {
            name: 'storage status blocked before opening the canonical DB',
            expectedFallbackReason: 'canonical_migration_blocked',
            overrides: {
                getCanonicalStorageStatus: jest.fn(() => ({
                    enabled: true,
                    strict: false,
                    supported: true,
                    disabledReason: 'migration_blocked',
                    lastAction: 'disabled',
                    lastError: null,
                })),
            },
        },
        {
            name: 'canonical DB unavailable after reads were requested',
            expectedFallbackReason: 'canonical_db_unavailable',
            overrides: {
                openCanonicalDatabase: jest.fn(() => null),
            },
        },
        {
            name: 'canonical migrations blocked after opening the DB',
            expectedFallbackReason: 'canonical_migration_blocked',
            overrides: {
                openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
                runCanonicalMigrations: jest.fn(() => ({
                    ok: false,
                    currentVersion: 1,
                    targetVersion: 2,
                })),
            },
        },
    ])('keeps the derived index retired when canonical reads hit $name', async ({ expectedFallbackReason, overrides }) => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            listIndexedCharacterPayloads: jest.fn(async () => [{ avatar: 'alpha.png', name: 'Indexed Alpha' }]),
            getFreshIndexedCharacterFullPayload: jest.fn(() => ({ avatar: 'alpha.png', name: 'Indexed Alpha' })),
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: true,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            processCharacter: jest.fn(async () => livePayload),
            ...overrides,
        });

        const listResult = await readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: false,
            dependencies,
        });
        const getResult = await readCharacterFullPayload({
            handle: 'alice',
            directories,
            avatarUrl: 'alpha.png',
            dependencies,
        });

        expect(listResult).toEqual({
            result: {
                mode: 'snapshot',
                data: [livePayload],
            },
            interactionPath: 'characters_all:filesystem',
            latencyHint: 'slow',
            fallbackReason: expectedFallbackReason,
        });
        expect(getResult).toEqual({
            status: 'found',
            result: {
                mode: 'snapshot',
                data: livePayload,
            },
            interactionPath: 'characters_get:filesystem',
            latencyHint: 'slow',
            fallbackReason: expectedFallbackReason,
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
        expect(dependencies.getFreshIndexedCharacterFullPayload).not.toHaveBeenCalled();
        expect(dependencies.upsertCharacterIndexEntry).not.toHaveBeenCalled();
    });

    test('falls back explicitly when canonical reads are enabled but no persisted audit has run yet', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');

        const dependencies = createDependencies({
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: false,
                chatStats: false,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalAuditStatus: jest.fn(() => ({
                ok: false,
                blocking: true,
                reason: 'audit_not_run',
                status: 'missing',
            })),
        });

        const result = await readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: false,
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Full alpha.png', json_data: 'json:alpha.png' }],
            },
            interactionPath: 'characters_all:filesystem',
            latencyHint: 'slow',
            fallbackReason: 'audit_not_run',
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
    });

    test('skips the derived character index entirely when canonical reads are blocked', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            listIndexedCharacterPayloads: jest.fn(async () => [
                { avatar: 'alpha.png', name: 'Indexed Alpha' },
            ]),
            getCanonicalSqliteFeatureFlags: jest.fn(() => ({
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: true,
                strict: false,
            })),
            getCanonicalStorageStatus: jest.fn(() => ({
                enabled: true,
                strict: false,
                supported: true,
                disabledReason: null,
                lastAction: 'idle',
                lastError: null,
            })),
            openCanonicalDatabase: jest.fn(() => ({ kind: 'db' })),
            getCanonicalAuditStatus: jest.fn(() => ({
                ok: false,
                blocking: true,
                reason: 'audit_not_run',
                status: 'missing',
            })),
        });

        const result = await readCharacterListPayload({
            handle: 'alice',
            directories,
            shallow: false,
            dependencies,
        });

        expect(result).toEqual({
            result: {
                mode: 'snapshot',
                data: [{ avatar: 'alpha.png', name: 'Full alpha.png', json_data: 'json:alpha.png' }],
            },
            interactionPath: 'characters_all:filesystem',
            latencyHint: 'slow',
            fallbackReason: 'audit_not_run',
        });
        expect(dependencies.listIndexedCharacterPayloads).not.toHaveBeenCalled();
    });

    test('ignores retired index lookup failures during filesystem /get', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            getFreshIndexedCharacterFullPayload: jest.fn(() => {
                throw new Error('index lookup failed');
            }),
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
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.getFreshIndexedCharacterFullPayload).not.toHaveBeenCalled();
        expect(dependencies.upsertCharacterIndexEntry).not.toHaveBeenCalled();
        expect(dependencies.warn).not.toHaveBeenCalled();
    });

    test('falls back to filesystem /get without refreshing the retired index row', async () => {
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
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.getFreshIndexedCharacterFullPayload).not.toHaveBeenCalled();
        expect(dependencies.upsertCharacterIndexEntry).not.toHaveBeenCalled();
    });

    test('does not hide non-missing stat errors during /get', async () => {
        const directories = makeDirectories();
        const statError = Object.assign(new Error('cannot stat character file'), { code: 'EACCES' });
        const dependencies = createDependencies({
            statCharacterFile: jest.fn(() => {
                throw statError;
            }),
        });

        await expect(readCharacterFullPayload({
            directories,
            avatarUrl: 'alpha.png',
            dependencies,
        })).rejects.toThrow('cannot stat character file');

        expect(dependencies.processCharacter).not.toHaveBeenCalled();
        expect(dependencies.warn).not.toHaveBeenCalled();
    });

    test('keeps filesystem /get response without touching retired index refresh', async () => {
        const directories = makeDirectories();
        writeAvatar(directories, 'alpha.png');
        const livePayload = { avatar: 'alpha.png', name: 'Live Alpha', json_data: '{}' };

        const dependencies = createDependencies({
            isCharacterIndexSupported: jest.fn(() => true),
            getFreshIndexedCharacterFullPayload: jest.fn(() => null),
            processCharacter: jest.fn(async () => livePayload),
            upsertCharacterIndexEntry: jest.fn(() => {
                throw new Error('index refresh failed');
            }),
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
            latencyHint: 'slow',
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.getFreshIndexedCharacterFullPayload).not.toHaveBeenCalled();
        expect(dependencies.upsertCharacterIndexEntry).not.toHaveBeenCalled();
        expect(dependencies.warn).not.toHaveBeenCalled();
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
            fallbackReason: 'canonical_storage_disabled',
        });
        expect(dependencies.processCharacter).not.toHaveBeenCalled();
    });
});
