/* eslint-disable dot-notation */
import express from 'express';
import type { Request } from 'express';
import fetch from 'node-fetch';
import type { RequestInit } from 'node-fetch';
import urlJoin from 'url-join';
import path from 'node:path';
import { STATUS_CODES } from 'node:http';

import {
    CHAT_COMPLETION_SOURCES,
    OPENAI_FIXED_REASONING_EFFORT,
    OPENAI_REASONING_EFFORT_MAP,
    OPENAI_REASONING_EFFORT_MODELS,
    OPENAI_VERBOSITY_MODELS,
} from '../../constants.js';
import {
    forwardFetchResponse,
    getConfigValue,
    tryParse,
    uuidv4,
    flattenSchema,
} from '../../util.js';
import {
    getPromptNames,
    embedOpenRouterMedia,
    postProcessPrompt,
} from '../../prompt-converters.js';

import { readSecret, SECRET_KEYS } from '../secrets.js';
import { normalizeWireLogOptions, createWireLogRecorder } from '../../wire-log-recorder.ts';
import { readWireLogSettings } from '../wire-log.ts';

const API_OPENAI = 'https://api.openai.com/v1';
const SAFE_TRANSPORT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN']);

function transportErrorCode(error: unknown): string {
    if (error instanceof Error && error.name === 'AbortError') return 'UPSTREAM_ABORTED';
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    return typeof code === 'string' && SAFE_TRANSPORT_CODES.has(code) ? code : 'UPSTREAM_TRANSPORT_ERROR';
}

function logUpstreamError(status: number, code: string): void {
    console.warn('Chat completion upstream failure', { status, code });
}

// These describe the existing upstream request contract, not runtime validation.
type ChatBody = {
    chat_completion_source: string; custom_url?: string; secret_id?: string;
    messages: unknown; model: string; reasoning_effort?: string; verbosity?: string;
    json_schema?: { name: unknown; strict?: unknown; value: unknown };
    stop?: unknown; tools?: unknown; tool_choice?: unknown; stream?: unknown;
    temperature?: unknown; max_tokens?: unknown; max_completion_tokens?: unknown;
    presence_penalty?: unknown; frequency_penalty?: unknown; top_p?: unknown;
    top_k?: unknown; seed?: unknown; n?: unknown; _trace?: unknown;
};
type TraceContext = Record<string, unknown> & { chatId?: string };
type Recorder = ReturnType<typeof createWireLogRecorder>;
type Session = NonNullable<ReturnType<Recorder['begin']>>;
type ChatRequest = Request<Record<string, string>, unknown, ChatBody> & {
    wireLogSession?: Session | null;
    wireLogRecorder?: Recorder;
};
type PipeOptions = { onChunk?: (chunk: Buffer | string) => void; onComplete?: () => void; onError?: (error: unknown) => void };

export const router = express.Router();


/**
 * Reads `feature_settings.wire_log` from the canonical settings document.
 * Uses the same persisted settings read as the config route. Unavailable
 * settings retain the opt-out defaults instead of silently muting evidence.
 * @param {import('express').Request} request Express request
 * @returns {Promise<object>} Raw stored fragment, empty when unavailable
 */
async function readWireLogSettingsFragment(request: Request) {
    try {
        const state = await readWireLogSettings(request);
        return state.ok ? state.raw : {};
    } catch (error) {
        console.warn('[wire-log] settings read failed', error instanceof Error ? error.message : error);
        return {};
    }
}

/**
 * Builds a recorder for this request. Returns a disabled recorder whenever the
 * switch is off or the user root is unknown, so callers can stay uniform.
 * @param {import('express').Request} request Express request
 * @returns {Promise<{recorder: object, raw: object}>} Recorder plus raw options
 */
async function createRequestWireLog(request: Request) {
    const raw = await readWireLogSettingsFragment(request);
    const options = normalizeWireLogOptions(raw);
    const root = request.user?.directories?.root;
    if (!options.enabled || !root) {
        return { recorder: createWireLogRecorder({ enabled: false }), raw };
    }
    const recorder = createWireLogRecorder({
        storeRoot: path.join(root, 'wire-logs'),
        enabled: true,
        captureBody: options.captureBody,
        maxFileBytes: options.maxFileBytes,
        retentionDays: options.retentionDays,
        redact: options.redact,
    });
    return { recorder, raw };
}

router.post<Record<string, string>, unknown, ChatBody>('/status', async function (request, statusResponse) {
    try {
        if (!request.body) return statusResponse.sendStatus(400);

        let apiUrl = '';
        let apiKey = '';
        let headers = {};
        let queryParams: Record<string, string> = {};

        if (request.body.chat_completion_source === CHAT_COMPLETION_SOURCES.OPENAI) {
            apiUrl = request.body.custom_url || API_OPENAI;
            apiKey = readSecret(request.user.directories, SECRET_KEYS.OPENAI, request.body.secret_id);
        } else {
            console.warn('This chat completion source is not supported yet.');
            return statusResponse.status(400).send({ error: true });
        }

        if (!apiKey && !request.body.custom_url) {
            console.warn('Chat Completion API key is missing.');
            return statusResponse.status(400).send({ error: true });
        }

        const modelsUrl = new URL(urlJoin(apiUrl, '/models'));
        Object.keys(queryParams).forEach(key => {
            modelsUrl.searchParams.append(key, queryParams[key]);
        });
        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                ...headers,
            },
        });

        if (response.ok) {
            const data = await response.json() as { data?: unknown } | null;

            statusResponse.send(data);

            const models = data?.data;

            if (Array.isArray(models)) {
                const modelIds = models.filter(x => x && typeof x === 'object').map(x => x.id).sort();
                console.info('Available models:', modelIds);
            } else {
                console.warn('Chat Completion endpoint did not return a list of models.');
            }
        } else {
            console.error('Chat Completion status check failed. Either Access Token is incorrect or API endpoint is down.');
            statusResponse.send({ error: true, data: { data: [] } });
        }
    } catch (e) {
        logUpstreamError(502, transportErrorCode(e));

        if (!statusResponse.headersSent) {
            statusResponse.send({ error: true });
        } else {
            statusResponse.end();
        }
    }
});

router.post<Record<string, string>, unknown, ChatBody>('/generate', async function (request: ChatRequest, response) {
    let failureCode: string | undefined;
    try {
        if (!request.body) return response.status(400).send({ error: true });

        // Pull the trace context out before anything can copy it into the
        // upstream payload, then drop it so it can never be forwarded.
        const wireLog: { traceContext: TraceContext; wireLogSession: Session | null; wireLogRecorder: Recorder | null } = { traceContext: {}, wireLogSession: null, wireLogRecorder: null };
        const trace = request.body._trace;
        if (trace && typeof trace === 'object' && !Array.isArray(trace)) {
            wireLog.traceContext = trace as TraceContext;
        }
        if (Object.prototype.hasOwnProperty.call(request.body, '_trace')) {
            delete request.body._trace;
        }

        if (Array.isArray(request.body.messages)) {
            request.body.messages = postProcessPrompt(request.body.messages, getPromptNames(request));
        }

        if (request.body.json_schema?.value) {
            request.body.json_schema.value = flattenSchema(request.body.json_schema.value, request.body.chat_completion_source);
        }

        let apiUrl;
        let apiKey;
        let headers;
        let bodyParams: Record<string, unknown>;

        if (request.body.chat_completion_source === CHAT_COMPLETION_SOURCES.OPENAI) {
            apiUrl = request.body.custom_url || API_OPENAI;
            apiKey = readSecret(request.user.directories, SECRET_KEYS.OPENAI, request.body.secret_id);
            headers = {};
            bodyParams = {};

            if (getConfigValue('openai.randomizeUserId', false, 'boolean')) {
                bodyParams['user'] = uuidv4();
            }

            // The JS helper's inferred default options are literal true, but it accepts booleans.
            (embedOpenRouterMedia as (messages: unknown, options: { audio: boolean; video: boolean }) => void)(request.body.messages, { audio: true, video: false });
            if (request.body.custom_url && request.body.json_schema) {
                bodyParams['response_format'] = {
                    type: 'json_schema',
                    json_schema: {
                        name: request.body.json_schema.name,
                        strict: request.body.json_schema.strict ?? true,
                        schema: request.body.json_schema.value,
                    },
                };
            }
        } else {
            console.warn('This chat completion source is not supported yet.');
            return response.status(400).send({ error: true });
        }

        // A few of OpenAIs reasoning models support reasoning effort
        if (request.body.reasoning_effort && request.body.chat_completion_source === CHAT_COMPLETION_SOURCES.OPENAI) {
            if (OPENAI_REASONING_EFFORT_MODELS.includes(request.body.model)) {
                bodyParams['reasoning_effort'] = (OPENAI_FIXED_REASONING_EFFORT as Record<string, string>)[request.body.model] ?? (OPENAI_REASONING_EFFORT_MAP as Record<string, string>)[request.body.reasoning_effort] ?? request.body.reasoning_effort;
            }
            if (/^koboldcpp\/(.+)$/.test(request.body.model)) {
                bodyParams['reasoning_effort'] = request.body.reasoning_effort;
            }
        }

        if (request.body.verbosity && request.body.chat_completion_source === CHAT_COMPLETION_SOURCES.OPENAI) {
            if (OPENAI_VERBOSITY_MODELS.test(request.body.model)) {
                bodyParams['verbosity'] = request.body.verbosity;
            }
        }

        if (!apiKey && !request.body.custom_url) {
            console.warn('OpenAI API key is missing.');
            return response.status(400).send({ error: true });
        }

        // Add custom stop sequences
        if (Array.isArray(request.body.stop) && request.body.stop.length > 0) {
            bodyParams['stop'] = request.body.stop;
        }

        const endpointUrl = `${apiUrl}/chat/completions`;

        const controller = new AbortController();
        const abortRequest = () => {
            controller.abort();
        };
        request.socket.once('close', abortRequest);
        response.once('finish', () => request.socket.removeListener('close', abortRequest));

        if (Array.isArray(request.body.tools) && request.body.tools.length > 0) {
            bodyParams['tools'] = request.body.tools;
            bodyParams['tool_choice'] = request.body.tool_choice;
        }

        if (request.body.json_schema && !bodyParams['response_format']) {
            bodyParams['response_format'] = {
                type: 'json_schema',
                json_schema: {
                    name: request.body.json_schema.name,
                    strict: request.body.json_schema.strict ?? true,
                    schema: request.body.json_schema.value,
                },
            };
        }

        const requestBody = {
            'messages': request.body.messages,
            'model': request.body.model,
            'temperature': request.body.temperature,
            'max_tokens': request.body.max_tokens,
            'max_completion_tokens': request.body.max_completion_tokens,
            'stream': request.body.stream,
            'presence_penalty': request.body.presence_penalty,
            'frequency_penalty': request.body.frequency_penalty,
            'top_p': request.body.top_p,
            'top_k': request.body.top_k,
            'stop': request.body.stop,
            'seed': request.body.seed,
            'n': request.body.n,
            ...bodyParams,
        };

        const config: RequestInit = {
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
                ...headers,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        };


        // Wire log session: `begin` returns null when the switch is off, so
        // every branch below stays a no-op in that case.
        try {
            const { recorder } = await createRequestWireLog(request);
            const context = {
                ...wireLog.traceContext,
                model: request.body.model,
                source: request.body.chat_completion_source,
            };
            wireLog.wireLogSession = recorder.begin({
                url: endpointUrl,
                headers: config.headers as Record<string, string>,
                body: requestBody,
                context,
                // The endpoint owns the fallback when the client sent no
                // `_trace.chatId`; the tap folds it into the record's trace.
                chatId: wireLog.traceContext.chatId,
            });
            wireLog.wireLogRecorder = wireLog.wireLogSession ? recorder : null;
            if (wireLog.wireLogRecorder) {
                // The out-of-scope catch block below still needs the session to
                // record a transport failure, so pin it on the request.
                request.wireLogSession = wireLog.wireLogSession;
                request.wireLogRecorder = wireLog.wireLogRecorder;
            }
        } catch (error) {
            console.warn('[wire-log] session setup failed', error instanceof Error ? error.message : error);
        }

        const fetchResponse = await fetch(endpointUrl, config);
        const status = fetchResponse.status;
        const statusText = STATUS_CODES[status] ?? '';
        if (!fetchResponse.ok) logUpstreamError(status, 'UPSTREAM_HTTP_ERROR');

        if (request.body.stream) {
            console.info('Streaming request in progress');
            const pipeOptions: PipeOptions = {};
            if (wireLog.wireLogSession) {
                const session = wireLog.wireLogSession;
                const tap = session.stream({
                    status,
                    statusText,
                    headers: fetchResponse.headers.raw(),
                });
                pipeOptions.onChunk = tap.onChunk;
                pipeOptions.onComplete = () => session.completeStream();
            }
            pipeOptions.onError = error => {
                const code = transportErrorCode(error);
                logUpstreamError(status, code);
                wireLog.wireLogSession?.fail({ message: 'Upstream stream interrupted', code });
            };
            if (!fetchResponse.ok) {
                // Keep forwarding the provider's error body to the caller, not to the terminal.
                // As in forwardFetchResponse, a 401 must not reset the caller's Basic auth.
                response.statusCode = status === 401 ? 400 : status;
                if (statusText) response.statusMessage = statusText;
                let text: string;
                try {
                    text = await fetchResponse.text();
                } catch (error) {
                    try { pipeOptions.onError(error); } catch { /* Diagnostics must not affect transport. */ }
                    return response.end();
                }
                try { pipeOptions.onChunk?.(text); } catch { /* Diagnostics must not affect transport. */ }
                try { pipeOptions.onComplete?.(); } catch { /* Diagnostics must not affect transport. */ }
                return response.end(text, 'utf-8');
            }
            return await forwardFetchResponse(fetchResponse, response, pipeOptions);
        }

        if (fetchResponse.ok) {
            // Read the text once: a Response body can only be consumed a single
            // time, and both the client response and the wire log need it.
            const responseText = await fetchResponse.text();
            let json;
            try {
                json = JSON.parse(responseText);
            } catch (error) {
                // Preserve the original JSON-only generation contract.
                failureCode = 'INVALID_UPSTREAM_JSON';
                wireLog.wireLogSession?.fail({ message: 'Invalid upstream JSON', code: failureCode }, {
                    status,
                    statusText,
                    headers: fetchResponse.headers.raw(),
                    body: responseText,
                });
                throw error;
            }
            if (wireLog.wireLogSession) {
                try {
                    wireLog.wireLogSession.complete({
                        status,
                        statusText,
                        headers: fetchResponse.headers.raw(),
                        body: json,
                    });
                } catch (error) {
                    console.warn('[wire-log] completion failed', error instanceof Error ? error.message : error);
                }
            }
            return response.send(json);
        } else {
            const responseText = await fetchResponse.text();
            const errorData = tryParse(responseText);

            const message = statusText || 'Unknown error occurred';
            const quota_error = status === 429 && errorData?.error?.type === 'insufficient_quota';
            if (wireLog.wireLogSession) {
                try {
                    wireLog.wireLogSession.complete({
                        status,
                        statusText,
                        headers: fetchResponse.headers.raw(),
                        body: errorData ?? responseText,
                    });
                } catch (error) {
                    console.warn('[wire-log] completion failed', error instanceof Error ? error.message : error);
                }
            }

            if (!response.headersSent) {
                response.send({ error: { message }, quota_error: quota_error });
            } else if (!response.writableEnded) {
                response.write(responseText);
            } else {
                response.end();
            }
        }
    } catch (error) {
        const code = failureCode ?? transportErrorCode(error);
        const message = code === 'ECONNREFUSED' ? 'Connection refused' : 'Upstream generation failed';
        logUpstreamError(502, code);
        try {
            // Recording schedules its own write; never wait for diagnostic I/O
            // before returning a generation failure to the client.
            request.wireLogSession?.fail({ message, code });
        } catch {
            // Logging must never mask the generation failure.
        }
        if (!response.headersSent) {
            response.status(502).send({ error: { message, code } });
        } else {
            response.end();
        }
    }
});

const multimodalModels = express.Router();
router.use('/multimodal-models', multimodalModels);
