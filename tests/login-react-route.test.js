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
        '      login: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PAGES_LOGIN;
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
    app.get('/login.html', (_request, response) => {
        response.sendFile('login.html', { root: path.join(repoRoot, 'public') });
    });
    app.use(featureModule.REACT_LOGIN_BASE_PATH, middlewareModule.getReactLoginServeMiddleware(reactLoginDistRoot));
    app.use(express.static(path.join(repoRoot, 'public'), {}));
    return app;
}

describe('login React route flag', () => {
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
        expect(recoveryFormSource).not.toContain('border-zinc');
        expect(recoveryFormSource).not.toContain('bg-zinc');
    });

    test('keeps account lockout distinct from login submission copy', () => {
        const loginRouteSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'login.tsx'), 'utf8');
        const loginFormSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'login', 'LoginForm.tsx'), 'utf8');

        expect(loginRouteSource).toContain('isSubmitting={loginMutation.isPending}');
        expect(loginRouteSource).toContain('isLockedOut={lockoutSeconds !== null}');
        expect(loginRouteSource).not.toContain('isSubmitting={loginMutation.isPending || lockoutSeconds !== null}');
        expect(loginFormSource).toContain('const controlsDisabled = isSubmitting || isLockedOut;');
        expect(loginFormSource).toContain("const buttonLabel = isSubmitting ? '登录中...' : isLockedOut ? '已锁定' : '登录';");
        expect(loginFormSource).toContain('disabled={controlsDisabled}');
    });

    test('keeps /login on the legacy page when the React flag is disabled', async () => {
        const app = await createLoginRouteApp();

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/login?noauto=1`);
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('<section class="login-card login-card--entry" id="loginCard"');
            expect(body).toContain('<script src="scripts/login.js" type="module"></script>');
        });
    });

    test('serves the React login shell from /login and keeps /login.html as fallback when the flag is enabled', async () => {
        process.env.EMBERDESK_FEATURES_REACT_PAGES_LOGIN = 'true';
        const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-login-react-dist-'));
        const assetsRoot = path.join(distRoot, 'assets');
        tmpRoots.push(distRoot);
        fs.mkdirSync(assetsRoot, { recursive: true });
        fs.writeFileSync(path.join(distRoot, 'index.html'), [
            '<!DOCTYPE html>',
            '<html lang="zh-CN">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <title>EmberDesk React Login</title>',
            '  <script type="module" crossorigin src="/react/login/assets/login.js"></script>',
            '</head>',
            '<body><div id="root"></div></body>',
            '</html>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(assetsRoot, 'login.js'), 'console.log("react login");', 'utf8');

        const app = await createLoginRouteApp({ reactLoginDistRoot: distRoot });

        await usingApp(app, async (url) => {
            const loginResponse = await fetch(`${url}/login?noauto=1`);
            expect(loginResponse.status).toBe(200);
            const loginBody = await loginResponse.text();
            expect(loginBody).toContain('/react/login/assets/login.js');
            expect(loginBody).not.toContain('scripts/login.js');

            const legacyResponse = await fetch(`${url}/login.html`);
            expect(legacyResponse.status).toBe(200);
            const legacyBody = await legacyResponse.text();
            expect(legacyBody).toContain('<script src="scripts/login.js" type="module"></script>');

            const assetResponse = await fetch(`${url}/react/login/assets/login.js`);
            expect(assetResponse.status).toBe(200);
            expect(assetResponse.headers.get('content-type')).toContain('text/javascript');
            expect(await assetResponse.text()).toContain('react login');
        });
    });
});
