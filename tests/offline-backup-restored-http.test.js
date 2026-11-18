import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('a restored offline copy supports HTTP edits that survive restart, without exposing keys', async () => {
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
            import fs from 'node:fs';
            import { DatabaseSync } from 'node:sqlite';
            import { writeCanonicalSecret } from './src/endpoints/canonical-secrets-store.ts';
            import { getCanonicalSettingsDocument } from './src/endpoints/settings-store.ts';
            const db = new DatabaseSync(process.argv[1]);
            const current = getCanonicalSettingsDocument(db, {userId:'alice'});
            const payload = JSON.parse(current.payloadJson);
            payload.oai_settings = { ...payload.oai_settings, chat_completion_source:'openai', custom_url:'https://example.test', proxy_password:'retired-fixture-password' };
            fs.writeFileSync(process.argv[2], JSON.stringify(payload));
            db.prepare('DELETE FROM settings_documents WHERE user_id = ?').run('alice');
            writeCanonicalSecret(db, {key:'api_key_openai',value:'restored-test-key',label:'fixture',id:'fixture-key'});
            db.close();
        `, path.join(user, 'storage', 'emberdesk.sqlite'), path.join(user, 'settings.json')]);
        fs.writeFileSync(path.join(user, 'secrets.json'), JSON.stringify({ api_key_openai: [{ id: 'fixture-key', value: 'restored-test-key', label: 'fixture', active: true }], _migrated: [] }));
        run(['scripts/offline-backup.mjs', 'backup', '--source', source, '--destination', backup, '--confirm-stopped', '--include-keys']);
        run(['scripts/offline-backup.mjs', 'restore', '--source', backup, '--destination', restored, '--confirm-stopped']);
        run(['--input-type=module', '-e', `
            import assert from 'node:assert/strict';
            import { DatabaseSync } from 'node:sqlite';
            import { getCanonicalSecret } from './src/endpoints/canonical-secrets-store.ts';
            const db = new DatabaseSync(process.argv[1], { readOnly: true });
            assert.equal(getCanonicalSecret(db, 'api_key_openai')?.value, 'restored-test-key');
            db.close();
        `, path.join(restored, 'alice', 'storage', 'emberdesk.sqlite')]);
        const port = await new Promise((resolve, reject) => {
            const probe = net.createServer();
            probe.once('error', reject);
            probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
        });
        const base = `http://127.0.0.1:${port}`;
        const start = async () => {
            server = spawn(process.execPath, [path.join(repo, 'server.js'), '--dataRoot', restored, '--configPath', config, '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--disableCsrf'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
            server.stdout.on('data', chunk => { output += chunk; });
            server.stderr.on('data', chunk => { output += chunk; });
            for (let i = 0; i < 300 && server.exitCode === null; i++) {
                try { if ((await fetch(base + '/api/ping')).ok) return; } catch { /* startup */ }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error(`server did not start: ${output}`);
        };
        const stop = async () => {
            if (server && server.exitCode === null) {
                const closed = new Promise(resolve => server.once('close', resolve));
                server.kill('SIGTERM');
                await closed;
            }
        };
        const session = () => {
            let cookie = '';
            return {
                get cookie() { return cookie; },
                async request(route, body) {
                    const response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
                    const cookies = response.headers.getSetCookie();
                    if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
                    return response;
                },
            };
        };
        let primary = session();
        const request = (route, body) => primary.request(route, body);
        const post = async (route, body) => {
            const response = await request(route, body);
            const text = await response.text();
            if (!response.ok) throw new Error(`${route}: ${response.status} ${text}\n${output}`);
            return text;
        };
        await start();
        await post('/api/users/login', {handle:'alice', password:'fixture-password'});
        expect(await post('/api/characters/all', {})).toContain(path.parse(avatar).name);
        expect(await post('/api/worldinfo/get', {name:'Dev World 01'})).toContain('Dev World 01');
        expect(await post('/api/chats/get', {avatar_url:avatar, file_name:path.parse(chatFile).name})).toContain('restored-chat-marker');
        const restoredUser = path.join(restored, 'alice');
        const db = new DatabaseSync(path.join(restoredUser, 'storage', 'emberdesk.sqlite'), { readOnly: true });
        try {
            const attachment = db.prepare(`
                SELECT blob.relative_path
                FROM chat_attachment_refs AS attachment
                JOIN media_references AS media ON media.blob_id = attachment.blob_id
                JOIN managed_blobs AS blob ON blob.id = attachment.blob_id
                WHERE media.compatibility_path = 'user/images/fixture.png'
                    AND json_extract(attachment.compatibility_json, '$.path') = '/user/images/fixture.png'
            `).get();
            expect(attachment).toBeDefined();
            expect(fs.readFileSync(path.join(restoredUser, 'storage', attachment.relative_path), 'utf8')).toBe('restored-media-bytes');
        } finally {
            db.close();
        }
        fs.unlinkSync(path.join(restoredUser, 'user', 'images', 'fixture.png'));
        const media = await fetch(base + '/user/images/fixture.png', {headers:{cookie:primary.cookie}});
        expect(media.ok).toBe(true);
        expect(await media.text()).toBe('restored-media-bytes');
        const legacySettings = JSON.parse(JSON.parse(await post('/api/settings/get', {})).settings);
        expect(legacySettings.oai_settings.custom_url).toBe('https://example.test');
        expect(legacySettings.oai_settings).not.toHaveProperty('proxy_password');
        fs.unlinkSync(path.join(restoredUser, 'settings.json'));
        const secretResponse = await request('/api/secrets/find', {key:'api_key_openai'});
        expect(secretResponse.status).toBe(403);
        expect(await secretResponse.text()).not.toContain('restored-test-key');
        expect(await post('/api/secrets/read', {})).not.toContain('restored-test-key');

        const character = JSON.parse(await post('/api/characters/get', {avatar_url:avatar}));
        await post('/api/characters/edit-attribute', {avatar_url:avatar, ch_name:character.name, field:'description', value:'after-restore-character', expected_card_json:character.canonical_card_version});
        const worldResponse = await request('/api/worldinfo/get', {name:'Dev World 01'});
        const world = await worldResponse.json();
        world.restore_marker = 'after-restore-world';
        await post('/api/worldinfo/edit', {name:'Dev World 01', data:world, expectedRevision:Number(worldResponse.headers.get('X-World-Info-Revision'))});
        const chatResponse = await request('/api/chats/get', {avatar_url:avatar, file_name:path.parse(chatFile).name});
        const secondary = session();
        expect((await secondary.request('/api/users/login', {handle:'alice', password:'fixture-password'})).ok).toBe(true);
        const chatTarget = {avatar_url:avatar, file_name:path.parse(chatFile).name};
        const secondChat = await secondary.request('/api/chats/get', chatTarget);
        const secondSettings = await (await secondary.request('/api/settings/get', {})).json();
        const chat = await chatResponse.json();
        chat.push({name:'User', mes:'after-restore-chat', extra:{image:'/user/images/fixture.png'}});
        await post('/api/chats/save', {avatar_url:avatar, ch_name:character.name, file_name:path.parse(chatFile).name, chat, version:chatResponse.headers.get('X-Chat-Version'), operationId:'restore-test-write'});
        expect((await secondary.request('/api/chats/save', {...chatTarget, ch_name:character.name, chat:await secondChat.json(), version:secondChat.headers.get('X-Chat-Version'), operationId:'restore-stale-write'})).status).toBe(409);
        const settingsResponse = JSON.parse(await post('/api/settings/get', {}));
        const settings = JSON.parse(settingsResponse.settings);
        settings.fixture_settings_marker = 'after-restore-settings';
        settings.oai_settings.custom_url = 'https://updated.example.test';
        await post('/api/settings/save', {...settings, settings_revision:settingsResponse.settings_revision});
        expect((await secondary.request('/api/settings/save', {...JSON.parse(secondSettings.settings), settings_revision:secondSettings.settings_revision})).status).toBe(409);
        const presetIndex = settingsResponse.openai_setting_names.indexOf('Default');
        expect(presetIndex).toBeGreaterThanOrEqual(0);
        const preset = JSON.parse(settingsResponse.openai_settings[presetIndex]);
        preset.restore_marker = 'after-restore-preset';
        await post('/api/presets/save', {apiId:'openai', name:'Default', preset, expectedRevision:settingsResponse.openai_setting_revisions.Default});

        await stop();
        primary = session();
        await start();
        await post('/api/users/login', {handle:'alice', password:'fixture-password'});
        expect(await post('/api/characters/all', {})).toContain('after-restore-character');
        expect(await post('/api/worldinfo/get', {name:'Dev World 01'})).toContain('after-restore-world');
        const restoredChat = await post('/api/chats/get', {avatar_url:avatar, file_name:path.parse(chatFile).name});
        expect(restoredChat).toContain('after-restore-chat');
        expect(restoredChat).toContain('/user/images/fixture.png');
        const restoredMedia = await fetch(base + '/user/images/fixture.png', {headers:{cookie:primary.cookie}});
        expect(restoredMedia.ok).toBe(true);
        expect(await restoredMedia.text()).toBe('restored-media-bytes');
        const restoredSettings = JSON.parse(await post('/api/settings/get', {}));
        const restoredDocument = JSON.parse(restoredSettings.settings);
        expect(restoredDocument.fixture_settings_marker).toBe('after-restore-settings');
        expect(restoredDocument.oai_settings.custom_url).toBe('https://updated.example.test');
        const restoredPresetIndex = restoredSettings.openai_setting_names.indexOf('Default');
        expect(restoredPresetIndex).toBeGreaterThanOrEqual(0);
        expect(JSON.parse(restoredSettings.openai_settings[restoredPresetIndex]).restore_marker).toBe('after-restore-preset');
    } finally {
        if (server && server.exitCode === null) {
            const closed = new Promise(resolve => server.once('close', resolve));
            server.kill('SIGTERM');
            await closed;
        }
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 120000);
