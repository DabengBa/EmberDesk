import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@jest/globals';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('new default user receives world content on first startup', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-startup-default-'));
    const data = path.join(root, 'data');
    const config = path.join(root, 'config.yaml');
    fs.mkdirSync(data);
    const defaultConfig = fs.readFileSync(path.join(repo, 'default/config.yaml'), 'utf8');
    fs.writeFileSync(config, defaultConfig.replace(/^enableUserAccounts: true$/m, 'enableUserAccounts: false'));
    const child = spawn(process.execPath, [path.join(repo, 'server.js'), '--dataRoot', data, '--configPath', config, '--port', '0', '--listen', 'false', '--browserLaunchEnabled', 'false'], { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const closed = new Promise(resolve => child.on('close', resolve));
    try {
        for (let i = 0; i < 400 && child.exitCode === null && !output.includes('EmberDesk is listening on'); i++) await new Promise(resolve => setTimeout(resolve, 50));
        expect(output).toContain('EmberDesk is listening on');
        expect(fs.existsSync(path.join(data, 'default-user', 'worlds', 'Eldoria.json'))).toBe(true);
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await closed;
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 30000);

test.each(['new', 'existing'])('isolated %s data root reaches real server listening', async kind => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-startup-'));
    const data = path.join(root, 'data');
    const config = path.join(root, 'config.yaml');
    fs.mkdirSync(data);
    fs.copyFileSync(path.join(repo, 'default/config.yaml'), config);
    if (kind === 'existing') {
        fs.mkdirSync(path.join(data, 'default-user'));
        fs.writeFileSync(path.join(data, 'default-user', 'sentinel'), 'preserve');
    }
    const child = spawn(process.execPath, [path.join(repo, 'server.js'), '--dataRoot', data, '--configPath', config, '--port', '0', '--listen', 'false', '--browserLaunchEnabled', 'false'], { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', c => { output += c; });
    child.stderr.on('data', c => { output += c; });
    const closed = new Promise(resolve => child.on('close', resolve));
    try {
        for (let i = 0; i < 400 && child.exitCode === null && !output.includes('EmberDesk is listening on'); i++) await new Promise(resolve => setTimeout(resolve, 50));
        expect(output).toContain('EmberDesk is listening on');
        if (kind === 'existing') {
            expect(fs.readFileSync(path.join(data, 'default-user', 'sentinel'), 'utf8')).toBe('preserve');
            expect(fs.existsSync(path.join(data, 'default-user', 'storage', 'emberdesk.sqlite'))).toBe(false);
        }
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await closed;
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 30000);
