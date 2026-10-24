import { describe, expect, test } from '@jest/globals';

async function importTap() {
    return import(`../src/wire-log-tap.js?cacheBust=${Date.now()}-${Math.random()}`);
}

function sseChunk(payload) {
    return Buffer.from(`data: ${JSON.stringify(payload)}\n\n`, 'utf8');
}

describe('createSseAssembler', () => {
    test('preserves UTF-8 characters split across byte chunks', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();
        const payload = Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: '中文' } }] })}\n\n`);
        const split = payload.indexOf(Buffer.from('中')) + 1;
        assembler.push(payload.subarray(0, split));
        assembler.push(payload.subarray(split));
        expect(assembler.finish().content).toBe('中文');
    });
    test('concatenates delta.content across chunks', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: 'Hello' } }] }));
        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: ' world' } }] }));
        assembler.push(Buffer.from('data: [DONE]\n\n', 'utf8'));

        const assembled = assembler.finish();
        expect(assembled.content).toBe('Hello world');
        expect(assembled.finishReason).toBeNull();
    });

    test('merges tool_calls fragments by index', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(sseChunk({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'draft', arguments: '' } }] } }],
        }));
        assembler.push(sseChunk({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"content":' } }] } }],
        }));
        assembler.push(sseChunk({
            choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"hi"}' } }] } }],
        }));
        assembler.push(sseChunk({
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        }));

        const assembled = assembler.finish();
        expect(assembled.finishReason).toBe('tool_calls');
        expect(assembled.toolCalls).toEqual([{
            index: 0,
            id: 'call_a',
            type: 'function',
            function: { name: 'draft', arguments: '{"content":"hi"}' },
        }]);
    });

    test('keeps parallel tool calls separate by index', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(sseChunk({
            choices: [{
                index: 0,
                delta: {
                    tool_calls: [
                        { index: 0, id: 'a', type: 'function', function: { name: 'draft', arguments: '{"x":1}' } },
                        { index: 1, id: 'b', type: 'function', function: { name: 'review', arguments: '{"y":2}' } },
                    ],
                },
            }],
        }));

        const assembled = assembler.finish();
        expect(assembled.toolCalls.map(call => call.function.name)).toEqual(['draft', 'review']);
        expect(assembled.toolCalls.map(call => call.function.arguments)).toEqual(['{"x":1}', '{"y":2}']);
    });

    test('collects reasoning_content separately from content', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(sseChunk({ choices: [{ index: 0, delta: { reasoning_content: 'thinking' } }] }));
        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: 'answer' } }] }));

        const assembled = assembler.finish();
        expect(assembled.reasoning).toBe('thinking');
        expect(assembled.content).toBe('answer');
    });

    test('tolerates split CRLF boundaries between pushes', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();
        const payload = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'ab' } }] })}\n\n`;

        assembler.push(Buffer.from(payload.slice(0, 20), 'utf8'));
        assembler.push(Buffer.from(payload.slice(20), 'utf8'));

        expect(assembler.finish().content).toBe('ab');
    });

    test('records malformed lines instead of throwing', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(Buffer.from('data: {not json}\n\n', 'utf8'));
        const assembled = assembler.finish();

        expect(assembled.content).toBe('');
        expect(assembled.parseErrors).toHaveLength(1);
    });

    test('captures the usage block of the final event', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: 'hi' } }] }));
        // `stream_options.include_usage` puts counts on their own trailing
        // event, after the finish_reason event.
        assembler.push(sseChunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
        assembler.push(sseChunk({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }));
        assembler.push(Buffer.from('data: [DONE]\n\n', 'utf8'));

        expect(assembler.finish().usage).toEqual({ prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 });
    });

    test('leaves usage null when no event carries one', async () => {
        const { createSseAssembler } = await importTap();
        const assembler = createSseAssembler();

        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: 'hi' } }] }));
        assembler.push(Buffer.from('data: [DONE]\n\n', 'utf8'));

        expect(assembler.finish().usage).toBeNull();
    });
});

describe('summarizeSseAssembled', () => {
    test('exposes message-shaped view for the viewer', async () => {
        const { createSseAssembler, summarizeSseAssembled } = await importTap();
        const assembler = createSseAssembler();
        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: 'stop' }] }));

        expect(summarizeSseAssembled(assembler.finish())).toEqual({
            content: 'hi',
            reasoning: '',
            finishReason: 'stop',
            usage: null,
            toolCalls: [],
        });
    });

    test('carries usage into the viewer view', async () => {
        const { createSseAssembler, summarizeSseAssembled } = await importTap();
        const assembler = createSseAssembler();
        assembler.push(sseChunk({ choices: [{ index: 0, delta: { content: 'hi' } }] }));
        assembler.push(sseChunk({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }));

        expect(summarizeSseAssembled(assembler.finish()).usage).toEqual({
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
        });
    });
});

describe('createRecordTrace', () => {
    test('carries the request-supplied chat id', async () => {
        const { createRecordTrace } = await importTap();

        const { context, chatId } = createRecordTrace({
            context: { chatId: 'chat-file', charName: 'Seraphina', type: 'normal', regenerate: true },
        });

        expect(chatId).toBe('chat-file');
        expect(context).toEqual({ chatId: 'chat-file', charName: 'Seraphina', type: 'normal', regenerate: true });
    });

    test('prefers the endpoint-supplied chat id over the request and leaves _trace intact', async () => {
        const { createRecordTrace } = await importTap();

        const { context, chatId } = createRecordTrace({
            context: { chatId: 'from-trace' },
            chatId: 'from-endpoint',
        });

        expect(chatId).toBe('from-endpoint');
        expect(context.chatId).toBe('from-endpoint');
    });

    test('drops empty, non-string and unlisted fields', async () => {
        const { createRecordTrace } = await importTap();

        expect(createRecordTrace({ context: { chatId: '', charName: 42, model: 'm', chat_id: 'x' } })).toEqual({
            context: { model: 'm' },
            chatId: null,
        });
        expect(createRecordTrace()).toEqual({ context: {}, chatId: null });
        expect(createRecordTrace({ context: null, chatId: '' })).toEqual({ context: {}, chatId: null });
        expect(createRecordTrace({ context: ['chatId'] })).toEqual({ context: {}, chatId: null });
    });

    test('preserves pipeline trace fields', async () => {
        const { createRecordTrace } = await importTap();
        expect(createRecordTrace({ context: { pipelineRun: 'run-1', pipelineStep: 'tool-1' } }).context)
            .toEqual({ pipelineRun: 'run-1', pipelineStep: 'tool-1' });
    });
});
