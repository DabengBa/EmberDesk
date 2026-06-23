import path from 'node:path';
import express from 'express';
import { Hono } from 'hono';
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

function createHonoBridgeRequest(request) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(key, item);
            }
            continue;
        }
        if (value !== undefined) {
            headers.set(key, value);
        }
    }

    return new Request(new URL(request.url, 'http://localhost'), {
        method: request.method,
        headers,
    });
}

async function sendHonoBridgeResponse(response, honoResponse) {
    response.status(honoResponse.status);
    for (const [key, value] of honoResponse.headers.entries()) {
        response.setHeader(key, value);
    }
    const body = Buffer.from(await honoResponse.arrayBuffer());
    return response.send(body);
}

export const movingUiRouteOwner = new Hono();

movingUiRouteOwner.post('/save', c => {
    const parsed = movingUiSaveSchema.safeParse(c.env?.parsedBody);
    const directories = c.env?.user?.directories;

    if (!parsed.success || !directories?.movingUI) {
        return new Response('Bad Request', {
            status: 400,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
    }

    if (!saveMovingUiPreset(directories, parsed.data)) {
        return new Response('Bad Request', {
            status: 400,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
    }

    return new Response('OK', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
});

export const router = express.Router();

router.use(async (request, response, next) => {
    try {
        const honoResponse = await movingUiRouteOwner.fetch(createHonoBridgeRequest(request), {
            parsedBody: request.body,
            user: request.user,
        });

        if (honoResponse.status === 404) {
            return next();
        }

        return await sendHonoBridgeResponse(response, honoResponse);
    } catch (error) {
        return next(error);
    }
});
