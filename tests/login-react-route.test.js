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

const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-login-react-config-'));
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

function writeReactDist(label = 'login') {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), `emberdesk-${label}-react-dist-`));
    const assetsRoot = path.join(distRoot, 'assets');
    tmpRoots.push(distRoot);
    fs.mkdirSync(assetsRoot, { recursive: true });
    fs.writeFileSync(path.join(distRoot, 'index.html'), [
        '<!DOCTYPE html>',
        '<html lang="zh-CN">',
        '<head>',
        '  <meta charset="UTF-8" />',
        `  <title>EmberDesk React ${label}</title>`,
        `  <script type="module" crossorigin src="/react/login/assets/${label}.js"></script>`,
        '</head>',
        '<body><div id="root"></div></body>',
        '</html>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(assetsRoot, `${label}.js`), `console.log("react ${label}");`, 'utf8');
    return distRoot;
}

async function createLoginRouteApp({ reactLoginDistRoot } = {}) {
    globalThis.COMMAND_LINE_ARGS = { basicAuthMode: false };

    const usersModule = await import(`../src/users.js?loginRoute=${Date.now()}-${Math.random()}`);
    const middlewareModule = await import(`../src/middleware/react-login-serve.js?loginRoute=${Date.now()}-${Math.random()}`);
    const featureModule = await import(`../src/react-login-feature.js?loginRoute=${Date.now()}-${Math.random()}`);

    const app = express();
    app.use((request, _response, next) => {
        Object.assign(request, createRequestContext());
        next();
    });
    app.get('/login', usersModule.createLoginPageMiddleware({ reactLoginDistRoot }));
    app.get('/login.html', usersModule.createLegacyLoginHtmlRedirectMiddleware());
    app.use(featureModule.REACT_LOGIN_BASE_PATH, middlewareModule.getReactLoginServeMiddleware(reactLoginDistRoot));
    return { app, featureModule, usersModule };
}

describe('login React sole owner route', () => {
    jest.setTimeout(20_000);

    test('wires the React login route through TanStack Form, Query, and Zod', () => {
        const clientSource = fs.readFileSync(path.join(repoRoot, 'app', 'client.tsx'), 'utf8');
        const loginRouteSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'login.tsx'), 'utf8');

        expect(clientSource).toContain("import { QueryClient, QueryClientProvider } from '@tanstack/react-query';");
        expect(clientSource).toContain('<QueryClientProvider client={queryClient}>');
        expect(loginRouteSource).toContain("import { useForm } from '@tanstack/react-form';");
        expect(loginRouteSource).toContain("import { useMutation, useQuery } from '@tanstack/react-query';");
        expect(loginRouteSource).toContain("import { z } from 'zod';");
        expect(loginRouteSource).toContain('const loginSchema = z.object(');
        expect(loginRouteSource).toContain('const recoveryStep1Schema = z.object(');
        expect(loginRouteSource).toContain('const recoveryStep2Schema = z.object(');
        expect(loginRouteSource).toContain('const csrfTokenQuery = useQuery(');
        expect(loginRouteSource).toContain('const loginMutation = useMutation(');
        expect(loginRouteSource).toContain('const recoveryStep1Mutation = useMutation(');
        expect(loginRouteSource).toContain('const recoveryStep2Mutation = useMutation(');
        expect(loginRouteSource).toContain('const loginForm = useForm(');
        expect(loginRouteSource).toContain('const recoveryForm = useForm(');
    });

    test('shows a visible recovery-code hint once the reset flow reaches code entry', () => {
        const recoveryFormSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'login', 'RecoveryForm.tsx'), 'utf8');

        expect(recoveryFormSource).toContain('{currentStep === 2 && (');
        expect(recoveryFormSource).toContain('className="login-recovery-note"');
        expect(recoveryFormSource).toContain('恢复码会输出到服务端控制台，请联系管理员获取。');
    });

    test('serves React from /login and redirects /login.html while preserving supported query context', async () => {
        const distRoot = writeReactDist('login');
        const { app } = await createLoginRouteApp({ reactLoginDistRoot: distRoot });

        await usingApp(app, async (url) => {
            const loginResponse = await fetch(`${url}/login?noauto=1`);
            expect(loginResponse.status).toBe(200);
            const loginBody = await loginResponse.text();
            expect(loginBody).toContain('/react/login/assets/login.js');
            expect(loginBody).not.toContain('scripts/login.js');
            expect(loginBody).not.toContain('login-card');

            const legacyResponse = await fetch(`${url}/login.html?noauto=1&utm=bookmark`, { redirect: 'manual' });
            expect([301, 302, 307, 308]).toContain(legacyResponse.status);
            const location = legacyResponse.headers.get('location');
            expect(location).toMatch(/\/login\?/);
            expect(location).toContain('noauto=1');
            expect(location).toContain('utm=bookmark');

            const assetResponse = await fetch(`${url}/react/login/assets/login.js`);
            expect(assetResponse.status).toBe(200);
            expect(await assetResponse.text()).toContain('react login');
        });
    });

    test('returns an explicit error when the React build is missing instead of legacy HTML', async () => {
        const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-login-missing-'));
        tmpRoots.push(missingRoot);
        const { app } = await createLoginRouteApp({ reactLoginDistRoot: missingRoot });

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/login?noauto=1`);
            expect(response.status).toBeGreaterThanOrEqual(500);
            const body = await response.text();
            expect(body.toLowerCase()).toMatch(/react|build|missing|not found|unavailable/);
            expect(body).not.toContain('scripts/login.js');
            expect(body).not.toContain('id="loginCard"');
        });
    });

    test('removes legacy login page files and feature flag helpers from the runtime surface', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'login.html'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'login.js'))).toBe(false);
        const featureSource = fs.readFileSync(path.join(repoRoot, 'src', 'react-login-feature.js'), 'utf8');
        expect(featureSource).not.toContain('isReactLoginEnabled');
        expect(featureSource).toContain('REACT_LOGIN_BASE_PATH');
        const usersSource = fs.readFileSync(path.join(repoRoot, 'src', 'users.js'), 'utf8');
        expect(usersSource).not.toContain('isReactLoginEnabled');
        expect(usersSource).not.toContain("sendFile('login.html'");
    });
});
