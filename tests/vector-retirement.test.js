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
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-vector-retirement-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, 'extensions:\n  enabled: true\n', 'utf8');
setConfigFilePath(configPath);

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

describe('built-in vector retirement', () => {
    test('legacy vector routes return a stable 410 JSON response without touching legacy data', async () => {
        const { setupPrivateEndpoints } = await import('../src/server-startup.js');
        const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-vector-retirement-'));
        const legacyFile = path.join(legacyRoot, 'vectors', 'chat', 'collection', 'index.json');
        fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
        fs.writeFileSync(legacyFile, '{"legacy":true}', 'utf8');

        const app = express();
        setupPrivateEndpoints(app);
        const { server, url } = await listen(app);

        try {
            for (const route of ['query', 'unknown-retired-route']) {
                const response = await fetch(`${url}/api/vector/${route}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: '{}',
                });

                expect(response.status).toBe(410);
                expect(response.headers.get('content-type')).toContain('application/json');
                await expect(response.json()).resolves.toEqual({
                    error: 'vector_feature_removed',
                    message: 'Built-in vector functionality has been removed from EmberDesk.',
                });
            }

            expect(fs.readFileSync(legacyFile, 'utf8')).toBe('{"legacy":true}');
        } finally {
            await new Promise(resolve => server.close(resolve));
            fs.rmSync(legacyRoot, { recursive: true, force: true });
        }
    });

    test('the retired first-party implementation and mounts are absent', () => {
        expect(fs.existsSync(path.join(repoRoot, 'src', 'vectors'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'extensions', 'vectors'))).toBe(false);
        expect(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).not.toContain('"vectra"');
        expect(fs.readFileSync(path.join(repoRoot, 'bun.lock'), 'utf8')).not.toContain('"vectra"');
        expect(fs.readFileSync(path.join(repoRoot, 'src', 'transformers.js'), 'utf8')).not.toContain('feature-extraction');
        expect(fs.readFileSync(path.join(repoRoot, 'src', 'config-init.js'), 'utf8')).not.toContain('extensions.models.embedding');

        const workspaceHtml = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');
        expect(workspaceHtml).not.toContain('vectors_container');
        expect(workspaceHtml).not.toContain('value="vectorized"');
        expect(fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'itemizationChat.html'), 'utf8')).not.toContain('Vector Storage');
        expect(fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'itemizationText.html'), 'utf8')).not.toContain('Vector Storage');
    });
});

afterAll(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
});
