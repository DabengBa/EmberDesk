import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const findCharactersBoundToWorldMock = jest.fn();
const deleteCharacterIndexEntryMock = jest.fn();
const readCharacterCardMock = jest.fn();
const writeCharacterCardMock = jest.fn();
const invalidateDirectoryMock = jest.fn();

jest.unstable_mockModule('../src/endpoints/character-index.js', () => ({
    deleteCharacterIndexEntry: deleteCharacterIndexEntryMock,
    findCharactersBoundToWorld: findCharactersBoundToWorldMock,
    isCharacterIndexSupported: () => true,
}));

jest.unstable_mockModule('../src/character-card-parser.js', () => ({
    read: readCharacterCardMock,
    write: writeCharacterCardMock,
}));

jest.unstable_mockModule('../src/endpoints/settings-cache.js', () => ({
    invalidateDirectory: invalidateDirectoryMock,
}));

const { router } = await import('../src/endpoints/worldinfo.js');

function createResponse() {
    return {
        body: undefined,
        statusCode: 200,
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
        status(code) { this.statusCode = code; return this; },
    };
}

async function invokeDeleteCascade(request) {
    const layer = router.stack.find(entry => entry.route?.path === '/delete-cascade' && entry.route.methods?.post);
    if (!layer) {
        throw new Error('Route not found: POST /delete-cascade');
    }

    const response = createResponse();
    await layer.route.stack[0].handle(request, response);
    return response;
}

describe('world info delete cascade', () => {
    let root;
    let directories;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-worldinfo-cascade-'));
        directories = {
            root,
            characters: path.join(root, 'characters'),
            worlds: path.join(root, 'worlds'),
        };
        fs.mkdirSync(directories.characters, { recursive: true });
        fs.mkdirSync(directories.worlds, { recursive: true });

        findCharactersBoundToWorldMock.mockReset();
        deleteCharacterIndexEntryMock.mockReset();
        readCharacterCardMock.mockReset();
        writeCharacterCardMock.mockReset();
        invalidateDirectoryMock.mockReset();
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('clears character world references from one PNG snapshot and invalidates the index row', async () => {
        const avatar = 'alpha.png';
        const characterPath = path.join(directories.characters, avatar);
        const worldPath = path.join(directories.worlds, 'OldWorld.json');
        const originalImage = Buffer.from('original png bytes');
        const rewrittenImage = Buffer.from('rewritten png bytes');
        fs.writeFileSync(characterPath, originalImage);
        fs.writeFileSync(worldPath, '{}');

        findCharactersBoundToWorldMock.mockReturnValue([{ avatar }]);
        readCharacterCardMock.mockReturnValue(JSON.stringify({
            data: {
                extensions: {
                    world: 'OldWorld',
                },
            },
        }));
        writeCharacterCardMock.mockReturnValue(rewrittenImage);

        const response = await invokeDeleteCascade({
            body: {
                worlds: ['OldWorld'],
                clear_references: true,
            },
            user: { directories },
        });

        expect(response.statusCode).toBe(200);
        expect(readCharacterCardMock).toHaveBeenCalledWith(originalImage);
        expect(writeCharacterCardMock).toHaveBeenCalledWith(originalImage, JSON.stringify({
            data: {
                extensions: {
                    world: '',
                },
            },
        }));
        expect(fs.readFileSync(characterPath)).toEqual(rewrittenImage);
        expect(deleteCharacterIndexEntryMock).toHaveBeenCalledWith(root, avatar);
        expect(fs.existsSync(worldPath)).toBe(false);
        expect(invalidateDirectoryMock).toHaveBeenCalledWith(directories.worlds);
    });
});
