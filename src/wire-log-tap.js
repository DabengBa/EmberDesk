/**
 * Wire log SSE assembler.
 *
 * The upstream response is piped byte-for-byte to the browser, so nothing in
 * the normal path ever parses it. This module reconstructs a readable view of
 * a streamed completion from the raw bytes while leaving the pipe untouched.
 *
 * It is deliberately tolerant: a malformed line is recorded in `parseErrors`
 * and skipped rather than thrown, because logging must never break a
 * generation.
 */

import { StringDecoder } from 'node:string_decoder';

const SSE_DATA_PREFIX = 'data:';
const SSE_DONE = '[DONE]';
// Context fields that are fixed for the whole generation. They come from the
// request (the client's `_trace` or the endpoint's own knowledge), not from the
// response bytes, so they are resolved once when the session begins.
const TRACE_STRING_FIELDS = ['chatId', 'charName', 'type', 'model', 'source', 'pipelineRun', 'pipelineStep'];

/**
 * Builds the trace context stamped onto every entry of one record session.
 *
 * The active chat is the one field the server cannot always infer (a chat file
 * can be renamed while a turn is in flight, and the endpoint never sees the
 * client's chat state), so it is read from the request context first and only
 * then from the endpoint-supplied `chatId` override. Non-string or empty
 * values are dropped rather than coerced, so a malformed client cannot inject
 * structure into a stored record.
 * @param {object} args
 * @param {object} [args.context] Generation context from the endpoint / `_trace`
 * @param {string} [args.chatId] Explicit active chat id from the caller
 * @returns {{context: object, chatId: string|null}} Trace context plus the resolved chat id
 */
export function createRecordTrace({ context = {}, chatId } = {}) {
    const source = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
    /** @type {Record<string, string|boolean>} */
    const trace = {};
    for (const field of TRACE_STRING_FIELDS) {
        const value = source[field];
        if (typeof value === 'string' && value) {
            trace[field] = value;
        }
    }
    if (typeof chatId === 'string' && chatId) {
        trace.chatId = chatId;
    }
    if (typeof source.regenerate === 'boolean') {
        trace.regenerate = source.regenerate;
    }
    return { context: trace, chatId: typeof trace.chatId === 'string' ? trace.chatId : null };
}

/**
 * @typedef {object} AssembledToolCall
 * @property {number} index Position within the assistant's tool call list
 * @property {string} id Provider call id (stamped by the first fragment)
 * @property {string} type Always 'function'
 * @property {{name: string, arguments: string}} function Merged name/arguments
 */

/**
 * @typedef {object} AssembledStream
 * @property {string} content Concatenated `delta.content`
 * @property {string} reasoning Concatenated `delta.reasoning_content` / `delta.reasoning`
 * @property {string|null} finishReason Last non-null `finish_reason`
 * @property {AssembledToolCall[]} toolCalls Merged by `index`
 * @property {string[]} parseErrors Unparseable `data:` payloads
 * @property {number} events Successfully parsed SSE events
 * @property {object|null} usage Last `usage` block the stream carried
 */

/**
 * Merges one `delta.tool_calls` fragment into the accumulator.
 * Fragments address their target by `index`; name and arguments arrive split
 * across events, so both are concatenated in arrival order.
 * @param {Map<number, AssembledToolCall>} store Accumulator
 * @param {object} fragment Incoming delta tool call fragment
 */
function mergeToolCallFragment(store, fragment) {
    const index = Number.isInteger(fragment?.index) ? fragment.index : 0;
    const existing = store.get(index) ?? {
        index,
        id: '',
        type: 'function',
        function: { name: '', arguments: '' },
    };

    if (typeof fragment?.id === 'string' && fragment.id) {
        existing.id = fragment.id;
    }
    if (typeof fragment?.type === 'string' && fragment.type) {
        existing.type = fragment.type;
    }
    if (typeof fragment?.function?.name === 'string') {
        existing.function.name += fragment.function.name;
    }
    if (typeof fragment?.function?.arguments === 'string') {
        existing.function.arguments += fragment.function.arguments;
    }

    store.set(index, existing);
}

/**
 * Applies one parsed SSE payload to the accumulator.
 * @param {any} payload Parsed JSON payload
 * @param {object} state Mutable accumulator state
 */
function applyPayload(payload, state) {
    // Token counts travel on their own trailing event when the caller asked for
    // `stream_options.include_usage`, so the last one wins.
    if (payload?.usage && typeof payload.usage === 'object' && !Array.isArray(payload.usage)) {
        state.usage = payload.usage;
    }
    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    for (const choice of choices) {
        const delta = choice?.delta;
        if (typeof delta?.content === 'string') {
            state.content += delta.content;
        }
        // Providers disagree on the reasoning field name; both travel the
        // same way and are only kept for human inspection.
        if (typeof delta?.reasoning_content === 'string') {
            state.reasoning += delta.reasoning_content;
        } else if (typeof delta?.reasoning === 'string') {
            state.reasoning += delta.reasoning;
        }
        if (Array.isArray(delta?.tool_calls)) {
            for (const fragment of delta.tool_calls) {
                mergeToolCallFragment(state.toolCalls, fragment);
            }
        }
        // finish_reason also arrives on non-delta `message` payloads for the
        // few providers that ignore streaming and send one full object.
        const finishReason = choice?.finish_reason ?? choice?.message?.finish_reason;
        if (typeof finishReason === 'string' && finishReason) {
            state.finishReason = finishReason;
        }
        if (typeof choice?.message?.content === 'string') {
            state.content += choice.message.content;
        }
    }
}

/**
 * Creates a streaming accumulator fed raw response chunks.
 * @returns {{push: (chunk: Buffer|string) => void, finish: () => AssembledStream}}
 */
export function createSseAssembler() {
    /** @type {Map<number, AssembledToolCall>} */
    const toolCalls = new Map();
    const state = {
        content: '',
        reasoning: '',
        finishReason: null,
        usage: null,
        toolCalls,
        parseErrors: [],
        events: 0,
    };
    // Bytes may split mid-line, mid-JSON, or mid-CRLF; buffer until a full
    // SSE event separator arrives.
    let buffer = '';
    const decoder = new StringDecoder('utf8');

    /**
     * @param {Buffer|string} chunk Raw bytes from the upstream stream
     */
    function push(chunk) {
        buffer += Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk ?? '');

        let separatorIndex = buffer.search(/\r?\n\r?\n/);
        while (separatorIndex !== -1) {
            const match = buffer.slice(separatorIndex).match(/^\r?\n\r?\n/);
            const eventText = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + match[0].length);
            consumeEvent(eventText);
            separatorIndex = buffer.search(/\r?\n\r?\n/);
        }
    }

    /**
     * @param {string} eventText One complete SSE event block
     */
    function consumeEvent(eventText) {
        for (const line of eventText.split(/\r?\n/)) {
            if (!line.startsWith(SSE_DATA_PREFIX)) {
                continue;
            }
            const payloadText = line.slice(SSE_DATA_PREFIX.length).trim();
            if (!payloadText || payloadText === SSE_DONE) {
                continue;
            }
            try {
                applyPayload(JSON.parse(payloadText), state);
                state.events += 1;
            } catch {
                state.parseErrors.push(payloadText.slice(0, 200));
            }
        }
    }

    /**
     * @returns {AssembledStream} Accumulated view of the stream
     */
    function finish() {
        buffer += decoder.end();
        // A trailing event without the final blank line still counts.
        if (buffer.trim()) {
            consumeEvent(buffer);
            buffer = '';
        }
        return {
            content: state.content,
            reasoning: state.reasoning,
            finishReason: state.finishReason,
            usage: state.usage,
            toolCalls: [...toolCalls.values()].sort((left, right) => left.index - right.index),
            parseErrors: state.parseErrors,
            events: state.events,
        };
    }

    return { push, finish };
}

/**
 * Trims an assembler result down to the fields a viewer needs, so the stored
 * record does not carry accumulation bookkeeping.
 * @param {AssembledStream} assembled Result of `createSseAssembler().finish()`
 * @returns {{content: string, reasoning: string, finishReason: string|null, usage: object|null, toolCalls: AssembledToolCall[]}}
 */
export function summarizeSseAssembled(assembled) {
    return {
        content: assembled.content,
        reasoning: assembled.reasoning,
        finishReason: assembled.finishReason,
        usage: assembled.usage ?? null,
        toolCalls: assembled.toolCalls,
    };
}
