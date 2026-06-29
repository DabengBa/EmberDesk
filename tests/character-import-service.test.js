import { describe, expect, jest, test } from '@jest/globals';

import { createCharacterImportCoordinator } from '../src/endpoints/character-import-service.js';

describe('character import service', () => {
    test('dispatches supported formats through the matching importer and refreshes the derived index after success', async () => {
        const order = [];
        const refreshCharacterIndexEntry = jest.fn(async () => {
            order.push('refresh:index');
        });
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
            refreshCharacterIndexEntry,
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

        expect(order).toEqual(['import:png', 'refresh:index']);
        expect(refreshCharacterIndexEntry).toHaveBeenCalledWith({ characters: '/chars' }, 'Preserved.png', 'import');
    });

    test('rejects unsupported import formats before any importer or derived cache side effect runs', async () => {
        const importCharacterUpload = createCharacterImportCoordinator({
            importFromYaml: jest.fn(),
            importFromJson: jest.fn(),
            importFromPng: jest.fn(),
            importFromCharX: jest.fn(),
            importFromByaf: jest.fn(),
            refreshCharacterIndexEntry: jest.fn(),
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
        const refreshCharacterIndexEntry = jest.fn();
        const importCharacterUpload = createCharacterImportCoordinator({
            importFromYaml: jest.fn(async () => ''),
            importFromJson: jest.fn(),
            importFromPng: jest.fn(),
            importFromCharX: jest.fn(),
            importFromByaf: jest.fn(),
            refreshCharacterIndexEntry,
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

        expect(refreshCharacterIndexEntry).not.toHaveBeenCalled();
    });
});
