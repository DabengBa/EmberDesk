import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('legacy setup page controller retirement', () => {
    test('removes the legacy setup controller and HTML page', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'setup.js'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'setup.html'))).toBe(false);
    });

    test('exposes working standalone React setup helpers', async () => {
        const { buildSetupRequestBody, getSetupErrorMessage, getSetupPasswordVisibilityState, setupMessages } = await loadTsModule('app/lib/setup-helpers.ts');
        const data = { handle: 'alice', name: 'Alice', password: 'secret123' };
        expect(buildSetupRequestBody('fresh', data)).toEqual(data);
        expect(buildSetupRequestBody('set-password', data)).toEqual({ password: 'secret123' });
        expect(getSetupErrorMessage('User already exists')).toBe(setupMessages.userExists);
        expect(getSetupErrorMessage(null)).toBe(setupMessages.genericError);
        expect(getSetupPasswordVisibilityState('password')).toMatchObject({ type: 'text', ariaPressed: 'true', ariaLabel: setupMessages.hidePassword });
        expect(getSetupPasswordVisibilityState('text')).toMatchObject({ type: 'password', ariaPressed: 'false', ariaLabel: setupMessages.showPassword });
    });
});
