import { describe, expect, test } from '@jest/globals';

async function importFreshCore() {
    return import(`../public/scripts/tool-bindings-core.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('normalizeToolBindings', () => {
    test('returns an empty array for non-array input', async () => {
        const { normalizeToolBindings } = await importFreshCore();

        expect(normalizeToolBindings(undefined)).toEqual([]);
        expect(normalizeToolBindings(null)).toEqual([]);
        expect(normalizeToolBindings({})).toEqual([]);
        expect(normalizeToolBindings('x')).toEqual([]);
    });

    test('normalizes valid bindings and fills defaults', async () => {
        const { normalizeToolBindings } = await importFreshCore();

        const [binding] = normalizeToolBindings([{
            name: 'game_content',
            description: 'all output goes here',
            parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
            actionBody: 'return { ok: true };',
        }]);

        expect(binding).toMatchObject({
            name: 'game_content',
            description: 'all output goes here',
            enabled: true,
            stealth: false,
            displayName: '',
            formatMessageBody: '',
        });
        expect(typeof binding.id).toBe('string');
        expect(binding.id.length).toBeGreaterThan(0);
        expect(binding.parameters).toEqual({ type: 'object', properties: { content: { type: 'string' } }, required: ['content'] });
    });

    test('drops entries without a usable name', async () => {
        const { normalizeToolBindings } = await importFreshCore();

        expect(normalizeToolBindings([
            { name: '' },
            { name: '   ' },
            { name: 42 },
            { description: 'no name' },
            null,
            'not-an-object',
        ])).toEqual([]);
    });

    test('preserves explicit enabled=false and stealth=true', async () => {
        const { normalizeToolBindings } = await importFreshCore();

        const [binding] = normalizeToolBindings([{ name: 't', enabled: false, stealth: true }]);
        expect(binding.enabled).toBe(false);
        expect(binding.stealth).toBe(true);
    });
});

describe('isValidToolName', () => {
    test('accepts OpenAI-compatible tool names', async () => {
        const { isValidToolName } = await importFreshCore();

        expect(isValidToolName('game_content')).toBe(true);
        expect(isValidToolName('get-weather-2')).toBe(true);
        expect(isValidToolName('A')).toBe(true);
    });

    test('rejects invalid or overlong names', async () => {
        const { isValidToolName } = await importFreshCore();

        expect(isValidToolName('')).toBe(false);
        expect(isValidToolName('has space')).toBe(false);
        expect(isValidToolName('has.dot')).toBe(false);
        expect(isValidToolName('中文名')).toBe(false);
        expect(isValidToolName('x'.repeat(65))).toBe(false);
        expect(isValidToolName(null)).toBe(false);
    });
});

describe('sanitizeToolParameters', () => {
    test('returns the schema when it is a plain object', async () => {
        const { sanitizeToolParameters } = await importFreshCore();
        const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] };

        expect(sanitizeToolParameters(schema)).toEqual(schema);
    });

    test('falls back to an empty object schema for invalid input', async () => {
        const { sanitizeToolParameters } = await importFreshCore();

        expect(sanitizeToolParameters(undefined)).toEqual({ type: 'object', properties: {} });
        expect(sanitizeToolParameters('nope')).toEqual({ type: 'object', properties: {} });
        expect(sanitizeToolParameters([1, 2])).toEqual({ type: 'object', properties: {} });
    });
});

describe('createToolAction', () => {
    test('executes the body with args as the only parameter', async () => {
        const { createToolAction } = await importFreshCore();

        const action = createToolAction('return { ok: true, echo: args.content };');
        const result = await action({ content: 'hello' });

        expect(result).toEqual({ ok: true, echo: 'hello' });
    });

    test('supports await inside the action body', async () => {
        const { createToolAction } = await importFreshCore();

        const action = createToolAction('const v = await Promise.resolve(args.n * 2); return v;');
        await expect(action({ n: 21 })).resolves.toBe(42);
    });

    test('turns runtime errors into an error payload instead of throwing', async () => {
        const { createToolAction } = await importFreshCore();

        const action = createToolAction('throw new Error("boom");');
        const result = await action({});

        expect(typeof result).toBe('string');
        const parsed = JSON.parse(result);
        expect(parsed.ok).toBe(false);
        expect(parsed.error).toContain('boom');
    });

    test('turns syntax errors into an error payload at invocation time', async () => {
        const { createToolAction } = await importFreshCore();

        const action = createToolAction('this is not javascript (((');
        const result = await action({});

        const parsed = JSON.parse(result);
        expect(parsed.ok).toBe(false);
    });

    test('does not leak extra capability parameters into scope', async () => {
        const { createToolAction } = await importFreshCore();

        const action = createToolAction('return typeof context === "undefined" && typeof ctx === "undefined";');
        await expect(action({})).resolves.toBe(true);
    });
});

describe('hasEnabledToolBindings', () => {
    test('is true only when at least one binding is enabled', async () => {
        const { hasEnabledToolBindings } = await importFreshCore();

        expect(hasEnabledToolBindings([{ name: 'a', enabled: true }])).toBe(true);
        expect(hasEnabledToolBindings([{ name: 'a', enabled: false }])).toBe(false);
        expect(hasEnabledToolBindings([])).toBe(false);
        expect(hasEnabledToolBindings(undefined)).toBe(false);
    });
});
