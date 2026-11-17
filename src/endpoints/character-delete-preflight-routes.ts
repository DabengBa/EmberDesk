import type { DatabaseSync } from 'node:sqlite';
import type { Request, RequestHandler } from 'express';
import sanitize from 'sanitize-filename';
import { scanCanonicalCharacterWorldBindings } from './character-store.ts';
import { getCanonicalWorldInfoBook, normalizeCanonicalWorldInfoName } from './world-info-store.ts';

const DELETE_PREFLIGHT_AVATAR_LIMIT = 500;
export function createCharacterDeletePreflightHandler(getCanonicalWorldBindingScanState: (request: Request) => Promise<{ ok: boolean; db?: DatabaseSync }>): RequestHandler {
    return async function (request, response) {
        try {
            const avatars = request.body?.avatars;
            if (!Array.isArray(avatars) || avatars.length === 0) {
                return response.send({ worldInfos: [] });
            }

            if (avatars.length > DELETE_PREFLIGHT_AVATAR_LIMIT) {
                return response.status(400).send({ error: 'Too many avatars requested.' });
            }

            const canonicalBindings = await getCanonicalWorldBindingScanState(request);
            if (!canonicalBindings.ok) {
                return response.status(503).send({ error: 'canonical_storage_unavailable' });
            }
            const worldNameToAvatars = new Map<string, string[]>();
            const { worldNameToCharacters, avatarToWorldName } = scanCanonicalCharacterWorldBindings(canonicalBindings.db!);

            for (const avatar of avatars) {
                const safeName = sanitize(avatar);
                if (!safeName || safeName !== avatar) continue;

                const worldName = avatarToWorldName.get(avatar);
                if (!worldName) continue;

                if (!worldNameToAvatars.has(worldName)) {
                    worldNameToAvatars.set(worldName, []);
                }
                worldNameToAvatars.get(worldName)!.push(avatar);
            }

            if (worldNameToAvatars.size === 0) {
                return response.send({ worldInfos: [] });
            }

            const worldInfos = [];

            for (const [worldName, deleteCandidateAvatars] of worldNameToAvatars) {
                const book = getCanonicalWorldInfoBook(canonicalBindings.db!, normalizeCanonicalWorldInfoName(worldName)) as { entries?: object } | null;
                if (!book) continue;
                const entryCount = book?.entries ? Object.keys(book.entries).length : 0;
                const boundCharacters = worldNameToCharacters.get(worldName) ?? [];

                worldInfos.push({
                    name: worldName,
                    entryCount,
                    boundCharacters,
                    deleteCandidateAvatars,
                });
            }

            return response.send({ worldInfos });
        } catch (error) {
            console.error('Delete preflight error:', error);
            return response.status(500).send({ error: 'Failed to gather world info metadata.' });
        }
    };
}
