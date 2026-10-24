/**
 * Wire log runtime.
 *
 * Wraps one upstream generation in a record session. Every entry point is
 * failure-tolerant by construction: a logging problem must degrade to "no
 * log" and never reach the caller's control flow.
 *
 * The recorder never inspects or rewrites the request; it only observes what
 * the chat-completions endpoint already computed.
 */

import { createWireRecord, purgeExpired, purgeExpiredRecords, truncateBody, writeRecord } from './wire-log-store.js';
import { createRecordTrace, createSseAssembler, sanitizeUsage } from './wire-log-tap.js';

/**
 * Reads the provider's token accounting out of a response body. Only an
 * object survives: a missing or malformed `usage` means "unknown", which is
 * recorded as null rather than guessed, because a fabricated count would be
 * worse evidence than no count.
 * @param {unknown} body Parsed response body
 * @returns {object|null} Usage block, or null when the provider sent none
 */
export function extractUsage(body) {
    const usage = body && typeof body === 'object' && !Array.isArray(body) ? body.usage : null;
    return sanitizeUsage(usage);
}

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
// The default retention is an exact 48-hour record window plus day partitions.
const DEFAULT_RETENTION_DAYS = 2;
const DEFAULT_REDACT = ['authorization', 'x-api-key', 'cookie', 'set-cookie', 'proxy-authorization'];

/**
 * Normalizes user-facing wire log settings into a usable option object.
 * Unknown keys are dropped; invalid numbers fall back to defaults.
 *
 * Logging is opt-out: only an explicit `enabled: false` turns it off, so an
 * absent/unset flag means "on". Both the viewer API and the generation path
 * read this one function, so they can never disagree about the default.
 * @param {unknown} raw Stored settings fragment
 * @returns {{enabled: boolean, captureBody: boolean, maxFileBytes: number, retentionDays: number, redact: string[]}}
 */
export function normalizeWireLogOptions(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const extraRedactions = Array.isArray(source.redact)
        ? source.redact.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim().toLowerCase())
        : [];
    const maxFileBytes = Number(source.maxFileBytes);
    const retentionDays = Number(source.retentionDays);

    return {
        enabled: source.enabled !== false,
        captureBody: source.captureBody !== false,
        maxFileBytes: Number.isFinite(maxFileBytes) && maxFileBytes > 0
            ? Math.ceil(maxFileBytes)
            : DEFAULT_MAX_FILE_BYTES,
        retentionDays: Number.isFinite(retentionDays) && retentionDays > 0
            ? Math.ceil(retentionDays)
            : DEFAULT_RETENTION_DAYS,
        redact: [...new Set([...DEFAULT_REDACT, ...extraRedactions])],
    };
}

/**
 * Creates a recorder bound to one user's wire log root.
 * @param {object} args
 * @param {string} args.storeRoot Directory records are written under
 * @param {boolean} [args.enabled] Master switch
 * @param {boolean} [args.captureBody] Whether request/response bodies are stored
 * @param {number} [args.maxFileBytes] Per-body size limit
 * @param {number} [args.retentionDays] Partitions older than this are purged once per session
 * @param {string[]} [args.redact] Additional header names to mask
 * @param {(message: string, error: unknown) => void} [args.onError] Diagnostic sink
 * @returns {{enabled: boolean, options: object, begin: Function, flush: Function}}
 */
export function createWireLogRecorder({
    storeRoot,
    enabled = true,
    captureBody = true,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    retentionDays = DEFAULT_RETENTION_DAYS,
    redact = [],
    onError = defaultOnError,
} = {}) {
    const options = normalizeWireLogOptions({ enabled, captureBody, maxFileBytes, retentionDays, redact });
    /** @type {Promise<void>[]} */
    const pending = [];
    /** Retention is swept once per recorder, not per entry. */
    let purgeScheduled = false;

    if (!options.enabled) {
        return {
            enabled: false,
            options,
            begin: () => null,
            flush: async () => {},
        };
    }

    /**
     * Schedules a write and swallows any failure so logging can never break a
     * generation. Failures are reported once per record via `onError`.
     * @param {object} record Record to persist
     */
    function scheduleWrite(record) {
        const task = writeRecord(storeRoot, record).then(
            () => {},
            error => { onError(`wire log write failed for ${record.id}`, error); },
        );
        pending.push(task);
        // Do not let the pending list grow without bound in a long session.
        if (pending.length > 64) {
            pending.splice(0, pending.length - 64);
        }
    }

    /**
     * Starts a record for one generation.
     * @param {object} args
     * @param {string} args.url Upstream URL
     * @param {Record<string, unknown>} args.headers Request headers
     * @param {unknown} args.body Request body
     * @param {object} [args.context] Generation context
     * @param {string} [args.chatId] Active chat id, when the endpoint knows it
     * @returns {{record: object, stream: Function, complete: Function, completeStream: Function, fail: Function}|null}
     */
    function begin({ url, headers, body, context = {}, chatId }) {
        let record;
        try {
            record = createWireRecord({
                url,
                headers,
                body: options.captureBody ? body : null,
                context: createRecordTrace({ context, chatId }).context,
                redact: options.redact,
                maxFileBytes: options.maxFileBytes,
            });
            if (!options.captureBody) {
                // Keep the size evidence even when the body itself is withheld.
                record.request.bytes = truncateBody(body, Number.POSITIVE_INFINITY).bytes;
                record.request.messageCount = Array.isArray(body?.messages) ? body.messages.length : 0;
                record.request.toolCount = Array.isArray(body?.tools) ? body.tools.length : 0;
            }
        } catch (error) {
            onError('wire log record creation failed', error);
            return null;
        }

        schedulePurge();

        const startedAt = performance.now();
        let settled = false;
        /** @type {null | (() => object)} Set once streaming starts, so a
         * failure can still preserve everything captured before the abort. */
        let snapshotPartial = null;
        /** @type {null | (() => void)} Set once streaming starts. */
        let streamFinisher = null;

        /**
         * @param {string} status Terminal status
         * @param {object} response Response projection
         */
        function settle(status, response) {
            if (settled) {
                return;
            }
            settled = true;
            record.status = status;
            record.response = response;
            scheduleWrite(record);
        }

        /**
         * Builds the common non-stream response projection.
         * @param {object} details Response details
         * @param {number} [details.status] HTTP status
         * @param {string} [details.statusText] HTTP status text
         * @param {Record<string, unknown>} [details.headers] Response headers
         * @param {unknown} [details.body] Response body
         * @param {number} [details.durationMs] Observed duration
         * @returns {object} Non-stream response projection
         */
        function buildNonStreamResponse(details = {}) {
            const { status, statusText = '', headers = {}, durationMs } = details;
            const hasBody = Object.hasOwn(details, 'body');
            const responseBody = hasBody ? details.body : null;
            const serializedBytes = hasBody ? truncateBody(responseBody, Number.POSITIVE_INFINITY).bytes : 0;
            const truncated = truncateBody(options.captureBody ? responseBody : null, options.maxFileBytes);
            return {
                status: Number.isFinite(status) ? status : null,
                statusText: String(statusText ?? ''),
                headers: redactResponseHeaders(headers, options.redact),
                streamed: false,
                body: truncated.value,
                usage: extractUsage(responseBody),
                bytes: serializedBytes,
                truncated: truncated.truncated,
                durationMs: Number.isFinite(durationMs) ? durationMs : Math.round(performance.now() - startedAt),
                ttftMs: null,
                chunks: null,
            };
        }

        /**
         * Records a non-streaming response.
         * @param {object} args
         * @param {number} args.status HTTP status
         * @param {string} [args.statusText] HTTP status text
         * @param {Record<string, unknown>} [args.headers] Response headers
         * @param {unknown} [args.body] Parsed response body
         * @param {number} [args.durationMs] Observed duration
         */
        function complete({ status, statusText = '', headers = {}, body: responseBody = null, durationMs }) {
            try {
                settle('completed', buildNonStreamResponse({ status, statusText, headers, body: responseBody, durationMs }));
            } catch (error) {
                onError('wire log completion failed', error);
            }
        }

        /**
         * Starts observing a streaming response. The returned `onChunk` is
         * called by the forwarding layer for every byte batch; it must stay
         * cheap and non-throwing.
         * @param {object} args
         * @param {number} args.status HTTP status
         * @param {string} [args.statusText] HTTP status text
         * @param {Record<string, unknown>} [args.headers] Response headers
         * @returns {{onChunk: (chunk: Buffer|string) => void}}
         */
        function stream({ status, statusText = '', headers = {} }) {
            const assembler = options.captureBody ? createSseAssembler() : null;
            const chunks = [];
            let capturedBytes = 0;
            let bytes = 0;
            let count = 0;
            let ttftMs = null;
            const responseMeta = {
                status: Number.isFinite(status) ? status : null,
                statusText: String(statusText ?? ''),
                headers: redactResponseHeaders(headers, options.redact),
            };

            /**
             * @param {Buffer|string} chunk Raw response bytes
             */
            function onChunk(chunk) {
                try {
                    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), 'utf8');
                    bytes += buffer.byteLength;
                    count += 1;
                    if (ttftMs === null) {
                        ttftMs = Math.round(performance.now() - startedAt);
                    }
                    if (!assembler) {
                        return;
                    }
                    const remaining = Math.max(0, options.maxFileBytes - capturedBytes);
                    if (remaining > 0) {
                        const captured = buffer.subarray(0, remaining);
                        chunks.push(Buffer.from(captured));
                        assembler.push(captured);
                        capturedBytes += captured.byteLength;
                    }
                } catch (error) {
                    onError('wire log chunk capture failed', error);
                }
            }

            /**
             * Builds the response projection from whatever has arrived so far.
             * Used both for normal completion and for aborted streams, so an
             * interrupted generation still records its partial evidence.
             * @returns {object} Response projection
             */
            function buildResponse() {
                const assembled = assembler ? assembler.finish() : null;
                const raw = assembler ? Buffer.concat(chunks).toString('utf8') : '';
                const rawTruncated = bytes > options.maxFileBytes
                    ? { value: { __truncated: true, bytes, limit: options.maxFileBytes }, truncated: true }
                    : { value: raw, truncated: false };
                return {
                    ...responseMeta,
                    streamed: true,
                    body: assembler
                        ? { kind: 'sse', raw: rawTruncated.value, rawTruncated: rawTruncated.truncated, assembled }
                        : null,
                    // A provider that never sends a usage event leaves this null.
                    usage: assembled?.usage ?? null,
                    bytes,
                    durationMs: Math.round(performance.now() - startedAt),
                    ttftMs,
                    chunks: count,
                    truncated: bytes > options.maxFileBytes,
                };
            }

            snapshotPartial = buildResponse;
            streamFinisher = finishStream;

            /**
             * Finalizes the streaming record. Safe to call once; later calls
             * are ignored through `settle`.
             */
            function finishStream() {
                try {
                    settle('completed', buildResponse());
                } catch (error) {
                    onError('wire log stream finalize failed', error);
                }
            }

            return { onChunk, finishStream };
        }

        /**
         * Records a transport or generation failure. A partially captured
         * stream is preserved as evidence.
         * @param {Error|unknown} error Failure cause
         */
        function fail(error, responseDetails = null) {
            try {
                if (settled) {
                    return;
                }
                const response = snapshotPartial
                    ? snapshotPartial()
                    : responseDetails
                        ? buildNonStreamResponse(responseDetails)
                        : buildNonStreamResponse();
                settle('error', response);
                record.error = {
                    message: String(error?.message ?? error ?? 'unknown error').slice(0, 2000),
                    code: typeof error?.code === 'string' ? error.code : null,
                };
            } catch (innerError) {
                onError('wire log failure recording failed', innerError);
            }
        }

        return {
            /** @type {object} The mutable record, exposed for testing and stream finalization */
            record,
            stream,
            complete,
            fail,
            /** Finalizes a streaming record; alias so callers do not have to
             * reach through the tap object. */
            completeStream: () => {
                streamFinisher?.();
            },
        };
    }

    /**
     * Sweeps expired partitions at most once per recorder and swallows every
     * failure: retention must never influence a generation. Scheduled next to
     * the first write rather than awaited, so the request path stays untouched.
     *
     * Two passes, because they answer different questions: record-level removal
     * is what "auto-clear after 48h" actually promises (a day partition can
     * still hold records older than the window), and the partition pass then
     * drops directories that are empty or wholly expired.
     */
    function schedulePurge() {
        if (purgeScheduled) {
            return;
        }
        purgeScheduled = true;
        const retentionDays = options.retentionDays;
        const task = (async () => {
            const now = new Date();
            try {
                await purgeExpiredRecords(storeRoot, { retentionDays, now });
            } catch (error) {
                onError('wire log record purge failed', error);
            }
            try {
                await purgeExpired(storeRoot, { retentionDays, now });
            } catch (error) {
                onError('wire log partition purge failed', error);
            }
        })();
        pending.push(task);
    }

    return {
        enabled: true,
        options,
        begin,
        /** Waits for all scheduled writes to settle. */
        flush: async () => {
            await Promise.allSettled(pending.slice());
        },
    };
}

/**
 * Response headers carry no credentials, but a proxy can echo request
 * headers, so the same mask list applies.
 * @param {unknown} headers Response headers
 * @param {string[]} redact Lowercase names to mask
 * @returns {Record<string, string>} Header map
 */
function redactResponseHeaders(headers, redact) {
    if (!headers || typeof headers !== 'object') {
        return {};
    }
    /** @type {Record<string, string>} */
    const result = {};
    const masked = new Set(redact);
    for (const [key, value] of Object.entries(headers)) {
        result[key] = masked.has(key.toLowerCase()) ? '***redacted***' : String(value);
    }
    return result;
}

function defaultOnError(message, error) {
    console.warn(`[wire-log] ${message}`, error instanceof Error ? error.message : error);
}
