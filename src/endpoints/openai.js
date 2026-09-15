import fetch from 'node-fetch';
import express from 'express';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = express.Router();


// ElectronHub model list
router.post('/electronhub/models', async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.ELECTRONHUB);

        if (!key) {
            console.warn('No ElectronHub key found');
            return response.sendStatus(400);
        }

        const result = await fetch('https://api.electronhub.ai/v1/models', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('ElectronHub models request failed', result.statusText, text);
            return response.status(500).send(text);
        }
        /** @type {any} */
        const data = await result.json();
        const models = data && Array.isArray(data.data) ? data.data : [];
        return response.json(models);
    } catch (error) {
        console.error('ElectronHub models fetch failed', error);
        response.status(500).send('Internal server error');
    }
});
