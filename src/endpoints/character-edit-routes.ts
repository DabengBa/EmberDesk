import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import type { UserDirectoryList } from '../users.js';
import { tryParse } from '../util.js';
import { editCharacterCard } from './character-write-service.ts';
import type { CharacterWriteDependencies, DeleteCharacterOptions } from './character-write-service.ts';

type Dependencies = {
    canonicalCharacterExistsSafe: (handle: string | null, directories: UserDirectoryList, avatar: string) => Promise<boolean>;
    getCanonicalCharacterCardJsonSafe: (handle: string | null, directories: UserDirectoryList, avatar: string) => Promise<string | null>;
    createCharacterWriteDependencies: (options?: { bustCache?: CharacterWriteDependencies['bustCache'] }) => DeleteCharacterOptions['dependencies'];
    cacheBuster: { bust: NonNullable<CharacterWriteDependencies['bustCache']> };
};
export function createCharacterEditHandlers({ canonicalCharacterExistsSafe, getCanonicalCharacterCardJsonSafe, createCharacterWriteDependencies, cacheBuster }: Dependencies): { editAvatar: RequestHandler; editAttribute: RequestHandler } {
    const editAvatar: RequestHandler = async function (request, response) {
        const uploadRequest = request as typeof request & { file?: { destination: string; filename: string } };
        try {
            if (!uploadRequest.file) {
                return response.status(400).send('Error: no file uploaded');
            }

            if (!request.body || !request.body.avatar_url) {
                return response.status(400).send('Error: no avatar_url in request body');
            }

            const uploadPath = path.join(uploadRequest.file.destination, uploadRequest.file.filename);
            if (!fs.existsSync(uploadPath)) {
                return response.status(400).send('Error: uploaded file does not exist');
            }
            const characterExists = await canonicalCharacterExistsSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
            if (!characterExists) {
                return response.status(400).send('Error: character file does not exist');
            }
            const data = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
            if (!data) {
                return response.status(400).send('Error: failed to read character data');
            }

            const crop = tryParse(request.query.crop);
            const fileName = request.body.avatar_url.replace('.png', '');
            const result = await editCharacterCard({
                request,
                response,
                avatarUrl: request.body.avatar_url,
                targetFile: fileName,
                characterData: data,
                file: uploadRequest.file,
                crop,
                dependencies: createCharacterWriteDependencies({ bustCache: cacheBuster.bust.bind(cacheBuster) }),
            });

            if (!result.ok) {
                return response.status(500).send(result.message);
            }

            return response.sendStatus(200);
        } catch (err) {
            console.error('An error occurred while editing avatar', err);
            return response.sendStatus(500);
        }
    };

/**
 * Handle a POST request to edit a character attribute.
 *
 * Updates the specified attribute only against the caller's canonical card version.
 *
 * @param {Object} request - The HTTP request object.
 * @param {Object} response - The HTTP response object.
 * @returns {void}
 */
    const editAttribute: RequestHandler = async function (request, response) {
        if (!request.body) {
            console.warn('Error: no response body detected');
            return response.status(400).send('Error: no response body detected');
        }

        const expectedCardJson = request.body.expected_card_json;
        if (typeof expectedCardJson !== 'string' || !expectedCardJson) {
            return response.status(400).send('Error: expected_card_json is required');
        }

        if (request.body.ch_name === '' || request.body.ch_name === undefined || request.body.ch_name === '.') {
            console.warn('Error: invalid name.');
            return response.status(400).send('Error: invalid name.');
        }

        if (request.body.field === 'json_data') {
            console.warn('Error: cannot edit json_data field.');
            return response.status(400).send('Error: cannot edit json_data field.');
        }

        try {
            const charJSON = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
            if (typeof charJSON !== 'string') throw new Error('Failed to read character file');
            if (charJSON !== expectedCardJson) {
                return response.status(409).send({ error: 'character_card_conflict' });
            }

            const char = JSON.parse(charJSON);
            //check if the field exists
            if (char[request.body.field] === undefined && char.data[request.body.field] === undefined) {
                console.warn('Error: invalid field.');
                response.status(400).send('Error: invalid field.');
                return;
            }
            char[request.body.field] = request.body.value;
            char.data[request.body.field] = request.body.value;
            const newCharJSON = JSON.stringify(char);
            const targetFile = (request.body.avatar_url).replace('.png', '');
            const result = await editCharacterCard({
                request,
                avatarUrl: request.body.avatar_url,
                targetFile,
                characterData: newCharJSON,
                expectedCardJson,
                dependencies: createCharacterWriteDependencies(),
            });

            if (!result.ok) {
                return response.status(500).send(result.message);
            }

            return response.send({ canonical_card_version: result.cardVersion });
        } catch (err) {
            if (err && typeof err === 'object' && 'code' in err && err.code === 'CHARACTER_CARD_CONFLICT') {
                return response.status(409).send({ error: 'character_card_conflict' });
            }
            console.error('An error occurred, character edit invalidated.', err);
            return response.sendStatus(500);
        }
    };
    return { editAvatar, editAttribute };
}
