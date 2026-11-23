import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, test } from '@jest/globals';
import { parse as parseCharacterCard } from '../src/character-card-parser.ts';

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

    test('writes the canonical config even when passed a legacy config path', () => {
        const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-seed-dev-'));
        tempRoots.push(sandboxRoot);

        const dataRoot = path.join(sandboxRoot, 'data-root "quoted"');
        const configPath = path.join(sandboxRoot, 'config.dev-local.jsonc');
        const legacyPath = path.join(sandboxRoot, 'config.dev-local.yaml');
        const legacy = 'port: 8123\n';
        fs.writeFileSync(legacyPath, legacy);
        fs.writeFileSync(configPath, '{"dataRoot":"old-data"}');

        execFileSync(
            process.execPath,
            [
                'scripts/seed-dev-environment.mjs',
                '--profile',
                'small',
                '--data-root',
                dataRoot,
                '--config',
                legacyPath,
            ],
            {
                cwd: repoRoot,
                stdio: 'pipe',
            },
        );

        expect(fs.readFileSync(legacyPath, 'utf8')).toBe(legacy);
        expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({
            dataRoot,
            listen: false,
            port: 8000,
            browserLaunch: { enabled: false },
            enableUserAccounts: true,
            whitelistMode: false,
            skipContentCheck: true,
            logging: { minLogLevel: 1 },
        });
        expect(fs.existsSync(path.join(dataRoot, '_css', 'user.css'))).toBe(true);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'backgrounds', '__transparent.png'))).toBe(false);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'backgrounds'))).toBe(true);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'settings.json'))).toBe(false);
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'storage', 'emberdesk.sqlite'))).toBe(true);
        const db = new DatabaseSync(path.join(dataRoot, 'default-user', 'storage', 'emberdesk.sqlite'), { readOnly: true });
        try {
            const row = db.prepare('SELECT payload_json, source FROM preset_documents WHERE api_id = ? AND name = ?').get('openai', 'Default');
            expect(row).toBeDefined();
            expect(row.source).toBe('seed');
            expect(JSON.parse(row.payload_json)).toEqual(JSON.parse(fs.readFileSync(path.join(repoRoot, 'default/content/presets/openai/Default.json'), 'utf8')));
        } finally {
            db.close();
        }
        // Quick Replies are retired; dev seeds no longer ship a default preset.
        expect(fs.existsSync(path.join(dataRoot, 'default-user', 'QuickReplies', 'Default.json'))).toBe(false);
    });

    test('seeds embedded lorebooks in app-compatible formats', async () => {
        const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-seed-dev-'));
        tempRoots.push(sandboxRoot);

        const dataRoot = path.join(sandboxRoot, 'data-root');
        const configPath = path.join(sandboxRoot, 'config.dev-local.jsonc');

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
