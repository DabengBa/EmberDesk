/**
 * Wire log shapes as they cross the `/api/wire-logs` boundary.
 *
 * The list route returns a metadata projection only (`toListItem` in
 * `src/wire-log-store.js`); bodies and headers are available exclusively from
 * `GET /api/wire-logs/:id`. Declaring them as separate types keeps the viewer
 * from widening a list entry into a record.
 */

export type WireLogStatus = 'pending' | 'completed' | 'error';

export interface WireLogContext {
    type?: string;
    model?: string;
    source?: string;
    chatId?: string;
    charName?: string;
    pipelineRun?: string;
    pipelineStep?: string;
    regenerate?: boolean;
}

/** Streamed reply rebuilt by `wire-log-tap.js`. */
export interface WireLogAssembledStream {
    content: string;
    reasoning: string;
    finishReason: string | null;
    /** Provider token accounting, when the stream carried a usage event. */
    usage?: WireLogUsage | null;
    toolCalls?: unknown[];
    parseErrors?: string[];
}

/**
 * Token accounting copied from the provider's `usage` block.
 *
 * Recorded verbatim (`extractUsage` in `wire-log-recorder.js` only checks that
 * it is an object), because providers disagree on the field set. `null` means
 * the provider reported nothing — never "zero tokens".
 */
export interface WireLogUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    [key: string]: unknown;
}

/** Response body of a streamed record: raw SSE plus its assembled reading. */
export interface WireLogSseBody {
    kind: 'sse';
    raw: string;
    rawTruncated?: boolean;
    assembled: WireLogAssembledStream;
}

export interface WireLogListEntry {
    id: string;
    ts: number;
    status: WireLogStatus;
    error: string | null;
    context: WireLogContext;
    request: {
        url: string;
        bytes: number;
        truncated: boolean;
        toolCount: number;
        messageCount: number;
    };
    response: {
        status: number | null;
        streamed: boolean;
        bytes: number;
        durationMs: number | null;
        ttftMs: number | null;
        chunks: number | null;
        usage: WireLogUsage | null;
    } | null;
}

export interface WireLogRecord {
    id: string;
    ts: number;
    status: WireLogStatus;
    context: WireLogContext;
    error: { message: string; code: string | null } | null;
    request: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body: unknown;
        bytes: number;
        truncated: boolean;
    };
    response: {
        status: number | null;
        statusText?: string;
        headers: Record<string, string>;
        streamed: boolean;
        body: unknown;
        bytes: number;
        truncated?: boolean;
        durationMs: number | null;
        ttftMs: number | null;
        chunks: number | null;
        usage?: WireLogUsage | null;
    } | null;
}

export interface WireLogChatMessage {
    role?: string;
    content?: unknown;
    name?: string;
    tool_calls?: unknown;
    tool_call_id?: string;
    reasoning?: unknown;
}

/** `GET`/`POST /api/wire-logs/config` response (`normalizeWireLogOptions`). */
export interface WireLogConfig {
    enabled: boolean;
    captureBody: boolean;
    maxFileBytes: number;
    retentionDays: number;
    redact: string[];
    /** GET only: false when the canonical settings fragment is unreadable. */
    persisted?: boolean;
    /** GET only: why the fragment is unreadable. */
    reason?: string;
}
