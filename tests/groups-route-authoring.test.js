import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import express from 'express';

import { router as groupsRouter } from '../src/endpoints/groups.js';

describe('group authoring route', () => {
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

    test('persists every React group-create authoring option', async () => {
        const response = await fetch(`${baseUrl}/api/groups/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Night Shift',
                members: ['A.png', 'B.png'],
                avatar_url: '/user/avatars/night-shift.png',
                allow_self_responses: true,
                hideMutedSprites: true,
                activation_strategy: 3,
                generation_mode: 2,
                disabled_members: ['B.png'],
                fav: true,
                chat_id: 'night-shift-chat',
                chats: ['night-shift-chat'],
                auto_mode_delay: 7,
                generation_mode_join_prefix: '<members>',
                generation_mode_join_suffix: '</members>',
            }),
        });

        expect(response).toHaveProperty('ok', true);
        const createdGroup = await response.json();
        expect(createdGroup).toEqual(expect.objectContaining({
            hideMutedSprites: true,
        }));

        const savedGroup = JSON.parse(fs.readFileSync(
            path.join(directories.groups, `${createdGroup.id}.json`),
            'utf8',
        ));
        expect(savedGroup).toEqual(expect.objectContaining({
            hideMutedSprites: true,
        }));
    });
});
