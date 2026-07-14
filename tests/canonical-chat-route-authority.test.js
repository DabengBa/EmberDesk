import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';

const roots = [];
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-config-'));
const configPath = path.join(configRoot, 'config.yaml');
fs.writeFileSync(configPath, [
    'backups:',
    '  chat:',
    '    enabled: false',
    '    maxTotalBackups: -1',
    '    throttleInterval: 10000',
    '    checkIntegrity: true',
    'features:',
    '  storage:',
    '    canonicalSqlite:',
    '      enabled: true',
    '      shadowImport: true',
    '      reads: true',
    '      writes: true',
    '      strict: false',
    '      slices:',
    '        chats:',
    '          enabled: true',
    '          shadowImport: true',
    '          reads: true',
    '          writes: true',
].join('\n'), 'utf8');
setConfigFilePath(configPath);

const { getChatData } = await import('../src/endpoints/chats.js');

afterEach(() => {
    for (const root of roots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical chat route authority', () => {
    test('keeps getChatData on JSONL even when canonical chat flags are enabled', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-canonical-chat-route-'));
        roots.push(root);
        const chatPath = path.join(root, 'chat.jsonl');
        fs.writeFileSync(chatPath, [
            '{"chat_metadata":{"integrity":"jsonl-owner"}}',
            '{"name":"User","mes":"JSONL is the runtime authority"}',
        ].join('\n'), 'utf8');

        expect(getChatData(chatPath)).toEqual([
            { chat_metadata: { integrity: 'jsonl-owner' } },
            { name: 'User', mes: 'JSONL is the runtime authority' },
        ]);
    });
});
