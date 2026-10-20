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
    test('startup performance probe does not wait for retired global backgrounds', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'scripts/startup-performance-runner.mjs'), 'utf8');

        expect(source).not.toContain('deferred.getBackgrounds');
    });

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
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'backgrounds', '__transparent.png'))).toBe(false);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'backgrounds'))).toBe(true);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'settings.json'))).toBe(false);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'storage', 'emberdesk.sqlite'))).toBe(true);
        // Quick Replies are retired; dev seeds no longer ship a default preset.
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'QuickReplies', 'Default.json'))).toBe(false);
    });

    test('seeds embedded lorebooks in app-compatible formats', async () => {
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

        // Dev seeds no longer write group chats.
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'group chats'))).toBe(false);
    });
});
