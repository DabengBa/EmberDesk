import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const readCharacterCardMock = jest.fn();
const writeCharacterCardMock = jest.fn();
const parseCharacterCardMock = jest.fn();
const invalidateDirectoryMock = jest.fn();

jest.unstable_mockModule('../src/character-card-parser.js', () => ({
    read: readCharacterCardMock,
    write: writeCharacterCardMock,
    parse: parseCharacterCardMock,
    extractImageData: image => image,
}));

jest.unstable_mockModule('../src/endpoints/settings-cache.js', () => ({
    invalidateDirectory: invalidateDirectoryMock,
}));

const { router } = await import('../src/endpoints/worldinfo.js');
const { ensureCanonicalSliceBackend, resetCanonicalBackendsForTests } = await import('../src/canonical-backend.js');

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
    let parsedCards;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-worldinfo-cascade-'));
        directories = {
            root,
            characters: path.join(root, 'characters'),
            worlds: path.join(root, 'worlds'),
            chats: path.join(root, 'chats'),
            storage: path.join(root, 'storage'),
        };
        for (const directory of Object.values(directories)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        parsedCards = new Map();
        readCharacterCardMock.mockReset();
        writeCharacterCardMock.mockReset();
        parseCharacterCardMock.mockReset();
        parseCharacterCardMock.mockImplementation((filePath) => {
            const card = parsedCards.get(path.basename(filePath));
            return card === undefined ? null : JSON.stringify(card);
        });
        invalidateDirectoryMock.mockReset();
    });

    afterEach(() => {
        resetCanonicalBackendsForTests();
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('reports bound characters from canonical rows populated by shadow import', async () => {
        fs.writeFileSync(path.join(directories.characters, 'alpha.png'), Buffer.from('alpha png bytes'));
        fs.writeFileSync(path.join(directories.characters, 'beta.png'), Buffer.from('beta png bytes'));
        fs.writeFileSync(path.join(directories.worlds, 'OldWorld.json'), JSON.stringify({ entries: { one: {} } }));
        parsedCards.set('alpha.png', { name: 'Alpha', world: 'OldWorld' });
        parsedCards.set('beta.png', { name: 'Beta', world: '' });

        await ensureCanonicalSliceBackend('characters', directories, 'default-user');

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

    test('reports bound characters from legacy card.world bindings via canonical import', async () => {
        fs.writeFileSync(path.join(directories.characters, 'legacy.png'), Buffer.from('legacy png bytes'));
        fs.writeFileSync(path.join(directories.worlds, 'Lorebook.json'), JSON.stringify({ entries: { one: {} } }));
        parsedCards.set('legacy.png', { name: 'Legacy Hero', world: 'Lorebook' });

        await ensureCanonicalSliceBackend('characters', directories, 'default-user');

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

    test('clears canonical character world bindings without rewriting projection PNGs', async () => {
        const avatar = 'alpha.png';
        const characterPath = path.join(directories.characters, avatar);
        const worldPath = path.join(directories.worlds, 'OldWorld.json');
        const originalImage = Buffer.from('original png bytes');
        fs.writeFileSync(characterPath, originalImage);
        fs.writeFileSync(worldPath, '{}');
        parsedCards.set('alpha.png', { name: 'Alpha', world: 'OldWorld' });

        const response = await invokeDeleteCascade({
            body: {
                worlds: ['OldWorld'],
                clear_references: true,
            },
            user: { directories },
        });

        expect(response.statusCode).toBe(200);
        expect(writeCharacterCardMock).not.toHaveBeenCalled();
        expect(fs.readFileSync(characterPath)).toEqual(originalImage);
        expect(fs.existsSync(worldPath)).toBe(false);
        expect(invalidateDirectoryMock).toHaveBeenCalledWith(directories.worlds);

        const { db } = await ensureCanonicalSliceBackend('characters', directories, 'default-user');
        expect(db.prepare('SELECT world_name FROM characters WHERE avatar_filename = ?').get(avatar))
            .toEqual({ world_name: '' });
        expect(db.prepare(`
            SELECT deleted_at_ms FROM world_books WHERE name = 'OldWorld'
        `).get()?.deleted_at_ms).not.toBeNull();
    });
});
