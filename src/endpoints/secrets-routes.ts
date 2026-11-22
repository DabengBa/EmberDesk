import express from 'express';
import { SecretManager } from './secrets.ts';

// Pass the existing key list to avoid introducing a second exposure policy.
export function createSecretsRouter(EXPORTABLE_KEYS: string[]) {
    const router = express.Router();

    router.post('/write', (request, response) => {
        try {
            const { key, value, label } = request.body;

            if (!key || typeof value !== 'string') {
                return response.status(400).send('Invalid key or value');
            }

            const manager = new SecretManager(request.user.directories);
            const id = manager.writeSecret(key, value, label);

            return response.send({ id });
        } catch (error) {
            console.error('Error writing secret:', error);
            return response.sendStatus(500);
        }
    });

    router.post('/read', (request, response) => {
        try {
            const manager = new SecretManager(request.user.directories);
            const state = manager.getSecretState();
            return response.send(state);
        } catch (error) {
            console.error('Error reading secret state:', error);
            return response.send({});
        }
    });

    router.post('/view', (_request, response) => response.sendStatus(403));

    router.post('/find', (request, response) => {
        try {
            const { key, id } = request.body;

            if (!key) {
                return response.status(400).send('Key is required');
            }

            if (!EXPORTABLE_KEYS.includes(key)) {
                return response.sendStatus(403);
            }

            const manager = new SecretManager(request.user.directories);
            const state = manager.getSecretState();

            if (!state[key]) {
                return response.sendStatus(404);
            }

            const secretValue = manager.readSecret(key, id);
            return response.send({ value: secretValue });
        } catch (error) {
            console.error('Error finding secret:', error);
            return response.sendStatus(500);
        }
    });

    router.post('/delete', (request, response) => {
        try {
            const { key, id } = request.body;

            if (!key) {
                return response.status(400).send('Key and ID are required');
            }

            const manager = new SecretManager(request.user.directories);
            manager.deleteSecret(key, id);

            return response.sendStatus(204);
        } catch (error) {
            console.error('Error deleting secret:', error);
            return response.sendStatus(500);
        }
    });

    router.post('/rotate', (request, response) => {
        try {
            const { key, id } = request.body;

            if (!key || !id) {
                return response.status(400).send('Key and ID are required');
            }

            const manager = new SecretManager(request.user.directories);
            manager.rotateSecret(key, id);

            return response.sendStatus(204);
        } catch (error) {
            console.error('Error rotating secret:', error);
            return response.sendStatus(500);
        }
    });

    router.post('/rename', (request, response) => {
        try {
            const { key, id, label } = request.body;

            if (!key || !id || !label) {
                return response.status(400).send('Key, ID, and label are required');
            }

            const manager = new SecretManager(request.user.directories);
            manager.renameSecret(key, id, label);

            return response.sendStatus(204);
        } catch (error) {
            console.error('Error renaming secret:', error);
            return response.sendStatus(500);
        }
    });

    router.post('/settings', async (_request, response) => {
        return response.send({ allowKeysExposure: false });
    });

    return router;
}
