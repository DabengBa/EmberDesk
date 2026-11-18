import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { createChatImportOperation } from '../public/scripts/chat-import-protocol.js';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const code = source.match(/export (async function importCharacterChat\([\s\S]*?\n}\n)/)[1];
const zh = JSON.parse(readFileSync(new URL('../public/locales/zh-cn.json', import.meta.url), 'utf8'));

function setup(fetch) {
    const toastr = { error: jest.fn(), success: jest.fn() };
    const t = (strings, ...values) => {
        const key = strings.reduce((text, part, index) => text + (index ? `\${${index - 1}}` : '') + part, '');
        return (zh[key] ?? key).replace(/\$\{(\d+)\}/g, (_, index) => values[index]);
    };
    const entry = new Function('fetch', 'getRequestHeaders', 'displayPastChats', 'createChatImportOperation', 'toastr', 't', `return (${code});`)(fetch, () => ({}), async () => {}, createChatImportOperation, toastr, t);
    return { entry, toastr };
}

test('real import entry sends the required operation id for each upload', async () => {
    const fetch = jest.fn(async (_url, options) => {
        expect(options.body.get('operationId')).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
        return { ok: true, json: async () => ({ res: true, fileNames: ['imported'] }) };
    });
    const { entry } = setup(fetch);
    expect(await entry(new FormData(), { refresh: false })).toEqual(['imported']);
});

test.each([
    ['parse-failed', '无法将该文件读取为聊天 JSON'],
    ['invalid-jsonl-format', 'JSONL 文件未以聊天头部开头'],
    ['unsupported-format', '不支持此聊天文件格式'],
    ['unsupported-json-format', '不支持此聊天文件格式'],
    ['empty_chat_import', '文件中没有可导入的聊天'],
    ['unregistered_attachment', '当前账号缺少聊天中引用的附件'],
])('displays a localized, dismissing error for %s', async (error, reason) => {
    const attachmentRejected = error === 'unregistered_attachment';
    const body = attachmentRejected ? { error: 'canonical_chat_write_rejected', reason: error, completed: ['first'] }
        : error === 'empty_chat_import' ? { error } : { error: true, report: { reason: error } };
    const fetch = jest.fn(async () => Response.json(body, { status: typeof body.error === 'string' ? 400 : 200 }));
    const { entry, toastr } = setup(fetch);
    const form = new FormData();
    form.set('avatar', new File(['fixture'], 'history.jsonl'));

    expect(await entry(form, { refresh: false })).toEqual([]);
    const [message, title, options] = toastr.error.mock.calls[0];
    expect(message).toContain(reason);
    expect(message).toContain('history.jsonl');
    expect(message).toContain(`已确认导入 ${attachmentRejected ? 1 : 0} 条聊天`);
    expect(message).not.toMatch(/unknown|retry|未知|重试/i);
    expect(title).toBe('聊天导入');
    expect(options?.onclick).toBeUndefined();
    expect(options?.timeOut).not.toBe(0);
    expect(options?.extendedTimeOut).not.toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
    [200, { error: true }, 0],
    [200, { error: true, report: { reason: 'unrecognized-reason' } }, 0],
    [409, { error: 'chat_conflict', completed: ['first'] }, 1],
    [409, { error: 'chat_operation_mismatch' }, 0],
])('preserves retry for existing or unrecognized failures (%s, %j)', async (status, body, completed) => {
    const fetch = jest.fn().mockResolvedValueOnce(Response.json(body, { status }))
        .mockResolvedValueOnce(Response.json({ res: true, fileNames: ['imported'] }));
    const { entry, toastr } = setup(fetch);
    const form = new FormData();
    form.set('avatar', new File(['fixture'], 'history.jsonl'));

    expect(await entry(form, { refresh: false })).toEqual([]);
    const [message, , options] = toastr.error.mock.calls[0];
    expect(message).toContain(`${completed} chat(s) confirmed imported; other results may be unknown`);
    expect(message).toContain('retry the same upload');
    expect(options).toMatchObject({ timeOut: 0, extendedTimeOut: 0, closeButton: true });
    await options.onclick();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, retried] = fetch.mock.calls.map(([, request]) => request.body);
    expect(retried.get('operationId')).toBe(first.get('operationId'));
    expect(retried.get('avatar')).toBe(first.get('avatar'));
});

test('the character replacement-target warning has a Simplified Chinese translation', () => {
    expect(zh['The replacement target was not found. A new character was created.']).toMatch(/未找到.*已创建/);
});
