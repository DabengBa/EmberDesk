import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import type { createCharacterImportCoordinator } from './character-import-service.ts';

export function createCharacterImportHandler(importCharacterUpload: ReturnType<typeof createCharacterImportCoordinator>): RequestHandler {
    return async function (request, response) {
        const uploadRequest = request as typeof request & { file?: { destination: string; filename: string } };
        if (!request.body || !uploadRequest.file) return response.sendStatus(400);

        const uploadPath = path.join(uploadRequest.file.destination, uploadRequest.file.filename);
        const format = request.body.file_type;
        const preservedFileName = typeof request.body.preserved_name === 'string' && request.body.preserved_name.length > 0
            ? path.parse(request.body.preserved_name).name
            : undefined;
        const removeUploadedFile = () => {
            if (fs.existsSync(uploadPath)) {
                fs.unlinkSync(uploadPath);
            }
        };

        try {
            const result = await importCharacterUpload({ uploadPath, format, preservedFileName, request, response });
            if (!result.ok) {
                console.warn('Failed to import character');
                removeUploadedFile();
                return response.sendStatus(400);
            }
            response.send({ file_name: result.fileName });
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
