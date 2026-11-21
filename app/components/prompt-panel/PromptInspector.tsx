import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translate, useTranslated } from '@/compat/i18n.js';

/**
 * Prompt Inspector — request-level preview of the body EmberDesk is about to
 * POST to /api/backends/chat-completions/generate. The overlay is rendered by
 * mountPromptInspector into a host div appended to <body>; all data comes from
 * the legacy preview bridge (__emberDeskPromptInspectorBridge), which runs the
 * same assembly path as a real send and stops before fetch. Nothing here
 * persists or sends anything.
 */

export interface PromptInspectorEntry {
    index: number;
    collection: string | null;
    identifier: string | null;
    role: string;
    content: unknown;
    name: string | null;
    tokens: number | null;
    tool_calls?: unknown;
    tool_call_id?: string;
    reasoning?: unknown;
}

export interface PromptInspectorDroppedEntry {
    identifier: string;
    role: string | null;
    name: string | null;
    content: string;
    hasMedia: boolean;
}

export interface PromptInspectorSummarizedEntry {
    identifier: string;
    role: string;
    turnIndex: number;
    turnKey: string | null;
    summaryId: string;
    text: string;
    coveredCount: number;
    stale: boolean;
    manual: boolean;
}

export interface PromptInspectorPipelineRound {
    index: number;
    id: string;
    tool: string;
    display: string;
}

export interface PromptInspectorPipeline {
    round: number;
    total: number;
    fallback: boolean;
    step: { id: string; tool: string; display: string } | null;
    rounds: PromptInspectorPipelineRound[];
}

export interface PromptInspectorBudget {
    context: number;
    response: number;
    remaining: number;
    used: number;
    totalTokens: number;
}

export interface PromptInspectorResult {
    kind: 'prompt-preview';
    type: string;
    model: string | null;
    stream: boolean;
    request: Record<string, unknown>;
    entries: PromptInspectorEntry[];
    dropped: PromptInspectorDroppedEntry[];
    summarized: PromptInspectorSummarizedEntry[];
    budget: PromptInspectorBudget | null;
    pipeline: PromptInspectorPipeline | null;
    warnings: string[];
    pendingMessage: { name: string | null; mes: string } | null;
    pendingEntryIdentifier: string | null;
    messagesInContext: number;
}

export interface PromptInspectorEmpty {
    kind: 'prompt-preview-empty';
    reason: string;
    warnings: string[];
}

export type PromptInspectorSnapshot = PromptInspectorResult | PromptInspectorEmpty;

export interface PromptInspectorBridge {
    preview(round?: number): Promise<PromptInspectorSnapshot>;
    close(): void;
}

const ROLE_BADGE_LABELS: Record<string, string> = {
    system: translate('System'),
    user: translate('User'),
    assistant: translate('Assistant'),
    tool: translate('Tool'),
};

const WARNING_LABELS: Record<string, string> = {
    'pending-attachment': translate('A file attachment is pending: its contents are not part of this preview.'),
    'bias-only-system': translate('Input contains only bias: it is sent as a system message and is not part of the prompt.'),
    'budget-exceeded': translate('Forced prompts exceed the context budget; the message list may be incomplete.'),
    'assembly-error': translate('An error occurred while assembling; this preview may be incomplete.'),
};

const EMPTY_REASON_LABELS: Record<string, string> = {
    'no-active-character': translate('No character selected, so the prompt cannot be assembled.'),
    'unsupported-api': translate('The current API is not Chat Completion, so preview is unavailable.'),
};

/** Request body keys rendered in the params grid; messages render in the list. */
const PARAM_KEYS: Array<{ key: string; label: string }> = [
    { key: 'model', label: 'model' },
    { key: 'temperature', label: 'temperature' },
    { key: 'top_p', label: 'top_p' },
    { key: 'max_tokens', label: 'max_tokens' },
    { key: 'max_completion_tokens', label: 'max_completion_tokens' },
    { key: 'frequency_penalty', label: 'frequency_penalty' },
    { key: 'presence_penalty', label: 'presence_penalty' },
    { key: 'stop', label: 'stop' },
    { key: 'stream', label: 'stream' },
    { key: 'include_reasoning', label: 'include_reasoning' },
    { key: 'reasoning_effort', label: 'reasoning_effort' },
    { key: 'verbosity', label: 'verbosity' },
    { key: 'seed', label: 'seed' },
    { key: 'n', label: 'n' },
    { key: 'tool_choice', label: 'tool_choice' },
    { key: 'json_schema', label: 'json_schema' },
    { key: 'chat_completion_source', label: 'source' },
];

function formatTokens(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${value} tok` : '—';
}

function formatParamValue(value: unknown): string {
    if (value === undefined || value === null) {
        return '—';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
}

/** Message content can be a string or a multimodal parts array. */
function contentToText(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === 'string') {
                    return part;
                }
                if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
                    return String((part as { text?: unknown }).text ?? '');
                }
                const type = (part as { type?: string } | null)?.type ?? 'part';
                return `[${type}]`;
            })
            .join('\n');
    }
    return content == null ? '' : JSON.stringify(content, null, 2);
}

/** One request `tools[]` entry: function name, description, parameters schema. */
function ToolRow({ tool }: { tool: Record<string, unknown> }) {
    useTranslated('');
    const [open, setOpen] = useState(false);
    const fn = (tool.function && typeof tool.function === 'object' ? tool.function : {}) as Record<string, unknown>;
    const name = String(fn.name ?? '?');
    const description = String(fn.description ?? '');
    const parameters = fn.parameters !== undefined ? JSON.stringify(fn.parameters, null, 2) : '';
    return (
        <div className="prompt-inspector-tool">
            <button
                type="button"
                className="prompt-inspector-tool-head"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                title={open ? translate('Collapse definition') : translate('Expand definition')}
            >
                <span className="prompt-inspector-tool-name">{name}</span>
                <span className="prompt-inspector-tool-desc">{description || translate('(no description)')}</span>
            </button>
            {open ? (
                <pre className="prompt-inspector-tool-content">{description}{description && parameters ? '\n\n' : ''}{parameters}</pre>
            ) : null}
        </div>
    );
}

/** Recognize the server's synthetic story_preset projection, not ordinary tool calls. */
function readPresetPair(message: Record<string, unknown>, receipt: Record<string, unknown> | undefined) {
    if (message.role !== 'assistant' || message.content != null || message.reasoning != null
        || !Array.isArray(message.tool_calls) || message.tool_calls.length !== 1
        || receipt?.role !== 'tool' || receipt.content !== 'OK') return null;
    const call = message.tool_calls[0];
    if (call?.type !== 'function' || call.function?.name !== 'story_preset'
        || typeof call.id !== 'string' || !/^story_[\w-]{24}(?:_\d+)?$/.test(call.id)
        || receipt.tool_call_id !== call.id || typeof call.function.arguments !== 'string') return null;
    try {
        const { kind, content, name } = JSON.parse(call.function.arguments);
        if ((kind === 'system' || kind === 'user' || kind === 'assistant') && typeof content === 'string') {
            return { kind, content, name: typeof name === 'string' ? name : null };
        }
    } catch {
        // Keep unrecognized argument shapes as ordinary request messages.
    }
    return null;
}

function messageRows(result: PromptInspectorResult) {
    const messages = (Array.isArray(result.request.messages) ? result.request.messages : []) as Array<Record<string, unknown> | null>;
    const pipeline = result.pipeline;
    const rows = [];
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index] ?? {};
        const entry = result.entries[index] ?? null;
        const role = String(message.role ?? entry?.role ?? '?');
        const preset = pipeline ? readPresetPair(message, messages[index + 1] ?? undefined) : null;
        const text = preset?.content ?? contentToText(message.content ?? entry?.content);
        const toolCalls = message.tool_calls ?? entry?.tool_calls;
        const tools = !preset && Array.isArray(toolCalls) ? JSON.stringify(toolCalls, null, 2) : '';
        const roundInstruction = Boolean(pipeline && index === messages.length - 1 && role === 'system'
            && text.startsWith(pipeline.fallback ? '[Reply pipeline] All pipeline steps are complete.' : `[Reply pipeline ${pipeline.round + 1}/${pipeline.total}] `));
        const badge = preset ? translate('Preset') : ROLE_BADGE_LABELS[role] ?? role;
        const label = preset
            ? preset.name ?? (ROLE_BADGE_LABELS[preset.kind] ?? preset.kind)
            : roundInstruction ? translate('Round instruction') : entry?.identifier ?? entry?.collection ?? '';
        const position = preset ? `#${index}–#${index + 1}` : `#${index}`;
        const pending = entry?.identifier != null && entry.identifier === result.pendingEntryIdentifier;
        rows.push({
            index, end: preset ? index + 1 : index, position, badge, label, text, tools, roundInstruction, pending,
            tokens: entry?.tokens,
            searchable: [role, badge, label, text, tools, preset && 'story_preset'].join('\n').toLowerCase(),
        });
        if (preset) index++;
    }
    return rows;
}

function MessageRow({ row, filtered }: { row: ReturnType<typeof messageRows>[number]; filtered: boolean }) {
    useTranslated('');
    const [expanded, setExpanded] = useState<boolean | null>(null);
    const open = expanded ?? (filtered || row.roundInstruction);
    const preview = row.text || row.tools;
    return (
        <li className={`prompt-inspector-item${row.pending ? ' prompt-inspector-item-pending' : ''}`}>
            <button
                type="button"
                className="prompt-inspector-item-head"
                onClick={() => setExpanded(!open)}
                aria-expanded={open}
                title={open ? translate('Collapse') : translate('Expand content')}
            >
                <span className="prompt-inspector-item-index">{row.position}</span>
                <span className="prompt-inspector-badge">{row.badge}</span>
                <span className="prompt-inspector-item-id">{row.label}</span>
                {row.pending ? <span className="prompt-inspector-badge prompt-inspector-badge-pending">{translate('Preview assembled')}</span> : null}
                {row.tokens != null ? <span className="prompt-inspector-item-tokens">{formatTokens(row.tokens)}</span> : null}
                <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} aria-hidden="true" />
            </button>
            {open
                ? <pre className="prompt-inspector-item-content">{row.text}{row.text && row.tools ? '\n\n' : ''}{row.tools}</pre>
                : <div className="prompt-inspector-item-preview">{preview.length > 160 ? `${preview.slice(0, 160)}…` : preview}</div>}
        </li>
    );
}

/**
 * The inspector body. Fetch happens on mount and on each round change; the
 * component keeps only transient UI state (open rows, copy feedback).
 */
export function PromptInspector({ bridge }: { bridge: PromptInspectorBridge }) {
    useTranslated('');
    const [snapshot, setSnapshot] = useState<PromptInspectorSnapshot | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorText, setErrorText] = useState<string | null>(null);
    const [round, setRound] = useState(0);
    const [query, setQuery] = useState('');
    const [raw, setRaw] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const requestIdRef = useRef(0);
    const copyTimerRef = useRef<number | null>(null);

    const load = useCallback(async (roundIndex: number) => {
        const requestId = ++requestIdRef.current;
        setStatus('loading');
        setErrorText(null);
        setCopied(null);
        try {
            const result = await bridge.preview(roundIndex);
            if (requestId !== requestIdRef.current) {
                return;
            }
            setSnapshot(result);
            setStatus('ready');
        } catch (error) {
            if (requestId !== requestIdRef.current) {
                return;
            }
            setSnapshot(null);
            setErrorText(error instanceof Error ? error.message : String(error));
            setStatus('error');
        }
    }, [bridge]);

    useEffect(() => {
        void load(round);
        return () => { requestIdRef.current++; };
    }, [load, round]);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => {
            dialog?.close();
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    const markCopied = (key: string) => {
        setCopied(key);
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => setCopied(null), 1500);
    };

    const copyText = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            markCopied(key);
        } catch {
            markCopied(`${key}:failed`);
        }
    };

    const previous = snapshot?.kind === 'prompt-preview' ? snapshot : null;
    const result = status === 'ready' ? previous : null;
    const empty = status === 'ready' && snapshot?.kind === 'prompt-preview-empty' ? snapshot : null;
    const pipeline = previous?.pipeline ?? null;
    const rows = useMemo(() => result && !raw ? messageRows(result) : [], [result, raw]);
    const term = query.trim().toLowerCase();
    const indexQuery = /^#?(\d+)$/.exec(term);
    const index = indexQuery ? Number(indexQuery[1]) : -1;
    const onlyIndex = Boolean(indexQuery && term.startsWith('#'));
    const visibleRows = !term ? rows : rows.filter(row => (index >= row.index && index <= row.end)
        || (!onlyIndex && row.searchable.includes(term)));
    const roundOptions = useMemo(() => {
        if (!pipeline) {
            return [];
        }
        const options = pipeline.rounds.map(entry => ({
            value: entry.index,
            label: translate('Round ${0}/${1} · ${2}')
                .replace('${0}', String(entry.index + 1))
                .replace('${1}', String(pipeline.total))
                .replace('${2}', entry.tool),
        }));
        options.push({ value: pipeline.total, label: translate('Fallback (if no usable final reply)') });
        return options;
    }, [pipeline]);

    return (
        <dialog ref={dialogRef} className="prompt-inspector-overlay" aria-label={translate('Prompt preview')}
            onCancel={event => { event.preventDefault(); bridge.close(); }} onClick={event => {
            if (event.target === event.currentTarget) {
                bridge.close();
            }
        }}>
            <div className="prompt-inspector-panel">
                <div className="prompt-inspector-header">
                    <span className="prompt-inspector-badge prompt-inspector-badge-preview">{translate('Preview (not sent)')}</span>
                    {result?.model ? <span className="prompt-inspector-model" title={translate('Target model')}>{result.model}</span> : null}
                    {pipeline && roundOptions.length > 1 ? (
                        <select
                            className="text_pole prompt-inspector-round"
                            value={round}
                            aria-label={translate('Pipeline rounds')}
                            onChange={event => {
                                setStatus('loading');
                                setRound(Number(event.target.value));
                            }}
                        >
                            {roundOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    ) : null}
                    <span className="prompt-inspector-header-spacer" />
                    <button
                        type="button"
                        className="menu_button"
                        title={translate('Reassemble from the current state')}
                        onClick={() => void load(round)}
                    >
                        <i className="fa-solid fa-rotate-right" aria-hidden="true" /> {translate('Refresh')}
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        disabled={!result}
                        title={translate('Copy the full request body JSON')}
                        onClick={() => result && void copyText('json', JSON.stringify(result.request, null, 2))}
                    >
                        <i className="fa-solid fa-copy" aria-hidden="true" /> {copied === 'json' ? translate('Copied') : copied === 'json:failed' ? translate('Copy failed') : translate('Copy JSON')}
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        aria-label={translate('Close')}
                        title={translate('Close')}
                        onClick={() => bridge.close()}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>

                {status === 'loading' ? (
                    <div className="prompt-inspector-status">{translate('Assembling the preview…')}</div>
                ) : null}
                {status === 'error' ? (
                    <div className="prompt-inspector-status prompt-inspector-status-error">
                        {translate('Preview failed:')}{errorText ?? translate('Unknown error')}
                        <button type="button" className="menu_button" onClick={() => void load(round)}>{translate('Retry')}</button>
                    </div>
                ) : null}
                {empty ? (
                    <div className="prompt-inspector-status">{EMPTY_REASON_LABELS[empty.reason] ?? empty.reason}</div>
                ) : null}

                {result ? (
                    <div className="prompt-inspector-body">
                        {(result.warnings ?? []).length > 0 ? (
                            <div className="prompt-inspector-warnings">
                                {result.warnings.map(warning => (
                                    <div key={warning} className="prompt-inspector-warning">
                                        ⚠ {WARNING_LABELS[warning] ?? warning}
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className="prompt-inspector-toolbar">
                            <div className="prompt-inspector-views" role="group" aria-label={translate('Preview view')}>
                                <button type="button" className="menu_button" aria-pressed={!raw} onClick={() => setRaw(false)}>{translate('Messages')}</button>
                                <button type="button" className="menu_button" aria-pressed={raw} onClick={() => setRaw(true)}>{translate('Raw JSON')}</button>
                            </div>
                            {!raw ? (
                                <input className="text_pole prompt-inspector-search" type="search" value={query}
                                    aria-label={translate('Search messages')} placeholder={translate('Search messages')}
                                    onChange={event => setQuery(event.target.value)} />
                            ) : null}
                        </div>

                        {raw
                            ? <pre className="prompt-inspector-raw">{JSON.stringify(result.request, null, 2)}</pre>
                            : <MessageView result={result} rows={visibleRows} filtered={Boolean(term)} />}
                    </div>
                ) : null}
            </div>
        </dialog>
    );
}

function MessageView({ result, rows, filtered }: {
    result: PromptInspectorResult;
    rows: ReturnType<typeof messageRows>;
    filtered: boolean;
}) {
    return <>
        <RequestDetails request={result.request} />

        {result.pipeline?.fallback ? (
            <div className="prompt-inspector-pipeline-note">
                {translate('The fallback request is sent without tools.')}
            </div>
        ) : null}

        {rows.length ? (
            <ul className="prompt-inspector-messages" aria-label={translate('Message list')}>
                {rows.map(row => <MessageRow key={`${row.index}:${filtered}`} row={row} filtered={filtered} />)}
            </ul>
        ) : <div className="prompt-inspector-status">{filtered ? translate('No matching messages.') : translate('No messages in this request.')}</div>}

        {(result.summarized ?? []).length > 0 ? (
            <div className="prompt-inspector-dropped">
                <div className="prompt-inspector-dropped-title">
                    {translate('Summarized turns (${0} turns; original text is not in the prompt)').replace('${0}', String(result.summarized.length))}
                </div>
                {result.summarized.map(entry => (
                    <div key={entry.summaryId} className="prompt-inspector-dropped-item">
                        <span className="prompt-inspector-badge">{translate('Summary')}</span>
                        <span className="prompt-inspector-item-id">{entry.identifier}</span>
                        <span className="prompt-inspector-badge">{translate('Covers ${0} messages').replace('${0}', String(entry.coveredCount))}</span>
                        {entry.manual ? <span className="prompt-inspector-badge">{translate('Handwritten')}</span> : null}
                        {entry.stale ? <span className="prompt-inspector-badge prompt-inspector-badge-pending">{translate('Stale')}</span> : null}
                        <span className="prompt-inspector-dropped-preview">{entry.text.slice(0, 80)}{entry.text.length > 80 ? '…' : ''}</span>
                    </div>
                ))}
            </div>
        ) : null}

        {result.dropped.length > 0 ? (
            <div className="prompt-inspector-dropped">
                <div className="prompt-inspector-dropped-title">
                    {translate('⚠ Messages dropped by the budget (${0} dropped; not in the prompt)').replace('${0}', String(result.dropped.length))}
                </div>
                {result.dropped.map(entry => (
                    <div key={entry.identifier} className="prompt-inspector-dropped-item">
                        <span className="prompt-inspector-badge">{ROLE_BADGE_LABELS[entry.role ?? ''] ?? entry.role ?? '?'}</span>
                        <span className="prompt-inspector-item-id">{entry.identifier}</span>
                        {entry.hasMedia ? <span className="prompt-inspector-badge">{translate('Has attachment')}</span> : null}
                        <span className="prompt-inspector-dropped-preview">{entry.content.slice(0, 80)}{entry.content.length > 80 ? '…' : ''}</span>
                    </div>
                ))}
            </div>
        ) : null}
    </>;
}

function RequestDetails({ request }: { request: PromptInspectorResult['request'] }) {
    const tools = Array.isArray(request.tools) ? request.tools : [];
    return (
        <details className="prompt-inspector-params">
            <summary>{translate('Request details')}</summary>
            <div className="prompt-inspector-params-grid">
                {PARAM_KEYS.filter(({ key }) => request[key] !== undefined).map(({ key, label }) => (
                    <div key={key} className="prompt-inspector-param">
                        <span className="prompt-inspector-param-key">{label}</span>
                        <span className="prompt-inspector-param-value">{formatParamValue(request[key])}</span>
                    </div>
                ))}
            </div>
            {tools.length > 0 ? (
                <div className="prompt-inspector-tools">
                    <div className="prompt-inspector-params-title">{translate('Tool definitions (${0})').replace('${0}', String(tools.length))}</div>
                    {tools.map((tool, index) => <ToolRow key={index} tool={tool ?? {}} />)}
                </div>
            ) : null}
        </details>
    );
}
