import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';
import _ from 'lodash';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { tryParse } from '../util.js';
import { invalidateDirectory } from './settings-cache.js';
import { findCharactersBoundToWorld, isCharacterIndexSupported } from './character-index.js';
import { parse, write } from '../character-card-parser.js';

/**
 * Reads a World Info file and returns its contents
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} worldInfoName Name of the World Info file
 * @param {boolean} allowDummy If true, returns an empty object if the file doesn't exist
 * @returns {object} World Info file contents
 */
export function readWorldInfoFile(directories, worldInfoName, allowDummy) {
    const dummyObject = allowDummy ? { entries: {} } : null;

    if (!worldInfoName) {
        return dummyObject;
    }

    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(directories.worlds, filename);

    if (!fs.existsSync(pathToWorldInfo)) {
        console.error(`World info file ${filename} doesn't exist.`);
        return dummyObject;
    }

    const worldInfoText = fs.readFileSync(pathToWorldInfo, 'utf8');
    const worldInfo = JSON.parse(worldInfoText);
    return worldInfo;
}

export const router = express.Router();

router.post('/list', async (request, response) => {
    try {
        const data = [];
        const jsonFiles = (await fs.promises.readdir(request.user.directories.worlds, { withFileTypes: true }))
            .filter((file) => file.isFile() && path.extname(file.name).toLowerCase() === '.json')
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const file of jsonFiles) {
            try {
                const filePath = path.join(request.user.directories.worlds, file.name);
                const fileContents = await fs.promises.readFile(filePath, 'utf8');
                const fileContentsParsed = tryParse(fileContents) || {};
                const fileExtensions = fileContentsParsed?.extensions || {};
                const fileNameWithoutExt = path.parse(file.name).name;
                const fileData = {
                    file_id: fileNameWithoutExt,
                    name: fileContentsParsed?.name || fileNameWithoutExt,
                    extensions: _.isObjectLike(fileExtensions) ? fileExtensions : {},
                };
                data.push(fileData);
            } catch (err) {
                console.warn(`Error reading or parsing World Info file ${file.name}:`, err);
            }
        }

        return response.send(data);
    } catch (err) {
        console.error('Error reading World Info directory:', err);
        return response.sendStatus(500);
    }
});

router.post('/get', (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    const file = readWorldInfoFile(request.user.directories, request.body.name, true);

    return response.send(file);
});

router.post('/delete-preflight', (request, response) => {
    try {
        const worldName = request.body?.name;
        if (!worldName || typeof worldName !== 'string') {
            return response.status(400).send({ error: 'World name is required.' });
        }

        const directories = request.user.directories;
        const worldFilename = sanitize(`${worldName}.json`);
        const worldPath = path.join(directories.worlds, worldFilename);

        if (!fs.existsSync(worldPath)) {
            return response.send({ worldInfos: [] });
        }

        let entryCount = 0;
        try {
            const worldData = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
            entryCount = worldData.entries ? Object.keys(worldData.entries).length : 0;
        } catch {
            // If we can't parse, still show with 0 entries
        }

        let boundCharacters = [];
        if (isCharacterIndexSupported()) {
            try {
                boundCharacters = findCharactersBoundToWorld(directories.root, worldName);
            } catch {
                // Fallback: only show the world itself
            }
        }

        return response.send({
            worldInfos: [{
                name: worldName,
                entryCount,
                boundCharacters,
                deleteCandidateAvatars: [],
            }],
        });
    } catch (error) {
        console.error('World delete preflight error:', error);
        return response.status(500).send({ error: 'Failed to gather world info metadata.' });
    }
});

router.post('/delete', (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    const worldInfoName = request.body.name;
    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(request.user.directories.worlds, filename);

    if (!fs.existsSync(pathToWorldInfo)) {
        throw new Error(`World info file ${filename} doesn't exist.`);
    }

    fs.unlinkSync(pathToWorldInfo);
    invalidateDirectory(request.user.directories.worlds);

    return response.sendStatus(200);
});

router.post('/import', (request, response) => {
    if (!request.file) return response.sendStatus(400);

    const filename = `${path.parse(sanitize(request.file.originalname)).name}.json`;

    let fileContents = null;

    if (request.body.convertedData) {
        fileContents = request.body.convertedData;
    } else {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        fileContents = fs.readFileSync(pathToUpload, 'utf8');
        fs.unlinkSync(pathToUpload);
    }

    try {
        const worldContent = JSON.parse(fileContents);
        if (!('entries' in worldContent)) {
            throw new Error('File must contain a world info entries list');
        }
    } catch (err) {
        return response.status(400).send('Is not a valid world info file');
    }

    const pathToNewFile = path.join(request.user.directories.worlds, filename);
    const worldName = path.parse(pathToNewFile).name;

    if (!worldName) {
        return response.status(400).send('World file must have a name');
    }

    writeFileAtomicSync(pathToNewFile, fileContents);
    invalidateDirectory(request.user.directories.worlds);
    return response.send({ name: worldName });
});

router.post('/edit', (request, response) => {
    if (!request.body) {
        return response.sendStatus(400);
    }

    if (!request.body.name) {
        return response.status(400).send('World file must have a name');
    }

    try {
        if (!('entries' in request.body.data)) {
            throw new Error('World info must contain an entries list');
        }
    } catch (err) {
        return response.status(400).send('Is not a valid world info file');
    }

    const filename = sanitize(`${request.body.name}.json`);
    const pathToFile = path.join(request.user.directories.worlds, filename);

    writeFileAtomicSync(pathToFile, JSON.stringify(request.body.data, null, 4));
    invalidateDirectory(request.user.directories.worlds);

    return response.send({ ok: true });
});

router.post('/delete-cascade', async (request, response) => {
    try {
        const worlds = request.body?.worlds;
        if (!Array.isArray(worlds) || worlds.length === 0) {
            return response.sendStatus(400);
        }

        const clearReferences = request.body.clear_references === true;
        const directories = request.user.directories;

        for (const worldName of worlds) {
            if (typeof worldName !== 'string' || !worldName.trim()) continue;

            if (clearReferences && isCharacterIndexSupported()) {
                try {
                    const boundCharacters = findCharactersBoundToWorld(directories.root, worldName);
                    for (const { avatar } of boundCharacters) {
                        const charPath = path.join(directories.characters, avatar);
                        if (!fs.existsSync(charPath)) continue;

                        try {
                            const imageBuffer = fs.readFileSync(charPath);
                            const jsonString = await parse(charPath);
                            const card = JSON.parse(jsonString);
                            if (card?.data?.extensions?.world === worldName) {
                                card.data.extensions.world = '';
                                const newBuffer = write(imageBuffer, JSON.stringify(card));
                                fs.writeFileSync(charPath, newBuffer);
                            }
                        } catch {
                            // Skip characters that can't be updated
                        }
                    }
                } catch {
                    // If index lookup fails, still delete the world file
                }
            }

            const worldFilename = sanitize(`${worldName}.json`);
            const worldPath = path.join(directories.worlds, worldFilename);
            if (fs.existsSync(worldPath)) {
                fs.unlinkSync(worldPath);
            }
        }

        invalidateDirectory(directories.worlds);
        return response.sendStatus(200);
    } catch (error) {
        console.error('World info cascade delete error:', error);
        return response.status(500).send({ error: 'Failed to cascade-delete world info files.' });
    }
});
