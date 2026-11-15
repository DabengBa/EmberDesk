import { beforeEach, expect, jest, test } from '@jest/globals';

// Exercise the real tokenizer and request context; isolate browser and storage boundaries.
const characters = [{ chat: '' }];
const settings = { openai_model: 'gpt-test' };
jest.unstable_mockModule('../public/lib.js', () => ({ localforage: { createInstance: () => ({}) } }));
jest.unstable_mockModule('../public/script.js', () => ({ characters, main_api: 'openai', this_chid: 0 }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ registerDebugFunction: jest.fn() }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: settings }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ getStringHash: value => value }));

const { loadCsrfToken } = await import('../public/scripts/request-context.js');
const { countTokensOpenAIAsync, getTokenCountAsync } = await import('../public/scripts/tokenizers.js');
const fetchMock = jest.fn();
globalThis.fetch = fetchMock;
globalThis.jQuery = { ajax: jest.fn(() => { throw new Error('unexpected jQuery.ajax instead of fetch'); }) };
const ok = token_count => ({ ok: true, json: async () => ({ token_count }) });
let chatNumber = 0;

beforeEach(async () => {
    characters[0].chat = `isolated-chat-${++chatNumber}`;
    settings.openai_model = 'gpt-test';
    fetchMock.mockReset().mockResolvedValueOnce({ json: async () => ({ token: 'csrf-test' }) });
    await loadCsrfToken();
    fetchMock.mockClear();
});

test('posts one object as a JSON array with model and CSRF headers', async () => {
    const message = { role: 'user', content: 'hello' };
    fetchMock.mockResolvedValue(ok('10'));
    await expect(countTokensOpenAIAsync(message)).resolves.toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/tokenizers/openai/count?model=gpt-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test' },
        body: JSON.stringify([message]),
    });
});

test('counts multiple messages sequentially, then uses cache and the full offset', async () => {
    const first = { role: 'user', content: 'first' };
    const second = { role: 'assistant', content: 'second' };
    let resolveFirst;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
        .mockResolvedValueOnce(ok(8));
    const result = countTokensOpenAIAsync([first, second]);
    // Keep the pre-change rejected promise handled even if the immediate assertion fails.
    void result.catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(ok(6));
    await expect(result).resolves.toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual([second]);
    await expect(countTokensOpenAIAsync([first, second], true)).resolves.toBe(13);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('cache is scoped by model and chat', async () => {
    const message = { role: 'user', content: 'same' };
    fetchMock.mockResolvedValue(ok(10));
    await countTokensOpenAIAsync(message);
    await countTokensOpenAIAsync(message);
    settings.openai_model = 'gpt-other';
    await countTokensOpenAIAsync(message);
    characters[0].chat = 'another-chat';
    await countTokensOpenAIAsync(message);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/tokenizers/openai/count?model=gpt-other');
});

test('claude forces full count and string wrapper uses a system message', async () => {
    settings.openai_model = 'claude';
    fetchMock.mockResolvedValue(ok(10));
    await expect(countTokensOpenAIAsync({ role: 'user', content: 'a' })).resolves.toBe(9);
    settings.openai_model = 'gpt-test';
    await expect(getTokenCountAsync('text')).resolves.toBe(9);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual([{ role: 'system', content: 'text' }]);
});

test.each([
    ['non-2xx', () => Promise.resolve({ ok: false, status: 503 })],
    ['network failure', () => Promise.reject(new TypeError('network unavailable'))],
    ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } })],
])('%s rejects without caching the failure and can retry', async (_label, failure) => {
    const message = { role: 'user', content: 'retry' };
    fetchMock.mockImplementationOnce(failure).mockResolvedValueOnce(ok(12));
    await expect(countTokensOpenAIAsync(message)).rejects.toBeDefined();
    await expect(countTokensOpenAIAsync(message)).resolves.toBe(9);
    await expect(countTokensOpenAIAsync(message)).resolves.toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});
