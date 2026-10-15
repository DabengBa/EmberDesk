import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import * as stylex from '@stylexjs/stylex';
import type { CompiledStyles } from '@stylexjs/stylex';
import {
    buildWorldInfoPanelFormDefaults,
    countRegexKeywords,
    getWorldInfoPanelStatus,
} from './lib/world-info-workbench-helpers';
import { worldInfoWorkbenchStyles as s } from '@/styles/world-info-workbench.styles';
import { TagChipInput } from '@/components/fields/TagChipInput';
import type { WorldInfoCommands } from './compat/workspace-commands';
import { translate } from './compat/i18n.js';

function parseFiniteNumber(value: string): number | undefined {
    if (value.trim() === '') {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

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
    matchCharacterDescription: boolean;
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
    scanDepth?: number | null;
    selectedEntryUid?: string;
    selectedEntry?: WorldInfoWorkbenchEntryDetail | null;
    hasEditorWorld?: boolean;
}

export type WorkspacePanelStatus = 'idle' | 'loading' | 'empty' | 'success' | 'error';

const worldInfoPanelFormSchema = z.object({
    selectedWorldIndex: z.string(),
    searchQuery: z.string(),
    sortValue: z.string(),
});

const POSITION_OPTIONS = [
    { value: 0, label: '世界书' },
    { value: 4, label: '按深度' },
] as const;

const MAX_KEYWORD_CHIPS = 4;

/** Split a joined keyword summary back into chip tokens for list display. */
function keywordChips(entry: WorldInfoReactEntrySummary): string[] {
    if (entry.constant) {
        return [];
    }
    const raw = String(entry.keywordsSummary ?? '').trim();
    if (!raw || raw === 'No keywords') {
        return [];
    }
    return raw.split(',').map(part => part.trim()).filter(Boolean);
}

type StyleArg = null | undefined | boolean | CompiledStyles;

function buttonClass(...styles: StyleArg[]): string {
    return `menu_button ${stylex.props(...styles).className ?? ''}`;
}

function iconClass(faIcon: string, ...styles: StyleArg[]): string {
    return `fa-solid ${faIcon} ${stylex.props(...styles).className ?? ''}`;
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
    return (
        <header {...stylex.props(s.editorSectionHeader)}>
            <i className={iconClass(icon, s.sectionIcon)} aria-hidden="true" />
            <h4 {...stylex.props(s.editorSectionTitle)}>{title}</h4>
            <span {...stylex.props(s.sectionRule)} aria-hidden="true" />
        </header>
    );
}

function KeywordField({
    label,
    values,
    field,
    onCommit,
}: {
    label: string;
    values: string[];
    field: string;
    onCommit: (values: string[]) => void;
}) {
    return (
        <div {...stylex.props(s.field)}>
            <span {...stylex.props(s.fieldLabel)}>{label}</span>
            <TagChipInput
                values={values}
                placeholder="输入关键词，回车添加"
                inputAriaLabel={`${label}（回车或逗号添加）`}
                removeAriaLabel={keyword => `移除关键词 ${keyword}`}
                inputProps={{ 'data-world-info-react-field': field }}
                onCommit={onCommit}
            />
        </div>
    );
}

/**
 * Overflow menu for secondary book-level actions (rename, duplicate, and the
 * maintenance pair). Keeps the command bar compact; items mount on open only
 * since commands ride React props, not delegated document handlers.
 */
function BookActionsMenu({
    commands,
    runCommand,
}: {
    commands: WorldInfoCommands;
    runCommand: (command: () => Promise<unknown> | unknown) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, [open]);

    const onMenuKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            rootRef.current?.querySelector<HTMLElement>('[data-world-info-react-menu-trigger]')?.focus();
        }
    };

    const run = (command: () => Promise<unknown> | unknown) => {
        setOpen(false);
        runCommand(command);
    };

    return (
        <div ref={rootRef} {...stylex.props(s.menuWrap)} role="presentation" onKeyDown={onMenuKeyDown}>
            <button
                type="button"
                className={buttonClass(s.button, s.buttonGhost, s.buttonIcon)}
                title="更多书本操作"
                aria-label="更多书本操作"
                aria-haspopup="menu"
                aria-expanded={open}
                data-world-info-react-menu-trigger="book-actions"
                onClick={() => setOpen(value => !value)}
            >
                <i className={iconClass('fa-ellipsis', s.buttonIconSlot)} aria-hidden="true" />
            </button>
            {/* Menu items close the menu themselves via run(); the container only
                needs programmatic focus for the wrapper's Escape handling. */}
            {open ? (
                <div {...stylex.props(s.menu)} role="menu" tabIndex={-1}>
                    <button
                        type="button"
                        {...stylex.props(s.menuItem)}
                        role="menuitem"
                        data-world-info-react-action="rename"
                        onClick={() => run(() => commands.renameWorld())}
                    >
                        <i className={iconClass('fa-pencil', s.menuItemIcon)} aria-hidden="true" />
                        重命名
                    </button>
                    <button
                        type="button"
                        {...stylex.props(s.menuItem)}
                        role="menuitem"
                        data-world-info-react-action="duplicate"
                        onClick={() => run(() => commands.duplicateWorld())}
                    >
                        <i className={iconClass('fa-copy', s.menuItemIcon)} aria-hidden="true" />
                        复制
                    </button>
                    <div {...stylex.props(s.menuSeparator)} aria-hidden="true" />
                    <button
                        type="button"
                        {...stylex.props(s.menuItem)}
                        role="menuitem"
                        data-world-info-react-action="backfill-memos"
                        title="将空标题回填为主关键词"
                        onClick={() => run(() => commands.backfillMemos())}
                    >
                        <i className={iconClass('fa-notes-medical', s.menuItemIcon)} aria-hidden="true" />
                        回填标题
                    </button>
                    <button
                        type="button"
                        {...stylex.props(s.menuItem)}
                        role="menuitem"
                        data-world-info-react-action="apply-sorting"
                        title="将当前排序写入 Order 字段"
                        onClick={() => run(() => commands.applyCurrentSorting())}
                    >
                        <i className={iconClass('fa-arrow-down-9-1', s.menuItemIcon)} aria-hidden="true" />
                        应用排序
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function EntryRowContent({
    entry,
    enabledOverride,
    onToggleEnabled,
}: {
    entry: WorldInfoReactEntrySummary;
    enabledOverride?: boolean;
    onToggleEnabled: (uid: string, enabled: boolean) => void;
}) {
    const chips = keywordChips(entry);
    const shownChips = chips.slice(0, MAX_KEYWORD_CHIPS);
    const overflowCount = chips.length - shownChips.length;
    const showProbability = entry.useProbability !== false && Number(entry.probability ?? 100) < 100;
    const enabled = enabledOverride ?? !entry.disabled;

    return (
        <span {...stylex.props(s.entryRowContent)}>
            <span {...stylex.props(s.entryTitleRow)}>
                <button
                    type="button"
                    {...stylex.props(s.entryToggle, enabled ? s.entryToggleOn : null)}
                    role="switch"
                    aria-checked={enabled}
                    title={enabled ? '点击停用此条目' : '点击启用此条目'}
                    aria-label={enabled ? `停用条目 ${entry.title}` : `启用条目 ${entry.title}`}
                    data-world-info-react-entry-toggle={entry.uid}
                    onClick={event => {
                        event.stopPropagation();
                        onToggleEnabled(entry.uid, !enabled);
                    }}
                >
                    <span {...stylex.props(s.entryToggleKnob, enabled ? s.entryToggleKnobOn : null)} aria-hidden="true" />
                </button>
                <span {...stylex.props(s.entryTitle)}>{entry.title}</span>
                {entry.constant ? (
                    <span {...stylex.props(s.constantBadge)}>常驻</span>
                ) : null}
                <span {...stylex.props(s.entryMetaRight)}>
                    {!entry.constant ? (
                        <span {...stylex.props(s.metaTag)}>{entry.positionLabel || '未设位置'}</span>
                    ) : null}
                    <span {...stylex.props(s.metaTag)}>#{entry.order ?? 0}</span>
                    {showProbability ? (
                        <span {...stylex.props(s.metaTag, s.metaTagAccent)}>{entry.probability}%</span>
                    ) : null}
                </span>
            </span>
            <span {...stylex.props(s.entryChips)}>
                {entry.constant ? (
                    <span {...stylex.props(s.chip, s.chipMuted)}>始终注入</span>
                ) : shownChips.length > 0 ? (
                    <>
                        {shownChips.map(chip => (
                            <span key={chip} {...stylex.props(s.chip)}>{chip}</span>
                        ))}
                        {overflowCount > 0 ? (
                            <span {...stylex.props(s.chip, s.chipMore)}>+{overflowCount}</span>
                        ) : null}
                    </>
                ) : (
                    <span {...stylex.props(s.chip, s.chipMuted)}>无关键词</span>
                )}
            </span>
        </span>
    );
}

function EntryEditor({
    entry,
    commands,
    onBack,
    emptyMessage = '选择一条条目开始编辑',
}: {
    entry: WorldInfoWorkbenchEntryDetail | null;
    commands: WorldInfoCommands;
    onBack?: () => void;
    emptyMessage?: string;
}) {
    const [draft, setDraft] = useState(entry);
    const [draftEntry, setDraftEntry] = useState(entry);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const saveSeqRef = useRef(0);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const pendingFieldsRef = useRef<Record<string, unknown>>({});
    const entryUid = entry?.uid;
    const focusTitleOnOpen = Boolean(onBack);
    const regexKeywordCount = countRegexKeywords(draft?.key ?? []);

    // Sync draft in render (not an effect) so the editor fields mount in the
    // same commit that delivers the entry — a downstream focus effect must not
    // find an unmounted input on its animation frame.
    if (draftEntry !== entry) {
        if (draftEntry?.uid !== entry?.uid) {
            pendingFieldsRef.current = {};
            saveSeqRef.current++;
            setSaveState('idle');
        }
        setDraftEntry(entry);
        setDraft(entry ? { ...entry, ...pendingFieldsRef.current } as WorldInfoWorkbenchEntryDetail : null);
    }

    useEffect(() => {
        if (!entryUid || !focusTitleOnOpen) {
            return undefined;
        }

        const frame = requestAnimationFrame(() => titleInputRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [entryUid, focusTitleOnOpen]);

    if (!entry || !draft) {
        return (
            <div {...stylex.props(s.editor, s.editorEmpty)} data-world-info-react-editor="empty">
                <i className={iconClass('fa-pen-to-square', s.emptyIcon)} aria-hidden="true" />
                <p>{emptyMessage}</p>
            </div>
        );
    }

    const saveFields = (fields: Record<string, unknown>) => {
        setDraft(current => current ? { ...current, ...fields } as WorldInfoWorkbenchEntryDetail : current);
        pendingFieldsRef.current = { ...pendingFieldsRef.current, ...fields };
        const seq = ++saveSeqRef.current;
        setSaveState('saving');
        Promise.resolve(commands.updateEntryFields(entry.uid, { ...pendingFieldsRef.current }))
            .then(result => {
                if (seq === saveSeqRef.current) {
                    if (result !== false) {
                        pendingFieldsRef.current = {};
                    }
                    setSaveState(result === false ? 'error' : 'saved');
                }
            })
            .catch(() => {
                if (seq === saveSeqRef.current) {
                    setSaveState('error');
                }
            });
    };

    return (<>
        <div {...stylex.props(s.editor)} data-world-info-react-editor="active" data-world-info-react-entry-uid={entry.uid}>
            {onBack ? (
                <button
                    type="button"
                    className={buttonClass(s.button, s.buttonGhost)}
                    data-world-info-react-action="back-to-list"
                    onClick={onBack}
                >
                    <i className={iconClass('fa-arrow-left', s.buttonIconSlot)} aria-hidden="true" />
                    返回条目列表
                </button>
            ) : null}

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="basic">
                <SectionHeader icon="fa-id-card" title="基本信息" />
                <label {...stylex.props(s.field)}>
                    <span {...stylex.props(s.fieldLabel)}>标题</span>
                    <input
                        className="text_pole"
                        ref={titleInputRef}
                        value={draft.comment}
                        data-world-info-react-field="comment"
                        onChange={event => setDraft({ ...draft, comment: event.target.value })}
                        onBlur={event => saveFields({ comment: event.target.value })}
                    />
                </label>
                <div {...stylex.props(s.switchRow)}>
                    <div {...stylex.props(s.segmented)} role="group" aria-label="触发方式" data-world-info-react-field="constant">
                        <button
                            type="button"
                            {...stylex.props(s.segOption, !draft.constant ? s.segOptionOn : null)}
                            aria-pressed={!draft.constant}
                            onClick={() => {
                                if (draft.constant) {
                                    saveFields({ constant: false });
                                }
                            }}
                        >
                            关键词触发
                        </button>
                        <button
                            type="button"
                            {...stylex.props(s.segOption, draft.constant ? s.segOptionOn : null)}
                            aria-pressed={draft.constant}
                            onClick={() => {
                                if (!draft.constant) {
                                    saveFields({ constant: true });
                                }
                            }}
                        >
                            始终注入（常驻）
                        </button>
                    </div>
                </div>
            </section>

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="trigger">
                <SectionHeader icon="fa-key" title="何时触发" />
                {!draft.constant ? (
                    <>
                        <KeywordField
                            label="主要关键词"
                            values={draft.key ?? []}
                            field="key"
                            onCommit={values => saveFields({ key: values })}
                        />

                        {regexKeywordCount > 0 ? (
                            <p {...stylex.props(s.callout)} data-world-info-react-regex-hint>
                                <i className={iconClass('fa-circle-info', s.calloutIcon)} aria-hidden="true" />
                                <span>关键词包含 {regexKeywordCount} 个正则表达式（/pattern/flags 形式直接生效）</span>
                            </p>
                        ) : null}
                    </>
                ) : (
                    <p {...stylex.props(s.callout)}>
                        <i className={iconClass('fa-circle-info', s.calloutIcon)} aria-hidden="true" />
                        <span>始终注入条目会跳过关键词匹配。</span>
                    </p>
                )}
            </section>

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="content">
                <SectionHeader icon="fa-align-left" title="注入内容" />
                <textarea
                    className={`text_pole ${stylex.props(s.content).className ?? ''}`}
                    aria-label="注入内容"
                    value={draft.content}
                    data-world-info-react-field="content"
                    rows={12}
                    onChange={event => setDraft({ ...draft, content: event.target.value })}
                    onBlur={event => saveFields({ content: event.target.value })}
                />
            </section>

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="placement">
                <SectionHeader icon="fa-location-crosshairs" title="注入位置" />
                <div {...stylex.props(s.placementGrid)}>
                    <div {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>位置</span>
                        <div {...stylex.props(s.segmented)} role="group" aria-label="注入位置" data-world-info-react-field="position">
                            {POSITION_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    {...stylex.props(s.segOption, draft.position === option.value ? s.segOptionOn : null)}
                                    aria-pressed={draft.position === option.value}
                                    onClick={() => {
                                        if (draft.position !== option.value) {
                                            saveFields({ position: option.value });
                                        }
                                    }}
                                >
                                    {option.label}
                                </button>
                            ))}
                            {POSITION_OPTIONS.some(option => option.value === draft.position) ? null : (
                                <button
                                    type="button"
                                    {...stylex.props(s.segOption, s.segOptionDisabled)}
                                    disabled
                                    aria-pressed="true"
                                >
                                    {entry.positionLabel ? `${entry.positionLabel}（已退役）` : `已退役位置 ${draft.position}`}
                                </button>
                            )}
                        </div>
                    </div>
                    <label {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>深度</span>
                        <input
                            className="text_pole"
                            type="number"
                            value={draft.position === 4 ? draft.depth : ''}
                            placeholder={draft.position === 4 ? undefined : '—'}
                            disabled={draft.position !== 4}
                            data-world-info-react-field="depth"
                            onChange={event => {
                                const value = parseFiniteNumber(event.target.value);
                                if (value !== undefined) {
                                    setDraft({ ...draft, depth: value });
                                }
                            }}
                            onBlur={event => {
                                const value = parseFiniteNumber(event.target.value);
                                if (value !== undefined) {
                                    saveFields({ depth: value });
                                }
                            }}
                        />
                    </label>
                    <label {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>顺序</span>
                        <input
                            className="text_pole"
                            type="number"
                            value={draft.order}
                            data-world-info-react-field="order"
                            onChange={event => {
                                const value = parseFiniteNumber(event.target.value);
                                if (value !== undefined) {
                                    setDraft({ ...draft, order: value });
                                }
                            }}
                            onBlur={event => {
                                const value = parseFiniteNumber(event.target.value);
                                if (value !== undefined) {
                                    saveFields({ order: value });
                                }
                            }}
                        />
                    </label>
                    <label {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>触发概率</span>
                        <span {...stylex.props(s.probWrap)}>
                            <input
                                className={`text_pole ${stylex.props(s.probInput).className ?? ''}`}
                                type="number"
                                min={0}
                                max={100}
                                value={draft.probability}
                                data-world-info-react-field="probability"
                                onChange={event => {
                                    const value = parseFiniteNumber(event.target.value);
                                    if (value !== undefined) {
                                        setDraft({ ...draft, probability: value });
                                    }
                                }}
                                onBlur={event => {
                                    const value = parseFiniteNumber(event.target.value);
                                    if (value !== undefined) {
                                        saveFields({ probability: value, useProbability: true });
                                    }
                                }}
                            />
                            <span {...stylex.props(s.probUnit)} aria-hidden="true">%</span>
                        </span>
                    </label>
                </div>
            </section>

        </div>
        <footer {...stylex.props(s.statusBar)} data-world-info-react-section="ops">
            <button
                type="button"
                className={buttonClass(s.button, s.buttonGhost)}
                data-world-info-react-action="move-copy-entry"
                onClick={() => void commands.moveOrCopyEntry(entry.uid)}
            >
                <i className={iconClass('fa-folder-tree', s.buttonIconSlot)} aria-hidden="true" />
                移动 / 复制
            </button>
            <button
                type="button"
                className={buttonClass(s.button, s.buttonDanger)}
                data-world-info-react-action="delete-entry"
                onClick={() => {
                    void Promise.resolve(commands.bulkDeleteEntries([entry.uid])).then(deleted => {
                        if (deleted) {
                            onBack?.();
                        }
                    });
                }}
            >
                <i className={iconClass('fa-trash-can', s.buttonIconSlot)} aria-hidden="true" />
                删除
            </button>
            <span {...stylex.props(s.statusMeta)} aria-live="polite">
                <span
                    {...stylex.props(s.statusDot, saveState === 'error' ? s.statusDotError : draft.disable ? s.statusDotOff : draft.constant ? s.statusDotConstant : null)}
                    aria-hidden="true"
                />
                UID {entry.uid} · {(draft.content ?? '').length} 字符
                {saveState !== 'idle' ? (
                    <span {...stylex.props(saveState === 'error' ? s.saveStateError : null)}>
                        {' · '}{saveState === 'saving' ? '保存中…' : saveState === 'error' ? '保存失败' : '已保存'}
                    </span>
                ) : null}
            </span>
            {saveState === 'error' ? (
                <button
                    type="button"
                    className={buttonClass(s.button, s.buttonGhost)}
                    data-world-info-react-action="retry-save"
                    onClick={() => saveFields(pendingFieldsRef.current)}
                >
                    重试保存
                </button>
            ) : null}
        </footer>
    </>);
}

export function WorldInfoWorkbenchPanel({
    state,
    commands,
    shell,
}: {
    state?: unknown;
    commands: WorldInfoCommands;
    shell: (props: {
        status: WorkspacePanelStatus;
        recoveryActions: Array<{ id: string; label: string; disabled?: boolean; onClick: () => void }>;
        children: ReactNode;
    }) => ReactNode;
}) {
    const bridgeState = useMemo(
        () => (state && typeof state === 'object' ? state : {}) as WorldInfoWorkspacePanelState,
        [state],
    );
    const status = getWorldInfoPanelStatus(bridgeState);
    const formDefaults = useMemo(() => buildWorldInfoPanelFormDefaults(bridgeState), [bridgeState]);
    const worldInfoForm = useForm({
        defaultValues: formDefaults,
        validators: { onChange: worldInfoPanelFormSchema },
    });
    const worldInfoCommandMutation = useMutation({
        mutationFn: async (command: () => Promise<unknown> | unknown) => {
            await command();
        },
        retry: false,
    });
    const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
    const [listScrollTop, setListScrollTop] = useState(0);
    const [returnEntryUid, setReturnEntryUid] = useState('');
    const [isNarrow, setIsNarrow] = useState(false);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedUids, setSelectedUids] = useState<ReadonlySet<string>>(new Set());
    // Optimistic entry-toggle state so the row switch repaints before the
    // post-command snapshot arrives; reconciled against entrySummaries below.
    const [enabledOverrides, setEnabledOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());

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

    const [previousEntryUid, setPreviousEntryUid] = useState(bridgeState.selectedEntryUid);
    if (previousEntryUid !== bridgeState.selectedEntryUid) {
        setPreviousEntryUid(bridgeState.selectedEntryUid);
        if (!bridgeState.selectedEntryUid) {
            setMobileView('list');
        }
    }

    const [previousWorldName, setPreviousWorldName] = useState(bridgeState.selectedWorldName);
    if (previousWorldName !== bridgeState.selectedWorldName) {
        setPreviousWorldName(bridgeState.selectedWorldName);
        setMultiSelectMode(false);
        setSelectedUids(new Set());
        setEnabledOverrides(new Map());
    }

    const worldNames = bridgeState.worldNames ?? [];
    const sortOptions = bridgeState.sortOptions ?? [];
    const entrySummaries = bridgeState.entrySummaries ?? [];
    const selectedWorldName = bridgeState.selectedWorldName || '';
    const activeSearchQuery = String(bridgeState.searchQuery ?? '').trim();
    const globalNames = bridgeState.globalActiveNames ?? [];
    const globalCount = bridgeState.globalActiveCount ?? globalNames.length;
    const isBookGlobal = Boolean(selectedWorldName) && globalNames.includes(selectedWorldName);

    // Drop optimistic overrides once the refreshed snapshot agrees with them.
    useEffect(() => {
        setEnabledOverrides(current => {
            if (current.size === 0) {
                return current;
            }
            const next = new Map(current);
            for (const summary of entrySummaries) {
                const uid = String(summary.uid);
                const override = next.get(uid);
                if (override !== undefined && !summary.disabled === override) {
                    next.delete(uid);
                }
            }
            return next.size === current.size ? current : next;
        });
    }, [entrySummaries]);
    const totalEntryCount = bridgeState.entryCount ?? entrySummaries.length;
    const toggleBookGlobal = () => {
        if (!selectedWorldName) {
            return;
        }
        worldInfoCommandMutation.mutate(() => commands.setGlobalWorlds(
            isBookGlobal
                ? globalNames.filter(name => name !== selectedWorldName)
                : [...globalNames, selectedWorldName],
        ));
    };
    const scanDepth = Number.isFinite(bridgeState.scanDepth) ? Number(bridgeState.scanDepth) : null;
    const commitScanDepth = (input: HTMLInputElement) => {
        const parsed = Math.floor(Number(input.value));
        const next = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1000) : null;
        if (next === null || next === scanDepth) {
            input.value = scanDepth !== null ? String(scanDepth) : '';
            return;
        }
        input.value = String(next);
        worldInfoCommandMutation.mutate(() => commands.setScanDepth(next));
    };
    const recoveryActions: Array<{ id: string; label: string; disabled?: boolean; onClick: () => void }> = [];

    if (status === 'error' && bridgeState.refreshMenuPresent) {
        recoveryActions.push({
            id: 'refresh-world',
            label: '刷新面板',
            onClick: () => worldInfoCommandMutation.mutate(() => commands.refreshWorld()),
        });
    }

    const openEntry = (uid: string) => {
        const list = document.querySelector('[data-world-info-react-list-scroll]') as HTMLElement | null;
        if (list) {
            setListScrollTop(list.scrollTop);
        }
        setReturnEntryUid(uid);
        worldInfoCommandMutation.mutate(() => commands.openEntry(uid));
        if (isNarrow) {
            setMobileView('editor');
        }
    };

    const backToList = () => {
        worldInfoCommandMutation.mutate(() => commands.clearSelectedEntry());
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

    const clearSearch = () => {
        worldInfoForm.setFieldValue('searchQuery', '');
        worldInfoCommandMutation.mutate(() => commands.applySearchQuery(''));
    };

    const toggleEntrySelected = (uid: string) => {
        setSelectedUids(current => {
            const next = new Set(current);
            if (next.has(uid)) {
                next.delete(uid);
            } else {
                next.add(uid);
            }
            return next;
        });
    };

    const handleEntryClick = (uid: string) => {
        if (multiSelectMode) {
            toggleEntrySelected(uid);
            return;
        }
        openEntry(uid);
    };

    const toggleEntryEnabled = (uid: string, enabled: boolean) => {
        setEnabledOverrides(current => new Map(current).set(uid, enabled));
        worldInfoCommandMutation.mutate(
            () => commands.updateEntryFields(uid, { disable: !enabled }),
            {
                onError: () => setEnabledOverrides(current => {
                    if (!current.has(uid)) {
                        return current;
                    }
                    const next = new Map(current);
                    next.delete(uid);
                    return next;
                }),
            },
        );
    };

    const runBulkCommand = (command: (uids: string[]) => Promise<unknown> | unknown) => {
        const uids = [...selectedUids];
        if (uids.length === 0) {
            return;
        }
        setSelectedUids(new Set());
        worldInfoCommandMutation.mutate(() => command(uids));
    };

    const showListPane = !isNarrow || mobileView === 'list';
    const showEditorPane = !isNarrow || mobileView === 'editor';

    return shell({
        status,
        recoveryActions,
        children: (
            <div
                {...stylex.props(s.root)}
                data-world-info-react-workflow="workbench"
                data-world-info-react-mobile-view={mobileView}
                data-doc-id="feature.world_info_panel"
            >
                <div {...stylex.props(s.global)} data-world-info-react-global="summary">
                    <span {...stylex.props(s.globalIcon)} aria-hidden="true">
                        <i className="fa-solid fa-globe" />
                    </span>
                    <div {...stylex.props(s.globalField)}>
                        <div {...stylex.props(s.globalLabelRow)}>
                            <span {...stylex.props(s.globalLabel)}>全局启用</span>
                            <span {...stylex.props(s.globalCount, globalCount === 0 ? s.globalCountMuted : null)}>
                                {globalCount} 本激活
                            </span>
                        </div>
                        <div
                            {...stylex.props(s.globalPills)}
                            role="group"
                            aria-label="全局启用的世界书"
                            data-world-info-react-control="global-world-select"
                        >
                            {worldNames.length > 0 ? worldNames.map(world => {
                                const worldName = world.label;
                                const active = globalNames.includes(worldName);
                                return (
                                    <button
                                        key={world.value}
                                        type="button"
                                        {...stylex.props(s.globalPill, active ? s.globalPillOn : null)}
                                        aria-pressed={active}
                                        data-world-info-react-global-world={worldName}
                                        title={active ? `取消全局启用「${worldName}」` : `全局启用「${worldName}」`}
                                        onClick={() => worldInfoCommandMutation.mutate(() => commands.setGlobalWorlds(
                                            active
                                                ? globalNames.filter(name => name !== worldName)
                                                : [...globalNames, worldName],
                                        ))}
                                    >
                                        {worldName}
                                    </button>
                                );
                            }) : (
                                <span {...stylex.props(s.globalEmpty)}>暂无世界书</span>
                            )}
                        </div>
                    </div>
                    <div {...stylex.props(s.globalMeta)}>
                        <label {...stylex.props(s.scanDepthField)}>
                            <span {...stylex.props(s.scanDepthLabel)}>扫描深度</span>
                            <input
                                className={`text_pole ${stylex.props(s.scanDepthInput).className ?? ''}`}
                                type="number"
                                min={0}
                                max={1000}
                                step={1}
                                key={scanDepth ?? 'unset'}
                                defaultValue={scanDepth ?? ''}
                                aria-label="扫描深度"
                                data-world-info-react-field="scan-depth"
                                onBlur={event => commitScanDepth(event.currentTarget)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                    }
                                }}
                            />
                        </label>
                    </div>
                </div>

                <header {...stylex.props(s.bookHeader)} data-world-info-react-header="editor-book">
                    <div {...stylex.props(s.bookRow)}>
                        <i className={iconClass('fa-book-open', s.bookIcon)} aria-hidden="true" />
                        <worldInfoForm.Field name="selectedWorldIndex">
                            {field => (
                                <select
                                    className={`text_pole ${stylex.props(s.flexInput, s.bookSelect).className ?? ''}`}
                                    data-world-info-react-control="world-select"
                                    aria-label="选择要编辑的世界书"
                                    value={field.state.value}
                                    onChange={event => {
                                        const worldIndex = event.target.value;
                                        field.handleChange(worldIndex);
                                        worldInfoCommandMutation.mutate(() => commands.selectWorld(worldIndex));
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
                        <output {...stylex.props(s.countBadge)} data-world-info-react-meta="entry-count">
                            {selectedWorldName ? `${totalEntryCount} 条目` : '未选择'}
                        </output>
                        <span {...stylex.props(s.spacer)} aria-hidden="true" />
                        {selectedWorldName ? (
                            <button
                                type="button"
                                {...stylex.props(s.globalPill, isBookGlobal ? s.globalPillOn : null)}
                                role="switch"
                                aria-checked={isBookGlobal}
                                title={isBookGlobal ? '取消此书的全局启用' : '将此书设为全局启用'}
                                data-world-info-react-action="toggle-book-global"
                                onClick={toggleBookGlobal}
                            >
                                <i className="fa-solid fa-globe" aria-hidden="true" /> 全局
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className={buttonClass(s.button, s.buttonGhost, s.buttonIcon)}
                            data-world-info-react-action="new-world"
                            title="新建世界书"
                            aria-label="新建世界书"
                            onClick={() => worldInfoCommandMutation.mutate(() => commands.createWorld())}
                        >
                            <i className={iconClass('fa-plus', s.buttonIconSlot)} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className={buttonClass(s.button, s.buttonGhost, s.buttonIcon)}
                            data-world-info-react-action="import"
                            title="导入世界书"
                            aria-label="导入世界书"
                            disabled={Boolean(bridgeState.importBusy)}
                            onClick={() => worldInfoCommandMutation.mutate(() => commands.importWorld())}
                        >
                            <i className={iconClass('fa-file-import', s.buttonIconSlot)} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className={buttonClass(s.button, s.buttonGhost, s.buttonIcon)}
                            data-world-info-react-action="refresh"
                            title="刷新"
                            aria-label="刷新"
                            disabled={!bridgeState.refreshMenuPresent}
                            onClick={() => worldInfoCommandMutation.mutate(() => commands.refreshWorld())}
                        >
                            <i className={iconClass('fa-arrows-rotate', s.buttonIconSlot)} aria-hidden="true" />
                        </button>
                        {selectedWorldName ? (
                            <>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost, s.buttonIcon)}
                                    data-world-info-react-action="export"
                                    title="导出世界书"
                                    aria-label="导出世界书"
                                    disabled={!bridgeState.exportMenuPresent}
                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.exportWorld())}
                                >
                                    <i className={iconClass('fa-file-export', s.buttonIconSlot)} aria-hidden="true" />
                                </button>
                                <BookActionsMenu
                                    commands={commands}
                                    runCommand={command => worldInfoCommandMutation.mutate(command)}
                                />
                                <span {...stylex.props(s.divider)} aria-hidden="true" />
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonDanger, s.buttonIcon)}
                                    data-world-info-react-action="delete"
                                    title="删除世界书"
                                    aria-label="删除世界书"
                                    disabled={!bridgeState.deleteMenuPresent}
                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.deleteWorld())}
                                >
                                    <i className={iconClass('fa-trash-can', s.buttonIconSlot)} aria-hidden="true" />
                                </button>
                            </>
                        ) : null}
                    </div>
                </header>

                <div {...stylex.props(s.body)} data-world-info-react-layout="split">
                    <div
                        {...stylex.props(s.pane, showListPane ? null : s.paneHidden)}
                        data-world-info-react-pane="list"
                        hidden={!showListPane}
                    >
                        <div {...stylex.props(s.listHead)}>
                            <div {...stylex.props(s.listHeadRow)}>
                                <span {...stylex.props(s.listHeadTitle)}>条目</span>
                                {selectedWorldName ? (
                                    <span {...stylex.props(s.listHeadCount)} data-world-info-react-meta="list-count">
                                        {activeSearchQuery ? `匹配 ${entrySummaries.length} / 共 ${totalEntryCount}` : `${totalEntryCount}`}
                                    </span>
                                ) : null}
                            </div>
                            {selectedWorldName ? (
                                <div {...stylex.props(s.listHeadTools)}>
                                    <div {...stylex.props(s.searchWrap)}>
                                        <i className={iconClass('fa-magnifying-glass', s.searchIcon)} aria-hidden="true" />
                                        <worldInfoForm.Field name="searchQuery">
                                            {field => (
                                                <input
                                                    className={`text_pole ${stylex.props(s.searchInput).className ?? ''}`}
                                                    type="search"
                                                    data-world-info-react-control="search"
                                                    aria-label="搜索条目"
                                                    placeholder="搜索"
                                                    value={field.state.value}
                                                    onChange={event => {
                                                        const searchQuery = event.target.value;
                                                        field.handleChange(searchQuery);
                                                        worldInfoCommandMutation.mutate(() => commands.applySearchQuery(searchQuery));
                                                    }}
                                                />
                                            )}
                                        </worldInfoForm.Field>
                                        {activeSearchQuery ? (
                                            <button
                                                type="button"
                                                className={buttonClass(s.button, s.searchClear)}
                                                title="清空搜索"
                                                aria-label="清空搜索"
                                                data-world-info-react-search-clear
                                                onClick={clearSearch}
                                            >
                                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                                            </button>
                                        ) : null}
                                    </div>
                                    <worldInfoForm.Field name="sortValue">
                                        {field => (
                                            <select
                                                className={`text_pole ${stylex.props(s.sortSelect).className ?? ''}`}
                                                data-world-info-react-control="sort"
                                                aria-label="排序"
                                                value={field.state.value}
                                                onChange={event => {
                                                    const sortValue = event.target.value;
                                                    field.handleChange(sortValue);
                                                    worldInfoCommandMutation.mutate(() => commands.applySortOption(sortValue));
                                                }}
                                            >
                                                {sortOptions.filter(option => !option.hidden).map(option => (
                                                    <option key={option.value} value={option.value}>{translate(option.label)}</option>
                                                ))}
                                            </select>
                                        )}
                                    </worldInfoForm.Field>
                                    <button
                                        type="button"
                                        className={buttonClass(s.button, s.buttonPrimary, s.buttonIcon)}
                                        data-world-info-react-action="new-entry"
                                        title="新建条目"
                                        aria-label="新建条目"
                                        disabled={!bridgeState.canCreateEntry}
                                        onClick={() => worldInfoCommandMutation.mutate(() => commands.createEntry())}
                                    >
                                        <i className={iconClass('fa-plus', s.buttonIconSlot)} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass(s.button, s.buttonGhost, s.buttonIcon, multiSelectMode ? s.buttonGhostActive : null)}
                                        data-world-info-react-action="toggle-multi-select"
                                        title="多选"
                                        aria-label="多选"
                                        aria-pressed={multiSelectMode}
                                        onClick={() => {
                                            if (multiSelectMode) {
                                                setSelectedUids(new Set());
                                            }
                                            setMultiSelectMode(!multiSelectMode);
                                        }}
                                    >
                                        <i className={iconClass('fa-list-check', s.buttonIconSlot)} aria-hidden="true" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {multiSelectMode ? (
                            <div {...stylex.props(s.multiBar)} data-world-info-react-multiselect-bar>
                                <span {...stylex.props(s.multiBarCount)} data-world-info-react-selected-count>
                                    <span {...stylex.props(s.pulseDot)} aria-hidden="true" />
                                    已选 {selectedUids.size}
                                </span>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost)}
                                    data-world-info-react-action="multi-select-all"
                                    onClick={() => setSelectedUids(new Set(entrySummaries.map(entry => entry.uid)))}
                                >
                                    全选
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost)}
                                    data-world-info-react-action="multi-select-clear"
                                    disabled={selectedUids.size === 0}
                                    onClick={() => setSelectedUids(new Set())}
                                >
                                    清空
                                </button>
                                <span {...stylex.props(s.spacer)} aria-hidden="true" />
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost)}
                                    data-world-info-react-action="multi-enable"
                                    disabled={selectedUids.size === 0}
                                    onClick={() => runBulkCommand(uids => commands.bulkSetEntriesEnabled(uids, true))}
                                >
                                    <i className={iconClass('fa-toggle-on', s.buttonIconSlot)} aria-hidden="true" />
                                    启用
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost)}
                                    data-world-info-react-action="multi-disable"
                                    disabled={selectedUids.size === 0}
                                    onClick={() => runBulkCommand(uids => commands.bulkSetEntriesEnabled(uids, false))}
                                >
                                    <i className={iconClass('fa-toggle-off', s.buttonIconSlot)} aria-hidden="true" />
                                    停用
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonDanger)}
                                    data-world-info-react-action="multi-delete"
                                    disabled={selectedUids.size === 0}
                                    onClick={() => runBulkCommand(uids => commands.bulkDeleteEntries(uids))}
                                >
                                    <i className={iconClass('fa-trash-can', s.buttonIconSlot)} aria-hidden="true" />
                                    删除
                                </button>
                            </div>
                        ) : null}
                        <div
                            {...stylex.props(s.list)}
                            data-world-info-react-list-scroll
                            tabIndex={-1}
                        >
                            {entrySummaries.length > 0 ? entrySummaries.map(entry => (
                                <div
                                    key={entry.uid}
                                    role="button"
                                    tabIndex={0}
                                    {...stylex.props(
                                        s.entryRow,
                                        bridgeState.selectedEntryUid === entry.uid && !multiSelectMode ? s.entryRowSelected : null,
                                        entry.disabled ? s.entryRowDisabled : null,
                                        multiSelectMode && selectedUids.has(entry.uid) ? s.entryRowChecked : null,
                                    )}
                                    data-world-info-react-entry={entry.uid}
                                    aria-current={!multiSelectMode && bridgeState.selectedEntryUid === entry.uid ? 'true' : undefined}
                                    aria-pressed={multiSelectMode ? selectedUids.has(entry.uid) : undefined}
                                    data-world-info-react-selected={multiSelectMode && selectedUids.has(entry.uid) ? 'true' : undefined}
                                    onClick={() => handleEntryClick(entry.uid)}
                                    onKeyDown={event => {
                                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault();
                                            handleEntryClick(entry.uid);
                                        }
                                    }}
                                >
                                    <span
                                        {...stylex.props(s.entryRail, bridgeState.selectedEntryUid === entry.uid && !multiSelectMode ? s.entryRailActive : null)}
                                        aria-hidden="true"
                                    />
                                    {multiSelectMode ? (
                                        <span {...stylex.props(s.entryRowInner)}>
                                            <span {...stylex.props(s.entryCheck, selectedUids.has(entry.uid) ? s.entryCheckOn : null)} aria-hidden="true">
                                                <i className="fa-solid fa-check" aria-hidden="true" />
                                            </span>
                                            <EntryRowContent entry={entry} enabledOverride={enabledOverrides.get(entry.uid)} onToggleEnabled={toggleEntryEnabled} />
                                        </span>
                                    ) : (
                                        <EntryRowContent entry={entry} enabledOverride={enabledOverrides.get(entry.uid)} onToggleEnabled={toggleEntryEnabled} />
                                    )}
                                </div>
                            )) : (
                                <div {...stylex.props(s.empty)} data-world-info-react-empty="entries">
                                    {selectedWorldName ? (
                                        activeSearchQuery ? (
                                            <>
                                                <i className={iconClass('fa-magnifying-glass', s.emptyBigIcon)} aria-hidden="true" />
                                                <span>没有匹配“{activeSearchQuery}”的条目</span>
                                                <button
                                                    type="button"
                                                    className={buttonClass(s.button, s.buttonGhost, s.emptyAction)}
                                                    data-world-info-react-action="clear-search"
                                                    onClick={clearSearch}
                                                >
                                                    清除搜索
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <i className={iconClass('fa-feather-pointed', s.emptyBigIcon)} aria-hidden="true" />
                                                <span>此世界书还没有条目</span>
                                                <button
                                                    type="button"
                                                    className={buttonClass(s.button, s.buttonPrimary, s.emptyAction)}
                                                    data-world-info-react-action="new-entry-empty"
                                                    disabled={!bridgeState.canCreateEntry}
                                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.createEntry())}
                                                >
                                                    <i className={iconClass('fa-plus', s.buttonIconSlot)} aria-hidden="true" />
                                                    新建第一条条目
                                                </button>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            <i className={iconClass('fa-book-open', s.emptyBigIcon)} aria-hidden="true" />
                                            <span>请先选择或创建世界书</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        {selectedWorldName && entrySummaries.length > 0 ? (
                            <div {...stylex.props(s.listFoot)}>支持拖拽导入 .json / .lorebook / .png</div>
                        ) : null}
                    </div>
                    <div
                        {...stylex.props(s.pane, showEditorPane ? null : s.paneHidden)}
                        data-world-info-react-pane="editor"
                        hidden={!showEditorPane}
                        data-world-info-react-editor-visible={showEditorPane || undefined}
                    >
                        <EntryEditor
                            entry={bridgeState.selectedEntry ?? null}
                            commands={commands}
                            onBack={isNarrow && mobileView === 'editor' ? backToList : undefined}
                            emptyMessage={selectedWorldName ? '选择一条条目开始编辑' : '请先选择或创建世界书'}
                        />
                    </div>
                </div>
            </div>
        ),
    });
}
