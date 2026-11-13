import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('legacy login page controller retirement', () => {
    test('removes the legacy login controller and HTML page', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'login.js'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'login.html'))).toBe(false);
    });

    test('exposes working standalone React login helpers', async () => {
        const { buildHomeRedirectUrl, getLoginErrorMessage, getPasswordVisibilityState, getRecoveryStep, loginMessages } = await loadTsModule('app/lib/login-helpers.ts');
        expect(getLoginErrorMessage('Incorrect credentials')).toBe(loginMessages.incorrectCredentials);
        expect(getLoginErrorMessage(null)).toBe(loginMessages.genericError);
        expect(buildHomeRedirectUrl('https://example.test/login?noauto=1&next=chat')).toBe('https://example.test/?next=chat');
        expect(getPasswordVisibilityState('password')).toMatchObject({ type: 'text', ariaPressed: 'true', ariaLabel: loginMessages.hidePassword });
        expect(getRecoveryStep({ step1Display: 'none', step2Display: 'block' })).toBe(2);
        expect(getRecoveryStep({ step1Display: 'block', step2Display: 'none' })).toBe(1);
    });
});
