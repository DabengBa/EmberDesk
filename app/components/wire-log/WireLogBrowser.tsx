import { useCallback, useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';

import { apiFetch } from '../../lib/request';
import { translate } from '../../compat/i18n.js';
import { formatTimestamp, formatUsage } from './wire-log-helpers';
import { WireLogDetail } from './WireLogDetail';
import { wireLogStyles as styles } from './wire-log.styles';
import type {
    WireLogConfig,
    WireLogListEntry,
    WireLogRecord,
    WireLogStatus,
} from './types';

/**
 * Wire log viewer.
 *
 * Two requests drive it: a metadata list from `GET /api/wire-logs` and one
 * full record from `GET /api/wire-logs/:id` for the selected row. Status and
 * date filters are server-side (the server owns the date partitions); the
 * keyword and model filters run locally because the list projection carries
 * no message text, so a round-trip per keystroke would buy nothing.
 */

const LIST_LIMIT = 200;

function formatDuration(value: number | null | undefined): string {
    return typeof value === 'number' ? `${value} ms` : '—';
}

function entryMatchesKeyword(entry: WireLogListEntry, keyword: string): boolean {
    if (!keyword) {
        return true;
    }
    return [
        entry.id,
        entry.context.model,
        entry.context.charName,
        entry.context.chatId,
        entry.context.pipelineStep,
        entry.context.type,
        entry.request.url,
        entry.error,
    ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase()
        .includes(keyword);
}

async function readJson(response: Response): Promise<unknown> {
    return response.json().catch(() => null);
}

function errorMessageFrom(data: unknown, fallback: string): string {
    const message = (data as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message ? message : fallback;
}

export type WireLogBrowserProps = {
    /** Dense embedding (drawer instead of page). */
    compact?: boolean;
    /**
     * Restricts the list to one chat session. The panel passes the active
     * chat id so the viewer opens scoped to the conversation being read;
     * `null` shows every session.
     */
    chatId?: string | null;
    onConfigChange?: (config: WireLogConfig) => void;
};

export function WireLogBrowser({ compact = false, chatId = null, onConfigChange }: WireLogBrowserProps) {
    const [entries, setEntries] = useState<WireLogListEntry[]>([]);
    const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [listError, setListError] = useState('');
    const [keyword, setKeyword] = useState('');
    const [modelFilter, setModelFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | WireLogStatus>('');
    const [dateFilter, setDateFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [record, setRecord] = useState<WireLogRecord | null>(null);
    const [recordState, setRecordState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [recordError, setRecordError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const [config, setConfig] = useState<WireLogConfig | null>(null);
    const [configError, setConfigError] = useState('');
    const [configBusy, setConfigBusy] = useState(false);

    const loadList = useCallback(async (signal: AbortSignal) => {
        setListState('loading');
        setListError('');
        const params = new URLSearchParams({ limit: String(LIST_LIMIT) });
        if (statusFilter) {
            params.set('status', statusFilter);
        }
        if (dateFilter) {
            params.set('date', dateFilter);
        }
        if (chatId) {
            params.set('chatId', chatId);
        }
        try {
            const response = await apiFetch(`/api/wire-logs?${params.toString()}`, {
                method: 'GET',
                signal,
            });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(errorMessageFrom(data, '无法读取 Wire Log 列表。'));
            }
            if (!Array.isArray(data)) {
                throw new Error('Wire Log 列表格式无效。');
            }
            if (!signal.aborted) {
                setEntries(data as WireLogListEntry[]);
                setListState('ready');
            }
        } catch (error) {
            if (!signal.aborted) {
                setListState('error');
                setListError(error instanceof Error ? error.message : String(error));
            }
        }
    }, [chatId, dateFilter, statusFilter]);

    useEffect(() => {
        const controller = new AbortController();
        void loadList(controller.signal);
        return () => controller.abort();
    }, [loadList, reloadToken]);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            setConfigError('');
            try {
                const response = await apiFetch('/api/wire-logs/config', { method: 'GET', signal: controller.signal });
                const data = await readJson(response);
                if (!response.ok) {
                    throw new Error(errorMessageFrom(data, '无法读取 Wire Log 设置。'));
                }
                if (!controller.signal.aborted) {
                    setConfig(data as WireLogConfig);

                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setConfigError(error instanceof Error ? error.message : String(error));
                }
            }
        })();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!selectedId) {
            setRecord(null);
            setRecordState('idle');
            return;
        }
        const controller = new AbortController();
        setRecordState('loading');
        setRecordError('');
        void (async () => {
            try {
                const response = await apiFetch(`/api/wire-logs/${encodeURIComponent(selectedId)}`, {
                    method: 'GET',
                    signal: controller.signal,
                });
                const data = await readJson(response);
                if (!response.ok) {
                    throw new Error(errorMessageFrom(data, '无法读取该条 Wire Log。'));
                }
                if (!controller.signal.aborted) {
                    setRecord(data as WireLogRecord);
                    setRecordState('ready');
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setRecord(null);
                    setRecordState('error');
                    setRecordError(error instanceof Error ? error.message : String(error));
                }
            }
        })();
        return () => controller.abort();
    }, [selectedId, reloadToken]);

    const toggleLogging = useCallback(async () => {
        if (!config) {
            return;
        }
        setConfigBusy(true);
        setConfigError('');
        try {
            const response = await apiFetch('/api/wire-logs/config', {
                method: 'POST',
                body: { enabled: !config.enabled },
            });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(errorMessageFrom(data, '无法保存 Wire Log 设置。'));
            }
            setConfig(data as WireLogConfig);
            onConfigChange?.(data as WireLogConfig);
        } catch (error) {
            setConfigError(error instanceof Error ? error.message : String(error));
        } finally {
            setConfigBusy(false);
        }
    }, [config, onConfigChange]);

    const deleteSelected = useCallback(async (id: string) => {
        setIsDeleting(true);
        setRecordError('');
        try {
            const response = await apiFetch(`/api/wire-logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error(errorMessageFrom(await readJson(response), '删除失败。'));
            }
            if (selectedId === id) {
                setSelectedId(null);
                setRecord(null);
            }
            setReloadToken(token => token + 1);
        } catch (error) {
            setRecordError(error instanceof Error ? error.message : String(error));
        } finally {
            setIsDeleting(false);
        }
    }, [selectedId]);

    const normalizedKeyword = keyword.trim().toLowerCase();
    const normalizedModel = modelFilter.trim().toLowerCase();
    const visibleEntries = useMemo(
        () => entries.filter(entry => {
            if (normalizedModel) {
                const model = (entry.context.model ?? entry.request.url ?? '').toLowerCase();
                if (!model.includes(normalizedModel)) {
                    return false;
                }
            }
            return entryMatchesKeyword(entry, normalizedKeyword);
        }),
        [entries, normalizedKeyword, normalizedModel],
    );

    return (
        <div {...stylex.props(styles.root)} data-wire-log-browser={compact ? 'compact' : 'full'}>
            <div {...stylex.props(styles.meta)}>
                <span {...stylex.props(styles.badge, config?.enabled ? styles.badgeOk : styles.badgeError)}>
                    {config?.enabled ? '追踪已开启' : '追踪未开启'}
                </span>
                {config ? (
                    <span>
                        {`保留 ${config.retentionDays} 天 · 正文捕获上限 ${Math.round(config.maxFileBytes / 1024 / 1024 * 10) / 10} MiB`}
                        {config.persisted === false ? ' · 设置无法持久化' : ''}
                    </span>
                ) : null}
                <button
                    type="button"
                    {...stylex.props(styles.button, config?.enabled ? styles.buttonActive : null)}
                    disabled={configBusy || !config}
                    onClick={() => { void toggleLogging(); }}
                >
                    {configBusy ? '保存中…' : config?.enabled ? '关闭追踪' : '开启追踪'}
                </button>
                <button
                    type="button"
                    {...stylex.props(styles.button)}
                    onClick={() => setReloadToken(token => token + 1)}
                >
                    {translate('刷新')}
                </button>
            </div>

            {configError ? (
                <div {...stylex.props(styles.status, styles.statusError)} role="alert">{configError}</div>
            ) : null}

            <div {...stylex.props(styles.toolbar)}>
                <label {...stylex.props(styles.field)}>
                    <span {...stylex.props(styles.fieldLabel)}>请求 ID / 关键字</span>
                    <input
                        type="search"
                        {...stylex.props(styles.input)}
                        value={keyword}
                        placeholder="wl_… 或模型/会话"
                        onChange={event => setKeyword(event.target.value)}
                    />
                </label>
                <label {...stylex.props(styles.field)}>
                    <span {...stylex.props(styles.fieldLabel)}>模型</span>
                    <input
                        type="search"
                        {...stylex.props(styles.input)}
                        value={modelFilter}
                        placeholder="gpt-5.2"
                        onChange={event => setModelFilter(event.target.value)}
                    />
                </label>
                <label {...stylex.props(styles.field)}>
                    <span {...stylex.props(styles.fieldLabel)}>状态</span>
                    <select
                        {...stylex.props(styles.select)}
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value as '' | WireLogStatus)}
                    >
                        <option value="">全部</option>
                        <option value="completed">completed</option>
                        <option value="error">error</option>
                        <option value="pending">pending</option>
                    </select>
                </label>
                <label {...stylex.props(styles.field)}>
                    <span {...stylex.props(styles.fieldLabel)}>日期</span>
                    <input
                        type="date"
                        {...stylex.props(styles.input)}
                        value={dateFilter}
                        onChange={event => setDateFilter(event.target.value)}
                    />
                </label>
            </div>

            <div {...stylex.props(styles.meta)}>
                <span>
                    {listState === 'ready'
                        ? `${visibleEntries.length} / ${entries.length} 条记录`
                        : listState === 'loading' ? '加载中…' : '列表加载失败'}
                </span>
            </div>

            {listState === 'error' ? (
                <div {...stylex.props(styles.status, styles.statusError)} role="alert">{listError}</div>
            ) : null}

            {listState === 'ready' && entries.length === 0 ? (
                <p {...stylex.props(styles.emptyNote)}>
                    还没有记录。开启追踪后，每次真实上游生成都会在这里留下一条请求/响应记录。
                </p>
            ) : null}

            <div {...stylex.props(styles.layout)}>
                <div {...stylex.props(styles.list)} role="list" aria-label="Wire Log 记录">
                    {visibleEntries.map(entry => {
                        const isActive = entry.id === selectedId;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                {...stylex.props(styles.row, isActive ? styles.rowActive : null)}
                                aria-pressed={isActive}
                                data-wire-log-entry={entry.id}
                                onClick={() => setSelectedId(entry.id)}
                            >
                                <span {...stylex.props(styles.rowTitle)}>
                                    <span {...stylex.props(styles.rowTime)}>{formatTimestamp(entry.ts)}</span>
                                    <span {...stylex.props(styles.badge, entry.status === 'error' ? styles.badgeError : styles.badgeOk)}>
                                        {entry.status}
                                    </span>
                                    {entry.response?.streamed ? (
                                        <span {...stylex.props(styles.badge)}>stream</span>
                                    ) : null}
                                </span>
                                <span {...stylex.props(styles.rowSub)}>
                                    {`${entry.context.model ?? '未知模型'} · ${entry.request.messageCount} msg · ${entry.request.toolCount} tools · ${formatDuration(entry.response?.durationMs)}`}
                                </span>
                                <span {...stylex.props(styles.rowSub)}>
                                    {`token ${formatUsage(entry.response?.usage)}`}
                                </span>
                                <span {...stylex.props(styles.rowSub)}>{entry.id}</span>
                                {entry.error ? <span {...stylex.props(styles.rowSub)}>{entry.error}</span> : null}
                            </button>
                        );
                    })}
                    {listState === 'ready' && entries.length > 0 && visibleEntries.length === 0 ? (
                        <p {...stylex.props(styles.emptyNote)}>没有匹配当前筛选条件的记录。</p>
                    ) : null}
                </div>

                <WireLogDetail
                    record={record}
                    isLoading={recordState === 'loading'}
                    error={recordState === 'error' ? recordError : null}
                    onDelete={(id: string) => { void deleteSelected(id); }}
                    isDeleting={isDeleting}
                />
            </div>
        </div>
    );
}
