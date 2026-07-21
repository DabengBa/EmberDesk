import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import express from 'express';

import { router as groupsRouter } from '../src/endpoints/groups.js';

describe('group authoring route retirement', () => {
    let server;
    let baseUrl;
    let directories;

    beforeEach(async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-authoring-'));
        directories = {
            groups: path.join(root, 'groups'),
            groupChats: path.join(root, 'group-chats'),
        };
        fs.mkdirSync(directories.groups);
        fs.mkdirSync(directories.groupChats);
        fs.writeFileSync(
            path.join(directories.groups, 'existing.json'),
            JSON.stringify({ id: 'existing', name: 'Existing' }),
            'utf8',
        );

        const app = express();
        app.use(express.json());
        app.use((request, _response, next) => {
            request.user = { directories };
            next();
        });
        app.use('/api/groups', groupsRouter);

        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(path.dirname(directories.groups), { recursive: true, force: true });
    });

    test('rejects group create with stable 410 and leaves disk unchanged', async () => {
        const before = fs.readFileSync(path.join(directories.groups, 'existing.json'), 'utf8');
        const response = await fetch(`${baseUrl}/api/groups/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Night Shift',
                members: ['A.png', 'B.png'],
                hideMutedSprites: true,
            }),
        });

        expect(response.status).toBe(410);
        await expect(response.json()).resolves.toEqual({
            error: 'group_chat_feature_removed',
            message: 'Group chat functionality has been removed from EmberDesk.',
        });
        expect(fs.readFileSync(path.join(directories.groups, 'existing.json'), 'utf8')).toBe(before);
        expect(fs.readdirSync(directories.groups)).toEqual(['existing.json']);
    });
});
