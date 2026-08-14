import path from 'node:path';
import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { z } from 'zod';

import { invalidateDirectory } from './settings-cache.js';
import { isPathUnderParent } from '../util.js';

const movingUiSaveSchema = z.object({
    name: z.string().min(1),
}).passthrough();

function saveMovingUiPreset(directories, payload) {
    const sanitizedName = sanitize(`${payload.name}.json`);
    if (!sanitizedName) {
        return false;
    }

    const filename = path.join(directories.movingUI, sanitizedName);
    if (!isPathUnderParent(directories.movingUI, filename)) {
        return false;
    }

    writeFileAtomicSync(filename, JSON.stringify(payload, null, 4), 'utf8');
    invalidateDirectory(directories.movingUI);
    return true;
}

export const router = express.Router();

router.post('/save', (request, response) => {
    const parsed = movingUiSaveSchema.safeParse(request.body);
    const directories = request.user?.directories;
    if (!parsed.success || !directories?.movingUI) {
        return response.status(400).type('text/plain').send('Bad Request');
    }

    if (!saveMovingUiPreset(directories, parsed.data)) {
        return response.status(400).type('text/plain').send('Bad Request');
    }

    return response.type('text/plain').send('OK');
});
