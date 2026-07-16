import { afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-setup-react-config-'));
const configPath = path.join(tmpConfigDir, 'config.yaml');
const tmpRoots = [];

beforeAll(() => {
    fs.writeFileSync(configPath, [
        'enableUserAccounts: true',
        'features:',
        '  react:',
        '    pages:',
        '      settings: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

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

async function usingApp(app, callback) {
    const { server, url } = await listen(app);
    try {
        return await callback(url);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

function createRequestContext() {
    return {
        session: {},
        user: null,
    };
}

function writeReactDist() {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-setup-react-dist-'));
    const assetsRoot = path.join(distRoot, 'assets');
    tmpRoots.push(distRoot);
    fs.mkdirSync(assetsRoot, { recursive: true });
    fs.writeFileSync(path.join(distRoot, 'index.html'), [
        '<!DOCTYPE html>',
        '<html lang="zh-CN">',
        '<head>',
        '  <meta charset="UTF-8" />',
        '  <title>EmberDesk React Setup</title>',
        '  <script type="module" crossorigin src="/react/login/assets/setup.js"></script>',
        '</head>',
        '<body><div id="root"></div></body>',
        '</html>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(assetsRoot, 'setup.js'), 'console.log("react setup");', 'utf8');
    return distRoot;
}

async function createSetupRouteApp({ reactLoginDistRoot } = {}) {
    globalThis.COMMAND_LINE_ARGS = { basicAuthMode: false };

    const usersModule = await import(`../src/users.js?setupRoute=${Date.now()}-${Math.random()}`);
    const middlewareModule = await import(`../src/middleware/react-login-serve.js?setupRoute=${Date.now()}-${Math.random()}`);
    const basePathModule = await import(`../src/react-login-feature.js?setupRoute=${Date.now()}-${Math.random()}`);

    const app = express();
    app.use((request, _response, next) => {
        Object.assign(request, createRequestContext());
        next();
    });
    app.get('/setup', usersModule.createSetupPageMiddleware({
        reactLoginDistRoot,
        forceNeedsSetup: true,
    }));
    app.get('/setup.html', usersModule.createLegacySetupHtmlRedirectMiddleware());
    app.use(basePathModule.REACT_LOGIN_BASE_PATH, middlewareModule.getReactLoginServeMiddleware(reactLoginDistRoot));
    return { app, usersModule };
}

describe('setup React sole owner route', () => {
    jest.setTimeout(20_000);

    test('wires the React setup route through shared helpers and TanStack Form/Query/Zod', () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'setup.tsx'), 'utf8');
        const helperSource = fs.readFileSync(path.join(repoRoot, 'app', 'lib', 'setup-helpers.ts'), 'utf8');
        const sharedSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'setup-shared.js'), 'utf8');

        expect(routeSource).toContain("import { useForm } from '@tanstack/react-form';");
        expect(routeSource).toContain("import { useMutation, useQuery } from '@tanstack/react-query';");
        expect(routeSource).toContain("import { z } from 'zod';");
        expect(routeSource).toContain("import { buildSetupRequestBody, getSetupErrorMessage, setupMessages } from '@/lib/setup-helpers';");
        expect(routeSource).toContain('const freshSchema = z.object(');
        expect(routeSource).toContain('const setPasswordSchema = z.object(');
        expect(routeSource).toContain('const setupModeQuery = useQuery(');
        expect(routeSource).toContain('const csrfTokenQuery = useQuery(');
        expect(routeSource).toContain('const setupMutation = useMutation(');
        expect(routeSource).toContain('const setupForm = useForm(');
        expect(helperSource).toContain("from '../../public/scripts/setup-shared.js';");
        expect(sharedSource).toContain('export const setupMessages = {');
        expect(sharedSource).toContain('export function getSetupErrorMessage');
        expect(sharedSource).toContain('export function getSetupPasswordVisibilityState');
        expect(sharedSource).toContain('export function buildSetupRequestBody');
    });

    test('serves React from /setup and redirects /setup.html while preserving supported query context', async () => {
        const distRoot = writeReactDist();
        const { app } = await createSetupRouteApp({ reactLoginDistRoot: distRoot });

        await usingApp(app, async (url) => {
            const setupResponse = await fetch(`${url}/setup?from=bookmark`);
            expect(setupResponse.status).toBe(200);
            const setupBody = await setupResponse.text();
            expect(setupBody).toContain('/react/login/assets/setup.js');
            expect(setupBody).not.toContain('scripts/setup.js');

            const legacyResponse = await fetch(`${url}/setup.html?from=bookmark`, { redirect: 'manual' });
            expect([301, 302, 307, 308]).toContain(legacyResponse.status);
            const location = legacyResponse.headers.get('location');
            expect(location).toMatch(/\/setup/);
            expect(location).toContain('from=bookmark');

            const assetResponse = await fetch(`${url}/react/login/assets/setup.js`);
            expect(assetResponse.status).toBe(200);
            expect(await assetResponse.text()).toContain('react setup');
        });
    });

    test('returns an explicit error when the React build is missing instead of legacy HTML', async () => {
        const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-setup-missing-'));
        tmpRoots.push(missingRoot);
        const { app } = await createSetupRouteApp({ reactLoginDistRoot: missingRoot });

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/setup`);
            expect(response.status).toBeGreaterThanOrEqual(500);
            const body = await response.text();
            expect(body.toLowerCase()).toMatch(/react|build|missing|not found|unavailable/);
            expect(body).not.toContain('scripts/setup.js');
            expect(body).not.toContain('id="setupCard"');
        });
    });

    test('removes legacy setup page files and feature flag helpers from the runtime surface', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'setup.html'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'setup.js'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'src', 'react-setup-feature.js'))).toBe(false);
        const usersSource = fs.readFileSync(path.join(repoRoot, 'src', 'users.js'), 'utf8');
        expect(usersSource).not.toContain('isReactSetupEnabled');
        expect(usersSource).not.toContain("sendFile('setup.html'");
    });
});
