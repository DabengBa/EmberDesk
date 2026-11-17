import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';
import extractPngChunks from 'png-chunks-extract';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('user ZIP filters and sanitizes a symlinked user root without modifying its target', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-zip-root-link-'));
    try {
        const data = path.join(root, 'data');
        const target = path.join(root, 'user-target');
        const zip = path.join(root, 'out.zip');
        const settings = JSON.stringify({ model: 'keep-model', proxy_password: 'settings-secret' });
        const preset = JSON.stringify({ model: 'keep-preset', api_key_openai: 'preset-secret' });
        fs.mkdirSync(data);
        fs.mkdirSync(path.join(target, 'storage'), { recursive: true });
        fs.mkdirSync(path.join(target, 'backups'));
        fs.mkdirSync(path.join(target, 'OpenAI Settings'));
        fs.writeFileSync(path.join(target, 'secrets.json'), 'root-secret');
        fs.writeFileSync(path.join(target, 'storage', 'private.sqlite'), 'database-secret');
        fs.writeFileSync(path.join(target, 'backups', 'secrets_migration_1.json'), 'migration-secret');
        fs.writeFileSync(path.join(target, 'settings.json'), settings);
        fs.writeFileSync(path.join(target, 'OpenAI Settings', 'preset.json'), preset);
        fs.symlinkSync(target, path.join(data, 'alice'), 'dir');

        const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import fs from 'node:fs';
            import express from 'express';
            const [data, zip] = process.argv.slice(1);
            globalThis.DATA_ROOT = data;
            const { getUserDirectories } = await import('./src/user-directories.ts');
            const { router } = await import('./src/endpoints/users-private.js');
            const app = express(); app.use(express.json());
            app.use((req, res, next) => { req.user = { profile: { handle: 'alice', admin: false }, directories: getUserDirectories('alice') }; next(); });
            app.use(router);
            const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
            try {
                const response = await fetch('http://127.0.0.1:' + server.address().port + '/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'alice' }) });
                if (!response.ok) throw new Error('backup HTTP ' + response.status + ': ' + await response.text());
                fs.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
            } finally { await new Promise(resolve => server.close(resolve)); }
        `, data, zip], { cwd: repo, encoding: 'utf8', timeout: 30_000 });
        expect({ status: child.status, stderr: child.status === 0 ? '' : child.stderr }).toEqual({ status: 0, stderr: '' });
        const extract = path.join(root, 'extract');
        expect(spawnSync('unzip', ['-q', zip, '-d', extract]).status).toBe(0);
        expect({
            secretsFile: fs.existsSync(path.join(extract, 'secrets.json')),
            storage: fs.existsSync(path.join(extract, 'storage')),
            migration: fs.existsSync(path.join(extract, 'backups', 'secrets_migration_1.json')),
            exportedSettings: JSON.parse(fs.readFileSync(path.join(extract, 'settings.json'), 'utf8')),
            exportedPreset: JSON.parse(fs.readFileSync(path.join(extract, 'OpenAI Settings', 'preset.json'), 'utf8')),
            sourceSettings: fs.readFileSync(path.join(target, 'settings.json'), 'utf8'),
            sourcePreset: fs.readFileSync(path.join(target, 'OpenAI Settings', 'preset.json'), 'utf8'),
            rootStillLink: fs.lstatSync(path.join(data, 'alice')).isSymbolicLink(),
        }).toEqual({
            secretsFile: false,
            storage: false,
            migration: false,
            exportedSettings: { model: 'keep-model' },
            exportedPreset: { model: 'keep-preset' },
            sourceSettings: settings,
            sourcePreset: preset,
            rootStillLink: true,
        });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test.each([[false, false, false], [true, false, false], [false, true, false], [false, false, true]])('user ZIP preserves canonical data without keys (exposure=%s, symlink=%s, rootSymlink=%s)', (exposure, symlink, rootSymlink) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-zip-'));
    try {
        const data = path.join(root, 'data');
        const config = path.join(root, 'config.yaml');
        const zip = path.join(root, 'out.zip');
        fs.writeFileSync(config, `allowKeysExposure: ${exposure}\n`);
        const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import fs from 'node:fs';
            import path from 'node:path';
            import express from 'express';
            const [data, config, zip, symlink, rootSymlink] = process.argv.slice(1);
            globalThis.DATA_ROOT = data;
            const { setConfigFilePath } = await import('./src/util.js');
            setConfigFilePath(config);
            const { getUserDirectories } = await import('./src/user-directories.ts');
            const { canonicalSqliteManager } = await import('./src/canonical-sqlite.ts');
            const { runCanonicalMigrations } = await import('./src/canonical-sqlite-migrations.ts');
            const { upsertCanonicalSettingsDocument } = await import('./src/endpoints/settings-store.ts');
            const { upsertCanonicalPreset } = await import('./src/endpoints/presets-store.ts');
            const { writeCanonicalSecret } = await import('./src/endpoints/canonical-secrets-store.ts');
            const { upsertCanonicalWorldInfoBook } = await import('./src/endpoints/world-info-store.ts');
            const { runCanonicalChatShadowImport } = await import('./src/canonical-chat-shadow-import.ts');
            const dirs = getUserDirectories('alice');
            for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
            if (rootSymlink === 'true') {
                const target = path.join(path.dirname(data), 'user-target');
                fs.renameSync(dirs.root, target);
                fs.symlinkSync(target, dirs.root, 'dir');
            }
            const outside = path.join(path.dirname(data), 'outside');
            if (symlink === 'true') {
                fs.mkdirSync(outside);
                fs.writeFileSync(path.join(outside, 'linked-settings'), 'settings-target-unchanged');
                fs.writeFileSync(path.join(outside, 'unrelated-file'), 'unrelated-target-unchanged');
                fs.rmdirSync(dirs.characters);
                fs.symlinkSync(outside, dirs.characters, 'dir');
                fs.symlinkSync(path.join(outside, 'linked-settings'), path.join(dirs.root, 'settings.export.json'));
                fs.symlinkSync(path.join(outside, 'unrelated-file'), path.join(dirs.root, 'unrelated-link'));
            } else {
                fs.copyFileSync(path.join(process.cwd(), 'public', 'img', 'quill.png'), path.join(dirs.characters, 'alpha.png'));
            }
            const db = canonicalSqliteManager.open({ handle: 'alice', directories: dirs, featureFlags: { enabled: true } });
            runCanonicalMigrations(db);
            db.prepare("INSERT INTO characters (id, avatar_filename, internal_name, display_name, card_json, shallow_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, 1, 1)").run('c1', 'alpha.png', 'Alpha', 'Alpha', JSON.stringify({name:'Alpha',data:{name:'Alpha'}}), '{}');
            upsertCanonicalWorldInfoBook(db, { name:'Lore', payload:{entries:{one:{content:'world-fixture'}}} });
            const settings = {model:'fixture-model', connection_profiles:[{name:'fixture-connection'}], oai_settings: {proxy_password:'canonical-proxy-secret', custom_include_headers:'Authorization: Bearer canonical-header-secret', api_key_openai:'canonical-api-secret', custom_url:'https://example.test'}};
            const preset = {proxy_password:'preset-proxy-secret', custom_include_headers:'X-Api-Key: preset-header-secret', api_key_openai:'preset-api-secret', model:'preset-model'};
            upsertCanonicalSettingsDocument(db, { userId:'alice', payload:settings, expectedRevision:0 });
            upsertCanonicalPreset(db, {name:'canonical-preset',payload:preset});
            const legacySettings = JSON.stringify({oai_settings:{proxy_password:'legacy-settings-secret',custom_include_headers:'Authorization: legacy-header-secret', custom_url:'https://legacy.test'}});
            const legacyPreset = JSON.stringify({proxy_password:'legacy-preset-secret', api_key_openai:'legacy-key-secret', model:'legacy-model'});
            fs.writeFileSync(path.join(dirs.root, 'settings.json'), legacySettings);
            fs.writeFileSync(path.join(dirs.openAI_Settings, 'legacy.json'), legacyPreset);
            fs.mkdirSync(path.join(dirs.backups, 'old', 'OpenAI Settings'), {recursive:true});
            fs.writeFileSync(path.join(dirs.backups, 'old', 'settings.json'), legacySettings);
            fs.writeFileSync(path.join(dirs.backups, 'old', 'OpenAI Settings', 'legacy.json'), legacyPreset);
            writeCanonicalSecret(db, { key:'api_key_openai', value:'hidden-test-key-234', label:'key', id:'k1' });
            fs.writeFileSync(path.join(dirs.root, 'secrets.json'), 'hidden-test-key-234');
            fs.writeFileSync(path.join(dirs.backups, 'secrets_migration_1.json'), 'hidden-test-key-234');
            fs.mkdirSync(path.join(dirs.chats, 'alpha'), {recursive:true});
            fs.writeFileSync(path.join(dirs.chats, 'alpha', 'one.jsonl'), '{"chat_metadata":{}}\\n{"name":"User","mes":"fixture-chat"}');
            await runCanonicalChatShadowImport({handle:'alice',directories:dirs,db,featureFlags:{enabled:true,shadowImport:true,strict:false}});
            fs.rmSync(path.join(dirs.chats, 'alpha', 'one.jsonl'));
            fs.writeFileSync(path.join(dirs.userImages, 'image.png'), 'fixture-image');
            const { router } = await import('./src/endpoints/users-private.js');
            const app = express(); app.use(express.json());
            app.use((req,res,next) => { req.user = {profile:{handle:'alice',admin:false}, directories:dirs}; next(); });
            app.use(router);
            const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
            try {
                const response = await fetch('http://127.0.0.1:' + server.address().port + '/backup', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:'alice'})});
                if (!response.ok) throw new Error('backup HTTP ' + response.status + ': ' + await response.text());
                fs.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
                if (fs.readFileSync(path.join(dirs.root, 'settings.json'), 'utf8') !== legacySettings || fs.readFileSync(path.join(dirs.openAI_Settings, 'legacy.json'), 'utf8') !== legacyPreset) throw new Error('ZIP export modified source settings or preset');
                if (JSON.parse(db.prepare('SELECT payload_json FROM settings_documents WHERE user_id = ?').get('alice').payload_json).oai_settings.proxy_password !== 'canonical-proxy-secret') throw new Error('ZIP export modified canonical settings');
                if (symlink === 'true' && fs.existsSync(path.join(outside, 'alpha.png'))) throw new Error('ZIP export modified the linked source directory');
                if (symlink === 'true' && fs.readFileSync(path.join(outside, 'linked-settings'), 'utf8') !== 'settings-target-unchanged') throw new Error('ZIP export modified the linked source file');
                if (symlink === 'true' && (!fs.lstatSync(dirs.characters).isSymbolicLink() || !fs.lstatSync(path.join(dirs.root, 'unrelated-link')).isSymbolicLink())) throw new Error('ZIP export replaced a source link');
            } finally { await new Promise(resolve => server.close(resolve)); canonicalSqliteManager.dispose(); }
        `, data, config, zip, String(symlink), String(rootSymlink)], { cwd: repo, encoding: 'utf8', timeout: 30_000 });
        expect({ status: child.status, stderr: child.status === 0 ? '' : child.stderr, stdout: child.status === 0 ? '' : child.stdout }).toEqual({ status: 0, stderr: '', stdout: '' });
        const extract = path.join(root, 'extract');
        const unzip = spawnSync('unzip', ['-q', zip, '-d', extract], { encoding: 'utf8' });
        expect(unzip.status).toBe(0);
        const files = fs.readdirSync(extract, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath, entry.name));
        const contents = Buffer.concat(files.map(file => fs.readFileSync(file))).toString('latin1');
        expect(contents.includes('hidden-test-key-234')).toBe(false);
        for (const secret of ['canonical-proxy-secret', 'canonical-header-secret', 'canonical-api-secret', 'preset-proxy-secret', 'preset-header-secret', 'preset-api-secret', 'legacy-settings-secret', 'legacy-header-secret', 'legacy-preset-secret', 'legacy-key-secret']) expect(contents.includes(secret)).toBe(false);
        expect(files.some(file => file.endsWith('emberdesk.sqlite'))).toBe(false);
        expect(fs.readFileSync(path.join(extract, 'worlds', 'Lore.json'), 'utf8')).toContain('world-fixture');
        expect(fs.readFileSync(path.join(extract, 'settings.export.json'), 'utf8')).toContain('fixture-connection');
        expect(fs.readFileSync(path.join(extract, 'settings.export.json'), 'utf8')).toContain('https://example.test');
        expect(fs.readFileSync(path.join(extract, 'OpenAI Settings', 'canonical-preset.json'), 'utf8')).toContain('preset-model');
        expect(fs.readFileSync(path.join(extract, 'OpenAI Settings', 'legacy.json'), 'utf8')).toContain('legacy-model');
        expect(fs.readFileSync(path.join(extract, 'backups', 'old', 'settings.json'), 'utf8')).toContain('https://legacy.test');
        expect(fs.readFileSync(path.join(extract, 'chats', 'alpha', 'one.jsonl'), 'utf8')).toContain('fixture-chat');
        expect(fs.readFileSync(path.join(extract, 'user', 'images', 'image.png'), 'utf8')).toBe('fixture-image');
        expect(fs.existsSync(path.join(extract, 'characters', 'alpha.png'))).toBe(true);
        if (!symlink) {
            const imageData = file => Buffer.concat(extractPngChunks(fs.readFileSync(file)).filter(chunk => chunk.name === 'IDAT').map(chunk => Buffer.from(chunk.data)));
            expect(imageData(path.join(extract, 'characters', 'alpha.png'))).toEqual(imageData(path.join(repo, 'public', 'img', 'quill.png')));
        }
        if (symlink) {
            expect(fs.lstatSync(path.join(extract, 'unrelated-link')).isSymbolicLink()).toBe(true);
            expect(fs.lstatSync(path.join(extract, 'settings.export.json')).isSymbolicLink()).toBe(false);
            expect(contents).not.toContain('unrelated-target-unchanged');
        }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
