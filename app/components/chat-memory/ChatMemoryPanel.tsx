import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { panelStyles as chrome } from '../wire-log/wire-log-panel.styles';
import { memoryStyles as styles } from './chat-memory.styles';
import type { ChatMemoryOverrides, ChatMemoryPanelBridge, ChatMemorySettings } from './types';

const labels: Record<keyof ChatMemorySettings, string> = {
    enabled: '历史会话总结', keepTurns: '最近保留完整轮数', maxTokens: '每轮摘要最大输出 Token',
    role: '摘要注入角色', prompt: '总结提示词', wrap: '摘要包装模板',
};
const states: Record<string, string> = { active: '摘要生效', expanded: '保留原文', pending: '等待总结', stale: '摘要已过期', failed: '总结失败' };

export function ChatMemoryPanel({ bridge }: { bridge: ChatMemoryPanelBridge }) {
    const [view, setView] = useState(() => bridge.getView());
    const [tab, setTab] = useState('管理');
    const [draft, setDraft] = useState<ChatMemoryOverrides>({});
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const mounted = useRef(false);
    const discardApproved = useRef(false);
    const hasDraft = useRef(false);

    useLayoutEffect(() => {
        hasDraft.current = Object.keys(draft).length > 0;
    }, [draft]);

    useEffect(() => {
        mounted.current = true;
        const previousFocus = document.activeElement;
        const dialog = dialogRef.current;
        dialog?.showModal();
        const refresh = () => {
            const next = bridge.getView();
            setView(next);
            if (!next) bridge.close();
        };
        const unsubscribe = bridge.subscribe(refresh);
        refresh();
        return () => {
            mounted.current = false;
            unsubscribe();
            dialog?.close();
            if (!discardApproved.current && hasDraft.current) bridge.onDraftDiscarded();
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, [bridge]);

    function requestClose() {
        if (Object.keys(draft).length && !window.confirm('当前设置尚未应用，确定放弃修改并关闭？')) return;
        discardApproved.current = true;
        bridge.close();
    }

    async function run(action: () => Promise<{ ok: boolean; error?: string }>, appliedKeys: (keyof ChatMemorySettings)[] = []) {
        if (pending) return;
        setPending(true);
        setError('');
        try {
            const result = await action();
            if (!mounted.current) return;
            if (!result.ok) setError(`操作未完成${result.error === 'save_failed' ? '，未保存' : ''}：${result.error ?? '未知错误'}`);
            else {
                if (appliedKeys.length) setDraft(previous => {
                    const next = { ...previous };
                    for (const key of appliedKeys) delete next[key];
                    return next;
                });
                setView(bridge.getView());
            }
        } catch (reason) {
            if (mounted.current) setError(`操作未完成：${reason instanceof Error ? reason.message : String(reason)}`);
        } finally {
            if (mounted.current) setPending(false);
        }
    }

    if (!view) return null;
    const busy = pending || view.running;
    const current = { ...view.settings, ...draft } as ChatMemorySettings;
    return (
        <dialog ref={dialogRef} aria-label="对话记忆" {...stylex.props(chrome.overlay)}
            onCancel={event => { event.preventDefault(); requestClose(); }}
            onClick={event => { if (event.target === event.currentTarget) requestClose(); }}
            onKeyDown={event => {
                if (event.key !== 'Tab') return;
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')).filter(node => node.getClientRects().length);
                const first = controls[0];
                const last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}>
            <section {...stylex.props(chrome.panel, styles.panel)}>
                <header {...stylex.props(chrome.header)}>
                    <strong {...stylex.props(chrome.title)}>对话记忆</strong><span {...stylex.props(chrome.scope)}>当前会话</span>
                    <span {...stylex.props(chrome.spacer)} />
                    <button type="button" aria-label="关闭对话记忆" {...stylex.props(chrome.button)} onClick={requestClose}>关闭</button>
                </header>
                <nav aria-label="对话记忆视图" {...stylex.props(chrome.header)}>
                    {['管理', '设置', '历史'].map(name => <button type="button" key={name} aria-pressed={tab === name} {...stylex.props(chrome.button, tab === name && chrome.buttonActive)} onClick={() => setTab(name)}>{name}</button>)}
                </nav>
                <div {...stylex.props(chrome.body, styles.body)} aria-busy={pending}>
                    <div {...stylex.props(styles.muted)}>{view.settings.enabled ? '记忆已启用' : '记忆已关闭'} · 共 {view.stats.totalTurns} 轮 · 原文 {view.stats.verbatimTurns} 轮 · 生效摘要 {view.stats.summarizedTurns} 轮 · 队列 {view.queueDepth}{view.running ? ' · 正在处理' : ''}</div>
                    {error && <div role="alert" {...stylex.props(styles.error)}>{error}</div>}
                    {pending && <div role="status">正在处理，请稍候…</div>}
                    {tab === '管理' && <>
                        <p {...stylex.props(styles.muted)}>摘要仅供查看。钉住的轮次始终保留原文；最近轮次不会参与总结。</p>
                        {!view.turns.length && <p>当前会话还没有可管理的轮次。</p>}
                        {view.turns.map(turn => <article key={turn.key} {...stylex.props(styles.row)}>
                            <div {...stylex.props(styles.toolbar)}><strong>第 {turn.index + 1} 轮</strong><span>{turn.running ? '正在总结' : states[turn.status ?? ''] ?? '尚无摘要'}</span><span {...stylex.props(styles.muted)}>{turn.pinned ? '已钉住原文' : turn.eligible ? '可总结' : '保留原文轮次'}</span></div>
                            {turn.summary?.text ? <p {...stylex.props(styles.text)}>{turn.summary.text}</p> : <p {...stylex.props(styles.muted)}>暂无摘要</p>}
                            <div {...stylex.props(styles.toolbar)}>
                                <button type="button" disabled={busy || turn.running} {...stylex.props(chrome.button)} onClick={() => void run(() => bridge.setPinned(turn.key, !turn.pinned))}>{turn.pinned ? '取消钉住' : '钉住原文'}</button>
                                <button type="button" disabled={busy || turn.running || !turn.eligible || !view.settings.enabled} {...stylex.props(chrome.button)} onClick={() => void run(() => bridge.regenerate(turn.key))}>重新总结</button>
                                {turn.status === 'failed' && <button type="button" disabled={busy || !turn.eligible || !view.settings.enabled} {...stylex.props(chrome.button)} onClick={() => void run(() => bridge.retry(turn.key))}>重试</button>}
                            </div>
                        </article>)}
                    </>}
                    {tab === '设置' && <form onSubmit={event => { event.preventDefault(); void run(() => bridge.updateSettings(draft), Object.keys(draft) as (keyof ChatMemorySettings)[]); }}>
                        <p {...stylex.props(styles.muted)}>只修改当前会话。恢复默认会删除会话覆盖，继续继承全局设置。</p>
                        {(Object.keys(labels) as (keyof ChatMemorySettings)[]).map(key => <div key={key} data-testid={`setting-${key}`} {...stylex.props(styles.row)}>
                            <label htmlFor={`chat-memory-${key}`}>{labels[key]}</label>
                            {key === 'enabled' ? <input id={`chat-memory-${key}`} type="checkbox" checked={current.enabled} disabled={busy} {...stylex.props(styles.toggle)} onChange={event => setDraft(previous => ({ ...previous, enabled: event.target.checked }))} />
                                : key === 'role' ? <select id={`chat-memory-${key}`} value={current.role} disabled={busy} {...stylex.props(styles.field)} onChange={event => setDraft(previous => ({ ...previous, role: event.target.value as ChatMemorySettings['role'] }))}><option value="system">system</option><option value="assistant">assistant</option><option value="user">user</option></select>
                                    : key === 'prompt' || key === 'wrap' ? <textarea id={`chat-memory-${key}`} value={current[key]} rows={key === 'prompt' ? 5 : 3} required disabled={busy} {...stylex.props(styles.field)} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} />
                                        : <input id={`chat-memory-${key}`} type="number" value={Number.isNaN(current[key]) ? '' : current[key]} min={1} step={1} required disabled={busy} {...stylex.props(styles.field)} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.valueAsNumber }))} />}
                            <div {...stylex.props(styles.toolbar)}><span {...stylex.props(styles.muted)}>{Object.hasOwn(draft, key) ? '尚未应用' : Object.hasOwn(view.overrides, key) ? '当前会话覆盖' : '继承全局设置'}</span>
                                <button type="button" disabled={busy || !Object.hasOwn(view.overrides, key)} {...stylex.props(chrome.button)} onClick={() => void run(() => bridge.updateSettings({ [key]: null }), [key])}>恢复默认</button>
                            </div>
                            {key !== 'prompt' && key !== 'wrap' && <span {...stylex.props(styles.muted)}>全局默认：{key === 'enabled' ? view.globalSettings.enabled ? '开启' : '关闭' : String(view.globalSettings[key])}</span>}
                            {key === 'wrap' && <span {...stylex.props(styles.muted)}>{'使用 {{summary}} 插入摘要。'}</span>}
                        </div>)}
                        <div {...stylex.props(styles.row)}><button type="submit" disabled={busy || !Object.keys(draft).length} {...stylex.props(chrome.button)}>应用设置</button></div>
                    </form>}
                    {tab === '历史' && <>
                        <p {...stylex.props(styles.muted)}>当前会话的操作记录；失败不代表已保存。</p>
                        {!view.history.length && <p>暂无操作记录。</p>}
                        {[...view.history].reverse().map((entry, index) => <article key={index} {...stylex.props(styles.row)}><time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString()}</time><span>{entry.action} · {entry.status}</span>{entry.turnKey && <span {...stylex.props(styles.muted)}>{entry.turnKey}</span>}{entry.error && <p {...stylex.props(styles.text)}>{entry.error}</p>}</article>)}
                    </>}
                </div>
            </section>
        </dialog>
    );
}
