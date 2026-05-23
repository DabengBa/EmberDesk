import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';
import { parse as parseCharacterCard } from '../src/character-card-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const tempRoots = [];

afterEach(() => {
    while (tempRoots.length > 0) {
        const root = tempRoots.pop();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('seed-dev-environment', () => {
    test('creates the default content required for a clean first load', () => {
        const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-seed-dev-'));
        tempRoots.push(sandboxRoot);

        const dataRoot = path.join(sandboxRoot, 'data-root');
        const configPath = path.join(sandboxRoot, 'config.dev-local.yaml');

        execFileSync(
            process.execPath,
            [
                'scripts/seed-dev-environment.mjs',
                '--profile',
                'small',
                '--data-root',
                dataRoot,
                '--config',
                configPath,
            ],
            {
                cwd: repoRoot,
                stdio: 'pipe',
            },
        );

        expect(fs.existsSync(path.join(dataRoot, '_css', 'user.css'))).toBe(true);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'backgrounds', '__transparent.png'))).toBe(true);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'QuickReplies', 'Default.json'))).toBe(true);
    });

    test('seeds embedded lorebooks and group-chat messages in app-compatible formats', async () => {
        const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-seed-dev-'));
        tempRoots.push(sandboxRoot);

        const dataRoot = path.join(sandboxRoot, 'data-root');
        const configPath = path.join(sandboxRoot, 'config.dev-local.yaml');

        execFileSync(
            process.execPath,
            [
                'scripts/seed-dev-environment.mjs',
                '--profile',
                'small',
                '--data-root',
                dataRoot,
                '--config',
                configPath,
            ],
            {
                cwd: repoRoot,
                stdio: 'pipe',
            },
        );

        const characterPath = path.join(dataRoot, 'default-user', 'characters', 'dev-character-001.png');
        const rawCard = await parseCharacterCard(characterPath, 'png');
        const card = JSON.parse(rawCard);
        const book = card.data?.character_book;

        expect(book).toEqual(expect.objectContaining({
            entries: expect.any(Array),
        }));
        expect(book.entries[0]).toEqual(expect.objectContaining({
            id: expect.any(Number),
            keys: expect.any(Array),
            insertion_order: expect.any(Number),
            enabled: expect.any(Boolean),
            extensions: expect.any(Object),
        }));
        expect(book.entries[0].keys.length).toBeGreaterThan(0);

        const groupChatPath = path.join(dataRoot, 'default-user', 'group chats', 'dev-group-001-chat-1.jsonl');
        const lines = fs.readFileSync(groupChatPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        const botMessage = lines.find(line => line && line.is_user === false && line.is_system === false);

        expect(botMessage).toEqual(expect.objectContaining({
            name: expect.any(String),
            original_avatar: expect.any(String),
            force_avatar: expect.any(String),
        }));
        expect(botMessage.original_avatar.endsWith('.png')).toBe(true);
        expect(botMessage.force_avatar).toContain(encodeURIComponent(botMessage.original_avatar));
    });
});
