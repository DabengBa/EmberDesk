import { describe, expect, test } from '@jest/globals';

import {
    buildGreetingOptions,
    canSwitchGreeting,
    getAdjacentGreetingIndex,
    replaceGreeting,
    summarizeGreeting,
} from '../public/scripts/main-chat-greetings.js';

function greetingMessage() {
    return {
        name: 'Assistant',
        is_user: false,
        is_system: false,
        send_date: '2026-10-25T00:00:00.000Z',
        mes: 'Original greeting',
        extra: {},
    };
}

function switchContext(overrides = {}) {
    return {
        characterId: 0,
        chat: [greetingMessage()],
        isGenerating: false,
        isChatSaving: false,
        isEditing: false,
        ...overrides,
    };
}

describe('main chat greeting options', () => {
    test('keeps the main greeting first and alternate indices stable across blank entries', () => {
        const character = {
            first_mes: 'Main greeting',
            data: { alternate_greetings: ['First alternate', '', '   ', 'Last alternate'] },
        };
        const before = structuredClone(character);

        expect(buildGreetingOptions(character)).toEqual([
            { index: 0, text: 'Main greeting' },
            { index: 1, text: 'First alternate' },
            { index: 4, text: 'Last alternate' },
        ]);
        expect(character).toEqual(before);
    });

    test('preserves authored text and duplicate greetings instead of rewriting the card', () => {
        expect(buildGreetingOptions({
            first_mes: '  Hello {{user}}!\n',
            data: { alternate_greetings: ['Same', 'Same'] },
        })).toEqual([
            { index: 0, text: '  Hello {{user}}!\n' },
            { index: 1, text: 'Same' },
            { index: 2, text: 'Same' },
        ]);
    });

    test.each([
        [undefined],
        [{}],
        [{ first_mes: ' ', data: { alternate_greetings: null } }],
        [{ data: { alternate_greetings: 'not an array' } }],
        [{ data: { alternate_greetings: [null, 42, {}, '\n'] } }],
    ])('returns no options for missing or invalid greeting text: %j', character => {
        expect(buildGreetingOptions(character)).toEqual([]);
    });

    test('allows an alternate when the main greeting is empty', () => {
        expect(buildGreetingOptions({
            first_mes: '',
            data: { alternate_greetings: ['Alternate only'] },
        })).toEqual([{ index: 1, text: 'Alternate only' }]);
    });

    test('summarizes multiline text without changing the greeting payload', () => {
        expect(summarizeGreeting('  Hello\n\tthere   {{user}}!  ')).toBe('Hello there {{user}}!');
        expect(summarizeGreeting('Short greeting')).toBe('Short greeting');
        expect(summarizeGreeting('   ')).toBe('');
    });

    test('cycles through valid greetings while preserving authored indices', () => {
        const options = [
            { index: 0, text: 'Main greeting' },
            { index: 1, text: 'First alternate' },
            { index: 4, text: 'Last alternate' },
        ];

        expect(getAdjacentGreetingIndex(options, 1, -1)).toBe(0);
        expect(getAdjacentGreetingIndex(options, 1, 1)).toBe(4);
        expect(getAdjacentGreetingIndex(options, 0, -1)).toBe(4);
        expect(getAdjacentGreetingIndex(options, 4, 1)).toBe(0);
        expect(getAdjacentGreetingIndex(options, null, -1)).toBe(4);
        expect(getAdjacentGreetingIndex(options, null, 1)).toBe(0);
    });
});

describe('greeting switch eligibility', () => {
    test('accepts character zero with exactly one character message', () => {
        expect(canSwitchGreeting(switchContext())).toBe(true);
    });

    test.each([
        ['no selected character', { characterId: undefined }],
        ['null selected character', { characterId: null }],
        ['empty chat', { chat: [] }],
        ['conversation already started', { chat: [greetingMessage(), { is_user: true, mes: 'Reply' }] }],
        ['user message', { chat: [{ ...greetingMessage(), is_user: true }] }],
        ['system message', { chat: [{ ...greetingMessage(), is_system: true }] }],
        ['generation in progress', { isGenerating: true }],
        ['save in progress', { isChatSaving: true }],
        ['message edit in progress', { isEditing: true }],
        ['used greeting after continue', { metadata: { tainted: true } }],
    ])('rejects %s without modifying the chat', (_label, overrides) => {
        const context = switchContext(overrides);
        const before = structuredClone(context);

        expect(canSwitchGreeting(context)).toBe(false);
        expect(context).toEqual(before);
    });
});

describe('greeting replacement', () => {
    test('replaces the first message rather than appending and preserves unrelated chat metadata', () => {
        const context = switchContext();
        context.chat[0] = {
            ...greetingMessage(),
            swipe_id: 1,
            swipes: ['Old swipe', 'Original greeting'],
            swipe_info: [{ extra: {} }, { extra: { reasoning: 'Old reasoning' } }],
            extra: { reasoning: 'Old reasoning', token_count: 80 },
            gen_started: 'old-start',
            gen_finished: 'old-finish',
        };
        const metadata = {
            integrity: 'integrity-1',
            chat_id: 'chat-1',
            scenario: 'Keep this scenario',
            variables: { score: 3 },
        };
        const input = {
            ...context,
            metadata,
            message: { ...greetingMessage(), mes: 'Selected alternate', send_date: 'new-date' },
        };
        const before = structuredClone(input);

        const result = replaceGreeting(input);

        expect(result.chat).toEqual([input.message]);
        expect(result.chat[0]).not.toHaveProperty('swipes');
        expect(result.chat[0]).not.toHaveProperty('swipe_info');
        expect(result.chat[0]).not.toHaveProperty('gen_started');
        expect(result.chat[0].extra).toEqual({});
        expect(result.metadata).toEqual(metadata);
        expect(input).toEqual(before);
    });

    test.each([
        ['conversation with a reply', { chat: [greetingMessage(), { is_user: true, mes: 'Keep me' }] }],
        ['active generation', { isGenerating: true }],
        ['active save', { isChatSaving: true }],
        ['active edit', { isEditing: true }],
    ])('refuses replacement for %s and leaves input untouched', (_label, overrides) => {
        const input = {
            ...switchContext(overrides),
            metadata: { integrity: 'keep' },
            message: { ...greetingMessage(), mes: 'Alternate' },
        };
        const before = structuredClone(input);

        expect(replaceGreeting(input)).toBeNull();
        expect(input).toEqual(before);
    });
});
