import { useCallback, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { JsonViewer } from './JsonViewer';
import { wireLogStyles as styles } from './wire-log.styles';
import {
    downloadJson,
    formatBytes,
    formatTimestamp,
    formatUsage,
    messagePreview,
    requestMessages,
    responseReasoning,
    responseText,
    serializeForClipboard,
    sseBody,
} from './wire-log-helpers';
import type { WireLogChatMessage, WireLogRecord } from './types';

export interface WireLogDetailProps {
    record: WireLogRecord | null;
    isLoading?: boolean;
    error?: string | null;
    onDelete?: (id: string) => void;
    isDeleting?: boolean;
}

/**
 * Minimal clipboard helper. `navigator.clipboard` is unavailable on plain-http
 * origins, so a hidden textarea keeps the copy button working there too.
 * @param text Text to copy
 * @returns Whether the copy succeeded
 */
async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall through to the textarea path.
    }
    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'true');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    } catch {
        return false;
    }
}

function MetaCell({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div {...stylex.props(styles.metaCell)}>
            <span {...stylex.props(styles.metaLabel)}>{label}</span>
            <span>{value ?? '—'}</span>
        </div>
    );
}

function MessageRow({ message, index }: { message: WireLogChatMessage; index: number }) {
    const [open, setOpen] = useState(false);
    const role = typeof message.role === 'string' ? message.role : 'unknown';
    const preview = messagePreview(message.content);
    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;

    return (
        <div {...stylex.props(styles.message)}>
            <button
                type="button"
                {...stylex.props(styles.disclosure, styles.messageSummary)}
                aria-expanded={open}
                onClick={() => setOpen(current => !current)}
            >
                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                <span {...stylex.props(styles.messageRole)}>{role}</span>
                <span>#{index}</span>
                {typeof message.name === 'string' && message.name ? <span>{message.name}</span> : null}
                {hasToolCalls ? <span {...stylex.props(styles.statusBadge)}>tools</span> : null}
                {!open && preview ? <span {...stylex.props(styles.messagePreview)}>{preview}</span> : null}
            </button>
            {open ? (
                <div {...stylex.props(styles.messageBody)}>
                    <JsonViewer value={message} depth={2} label={`message ${index} ${role}`} />
                </div>
            ) : null}
        </div>
    );
}

export function WireLogDetail({ record, isLoading = false, error, onDelete, isDeleting = false }: WireLogDetailProps) {
    const [copyStatus, setCopyStatus] = useState('');
    const messages = useMemo(() => requestMessages(record), [record]);
    const replyText = useMemo(() => responseText(record), [record]);
    const reasoningText = useMemo(() => responseReasoning(record), [record]);
    const streamed = useMemo(() => sseBody(record?.response?.body), [record]);
    const rawJson = useMemo(() => (record ? serializeForClipboard(record) : ''), [record]);

    const copy = useCallback(async (kind: 'record' | 'messages' | 'reply') => {
        const text = kind === 'record'
            ? rawJson
            : kind === 'messages'
                ? serializeForClipboard(messages)
                : replyText ?? '';
        const ok = await copyText(text);
        setCopyStatus(ok ? `已复制${kind === 'record' ? '整条记录' : kind === 'messages' ? '请求 messages' : '响应文本'}` : '复制失败');
    }, [rawJson, messages, replyText]);

    if (error) {
        return (
            <div {...stylex.props(styles.detail)}>
                <p role="alert" {...stylex.props(styles.feedback, styles.feedbackError)}>{error}</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div {...stylex.props(styles.detail)}>
                <p role="status" {...stylex.props(styles.feedback)}>加载中…</p>
            </div>
        );
    }

    if (!record) {
        return (
            <div {...stylex.props(styles.detail)}>
                <p role="status" {...stylex.props(styles.feedback)}>从左侧选择一条日志查看请求与响应。</p>
            </div>
        );
    }

    return (
        <div {...stylex.props(styles.detail)} data-wire-log-detail={record.id}>
            <div {...stylex.props(styles.toolbar)}>
                <strong>{record.id}</strong>
                <span {...stylex.props(styles.toolbarSpacer)} />
                <button
                    type="button"
                    className="menu_button"
                    data-wire-log-copy="record"
                    {...stylex.props(styles.button)}
                    onClick={() => { void copy('record'); }}
                >
                    复制 JSON
                </button>
                <button
                    type="button"
                    className="menu_button"
                    data-wire-log-download="record"
                    {...stylex.props(styles.button)}
                    onClick={() => downloadJson(record, record.id)}
                >
                    下载 JSON
                </button>
                <button
                    type="button"
                    className="menu_button"
                    data-wire-log-copy="messages"
                    {...stylex.props(styles.button)}
                    onClick={() => { void copy('messages'); }}
                >
                    复制 messages
                </button>
                {replyText !== null ? (
                    <button
                        type="button"
                        className="menu_button"
                        data-wire-log-copy="reply"
                        {...stylex.props(styles.button)}
                        onClick={() => { void copy('reply'); }}
                    >
                        复制响应文本
                    </button>
                ) : null}
                {onDelete ? (
                    <button
                        type="button"
                        className="menu_button"
                        data-wire-log-delete={record.id}
                        {...stylex.props(styles.button)}
                        disabled={isDeleting}
                        onClick={() => onDelete(record.id)}
                    >
                        {isDeleting ? '删除中…' : '删除'}
                    </button>
                ) : null}
            </div>
            {copyStatus ? <p role="status" {...stylex.props(styles.feedback)}>{copyStatus}</p> : null}

            <div {...stylex.props(styles.metaGrid)}>
                <MetaCell label="时间" value={formatTimestamp(record.ts)} />
                <MetaCell label="状态" value={record.status} />
                <MetaCell label="模型" value={record.context?.model ?? null} />
                <MetaCell label="来源" value={record.context?.source ?? null} />
                <MetaCell label="类型" value={record.context?.type ?? null} />
                <MetaCell label="角色" value={record.context?.charName ?? null} />
                <MetaCell label="会话" value={record.context?.chatId ?? null} />
                <MetaCell label="管线步骤" value={record.context?.pipelineStep ?? null} />
                <MetaCell label="管线 Run" value={record.context?.pipelineRun ?? null} />
                <MetaCell label="请求字节" value={formatBytes(record.request?.bytes)} />
                <MetaCell
                    label="响应字节"
                    value={record.response ? formatBytes(record.response.bytes) : null}
                />
                <MetaCell label="分块数" value={record.response?.chunks ?? null} />
                <MetaCell label="耗时" value={record.response?.durationMs != null ? `${record.response.durationMs} ms` : null} />
                <MetaCell label="首字节" value={record.response?.ttftMs != null ? `${record.response.ttftMs} ms` : null} />
                <MetaCell label="Token 用量" value={formatUsage(record.response?.usage)} />
            </div>

            {record.error ? (
                <p role="alert" {...stylex.props(styles.feedback, styles.feedbackError)}>
                    {record.error.message}
                </p>
            ) : null}

            <div {...stylex.props(styles.sectionLabel)}>
                <span>请求</span>
                <span {...stylex.props(styles.statusBadge)}>{record.request?.method} {record.request?.url}</span>
                {record.request?.truncated ? <span {...stylex.props(styles.statusBadge, styles.statusError)}>已截断</span> : null}
            </div>
            <div {...stylex.props(styles.sectionLabel)}>
                <span>messages（{messages.length}）</span>
            </div>
            {messages.length > 0 ? (
                <div {...stylex.props(styles.messageList)}>
                    {messages.map((message, index) => (
                        <MessageRow key={index} message={message} index={index} />
                    ))}
                </div>
            ) : (
                <p {...stylex.props(styles.feedback)}>该请求没有 messages 数组。</p>
            )}

            <div {...stylex.props(styles.sectionLabel)}>请求体（完整）</div>
            <JsonViewer value={record.request?.body ?? null} depth={1} label="request body" />

            <div {...stylex.props(styles.sectionLabel)}>请求头</div>
            <JsonViewer value={record.request?.headers ?? {}} depth={1} label="request headers" />

            <div {...stylex.props(styles.sectionLabel)}>
                <span>响应</span>
                {record.response ? (
                    <span {...stylex.props(styles.statusBadge)}>
                        {record.response.status} {record.response.streamed ? 'stream' : 'json'}
                    </span>
                ) : null}
            </div>
            {replyText !== null ? (
                <pre {...stylex.props(styles.pre)} data-wire-log-reply>{replyText}</pre>
            ) : (
                <p {...stylex.props(styles.feedback)}>该记录没有可读的响应文本。</p>
            )}
            {reasoningText !== null ? (
                <>
                    <div {...stylex.props(styles.sectionLabel)}>推理内容</div>
                    <pre {...stylex.props(styles.pre)} data-wire-log-reasoning>{reasoningText}</pre>
                </>
            ) : null}
            {streamed ? (
                <>
                    <div {...stylex.props(styles.sectionLabel)}>
                        <span>流式原始字节（SSE）</span>
                        {streamed.rawTruncated ? (
                            <span {...stylex.props(styles.statusBadge, styles.statusError)}>已截断</span>
                        ) : null}
                    </div>
                    <JsonViewer value={streamed.raw ?? ''} label="response stream" />
                </>
            ) : null}
            <div {...stylex.props(styles.sectionLabel)}>响应体（完整）</div>
            <JsonViewer value={record.response?.body ?? null} depth={1} label="response body" />
        </div>
    );
}
