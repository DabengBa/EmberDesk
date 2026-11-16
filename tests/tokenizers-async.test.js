import { beforeEach, expect, jest, test } from '@jest/globals';

const characters = [{ chat: '' }];
const settings = { openai_model: 'gpt-test' };
jest.unstable_mockModule('../public/lib.js', () => ({ localforage: { createInstance: () => ({}) } }));
jest.unstable_mockModule('../public/script.js', () => ({ characters, main_api: 'openai', this_chid: 0 }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ registerDebugFunction: jest.fn() }));
jest.unstable_mockModule('../public/scripts/openai.js', () => ({ oai_settings: settings }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ getStringHash: value => value }));

const { loadCsrfToken } = await import('../public/scripts/request-context.js');
const { TOKEN_PADDING } = await import('../public/scripts/constants.js');
const { countTokensOpenAI, countTokensOpenAIAsync, getTokenCount, getTextTokens, decodeTextTokens, guesstimate, tokenizers } = await import('../public/scripts/tokenizers.js');
const fetchMock = jest.fn();
globalThis.fetch = fetchMock;
globalThis.jQuery = { ajax: jest.fn(() => { throw new Error('unexpected jQuery.ajax'); }) };
const ok = data => ({ ok: true, json: async () => data });
let chat = 0;

beforeEach(async () => {
    characters[0].chat = `async-${++chat}`;
    settings.openai_model = 'gpt-test';
    fetchMock.mockReset().mockResolvedValueOnce(ok({ token: 'csrf-test' }));
    await loadCsrfToken();
    fetchMock.mockClear();
});

test.each([
    ['legacy', countTokensOpenAI, 'gpt-test', 'claude', 12],
    ['legacy', countTokensOpenAI, 'claude', 'gpt-test', 14],
    ['async', countTokensOpenAIAsync, 'gpt-test', 'claude', 12],
    ['async', countTokensOpenAIAsync, 'claude', 'gpt-test', 14],
])('%s snapshots model during an in-flight change (case %#)', async (_entry, count, originalModel, nextModel, expected) => {
    const first = { role: 'user', content: 'first' };
    const second = { role: 'user', content: 'second' };
    settings.openai_model = originalModel;
    let finishFirst;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
        .mockResolvedValueOnce(ok({ token_count: 5 }))
        .mockResolvedValueOnce(ok({ token_count: 50 }));

    const pending = count([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    settings.openai_model = nextModel;
    finishFirst(ok({ token_count: 10 }));
    await expect(pending).resolves.toBe(expected);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/tokenizers/openai/count?model=${originalModel}`);
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/tokenizers/openai/count?model=${originalModel}`);

    await expect(count(second, true)).resolves.toBe(49);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/tokenizers/openai/count?model=${nextModel}`);
    settings.openai_model = originalModel;
    await expect(count(second, true)).resolves.toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('legacy OpenAI counter awaits sequential requests, skips failures and retries without caching them', async () => {
    const first = { role: 'user', content: 'first' };
    const second = { role: 'user', content: 'second' };
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok({ token_count: 8 }));
    const result = countTokensOpenAI([first, second], true);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(7);
    fetchMock.mockResolvedValueOnce(ok({ token_count: 6 }));
    await expect(countTokensOpenAI([first, second], true)).resolves.toBe(13);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test' });
});

test.each([true, false])('legacy OpenAI counter preserves all-failed offset with full=%s', async full => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(countTokensOpenAI({ role: 'user', content: 'fail' }, full)).resolves.toBe(full ? -1 : -3);
});

test('legacy string counter is asynchronous and preserves its full-count failure fallback', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(getTokenCount('some text')).resolves.toBe(-1);
});

test.each([
    ['non-2xx', () => Promise.resolve({ ok: false, status: 503 })],
    ['network error', () => Promise.reject(new Error('offline'))],
    ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })],
])('legacy OpenAI %s does not cache a failure and retries', async (_label, failure) => {
    const message = { role: 'user', content: 'retry' };
    fetchMock.mockImplementationOnce(failure).mockResolvedValueOnce(ok({ token_count: 12 }));
    await expect(countTokensOpenAI(message)).resolves.toBe(-3);
    await expect(countTokensOpenAI(message)).resolves.toBe(9);
    await expect(countTokensOpenAI(message)).resolves.toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('estimated counting keeps UTF-8 calculation and padding without a request', async () => {
    const text = '你好 world';
    await expect(getTokenCount(text, TOKEN_PADDING)).resolves.toBe(guesstimate(text) + TOKEN_PADDING);
    await expect(getTokenCount(text, TOKEN_PADDING)).resolves.toBe(guesstimate(text) + TOKEN_PADDING);
    expect(fetchMock).not.toHaveBeenCalled();
});

test('encode and decode await CSRF fetch, preserve model and non-enumerable chunks', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ids: [1, 2], chunks: ['a', 'b'] }))
        .mockResolvedValueOnce(ok({ text: 'ab', chunks: ['a', 'b'] }));
    const ids = await getTextTokens(tokenizers.OPENAI, 'ab');
    expect(ids).toEqual([1, 2]);
    expect(ids.chunks).toEqual(['a', 'b']);
    expect(Object.getOwnPropertyDescriptor(ids, 'chunks').enumerable).toBe(false);
    await expect(decodeTextTokens(tokenizers.OPENAI, ids)).resolves.toEqual({ text: 'ab', chunks: ['a', 'b'] });
    expect(fetchMock.mock.calls[0]).toEqual(['/api/tokenizers/openai/encode?model=gpt-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-test' }, body: JSON.stringify({ text: 'ab' }),
    }]);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/tokenizers/openai/decode?model=gpt-test');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ids: [1, 2] });
});

test.each([
    ['non-2xx', () => Promise.resolve({ ok: false, status: 503 })],
    ['network error', () => Promise.reject(new Error('offline'))],
    ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })],
])('encode and decode preserve empty fallbacks on %s', async (_label, failure) => {
    fetchMock.mockImplementation(failure);
    await expect(getTextTokens(tokenizers.LLAMA, 'x')).resolves.toEqual([]);
    await expect(decodeTextTokens(tokenizers.LLAMA, [1])).resolves.toEqual({ text: '', chunks: [] });
});

test('unknown tokenizer preserves asynchronous empty results without a request', async () => {
    await expect(getTextTokens(-123, 'x')).resolves.toEqual([]);
    await expect(decodeTextTokens(-123, [1])).resolves.toEqual({ text: '', chunks: [] });
    expect(fetchMock).not.toHaveBeenCalled();
});
