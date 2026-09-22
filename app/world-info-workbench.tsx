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
import type { WorldInfoCommands } from './compat/workspace-commands';

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

const MAX_KEYWORD_CHIPS = 4;

function joinKeywords(values: string[] | undefined): string {
    return Array.isArray(values) ? values.filter(Boolean).join(', ') : '';
}

function splitKeywords(value: string): string[] {
    return String(value || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

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

function SectionHeader({ icon, title, aside }: { icon: string; title: string; aside?: ReactNode }) {
    return (
        <header {...stylex.props(s.editorSectionHeader)}>
            <i className={iconClass(icon, s.sectionIcon)} aria-hidden="true" />
            <h4 {...stylex.props(s.editorSectionTitle)}>{title}</h4>
            <span {...stylex.props(s.sectionRule)} aria-hidden="true" />
            {aside}
        </header>
    );
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
        <details {...stylex.props(s.advanced)} data-world-info-react-advanced={id} open={defaultOpen || Boolean(summary)}>
            <summary {...stylex.props(s.advancedSummary)}>
                <i className={`fa-solid fa-chevron-right wi-adv-chevron ${stylex.props(s.advancedChevron).className ?? ''}`} aria-hidden="true" />
                <span>{title}</span>
                {summary ? <span {...stylex.props(s.advancedChip)}>{summary}</span> : null}
            </summary>
            <div {...stylex.props(s.advancedBody)}>{children}</div>
        </details>
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
        <div ref={rootRef} {...stylex.props(s.menuWrap)} onKeyDown={onMenuKeyDown}>
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
            {open ? (
                <div {...stylex.props(s.menu)} role="menu" onClick={() => setOpen(false)}>
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

function EntryRowContent({ entry }: { entry: WorldInfoReactEntrySummary }) {
    const chips = keywordChips(entry);
    const shownChips = chips.slice(0, MAX_KEYWORD_CHIPS);
    const overflowCount = chips.length - shownChips.length;
    const showProbability = entry.useProbability !== false && Number(entry.probability ?? 100) < 100;

    return (
        <span {...stylex.props(s.entryRowContent)}>
            <span {...stylex.props(s.entryTitleRow)}>
                <span
                    {...stylex.props(s.statusDot, entry.disabled ? s.statusDotOff : null)}
                    title={entry.disabled ? '停用' : '启用'}
                    aria-hidden="true"
                />
                <span {...stylex.props(s.entryTitle)}>{entry.title}</span>
                {entry.constant ? (
                    <span {...stylex.props(s.constantBadge)}>常驻</span>
                ) : null}
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
            <span {...stylex.props(s.entryMeta)}>
                <span {...stylex.props(s.metaTag)}>{entry.positionLabel || '位置未设'}</span>
                <span {...stylex.props(s.metaTag)}>排序 {entry.order ?? 0}</span>
                {showProbability ? (
                    <span {...stylex.props(s.metaTag, s.metaTagAccent)}>{entry.probability}%</span>
                ) : null}
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
    const titleInputRef = useRef<HTMLInputElement>(null);
    const contentInputRef = useRef<HTMLTextAreaElement>(null);
    const advanced = isAdvancedDefault(entry);
    const entryUid = entry?.uid;
    const focusTitleOnOpen = Boolean(onBack);
    const regexKeywordCount = countRegexKeywords([...(draft?.key ?? []), ...(draft?.keysecondary ?? [])]);

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
            <div {...stylex.props(s.editor, s.editorEmpty)} data-world-info-react-editor="empty">
                <i className={iconClass('fa-pen-to-square', s.emptyIcon)} aria-hidden="true" />
                <p>{emptyMessage}</p>
            </div>
        );
    }

    const saveFields = (fields: Record<string, unknown>) => {
        setDraft(current => current ? { ...current, ...fields } as WorldInfoWorkbenchEntryDetail : current);
        void commands.updateEntryFields(entry.uid, fields);
    };

    const insertMacro = (macro: string) => {
        const element = contentInputRef.current;
        const source = draft.content ?? '';
        const start = element?.selectionStart ?? source.length;
        const end = element?.selectionEnd ?? source.length;
        const next = `${source.slice(0, start)}${macro}${source.slice(end)}`;
        saveFields({ content: next });
        if (element) {
            requestAnimationFrame(() => {
                element.focus();
                element.setSelectionRange(start + macro.length, start + macro.length);
            });
        }
    };

    return (
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
                        autoFocus={focusTitleOnOpen}
                        value={draft.comment}
                        data-world-info-react-field="comment"
                        onChange={event => setDraft({ ...draft, comment: event.target.value })}
                        onBlur={event => saveFields({ comment: event.target.value })}
                    />
                </label>
                <div {...stylex.props(s.checkboxRow)}>
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

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="trigger">
                <SectionHeader icon="fa-key" title="何时触发" />
                {!draft.constant ? (
                    <>
                        <label {...stylex.props(s.field)}>
                            <span {...stylex.props(s.fieldLabel)}>主要关键词</span>
                            <input
                                className="text_pole"
                                value={joinKeywords(draft.key)}
                                data-world-info-react-field="key"
                                onChange={event => setDraft({ ...draft, key: splitKeywords(event.target.value) })}
                                onBlur={event => saveFields({ key: splitKeywords(event.target.value) })}
                            />
                        </label>
                        <label {...stylex.props(s.field)}>
                            <span {...stylex.props(s.fieldLabel)}>可选条件</span>
                            <input
                                className="text_pole"
                                value={joinKeywords(draft.keysecondary)}
                                data-world-info-react-field="keysecondary"
                                onChange={event => setDraft({ ...draft, keysecondary: splitKeywords(event.target.value) })}
                                onBlur={event => saveFields({ keysecondary: splitKeywords(event.target.value) })}
                            />
                        </label>
                        <label {...stylex.props(s.field)}>
                            <span {...stylex.props(s.fieldLabel)}>逻辑</span>
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
                    <p {...stylex.props(s.callout)}>
                        <i className={iconClass('fa-circle-info', s.calloutIcon)} aria-hidden="true" />
                        <span>始终注入条目会跳过关键词匹配。</span>
                    </p>
                )}
            </section>

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="content">
                <SectionHeader icon="fa-align-left" title="注入内容" />
                <div {...stylex.props(s.macroBar)} role="toolbar" aria-label="插入宏">
                    {['{{user}}', '{{char}}', '{{// }}'].map(macro => (
                        <button
                            key={macro}
                            type="button"
                            {...stylex.props(s.macroChip)}
                            data-world-info-react-macro={macro}
                            onClick={() => insertMacro(macro)}
                        >
                            {macro}
                        </button>
                    ))}
                    <span {...stylex.props(s.macroHint)}>点击插入到光标处</span>
                </div>
                <textarea
                    className={`text_pole ${stylex.props(s.content).className ?? ''}`}
                    ref={contentInputRef}
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
                <label {...stylex.props(s.field)}>
                    <span {...stylex.props(s.fieldLabel)}>位置</span>
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
                <div {...stylex.props(s.flexRow)}>
                    <label {...stylex.props(s.field, s.fieldGrow)}>
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
                    {draft.position === 4 ? (
                        <label {...stylex.props(s.field, s.fieldGrow)}>
                            <span {...stylex.props(s.fieldLabel)}>深度</span>
                            <input
                                className="text_pole"
                                type="number"
                                value={draft.depth}
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
                    ) : null}
                    <label {...stylex.props(s.field, s.fieldGrow)}>
                        <span {...stylex.props(s.fieldLabel)}>概率</span>
                        <input
                            className="text_pole"
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
                    </label>
                </div>
            </section>

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="advanced">
                <SectionHeader
                    icon="fa-sliders"
                    title="高级设置"
                    aside={buildAdvancedSummary(entry) ? (
                        <span {...stylex.props(s.advancedChip)}>{buildAdvancedSummary(entry)}</span>
                    ) : null}
                />
                <AdvancedSection id="timing" title="递归与时序" summary={advanced.timing ? buildAdvancedSummary(entry).split(' · ')[0] : ''}>
                    <div {...stylex.props(s.flexRow)}>
                        <label {...stylex.props(s.field, s.fieldGrow)}>
                            <span {...stylex.props(s.fieldLabel)}>黏性</span>
                            <input className="text_pole" type="number" value={draft.sticky ?? ''} data-world-info-react-field="sticky"
                                onBlur={event => saveFields({ sticky: event.target.value === '' ? null : Number(event.target.value) })}
                                onChange={event => setDraft({ ...draft, sticky: event.target.value === '' ? null : Number(event.target.value) })}
                            />
                        </label>
                        <label {...stylex.props(s.field, s.fieldGrow)}>
                            <span {...stylex.props(s.fieldLabel)}>冷却</span>
                            <input className="text_pole" type="number" value={draft.cooldown ?? ''} data-world-info-react-field="cooldown"
                                onBlur={event => saveFields({ cooldown: event.target.value === '' ? null : Number(event.target.value) })}
                                onChange={event => setDraft({ ...draft, cooldown: event.target.value === '' ? null : Number(event.target.value) })}
                            />
                        </label>
                        <label {...stylex.props(s.field, s.fieldGrow)}>
                            <span {...stylex.props(s.fieldLabel)}>延迟</span>
                            <input className="text_pole" type="number" value={draft.delay ?? ''} data-world-info-react-field="delay"
                                onBlur={event => saveFields({ delay: event.target.value === '' ? null : Number(event.target.value) })}
                                onChange={event => setDraft({ ...draft, delay: event.target.value === '' ? null : Number(event.target.value) })}
                            />
                        </label>
                    </div>
                    <div {...stylex.props(s.checkboxRow)}>
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
                    <label {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>组名</span>
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
                    <label {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>自动化 ID</span>
                        <input className="text_pole" value={draft.automationId} data-world-info-react-field="automationId"
                            onChange={event => setDraft({ ...draft, automationId: event.target.value })}
                            onBlur={event => saveFields({ automationId: event.target.value })}
                        />
                    </label>
                    <label {...stylex.props(s.field)}>
                        <span {...stylex.props(s.fieldLabel)}>出口</span>
                        <input className="text_pole" value={draft.outletName} data-world-info-react-field="outletName"
                            onChange={event => setDraft({ ...draft, outletName: event.target.value })}
                            onBlur={event => saveFields({ outletName: event.target.value })}
                        />
                    </label>
                </AdvancedSection>
            </section>

            <section {...stylex.props(s.editorSection)} data-world-info-react-section="ops">
                <SectionHeader icon="fa-screwdriver-wrench" title="条目操作" />
                <div {...stylex.props(s.flexRow)}>
                    <button
                        type="button"
                        className={buttonClass(s.button, s.buttonGhost)}
                        data-world-info-react-action="move-copy-entry"
                        onClick={() => void commands.moveOrCopyEntry(entry.uid)}
                    >
                        <i className={iconClass('fa-folder-tree', s.buttonIconSlot)} aria-hidden="true" />
                        移动 / 复制到其他世界书
                    </button>
                </div>
                {regexKeywordCount > 0 ? (
                    <p {...stylex.props(s.callout)} data-world-info-react-regex-hint>
                        <i className={iconClass('fa-circle-info', s.calloutIcon)} aria-hidden="true" />
                        <span>关键词包含 {regexKeywordCount} 个正则表达式（/pattern/flags 形式直接生效）</span>
                    </p>
                ) : null}
            </section>
        </div>
    );
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
    const bridgeState = (state && typeof state === 'object' ? state : {}) as WorldInfoWorkspacePanelState;
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
    const [activationOpen, setActivationOpen] = useState(
        () => typeof document !== 'undefined'
            && document.getElementById('wi-holder')?.dataset.worldInfoActivationRulesOpen === 'true',
    );
    const [listScrollTop, setListScrollTop] = useState(0);
    const [returnEntryUid, setReturnEntryUid] = useState('');
    const [isNarrow, setIsNarrow] = useState(false);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedUids, setSelectedUids] = useState<ReadonlySet<string>>(new Set());

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

    useEffect(() => {
        setMultiSelectMode(false);
        setSelectedUids(new Set());
    }, [bridgeState.selectedWorldName]);

    const worldNames = bridgeState.worldNames ?? [];
    const sortOptions = bridgeState.sortOptions ?? [];
    const entrySummaries = bridgeState.entrySummaries ?? [];
    const selectedWorldName = bridgeState.selectedWorldName || '';
    const activeSearchQuery = String(bridgeState.searchQuery ?? '').trim();
    const globalNames = bridgeState.globalActiveNames ?? [];
    const globalCount = bridgeState.globalActiveCount ?? globalNames.length;
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

    const globalSummary = globalCount === 0
        ? '未启用全局世界书'
        : `全局启用：${globalNames.slice(0, 3).join('、')}${globalNames.length > 3 ? ` 等 ${globalCount} 本` : ''}`;

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
                    <label {...stylex.props(s.globalField)}>
                        <span {...stylex.props(s.globalLabel)}>全局启用</span>
                        <select
                            className={`text_pole ${stylex.props(s.globalSelect).className ?? ''}`}
                            multiple
                            size={Math.min(Math.max(worldNames.length, 1), 4)}
                            aria-label="选择全局启用的世界书"
                            data-world-info-react-control="global-world-select"
                            value={globalNames}
                            onChange={event => {
                                const names = Array.from(event.currentTarget.selectedOptions, option => option.value);
                                worldInfoCommandMutation.mutate(() => commands.setGlobalWorlds(names));
                            }}
                        >
                            {worldNames.map(world => (
                                <option key={world.value} value={world.label}>{world.label}</option>
                            ))}
                        </select>
                    </label>
                    <div {...stylex.props(s.globalMeta)}>
                        <span {...stylex.props(s.globalCount, globalCount === 0 ? s.globalCountMuted : null)}>
                            <span {...stylex.props(s.pulseDot)} aria-hidden="true" />
                            {globalCount} 本激活
                        </span>
                        <span {...stylex.props(s.globalSummary)} title={globalSummary}>{globalSummary}</span>
                        <button
                            type="button"
                            {...stylex.props(s.rulesToggle)}
                            data-world-info-react-action="toggle-activation-rules"
                            aria-expanded={activationOpen}
                            onClick={() => {
                                const next = !activationOpen;
                                setActivationOpen(next);
                                worldInfoCommandMutation.mutate(() => commands.toggleActivationRules(next), {
                                    onSuccess: () => {
                                        if (next) {
                                            requestAnimationFrame(() => {
                                                document.getElementById('wiGlobalPanel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                                            });
                                        }
                                    },
                                });
                            }}
                        >
                            <i className={iconClass('fa-sliders', s.rulesToggleIcon)} aria-hidden="true" />
                            扫描规则
                        </button>
                    </div>
                </div>
                {activationOpen ? (
                    <p {...stylex.props(s.rulesHint)} data-world-info-react-global="rules-hint">
                        全局扫描规则已在下方展开（沿用既有控件，不复制第二套状态机）。
                    </p>
                ) : null}

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
                            {selectedWorldName ? `${bridgeState.entryCount ?? entrySummaries.length} 条目` : '未选择'}
                        </output>
                        <span {...stylex.props(s.spacer)} aria-hidden="true" />
                        {selectedWorldName ? (
                            <>
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
                                    data-world-info-react-action="export"
                                    title="导出世界书"
                                    aria-label="导出世界书"
                                    disabled={!bridgeState.exportMenuPresent}
                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.exportWorld())}
                                >
                                    <i className={iconClass('fa-file-export', s.buttonIconSlot)} aria-hidden="true" />
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
                    <div {...stylex.props(s.bookRow, selectedWorldName ? s.bookRowTools : null)}>
                        {selectedWorldName ? (
                            <>
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
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    )}
                                </worldInfoForm.Field>
                                <span {...stylex.props(s.divider)} aria-hidden="true" />
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonPrimary)}
                                    data-world-info-react-action="new-entry"
                                    disabled={!bridgeState.canCreateEntry}
                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.createEntry())}
                                >
                                    <i className={iconClass('fa-plus', s.buttonIconSlot)} aria-hidden="true" />
                                    新建条目
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost, multiSelectMode ? s.buttonGhostActive : null)}
                                    data-world-info-react-action="toggle-multi-select"
                                    aria-pressed={multiSelectMode}
                                    onClick={() => {
                                        setMultiSelectMode(current => {
                                            if (current) {
                                                setSelectedUids(new Set());
                                            }
                                            return !current;
                                        });
                                    }}
                                >
                                    <i className={iconClass('fa-list-check', s.buttonIconSlot)} aria-hidden="true" />
                                    多选
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonPrimary)}
                                    data-world-info-react-action="new-world"
                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.createWorld())}
                                >
                                    <i className={iconClass('fa-plus', s.buttonIconSlot)} aria-hidden="true" />
                                    新建世界书
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass(s.button, s.buttonGhost)}
                                    data-world-info-react-action="import"
                                    disabled={Boolean(bridgeState.importBusy)}
                                    onClick={() => worldInfoCommandMutation.mutate(() => commands.importWorld())}
                                >
                                    <i className={iconClass('fa-file-import', s.buttonIconSlot)} aria-hidden="true" />
                                    导入世界书
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div {...stylex.props(s.body)} data-world-info-react-layout="split">
                    <div
                        {...stylex.props(s.pane, showListPane ? null : s.paneHidden)}
                        data-world-info-react-pane="list"
                        hidden={!showListPane}
                    >
                        <div {...stylex.props(s.listHead)} aria-hidden="true">
                            <span {...stylex.props(s.listHeadTitle)}>条目</span>
                            {selectedWorldName ? (
                                <span {...stylex.props(s.listHeadCount)}>{entrySummaries.length}</span>
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
                                <button
                                    key={entry.uid}
                                    type="button"
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
                                >
                                    <span
                                        {...stylex.props(s.entryRail, !entry.disabled || bridgeState.selectedEntryUid === entry.uid ? s.entryRailActive : null)}
                                        aria-hidden="true"
                                    />
                                    {multiSelectMode ? (
                                        <span {...stylex.props(s.entryRowInner)}>
                                            <span {...stylex.props(s.entryCheck, selectedUids.has(entry.uid) ? s.entryCheckOn : null)} aria-hidden="true">
                                                <i className="fa-solid fa-check" aria-hidden="true" />
                                            </span>
                                            <EntryRowContent entry={entry} />
                                        </span>
                                    ) : (
                                        <EntryRowContent entry={entry} />
                                    )}
                                </button>
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
