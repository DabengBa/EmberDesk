import { describe, test, expect, jest, beforeAll } from '@jest/globals';

jest.unstable_mockModule('../src/util.js', () => ({
    getConfigValue: jest.fn((_key, defaultValue) => defaultValue),
    tryParse: (str) => { try { return JSON.parse(str); } catch { return undefined; } },
}));

/** @type {import('../src/prompt-converters.js')} */
let mod;

beforeAll(async () => {
    mod = await import('../src/prompt-converters.js');
});

function makeNames(charName = '', userName = '') {
    return {
        charName,
        userName,
    };
}


describe('addAssistantPrefix', () => {
    test('returns empty array unchanged', () => {
        expect(mod.addAssistantPrefix([], [], 'prefix')).toEqual([]);
    });

    test('sets property on last message when it is assistant and no tools', () => {
        const prompt = [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ];
        mod.addAssistantPrefix(prompt, [], 'prefix');
        expect(prompt[1].prefix).toBe(true);
    });

    test('does not set property when tools are present', () => {
        const prompt = [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ];
        mod.addAssistantPrefix(prompt, [{ type: 'function' }], 'prefix');
        expect(prompt[1].prefix).toBeUndefined();
    });

    test('does not set property when last message is not assistant', () => {
        const prompt = [
            { role: 'assistant', content: 'hello' },
            { role: 'user', content: 'hi' },
        ];
        mod.addAssistantPrefix(prompt, [], 'prefix');
        expect(prompt[0].prefix).toBeUndefined();
        expect(prompt[1].prefix).toBeUndefined();
    });

    test('does not set property when a tool role message exists in prompt', () => {
        const prompt = [
            { role: 'user', content: 'hi' },
            { role: 'tool', content: 'result' },
            { role: 'assistant', content: 'hello' },
        ];
        mod.addAssistantPrefix(prompt, [], 'prefix');
        expect(prompt[2].prefix).toBeUndefined();
    });
});


describe('convertTextCompletionPrompt', () => {
    test('passes through string input unchanged', () => {
        expect(mod.convertTextCompletionPrompt('raw prompt')).toBe('raw prompt');
    });

    test('converts basic message array to text format', () => {
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
        ];
        const result = mod.convertTextCompletionPrompt(messages);
        expect(result).toBe(
            'System: You are helpful.\nuser: Hello\nassistant: Hi there\nassistant:',
        );
    });

    test('uses name instead of role for named system messages', () => {
        const messages = [
            { role: 'system', name: 'Narrator', content: 'Once upon a time' },
        ];
        const result = mod.convertTextCompletionPrompt(messages);
        expect(result).toBe('Narrator: Once upon a time\nassistant:');
    });

    test('handles empty array', () => {
        expect(mod.convertTextCompletionPrompt([])).toBe('\nassistant:');
    });
});





describe('addReasoningContentToToolCalls', () => {
    test('adds reasoning_content to messages with tool_calls', () => {
        const messages = [
            { role: 'assistant', tool_calls: [{ id: '1', function: { name: 'f' } }] },
        ];
        mod.addReasoningContentToToolCalls(messages);
        expect(messages[0].reasoning_content).toBe('');
    });

    test('does not overwrite existing reasoning_content', () => {
        const messages = [
            { role: 'assistant', tool_calls: [{ id: '1' }], reasoning_content: 'existing' },
        ];
        mod.addReasoningContentToToolCalls(messages);
        expect(messages[0].reasoning_content).toBe('existing');
    });

    test('skips messages without tool_calls', () => {
        const messages = [{ role: 'user', content: 'hi' }];
        mod.addReasoningContentToToolCalls(messages);
        expect(messages[0].reasoning_content).toBeUndefined();
    });

    test('handles non-array input gracefully', () => {
        expect(() => mod.addReasoningContentToToolCalls(null)).not.toThrow();
        expect(() => mod.addReasoningContentToToolCalls('string')).not.toThrow();
    });
});


describe('embedOpenRouterMedia', () => {
    test('converts audio data URLs to input_audio format', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'audio_url',
                audio_url: { url: 'data:audio/wav;base64,AAAA' },
            }],
        }];
        mod.embedOpenRouterMedia(messages);
        expect(messages[0].content[0]).toEqual({
            type: 'input_audio',
            input_audio: { format: 'wav', data: 'AAAA' },
        });
    });

    test('defaults to mp3 for unknown audio mime types', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'audio_url',
                audio_url: { url: 'data:audio/ogg;base64,BBBB' },
            }],
        }];
        mod.embedOpenRouterMedia(messages);
        expect(messages[0].content[0].input_audio.format).toBe('mp3');
    });

    test('skips non-data-URL audio', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'audio_url',
                audio_url: { url: 'https://example.com/audio.mp3' },
            }],
        }];
        mod.embedOpenRouterMedia(messages);
        expect(messages[0].content[0].type).toBe('audio_url');
    });

    test('keeps video_url type for video data URLs', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'video_url',
                video_url: { url: 'data:video/mp4;base64,CCCC' },
            }],
        }];
        mod.embedOpenRouterMedia(messages);
        expect(messages[0].content[0].type).toBe('video_url');
    });

    test('skips non-data-URL video', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'video_url',
                video_url: { url: 'https://example.com/video.mp4' },
            }],
        }];
        mod.embedOpenRouterMedia(messages);
        expect(messages[0].content[0].type).toBe('video_url');
    });

    test('respects audio=false option', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'audio_url',
                audio_url: { url: 'data:audio/wav;base64,AAAA' },
            }],
        }];
        mod.embedOpenRouterMedia(messages, { audio: false, video: true });
        expect(messages[0].content[0].type).toBe('audio_url');
    });

    test('respects video=false option', () => {
        const messages = [{
            role: 'user',
            content: [{
                type: 'video_url',
                video_url: { url: 'data:video/mp4;base64,CCCC' },
            }],
        }];
        mod.embedOpenRouterMedia(messages, { audio: true, video: false });
        expect(messages[0].content[0].type).toBe('video_url');
    });

    test('handles non-array input gracefully', () => {
        expect(() => mod.embedOpenRouterMedia(null)).not.toThrow();
        expect(() => mod.embedOpenRouterMedia('string')).not.toThrow();
    });

    test('skips messages with string content', () => {
        const messages = [{ role: 'user', content: 'just text' }];
        mod.embedOpenRouterMedia(messages);
        expect(messages[0].content).toBe('just text');
    });
});


describe('cachingSystemPromptForOpenRouter', () => {
    test('adds cache_control to string system message', () => {
        const messages = [{ role: 'system', content: 'You are helpful.' }];
        mod.cachingSystemPromptForOpenRouter(messages);
        expect(messages[0].content).toEqual([
            { type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } },
        ]);
    });

    test('adds cache_control with TTL', () => {
        const messages = [{ role: 'system', content: 'System prompt' }];
        mod.cachingSystemPromptForOpenRouter(messages, '300');
        expect(messages[0].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '300' });
    });

    test('adds cache_control to last text part of array content', () => {
        const messages = [{
            role: 'system',
            content: [
                { type: 'text', text: 'first' },
                { type: 'text', text: 'second' },
            ],
        }];
        mod.cachingSystemPromptForOpenRouter(messages);
        expect(messages[0].content[0].cache_control).toBeUndefined();
        expect(messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    test('skips if system message already has cache_control', () => {
        const messages = [{ role: 'system', content: 'prompt', cache_control: { type: 'ephemeral' } }];
        mod.cachingSystemPromptForOpenRouter(messages);
        // content should remain a string, not converted
        expect(messages[0].content).toBe('prompt');
    });

    test('skips if array content already has cache_control', () => {
        const messages = [{
            role: 'system',
            content: [{ type: 'text', text: 'cached', cache_control: { type: 'ephemeral' } }],
        }];
        mod.cachingSystemPromptForOpenRouter(messages);
        // Should not add another cache_control
        expect(messages[0].content).toHaveLength(1);
    });

    test('does nothing with empty array', () => {
        expect(() => mod.cachingSystemPromptForOpenRouter([])).not.toThrow();
    });

    test('does nothing without system message', () => {
        const messages = [{ role: 'user', content: 'hi' }];
        mod.cachingSystemPromptForOpenRouter(messages);
        expect(messages[0].content).toBe('hi');
    });
});


describe('convertAI21Messages', () => {
    const names = makeNames('Bot', 'User');

    test('returns empty array for non-array input', () => {
        expect(mod.convertAI21Messages(null, names)).toEqual([]);
        expect(mod.convertAI21Messages('string', names)).toEqual([]);
    });

    test('extracts leading system messages into merged system prompt', () => {
        const messages = [
            { role: 'system', content: 'You are a bot.' },
            { role: 'system', content: 'Be helpful.' },
            { role: 'user', content: 'Hello' },
        ];
        const result = mod.convertAI21Messages(messages, names);
        expect(result[0]).toEqual({ role: 'system', content: 'You are a bot.\n\nBe helpful.' });
        expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    test('prepends character name to example_assistant system messages', () => {
        const messages = [
            { role: 'system', name: 'example_assistant', content: 'I greet you.' },
            { role: 'user', content: 'Hi' },
        ];
        const result = mod.convertAI21Messages(messages, names);
        expect(result[0].content).toContain('Bot: I greet you.');
    });

    test('does not double-prepend if name already present', () => {
        const messages = [
            { role: 'system', name: 'example_assistant', content: 'Bot: I greet you.' },
            { role: 'user', content: 'Hi' },
        ];
        const result = mod.convertAI21Messages(messages, names);
        expect(result[0].content).not.toContain('Bot: Bot:');
    });

    test('merges consecutive same-role messages', () => {
        const messages = [
            { role: 'user', content: 'First' },
            { role: 'user', content: 'Second' },
            { role: 'assistant', content: 'Reply' },
        ];
        const result = mod.convertAI21Messages(messages, names);
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('First\n\nSecond');
    });

    test('prepends name to non-system messages and deletes name property', () => {
        const messages = [
            { role: 'user', name: 'Alice', content: 'Hello' },
        ];
        const result = mod.convertAI21Messages(messages, names);
        expect(result[0].content).toBe('Alice: Hello');
        expect(result[0].name).toBeUndefined();
    });

    test('inserts placeholder when all messages are system', () => {
        const messages = [
            { role: 'system', content: 'Setup' },
        ];
        const result = mod.convertAI21Messages(messages, names);
        // After extracting the system message, array is empty, so placeholder is inserted
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ role: 'system', content: 'Setup' });
        expect(result[1].role).toBe('user');
    });
});


describe('convertCohereMessages', () => {
    const names = makeNames('Bot', 'User');

    test('inserts placeholder for empty messages', () => {
        const messages = [];
        const result = mod.convertCohereMessages(messages, names);
        expect(result.chatHistory).toHaveLength(1);
        expect(result.chatHistory[0].role).toBe('user');
    });

    test('prepends character name to example_assistant system messages', () => {
        const messages = [
            { role: 'system', name: 'example_assistant', content: 'Greetings' },
        ];
        const result = mod.convertCohereMessages(messages, names);
        expect(result.chatHistory[0].content).toBe('Bot: Greetings');
    });

    test('prepends user name to example_user system messages', () => {
        const messages = [
            { role: 'system', name: 'example_user', content: 'Hello there' },
        ];
        const result = mod.convertCohereMessages(messages, names);
        expect(result.chatHistory[0].content).toBe('User: Hello there');
    });

    test('prepends name to non-system messages', () => {
        const messages = [
            { role: 'assistant', name: 'NPC', content: 'I am an NPC' },
        ];
        const result = mod.convertCohereMessages(messages, names);
        expect(result.chatHistory[0].content).toBe('NPC: I am an NPC');
        expect(result.chatHistory[0].name).toBeUndefined();
    });

    test('handles tool_calls by extracting function names', () => {
        const messages = [
            { role: 'assistant', tool_calls: [{ function: { name: 'search' } }, { function: { name: 'fetch' } }] },
        ];
        const result = mod.convertCohereMessages(messages, names);
        expect(result.chatHistory[0].content).toContain('search, fetch');
    });
});


describe('convertXAIMessages', () => {
    const names = makeNames('Char', 'Player');

    test('returns empty array for non-array input', () => {
        expect(mod.convertXAIMessages(null, names)).toEqual([]);
    });

    test('prepends char name to assistant messages', () => {
        const messages = [
            { role: 'assistant', name: 'Char', content: 'Hello' },
        ];
        const result = mod.convertXAIMessages(messages, names);
        expect(result[0].content).toBe('Char: Hello');
        expect(result[0].name).toBeUndefined();
    });

    test('skips user role messages entirely', () => {
        const messages = [
            { role: 'user', name: 'Someone', content: 'Hello' },
        ];
        const result = mod.convertXAIMessages(messages, names);
        expect(result[0].content).toBe('Hello');
        expect(result[0].name).toBe('Someone');
    });

    test('handles named assistant content without a group prefix exception', () => {
        const names = makeNames('Char', 'Player');
        const messages = [
            { role: 'assistant', name: 'SomeNPC', content: 'Alice: speaking as Alice' },
        ];
        const result = mod.convertXAIMessages(messages, names);
        expect(result[0].content).toBe('Char: Alice: speaking as Alice');
    });
});


describe('mergeMessages', () => {
    const names = makeNames('Bot', 'User');

    test('squashes consecutive same-role messages', () => {
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'user', content: 'B' },
            { role: 'assistant', content: 'C' },
        ];
        const result = mod.mergeMessages(messages, names);
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('A\n\nB');
    });

    test('inserts placeholder for empty messages', () => {
        const result = mod.mergeMessages([], names);
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('user');
    });

    test('removes name property and prepends to content for non-system', () => {
        const messages = [
            { role: 'assistant', name: 'NPC', content: 'dialogue' },
        ];
        const result = mod.mergeMessages(messages, names);
        expect(result[0].content).toBe('NPC: dialogue');
        expect(result[0].name).toBeUndefined();
    });

    test('strict mode forces mid-prompt system to user', () => {
        const messages = [
            { role: 'system', content: 'Setup' },
            { role: 'system', content: 'More setup' },
            { role: 'user', content: 'Hi' },
        ];
        const result = mod.mergeMessages(messages, names, { strict: true });
        // First system stays, second should become user and merge
        expect(result[0].role).toBe('system');
        expect(result.filter(m => m.role === 'system')).toHaveLength(1);
    });

    test('single mode forces all roles to user', () => {
        const messages = [
            { role: 'system', content: 'Setup' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Response' },
        ];
        const result = mod.mergeMessages(messages, names, { single: true });
        expect(result.every(m => m.role === 'user')).toBe(true);
    });

    test('single mode prepends charName to assistant, userName to user', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi back' },
        ];
        const result = mod.mergeMessages(messages, names, { single: true });
        // Both become user and get merged
        expect(result[0].content).toContain('User: Hello');
        expect(result[0].content).toContain('Bot: Hi back');
    });

    test('tools=false removes tool_calls and tool_call_id', () => {
        const messages = [
            { role: 'assistant', content: 'calling', tool_calls: [{ id: '1' }] },
            { role: 'tool', content: 'result', tool_call_id: '1' },
        ];
        const result = mod.mergeMessages(messages, names, { tools: false });
        expect(result[0].tool_calls).toBeUndefined();
        // tool role should be converted to user
        const toolMsg = result.find(m => m.content === 'result' || m.content?.includes?.('result'));
        expect(toolMsg).toBeDefined();
    });

    test('flattens array content and preserves image URLs via tokens', () => {
        const imageContent = { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } };
        const messages = [
            { role: 'user', content: [{ type: 'text', text: 'Look at this' }, imageContent] },
        ];
        const result = mod.mergeMessages(messages, names);
        // Content should be reconstituted with image preserved
        expect(Array.isArray(result[0].content)).toBe(true);
        const types = result[0].content.map(c => c.type);
        expect(types).toContain('text');
        expect(types).toContain('image_url');
    });
});


describe('postProcessPrompt', () => {
    const names = makeNames('Bot', 'User');

    test('NONE type returns messages unchanged', () => {
        const messages = [{ role: 'user', content: 'hi' }];
        expect(mod.postProcessPrompt(messages, '', names)).toBe(messages);
    });

    test('MERGE type merges consecutive same-role messages', () => {
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'user', content: 'B' },
        ];
        const result = mod.postProcessPrompt(messages, 'merge', names);
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('A\n\nB');
    });

    test('deprecated CLAUDE type works same as MERGE', () => {
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'user', content: 'B' },
        ];
        const result = mod.postProcessPrompt(messages, 'claude', names);
        expect(result).toHaveLength(1);
    });
});



describe('getPromptNames', () => {
    test('extracts character and user names while ignoring retired group names', () => {
        const request = { body: { char_name: 'Bot', user_name: 'User', group_names: ['Alice', 'Bob'] } };
        const names = mod.getPromptNames(request);
        expect(names).toEqual({ charName: 'Bot', userName: 'User' });
    });

    test('defaults to empty strings when missing', () => {
        const request = { body: {} };
        expect(mod.getPromptNames(request)).toEqual({ charName: '', userName: '' });
    });
});


describe('convertClaudePrompt', () => {
    test('returns empty string for empty messages', () => {
        const result = mod.convertClaudePrompt([], false, '', false, false, '', false);
        expect(result).toBe('');
    });

    test('basic conversion with Human/Assistant prefixes', () => {
        const messages = [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
        ];
        const result = mod.convertClaudePrompt(messages, false, '', false, false, '', false);
        expect(result).toContain('Hello');
        expect(result).toContain('Hi there');
        expect(result).toContain('\n\nHuman: ');
        expect(result).toContain('\n\nAssistant: ');
    });

    test('adds assistant postfix when requested', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
        ];
        const result = mod.convertClaudePrompt(messages, true, '', false, false, '', false);
        expect(result).toMatch(/\n\nAssistant: $/);
    });

    test('adds assistant prefill when provided', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
        ];
        const result = mod.convertClaudePrompt(messages, true, 'Sure, I', false, false, '', false);
        expect(result).toMatch(/\n\nAssistant: Sure, I$/);
    });

    test('system prompt mode sets first message role to system', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Hello' },
        ];
        mod.convertClaudePrompt(messages, false, '', true, true, '', false);
        // First message should remain system (no prefix)
        expect(messages[0].role).toBe('system');
    });

    test('exclude prefixes mode sets non-last messages to system', () => {
        const messages = [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Second' },
            { role: 'user', content: 'Third' },
        ];
        const result = mod.convertClaudePrompt(messages, false, '', false, false, '', true);
        // Non-last messages should have been set to system role (no Human/Assistant prefix)
        // Last message keeps its original role
        expect(result).toContain('Third');
    });

    test('stringifies tool_calls into content', () => {
        const messages = [
            { role: 'assistant', content: 'Let me check', tool_calls: [{ id: '1', function: { name: 'search' } }] },
            { role: 'user', content: 'OK' },
        ];
        const result = mod.convertClaudePrompt(messages, false, '', false, false, '', false);
        expect(result).toContain('search');
    });
});





describe('convertMistralMessages', () => {
    const names = makeNames('Bot', 'User');

    test('returns empty array for non-array input', () => {
        expect(mod.convertMistralMessages(null, names)).toEqual([]);
    });

    test('prepends charName to example_assistant system messages', () => {
        const messages = [
            { role: 'system', name: 'example_assistant', content: 'Greetings' },
            { role: 'user', content: 'Hi' },
        ];
        const result = mod.convertMistralMessages(messages, names);
        expect(result[0].content).toBe('Bot: Greetings');
        expect(result[0].name).toBeUndefined();
    });

    test('prepends userName to example_user system messages', () => {
        const messages = [
            { role: 'system', name: 'example_user', content: 'Hello there' },
            { role: 'user', content: 'Hi' },
        ];
        const result = mod.convertMistralMessages(messages, names);
        expect(result[0].content).toBe('User: Hello there');
    });

    test('prepends name to non-system messages', () => {
        const messages = [
            { role: 'assistant', name: 'NPC', content: 'dialogue' },
        ];
        const result = mod.convertMistralMessages(messages, names);
        expect(result[0].content).toBe('NPC: dialogue');
        expect(result[0].name).toBeUndefined();
    });

    test('hashes tool call IDs', () => {
        const messages = [
            { role: 'assistant', content: 'calling', tool_calls: [{ id: 'original-id', function: { name: 'f' } }] },
            { role: 'tool', content: 'result', tool_call_id: 'original-id' },
        ];
        const result = mod.convertMistralMessages(messages, names);
        // IDs should be hashed to 9-char hex
        expect(result[0].tool_calls[0].id).toMatch(/^[a-f0-9]{9}$/);
        expect(result[1].tool_call_id).toMatch(/^[a-f0-9]{9}$/);
        // Both should match (same input -> same hash)
        expect(result[0].tool_calls[0].id).toBe(result[1].tool_call_id);
    });

    test('changes system to user when following assistant', () => {
        const messages = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' },
            { role: 'system', content: 'Narrator text' },
        ];
        const result = mod.convertMistralMessages(messages, names);
        expect(result[2].role).toBe('user');
    });

    test('merges user message after tool into previous user message', () => {
        const messages = [
            { role: 'user', content: 'search cats' },
            { role: 'assistant', content: 'calling', tool_calls: [{ id: 'tc1', function: { name: 'f' } }] },
            { role: 'tool', content: 'result', tool_call_id: 'tc1' },
            { role: 'user', content: 'thanks' },
        ];
        const result = mod.convertMistralMessages(messages, names);
        // The 'thanks' user message should be merged into the first user message
        expect(result[0].content).toContain('search cats');
        expect(result[0].content).toContain('thanks');
    });
});




describe('cachingAtDepthForOpenRouterClaude', () => {
    test('adds cache_control to string content by wrapping in array', () => {
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'assistant', content: 'B' },
            { role: 'user', content: 'C' },
        ];
        mod.cachingAtDepthForOpenRouterClaude(messages, 0, '300');
        // Find which message got cached
        const cached = messages.find(m =>
            Array.isArray(m.content) && m.content.some(c => c.cache_control),
        );
        expect(cached).toBeDefined();
        expect(cached.content[0].type).toBe('text');
        expect(cached.content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '300' });
    });

    test('adds cache_control to array content on last part', () => {
        const messages = [
            { role: 'user', content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'Reply' }] },
            { role: 'user', content: [{ type: 'text', text: 'C' }] },
        ];
        mod.cachingAtDepthForOpenRouterClaude(messages, 0, '300');
        const cached = messages.find(m =>
            m.content.some?.(c => c.cache_control),
        );
        expect(cached).toBeDefined();
    });

    test('skips system messages for depth counting', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'A' },
            { role: 'assistant', content: 'B' },
            { role: 'user', content: 'C' },
        ];
        mod.cachingAtDepthForOpenRouterClaude(messages, 0, '300');
        // System message should not get cache_control
        expect(messages[0].content).toBe('System prompt');
    });

    test('skips trailing assistant prefill', () => {
        const messages = [
            { role: 'user', content: 'A' },
            { role: 'assistant', content: 'Prefill' },
        ];
        mod.cachingAtDepthForOpenRouterClaude(messages, 0, '300');
        expect(typeof messages[1].content).toBe('string');
    });
});
