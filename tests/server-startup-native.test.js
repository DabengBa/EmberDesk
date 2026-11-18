import { test, expect } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliUrl = pathToFileURL(path.join(repo, 'src/command-line.ts')).href;
const startupUrl = pathToFileURL(path.join(repo, 'src/server-startup.ts')).href;

test('native Node parses CLI overrides without a loader', () => {
    const script = `const { parseArgv } = await import(${JSON.stringify(cliUrl)});
        const args = parseArgv(['node', 'server.js', '--port', '8123', '--enableIPv4', 'auto']);
        if (args.port !== 8123 || args.enableIPv4 !== 'auto') process.exit(2);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: repo, encoding: 'utf8' });
    expect({ status: child.status, stderr: child.stderr }).toEqual({ status: 0, stderr: '' });
});

test('native startup exits when both network protocols are disabled', () => {
    const script = `globalThis.DATA_ROOT = process.env.DATA_ROOT;
        const { ServerStartup } = await import(${JSON.stringify(startupUrl)});
        await new ServerStartup(() => {}, { enableIPv4: false, enableIPv6: false }).start();`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: repo, encoding: 'utf8' });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('Both IPv6 and IPv4 are disabled or not detected');
});

test('real entry starts from an isolated cwd and handles SIGTERM', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-native-start-'));
    const config = path.join(root, 'config.yaml');
    const data = path.join(root, 'data');
    const profile = path.join(root, 'startup-profile.json');
    const defaultConfig = fs.readFileSync(path.join(repo, 'default/config.yaml'), 'utf8');
    fs.writeFileSync(config, defaultConfig.replace(/^enableUserAccounts: true$/m, 'enableUserAccounts: false'));
    const child = spawn(process.execPath, [path.join(repo, 'server.js'), '--dataRoot', data, '--configPath', config,
        '--port', '0', '--listen', 'false', '--browserLaunchEnabled', 'false'], {
        cwd: root,
        env: { ...process.env, EMBERDESK_STARTUP_PROFILE: profile },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const closed = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
    try {
        for (let i = 0; i < 400 && child.exitCode === null && !fs.existsSync(profile); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        expect({ profileExists: fs.existsSync(profile), output }).toEqual(expect.objectContaining({
            profileExists: true,
            output: expect.stringContaining('EmberDesk is listening on'),
        }));
        const startup = JSON.parse(fs.readFileSync(profile, 'utf8'));
        const stages = startup.stages.map(stage => stage.name);
        const order = ['initUserStorage', 'verifySecuritySettings', 'getUserDirectoriesList', 'loadPlugins',
            'initPrivateRequestFilter', 'initRequestProxy', 'apply404Middleware', 'serverStartup.start'];
        const indices = order.map(name => stages.indexOf(name));
        expect(indices.every(index => index >= 0)).toBe(true);
        expect(indices).toEqual([...indices].sort((a, b) => a - b));
        expect(fs.existsSync(path.join(data, 'default-user'))).toBe(true);
        child.kill('SIGTERM');
        expect(await closed).toEqual({ code: 0, signal: null });
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await closed;
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 30000);

test('real authenticated multipart uploads stage separately and startup clears stale uploads', async () => {
    const port = await new Promise((resolve, reject) => {
        const probe = net.createServer().once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-upload-staging-'));
    const data = path.join(root, 'data');
    const config = path.join(root, 'config.yaml');
    const legacy = path.join(data, '_uploads');
    const users = ['alice', 'bob'];
    const staging = handle => path.join(data, handle, '_uploads');
    const stagedFile = 'stale-upload';
    const base = `http://127.0.0.1:${port}`;
    let child;
    let closed;
    let output = '';
    try {
        fs.copyFileSync(path.join(repo, 'default/config.yaml'), config);
        const seed = spawnSync(process.execPath, ['--input-type=module', '-e', `
            import storage from 'node-persist';
            import { getPasswordHash, getPasswordSalt } from './src/user-auth.ts';
            await storage.init({ dir: process.argv[1], expiredInterval: 0 });
            for (const handle of ${JSON.stringify(users)}) {
                const salt = getPasswordSalt();
                await storage.setItem('user:' + handle, { handle, name: handle, enabled: true, admin: handle === 'alice',
                    created: Date.now(), password: getPasswordHash('fixture-password', salt), salt });
            }
        `, path.join(data, '_storage')], { cwd: repo, encoding: 'utf8', timeout: 5000 });
        expect({ status: seed.status, error: seed.stderr }).toEqual({ status: 0, error: '' });
        for (const directory of [legacy, ...users.map(staging)]) {
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(path.join(directory, stagedFile), 'stale');
        }
        child = spawn(process.execPath, [path.join(repo, 'server.js'), '--dataRoot', data, '--configPath', config,
            '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false'], {
            cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });
        closed = new Promise(resolve => child.once('close', resolve));
        for (let i = 0; i < 300 && child.exitCode === null && !output.includes('EmberDesk is listening on'); i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        expect(output).toContain('EmberDesk is listening on');

        const session = async handle => {
            const response = await fetch(`${base}/csrf-token`);
            const { token } = await response.json();
            const getCookie = res => res.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
            let cookie = getCookie(response);
            if (handle) {
                const login = await fetch(`${base}/api/users/login`, {
                    method: 'POST', headers: { cookie, 'x-csrf-token': token, 'content-type': 'application/json' },
                    body: JSON.stringify({ handle, password: 'fixture-password' }),
                });
                expect(await login.json()).toEqual({ handle });
                cookie = getCookie(login);
            }
            return { cookie, 'x-csrf-token': token };
        };
        const upload = async (headers, contents, field = 'avatar') => {
            const body = new FormData();
            // The route validates convertedData without consuming the staged file.
            body.set('convertedData', '{}');
            body.set(field, new Blob([contents]), 'same-name.json');
            const response = await fetch(`${base}/api/worldinfo/import`, { method: 'POST', headers, body });
            return { status: response.status, text: await response.text() };
        };
        expect(await upload(await session(), 'anonymous')).toMatchObject({ status: 403 });
        const alice = await session('alice');
        expect(await upload({ cookie: alice.cookie }, 'missing-csrf')).toMatchObject({ status: 500 });
        const unexpected = await upload(alice, 'wrong-field', 'other');
        expect(unexpected.status).toBe(500);

        const names = [];
        for (const [handle, headers] of [['alice', alice], ['bob', await session('bob')]]) {
            expect(await upload(headers, `${handle}-file`)).toEqual({ status: 400, text: 'Is not a valid world info file' });
            const files = fs.readdirSync(staging(handle)).filter(name => name !== stagedFile);
            expect(files).toEqual([expect.stringMatching(/^[a-f0-9]{32}$/)]);
            expect(fs.readFileSync(path.join(staging(handle), files[0]), 'utf8')).toBe(`${handle}-file`);
            names.push(files[0]);
        }
        expect(new Set(names).size).toBe(2);
        expect(output).toContain('Invalid CSRF token');
        expect(output).toContain('LIMIT_UNEXPECTED_FILE');
        expect(fs.readdirSync(legacy)).toEqual([]);
        for (const handle of users) expect(fs.existsSync(path.join(staging(handle), stagedFile))).toBe(false);
    } finally {
        if (child?.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await closed;
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 30000);
