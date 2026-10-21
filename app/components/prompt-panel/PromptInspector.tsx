import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    system: '系统',
    user: '用户',
    assistant: '助手',
    tool: '工具',
};

const WARNING_LABELS: Record<string, string> = {
    'slash-command': '输入以 / 开头：发送时会先执行斜杠命令，预览展示的是命令原文。',
    'pending-attachment': '存在待发送附件：附件文件内容未纳入预览。',
    'bias-only-system': '输入仅含 bias：实际发送时会作为系统消息写入，不进入 prompt。',
    'budget-exceeded': '强制提示词已超出上下文预算，消息列表可能不完整。',
    'assembly-error': '组装过程中发生错误，预览可能不完整。',
};

const EMPTY_REASON_LABELS: Record<string, string> = {
    'no-active-character': '未选择角色，无法组装 prompt。',
    'unsupported-api': '当前 API 不是 Chat Completion，暂不支持预览。',
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
                title={open ? '收起定义' : '展开定义'}
            >
                <span className="prompt-inspector-tool-name">{name}</span>
                <span className="prompt-inspector-tool-desc">{description || '（无描述）'}</span>
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
                title={open ? '收起' : '展开内容'}
            >
                <span className="prompt-inspector-item-index">#{index}</span>
                <span className="prompt-inspector-badge">{ROLE_BADGE_LABELS[role] ?? role}</span>
                <span className="prompt-inspector-item-id">{entry?.identifier ?? entry?.collection ?? (entry ? '—' : tailLabel)}</span>
                {pending ? <span className="prompt-inspector-badge prompt-inspector-badge-pending">预览合成</span> : null}
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
export function PromptInspector({ bridge }: { bridge: PromptInspectorBridge }) {
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
            label: `轮次 ${entry.index + 1} · ${entry.tool}`,
        }));
        options.push({ value: pipeline.total, label: `收尾轮（无工具）` });
        return options;
    }, [pipeline]);

    return (
        <div className="prompt-inspector-overlay" onClick={event => {
            if (event.target === event.currentTarget) {
                bridge.close();
            }
        }}>
            <div className="prompt-inspector-panel" role="dialog" aria-modal="true" aria-label="Prompt 预览">
                <div className="prompt-inspector-header">
                    <span className="prompt-inspector-badge prompt-inspector-badge-preview">预览（未发送）</span>
                    {result?.model ? <span className="prompt-inspector-model" title="目标模型">{result.model}</span> : null}
                    {pipeline && roundOptions.length > 1 ? (
                        <select
                            className="text_pole prompt-inspector-round"
                            value={round}
                            aria-label="管线轮次"
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
                        title="按当前状态重新组装"
                        onClick={() => void load(round)}
                    >
                        <i className="fa-solid fa-rotate-right" aria-hidden="true" /> 刷新
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        disabled={!result}
                        title="复制完整请求体 JSON"
                        onClick={() => result && void copyText('json', JSON.stringify(result.request, null, 2))}
                    >
                        <i className="fa-solid fa-copy" aria-hidden="true" /> {copied === 'json' ? '已复制' : '复制 JSON'}
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        title="关闭"
                        onClick={() => bridge.close()}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>

                {status === 'loading' ? (
                    <div className="prompt-inspector-status">正在组装预览…</div>
                ) : null}
                {status === 'error' ? (
                    <div className="prompt-inspector-status prompt-inspector-status-error">
                        预览失败：{errorText ?? '未知错误'}
                        <button type="button" className="menu_button" onClick={() => void load(round)}>重试</button>
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
                            <div className="prompt-inspector-budget" title="上下文 / 预留回复 / 可用预算 / 已用 / 剩余">
                                上下文 {result.budget.context.toLocaleString()} · 预留回复 {result.budget.response.toLocaleString()} ·
                                已用 {result.budget.used.toLocaleString()} · 剩余 {result.budget.remaining.toLocaleString()}
                            </div>
                        ) : null}

                        {pipeline ? (
                            <div className="prompt-inspector-pipeline-note">
                                {pipeline.fallback
                                    ? `收尾轮：pipeline 步骤已完成，本轮不发送 tools。`
                                    : `管线第 ${pipeline.round + 1}/${pipeline.total} 步：${pipeline.step?.tool ?? ''}（追加步骤指令${result.request.tool_choice && typeof result.request.tool_choice === 'object' ? '，强制 tool_choice' : ''}）`}
                            </div>
                        ) : null}

                        <div className="prompt-inspector-messages" role="list" aria-label="消息列表">
                            {(Array.isArray(result.request.messages) ? result.request.messages : []).map((message, index) => {
                                const entry = result.entries[index] ?? null;
                                return (
                                    <MessageRow
                                        key={index}
                                        index={index}
                                        message={(message ?? {}) as Record<string, unknown>}
                                        entry={entry}
                                        pending={entry?.identifier != null && entry.identifier === result.pendingEntryIdentifier}
                                        tailLabel={pipeline ? '管线注入' : 'request'}
                                    />
                                );
                            })}
                        </div>

                        {(result.summarized ?? []).length > 0 ? (
                            <div className="prompt-inspector-dropped">
                                <div className="prompt-inspector-dropped-title">
                                    已摘要轮次（{result.summarized.length} 轮，原文未进入 prompt）
                                </div>
                                {result.summarized.map(entry => (
                                    <div key={entry.summaryId} className="prompt-inspector-dropped-item">
                                        <span className="prompt-inspector-badge">摘要</span>
                                        <span className="prompt-inspector-item-id">{entry.identifier}</span>
                                        <span className="prompt-inspector-badge">覆盖 {entry.coveredCount} 条</span>
                                        {entry.manual ? <span className="prompt-inspector-badge">手写</span> : null}
                                        {entry.stale ? <span className="prompt-inspector-badge prompt-inspector-badge-pending">已失效</span> : null}
                                        <span className="prompt-inspector-dropped-preview">{entry.text.slice(0, 80)}{entry.text.length > 80 ? '…' : ''}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {result.dropped.length > 0 ? (
                            <div className="prompt-inspector-dropped">
                                <div className="prompt-inspector-dropped-title">
                                    ⚠ 因预算被裁掉的消息（{result.dropped.length} 条，未进入 prompt）
                                </div>
                                {result.dropped.map(entry => (
                                    <div key={entry.identifier} className="prompt-inspector-dropped-item">
                                        <span className="prompt-inspector-badge">{ROLE_BADGE_LABELS[entry.role ?? ''] ?? entry.role ?? '?'}</span>
                                        <span className="prompt-inspector-item-id">{entry.identifier}</span>
                                        {entry.hasMedia ? <span className="prompt-inspector-badge">含附件</span> : null}
                                        <span className="prompt-inspector-dropped-preview">{entry.content.slice(0, 80)}{entry.content.length > 80 ? '…' : ''}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className="prompt-inspector-params">
                            <div className="prompt-inspector-params-title">请求参数</div>
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
                                        <span className="prompt-inspector-param-value">{result.request.tools.length} 个工具</span>
                                    </div>
                                ) : null}
                            </div>
                            {Array.isArray(result.request.tools) && result.request.tools.length > 0 ? (
                                <div className="prompt-inspector-tools">
                                    <div className="prompt-inspector-params-title">工具定义（{result.request.tools.length}）</div>
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
