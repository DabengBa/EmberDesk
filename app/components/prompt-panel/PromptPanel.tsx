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

export interface PromptPanelPipelineStep {
    id: string;
    /** Binding tool name invoked this round ('' = draft row). */
    tool: string;
    /** Per-round instruction appended to the request tail. */
    prompt: string;
}

export interface PromptPanelState {
    promptsById: Record<string, PromptPanelPrompt>;
    order: PromptPanelOrderEntry[];
    tokenCounts: Record<string, number>;
    presetDirty: boolean;
    presetName?: string;
    /**
     * Trigger tags for the runnable reply-pipeline steps of the active preset
     * (e.g. 'pipeline:review'). Rendered as extra checkboxes in the trigger row.
     */
    pipelineTriggerTags?: string[];
    /** Reply-pipeline rows: order is execution order, last row is the final step. */
    pipeline?: { enabled: boolean; steps: PromptPanelPipelineStep[] };
    /** Enabled non-stealth binding names — suggestions for the tool field. */
    bindingToolNames?: string[];
}

export interface PromptPanelBridge {
    subscribe(listener: () => void): () => void;
    getState(): PromptPanelState;
    setPromptEnabled(identifier: string, enabled: boolean): void;
    movePrompt(identifier: string, targetIndex: number): void;
    updatePrompt(identifier: string, patch: Partial<PromptPanelPrompt>): void;
    addPrompt(): string | null;
    deletePrompt(identifier: string): void;
    setPipelineEnabled(enabled: boolean): void;
    addPipelineStep(): void;
    updatePipelineStep(index: number, patch: Partial<PromptPanelPipelineStep>): void;
    commitPipelineStepTool(index: number, name: string, expected: { presetName?: string; id: string; tool: string }): void;
    deletePipelineStep(index: number): void;
    movePipelineStep(index: number, targetIndex: number): void;
    /**
     * Opens the prompt-inspector overlay (request-level preview of the next
     * send). Owned by the legacy shell; React only triggers it.
     */
    openPromptInspector?(): void;
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

/**
 * "查看 Prompt" header action — opens the prompt-inspector overlay showing
 * the request body the next send would produce (unsent preview).
 */
export function PromptInspectorButton({ bridge }: { bridge: PromptPanelBridge }) {
    return (
        <button
            type="button"
            className="menu_button prompt-panel-add-btn"
            title="预览将要发送给 AI 的请求（不会发送）"
            onClick={() => bridge.openPromptInspector?.()}
        >
            <i className="fa-solid fa-eye" aria-hidden="true" /> 查看 Prompt
        </button>
    );
}

const INJECTION_POSITION_RELATIVE = 0;
const INJECTION_POSITION_ABSOLUTE = 1;

const TRIGGER_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'normal', label: '常规' },
];

interface RowReorderDrag {
    id: string;
    targetId: string | null;
    before: boolean;
    targetIndex: number;
}

/**
 * Shared pointer/keyboard reorder for the prompt list's row lists (prompts
 * and pipeline steps share the same drag-handle + drop-indicator UX). Row
 * elements must carry `data-[idDataKey]` and sit inside the returned
 * `containerRef` element; the drop indicator styles itself through the
 * consumer-rendered `data-drop-position` attribute.
 */
function useRowReorder<T>({ entries, getId, onMove, rowSelector, idDataKey }: {
    /** Ordered entries — also the "order settled" signal (reference change → cancel drag + refocus handle). */
    entries: readonly T[];
    getId: (entry: T) => string;
    onMove: (id: string, targetIndex: number) => void;
    rowSelector: string;
    idDataKey: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pointerRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; x: number; y: number; active: boolean } | null>(null);
    const keyboardFocusRef = useRef<HTMLButtonElement | null>(null);
    const [drag, setDrag] = useState<RowReorderDrag | null>(null);

    const cancelDrag = () => {
        pointerRef.current = null;
        setDrag(null);
    };

    const updateDragTarget = () => {
        const pointer = pointerRef.current;
        const list = containerRef.current;
        if (!pointer?.active || !list) return;
        const bounds = list.getBoundingClientRect();
        const viewport = list.closest<HTMLElement>('.scrollableInner')?.getBoundingClientRect() ?? bounds;
        if (pointer.x < Math.max(bounds.left, viewport.left) || pointer.x > Math.min(bounds.right, viewport.right) || pointer.y < Math.max(bounds.top, viewport.top) || pointer.y > Math.min(bounds.bottom, viewport.bottom)) {
            setDrag(null);
            return;
        }
        const rows = Array.from(list.querySelectorAll<HTMLElement>(rowSelector));
        const target = rows.find(row => pointer.y <= row.getBoundingClientRect().bottom) ?? rows.at(-1);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const before = pointer.y < rect.top + rect.height / 2;
        const targetId = (target.dataset as Record<string, string | undefined>)[idDataKey]!;
        const ids = entries.map(getId);
        const sourceIndex = ids.findIndex(id => id === pointer.id);
        const insertionIndex = ids.findIndex(id => id === targetId) + (before ? 0 : 1);
        const targetIndex = insertionIndex - (sourceIndex < insertionIndex ? 1 : 0);
        const next = { id: pointer.id, targetId, before, targetIndex };
        setDrag(current => current?.targetId === targetId && current.before === before && current.targetIndex === targetIndex ? current : next);
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

    const getDragHandleProps = (id: string, index: number) => ({
        onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            pointerRef.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
        },
        onPointerMove: handlePointerMove,
        onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
            const pointer = pointerRef.current;
            if (!pointer || pointer.pointerId !== event.pointerId) return;
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            const destination = updateDragTarget();
            if (destination) onMove(id, destination.targetIndex);
            cancelDrag();
        },
        onPointerCancel: cancelDrag,
        onLostPointerCapture: cancelDrag,
        onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === 'Escape') cancelDrag();
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            cancelDrag();
            const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
            if (targetIndex < 0 || targetIndex >= entries.length) return;
            keyboardFocusRef.current = event.currentTarget;
            onMove(id, targetIndex);
        },
    });

    // A completed move changes `entries` — release the drag and put focus
    // back on the handle that initiated a keyboard move.
    useEffect(() => {
        cancelDrag();
        keyboardFocusRef.current?.focus({ preventScroll: true });
        keyboardFocusRef.current = null;
    }, [entries]);

    // Escape cancels a live drag; a rAF loop auto-scrolls the panel while the
    // pointer hovers near the list edges.
    useEffect(() => {
        if (!drag) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') cancelDrag();
        };
        const scroller = containerRef.current?.closest<HTMLElement>('.scrollableInner');
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
    }, [drag?.id]);

    return { containerRef, drag, getDragHandleProps };
}

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
    const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
    const [contentPopup, setContentPopup] = useState<{ id: string; draft: string } | null>(null);
    const knownIdsRef = useRef<Set<string> | null>(null);
    const knownStepIdsRef = useRef<Set<string> | null>(null);

    const promptReorder = useRowReorder({
        entries: state.order,
        getId: entry => entry.identifier,
        onMove: (id, targetIndex) => bridge.movePrompt(id, targetIndex),
        rowSelector: '.prompt-panel-item',
        idDataKey: 'promptIdentifier',
    });
    const pipelineSteps = state.pipeline?.steps ?? [];
    const stepReorder = useRowReorder({
        entries: pipelineSteps,
        getId: step => step.id,
        onMove: (id, targetIndex) => {
            const index = pipelineSteps.findIndex(step => step.id === id);
            if (index >= 0) bridge.movePipelineStep(index, targetIndex);
        },
        rowSelector: '.prompt-panel-item',
        idDataKey: 'stepId',
    });

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

    // Auto-expand a freshly added pipeline step so its fields are ready to edit.
    useEffect(() => {
        const ids = new Set(pipelineSteps.map(step => step.id));
        if (knownStepIdsRef.current) {
            for (const id of ids) {
                if (!knownStepIdsRef.current.has(id)) {
                    setExpandedStepId(id);
                }
            }
        }
        knownStepIdsRef.current = ids;
    }, [pipelineSteps]);

    return (
        <div className="prompt-panel-root">
            <div ref={promptReorder.containerRef} className="prompt-panel-list" role="list" aria-label="提示词排序">
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
                            className={`prompt-panel-item${entry.enabled ? '' : ' prompt-panel-item-disabled'}${expanded ? ' prompt-panel-item-expanded' : ''}${promptReorder.drag?.id === entry.identifier ? ' prompt-panel-item-dragging' : ''}`}
                            data-prompt-identifier={entry.identifier}
                            data-drop-position={promptReorder.drag?.targetId === entry.identifier && promptReorder.drag.targetIndex !== index ? (promptReorder.drag.before ? 'before' : 'after') : undefined}
                        >
                            <div className="prompt-panel-item-row">
                                <button
                                    type="button"
                                    className="prompt-panel-drag-handle drag-handle menu-handle"
                                    aria-label={`拖拽排序 ${prompt?.name ?? entry.identifier}`}
                                    title="拖拽调整顺序，也可使用上下方向键"
                                    {...promptReorder.getDragHandleProps(entry.identifier, index)}
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
            <div className="prompt-panel-pipeline">
                <div className="prompt-panel-pipeline-head">
                    <span className="prompt-panel-field-label">回复管线</span>
                    <label className="checkbox_label" title="启用后,一次用户消息按下方顺序执行多轮工具调用">
                        <input
                            type="checkbox"
                            checked={state.pipeline?.enabled ?? false}
                            onChange={event => bridge.setPipelineEnabled(event.target.checked)}
                        />
                        <span>启用</span>
                    </label>
                    <button type="button" className="menu_button" onClick={() => bridge.addPipelineStep()} title="添加一轮工具调用">
                        <i className="fa-solid fa-plus" aria-hidden="true" /> 步骤
                    </button>
                </div>
                <div ref={stepReorder.containerRef} className="prompt-panel-list" role="list" aria-label="管线步骤排序">
                    {pipelineSteps.map((step, index, steps) => {
                        const expanded = expandedStepId === step.id;
                        return (
                            <div
                                key={step.id}
                                className={`prompt-panel-item${expanded ? ' prompt-panel-item-expanded' : ''}${stepReorder.drag?.id === step.id ? ' prompt-panel-item-dragging' : ''}`}
                                data-step-id={step.id}
                                data-drop-position={stepReorder.drag?.targetId === step.id && stepReorder.drag.targetIndex !== index ? (stepReorder.drag.before ? 'before' : 'after') : undefined}
                            >
                                <div className="prompt-panel-item-row prompt-panel-pipeline-item-row">
                                    <button
                                        type="button"
                                        className="prompt-panel-drag-handle drag-handle menu-handle"
                                        aria-label={`拖拽排序 ${step.tool || `第 ${index + 1} 步`}`}
                                        title="拖拽调整顺序，也可使用上下方向键"
                                        {...stepReorder.getDragHandleProps(step.id, index)}
                                    >
                                        <span aria-hidden="true">&#9776;</span>
                                    </button>
                                    <span className="prompt-panel-pipeline-index">{index + 1}</span>
                                    <button
                                        type="button"
                                        className="prompt-panel-item-name"
                                        onClick={() => setExpandedStepId(expanded ? null : step.id)}
                                        title="展开编辑"
                                    >
                                        <span className="prompt-panel-item-name-text">{step.tool || '未命名工具'}</span>
                                        <span className="prompt-panel-item-meta">
                                            {index === steps.length - 1 ? <span className="prompt-panel-badge" title="末行产出正文回复">最终</span> : null}
                                        </span>
                                    </button>
                                </div>
                                {expanded ? (
                                    <div className="prompt-panel-item-editor">
                                        <div className="prompt-panel-field">
                                            <label className="prompt-panel-field-label">工具名</label>
                                            <input
                                                type="text"
                                                className="text_pole prompt-panel-pipeline-tool"
                                                list="prompt-panel-pipeline-tools"
                                                placeholder="该轮必须调用的工具绑定名"
                                                key={JSON.stringify([state.presetName, index, step.id, step.tool])}
                                                defaultValue={step.tool}
                                                onBlur={event => bridge.commitPipelineStepTool(index, event.currentTarget.value, {
                                                    presetName: state.presetName, id: step.id, tool: step.tool,
                                                })}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                                        event.preventDefault();
                                                        event.currentTarget.blur();
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="prompt-panel-field">
                                            <label className="prompt-panel-field-label">步指令</label>
                                            <textarea
                                                className="text_pole prompt-panel-content prompt-panel-pipeline-instruction"
                                                rows={4}
                                                placeholder="该轮注入到请求末尾的指令"
                                                key={`${step.id}:prompt`}
                                                defaultValue={step.prompt}
                                                onChange={event => bridge.updatePipelineStep(index, { prompt: event.target.value })}
                                            />
                                        </div>
                                        <div className="prompt-panel-field">
                                            <button
                                                type="button"
                                                className="menu_button red_button"
                                                onClick={() => {
                                                    bridge.deletePipelineStep(index);
                                                    setExpandedStepId(null);
                                                }}
                                            >
                                                <i className="fa-solid fa-trash-can" aria-hidden="true" /> 删除步骤
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                    {pipelineSteps.length === 0 ? (
                        <div className="prompt-panel-empty">未配置管线步骤——添加一行即多一轮工具调用，顺序即执行顺序</div>
                    ) : null}
                </div>
                <datalist id="prompt-panel-pipeline-tools">
                    {(state.bindingToolNames ?? []).map(name => <option key={name} value={name} />)}
                </datalist>
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
