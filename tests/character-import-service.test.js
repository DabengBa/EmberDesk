import { describe, expect, jest, test } from '@jest/globals';

import { createCharacterImportCoordinator } from '../src/endpoints/character-import-service.ts';

describe('character import service', () => {
    test.each([
        ['yaml', 'importFromYaml'], ['YML', 'importFromYaml'], ['JSON', 'importFromJson'],
        ['png', 'importFromPng'], ['CHARX', 'importFromCharX'], ['BYAF', 'importFromByaf'],
    ])('dispatches %s to %s with the original request context', async (format, handler) => {
        const importers = Object.fromEntries(['importFromYaml', 'importFromJson', 'importFromPng', 'importFromCharX', 'importFromByaf']
            .map(name => [name, jest.fn(async () => ({ ok: true, fileName: 'Alice.png', avatarName: 'other', refreshHandled: true }))]));
        const request = { user: { directories: {} } };
        const response = {};
        const run = createCharacterImportCoordinator(importers);
        await expect(run({ uploadPath: '/tmp/card', format, preservedFileName: 'Alice', request, response }))
            .resolves.toEqual({ ok: true, fileName: 'Alice.png', avatarName: 'Alice.png' });
        expect(importers[handler]).toHaveBeenCalledWith('/tmp/card', { request, response }, 'Alice');
        for (const name of Object.keys(importers).filter(name => name !== handler)) expect(importers[name]).not.toHaveBeenCalled();
    });

    test.each([
        [null, { ok: false, reason: 'import_failed', message: undefined }],
        [false, { ok: false, reason: 'import_failed', message: undefined }],
        [{ ok: false, reason: '', message: 'detail' }, { ok: false, reason: '', message: 'detail' }],
        [{ ok: false }, { ok: false, reason: 'import_failed', message: undefined }],
        [{ ok: true, fileName: '' }, { ok: false, reason: 'import_failed', message: undefined }],
        [{ fileName: 'Alice.PNG', refreshHandled: true }, { ok: true, fileName: 'Alice.PNG', avatarName: 'Alice.PNG.png' }],
    ])('preserves result normalization for %p', async (value, expected) => {
        const handler = jest.fn(async () => value);
        const run = createCharacterImportCoordinator({ importFromYaml: handler, importFromJson: handler, importFromPng: handler, importFromCharX: handler, importFromByaf: handler });
        await expect(run({ uploadPath: '/tmp/card', format: 'json', request: {}, response: {} })).resolves.toEqual(expected);
    });

    test('propagates importer failures unchanged', async () => {
        const failure = new Error('import failed');
        const handler = jest.fn(async () => { throw failure; });
        const run = createCharacterImportCoordinator({ importFromYaml: handler, importFromJson: handler, importFromPng: handler, importFromCharX: handler, importFromByaf: handler });
        await expect(run({ uploadPath: '/tmp/card', format: 'png', request: {}, response: {} })).rejects.toBe(failure);
    });

    test('dispatches supported formats through the matching importer without touching the derived index', async () => {
        const order = [];
        const importFromPng = jest.fn(async (uploadPath, { request, response }, preservedFileName) => {
            order.push('import:png');
            expect(uploadPath).toBe('/tmp/upload.png');
            expect(request).toEqual(expect.objectContaining({ user: { directories: { characters: '/chars' } } }));
            expect(response).toEqual({ locals: {} });
            expect(preservedFileName).toBe('Preserved');
            return 'Preserved';
        });
        const importCharacterUpload = createCharacterImportCoordinator({
            importFromYaml: jest.fn(),
            importFromJson: jest.fn(),
            importFromPng,
            importFromCharX: jest.fn(),
            importFromByaf: jest.fn(),
        });

        await expect(importCharacterUpload({
            uploadPath: '/tmp/upload.png',
            format: 'png',
            preservedFileName: 'Preserved',
            request: { user: { directories: { characters: '/chars' } } },
            response: { locals: {} },
        })).resolves.toEqual({
            ok: true,
            fileName: 'Preserved',
            avatarName: 'Preserved.png',
        });

        expect(order).toEqual(['import:png']);
    });

    test('rejects unsupported import formats before any importer or derived cache side effect runs', async () => {
        const importCharacterUpload = createCharacterImportCoordinator({
            importFromYaml: jest.fn(),
            importFromJson: jest.fn(),
            importFromPng: jest.fn(),
            importFromCharX: jest.fn(),
            importFromByaf: jest.fn(),
        });

        await expect(importCharacterUpload({
            uploadPath: '/tmp/upload.bin',
            format: 'bin',
            preservedFileName: undefined,
            request: { user: { directories: {} } },
            response: {},
        })).rejects.toThrow('Unsupported format: bin');
    });

    test('preserves route-level failure mapping by returning a failed result when the importer produces no canonical file', async () => {
        const importCharacterUpload = createCharacterImportCoordinator({
            importFromYaml: jest.fn(async () => ''),
            importFromJson: jest.fn(),
            importFromPng: jest.fn(),
            importFromCharX: jest.fn(),
            importFromByaf: jest.fn(),
        });

        await expect(importCharacterUpload({
            uploadPath: '/tmp/upload.yaml',
            format: 'yaml',
            preservedFileName: undefined,
            request: { user: { directories: {} } },
            response: {},
        })).resolves.toEqual({
            ok: false,
            reason: 'import_failed',
        });
    });
});
