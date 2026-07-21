import { afterAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-chat-retirement-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, 'extensions:\n  enabled: true\n', 'utf8');
setConfigFilePath(configPath);

const RETIRED_BODY = {
    error: 'group_chat_feature_removed',
    message: 'Group chat functionality has been removed from EmberDesk.',
};

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}`,
            });
        });
    });
}

async function withRetiredApp(run) {
    const { setupPrivateEndpoints } = await import('../src/server-startup.js');
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-group-chat-retirement-'));
    const previousDataRoot = globalThis.DATA_ROOT;
    globalThis.DATA_ROOT = dataRoot;
    const { getUserDirectories } = await import('../src/user-directories.js');
    const directories = getUserDirectories('group-chat-retirement-user');
    fs.mkdirSync(directories.groups, { recursive: true });
    fs.mkdirSync(directories.groupChats, { recursive: true });
    fs.mkdirSync(directories.chats, { recursive: true });

    const groupFile = path.join(directories.groups, 'legacy-group.json');
    const groupChatFile = path.join(directories.groupChats, 'legacy-chat.jsonl');
    const groupPayload = JSON.stringify({ id: 'legacy-group', name: 'Legacy', members: [], chats: ['legacy-chat'] }, null, 2);
    const chatPayload = '{"user_name":"User","character_name":"Char"}\n{"name":"User","is_user":true,"mes":"hi"}\n';
    fs.writeFileSync(groupFile, groupPayload, 'utf8');
    fs.writeFileSync(groupChatFile, chatPayload, 'utf8');

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use((request, _response, next) => {
        request.user = {
            profile: { handle: 'group-chat-retirement-user' },
            directories,
        };
        next();
    });
    setupPrivateEndpoints(app);
    const { server, url } = await listen(app);

    try {
        await run({ url, directories, groupFile, groupChatFile, groupPayload, chatPayload });
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataRoot, { recursive: true, force: true });
        globalThis.DATA_ROOT = previousDataRoot;
    }
}

describe('group chat retirement', () => {
    test('group definition routes return stable 410 JSON without touching disk files', async () => {
        await withRetiredApp(async ({ url, groupFile, groupChatFile, groupPayload, chatPayload }) => {
            for (const route of ['/all', '/create', '/edit', '/delete', '/unknown-retired-route']) {
                const response = await fetch(`${url}/api/groups${route}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: 'legacy-group', name: 'Nope' }),
                });
                expect(response.status).toBe(410);
                expect(response.headers.get('content-type')).toContain('application/json');
                await expect(response.json()).resolves.toEqual(RETIRED_BODY);
            }

            expect(fs.readFileSync(groupFile, 'utf8')).toBe(groupPayload);
            expect(fs.readFileSync(groupChatFile, 'utf8')).toBe(chatPayload);
        });
    });

    test('chat group endpoints and is_group write paths return 410 without mutating files', async () => {
        await withRetiredApp(async ({ url, groupFile, groupChatFile, groupPayload, chatPayload }) => {
            for (const route of ['/group/get', '/group/info', '/group/save', '/group/delete', '/group/import']) {
                const response = await fetch(`${url}/api/chats${route}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        id: 'legacy-chat',
                        chat: '[]',
                        file: 'legacy-chat.jsonl',
                        is_group: true,
                    }),
                });
                expect(response.status).toBe(410);
                await expect(response.json()).resolves.toEqual(RETIRED_BODY);
            }

            const renameResponse = await fetch(`${url}/api/chats/rename`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    is_group: true,
                    original_file: 'legacy-chat.jsonl',
                    renamed_file: 'renamed-chat.jsonl',
                }),
            });
            expect(renameResponse.status).toBe(410);
            await expect(renameResponse.json()).resolves.toEqual(RETIRED_BODY);

            const exportResponse = await fetch(`${url}/api/chats/export`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    is_group: true,
                    file: 'legacy-chat.jsonl',
                }),
            });
            expect(exportResponse.status).toBe(410);
            await expect(exportResponse.json()).resolves.toEqual(RETIRED_BODY);

            expect(fs.readFileSync(groupFile, 'utf8')).toBe(groupPayload);
            expect(fs.readFileSync(groupChatFile, 'utf8')).toBe(chatPayload);
            expect(fs.existsSync(path.join(path.dirname(groupChatFile), 'renamed-chat.jsonl'))).toBe(false);
        });
    });

    test('retired implementation surface replaces live group CRUD module', () => {
        const groupsSource = fs.readFileSync(path.join(repoRoot, 'src', 'endpoints', 'groups.js'), 'utf8');
        expect(groupsSource).toMatch(/group_chat_feature_removed|group-chat-retirement/);
        expect(groupsSource).not.toMatch(/writeFileAtomicSync\(pathToFile/);
        expect(fs.existsSync(path.join(repoRoot, 'src', 'endpoints', 'group-chat-retirement.js'))).toBe(true);
    });
});

afterAll(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
});
