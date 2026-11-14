import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const helper = new URL('../src/endpoints/chat-backup-helpers.ts', import.meta.url).href;
const chats = new URL('../src/endpoints/chats.js', import.meta.url).href;
const util = new URL('../src/util.js', import.meta.url).href;

function runNode(source, ...args) {
    return spawnSync(process.execPath, ['--input-type=module', '--eval', source, ...args], { encoding: 'utf8' });
}

test('Node imports the real TypeScript backup helper without a loader', () => {
    const result = runNode('const helper = await import(process.argv[1]); console.log(typeof helper.createChatBackupPlan);', helper);
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout.trim()).toBe('function');
});

test('Node imports the real chats caller and its TypeScript dependency', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-chat-backup-native-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n', 'utf8');
        const source = `
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            const { router } = await import(process.argv[3]);
            console.log('chats-router:' + typeof router);
        `;
        const result = runNode(source, util, config, chats);
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('chats-router:function');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
