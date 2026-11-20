import { expect, test } from '@jest/globals';
import { once } from 'node:events';

import { fileURLToPath } from 'node:url';
import express from 'express';

test('local Llama preserves SentencePiece route payloads and server prompt budgets', async () => {
    const { router } = await import('../src/endpoints/tokenizers.js');
    const { assembleServerPrompt } = await import('../src/server-prompt.ts');
    const previousCwd = process.cwd();
    process.chdir(fileURLToPath(new URL('..', import.meta.url)));
    const app = express().use(express.json(), router);
    const server = app.listen(0, '127.0.0.1');

    try {
        await once(server, 'listening');
        const post = async (path, body) => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            expect(response.status).toBe(200);
            return response.json();
        };

        const text = ' Hello \u{1F642}';
        const ids = [29871, 15043, 29871, 243, 162, 156, 133];
        const encode = { ids, count: 7, chunks: ['\u2581', '\u2581Hello', '\u2581', '<0xF0>', '<0x9F>', '<0x99>', '<0x82>'] };
        const decode = { text: 'Hello\uFFFD\uFFFD\uFFFD\uFFFD', chunks: ['', 'Hello', '', ...Array(4).fill('\uFFFD')] };
        await expect(post('/llama/encode', { text: '' })).resolves.toEqual({ ids: [], count: 0, chunks: [] });
        await expect(post('/llama/encode', { text })).resolves.toEqual(encode);
        await expect(post('/llama/decode', { ids })).resolves.toEqual(decode);
        await expect(post('/llama/decode', { ids: [-1, 4294967296, 'invalid', {}, 0] })).resolves.toEqual({
            text: ' \u2047 ',
            chunks: ['', '', '', '', ' \u2047 '],
        });
        await expect(post('/openai/encode?model=llama', { text })).resolves.toEqual(encode);
        await expect(post('/openai/decode?model=llama', { ids })).resolves.toEqual(decode);

        const message = { role: 'user', content: 'Hello \u{1F642}' };
        await expect(post('/openai/count?model=llama', [message])).resolves.toEqual({ token_count: 9 });
        const snapshot = {
            character: { name: 'Mira' },
            settings: { oai_settings: { custom_url: 'http://127.0.0.1:3000/v1', openai_model: 'llama', openai_max_context: 100, openai_max_tokens: 20 } },
            preset: { new_chat_prompt: '', prompt_order: [{ character_id: 100001, order: [{ identifier: 'chatHistory', enabled: true }] }] },
            chat: [{ user_name: 'Rin' }, { is_user: true, mes: message.content }],
            books: [],
        };
        await expect(assembleServerPrompt(snapshot, { action: 'send' })).resolves.toMatchObject({
            messages: [message],
            budget: { promptTokens: 12 },
        });
    } finally {
        try {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        } finally {
            process.chdir(previousCwd);
        }
    }
});
