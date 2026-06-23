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
        '      login: false',
        '      setup: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PAGES_SETUP;
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

async function createSetupRouteApp({ reactLoginDistRoot } = {}) {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-setup-react-data-'));
    tmpRoots.push(dataRoot);
    globalThis.DATA_ROOT = dataRoot;

    const usersModule = await import(`../src/users.js?setupRoute=${Date.now()}-${Math.random()}`);
    const middlewareModule = await import(`../src/middleware/react-login-serve.js?setupRoute=${Date.now()}-${Math.random()}`);
    const basePathModule = await import(`../src/react-login-feature.js?setupRoute=${Date.now()}-${Math.random()}`);
    const featureModule = await import(`../src/react-setup-feature.js?setupRoute=${Date.now()}-${Math.random()}`);

    await usersModule.initUserStorage(dataRoot);

    const app = express();
    app.get('/setup', usersModule.createSetupPageMiddleware({ reactLoginDistRoot }));
    app.get('/setup.html', (_request, response) => {
        response.sendFile('setup.html', { root: path.join(repoRoot, 'public') });
    });
    app.use(basePathModule.REACT_LOGIN_BASE_PATH, middlewareModule.getReactLoginServeMiddleware(reactLoginDistRoot));
    app.use(express.static(path.join(repoRoot, 'public'), {}));

    return { app, featureModule };
}

describe('setup React route flag', () => {
    jest.setTimeout(20_000);

    test('wires the React setup route through TanStack Form, Query, and Zod while reusing shared setup helpers', () => {
        const clientSource = fs.readFileSync(path.join(repoRoot, 'app', 'client.tsx'), 'utf8');
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'setup.tsx'), 'utf8');
        const helperSource = fs.readFileSync(path.join(repoRoot, 'app', 'lib', 'setup-helpers.ts'), 'utf8');
        const sharedSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'setup-shared.js'), 'utf8');

        expect(clientSource).toContain("import { QueryClient, QueryClientProvider } from '@tanstack/react-query';");
        expect(clientSource).toContain('<QueryClientProvider client={queryClient}>');
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

    test('keeps /setup on the legacy page when the React setup flag is disabled', async () => {
        const { app, featureModule } = await createSetupRouteApp();

        expect(featureModule.isReactSetupEnabled()).toBe(false);

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/setup`);
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('<section class="login-card login-card--setup" id="setupCard"');
            expect(body).toContain('<script src="scripts/setup.js" type="module"></script>');
        });
    });

    test('serves the React setup shell from /setup and keeps /setup.html as fallback when the flag is enabled', async () => {
        process.env.EMBERDESK_FEATURES_REACT_PAGES_SETUP = 'true';
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

        const { app, featureModule } = await createSetupRouteApp({ reactLoginDistRoot: distRoot });

        expect(featureModule.isReactSetupEnabled()).toBe(true);

        await usingApp(app, async (url) => {
            const setupResponse = await fetch(`${url}/setup`);
            expect(setupResponse.status).toBe(200);
            const setupBody = await setupResponse.text();
            expect(setupBody).toContain('/react/login/assets/setup.js');
            expect(setupBody).not.toContain('scripts/setup.js');

            const legacyResponse = await fetch(`${url}/setup.html`);
            expect(legacyResponse.status).toBe(200);
            const legacyBody = await legacyResponse.text();
            expect(legacyBody).toContain('<script src="scripts/setup.js" type="module"></script>');

            const assetResponse = await fetch(`${url}/react/login/assets/setup.js`);
            expect(assetResponse.status).toBe(200);
            expect(assetResponse.headers.get('content-type')).toContain('text/javascript');
            expect(await assetResponse.text()).toContain('react setup');
        });
    });
});
