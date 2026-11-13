import { jest } from '@jest/globals';
import { createChatImportOperation } from '../public/scripts/chat-import-protocol.js';

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('retries an ambiguous upload with the same operation and immutable file data', async () => {
    const form = new FormData();
    form.set('avatar', new Blob(['original']), 'one.jsonl');
    form.set('file_type', 'jsonl');
    const send = jest.fn().mockRejectedValueOnce(new Error('lost response'))
        .mockResolvedValueOnce(response(200, { res: true, fileNames: ['imported'] }));
    const operation = createChatImportOperation(form, { send, operationId: 'stable-id' });
    form.set('file_type', 'json');
    expect(await operation.run()).toEqual({ ok: true, fileNames: ['imported'] });
    expect(send).toHaveBeenCalledTimes(2);
    for (const [body] of send.mock.calls) {
        expect(body.get('operationId')).toBe('stable-id');
        expect(body.get('file_type')).toBe('jsonl');
        expect(await body.get('avatar').text()).toBe('original');
    }
});

test('partial conflict is reported and a later retry retains the same operation id', async () => {
    const send = jest.fn().mockResolvedValueOnce(response(409, { error: 'chat_conflict', completed: ['first'] }))
        .mockResolvedValueOnce(response(200, { res: true, fileNames: ['first', 'second'] }));
    const operation = createChatImportOperation(new FormData(), { send, operationId: 'retry-id' });
    expect(await operation.run()).toEqual({ ok: false, error: 'chat_conflict', completed: ['first'], status: 409 });
    expect(await operation.run()).toEqual({ ok: true, fileNames: ['first', 'second'] });
    expect(send.mock.calls.map(([body]) => body.get('operationId'))).toEqual(['retry-id', 'retry-id']);
});

test('independent files receive distinct operation ids and failed imports are not reported as success', async () => {
    const send = jest.fn().mockResolvedValue(response(200, { error: true }));
    const first = createChatImportOperation(new FormData(), { send });
    const second = createChatImportOperation(new FormData(), { send });
    expect((await first.run()).ok).toBe(false);
    expect((await second.run()).ok).toBe(false);
    expect(send.mock.calls[0][0].get('operationId')).not.toBe(send.mock.calls[1][0].get('operationId'));
});
