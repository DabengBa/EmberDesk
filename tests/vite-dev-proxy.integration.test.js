import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, test } from '@jest/globals';
import { getDevServerConfig } from '../vite-dev-server-config.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Vite development proxy', () => {
    test('uses the Express default and supports explicit custom settings', () => {
        const defaults = getDevServerConfig({});
        expect(defaults.port).toBe(3001);
        expect(defaults.proxy['/api']).toEqual({
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
        });
        expect(defaults.proxy['/react/login']).toEqual({
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
        });
        expect(defaults.proxy['/User%20Avatars']).toEqual({
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
        });

        const custom = getDevServerConfig({
            VITE_BACKEND_ORIGIN: 'http://127.0.0.1:8123',
            VITE_DEV_PORT: '3010',
        });
        expect(custom.port).toBe(3010);
        expect(custom.proxy['/style.css'].target).toBe('http://127.0.0.1:8123');
    });

    test('preserves CSRF state and proxies pages and legacy assets without SPA fallback', async () => {
        try {
            const result = await execFileAsync(process.execPath, [
                'tests/vite-dev-proxy.integration.runner.mjs',
            ], {
                cwd: repoRoot,
                env: process.env,
                maxBuffer: 1024 * 1024,
            });
            expect(result.stdout).toContain('vite-dev-proxy: ok');
        } catch (error) {
            throw new Error([
                error.message,
                error.stdout,
                error.stderr,
            ].filter(Boolean).join('\n'));
        }
    });
});
