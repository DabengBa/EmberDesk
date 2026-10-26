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
    'slash-command': translate('Input starts with /: the slash command runs first on send, and this preview shows its literal text.'),
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

function MessageRow({ index, message, entry, pending, tailLabel }: {
    index: number;
    message: Record<string, unknown>;
    entry: PromptInspectorEntry | null;
    pending: boolean;
    /** Label for request-tail messages appended after assembly (e.g. pipeline step prompts). */
    tailLabel: string;
}) {
    useTranslated('');
    const [open, setOpen] = useState(false);
    const role = String(message.role ?? entry?.role ?? '?');
    const text = useMemo(() => contentToText(message.content ?? entry?.content), [message.content, entry?.content]);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : (Array.isArray(entry?.tool_calls) ? entry?.tool_calls as unknown[] : null);
    const toolCallsText = toolCalls ? JSON.stringify(toolCalls, null, 2) : '';
    const previewText = text.length > 160 ? `${text.slice(0, 160)}…` : (text || (toolCallsText.length > 160 ? `${toolCallsText.slice(0, 160)}…` : toolCallsText));
    return (
        <div className={`prompt-inspector-item${pending ? ' prompt-inspector-item-pending' : ''}`}>
            <button
                type="button"
                className="prompt-inspector-item-head"
                onClick={() => setOpen(value => !value)}
                title={open ? translate('Collapse') : translate('Expand content')}
            >
                <span className="prompt-inspector-item-index">#{index}</span>
                <span className="prompt-inspector-badge">{ROLE_BADGE_LABELS[role] ?? role}</span>
                <span className="prompt-inspector-item-id">{entry?.identifier ?? entry?.collection ?? (entry ? '—' : tailLabel)}</span>
                {pending ? <span className="prompt-inspector-badge prompt-inspector-badge-pending">{translate('Preview assembled')}</span> : null}
                <span className="prompt-inspector-item-tokens">{formatTokens(entry?.tokens)}</span>
            </button>
            <div className="prompt-inspector-item-preview">{open ? '' : previewText}</div>
            {open ? (
                <pre className="prompt-inspector-item-content">{text}{text && toolCallsText ? '\n\n' : ''}{toolCallsText}</pre>
            ) : null}
        </div>
    );
}

/**
 * The inspector body. Fetch happens on mount and on each round change; the
 * component keeps only transient UI state (open rows, copy feedback).
 */
/**
 * Builds the round note shown above the message list. Kept out of the JSX so the
 * interpolated copy stays a single translated template.
 * @param pipeline Pipeline round info
 * @param result Assembly result carrying the request payload
 * @returns Localized round note
 */
function pipelineMessage(pipeline: PromptInspectorPipeline, result: { request: Record<string, any> }) {
    const forced = result.request.tool_choice && typeof result.request.tool_choice === 'object'
        ? translate(', forced tool_choice')
        : '';
    return translate('Pipeline round ${0}/${1}: ${2} (step instruction appended${3})')
        .replace('${0}', String(pipeline.round + 1))
        .replace('${1}', String(pipeline.total))
        .replace('${2}', pipeline.step?.tool ?? '')
        .replace('${3}', forced);
}

export function PromptInspector({ bridge }: { bridge: PromptInspectorBridge }) {
    useTranslated('');
    const [snapshot, setSnapshot] = useState<PromptInspectorSnapshot | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorText, setErrorText] = useState<string | null>(null);
    const [round, setRound] = useState(0);
    const [copied, setCopied] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    const copyTimerRef = useRef<number | null>(null);

    const load = useCallback(async (roundIndex: number) => {
        const requestId = ++requestIdRef.current;
        setStatus('loading');
        setErrorText(null);
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
    }, [load, round]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                bridge.close();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
        };
    }, [bridge]);

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

    const result = snapshot?.kind === 'prompt-preview' ? snapshot : null;
    const empty = snapshot?.kind === 'prompt-preview-empty' ? snapshot : null;
    const pipeline = result?.pipeline ?? null;
    const roundOptions = useMemo(() => {
        if (!pipeline) {
            return [];
        }
        const options = pipeline.rounds.map(entry => ({
            value: entry.index,
            label: translate('Round ${0} · ${1}').replace('${0}', String(entry.index + 1)).replace('${1}', entry.tool),
        }));
        options.push({ value: pipeline.total, label: translate('Final round (no tools)') });
        return options;
    }, [pipeline]);

    return (
        <div className="prompt-inspector-overlay" onClick={event => {
            if (event.target === event.currentTarget) {
                bridge.close();
            }
        }}>
            <div className="prompt-inspector-panel" role="dialog" aria-modal="true" aria-label={translate('Prompt preview')}>
                <div className="prompt-inspector-header">
                    <span className="prompt-inspector-badge prompt-inspector-badge-preview">{translate('Preview (not sent)')}</span>
                    {result?.model ? <span className="prompt-inspector-model" title={translate('Target model')}>{result.model}</span> : null}
                    {pipeline && roundOptions.length > 1 ? (
                        <select
                            className="text_pole prompt-inspector-round"
                            value={round}
                            aria-label={translate('Pipeline rounds')}
                            onChange={event => setRound(Number(event.target.value))}
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
                        <i className="fa-solid fa-copy" aria-hidden="true" /> {copied === 'json' ? translate('Copied') : translate('Copy JSON')}
                    </button>
                    <button
                        type="button"
                        className="menu_button"
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

                        {result.budget ? (
                            <div className="prompt-inspector-budget" title={translate('Context / reserved reply / available budget / used / remaining')}>
                                {translate('Context')} {result.budget.context.toLocaleString()} · {translate('Reserved reply')} {result.budget.response.toLocaleString()} ·
                                {translate('Used')} {result.budget.used.toLocaleString()} · {translate('Remaining')} {result.budget.remaining.toLocaleString()}
                            </div>
                        ) : null}

                        {pipeline ? (
                            <div className="prompt-inspector-pipeline-note">
                                {pipeline.fallback
                                    ? translate('Final round: pipeline steps are complete, so no tools are sent this round.')
                                    : translate(pipelineMessage(pipeline, result))}
                            </div>
                        ) : null}

                        <div className="prompt-inspector-messages" role="list" aria-label={translate('Message list')}>
                            {(Array.isArray(result.request.messages) ? result.request.messages : []).map((message, index) => {
                                const entry = result.entries[index] ?? null;
                                return (
                                    <MessageRow
                                        key={index}
                                        index={index}
                                        message={(message ?? {}) as Record<string, unknown>}
                                        entry={entry}
                                        pending={entry?.identifier != null && entry.identifier === result.pendingEntryIdentifier}
                                        tailLabel={pipeline ? translate('Pipeline injection') : 'request'}
                                    />
                                );
                            })}
                        </div>

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

                        <div className="prompt-inspector-params">
                            <div className="prompt-inspector-params-title">{translate('Request parameters')}</div>
                            <div className="prompt-inspector-params-grid">
                                {PARAM_KEYS.filter(({ key }) => result.request[key] !== undefined).map(({ key, label }) => (
                                    <div key={key} className="prompt-inspector-param">
                                        <span className="prompt-inspector-param-key">{label}</span>
                                        <span className="prompt-inspector-param-value">{formatParamValue(result.request[key])}</span>
                                    </div>
                                ))}
                                {Array.isArray(result.request.tools) ? (
                                    <div className="prompt-inspector-param">
                                        <span className="prompt-inspector-param-key">tools</span>
                                        <span className="prompt-inspector-param-value">{translate('${0} tools').replace('${0}', String(result.request.tools.length))}</span>
                                    </div>
                                ) : null}
                            </div>
                            {Array.isArray(result.request.tools) && result.request.tools.length > 0 ? (
                                <div className="prompt-inspector-tools">
                                    <div className="prompt-inspector-params-title">{translate('Tool definitions (${0})').replace('${0}', String(result.request.tools.length))}</div>
                                    {(result.request.tools as Array<Record<string, unknown>>).map((tool, index) => (
                                        <ToolRow key={index} tool={tool ?? {}} />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
