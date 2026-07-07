import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const readCharacterCardMock = jest.fn();
const writeCharacterCardMock = jest.fn();
const invalidateDirectoryMock = jest.fn();

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

async function invokeDeletePreflight(request) {
    const layer = router.stack.find(entry => entry.route?.path === '/delete-preflight' && entry.route.methods?.post);
    if (!layer) {
        throw new Error('Route not found: POST /delete-preflight');
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

        readCharacterCardMock.mockReset();
        writeCharacterCardMock.mockReset();
        invalidateDirectoryMock.mockReset();
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('reports bound characters by scanning character PNG snapshots without the index sidecar', async () => {
        const alphaPath = path.join(directories.characters, 'alpha.png');
        const betaPath = path.join(directories.characters, 'beta.png');
        const worldPath = path.join(directories.worlds, 'OldWorld.json');
        const alphaImage = Buffer.from('alpha png bytes');
        const betaImage = Buffer.from('beta png bytes');
        fs.writeFileSync(alphaPath, alphaImage);
        fs.writeFileSync(betaPath, betaImage);
        fs.writeFileSync(worldPath, JSON.stringify({ entries: { one: {} } }));

        readCharacterCardMock.mockImplementation((buffer) => {
            if (buffer.equals(alphaImage)) {
                return JSON.stringify({ data: { name: 'Alpha', extensions: { world: 'OldWorld' } } });
            }
            if (buffer.equals(betaImage)) {
                return JSON.stringify({ data: { name: 'Beta', extensions: { world: '' } } });
            }
            throw new Error('unexpected image buffer');
        });

        const response = await invokeDeletePreflight({
            body: { name: 'OldWorld' },
            user: { directories },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body.worldInfos).toEqual([expect.objectContaining({
            name: 'OldWorld',
            entryCount: 1,
            boundCharacters: [{ avatar: 'alpha.png', name: 'Alpha' }],
            deleteCandidateAvatars: [],
        })]);
    });

    test('reports bound characters from legacy card.world bindings without the index sidecar', async () => {
        const legacyPath = path.join(directories.characters, 'legacy.png');
        const legacyImage = Buffer.from('legacy png bytes');
        fs.writeFileSync(legacyPath, legacyImage);
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ entries: { one: {} } }));

        readCharacterCardMock.mockImplementation((buffer) => {
            if (buffer.equals(legacyImage)) {
                return JSON.stringify({ name: 'Legacy Hero', world: 'Lorebook' });
            }
            throw new Error('unexpected image buffer');
        });

        const response = await invokeDeletePreflight({
            body: { name: 'Lorebook' },
            user: { directories },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body.worldInfos).toEqual([expect.objectContaining({
            name: 'Lorebook',
            entryCount: 1,
            boundCharacters: [{ avatar: 'legacy.png', name: 'Legacy Hero' }],
            deleteCandidateAvatars: [],
        })]);
    });

    test('clears character world references by scanning PNG snapshots without invalidating the index row', async () => {
        const avatar = 'alpha.png';
        const characterPath = path.join(directories.characters, avatar);
        const worldPath = path.join(directories.worlds, 'OldWorld.json');
        const originalImage = Buffer.from('original png bytes');
        const rewrittenImage = Buffer.from('rewritten png bytes');
        fs.writeFileSync(characterPath, originalImage);
        fs.writeFileSync(worldPath, '{}');

        readCharacterCardMock.mockReturnValue(JSON.stringify({
            data: {
                name: 'Alpha',
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
                name: 'Alpha',
                extensions: {
                    world: '',
                },
            },
        }));
        expect(fs.readFileSync(characterPath)).toEqual(rewrittenImage);
        expect(fs.existsSync(worldPath)).toBe(false);
        expect(invalidateDirectoryMock).toHaveBeenCalledWith(directories.worlds);
    });
});
