import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { createChatImportOperation } from '../public/scripts/chat-import-protocol.js';

test('real import entry sends the required operation id for each upload', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const code = source.match(/export async function importCharacterChat\([\s\S]*?\n}\n/)[0].replace('export ', '');
    const fetch = jest.fn(async (_url, options) => {
        expect(options.body.get('operationId')).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
        return { ok: true, json: async () => ({ res: true, fileNames: ['imported'] }) };
    });
    const entry = new Function('fetch', 'getRequestHeaders', 'displayPastChats', 'createChatImportOperation', 'toastr', `${code}; return importCharacterChat;`)(fetch, () => ({}), async () => {}, createChatImportOperation, { error: jest.fn() });
    expect(await entry(new FormData(), { refresh: false })).toEqual(['imported']);
});
