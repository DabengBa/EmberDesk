import { test, expect } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
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
