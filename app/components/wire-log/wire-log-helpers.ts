/**
 * Wire log view-model helpers.
 *
 * Reads record shapes documented in `./types.ts`. The only runtime import is the
 * i18n bridge, so the module stays loadable as plain ESM by the unit suite.
 */

import { translate } from '../../compat/i18n.js';

/** Message previews are capped so one huge turn cannot dominate the list. */
const PREVIEW_LIMIT = 140;

/**
 * Structural stand-ins for the shared types. Declaring them locally keeps the
 * module import-free while still typechecking against the real shapes below.
 */
type WireLogContextFields = {
    type?: string;
    model?: string;
    source?: string;
    chatId?: string;
    charName?: string;
    pipelineRun?: string;
    pipelineStep?: string;
};

type WireLogListEntry = {
    id: string;
    ts: number;
    context: WireLogContextFields;
};

type WireLogRecord = {
    context: WireLogContextFields;
    request?: { body?: unknown } | null;
    response?: { body?: unknown } | null;
};

type WireLogChatMessage = {
    role?: string;
    content?: unknown;
    name?: string;
    tool_calls?: unknown;
    tool_call_id?: string;
};

type WireLogSseBody = {
    kind: 'sse';
    raw?: unknown;
    rawTruncated?: boolean;
    assembled?: { content?: unknown; reasoning?: unknown };
};

/** Provider token accounting, as it arrives in `response.usage`. */
type WireLogUsage = {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
};

/**
 * Local-time label for a record timestamp, matching the rest of the settings
 * surface (the server stores UTC milliseconds; the viewer never reinterprets).
 * @param ts Epoch milliseconds
 * @returns Displayable timestamp
 */
export function formatTimestamp(ts: number): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) {
        return String(ts);
    }
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

/**
 * The day partition a record belongs to. Records carry no date field, so the
 * viewer derives the same `YYYY-MM-DD` bucket the store used for the file.
 * @param ts Epoch milliseconds
 * @returns `YYYY-MM-DD`
 */
export function dayPartition(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Groups list entries into day buckets, newest day first, preserving the
 * server's newest-first order inside each bucket.
 * @param entries List entries
 * @returns Day buckets in display order
 */
export function groupByDay(entries: WireLogListEntry[]): { date: string; entries: WireLogListEntry[] }[] {
    const buckets = new Map<string, WireLogListEntry[]>();
    for (const entry of entries) {
        const date = dayPartition(entry.ts);
        const bucket = buckets.get(date);
        if (bucket) {
            bucket.push(entry);
        } else {
            buckets.set(date, [entry]);
        }
    }
    return [...buckets.entries()]
        .sort((left, right) => right[0].localeCompare(left[0]))
        .map(([date, bucketEntries]) => ({ date, entries: bucketEntries }));
}

/**
 * Flattens a message's `content` into preview text. Providers send either a
 * string or an array of parts with `text` fields; anything else is left to
 * the JSON renderer.
 * @param content Message content
 * @returns Single-line preview
 */
export function messagePreview(content: unknown): string {
    let text = '';
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        text = content
            .map(part => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
                ? (part as { text: string }).text
                : `[${String((part as { type?: unknown })?.type ?? 'part')}]`))
            .join(' ');
    } else if (content == null) {
        text = '';
    } else {
        text = JSON.stringify(content) ?? '';
    }
    const collapsed = text.replace(/\s+/g, ' ').trim();
    return collapsed.length > PREVIEW_LIMIT
        ? `${collapsed.slice(0, PREVIEW_LIMIT)}…`
        : collapsed;
}

/**
 * Reads the message array out of a request body without assuming the body is
 * a well-formed chat completion.
 * @param record Full record
 * @returns Messages, or an empty array
 */
export function requestMessages(record: WireLogRecord | null): WireLogChatMessage[] {
    const body = record?.request?.body as { messages?: unknown } | null | undefined;
    return Array.isArray(body?.messages) ? (body.messages as WireLogChatMessage[]) : [];
}

/**
 * Narrows a streamed response body. The recorder writes `{ kind: 'sse', ... }`
 * (`buildResponse` in `wire-log-recorder.js`); anything else is treated as a
 * plain JSON body.
 * @param body Response body
 * @returns The SSE wrapper when present
 */
export function sseBody(body: unknown): WireLogSseBody | null {
    if (body && typeof body === 'object' && (body as { kind?: unknown }).kind === 'sse') {
        return body as WireLogSseBody;
    }
    return null;
}

/**
 * Extracts the assistant text the provider actually returned: `choices[0]`
 * for a non-streaming body, the assembled stream for a streamed one.
 * @param record Full record
 * @returns Best-effort reply text, or null when unavailable
 */
export function responseText(record: WireLogRecord | null): string | null {
    const streamed = sseBody(record?.response?.body);
    if (streamed) {
        const content = streamed.assembled?.content;
        return typeof content === 'string' ? content : null;
    }
    const choices = (record?.response?.body as { choices?: { message?: { content?: unknown } }[] } | null | undefined)
        ?.choices;
    const content = choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
}

/**
 * Reasoning text for a streamed reply, kept separate from the answer so the
 * detail view can show both.
 * @param record Full record
 * @returns Reasoning text, or null when the provider sent none
 */
export function responseReasoning(record: WireLogRecord | null): string | null {
    const reasoning = sseBody(record?.response?.body)?.assembled?.reasoning;
    return typeof reasoning === 'string' && reasoning.length > 0 ? reasoning : null;
}

/**
 * Serializes a value for the clipboard. Strings are copied verbatim (a reply
 * is text, not JSON) and everything else is pretty-printed.
 * @param value Value to serialize
 * @returns Clipboard text
 */
export function serializeForClipboard(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2) ?? '';
    } catch {
        return String(value);
    }
}

/**
 * Saves a value to disk as pretty-printed JSON. The clipboard is unavailable
 * for a full request/response record (SSE bodies run to hundreds of KiB), so
 * the record can be pulled out as a file instead.
 * @param value Value to serialize
 * @param filename Suggested file name; a `.json` suffix is appended when absent
 */
export function downloadJson(value: unknown, filename: string): void {
    const blob = new Blob([`${serializeForClipboard(value)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.endsWith('.json') ? filename : `${filename}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/**
 * Human-readable byte size for the metadata grid.
 * @param value Byte count
 * @returns Displayable size
 */
export function formatBytes(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }
    if (value < 1024) {
        return `${value} B`;
    }
    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KiB`;
    }
    return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

/**
 * Renders a provider `usage` block as one compact line.
 *
 * Providers disagree on field names (OpenAI `prompt_tokens`/`completion_tokens`,
 * Anthropic-shaped `input_tokens`/`output_tokens`) and most send only some of
 * them, so every field is optional and a missing count is simply omitted. An
 * absent or unusable block renders as `—` rather than a zero, because a zero
 * count would read as real evidence.
 * @param usage Usage block from the record
 * @returns Displayable summary
 */
export function formatUsage(usage: unknown): string {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
        return '—';
    }
    const source = usage as WireLogUsage;
    const count = (value: unknown): number | null => (
        typeof value === 'number' && Number.isFinite(value) ? value : null
    );
    const prompt = count(source.prompt_tokens) ?? count(source.input_tokens);
    const completion = count(source.completion_tokens) ?? count(source.output_tokens);
    const total = count(source.total_tokens);
    const breakdown = [
        prompt !== null ? `${translate('prompt')} ${prompt}` : '',
        completion !== null ? `${translate('completion')} ${completion}` : '',
    ].filter(Boolean).join(' / ');

    if (total !== null) {
        return breakdown ? `${total} (${breakdown})` : `${translate('total')} ${total}`;
    }
    return breakdown || '—';
}

/**
 * Filters list entries by a free-text query over the identity-bearing fields.
 * @param entries List entries
 * @param query Lowercase-free raw query
 * @returns Matching entries
 */
export function filterEntries(entries: WireLogListEntry[], query: string): WireLogListEntry[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return entries;
    }
    return entries.filter(entry => [
        entry.id,
        entry.context.model,
        entry.context.type,
        entry.context.source,
        entry.context.charName,
        entry.context.chatId,
        entry.context.pipelineStep,
    ].some(field => typeof field === 'string' && field.toLowerCase().includes(needle)));
}
