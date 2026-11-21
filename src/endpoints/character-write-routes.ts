import type { RequestHandler } from 'express';
import sanitize from 'sanitize-filename';
import { tryParse } from '../util.js';
import { createCharacterCard, deleteCharacterCard, editCharacterCard, renameCharacterCard } from './character-write-service.ts';
import type { DeleteCharacterOptions, CharacterWriteDependencies } from './character-write-service.ts';

type Dependencies = {
    createWriteDependencies: (options?: { bustCache?: CharacterWriteDependencies['bustCache'] }) => DeleteCharacterOptions['dependencies'];
    getBustCache: () => CharacterWriteDependencies['bustCache'];
};

export function createCharacterWriteHandlers({ createWriteDependencies, getBustCache }: Dependencies): {
    create: RequestHandler; rename: RequestHandler; edit: RequestHandler; delete: RequestHandler;
} {
    return {
        create: async function (request, response) {
            const uploadRequest = request as typeof request & { file?: { destination: string; filename: string } };
            try {
                if (!request.body) return response.sendStatus(400);
                const result = await createCharacterCard({
                    request, body: request.body, file: uploadRequest.file ?? null,
                    crop: uploadRequest.file ? tryParse(request.query.crop) : undefined,
                    dependencies: createWriteDependencies(),
                });
                if (!result.ok) return response.status(500).send(result.message);
                return response.send(result.avatarName);
            } catch (err) {
                console.error(err);
                response.sendStatus(500);
            }
        },
        rename: async function (request, response) {
            if (!request.body.avatar_url || !request.body.new_name) return response.sendStatus(400);
            try {
                const result = await renameCharacterCard({ request, body: request.body, dependencies: createWriteDependencies() });
                if (!result.ok) return response.status(500).send(result.message);
                return response.send({ avatar: result.avatarName, mediaAuthorization: result.mediaAuthorization, settings_revision: result.settingsRevision });
            } catch (err) {
                console.error(err);
                return response.sendStatus(500);
            }
        },
        edit: async function (request, response) {
            const uploadRequest = request as typeof request & { file?: { destination: string; filename: string } };
            if (!request.body) {
                console.warn('Error: no response body detected');
                response.status(400).send('Error: no response body detected');
                return;
            }
            if (request.body.ch_name === '' || request.body.ch_name === undefined || request.body.ch_name === '.') {
                console.warn('Error: invalid name.');
                response.status(400).send('Error: invalid name.');
                return;
            }
            if (!request.body.avatar_url) {
                console.warn('Error: no avatar_url in request body');
                response.status(400).send('Error: no avatar_url in request body');
                return;
            }
            if (typeof request.body.expected_card_json !== 'string' || !request.body.expected_card_json) {
                return response.sendStatus(400);
            }
            try {
                const result = await editCharacterCard({
                    request, response, body: request.body, file: uploadRequest.file ?? null,
                    expectedCardJson: request.body.expected_card_json,
                    crop: uploadRequest.file ? tryParse(request.query.crop) : undefined,
                    dependencies: createWriteDependencies({ bustCache: getBustCache() }),
                });
                if (result.reason === 'missing_avatar') {
                    console.warn(result.message, result.avatarPath);
                    return response.status(400).send(result.message);
                }
                if (!result.ok && result.reason === 'projection_failed'
                    && result.authorityCommitted && typeof result.cardVersion === 'string') {
                    return response.status(500).send({ error: 'projection_failed', authority_committed: true, canonical_card_version: result.cardVersion });
                }
                if (!result.ok) return response.status(500).send(result.message);
                return response.send({ canonical_card_version: result.cardVersion });
            } catch (err) {
                if (err && typeof err === 'object' && 'code' in err && err.code === 'CHARACTER_CARD_CONFLICT') {
                    return response.status(409).send({ error: 'character_card_conflict' });
                }
                console.error('An error occurred, character edit invalidated.', err);
                return response.sendStatus(500);
            }
        },
        delete: async function (request, response) {
            if (!request.body || !request.body.avatar_url) return response.sendStatus(400);
            if (request.body.avatar_url !== sanitize(request.body.avatar_url)) {
                console.error('Malicious filename prevented');
                return response.sendStatus(403);
            }
            const dir_name = request.body.avatar_url.replace('.png', '');
            if (!dir_name.length) {
                console.error('Malicious dirname prevented');
                return response.sendStatus(403);
            }
            try {
                const worlds = request.body.delete_worlds;
                if (worlds !== undefined && (!Array.isArray(worlds) || worlds.some(name => typeof name !== 'string'))) return response.sendStatus(400);
                const result = await deleteCharacterCard({
                    request, avatarName: request.body.avatar_url, deleteChats: request.body.delete_chats == true,
                    deleteWorlds: worlds,
                    dependencies: createWriteDependencies(),
                });
                if (result.reason === 'missing_avatar') return response.sendStatus(400);
                if (!result.ok && !result.authorityCommitted) return response.status(500).send(result.message);
                return response.send({
                    deletedWorlds: result.deletedWorlds ?? [],
                    worldCleanupWarning: Boolean(result.worldCleanupWarning),
                    projectionWarning: result.reason === 'projection_failed',
                });
            } catch (error) {
                console.error(error);
                return response.sendStatus(500);
            }
        },
    };
}
