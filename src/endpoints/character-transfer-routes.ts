import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import sanitize from 'sanitize-filename';
import mime from 'mime-types';
import type { UserDirectoryList } from '../user-types.ts';
import { mutateJsonString } from '../util.ts';
import { write } from '../character-card-parser.ts';
import { unsetPrivateFields } from './character-card-helpers.ts';
import { getCharaCardV2 } from './character-card-v2.ts';
import { createCharacterCard } from './character-write-service.ts';
import type { DeleteCharacterOptions } from './character-write-service.ts';

type Dependencies = {
    canonicalCharacterExistsSafe: (handle: string | null, directories: UserDirectoryList, avatar: string) => Promise<boolean>;
    listCanonicalAvatarFilenamesSafe: (handle: string | null, directories: UserDirectoryList) => Set<string>;
    getCanonicalCharacterCardJsonSafe: (handle: string | null, directories: UserDirectoryList, avatar: string) => Promise<string | null>;
    getCharacterAvatarBlobContentsSafe: (directories: UserDirectoryList, avatar: string) => Promise<{ contents: Buffer } | null>;
    createCharacterWriteDependencies: () => DeleteCharacterOptions['dependencies'];
};

export function createCharacterTransferHandlers({ canonicalCharacterExistsSafe, listCanonicalAvatarFilenamesSafe, getCanonicalCharacterCardJsonSafe, getCharacterAvatarBlobContentsSafe, createCharacterWriteDependencies }: Dependencies): { duplicate: RequestHandler; exportCharacter: RequestHandler } {
    const duplicate: RequestHandler = async function (request, response) {
        try {
            if (!request.body.avatar_url) {
                console.warn('avatar URL not found in request body');
                console.debug(request.body);
                return response.sendStatus(400);
            }
            const filename = path.join(request.user.directories.characters, sanitize(request.body.avatar_url));
            const canonicalExists = await canonicalCharacterExistsSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
            if (!canonicalExists) {
                console.error('character for dupe not found', filename);
                return response.sendStatus(404);
            }
            let suffix = 1;
            let newFilename = filename;

            // If filename ends with a _number, increment the number
            const nameParts = path.basename(filename, path.extname(filename)).split('_');
            const lastPart = nameParts[nameParts.length - 1];

            let baseName;

            if (!isNaN(Number(lastPart)) && nameParts.length > 1) {
                suffix = parseInt(lastPart) + 1;
                baseName = nameParts.slice(0, -1).join('_'); // construct baseName without suffix
            } else {
                baseName = nameParts.join('_'); // original filename is completely the baseName
            }

            // Uniqueness spans projected PNGs and canonical rows.
            const canonicalNames = listCanonicalAvatarFilenamesSafe(request.user.profile?.handle ?? null, request.user.directories);
            newFilename = path.join(request.user.directories.characters, `${baseName}_${suffix}${path.extname(filename)}`);

            while (fs.existsSync(newFilename) || canonicalNames.has(path.basename(newFilename))) {
                let suffixStr = '_' + suffix;
                newFilename = path.join(request.user.directories.characters, `${baseName}${suffixStr}${path.extname(filename)}`);
                suffix++;
            }

            const rawCharacterData = await getCanonicalCharacterCardJsonSafe(request.user.profile?.handle ?? null, request.user.directories, request.body.avatar_url);
            if (rawCharacterData == null) {
                throw new Error(`Failed to read character file for duplicate: ${filename}`);
            }

            // The canonical avatar blob is the image source (the projected PNG is
            // an export surface and may be absent or stale).
            const sourceImage = (await getCharacterAvatarBlobContentsSafe(request.user.directories, request.body.avatar_url))?.contents ?? null;

            const duplicateInternalName = path.parse(newFilename).name;
            const result = await createCharacterCard({
                request,
                internalName: duplicateInternalName,
                characterData: rawCharacterData,
                sourceImage: sourceImage ?? undefined,
                ensureChatsDirectory: false,
                dependencies: createCharacterWriteDependencies(),
            });

            if (!result.ok) {
                return response.status(500).send(result.message);
            }

            console.info(`${filename} was copied to ${newFilename}`);
            response.send({ path: result.avatarName });
        } catch (error) {
            console.error(error);
            return response.send({ error: true });
        }
    };

    const exportCharacter: RequestHandler = async function (request, response) {
        try {
            if (!request.body.format || !request.body.avatar_url) {
                return response.sendStatus(400);
            }

            const filename = path.join(request.user.directories.characters, sanitize(request.body.avatar_url));
            const handle = request.user.profile?.handle ?? null;

            // Canonical card_json + avatar blob are the authority; a projected
            // PNG file is only an export artifact and is never read back.
            const canonicalJson = await getCanonicalCharacterCardJsonSafe(handle, request.user.directories, request.body.avatar_url);
            if (canonicalJson === null) {
                return response.sendStatus(404);
            }

            switch (request.body.format) {
                case 'png': {
                    const blob = await getCharacterAvatarBlobContentsSafe(request.user.directories, request.body.avatar_url);
                    if (!blob?.contents) {
                        return response.sendStatus(404);
                    }
                    const mutatedData = mutateJsonString(String(canonicalJson), unsetPrivateFields);
                    const mutatedBuffer = write(blob.contents, mutatedData);
                    const contentType = mime.lookup(filename) || 'image/png';
                    response.setHeader('Content-Type', contentType);
                    response.setHeader('Content-Disposition', `attachment; filename="${encodeURI(path.basename(filename))}"`);
                    return response.send(mutatedBuffer);
                }
                case 'json': {
                    try {
                        const json = canonicalJson;
                        const jsonObject = getCharaCardV2(JSON.parse(json), request.user.directories);
                        unsetPrivateFields(jsonObject);
                        return response.type('json').send(JSON.stringify(jsonObject, null, 4));
                    } catch {
                        return response.sendStatus(400);
                    }
                }
            }

            return response.sendStatus(400);
        } catch (err) {
            console.error('Character export failed', err);
            response.sendStatus(500);
        }
    };
    return { duplicate, exportCharacter };
}
