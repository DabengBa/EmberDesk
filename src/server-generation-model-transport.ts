import http from 'node:http';
import https from 'node:https';
import type { Readable } from 'node:stream';
import { Agent } from 'agent-base';
import fetch, { FetchError } from 'node-fetch';
import { ProxyAgent } from 'proxy-agent';
import { PrivateRequestAgent } from './private-request-filter.ts';
import { CHAT_COMPLETION_SOURCES, isChatCompletionStreaming } from '../public/scripts/openai-provider-capabilities.js';

type ModelStream = {
    baseUrl: string; model: string; messages: readonly object[]; maxTokens: number;
    signal: AbortSignal; emit: (text: string) => void; apiKey?: string; stream?: false;
    temperature?: number; frequencyPenalty?: number; presencePenalty?: number; topP?: number;
    tools?: readonly object[]; toolChoice?: object | 'none'; reasoningEffort?: string; verbosity?: string;
    onTools?: (calls: ModelToolCall[]) => void;
};
export type ModelToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export class InvalidModelReply extends Error {}

export class ModelResponseStatusError extends Error {
    readonly status: number;
    constructor(status: number) {
        super(`Model got response status ${status}`);
        this.status = status;
    }
}

function buildRequest(input: ModelStream) {
    const { model, reasoningEffort } = input;
    const stream = input.stream ?? isChatCompletionStreaming({ chat_completion_source: CHAT_COMPLETION_SOURCES.OPENAI, stream_openai: true }, model, 'normal');
    // Match the legacy OpenAI request rules using this attempt's model, not the configured default.
    const o1 = model.startsWith('o1');
    const oSeries = o1 || model.startsWith('o3') || model.startsWith('o4');
    const gpt5 = /gpt-5/.test(model);
    const gpt5ChatLatest = /gpt-5-chat-latest/.test(model);
    const usesCompletionTokens = oSeries || gpt5;
    const allowsPenalties = !oSeries && (!gpt5 || gpt5ChatLatest);
    const allowsSampling = allowsPenalties || (!oSeries && /gpt-5\.(1|2|3|4)/.test(model) && !/chat-latest/.test(model) && !reasoningEffort);
    const allowsTools = !o1 && !gpt5ChatLatest;
    return {
        model,
        messages: o1 ? input.messages.map(message => 'role' in message && message.role === 'system' ? { ...message, role: 'user' } : message) : input.messages,
        ...(usesCompletionTokens ? { max_completion_tokens: input.maxTokens } : { max_tokens: input.maxTokens }),
        stream,
        temperature: allowsSampling ? input.temperature : undefined,
        top_p: allowsSampling ? input.topP : undefined,
        frequency_penalty: allowsPenalties ? input.frequencyPenalty : undefined,
        presence_penalty: allowsPenalties ? input.presencePenalty : undefined,
        tools: allowsTools ? input.tools : undefined,
        tool_choice: allowsTools ? input.toolChoice : undefined,
        reasoning_effort: reasoningEffort,
        verbosity: input.verbosity,
    };
}

function deliverTools(input: ModelStream, calls: ModelToolCall[]) {
    if (calls.length && !input.onTools) throw new Error('Unexpected model tool calls');
    input.onTools?.(calls);
}

/** Read one OpenAI-compatible completion from a configured model connection. */
export async function streamServerModel(input: ModelStream): Promise<string> {
    let target = new URL(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`);
    const origin = target.origin;
    const parameters = buildRequest(input);
    const body = JSON.stringify(parameters);
    const httpAgent = new http.Agent();
    const httpsAgent = new https.Agent();
    try {
        for (let redirects = 0; redirects <= 5; redirects++) {
            if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid model URL');
            const current = target;
            const agent = new class extends Agent {
                async connect(request: http.ClientRequest): Promise<http.Agent> {
                    const secure = current.protocol === 'https:';
                    let directAgent = secure ? https.globalAgent : http.globalAgent;
                    if (directAgent instanceof ProxyAgent) {
                        if (await directAgent.getProxyForUrl(current.href, request)) {
                            throw new Error('Model request through an unverified proxy is not permitted');
                        }
                        directAgent = secure ? directAgent.httpsAgent : directAgent.httpAgent;
                    }
                    if (directAgent instanceof PrivateRequestAgent) return directAgent;
                    return secure ? httpsAgent : httpAgent;
                }
            }();
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (input.apiKey && current.origin === origin) headers.authorization = `Bearer ${input.apiKey}`;
            const response = await fetch(current, { method: 'POST', body, headers, signal: input.signal, redirect: 'manual', agent });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get('location');
                (response.body as Readable | null)?.destroy();
                if (!location || redirects === 5) throw new Error('Invalid model redirect');
                target = new URL(location, current);
                continue;
            }
            if (!response.ok || !response.body) {
                (response.body as Readable | null)?.destroy();
                throw new ModelResponseStatusError(response.status);
            }
            const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
            if (!parameters.stream || contentType === 'application/json' || contentType?.endsWith('+json')) {
                const completion = await response.json() as { choices?: { message?: { content?: unknown; tool_calls?: ModelToolCall[] } }[] } | null;
                const message = completion?.choices?.[0]?.message;
                if (!message || typeof message !== 'object') throw new InvalidModelReply('Invalid model completion');
                const text = typeof message.content === 'string' ? message.content : '';
                if (text) input.emit(text);
                deliverTools(input, message.tool_calls ?? []);
                return text;
            }
            let pending = '';
            let result = '';
            const tools = new Map<number, ModelToolCall>();

            const decoder = new TextDecoder();
            for await (const chunk of response.body) {
                pending += decoder.decode(chunk as Buffer, { stream: true });
                const lines = pending.split(/\r?\n/);
                pending = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const data = line.slice(5).trim();
                    if (!data) continue;
                    if (data === '[DONE]') {
                        deliverTools(input, [...tools.values()]);
                        return result;
                    }
                    const delta = (JSON.parse(data) as { choices?: { delta?: { content?: unknown; tool_calls?: (Partial<ModelToolCall> & { index: number })[] } }[] }).choices?.[0]?.delta;
                    for (const chunk of delta?.tool_calls ?? []) {
                        const call = tools.get(chunk.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
                        call.id += chunk.id ?? '';
                        call.function.name += chunk.function?.name ?? '';
                        call.function.arguments += chunk.function?.arguments ?? '';
                        tools.set(chunk.index, call);
                    }
                    const text = delta?.content;
                    if (typeof text === 'string' && text) { result += text; input.emit(text); }
                }
            }
            throw new Error('Model stream incomplete');
        }
        throw new Error('Invalid model redirect');
    } catch (error) {
        if (error instanceof FetchError && error.type === 'system' && error.code) {
            throw new Error('Model network request failed', { cause: error });
        }
        throw error;
    } finally {
        httpAgent.destroy();
        httpsAgent.destroy();
    }
}
