import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ContractIconButton } from '../contract/ContractIconButton';

export interface PromptPanelPrompt {
    identifier: string;
    name: string;
    role: string | null;
    content: string;
    marker: boolean;
    system_prompt: boolean;
    forbid_overrides: boolean;
    injection_position: number;
    injection_depth: number | null;
    injection_order: number | null;
    injection_trigger: string[];
}

export interface PromptPanelOrderEntry {
    identifier: string;
    enabled: boolean;
}

export interface PromptPanelState {
    promptsById: Record<string, PromptPanelPrompt>;
    order: PromptPanelOrderEntry[];
    tokenCounts: Record<string, number>;
    presetDirty: boolean;
    /**
     * Trigger tags for the runnable reply-pipeline steps of the active preset
     * (e.g. 'pipeline:review'). Rendered as extra checkboxes in the trigger row.
     */
    pipelineTriggerTags?: string[];
}

export interface PromptPanelBridge {
    subscribe(listener: () => void): () => void;
    getState(): PromptPanelState;
    setPromptEnabled(identifier: string, enabled: boolean): void;
    movePrompt(identifier: string, targetIndex: number): void;
    updatePrompt(identifier: string, patch: Partial<PromptPanelPrompt>): void;
    addPrompt(): string | null;
    deletePrompt(identifier: string): void;
}

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'system', label: '系统' },
    { value: 'user', label: '用户' },
    { value: 'assistant', label: '助手' },
];

const ROLE_BADGE_LABELS: Record<string, string> = {
    system: '系统',
    user: '用户',
    assistant: '助手',
};

/**
 * Compact "+ 新建提示词" button rendered next to the 提示词管理 section
 * header. New entries land at the end of the order list; PromptManagerList
 * auto-expands whichever identifier appears for the first time.
 */
export function PromptManagerAddButton({ bridge }: { bridge: PromptPanelBridge }) {
    return (
        <button
            type="button"
            className="menu_button prompt-panel-add-btn"
            title="新建提示词"
            onClick={() => bridge.addPrompt()}
        >
            <i className="fa-solid fa-plus" aria-hidden="true" /> 新建
        </button>
    );
}

const INJECTION_POSITION_RELATIVE = 0;
const INJECTION_POSITION_ABSOLUTE = 1;

const TRIGGER_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'normal', label: '常规' },
];

/**
 * 左侧"提示词"面板内的 Prompt Manager 列表 —— 渲染进 legacy
 * #completion_prompt_manager 容器。预设区与高级设置区由 AiConfigPanel
 * 的 legacy ID 提供,本组件只管 prompt 排序/启停/字段编辑。
 * 状态全部来自 legacy 桥(__emberDeskPromptPanelBridge),不自己维护副本。
 */
export function PromptManagerList({ bridge }: { bridge: PromptPanelBridge }) {
    const state = useSyncExternalStore(
        listener => bridge.subscribe(listener),
        () => bridge.getState(),
        () => bridge.getState(),
    );
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [contentPopup, setContentPopup] = useState<{ id: string; draft: string } | null>(null);
    const knownIdsRef = useRef<Set<string> | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const keyboardFocusRef = useRef<HTMLButtonElement | null>(null);
    const pointerRef = useRef<{ identifier: string; pointerId: number; startX: number; startY: number; x: number; y: number; active: boolean } | null>(null);
    const [drag, setDrag] = useState<{ identifier: string; targetIdentifier: string; before: boolean; targetIndex: number } | null>(null);

    const cancelDrag = () => {
        pointerRef.current = null;
        setDrag(null);
    };

    const updateDragTarget = () => {
        const pointer = pointerRef.current;
        const list = listRef.current;
        if (!pointer?.active || !list) return;
        const bounds = list.getBoundingClientRect();
        const viewport = list.closest<HTMLElement>('.scrollableInner')?.getBoundingClientRect() ?? bounds;
        if (pointer.x < Math.max(bounds.left, viewport.left) || pointer.x > Math.min(bounds.right, viewport.right) || pointer.y < Math.max(bounds.top, viewport.top) || pointer.y > Math.min(bounds.bottom, viewport.bottom)) {
            setDrag(null);
            return;
        }
        const rows = Array.from(list.querySelectorAll<HTMLElement>('.prompt-panel-item'));
        const target = rows.find(row => pointer.y <= row.getBoundingClientRect().bottom) ?? rows.at(-1);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const before = pointer.y < rect.top + rect.height / 2;
        const targetIdentifier = target.dataset.promptIdentifier!;
        const order = bridge.getState().order;
        const sourceIndex = order.findIndex(entry => entry.identifier === pointer.identifier);
        const insertionIndex = order.findIndex(entry => entry.identifier === targetIdentifier) + (before ? 0 : 1);
        const targetIndex = insertionIndex - (sourceIndex < insertionIndex ? 1 : 0);
        const next = { identifier: pointer.identifier, targetIdentifier, before, targetIndex };
        setDrag(current => current?.targetIdentifier === targetIdentifier && current.before === before && current.targetIndex === targetIndex ? current : next);
        return next;
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const pointer = pointerRef.current;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.active ||= Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 4;
        updateDragTarget();
    };

    useEffect(() => {
        cancelDrag();
        keyboardFocusRef.current?.focus({ preventScroll: true });
        keyboardFocusRef.current = null;
    }, [state.order]);

    useEffect(() => {
        if (!drag) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') cancelDrag();
        };
        const scroller = listRef.current?.closest<HTMLElement>('.scrollableInner');
        let frame: number;
        const scroll = () => {
            const pointer = pointerRef.current;
            if (pointer && scroller) {
                const rect = scroller.getBoundingClientRect();
                if (pointer.x >= rect.left && pointer.x <= rect.right) {
                    const delta = pointer.y < rect.top + 32 ? -8 : pointer.y > rect.bottom - 32 ? 8 : 0;
                    if (delta) {
                        scroller.scrollBy(0, delta);
                        updateDragTarget();
                    }
                }
            }
            frame = requestAnimationFrame(scroll);
        };
        frame = requestAnimationFrame(scroll);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [drag?.identifier]);

    useEffect(() => {
        if (!contentPopup) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setContentPopup(null);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [contentPopup]);

    const toggleTrigger = (prompt: PromptPanelPrompt, trigger: string, on: boolean) => {
        const current = Array.isArray(prompt.injection_trigger) ? prompt.injection_trigger : [];
        let next = on ? [...new Set([...current, trigger])] : current.filter(item => item !== trigger);
        if (trigger === 'all' && !on && !next.length) {
            next = ['normal'];
        }
        bridge.updatePrompt(prompt.identifier, { injection_trigger: next });
    };

    // Pipeline step tags ('pipeline:analyze') become per-round checkboxes
    // alongside the static all/normal options.
    const triggerOptions = [
        ...TRIGGER_OPTIONS,
        ...(state.pipelineTriggerTags ?? []).map(tag => ({
            value: tag,
            label: `管线 ${tag.replace('pipeline:', '')}`,
        })),
    ];

    // Auto-expand the entry that a header/toolbar "新建" click just appended.
    useEffect(() => {
        const ids = new Set(state.order.map(entry => entry.identifier));
        if (knownIdsRef.current) {
            for (const id of ids) {
                if (!knownIdsRef.current.has(id)) {
                    setExpandedId(id);
                }
            }
        }
        knownIdsRef.current = ids;
    }, [state.order]);

    return (
        <div className="prompt-panel-root">
            <div ref={listRef} className="prompt-panel-list" role="list" aria-label="提示词排序">
                <div className="prompt-panel-list-head">
                    <span className="prompt-panel-head-name">名称</span>
                    <span className="prompt-panel-head-tokens">Tokens</span>
                </div>
                {state.order.map((entry, index) => {
                    const prompt = state.promptsById[entry.identifier];
                    const expanded = expandedId === entry.identifier;
                    const isAbsolute = (prompt?.injection_position ?? 0) === INJECTION_POSITION_ABSOLUTE;
                    return (
                        <div
                            key={entry.identifier}
                            role="listitem"
                            className={`prompt-panel-item${entry.enabled ? '' : ' prompt-panel-item-disabled'}${expanded ? ' prompt-panel-item-expanded' : ''}${drag?.identifier === entry.identifier ? ' prompt-panel-item-dragging' : ''}`}
                            data-prompt-identifier={entry.identifier}
                            data-drop-position={drag?.targetIdentifier === entry.identifier && drag.targetIndex !== state.order.findIndex(item => item.identifier === drag.identifier) ? (drag.before ? 'before' : 'after') : undefined}
                        >
                            <div className="prompt-panel-item-row">
                                <button
                                    type="button"
                                    className="prompt-panel-drag-handle drag-handle menu-handle"
                                    aria-label={`拖拽排序 ${prompt?.name ?? entry.identifier}`}
                                    title="拖拽调整顺序，也可使用上下方向键"
                                    onPointerDown={event => {
                                        if (!event.isPrimary || event.button !== 0) return;
                                        event.preventDefault();
                                        event.currentTarget.focus({ preventScroll: true });
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        pointerRef.current = { identifier: entry.identifier, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
                                    }}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={event => {
                                        const pointer = pointerRef.current;
                                        if (!pointer || pointer.pointerId !== event.pointerId) return;
                                        pointer.x = event.clientX;
                                        pointer.y = event.clientY;
                                        const destination = updateDragTarget();
                                        if (destination) bridge.movePrompt(entry.identifier, destination.targetIndex);
                                        cancelDrag();
                                    }}
                                    onPointerCancel={cancelDrag}
                                    onLostPointerCapture={cancelDrag}
                                    onKeyDown={event => {
                                        if (event.key === 'Escape') cancelDrag();
                                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                                        event.preventDefault();
                                        cancelDrag();
                                        const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
                                        if (targetIndex < 0 || targetIndex >= state.order.length) return;
                                        keyboardFocusRef.current = event.currentTarget;
                                        bridge.movePrompt(entry.identifier, targetIndex);
                                    }}
                                >
                                    <span aria-hidden="true">&#9776;</span>
                                </button>
                                <input
                                    type="checkbox"
                                    className="prompt-panel-enabled"
                                    checked={entry.enabled}
                                    aria-label={`启用 ${prompt?.name ?? entry.identifier}`}
                                    onChange={event => bridge.setPromptEnabled(entry.identifier, event.target.checked)}
                                />
                                <button
                                    type="button"
                                    className="prompt-panel-item-name"
                                    onClick={() => setExpandedId(expanded ? null : entry.identifier)}
                                    title={prompt?.marker ? '占位符,内容由运行时注入' : '展开编辑'}
                                >
                                    <span className="prompt-panel-item-name-text">{prompt?.name ?? entry.identifier}</span>
                                    <span className="prompt-panel-item-meta">
                                        {prompt?.role ? <span className="prompt-panel-badge">{ROLE_BADGE_LABELS[prompt.role] ?? prompt.role}</span> : null}
                                        {prompt?.marker ? <span className="prompt-panel-badge prompt-panel-badge-marker">占位符</span> : null}
                                        {isAbsolute ? <span className="prompt-panel-badge">@深度</span> : null}
                                    </span>
                                </button>
                                <span className="prompt-panel-tokens" title={prompt?.marker ? '上次生成请求中实际注入的 token 数' : '这条提示词内容的 token 数'}>
                                    {typeof state.tokenCounts[entry.identifier] === 'number' ? state.tokenCounts[entry.identifier] : '—'}
                                </span>
                            </div>
                            {expanded ? (
                                <div className="prompt-panel-item-editor">
                                    {prompt?.marker ? (
                                        <div className="prompt-panel-marker-note">占位符 prompt,内容在生成时由运行时注入,不可编辑。</div>
                                    ) : prompt ? (
                                        <>
                                            <div className="prompt-panel-field">
                                                <label className="prompt-panel-field-label">名称</label>
                                                <input
                                                    type="text"
                                                    className="text_pole"
                                                    defaultValue={prompt.name}
                                                    key={`${entry.identifier}:name`}
                                                    onChange={event => bridge.updatePrompt(entry.identifier, { name: event.target.value })}
                                                />
                                            </div>
                                            <div className="prompt-panel-field">
                                                <label className="prompt-panel-field-label">角色</label>
                                                <select
                                                    className="text_pole"
                                                    value={prompt.role ?? 'system'}
                                                    onChange={event => bridge.updatePrompt(entry.identifier, { role: event.target.value })}
                                                >
                                                    {ROLE_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="prompt-panel-field">
                                                <div className="prompt-panel-field-head">
                                                    <label className="prompt-panel-field-label">内容</label>
                                                    <ContractIconButton
                                                        className="prompt-panel-expand"
                                                        label={`放大编辑 ${prompt.name ?? entry.identifier} 内容`}
                                                        nativeTitle
                                                        title="放大编辑"
                                                        icon={<i className="fa-solid fa-expand" aria-hidden="true" />}
                                                        onClick={() => setContentPopup({ id: entry.identifier, draft: prompt.content ?? '' })}
                                                    />
                                                </div>
                                                <textarea
                                                    key={`${entry.identifier}:content`}
                                                    className="text_pole prompt-panel-content"
                                                    defaultValue={prompt.content ?? ''}
                                                    rows={6}
                                                    aria-label={`${prompt.name ?? entry.identifier} 内容`}
                                                    onChange={event => bridge.updatePrompt(entry.identifier, { content: event.target.value })}
                                                />
                                            </div>
                                            <div className="prompt-panel-field">
                                                <label className="prompt-panel-field-label">注入位置</label>
                                                <select
                                                    className="text_pole"
                                                    value={prompt.injection_position ?? INJECTION_POSITION_RELATIVE}
                                                    onChange={event => bridge.updatePrompt(entry.identifier, { injection_position: Number(event.target.value) })}
                                                >
                                                    <option value={INJECTION_POSITION_RELATIVE}>相对位置</option>
                                                    <option value={INJECTION_POSITION_ABSOLUTE}>@ 深度注入</option>
                                                </select>
                                            </div>
                                            {isAbsolute ? (
                                                <div className="prompt-panel-field-pair">
                                                    <div className="prompt-panel-field">
                                                        <label className="prompt-panel-field-label">注入深度</label>
                                                        <input
                                                            type="number"
                                                            className="text_pole"
                                                            min={0}
                                                            key={`${entry.identifier}:depth`}
                                                            defaultValue={prompt.injection_depth ?? 4}
                                                            onChange={event => bridge.updatePrompt(entry.identifier, { injection_depth: Number(event.target.value) })}
                                                        />
                                                    </div>
                                                    <div className="prompt-panel-field">
                                                        <label className="prompt-panel-field-label">注入顺序</label>
                                                        <input
                                                            type="number"
                                                            className="text_pole"
                                                            key={`${entry.identifier}:order`}
                                                            defaultValue={prompt.injection_order ?? 100}
                                                            onChange={event => bridge.updatePrompt(entry.identifier, { injection_order: Number(event.target.value) })}
                                                        />
                                                    </div>
                                                </div>
                                            ) : null}
                                            <div className="prompt-panel-field prompt-panel-field-checks">
                                                <label className="checkbox_label">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(prompt.system_prompt)}
                                                        onChange={event => bridge.updatePrompt(entry.identifier, { system_prompt: event.target.checked })}
                                                    />
                                                    <span>系统提示</span>
                                                </label>
                                                <label className="checkbox_label">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(prompt.forbid_overrides)}
                                                        onChange={event => bridge.updatePrompt(entry.identifier, { forbid_overrides: event.target.checked })}
                                                    />
                                                    <span>禁止角色覆盖</span>
                                                </label>
                                            </div>
                                            <div className="prompt-panel-field">
                                                <label className="prompt-panel-field-label" title="选择这条提示词在哪些生成类型下注入">触发时机</label>
                                                <div className="prompt-panel-trigger-row">
                                                    {triggerOptions.map(option => (
                                                        <label key={option.value} className="checkbox_label">
                                                            <input
                                                                type="checkbox"
                                                                checked={Array.isArray(prompt.injection_trigger) && prompt.injection_trigger.includes(option.value)}
                                                                onChange={event => toggleTrigger(prompt, option.value, event.target.checked)}
                                                            />
                                                            <span>{option.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="prompt-panel-field">
                                                <button
                                                    type="button"
                                                    className="menu_button red_button"
                                                    onClick={() => {
                                                        bridge.deletePrompt(entry.identifier);
                                                        setExpandedId(null);
                                                    }}
                                                >
                                                    <i className="fa-solid fa-trash-can" aria-hidden="true" /> 删除提示词
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="prompt-panel-marker-note">该排序项引用的 prompt 不存在。</div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
                {state.order.length === 0 ? (
                    <div className="prompt-panel-empty">暂无 prompt 排序数据</div>
                ) : null}
            </div>
            {contentPopup ? createPortal(
                <div className="prompt-content-overlay" onClick={() => setContentPopup(null)}>
                    <div
                        className="prompt-content-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`编辑 ${state.promptsById[contentPopup.id]?.name ?? contentPopup.id} 内容`}
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="prompt-content-modal-head">
                            <span className="prompt-content-modal-title">{state.promptsById[contentPopup.id]?.name ?? contentPopup.id} — 内容</span>
                            <ContractIconButton
                                className="right_menu_button"
                                label="关闭"
                                nativeTitle
                                title="关闭"
                                icon={<i className="fa-solid fa-xmark" aria-hidden="true" />}
                                onClick={() => setContentPopup(null)}
                            />
                        </div>
                        <textarea
                            className="text_pole prompt-content-modal-textarea"
                            value={contentPopup.draft}
                            autoFocus
                            onChange={event => setContentPopup({ ...contentPopup, draft: event.target.value })}
                        />
                        <div className="prompt-content-modal-foot">
                            <button
                                type="button"
                                className="menu_button"
                                onClick={() => {
                                    bridge.updatePrompt(contentPopup.id, { content: contentPopup.draft });
                                    setContentPopup(null);
                                }}
                            >
                                保存
                            </button>
                            <button type="button" className="menu_button" onClick={() => setContentPopup(null)}>
                                取消
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            ) : null}
        </div>
    );
}
