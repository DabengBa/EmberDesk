import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { setConfigFilePath } from '../src/util.js';

// Set up config path before any module that calls getConfigValue at the top level
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-auth-test-'));
const tmpConfig = path.join(tmpDir, 'config.yaml');
fs.writeFileSync(tmpConfig, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfig);

// Dynamic import after config is set
const { getPasswordHash, getCookieSessionName, getSessionCookieAge, getCookieSecret } = await import('../src/user-auth.js');

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getPasswordHash', () => {
    test('deterministic for same input', () => {
        const h1 = getPasswordHash('mypassword', 'salt123');
        const h2 = getPasswordHash('mypassword', 'salt123');
        expect(h1).toBe(h2);
    });

    test('returns base64 string', () => {
        const hash = getPasswordHash('test', 'salt');
        expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    test('different password produces different hash', () => {
        const h1 = getPasswordHash('password1', 'salt');
        const h2 = getPasswordHash('password2', 'salt');
        expect(h1).not.toBe(h2);
    });

    test('different salt produces different hash', () => {
        const h1 = getPasswordHash('password', 'salt1');
        const h2 = getPasswordHash('password', 'salt2');
        expect(h1).not.toBe(h2);
    });
});

describe('getCookieSessionName', () => {
    test('returns string starting with "session-"', () => {
        const name = getCookieSessionName();
        expect(name).toMatch(/^session-[0-9a-f]{8}$/);
    });

    test('returns consistent value across calls', () => {
        const n1 = getCookieSessionName();
        const n2 = getCookieSessionName();
        expect(n1).toBe(n2);
    });
});

describe('getSessionCookieAge', () => {
    test('defaults to the RFC 6265 no-expiration cap', () => {
        expect(getSessionCookieAge()).toBe(400 * 24 * 60 * 60 * 1000);
    });
});

describe('getCookieSecret', () => {
    let dataTmpDir;

    beforeAll(() => {
        dataTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-cookie-test-'));
    });

    afterAll(() => {
        fs.rmSync(dataTmpDir, { recursive: true, force: true });
    });

    test('generates secret on first call and writes to file', () => {
        const secret = getCookieSecret(dataTmpDir);
        expect(typeof secret).toBe('string');
        expect(secret.length).toBeGreaterThan(0);
        const cookieFile = path.join(dataTmpDir, 'cookie-secret.txt');
        expect(fs.existsSync(cookieFile)).toBe(true);
    });

    test('returns same secret on second call (reads from file)', () => {
        const s1 = getCookieSecret(dataTmpDir);
        const s2 = getCookieSecret(dataTmpDir);
        expect(s1).toBe(s2);
    });
});
