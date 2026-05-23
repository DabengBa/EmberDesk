import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';

const tempDirs = [];
let SecretManager;
let SECRET_KEYS;

beforeAll(async () => {
    const { setConfigFilePath } = await import('../src/util.js');
    setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));
    ({ SecretManager, SECRET_KEYS } = await import('../src/endpoints/secrets.js'));
});

function createDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-secrets-'));
    const backups = path.join(root, 'backups');
    fs.mkdirSync(backups);
    tempDirs.push(root);
    return { root, backups };
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe('SecretManager custom key migration', () => {
    test('preserves a distinct custom key when OpenAI already exists', () => {
        const directories = createDirectories();
        const manager = new SecretManager(directories);

        manager.writeSecret(SECRET_KEYS.OPENAI, 'openai-key', 'OpenAI');
        manager.writeSecret(SECRET_KEYS.CUSTOM, 'custom-key', 'Custom endpoint');
        manager.migrateCustomToOpenAI();

        expect(manager.readSecret(SECRET_KEYS.OPENAI)).toBe('openai-key');
        expect(manager.readSecret(SECRET_KEYS.CUSTOM)).toBe('custom-key');
    });

    test('moves custom key to OpenAI and removes legacy custom key when OpenAI is empty', () => {
        const directories = createDirectories();
        const manager = new SecretManager(directories);

        manager.writeSecret(SECRET_KEYS.CUSTOM, 'custom-key', 'Custom endpoint');
        manager.migrateCustomToOpenAI();

        expect(manager.readSecret(SECRET_KEYS.OPENAI)).toBe('custom-key');
        expect(manager.readSecret(SECRET_KEYS.CUSTOM)).toBe('');
    });
});
