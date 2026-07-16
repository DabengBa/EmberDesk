import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

export interface WorldInfoReactWorldOption {
    value: string;
    label: string;
    selected?: boolean;
}

export interface WorldInfoReactSortOption {
    value: string;
    label: string;
    hidden?: boolean;
}

export interface WorldInfoReactEntrySummary {
    uid: string;
    title: string;
    disabled?: boolean;
    constant?: boolean;
    keywordsSummary?: string;
    positionLabel?: string;
    order?: number;
    hasSecondaryKeys?: boolean;
    probability?: number;
    useProbability?: boolean;
    group?: string;
    sticky?: number | null;
    cooldown?: number | null;
    delay?: number | null;
}

export interface WorldInfoWorkbenchEntryDetail {
    uid: string;
    comment: string;
    content: string;
    key: string[];
    keysecondary: string[];
    constant: boolean;
    selective: boolean;
    selectiveLogic: number;
    disable: boolean;
    order: number;
    position: number;
    role: number;
    depth: number;
    probability: number;
    useProbability: boolean;
    ignoreBudget: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    delayUntilRecursion: number;
    sticky: number | null;
    cooldown: number | null;
    delay: number | null;
    group: string;
    groupOverride: boolean;
    groupWeight: number;
    scanDepth: number | null;
    caseSensitive: boolean | null;
    matchWholeWords: boolean | null;
    useGroupScoring: boolean | null;
    automationId: string;
    outletName: string;
    matchPersonaDescription: boolean;
    matchCharacterDescription: boolean;
    matchCharacterPersonality: boolean;
    matchCharacterDepthPrompt: boolean;
    matchScenario: boolean;
    matchCreatorNotes: boolean;
    characterFilterNames: string[];
    characterFilterTags: string[];
    characterFilterExclude: boolean;
    triggers: string[];
    vectorized?: boolean;
    positionLabel?: string;
}

export interface WorldInfoWorkspacePanelState {
    globalSelectorPresent?: boolean;
    editorSelectorPresent?: boolean;
    selectorsSeparated?: boolean;
    importMenuPresent?: boolean;
    importBusy?: boolean;
    dropTargetPresent?: boolean;
    worldNames?: WorldInfoReactWorldOption[];
    selectedWorldName?: string;
    selectedWorldIndex?: string;
    entryCount?: number;
    entrySummaries?: WorldInfoReactEntrySummary[];
    searchQuery?: string;
    sortValue?: string;
    sortOptions?: WorldInfoReactSortOption[];
    canCreateEntry?: boolean;
    exportMenuPresent?: boolean;
    createWorldMenuPresent?: boolean;
    refreshMenuPresent?: boolean;
    renameMenuPresent?: boolean;
    duplicateMenuPresent?: boolean;
    deleteMenuPresent?: boolean;
    globalActiveNames?: string[];
    globalActiveCount?: number;
    selectedEntryUid?: string;
    selectedEntry?: WorldInfoWorkbenchEntryDetail | null;
    hasEditorWorld?: boolean;
}

export type WorkspacePanelStatus = 'idle' | 'loading' | 'empty' | 'success' | 'error';

interface WorkspacePanelBridge {
    dispatchAction?: (action: string, payload?: Record<string, unknown>) => Promise<unknown> | unknown;
}

type WorkspacePanelActionMutation = {
    mutate: (input: { action: string; payload?: Record<string, unknown> }) => void;
    isPending: boolean;
};

const worldInfoPanelFormSchema = z.object({
    selectedWorldIndex: z.string(),
    searchQuery: z.string(),
    sortValue: z.string(),
});

const POSITION_OPTIONS = [
    { value: 0, label: '角色定义前' },
    { value: 1, label: '角色定义后' },
    { value: 5, label: '示例消息顶部' },
    { value: 6, label: '示例消息底部' },
    { value: 2, label: '作者注释顶部' },
    { value: 3, label: '作者注释底部' },
    { value: 4, label: '按深度' },
    { value: 7, label: '出口' },
] as const;

const SELECTIVE_LOGIC_OPTIONS = [
    { value: 0, label: '满足任一 (AND ANY)' },
    { value: 3, label: '满足全部 (AND ALL)' },
    { value: 2, label: '排除任一 (NOT ANY)' },
    { value: 1, label: '排除全部 (NOT ALL)' },
] as const;

function joinKeywords(values: string[] | undefined): string {
    return Array.isArray(values) ? values.filter(Boolean).join(', ') : '';
}

function splitKeywords(value: string): string[] {
    return String(value || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function isAdvancedDefault(entry: WorldInfoWorkbenchEntryDetail | null | undefined): {
    timing: boolean;
    scope: boolean;
    group: boolean;
    automation: boolean;
} {
    if (!entry) {
        return { timing: false, scope: false, group: false, automation: false };
    }
    return {
        timing: Boolean(entry.sticky || entry.cooldown || entry.delay || entry.delayUntilRecursion || entry.excludeRecursion || entry.preventRecursion),
        scope: Boolean(
            entry.matchPersonaDescription
            || entry.matchCharacterDescription
            || entry.matchCharacterPersonality
            || entry.matchCharacterDepthPrompt
            || entry.matchScenario
            || entry.matchCreatorNotes
            || entry.characterFilterNames.length
            || entry.characterFilterTags.length,
        ),
        group: Boolean(entry.group || entry.groupOverride),
        automation: Boolean(entry.automationId || entry.triggers.length || entry.outletName),
    };
}

function buildAdvancedSummary(entry: WorldInfoWorkbenchEntryDetail | null | undefined): string {
    if (!entry) {
        return '';
    }
    const parts: string[] = [];
    const flags = isAdvancedDefault(entry);
    if (flags.timing) {
        const timing: string[] = [];
        if (entry.sticky) timing.push(`Sticky ${entry.sticky}`);
        if (entry.cooldown) timing.push(`Cooldown ${entry.cooldown}`);
        if (entry.delay) timing.push(`Delay ${entry.delay}`);
        parts.push(timing.join(' · ') || 'Timing configured');
    }
    if (flags.scope) {
        parts.push('Scope filters');
    }
    if (flags.group) {
        parts.push(entry.group ? `Group: ${entry.group}` : 'Inclusion group');
    }
    if (flags.automation) {
        parts.push(entry.automationId ? `Automation: ${entry.automationId}` : 'Automation');
    }
    return parts.join(' · ');
}

export function buildWorldInfoPanelFormDefaults(state: WorldInfoWorkspacePanelState) {
    return {
        selectedWorldIndex: state.selectedWorldIndex ?? '',
        searchQuery: state.searchQuery ?? '',
        sortValue: state.sortValue ?? '',
    };
}

export function getWorldInfoPanelStatus(bridgeState: WorldInfoWorkspacePanelState): WorkspacePanelStatus {
    if (!bridgeState.editorSelectorPresent && !bridgeState.importMenuPresent) {
        return 'error';
    }
    return 'success';
}

function AdvancedSection({
    id,
    title,
    summary,
    defaultOpen = false,
    children,
}: {
    id: string;
    title: string;
    summary?: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    return (
        <details className="wi-workbench-advanced" data-world-info-react-advanced={id} open={defaultOpen || Boolean(summary)}>
            <summary className="wi-workbench-advanced-summary">
                <span>{title}</span>
                {summary ? <span className="wi-workbench-advanced-chip">{summary}</span> : null}
            </summary>
            <div className="wi-workbench-advanced-body">{children}</div>
        </details>
    );
}

function EntryEditor({
    entry,
    actionMutation,
    onBack,
    emptyMessage = '选择一条条目开始编辑',
}: {
    entry: WorldInfoWorkbenchEntryDetail | null;
    actionMutation: WorkspacePanelActionMutation;
    onBack?: () => void;
    emptyMessage?: string;
}) {
    const [draft, setDraft] = useState(entry);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const advanced = isAdvancedDefault(entry);
    const entryUid = entry?.uid;
    const focusTitleOnOpen = Boolean(onBack);

    useEffect(() => {
        setDraft(entry);
    }, [entry]);

    useEffect(() => {
        if (!entryUid || !focusTitleOnOpen) {
            return undefined;
        }

        const frame = requestAnimationFrame(() => titleInputRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [entryUid, focusTitleOnOpen]);

    if (!entry || !draft) {
        return (
            <div className="wi-workbench-editor empty" data-world-info-react-editor="empty">
                <p>{emptyMessage}</p>
            </div>
        );
    }

    const saveFields = (fields: Record<string, unknown>) => {
        setDraft(current => current ? { ...current, ...fields } as WorldInfoWorkbenchEntryDetail : current);
        actionMutation.mutate({
            action: 'updateEntryFields',
            payload: { uid: entry.uid, fields },
        });
    };

    return (
        <div className="wi-workbench-editor" data-world-info-react-editor="active" data-world-info-react-entry-uid={entry.uid}>
            {onBack ? (
                <button
                    type="button"
                    className="menu_button wi-workbench-back"
                    data-world-info-react-action="back-to-list"
                    onClick={onBack}
                >
                    返回条目列表
                </button>
            ) : null}

            <section className="wi-workbench-editor-section" data-world-info-react-section="basic">
                <header>
                    <h4>基本信息</h4>
                </header>
                <label className="wi-workbench-field">
                    <span>标题</span>
                    <input
                        className="text_pole"
                        ref={titleInputRef}
                        autoFocus={focusTitleOnOpen}
                        value={draft.comment}
                        data-world-info-react-field="comment"
                        onChange={event => setDraft({ ...draft, comment: event.target.value })}
                        onBlur={event => saveFields({ comment: event.target.value })}
                    />
                </label>
                <div className="wi-workbench-inline-fields">
                    <label className="checkbox_label">
                        <input
                            type="checkbox"
                            checked={!draft.disable}
                            data-world-info-react-field="enabled"
                            onChange={event => saveFields({ disable: !event.target.checked })}
                        />
                        <span>{draft.disable ? '已停用' : '已启用'}</span>
                    </label>
                    <label className="checkbox_label">
                        <input
                            type="checkbox"
                            checked={draft.constant}
                            data-world-info-react-field="constant"
                            onChange={event => saveFields({ constant: event.target.checked })}
                        />
                        <span>{draft.constant ? '始终注入' : '关键词触发'}</span>
                    </label>
                </div>
            </section>

            <section className="wi-workbench-editor-section" data-world-info-react-section="trigger">
                <header>
                    <h4>何时触发</h4>
                </header>
                {!draft.constant ? (
                    <>
                        <label className="wi-workbench-field">
                            <span>主要关键词</span>
                            <input
                                className="text_pole"
                                value={joinKeywords(draft.key)}
                                data-world-info-react-field="key"
                                onChange={event => setDraft({ ...draft, key: splitKeywords(event.target.value) })}
                                onBlur={event => saveFields({ key: splitKeywords(event.target.value) })}
                            />
                        </label>
                        <label className="wi-workbench-field">
                            <span>可选条件</span>
                            <input
                                className="text_pole"
                                value={joinKeywords(draft.keysecondary)}
                                data-world-info-react-field="keysecondary"
                                onChange={event => setDraft({ ...draft, keysecondary: splitKeywords(event.target.value) })}
                                onBlur={event => saveFields({ keysecondary: splitKeywords(event.target.value) })}
                            />
                        </label>
                        <label className="wi-workbench-field">
                            <span>逻辑</span>
                            <select
                                className="text_pole"
                                value={String(draft.selectiveLogic)}
                                data-world-info-react-field="selectiveLogic"
                                onChange={event => saveFields({ selectiveLogic: Number(event.target.value) })}
                            >
                                {SELECTIVE_LOGIC_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                    </>
                ) : (
                    <p className="opacity50">始终注入条目会跳过关键词匹配。</p>
                )}
            </section>

            <section className="wi-workbench-editor-section" data-world-info-react-section="content">
                <header>
                    <h4>注入内容</h4>
                </header>
                <textarea
                    className="text_pole wi-workbench-content"
                    value={draft.content}
                    data-world-info-react-field="content"
                    rows={12}
                    onChange={event => setDraft({ ...draft, content: event.target.value })}
                    onBlur={event => saveFields({ content: event.target.value })}
                />
            </section>

            <section className="wi-workbench-editor-section" data-world-info-react-section="placement">
                <header>
                    <h4>注入位置</h4>
                </header>
                <label className="wi-workbench-field">
                    <span>位置</span>
                    <select
                        className="text_pole"
                        value={String(draft.position)}
                        data-world-info-react-field="position"
                        onChange={event => saveFields({ position: Number(event.target.value) })}
                    >
                        {POSITION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
                <div className="wi-workbench-inline-fields">
                    <label className="wi-workbench-field">
                        <span>顺序</span>
                        <input
                            className="text_pole"
                            type="number"
                            value={draft.order}
                            data-world-info-react-field="order"
                            onChange={event => setDraft({ ...draft, order: Number(event.target.value) })}
                            onBlur={event => saveFields({ order: Number(event.target.value) })}
                        />
                    </label>
                    {draft.position === 4 ? (
                        <label className="wi-workbench-field">
                            <span>深度</span>
                            <input
                                className="text_pole"
                                type="number"
                                value={draft.depth}
                                data-world-info-react-field="depth"
                                onChange={event => setDraft({ ...draft, depth: Number(event.target.value) })}
                                onBlur={event => saveFields({ depth: Number(event.target.value) })}
                            />
                        </label>
                    ) : null}
                    <label className="wi-workbench-field">
                        <span>概率</span>
                        <input
                            className="text_pole"
                            type="number"
                            min={0}
                            max={100}
                            value={draft.probability}
                            data-world-info-react-field="probability"
                            onChange={event => setDraft({ ...draft, probability: Number(event.target.value) })}
                            onBlur={event => saveFields({ probability: Number(event.target.value), useProbability: true })}
                        />
                    </label>
                </div>
            </section>

            <section className="wi-workbench-editor-section" data-world-info-react-section="advanced">
                <header>
                    <h4>高级设置</h4>
                    {buildAdvancedSummary(entry) ? (
                        <span className="wi-workbench-advanced-chip">{buildAdvancedSummary(entry)}</span>
                    ) : null}
                </header>
                <AdvancedSection id="timing" title="递归与时序" summary={advanced.timing ? buildAdvancedSummary(entry).split(' · ')[0] : ''}>
                    <div className="wi-workbench-inline-fields">
                        <label className="wi-workbench-field">
                            <span>黏性</span>
                            <input className="text_pole" type="number" value={draft.sticky ?? ''} data-world-info-react-field="sticky"
                                onBlur={event => saveFields({ sticky: event.target.value === '' ? null : Number(event.target.value) })}
                                onChange={event => setDraft({ ...draft, sticky: event.target.value === '' ? null : Number(event.target.value) })}
                            />
                        </label>
                        <label className="wi-workbench-field">
                            <span>冷却</span>
                            <input className="text_pole" type="number" value={draft.cooldown ?? ''} data-world-info-react-field="cooldown"
                                onBlur={event => saveFields({ cooldown: event.target.value === '' ? null : Number(event.target.value) })}
                                onChange={event => setDraft({ ...draft, cooldown: event.target.value === '' ? null : Number(event.target.value) })}
                            />
                        </label>
                        <label className="wi-workbench-field">
                            <span>延迟</span>
                            <input className="text_pole" type="number" value={draft.delay ?? ''} data-world-info-react-field="delay"
                                onBlur={event => saveFields({ delay: event.target.value === '' ? null : Number(event.target.value) })}
                                onChange={event => setDraft({ ...draft, delay: event.target.value === '' ? null : Number(event.target.value) })}
                            />
                        </label>
                    </div>
                    <div className="wi-workbench-inline-fields">
                        <label className="checkbox_label">
                            <input type="checkbox" checked={draft.excludeRecursion} data-world-info-react-field="excludeRecursion"
                                onChange={event => saveFields({ excludeRecursion: event.target.checked })} />
                            <span>排除递归</span>
                        </label>
                        <label className="checkbox_label">
                            <input type="checkbox" checked={draft.preventRecursion} data-world-info-react-field="preventRecursion"
                                onChange={event => saveFields({ preventRecursion: event.target.checked })} />
                            <span>阻止递归</span>
                        </label>
                    </div>
                </AdvancedSection>
                <AdvancedSection id="group" title="包含组" summary={advanced.group ? (entry.group ? `组：${entry.group}` : '已配置') : ''}>
                    <label className="wi-workbench-field">
                        <span>组名</span>
                        <input className="text_pole" value={draft.group} data-world-info-react-field="group"
                            onChange={event => setDraft({ ...draft, group: event.target.value })}
                            onBlur={event => saveFields({ group: event.target.value })}
                        />
                    </label>
                    <label className="checkbox_label">
                        <input type="checkbox" checked={draft.groupOverride} data-world-info-react-field="groupOverride"
                            onChange={event => saveFields({ groupOverride: event.target.checked })} />
                        <span>优先覆盖</span>
                    </label>
                </AdvancedSection>
                <AdvancedSection id="automation" title="自动化与 Outlet" summary={advanced.automation ? (entry.automationId || entry.outletName || '已配置') : ''}>
                    <label className="wi-workbench-field">
                        <span>自动化 ID</span>
                        <input className="text_pole" value={draft.automationId} data-world-info-react-field="automationId"
                            onChange={event => setDraft({ ...draft, automationId: event.target.value })}
                            onBlur={event => saveFields({ automationId: event.target.value })}
                        />
                    </label>
                    <label className="wi-workbench-field">
                        <span>出口</span>
                        <input className="text_pole" value={draft.outletName} data-world-info-react-field="outletName"
                            onChange={event => setDraft({ ...draft, outletName: event.target.value })}
                            onBlur={event => saveFields({ outletName: event.target.value })}
                        />
                    </label>
                </AdvancedSection>
            </section>
        </div>
    );
}

export function WorldInfoWorkbenchPanel({
    state,
    bridge,
    shell,
}: {
    state?: unknown;
    bridge?: WorkspacePanelBridge;
    shell: (props: {
        status: WorkspacePanelStatus;
        recoveryActions: Array<{ id: string; label: string; disabled?: boolean; onClick: () => void }>;
        children: ReactNode;
    }) => ReactNode;
}) {
    const bridgeState = (state && typeof state === 'object' ? state : {}) as WorldInfoWorkspacePanelState;
    const status = getWorldInfoPanelStatus(bridgeState);
    const formDefaults = useMemo(() => buildWorldInfoPanelFormDefaults(bridgeState), [bridgeState]);
    const worldInfoForm = useForm({
        defaultValues: formDefaults,
        validators: { onChange: worldInfoPanelFormSchema },
    });
    const worldInfoActionMutation = useMutation({
        mutationFn: async ({ action, payload }: { action: string; payload?: Record<string, unknown> }) => {
            await bridge?.dispatchAction?.(action, payload);
        },
        retry: false,
    });
    const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
    const [activationOpen, setActivationOpen] = useState(false);
    const [listScrollTop, setListScrollTop] = useState(0);
    const [returnEntryUid, setReturnEntryUid] = useState('');
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }
        const media = window.matchMedia('(max-width: 768px)');
        const sync = () => setIsNarrow(Boolean(media.matches));
        sync();
        media.addEventListener?.('change', sync);
        return () => media.removeEventListener?.('change', sync);
    }, []);

    useEffect(() => {
        worldInfoForm.reset(formDefaults);
    }, [formDefaults, worldInfoForm]);

    useEffect(() => {
        if (!bridgeState.selectedEntryUid) {
            setMobileView('list');
        }
    }, [bridgeState.selectedEntryUid]);

    const worldNames = bridgeState.worldNames ?? [];
    const sortOptions = bridgeState.sortOptions ?? [];
    const entrySummaries = bridgeState.entrySummaries ?? [];
    const selectedWorldName = bridgeState.selectedWorldName || '';
    const globalNames = bridgeState.globalActiveNames ?? [];
    const globalCount = bridgeState.globalActiveCount ?? globalNames.length;
    const recoveryActions: Array<{ id: string; label: string; disabled?: boolean; onClick: () => void }> = [];

    if (status === 'error' && bridgeState.refreshMenuPresent) {
        recoveryActions.push({
            id: 'refresh-world',
            label: '刷新面板',
            onClick: () => worldInfoActionMutation.mutate({ action: 'refreshWorld' }),
        });
    }

    const openEntry = (uid: string) => {
        const list = document.querySelector('[data-world-info-react-list-scroll]') as HTMLElement | null;
        if (list) {
            setListScrollTop(list.scrollTop);
        }
        setReturnEntryUid(uid);
        worldInfoActionMutation.mutate({ action: 'openEntry', payload: { uid } });
        if (isNarrow) {
            setMobileView('editor');
        }
    };

    const backToList = () => {
        worldInfoActionMutation.mutate({ action: 'clearSelectedEntry' });
        setMobileView('list');
        requestAnimationFrame(() => {
            const list = document.querySelector('[data-world-info-react-list-scroll]') as HTMLElement | null;
            if (list) {
                list.scrollTop = listScrollTop;
                const trigger = Array.from(document.querySelectorAll('[data-world-info-react-entry]'))
                    .find(element => element.getAttribute('data-world-info-react-entry') === returnEntryUid);
                if (trigger instanceof HTMLElement) {
                    trigger.focus();
                } else {
                    list.focus();
                }
            }
        });
    };

    const showListPane = !isNarrow || mobileView === 'list';
    const showEditorPane = !isNarrow || mobileView === 'editor';

    const globalSummary = globalCount === 0
        ? '未启用全局世界书'
        : `全局启用：${globalNames.slice(0, 3).join('、')}${globalNames.length > 3 ? ` 等 ${globalCount} 本` : ''}`;

    return shell({
        status,
        recoveryActions,
        children: (
            <div
                className="wi-workbench-root"
                data-world-info-react-workflow="workbench"
                data-world-info-react-mobile-view={mobileView}
                data-doc-id="feature.world_info_panel"
            >
                <div className="wi-workbench-global" data-world-info-react-global="summary">
                    <div className="wi-workbench-global-summary">
                        <span>{globalSummary}</span>
                        <button
                            type="button"
                            className="menu_button"
                            data-world-info-react-action="toggle-activation-rules"
                            aria-expanded={activationOpen}
                            onClick={() => {
                                const next = !activationOpen;
                                setActivationOpen(next);
                                worldInfoActionMutation.mutate({
                                    action: 'toggleActivationRules',
                                    payload: { open: next },
                                });
                            }}
                        >
                            扫描规则
                        </button>
                    </div>
                    {activationOpen ? (
                        <p className="wi-workbench-global-hint opacity50" data-world-info-react-global="rules-hint">
                            已展开全局扫描规则（仍由既有激活控件承载，不复制第二套状态机）。
                        </p>
                    ) : null}
                </div>

                <header className="wi-workbench-book-header" data-world-info-react-header="editor-book">
                    <div className="wi-workbench-book-title-row">
                        <worldInfoForm.Field name="selectedWorldIndex">
                            {field => (
                                <select
                                    className="text_pole"
                                    data-world-info-react-control="world-select"
                                    aria-label="选择要编辑的世界书"
                                    value={field.state.value}
                                    onChange={event => {
                                        const worldIndex = event.target.value;
                                        field.handleChange(worldIndex);
                                        worldInfoActionMutation.mutate({ action: 'selectWorld', payload: { worldIndex } });
                                        setMobileView('list');
                                    }}
                                >
                                    <option value="">选择世界书…</option>
                                    {worldNames.map(world => (
                                        <option key={world.value} value={world.value}>{world.label}</option>
                                    ))}
                                </select>
                            )}
                        </worldInfoForm.Field>
                        <output className="wi-workbench-book-meta" data-world-info-react-meta="entry-count">
                            {selectedWorldName ? `${bridgeState.entryCount ?? entrySummaries.length} 条目` : '未选择'}
                        </output>
                    </div>
                    <div className="wi-workbench-book-tools">
                        {selectedWorldName ? (
                            <>
                                <worldInfoForm.Field name="searchQuery">
                                    {field => (
                                        <input
                                            className="text_pole"
                                            type="search"
                                            data-world-info-react-control="search"
                                            aria-label="搜索条目"
                                            placeholder="搜索"
                                            value={field.state.value}
                                            onChange={event => {
                                                const searchQuery = event.target.value;
                                                field.handleChange(searchQuery);
                                                worldInfoActionMutation.mutate({ action: 'applySearchQuery', payload: { searchQuery } });
                                            }}
                                        />
                                    )}
                                </worldInfoForm.Field>
                                <worldInfoForm.Field name="sortValue">
                                    {field => (
                                        <select
                                            className="text_pole"
                                            data-world-info-react-control="sort"
                                            aria-label="排序"
                                            value={field.state.value}
                                            onChange={event => {
                                                const sortValue = event.target.value;
                                                field.handleChange(sortValue);
                                                worldInfoActionMutation.mutate({ action: 'applySortOption', payload: { sortValue } });
                                            }}
                                        >
                                            {sortOptions.filter(option => !option.hidden).map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    )}
                                </worldInfoForm.Field>
                                <button
                                    type="button"
                                    className="menu_button"
                                    data-world-info-react-action="new-entry"
                                    disabled={!bridgeState.canCreateEntry}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'createEntry' })}
                                >
                                    新建条目
                                </button>
                                <button type="button" className="menu_button" data-world-info-react-action="new-world"
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'createWorld' })}>新建</button>
                                <button type="button" className="menu_button" data-world-info-react-action="import"
                                    disabled={Boolean(bridgeState.importBusy)}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'importWorld' })}>导入</button>
                                <button type="button" className="menu_button" data-world-info-react-action="export"
                                    disabled={!bridgeState.exportMenuPresent}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'exportWorld' })}>导出</button>
                                <button type="button" className="menu_button" data-world-info-react-action="refresh"
                                    disabled={!bridgeState.refreshMenuPresent}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'refreshWorld' })}>刷新</button>
                                <button type="button" className="menu_button" data-world-info-react-action="rename"
                                    disabled={!bridgeState.renameMenuPresent}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'renameWorld' })}>重命名</button>
                                <button type="button" className="menu_button" data-world-info-react-action="duplicate"
                                    disabled={!bridgeState.duplicateMenuPresent}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'duplicateWorld' })}>复制</button>
                                <button type="button" className="menu_button redWarningBG" data-world-info-react-action="delete"
                                    disabled={!bridgeState.deleteMenuPresent}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'deleteWorld' })}>删除</button>
                            </>
                        ) : (
                            <>
                                <button type="button" className="menu_button" data-world-info-react-action="new-world"
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'createWorld' })}>新建世界书</button>
                                <button type="button" className="menu_button" data-world-info-react-action="import"
                                    disabled={Boolean(bridgeState.importBusy)}
                                    onClick={() => worldInfoActionMutation.mutate({ action: 'importWorld' })}>导入世界书</button>
                            </>
                        )}
                    </div>
                </header>

                <div className="wi-workbench-body" data-world-info-react-layout="split">
                    <div
                        className="wi-workbench-list-pane"
                        data-world-info-react-pane="list"
                        hidden={!showListPane}
                    >
                        <div
                            className="wi-workbench-list"
                            data-world-info-react-list-scroll
                            tabIndex={-1}
                        >
                            {entrySummaries.length > 0 ? entrySummaries.map(entry => (
                                <button
                                    key={entry.uid}
                                    type="button"
                                    className={`wi-workbench-entry-row${bridgeState.selectedEntryUid === entry.uid ? ' is-selected' : ''}`}
                                    data-world-info-react-entry={entry.uid}
                                    aria-current={bridgeState.selectedEntryUid === entry.uid ? 'true' : undefined}
                                    onClick={() => openEntry(entry.uid)}
                                >
                                    <span className="wi-workbench-entry-title">
                                        <span className={`wi-workbench-entry-state${entry.disabled ? ' is-disabled' : ''}`}>
                                            {entry.disabled ? '停用' : '启用'}
                                        </span>
                                        {entry.title}
                                    </span>
                                    <span className="wi-workbench-entry-meta">
                                        {entry.keywordsSummary || '无关键词'}
                                    </span>
                                    <span className="wi-workbench-entry-meta">
                                        {entry.positionLabel || '位置未设'}
                                    </span>
                                </button>
                            )) : (
                                <div className="wi-workbench-empty" data-world-info-react-empty="entries">
                                    {selectedWorldName ? '此世界书还没有条目' : '请先选择或创建世界书'}
                                </div>
                            )}
                        </div>
                    </div>
                    <div
                        className="wi-workbench-editor-pane"
                        data-world-info-react-pane="editor"
                        hidden={!showEditorPane}
                        data-world-info-react-editor-visible={showEditorPane || undefined}
                    >
                        <EntryEditor
                            entry={bridgeState.selectedEntry ?? null}
                            actionMutation={worldInfoActionMutation}
                            onBack={isNarrow && mobileView === 'editor' ? backToList : undefined}
                            emptyMessage={selectedWorldName ? '选择一条条目开始编辑' : '请先选择或创建世界书'}
                        />
                    </div>
                </div>
            </div>
        ),
    });
}
