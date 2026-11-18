import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.ts';
import { openCanonicalDatabase } from '../canonical-sqlite.ts';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import type { createCharacterImportCoordinator } from './character-import-service.ts';
import { getCanonicalCharacter } from './character-store.ts';

export function createCharacterImportHandler(importCharacterUpload: ReturnType<typeof createCharacterImportCoordinator>): RequestHandler {
    return async function (request, response) {
        const uploadRequest = request as typeof request & { file?: { destination: string; filename: string } };
        if (!request.body || !uploadRequest.file) return response.sendStatus(400);

        const uploadPath = path.join(uploadRequest.file.destination, uploadRequest.file.filename);
        const format = request.body.file_type;
        const requestedFileName = typeof request.body.preserved_name === 'string' && request.body.preserved_name.length > 0
            ? path.parse(request.body.preserved_name).name
            : undefined;
        const removeUploadedFile = () => {
            if (fs.existsSync(uploadPath)) {
                fs.unlinkSync(uploadPath);
            }
        };

        try {
            let preservedFileName: string | undefined;
            if (requestedFileName) {
                const featureFlags = getCanonicalStorageSlice('characters').getFeatureFlags();
                const handle = request.user.profile?.handle;
                const db = featureFlags.enabled && handle
                    ? openCanonicalDatabase({ handle, directories: request.user.directories, featureFlags })
                    : null;
                if (db && runCanonicalMigrations(db, { strict: !!featureFlags.strict }).ok
                    && getCanonicalCharacter(db, `${requestedFileName}.png`, { includeChatStats: false })) {
                    preservedFileName = requestedFileName;
                }
            }
            const result = await importCharacterUpload({ uploadPath, format, preservedFileName, request, response });
            if (!result.ok) {
                console.warn('Failed to import character');
                removeUploadedFile();
                return response.sendStatus(400);
            }
            const report = {
                ...(requestedFileName && !preservedFileName && { ignored: ['replacement-target-not-found'] }),
                ...(result.auxiliaryMedia && { auxiliaryMedia: result.auxiliaryMedia }),
                ...(result.scenarios && { scenarios: result.scenarios }),
            };
            response.send({ file_name: result.fileName, ...(Object.keys(report).length && { report }) });
        } catch (err) {
            console.error(err);
            try {
                removeUploadedFile();
            } catch (cleanupError) {
                console.warn('Failed to remove uploaded character import file:', cleanupError);
            }
            response.status(400).send({ error: true });
        }
    };
}
