import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('a complete offline copy starts the application with the same data and keys', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-restored-http-'));
    const source = path.join(root, 'source');
    const backup = path.join(root, 'backup');
    const restored = path.join(root, 'restored');
    const config = path.join(root, 'config.yaml');
    let server;
    let output = '';
    const run = (args) => {
        const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 30000 });
        if (result.status !== 0) throw new Error(`command failed: ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    };
    try {
        run(['scripts/seed-dev-environment.mjs', '--profile', 'small', '--data-root', source, '--config', config, '--user-handle', 'alice', '--user-password', 'fixture-password']);
        fs.appendFileSync(config, 'allowKeysExposure: true\n');
        const user = path.join(source, 'alice');
        const chatDir = path.join(user, 'chats');
        const avatar = fs.readdirSync(path.join(user, 'characters')).find(name => name.endsWith('.png'));
        const chatFolder = path.join(chatDir, path.parse(avatar).name);
        const chatFile = fs.readdirSync(chatFolder).find(name => name.endsWith('.jsonl'));
        fs.mkdirSync(path.join(user, 'user', 'images'), { recursive: true });
        fs.writeFileSync(path.join(user, 'user', 'images', 'fixture.png'), 'restored-media-bytes');
        fs.appendFileSync(path.join(chatFolder, chatFile), JSON.stringify({ name: 'User', mes: 'restored-chat-marker', extra: { image: '/user/images/fixture.png' } }) + '\n');
        run(['--input-type=module', '-e', `
            import { DatabaseSync } from 'node:sqlite';
            import { writeCanonicalSecret } from './src/endpoints/canonical-secrets-store.ts';
            import { upsertCanonicalSettingsDocument, getCanonicalSettingsDocument } from './src/endpoints/settings-store.ts';
            const db = new DatabaseSync(process.argv[1]);
            const current = getCanonicalSettingsDocument(db, {userId:'alice'});
            const payload = JSON.parse(current.payloadJson); payload.fixture_connection = {name:'restored-connection', endpoint:'https://example.test'};
            upsertCanonicalSettingsDocument(db, {userId:'alice', payload, expectedRevision:current.revision});
            writeCanonicalSecret(db, {key:'api_key_openai',value:'restored-test-key',label:'fixture',id:'fixture-key'});
            db.close();
        `, path.join(user, 'storage', 'emberdesk.sqlite')]);
        fs.writeFileSync(path.join(user, 'secrets.json'), JSON.stringify({ api_key_openai: [{ id: 'fixture-key', value: 'restored-test-key', label: 'fixture', active: true }], _migrated: [] }));
        run(['scripts/offline-backup.mjs', 'backup', '--source', source, '--destination', backup, '--confirm-stopped', '--include-keys']);
        run(['scripts/offline-backup.mjs', 'restore', '--source', backup, '--destination', restored, '--confirm-stopped']);
        const port = await new Promise((resolve, reject) => {
            const probe = net.createServer();
            probe.once('error', reject);
            probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
        });
        server = spawn(process.execPath, [path.join(repo, 'server.js'), '--dataRoot', restored, '--configPath', config, '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--disableCsrf'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', chunk => { output += chunk; });
        server.stderr.on('data', chunk => { output += chunk; });
        const base = `http://127.0.0.1:${port}`;
        let ready = false;
        for (let i = 0; i < 300 && server.exitCode === null; i++) {
            try { if ((await fetch(base + '/api/ping')).ok) { ready = true; break; } } catch { /* startup */ }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!ready) throw new Error(`server did not start: ${output}`);
        let cookie = '';
        const post = async (route, body) => {
            const response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
            const cookies = response.headers.getSetCookie();
            if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
            const text = await response.text();
            if (!response.ok) throw new Error(`${route}: ${response.status} ${text}\n${output}`);
            return text;
        };
        await post('/api/users/login', {handle:'alice', password:'fixture-password'});
        expect(await post('/api/characters/all', {})).toContain(path.parse(avatar).name);
        expect(await post('/api/worldinfo/get', {name:'Dev World 01'})).toContain('Dev World 01');
        expect(await post('/api/chats/get', {avatar_url:avatar, file_name:path.parse(chatFile).name})).toContain('restored-chat-marker');
        const media = await fetch(base + '/user/images/fixture.png', {headers:{cookie}});
        expect(await media.text()).toBe('restored-media-bytes');
        expect(await post('/api/settings/get', {})).toContain('restored-connection');
        expect(await post('/api/secrets/find', {key:'api_key_openai'})).toContain('restored-test-key');
    } finally {
        if (server && server.exitCode === null) {
            const closed = new Promise(resolve => server.once('close', resolve));
            server.kill('SIGTERM');
            await closed;
        }
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 60000);
