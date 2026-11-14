import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const helper = new URL('../src/endpoints/chat-backup-helpers.ts', import.meta.url).href;
const converters = new URL('../src/endpoints/chat-import-converters.ts', import.meta.url).href;
const imports = new URL('../src/endpoints/chat-import-service.ts', import.meta.url).href;
const routes = new URL('../src/endpoints/chat-route-service.ts', import.meta.url).href;
const chats = new URL('../src/endpoints/chats.js', import.meta.url).href;
const characters = new URL('../src/endpoints/characters.js', import.meta.url).href;
const queries = new URL('../src/endpoints/canonical-chat-query-service.ts', import.meta.url).href;
const util = new URL('../src/util.js', import.meta.url).href;

function runNode(source, ...args) {
    return spawnSync(process.execPath, ['--input-type=module', '--eval', source, ...args], { encoding: 'utf8' });
}

test('Node imports the real TypeScript backup helper without a loader', () => {
    const result = runNode('const helper = await import(process.argv[1]); console.log(typeof helper.createChatBackupPlan);', helper);
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout.trim()).toBe('function');
});

test('Node executes the real chat import and route helpers without a loader', () => {
    const source = `
        import assert from 'node:assert/strict';
        import path from 'node:path';
        const { getJsonChatImportConverter, importOobaChat } = await import(process.argv[1]);
        const { createCharacterChatImportPlan } = await import(process.argv[2]);
        const { createTextMatcher, getPreviewMessage } = await import(process.argv[3]);
        const payload = { data_visible: [['Native question', 'Native answer']] };
        assert.equal(getJsonChatImportConverter(payload), importOobaChat);
        const plan = createCharacterChatImportPlan({
            format: 'json',
            data: JSON.stringify(payload),
            directories: { chats: 'native-chats' },
            avatarUrl: 'Ada',
            characterName: 'Ada',
            userName: 'User',
            timestampLabel: () => 'native',
            uploadPath: 'native-upload.json',
        });
        assert.equal(plan.ok, true);
        assert.equal(plan.uploadCleanup, 'already-cleaned');
        assert.equal(plan.writes[0].kind, 'atomic-write');
        assert.equal(plan.writes[0].filePath, path.join('native-chats', 'Ada', 'Ada - native imported.jsonl'));
        const messages = plan.writes[0].contents.split('\\n').map(line => JSON.parse(line));
        assert.equal(messages[1].mes, 'Native question');
        assert.equal(messages[2].mes, 'Native answer');
        assert.equal(createTextMatcher('42 native')(['Native message 42']), true);
        assert.equal(createTextMatcher('42 native')(['Native message 142']), false);
        assert.equal(getPreviewMessage('x'.repeat(401)), '...' + 'x'.repeat(400));
        console.log('chat-foundation:ok');
    `;
    const result = runNode(source, converters, imports, routes);
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout.trim()).toBe('chat-foundation:ok');
});

test('Node imports the real chats and characters callers and canonical query TypeScript without a loader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-chat-backup-native-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n', 'utf8');
        const source = `
            import assert from 'node:assert/strict';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            const { router } = await import(process.argv[3]);
            const { searchCanonicalChatPayload } = await import(process.argv[4]);
            const { router: characterRouter } = await import(process.argv[5]);
            assert.deepEqual(await searchCanonicalChatPayload({ query: '42 native', avatarUrl: '' }), []);
            console.log('chats-router:' + typeof router);
            console.log('characters-router:' + typeof characterRouter);
            console.log('canonical-query:ok');
        `;
        const result = runNode(source, util, config, chats, queries, characters);
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('chats-router:function');
        expect(result.stdout).toContain('characters-router:function');
        expect(result.stdout).toContain('canonical-query:ok');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
