import { Fragment, StrictMode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';

import {
    attachGlobalCompatibilityBridge,
    detachGlobalCompatibilityBridge,
} from './compat/global-compatibility-bridge.js';
import type { RuntimePort } from './compat/runtime-port';
import type {
    AuthoringCommands,
    MainChatCommands,
    WorkspaceDockPanelKind,
    WorkspacePanelCommands,
    WorkspaceShellCommands,
    WorkspaceShellSlotKey,
    WorldInfoCommands,
} from './compat/workspace-commands';
import {
    getWorkspacePanelDockSnapshot,
    getWorkspaceShellChildSlot,
    recordWorkspacePanelDockIntent,
    recordWorkspacePanelDockClose,
    recordWorkspacePanelDockResult,
    recordWorkspacePanelMount,
    recordWorkspacePanelUnmount,
    recordWorkspacePanelUpdate,
    subscribeWorkspacePanelDock,
} from './stores/workspace-panel-store.js';
import {
    resetMainChatObservationStore,
    updateMainChatObservation,
} from './stores/main-chat-observation-store.js';
import {
    getMainChatStore,
} from './stores/main-chat-store';
import type {
    MainChatSnapshot,
} from './stores/main-chat-store';
import { MainChatMessageRow } from './components/main-chat/MainChatMessageRow';
import { TurnSummaryCard } from './components/main-chat/TurnSummaryCard';
import {
    createCharacterAuthoringSession,
    shouldApplyCharacterAuthoringSaveResult,
} from '../public/scripts/character-authoring.js';

import {
    WorldInfoWorkbenchPanel,
    type WorldInfoWorkspacePanelState as WorldInfoWorkbenchPanelState,
} from './world-info-workbench';
import { SettingsSurface } from './components/settings/SettingsSurface';
import { ChatBackupsBrowser, type ChatBackupsCommands } from './components/chat-backups/ChatBackupsBrowser';

import { TagManagement } from './components/tags/TagManagement';
import { TagChipInput } from './components/fields/TagChipInput';
import { useAutosizeTextareaRef } from './lib/autosize-textarea';
import { RegexEditor } from './components/regex/RegexEditor';
import { RegexSettingsPanel } from './components/regex/RegexSettingsPanel';
import { RegexDebugger } from './components/regex/RegexDebugger';
import { ToolBindingEditor } from './components/regex/ToolBindingEditor';
import { RegexImportTarget } from './components/regex/RegexImportTarget';
import { MacroBrowserPanel, type MacroBrowserProps } from './components/macros/MacroBrowser';
import { WorldInfoPanel } from './components/panels/WorldInfoPanel';
import { WorkspacePanelChrome } from './components/panels/WorkspacePanelChrome';
import { ChatComposer } from './components/composer/ChatComposer';
import { CharacterPopup } from './components/character-popup/CharacterPopup';
import { RightNavPanel } from './components/right-nav/RightNavPanel';
import { AiConfigPanel } from './components/ai-config/AiConfigPanel';
import { PresetSaveButton } from './components/ai-config/PresetActionsMenu';
import { PromptInspectorButton, PromptManagerAddButton, PromptManagerList, type PromptPanelBridge } from './components/prompt-panel/PromptPanel';
import { PromptInspector, type PromptInspectorBridge } from './components/prompt-panel/PromptInspector';
import { SelectChatPopup } from './components/select-chat/SelectChatPopup';
import {
    SelectChatList,
    type SelectChatListBridge,
    type SelectChatListState,
} from './components/select-chat/SelectChatList';
import { CharacterContextMenu } from './components/context-menu/CharacterContextMenu';
import { OptionsMenu } from './components/options-menu/OptionsMenu';
import { DialogueDelMesControls, DialoguePopupControls } from './components/dialogue-popups/DialoguePopups';
import { ExportFormatPopup } from './components/export-format/ExportFormatPopup';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { authoringStyles, workspacePanelStyles, workspaceShellStyles } from './styles/workspace-panels.styles.js';
import { Theme } from '@astryxdesign/core';
import { emberDeskTheme } from './lib/theme-tokens';
import '@astryxdesign/core/astryx.css';

export type WorkspacePanelKind = 'worldInfo' | 'mainChatMessageList' | 'characterAuthoring';
interface WorkspacePanelMount {
    root: Root;
    container: HTMLElement;
    kind: WorkspacePanelKind;
    runtime: RuntimePort;
    state?: unknown;
    commands?: WorkspacePanelBridge;
}

interface WorkspacePanelMountOptions {
    runtime: RuntimePort;
    state?: unknown;
    commands?: WorkspacePanelBridge;
}

type WorkspacePanelStatus = 'idle' | 'loading' | 'empty' | 'success' | 'error';
type WorkspacePanelDockStatus = 'idle' | 'disabled' | 'loading' | 'empty' | 'success' | 'error';

type WorkspacePanelBridge = WorkspacePanelCommands;

interface WorkspacePanelDockDispatchResult {
    locked?: boolean;
    mounted?: boolean;
    pinned?: boolean;
    reason?: string;
    status?: string;
}

interface WorkspacePanelDockSnapshot {
    activePanelKind: WorkspaceDockPanelKind | null;
    activePanelStatus: WorkspacePanelDockStatus;
    fallbackReason: string | null;
    lockedPanelKinds: WorkspaceDockPanelKind[];
    openPanelKinds: WorkspaceDockPanelKind[];
    pinnedPanelKinds: WorkspaceDockPanelKind[];
    updatedAt: number;
}

interface WorkspaceShellChromeMount {
    root: Root;
    container: HTMLElement;
    runtime: RuntimePort;
    state?: WorkspaceShellChromeState;
    commands?: WorkspaceShellCommands;
}

interface WorkspaceShellChromeMountOptions {
    runtime: RuntimePort;
    state?: WorkspaceShellChromeState;
    commands?: WorkspaceShellCommands;
}

interface WorkspaceShellChromeState {
    activeContext?: 'none' | 'assistant' | 'character';
    contextTitle?: string;
    status?: 'loading' | 'empty' | 'success' | 'error';
}

interface WorkspacePanelLegacySlot {
    id: string;
    label: string;
    ready?: boolean;
}

interface WorkspacePanelRecoveryAction {
    id: string;
    label: string;
    disabled?: boolean;
    onClick: () => void;
}

interface WorkspaceShellNavigationEntry {
    command: keyof WorkspaceShellCommands;
    icon: string;
    label: string;
    panelKind?: WorkspaceDockPanelKind;
    slotKey?: WorkspaceShellSlotKey;
}

type WorldInfoWorkspacePanelState = WorldInfoWorkbenchPanelState;

interface MainChatMessageListWorkspacePanelState {
    mainChatSnapshot?: MainChatSnapshot;
}

const panelShellStyles = stylex.create({
    diagnostics: {
        color: 'color-mix(in srgb, var(--SmartThemeBodyColor) 72%, var(--SmartThemeBlurTintColor) 28%)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent)',
        borderRadius: '5px',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeBlurTintColor) 70%, var(--black50a) 30%)',
        padding: {
            default: '2px 5px',
            '[open]': '2px 5px 5px',
        },
        fontSize: 'calc(var(--mainFontSize) * 0.9)',
    },
    diagnosticsSummary: {
        width: 'fit-content',
        cursor: 'pointer',
        color: {
            default: 'var(--SmartThemeEmColor)',
            ':hover': 'var(--SmartThemeBodyColor)',
            ':focus-visible': 'var(--SmartThemeBodyColor)',
        },
        listStylePosition: 'inside',
        outlineWidth: { ':focus-visible': '1px' },
        outlineStyle: { ':focus-visible': 'solid' },
        outlineColor: { ':focus-visible': 'var(--interactable-outline-color)' },
        outlineOffset: { ':focus-visible': '2px' },
        borderRadius: { ':focus-visible': '3px' },
        marginBottom: {
            [stylex.when.ancestor('[open]')]: '5px',
        },
    },
});

interface AuthoringWorkspacePanelState {
    mode?: 'create' | 'edit';
    title?: string;
    subtitle?: string;
    dirty?: boolean;
    unsupportedFields?: string[];
    draft?: Record<string, unknown>;
    avatarUrl?: string;
    tokenSummary?: { total?: string; permanent?: string };
    candidates?: AuthoringCandidateState[];
    tagOptions?: AuthoringCandidateState[];
    managementActions?: AuthoringManagementAction[];
    worldNames?: string[];
}

interface AuthoringManagementAction {
    id: string;
    label: string;
    danger?: boolean;
    editAction?: boolean;
}

interface AuthoringCandidateState {
    id: string;
    label: string;
}


const queryClient = new QueryClient();
const mountedPanels = new Map<WorkspacePanelKind, WorkspacePanelMount>();
let mountedShellChrome: WorkspaceShellChromeMount | null = null;

interface SettingsPanelMount {
    root: Root;
    host: HTMLElement;
    runtime: RuntimePort;
    initialTab: string | null;
}

let mountedSettingsPanel: SettingsPanelMount | null = null;

function asMainChatMessageListState(state: unknown): MainChatMessageListWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    const bridgeState = state as Record<string, unknown>;

    return {
        mainChatSnapshot: bridgeState.mainChatSnapshot as MainChatSnapshot | undefined,
    };
}

function workspacePanelStateQueryKey(kind: WorkspacePanelKind) {
    return ['workspace-panel', kind, 'bridge-state'] as const;
}

function WorkspacePanelShell({
    kind,
    title,
    status,
    actions = [],
    legacyBoundary,
    hideDiagnostics = false,
    hideTitle = false,
    slots = [],
    children,
}: {
    kind: WorkspacePanelKind;
    title: string;
    status: WorkspacePanelStatus;
    actions?: WorkspacePanelRecoveryAction[];
    legacyBoundary?: string;
    hideDiagnostics?: boolean;
    hideTitle?: boolean;
    slots?: WorkspacePanelLegacySlot[];
    children: ReactNode;
}) {
    const boundaryAttributes = legacyBoundary ? {
        [`data-${kind.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-legacy-boundary`]: legacyBoundary,
    } : {};
    const showStatusBadge = status === 'loading' || status === 'error';

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel={kind}
            data-react-workspace-panel-shell={kind}
            data-workspace-panel-status={status}
            {...boundaryAttributes}
        >
            <div className="flex-container flexFlowColumn gap8">
                {!hideTitle || showStatusBadge ? (
                    <div className="flex-container justifyspacebetween alignitemscenter gap8">
                        {!hideTitle ? <div className="title_restorable">{title}</div> : <span aria-hidden="true" />}
                        {showStatusBadge ? (
                            <span
                                {...stylex.props(
                                    workspacePanelStyles.statusBadge,
                                    status === 'loading' ? workspacePanelStyles.statusBadgeLoading : workspacePanelStyles.statusBadgeError,
                                )}
                                data-workspace-panel-status={status}
                            >
                                {getWorkspacePanelVisibleStatusLabel(status)}
                            </span>
                        ) : null}
                    </div>
                ) : null}
                {actions.length > 0 ? (
                    <div
                        {...stylex.props(workspacePanelStyles.recovery)}
                        data-workspace-panel-recovery-state={status}
                    >
                        <div {...stylex.props(workspacePanelStyles.recoveryActions)}>
                            {actions.map(action => (
                                <button
                                    key={action.id}
                                    type="button"
                                    className={`menu_button menu_button_icon ${stylex.props(workspacePanelStyles.recoveryActionButton).className ?? ''}`}
                                    data-workspace-panel-recovery-action={action.id}
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                {children}
                {!hideDiagnostics && (slots.length > 0 || status !== 'idle') ? (
                    <details
                        {...stylex.props(panelShellStyles.diagnostics, stylex.defaultMarker())}
                        data-workspace-panel-diagnostics={kind}
                    >
                        <summary {...stylex.props(panelShellStyles.diagnosticsSummary)}>Diagnostics</summary>
                        <div className="flex-container flexFlowColumn gap4">
                            <div className="flex-container justifyspacebetween alignitemscenter gap8">
                                <span>Status</span>
                                <span
                                    {...stylex.props(
                                        workspacePanelStyles.statusBadge,
                                        status === 'loading' ? workspacePanelStyles.statusBadgeLoading : status === 'error' ? workspacePanelStyles.statusBadgeError : null,
                                    )}
                                    data-workspace-panel-status={status}
                                >{status}</span>
                            </div>
                            {slots.length > 0 ? (
                                <div className="flex-container flexFlowColumn gap4" data-workspace-legacy-slots={kind}>
                                    {slots.map(slot => {
                                        return (
                                            <div
                                                key={slot.id}
                                                {...stylex.props(workspacePanelStyles.legacySlot)}
                                                data-workspace-legacy-slot={slot.id}
                                                data-workspace-legacy-slot-ready={slot.ready ? 'true' : 'false'}
                                            >
                                                <span>{slot.label}</span>
                                                <span
                                                    {...stylex.props(
                                                        workspacePanelStyles.legacySlotStatus,
                                                        slot.ready ? workspacePanelStyles.legacySlotStatusReady : workspacePanelStyles.legacySlotStatusPending,
                                                    )}
                                                    data-workspace-panel-legacy-ready={slot.ready ? 'true' : 'false'}
                                                >
                                                    {slot.ready ? 'Ready' : 'Legacy'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    </details>
                ) : null}
            </div>
        </section>
    );
}

function WorkspacePanelPlaceholder({ kind }: { kind: WorkspacePanelKind }) {
    return (
        <WorkspacePanelShell
            kind={kind}
            title="Workspace panel"
            status="idle"
        >
            <div className="opacity50">
                {kind} is ready.
            </div>
        </WorkspacePanelShell>
    );
}

function asWorldInfoState(state: unknown): WorldInfoWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as WorldInfoWorkspacePanelState;
}

function WorldInfoWorkspacePanel({ state, commands }: { state?: unknown; commands: WorldInfoCommands }) {
    const bridgeState = asWorldInfoState(state);
    return (
        <WorldInfoWorkbenchPanel
            state={state}
            commands={commands}
            shell={({ status, recoveryActions, children }) => (
                <WorkspacePanelShell
                    kind="worldInfo"
                    title="世界书"
                    status={status}
                    actions={recoveryActions}
                    legacyBoundary="activation-import-regex-prompt-delete"
                    hideDiagnostics={true}
                    hideTitle={true}
                    slots={[
                        { id: 'global-selector', label: 'Global selector', ready: bridgeState.globalSelectorPresent },
                        { id: 'editor-selector', label: 'Editor selector', ready: Boolean(bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated) },
                        { id: 'import-controls', label: 'Import controls', ready: bridgeState.importMenuPresent },
                        { id: 'legacy-editor', label: 'Legacy editor', ready: bridgeState.dropTargetPresent },
                    ]}
                >
                    {children}
                </WorkspacePanelShell>
            )}
        />
    );
}

function asAuthoringState(state: unknown): AuthoringWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as AuthoringWorkspacePanelState;
}

function AuthoringActionsMenu({
    actions,
    disabled,
    onRun,
    onOpen,
}: {
    actions: AuthoringManagementAction[];
    disabled: boolean;
    onRun: (actionId: string) => void;
    onOpen?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const orderedActions = useMemo(
        () => [...actions.filter(action => !action.danger), ...actions.filter(action => action.danger)],
        [actions],
    );

    useEffect(() => {
        if (!open) {
            return;
        }
        const firstItem = menuRef.current?.querySelector('button');
        if (firstItem instanceof HTMLElement) {
            firstItem.focus();
        }
        const onPointerDown = (event: PointerEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open]);

    if (orderedActions.length === 0) {
        return null;
    }

    return (
        <div ref={wrapRef} {...stylex.props(authoringStyles.actionMenuWrap)}>
            <button
                ref={triggerRef}
                type="button"
                className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                disabled={disabled}
                title="More character actions"
                aria-label="More character actions"
                aria-haspopup="menu"
                aria-expanded={open}
                data-i18n="[title]More...;[aria-label]More..."
                onClick={() => {
                    const next = !open;
                    if (next) {
                        onOpen?.();
                    }
                    setOpen(next);
                }}
            >
                <i className="fa-solid fa-ellipsis" aria-hidden="true" />
            </button>
            {open ? (
                <div ref={menuRef} role="menu" {...stylex.props(authoringStyles.actionMenu)}>
                    {orderedActions.map(action => (
                        <button
                            key={action.id}
                            type="button"
                            role="menuitem"
                            {...stylex.props(authoringStyles.actionMenuItem, action.danger ? authoringStyles.actionMenuItemDanger : null)}
                            onClick={() => {
                                setOpen(false);
                                onRun(action.id);
                            }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function AuthoringFieldLabel({ text, dirty, meta, onExpand }: { text: string; dirty?: boolean; meta?: string; onExpand?: () => void }) {
    return (
        <span {...stylex.props(authoringStyles.fieldLabel)}>
            {text}
            {dirty ? <span {...stylex.props(authoringStyles.dirtyDot)} title="Unsaved change" aria-label="Unsaved change" /> : null}
            {meta ? <span {...stylex.props(authoringStyles.fieldMeta)}>{meta}</span> : null}
            {onExpand ? (
                <button
                    type="button"
                    {...stylex.props(authoringStyles.iconAction)}
                    title="放大编辑"
                    aria-label={`放大编辑 ${text}`}
                    onClick={onExpand}
                >
                    <i className="fa-solid fa-expand" aria-hidden="true" />
                </button>
            ) : null}
        </span>
    );
}

function AuthoringTextarea({
    value,
    onChange,
    rows = 2,
    xstyle,
    ...rest
}: {
    value: string;
    rows?: number;
    xstyle?: StyleXStyles;
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'>) {
    const ref = useAutosizeTextareaRef<HTMLTextAreaElement>(value);

    return (
        <textarea
            ref={ref}
            className="text_pole"
            rows={rows}
            value={value}
            onChange={onChange}
            {...stylex.props(authoringStyles.control, authoringStyles.textareaAuto, xstyle)}
            {...rest}
        />
    );
}

const TEXT_REPLACE_CARD_FIELDS = [
    { id: 'description', label: '描述' },
    { id: 'scenario', label: '场景' },
    { id: 'firstMes', label: '开场白' },
    { id: 'exampleMessages', label: '示例对话' },
    { id: 'alternateGreetings', label: '备选开场白' },
    { id: 'systemPrompt', label: '系统提示' },
    { id: 'postHistoryInstructions', label: '历史后指令' },
    { id: 'depthPrompt', label: '深度提示' },
    { id: 'creatorNotes', label: '作者备注' },
    { id: 'creator', label: '创作者' },
    { id: 'characterVersion', label: '版本号' },
    { id: 'tags', label: '标签' },
] as const;

const TEXT_REPLACE_WORLD_FIELDS = [
    { id: 'content', label: '正文' },
    { id: 'comment', label: '备注' },
    { id: 'keys', label: '关键词' },
] as const;

const TEXT_REPLACE_CHAT_FIELDS = [
    { id: 'mes', label: '消息正文' },
    { id: 'reasoning', label: '思维链' },
] as const;

interface TextReplaceSample {
    before: string;
    after: string;
}

interface TextReplaceMatch {
    field?: string;
    label?: string;
    path?: string;
    occurrences?: number;
    samples?: TextReplaceSample[];
    entryUid?: string;
    entryTitle?: string;
    index?: number;
    role?: string;
    name?: string;
}

interface TextReplaceArea {
    status?: string;
    name?: string | null;
    embedded?: boolean;
    boundCharacterCount?: number;
    occurrences?: number;
    matches?: TextReplaceMatch[];
    reason?: string;
    fileName?: string | null;
}

interface TextReplaceResult {
    ok?: boolean;
    reason?: string;
    status?: number;
    applied?: { card?: boolean; worldBook?: boolean; chat?: boolean };
    areas?: { card?: TextReplaceArea; worldBook?: TextReplaceArea; chats?: TextReplaceArea };
    totals?: { occurrences?: number; changedTargets?: number };
    warnings?: { code?: string; name?: string; characters?: number; reason?: string }[];
}

const TEXT_REPLACE_REASON_LABELS: Record<string, string> = {
    generation_in_flight: '正在生成回复，请等待完成或停止后再应用',
    canonical_world_info_unavailable: '世界书存储不可用',
    canonical_chat_unavailable: '聊天存储不可用',
    canonical_storage_disabled: '角色存储不可用',
    character_not_found: '找不到当前角色卡',
    missing_avatar_url: '缺少角色标识',
    missing_chat_file_name: '当前没有打开的聊天',
    invalid_regex: '正则表达式无效',
    empty_query: '查找内容不能为空',
    no_areas_selected: '请至少勾选一个替换范围',
    network_error: '请求失败，请稍后重试',
    empty_response: '服务器没有返回结果',
};

function describeTextReplaceFailure(result: TextReplaceResult | null | undefined): string {
    const reason = String(result?.reason ?? '');
    if (!reason) {
        return '操作失败';
    }
    if (reason.startsWith('invalid_regex:')) {
        return `${TEXT_REPLACE_REASON_LABELS.invalid_regex}：${reason.slice('invalid_regex:'.length).trim()}`;
    }
    return TEXT_REPLACE_REASON_LABELS[reason] ?? `操作失败（${reason}）`;
}

function TextReplaceCheckRow({
    checked,
    label,
    disabled,
    onChange,
}: {
    checked: boolean;
    label: ReactNode;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label {...stylex.props(authoringStyles.replaceCheck)}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={event => onChange(event.target.checked)}
            />
            <span>{label}</span>
        </label>
    );
}

function TextReplaceMatchRow({
    match,
    excluded,
    onToggle,
}: {
    match: TextReplaceMatch;
    excluded: boolean;
    onToggle: (path: string, excluded: boolean) => void;
}) {
    const path = String(match.path ?? '');
    const context = match.entryTitle
        ? `条目「${match.entryTitle}」`
        : match.index != null
            ? `第 ${match.index + 1} 条${match.role === 'user' ? '用户' : match.role === 'system' ? '系统' : '角色'}消息${match.name ? ` · ${match.name}` : ''}`
            : '';
    const samples = Array.isArray(match.samples) ? match.samples.slice(0, 2) : [];

    return (
        <div {...stylex.props(authoringStyles.replaceMatchRow, excluded ? authoringStyles.replaceMatchRowExcluded : null)}>
            <label {...stylex.props(authoringStyles.replaceCheck)}>
                <input
                    type="checkbox"
                    checked={!excluded}
                    onChange={event => onToggle(path, !event.target.checked)}
                />
                <span {...stylex.props(authoringStyles.replaceMatchPath)}>
                    {match.label ?? match.field ?? ''} <code>{path}</code>
                    {context ? ` — ${context}` : ''}
                    {`（${match.occurrences ?? 0} 处）`}
                </span>
            </label>
            {samples.map((sample, sampleIndex) => (
                <div key={sampleIndex} {...stylex.props(authoringStyles.replaceMatchSample)}>
                    <div><del>{sample.before}</del></div>
                    <div><ins>{sample.after}</ins></div>
                </div>
            ))}
        </div>
    );
}

function CharacterAuthoringTextReplaceDialog({
    commands,
    payload,
    onClose,
}: {
    commands?: AuthoringCommands;
    payload?: Record<string, unknown>;
    onClose: (applied: false | { card?: boolean; worldBook?: boolean; chat?: boolean }) => void;
}) {
    const [query, setQuery] = useState('');
    const [replacement, setReplacement] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [regex, setRegex] = useState(false);
    const [cardArea, setCardArea] = useState(true);
    const [worldArea, setWorldArea] = useState(true);
    const [chatArea, setChatArea] = useState(false);
    const [cardFields, setCardFields] = useState<Set<string>>(() => new Set(TEXT_REPLACE_CARD_FIELDS.map(field => field.id)));
    const [worldFields, setWorldFields] = useState<Set<string>>(() => new Set(TEXT_REPLACE_WORLD_FIELDS.map(field => field.id)));
    const [chatFields, setChatFields] = useState<Set<string>>(() => new Set(TEXT_REPLACE_CHAT_FIELDS.map(field => field.id)));
    const [busy, setBusy] = useState<'' | 'preview' | 'apply'>('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<TextReplaceResult | null>(null);
    const [applyResult, setApplyResult] = useState<TextReplaceResult | null>(null);
    const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
    const appliedRef = useRef<{ card?: boolean; worldBook?: boolean; chat?: boolean } | null>(null);

    const toggleField = useCallback((set: Set<string>, setter: (next: Set<string>) => void, id: string, checked: boolean) => {
        const next = new Set(set);
        if (checked) {
            next.add(id);
        } else {
            next.delete(id);
        }
        setter(next);
    }, []);

    const requestSignature = useMemo(() => JSON.stringify({
        areas: { card: cardArea, worldBook: worldArea, chats: chatArea ? 'current' : 'off' },
        cardFields: [...cardFields].sort(),
        worldFields: [...worldFields].sort(),
        chatFields: [...chatFields].sort(),
        query,
        replacement,
        options: { caseSensitive, wholeWord, regex },
    }), [cardArea, worldArea, chatArea, cardFields, worldFields, chatFields, query, replacement, caseSensitive, wholeWord, regex]);
    const [previewSignature, setPreviewSignature] = useState<string | null>(null);

    const buildRequest = useCallback(() => ({
        ...payload,
        areas: { card: cardArea, worldBook: worldArea, chats: chatArea ? 'current' : 'off' },
        cardFields: [...cardFields],
        worldFields: [...worldFields],
        chatFields: [...chatFields],
        query,
        replacement,
        options: { caseSensitive, wholeWord, regex },
        excluded: [...excluded],
    }), [payload, cardArea, worldArea, chatArea, cardFields, worldFields, chatFields, query, replacement, caseSensitive, wholeWord, regex, excluded]);

    const previewAreas = preview?.areas;
    const matchGroups: { key: string; title: string; matches: TextReplaceMatch[] }[] = preview ? [
        { key: 'card', title: '角色字段', matches: previewAreas?.card?.matches ?? [] },
        { key: 'worldBook', title: previewAreas?.worldBook?.embedded ? '内嵌世界书' : '世界书', matches: previewAreas?.worldBook?.matches ?? [] },
        { key: 'chats', title: '当前聊天', matches: previewAreas?.chats?.matches ?? [] },
    ].filter(group => group.matches.length > 0) : [];

    const effectiveOccurrences = preview && previewSignature === requestSignature
        ? matchGroups.reduce((sum, group) => sum + group.matches
            .filter(match => !excluded.has(String(match.path ?? '')))
            .reduce((inner, match) => inner + (match.occurrences ?? 0), 0), 0)
        : null;
    const previewStale = preview != null && previewSignature !== requestSignature;

    const requestPreview = useCallback(async () => {
        setBusy('preview');
        setError('');
        setPreview(null);
        try {
            const result = await commands?.previewTextReplace?.(buildRequest()) as TextReplaceResult | undefined;
            if (result?.ok) {
                setPreview(result);
                setPreviewSignature(requestSignature);
            } else {
                setError(describeTextReplaceFailure(result));
            }
        } catch {
            setError('预览请求失败');
        } finally {
            setBusy('');
        }
    }, [commands, buildRequest, requestSignature]);

    const requestApply = useCallback(async () => {
        const remaining = effectiveOccurrences ?? 0;
        if (remaining <= 0) {
            return;
        }
        if (!window.confirm(`将替换 ${remaining} 处命中，且不可撤销。继续吗？`)) {
            return;
        }
        setBusy('apply');
        setError('');
        try {
            const result = await commands?.applyTextReplace?.(buildRequest()) as TextReplaceResult | undefined;
            if (result?.ok) {
                appliedRef.current = result.applied?.card || result.applied?.worldBook || result.applied?.chat
                    ? (result.applied ?? {})
                    : null;
                setApplyResult(result);
            } else {
                setError(describeTextReplaceFailure(result));
            }
        } catch {
            setError('应用请求失败');
        } finally {
            setBusy('');
        }
    }, [commands, buildRequest, effectiveOccurrences]);

    const toggleExclude = useCallback((path: string, exclude: boolean) => {
        setExcluded(current => {
            const next = new Set(current);
            if (exclude) {
                next.add(path);
            } else {
                next.delete(path);
            }
            return next;
        });
    }, []);

    const areaStatusNotes: string[] = [];
    if (preview) {
        if (previewAreas?.card?.status === 'unchanged') {
            areaStatusNotes.push('角色字段：无命中');
        }
        if (previewAreas?.worldBook?.status === 'unchanged') {
            areaStatusNotes.push('世界书：无命中');
        }
        if (previewAreas?.worldBook?.status === 'unbound') {
            areaStatusNotes.push('未绑定世界书，且卡内没有内嵌世界书');
        }
        if (previewAreas?.worldBook?.status === 'missing') {
            areaStatusNotes.push(`找不到绑定的世界书「${previewAreas.worldBook.name ?? ''}」`);
        }
        if (previewAreas?.chats?.status === 'unchanged') {
            areaStatusNotes.push('当前聊天：无命中');
        }
        if (previewAreas?.chats?.status === 'missing') {
            areaStatusNotes.push('找不到当前聊天的存储内容');
        }
    }

    const handleClose = useCallback(() => {
        onClose(appliedRef.current ?? false);
    }, [onClose]);

    return createPortal(
        <div
            {...stylex.props(authoringStyles.modalOverlay)}
            role="presentation"
            onMouseDown={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) {
                    handleClose();
                }
            }}
            onMouseUp={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    handleClose();
                }
            }}
        >
            <dialog open aria-modal="true" aria-label="查找替换" {...stylex.props(authoringStyles.modalCard, authoringStyles.replaceModalCard)}>
                <div {...stylex.props(authoringStyles.modalHead)}>
                    <span {...stylex.props(authoringStyles.modalTitle)}>查找替换</span>
                    <span {...stylex.props(authoringStyles.fieldMeta)}>作用于当前角色卡</span>
                    <button
                        type="button"
                        {...stylex.props(authoringStyles.iconAction)}
                        title="关闭"
                        aria-label="关闭"
                        onClick={handleClose}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
                {applyResult ? (
                    <div {...stylex.props(authoringStyles.replaceBody)}>
                        <div {...stylex.props(authoringStyles.replaceResultBox)}>
                            {applyResult.applied?.card ? <div>✓ 角色卡已更新</div> : null}
                            {applyResult.applied?.worldBook ? <div>✓ 世界书已更新{applyResult.areas?.worldBook?.boundCharacterCount && applyResult.areas.worldBook.boundCharacterCount > 1 ? `（同时影响 ${applyResult.areas.worldBook.boundCharacterCount} 张卡）` : ''}</div> : null}
                            {applyResult.applied?.chat ? <div>✓ 当前聊天已更新（{applyResult.areas?.chats?.occurrences ?? 0} 处）</div> : null}
                            {applyResult.areas?.card?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ 角色卡写入失败：{applyResult.areas.card.reason ?? ''}</div> : null}
                            {applyResult.areas?.worldBook?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ 世界书写入失败：{applyResult.areas.worldBook.reason ?? ''}</div> : null}
                            {applyResult.areas?.chats?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ 聊天写入失败：{applyResult.areas.chats.reason ?? ''}</div> : null}
                            {!applyResult.applied?.card && !applyResult.applied?.worldBook && !applyResult.applied?.chat
                                && applyResult.areas?.card?.status !== 'failed'
                                && applyResult.areas?.worldBook?.status !== 'failed'
                                && applyResult.areas?.chats?.status !== 'failed' ? (
                                    <div>没有需要写入的命中。</div>
                                ) : null}
                            {(applyResult.warnings ?? []).map((warning, index) => (
                                <div key={index} {...stylex.props(authoringStyles.replaceWarningText)}>
                                    {warning.code === 'shared_world_book'
                                        ? `世界书「${warning.name}」同时被 ${warning.characters} 张角色卡使用`
                                        : warning.code === 'world_book_projection_failed'
                                            ? `世界书「${warning.name}」的兼容文件写入失败，已记录待修复`
                                            : `警告：${warning.code}`}
                                </div>
                            ))}
                        </div>
                        <div {...stylex.props(authoringStyles.replaceFooter)}>
                            <button type="button" className={`menu_button ${stylex.props(authoringStyles.saveButton).className ?? ''}`} onClick={handleClose}>
                                完成
                            </button>
                        </div>
                    </div>
                ) : (
                    <div {...stylex.props(authoringStyles.replaceBody)}>
                        <div {...stylex.props(authoringStyles.replaceFieldRow)}>
                            <label {...stylex.props(authoringStyles.replaceField)}>
                                <span {...stylex.props(authoringStyles.fieldLabel)}>查找</span>
                                <textarea
                                    className="text_pole"
                                    rows={2}
                                    value={query}
                                    autoFocus
                                    placeholder={regex ? '正则表达式（支持 $1 等捕获引用）' : '要查找的文本'}
                                    {...stylex.props(authoringStyles.control, authoringStyles.replaceQueryInput)}
                                    onChange={event => setQuery(event.target.value)}
                                />
                            </label>
                            <label {...stylex.props(authoringStyles.replaceField)}>
                                <span {...stylex.props(authoringStyles.fieldLabel)}>替换为</span>
                                <textarea
                                    className="text_pole"
                                    rows={2}
                                    value={replacement}
                                    placeholder="替换文本（可为空）"
                                    {...stylex.props(authoringStyles.control, authoringStyles.replaceQueryInput)}
                                    onChange={event => setReplacement(event.target.value)}
                                />
                            </label>
                        </div>
                        <div {...stylex.props(authoringStyles.replaceChecksRow)}>
                            <TextReplaceCheckRow checked={caseSensitive} label="区分大小写" disabled={busy !== ''} onChange={setCaseSensitive} />
                            <TextReplaceCheckRow checked={wholeWord} label="全词匹配" disabled={busy !== ''} onChange={setWholeWord} />
                            <TextReplaceCheckRow checked={regex} label="正则" disabled={busy !== ''} onChange={setRegex} />
                        </div>
                        <div {...stylex.props(authoringStyles.replaceScopeBlock)}>
                            <TextReplaceCheckRow
                                checked={cardArea}
                                label={<strong>角色字段</strong>}
                                disabled={busy !== ''}
                                onChange={setCardArea}
                            />
                            {cardArea ? (
                                <div {...stylex.props(authoringStyles.replaceChecksRow, authoringStyles.replaceChecksNested)}>
                                    {TEXT_REPLACE_CARD_FIELDS.map(field => (
                                        <TextReplaceCheckRow
                                            key={field.id}
                                            checked={cardFields.has(field.id)}
                                            label={field.id === 'tags' ? '标签（替换后去重）' : field.label}
                                            disabled={busy !== ''}
                                            onChange={checked => toggleField(cardFields, setCardFields, field.id, checked)}
                                        />
                                    ))}
                                </div>
                            ) : null}
                            <TextReplaceCheckRow
                                checked={worldArea}
                                label={<strong>世界书</strong>}
                                disabled={busy !== ''}
                                onChange={setWorldArea}
                            />
                            {worldArea ? (
                                <div {...stylex.props(authoringStyles.replaceChecksRow, authoringStyles.replaceChecksNested)}>
                                    {TEXT_REPLACE_WORLD_FIELDS.map(field => (
                                        <TextReplaceCheckRow
                                            key={field.id}
                                            checked={worldFields.has(field.id)}
                                            label={field.label}
                                            disabled={busy !== ''}
                                            onChange={checked => toggleField(worldFields, setWorldFields, field.id, checked)}
                                        />
                                    ))}
                                </div>
                            ) : null}
                            <TextReplaceCheckRow
                                checked={chatArea}
                                label={<strong>当前聊天</strong>}
                                disabled={busy !== ''}
                                onChange={setChatArea}
                            />
                            {chatArea ? (
                                <div {...stylex.props(authoringStyles.replaceChecksRow, authoringStyles.replaceChecksNested)}>
                                    {TEXT_REPLACE_CHAT_FIELDS.map(field => (
                                        <TextReplaceCheckRow
                                            key={field.id}
                                            checked={chatFields.has(field.id)}
                                            label={field.label}
                                            disabled={busy !== ''}
                                            onChange={checked => toggleField(chatFields, setChatFields, field.id, checked)}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        {error ? <div {...stylex.props(authoringStyles.replaceErrorText)}>{error}</div> : null}
                        {preview ? (
                            <div {...stylex.props(authoringStyles.replacePreviewBlock)}>
                                {previewStale ? (
                                    <div {...stylex.props(authoringStyles.replaceWarningText)}>参数已修改，请重新预览后再应用</div>
                                ) : null}
                                <div {...stylex.props(authoringStyles.fieldLabel)}>
                                    命中 {(effectiveOccurrences ?? 0).toString()} 处
                                </div>
                                {previewAreas?.worldBook?.boundCharacterCount && previewAreas.worldBook.boundCharacterCount > 1 ? (
                                    <div {...stylex.props(authoringStyles.replaceWarningText)}>
                                        世界书「{previewAreas.worldBook.name}」同时被 {previewAreas.worldBook.boundCharacterCount} 张角色卡使用
                                    </div>
                                ) : null}
                                {areaStatusNotes.map((note, index) => (
                                    <div key={index} {...stylex.props(authoringStyles.replaceMutedText)}>{note}</div>
                                ))}
                                {(preview.warnings ?? []).filter(warning => warning.code !== 'shared_world_book').map((warning, index) => (
                                    <div key={index} {...stylex.props(authoringStyles.replaceWarningText)}>警告：{warning.code}</div>
                                ))}
                                {matchGroups.length ? (
                                    <div {...stylex.props(authoringStyles.replaceMatchList)}>
                                        {matchGroups.map(group => (
                                            <div key={group.key}>
                                                <div {...stylex.props(authoringStyles.replaceGroupTitle)}>{group.title}</div>
                                                {group.matches.map((match, matchIndex) => (
                                                    <TextReplaceMatchRow
                                                        key={match.path ?? matchIndex}
                                                        match={match}
                                                        excluded={excluded.has(String(match.path ?? ''))}
                                                        onToggle={toggleExclude}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        <div {...stylex.props(authoringStyles.replaceFooter)}>
                            <button
                                type="button"
                                className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                                disabled={busy !== '' || !query.length}
                                onClick={() => void requestPreview()}
                            >
                                {busy === 'preview' ? '预览中…' : '预览'}
                            </button>
                            {preview && !previewStale ? (
                                <button
                                    type="button"
                                    className={`menu_button ${stylex.props(authoringStyles.saveButton).className ?? ''}`}
                                    disabled={busy !== '' || !(effectiveOccurrences && effectiveOccurrences > 0)}
                                    onClick={() => void requestApply()}
                                >
                                    {busy === 'apply' ? '应用中…' : `应用 ${effectiveOccurrences ?? 0} 处替换`}
                                </button>
                            ) : null}
                        </div>
                        <p {...stylex.props(authoringStyles.modalHint)}>
                            应用前请先预览确认命中；替换直接写入正式数据，没有内置回滚。
                        </p>
                    </div>
                )}
            </dialog>
        </div>,
        document.body,
    );
}

function AuthoringWorkspacePanel({
    kind,
    state,
    commands,
}: {
    kind: 'characterAuthoring';
    state?: unknown;
    commands?: AuthoringCommands;
}) {
    const bridgeState = asAuthoringState(state);
    const title = bridgeState.title ?? 'Character Authoring';
    const unsupportedFields = Array.isArray(bridgeState.unsupportedFields) ? bridgeState.unsupportedFields : [];
    const worldNames = Array.isArray(bridgeState.worldNames)
        ? bridgeState.worldNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        : [];
    const authoringDraft = bridgeState.draft;
    const authoringMode = bridgeState.mode ?? 'create';
    const managementActionDefs = bridgeState.managementActions;
    const initialSession = useMemo(() => createCharacterAuthoringSession(authoringDraft ?? {}, { mode: authoringMode }), [authoringDraft, authoringMode]);
    const [authoringSession, setAuthoringSession] = useState(initialSession);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [expandedField, setExpandedField] = useState<{ key: string; label: string } | null>(null);
    const [textReplaceOpen, setTextReplaceOpen] = useState(false);
    const [avatarPreviewOverride, setAvatarPreviewOverride] = useState<string | null>(null);
    const [liveManagementActions, setLiveManagementActions] = useState<AuthoringManagementAction[] | null>(null);
    const saveGenerationRef = useRef(0);
    const authoringCommandMutation = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => await commands?.saveCharacterAuthoring?.(payload),
        retry: false,
    });

    // Reset the session state when the incoming draft is replaced — the
    // adjust-state-during-render pattern replaces the old reset effect; the
    // save-generation guard stays in an effect because refs are not written
    // during render.
    const [previousInitialSession, setPreviousInitialSession] = useState(initialSession);
    if (previousInitialSession !== initialSession) {
        setPreviousInitialSession(initialSession);
        setAuthoringSession(initialSession);
        setFieldErrors({});
        setAdvancedOpen(false);
        setExpandedField(null);
        setTextReplaceOpen(false);
        setAvatarPreviewOverride(null);
    }

    useEffect(() => {
        saveGenerationRef.current += 1;
    }, [initialSession]);

    const [previousManagementActionDefs, setPreviousManagementActionDefs] = useState(managementActionDefs);
    if (previousManagementActionDefs !== managementActionDefs) {
        setPreviousManagementActionDefs(managementActionDefs);
        setLiveManagementActions(null);
    }

    const updateDraft = useCallback((patch: Record<string, unknown>) => {
        setAuthoringSession((currentSession: typeof initialSession) => currentSession.update(patch));
        setFieldErrors({});
    }, []);

    const submitDraft = useCallback(() => {
        if (authoringCommandMutation.isPending) {
            return;
        }
        const submitResult = authoringSession.submit();
        if (!submitResult.ok) {
            setFieldErrors((submitResult.fieldErrors ?? {}) as Record<string, string>);
            return;
        }

        setFieldErrors({});
        const saveGeneration = saveGenerationRef.current;
        const submittedDraft = authoringSession.draft;
        authoringCommandMutation.mutateAsync((submitResult.payload ?? {}) as Record<string, unknown>)
            .then((result) => {
                const ok = !(result && typeof result === 'object' && 'ok' in (result as Record<string, unknown>)
                    && (result as { ok?: boolean }).ok === false);
                if (!shouldApplyCharacterAuthoringSaveResult({
                    generation: saveGeneration,
                    activeGeneration: saveGenerationRef.current,
                    ok,
                })) {
                    return;
                }
                setAuthoringSession((currentSession: typeof initialSession) => {
                    if (currentSession.draft === submittedDraft) {
                        return createCharacterAuthoringSession(submittedDraft, { mode: authoringMode });
                    }
                    // The user kept typing while the save was in flight — keep the
                    // live draft and only advance the clean baseline so the
                    // remaining diff stays dirty for the next autosave pass.
                    return typeof currentSession.rebase === 'function'
                        ? currentSession.rebase(submittedDraft)
                        : createCharacterAuthoringSession(currentSession.draft, { mode: authoringMode });
                });
            })
            .catch(() => {
                // Mutation state carries the failed status; keep the dirty draft intact for retry.
            });
    }, [authoringCommandMutation, authoringSession, authoringMode]);

    const submitDraftRef = useRef(submitDraft);
    useEffect(() => {
        submitDraftRef.current = submitDraft;
    }, [submitDraft]);

    // Autosave: edit mode only — create-mode submits would mint a new card per pass.
    useEffect(() => {
        if (bridgeState.mode !== 'edit' || !authoringSession.dirty) {
            return;
        }
        const timer = window.setTimeout(() => submitDraftRef.current(), 900);
        return () => window.clearTimeout(timer);
    }, [authoringSession, bridgeState.mode]);

    const draft = authoringSession.draft as Record<string, unknown>;
    const stringDraft = (key: string) => (typeof draft[key] === 'string' ? draft[key] as string : '');
    const nameValue = stringDraft('name');
    const descriptionValue = stringDraft('description');
    const firstMessageValue = stringDraft('firstMessage');
    const tagsList = Array.isArray(draft.tags)
        ? draft.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];

    const depthPrompt = draft.depthPrompt && typeof draft.depthPrompt === 'object'
        ? draft.depthPrompt as { prompt?: string; depth?: number | null; role?: string | number | null }
        : { prompt: '', depth: null, role: 'system' };
    const characterToolPayload = authoringSession.submit();
    const characterActionPayload = characterToolPayload.ok ? characterToolPayload.payload : undefined;
    const characterToolActionPayload = characterActionPayload ? { ...characterActionPayload, draft } : undefined;
    const isCreateMode = authoringMode === 'create';
    const isActionPending = authoringCommandMutation.isPending;
    const dirtyFieldSet = new Set(authoringSession.dirtyFields);
    const isFieldDirty = (key: string) => dirtyFieldSet.has(key);
    const advancedChips = [
        stringDraft('systemPrompt').trim() ? { label: 'System prompt', field: 'systemPrompt' } : null,
        stringDraft('postHistoryInstructions').trim() ? { label: 'Post-history', field: 'postHistoryInstructions' } : null,
        stringDraft('scenario').trim() ? { label: 'Scenario', field: 'scenario' } : null,
        (depthPrompt.prompt?.trim() || depthPrompt.depth != null) ? { label: `Depth note @${depthPrompt.depth ?? 4}`, field: 'depthPrompt.prompt' } : null,
        stringDraft('creator').trim() ? { label: 'Creator', field: 'creator' } : null,
        stringDraft('characterVersion').trim() ? { label: `Version ${stringDraft('characterVersion').trim()}`, field: 'characterVersion' } : null,
        stringDraft('creatorNotes').trim() ? { label: 'Notes', field: 'creatorNotes' } : null,
    ].filter((chip): chip is { label: string; field: string } => chip !== null);
    const greetings = Array.isArray(draft.alternateGreetings)
        ? draft.alternateGreetings.filter((greeting): greeting is string => typeof greeting === 'string')
        : [];
    const jumpToAdvancedField = (fieldKey: string) => {
        setAdvancedOpen(true);
        window.requestAnimationFrame(() => {
            const target = document.querySelector(`[data-react-authoring-field="${CSS.escape(fieldKey)}"]`);
            target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            (target?.querySelector('textarea, input, select') as HTMLElement | null)?.focus({ preventScroll: true });
        });
    };
    useEffect(() => {
        return () => {
            if (avatarPreviewOverride) {
                URL.revokeObjectURL(avatarPreviewOverride);
            }
        };
    }, [avatarPreviewOverride]);
    const avatarPreviewSrc = avatarPreviewOverride || bridgeState.avatarUrl || 'img/ai4.png';
    const tokenTotal = String(bridgeState.tokenSummary?.total ?? '').trim();
    const tokenPermanent = String(bridgeState.tokenSummary?.permanent ?? '').trim();
    const managementActions = useMemo(
        () => (Array.isArray(managementActionDefs) ? managementActionDefs.filter(action => action && action.id) : [])
            .filter(action => !(isCreateMode && action.editAction)),
        [managementActionDefs, isCreateMode],
    );
    const getExpandedFieldValue = (key: string) =>
        key === 'depthPrompt.prompt' ? (depthPrompt.prompt ?? '') : stringDraft(key);
    const setExpandedFieldValue = (key: string, value: string) => {
        if (key === 'depthPrompt.prompt') {
            updateDraft({ depthPrompt: { ...depthPrompt, prompt: value } });
            return;
        }
        updateDraft({ [key]: value });
    };
    const refreshManagementActions = useCallback(() => {
        // The hidden select is the compatibility host; read live options so
        // extension-injected actions appear even if they were added post-mount.
        const dropdown = document.getElementById('char-management-dropdown');
        if (!(dropdown instanceof HTMLSelectElement)) {
            return;
        }
        setLiveManagementActions(
            Array.from(dropdown.options)
                .filter(option => option instanceof HTMLOptionElement && option.id)
                .map(option => ({
                    id: option.id,
                    label: option.textContent?.trim() || option.id,
                    danger: option.classList.contains('red_button'),
                    editAction: option.classList.contains('character-detail-edit-action'),
                }))
                .filter(action => !(isCreateMode && action.editAction)),
        );
    }, [isCreateMode]);

    return (
        <WorkspacePanelShell
            kind={kind as WorkspacePanelKind}
            title={title}
            status={authoringCommandMutation.isError ? 'error' : 'success'}
            hideDiagnostics={true}
        >
            <section
                {...stylex.props(authoringStyles.panel)}
                role="presentation"
                data-doc-id="feature.character_library_panel term.character_card page.chat_workspace"
                data-react-authoring-owner={kind}
                data-react-authoring-mode={bridgeState.mode ?? 'create'}
                data-react-authoring-dirty={authoringSession.dirty ? 'true' : 'false'}
                onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                        event.preventDefault();
                        submitDraft();
                    }
                }}
            >
                <header {...stylex.props(authoringStyles.panelHeader)}>
                    <div {...stylex.props(authoringStyles.panelKicker)}>{bridgeState.mode === 'edit' ? 'Editing' : 'Creating'}</div>
                    {!isCreateMode ? (
                        <span {...stylex.props(authoringStyles.footerStatus, authoringStyles.headerStatus)} aria-live="polite">
                            <i
                                {...stylex.props(
                                    authoringStyles.footerDot,
                                    authoringCommandMutation.isError
                                        ? authoringStyles.footerDotError
                                        : (authoringCommandMutation.isPending || authoringSession.dirty)
                                            ? authoringStyles.footerDotBusy
                                            : null,
                                )}
                                aria-hidden="true"
                            />
                            {authoringCommandMutation.isPending
                                ? 'Saving…'
                                : authoringCommandMutation.isError
                                    ? 'Save failed — next change retries'
                                    : authoringSession.dirty
                                        ? `${dirtyFieldSet.size} unsaved`
                                        : 'Saved'}
                        </span>
                    ) : null}
                </header>
                {unsupportedFields.length > 0 ? (
                    <output {...stylex.props(authoringStyles.panelWarning)}>
                        Extension data preserved on save but not editable here: {unsupportedFields.join(', ')}
                    </output>
                ) : null}
                <fieldset
                    {...stylex.props(authoringStyles.fields)}
                    disabled={isActionPending}
                    style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
                >
                    <div {...stylex.props(authoringStyles.section, authoringStyles.sectionFirst)} data-react-authoring-section="basics">
                        <div {...stylex.props(authoringStyles.heroRow)}>
                            <label {...stylex.props(authoringStyles.heroAvatar)} title="Change avatar" data-react-authoring-field="avatar">
                                <input
                                    type="button"
                                    className="avatar-upload-trigger"
                                    aria-label="Change character avatar"
                                    onClick={event => {
                                        event.preventDefault();
                                        document.getElementById('authoring-avatar-file')?.click();
                                    }}
                                />
                                <img
                                    {...stylex.props(authoringStyles.heroAvatarImg)}
                                    src={avatarPreviewSrc}
                                    alt="Character avatar"
                                    onError={(event) => {
                                        const img = event.currentTarget;
                                        if (!img.dataset.fallbackApplied) {
                                            img.dataset.fallbackApplied = 'true';
                                            img.src = 'img/ai4.png';
                                        }
                                    }}
                                />
                                <span {...stylex.props(authoringStyles.heroAvatarOverlay)} aria-hidden="true">
                                    <i className="fa-solid fa-camera" />
                                </span>
                                <input
                                    id="authoring-avatar-file"
                                    hidden
                                    type="file"
                                    accept="image/*"
                                    aria-label="Upload character avatar"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        const legacyInput = document.getElementById('add_avatar_button');
                                        if (file && legacyInput instanceof HTMLInputElement) {
                                            const transfer = new DataTransfer();
                                            transfer.items.add(file);
                                            legacyInput.files = transfer.files;
                                        }
                                        if (file) {
                                            setAvatarPreviewOverride(URL.createObjectURL(file));
                                            updateDraft({ avatar: file.name });
                                        }
                                    }}
                                />
                            </label>
                            <div {...stylex.props(authoringStyles.heroMain)}>
                                <label {...stylex.props(authoringStyles.field)} data-react-authoring-field="name">
                                    <span className="sr-only">Name</span>
                                    <input
                                        className="text_pole"
                                        {...stylex.props(authoringStyles.heroNameInput, authoringStyles.control)}
                                        value={nameValue}
                                        placeholder="Character name"
                                        aria-invalid={fieldErrors.name ? 'true' : 'false'}
                                        onChange={(event) => updateDraft({ name: event.target.value })}
                                    />
                                    {fieldErrors.name ? <small role="alert" {...stylex.props(authoringStyles.fieldWarning)}>{fieldErrors.name}</small> : null}
                                </label>
                                <div {...stylex.props(authoringStyles.heroMetaRow)}>
                                    <button
                                        type="button"
                                        {...stylex.props(authoringStyles.favToggle, draft.favorite ? authoringStyles.favToggleActive : null)}
                                        aria-pressed={Boolean(draft.favorite)}
                                        aria-label="Favorite"
                                        title="Toggle favorite"
                                        data-react-authoring-field="favorite"
                                        onClick={() => updateDraft({ favorite: !draft.favorite })}
                                    >
                                        <i className={`fa-${draft.favorite ? 'solid' : 'regular'} fa-star`} aria-hidden="true" />
                                        Favorite
                                    </button>
                                    {tokenTotal ? (
                                        <span
                                            {...stylex.props(authoringStyles.metaChip, authoringSession.dirty ? authoringStyles.metaChipStale : null)}
                                            title={authoringSession.dirty
                                                ? `${tokenTotal} tokens as of last save — recounts on next save`
                                                : `${tokenTotal} tokens${tokenPermanent ? ` (${tokenPermanent} permanent)` : ''} — last counted on save`}
                                        >
                                            <i className="fa-solid fa-coins" aria-hidden="true" />
                                            {authoringSession.dirty ? `~${tokenTotal}` : tokenTotal} tokens
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div {...stylex.props(authoringStyles.fieldRow)}>
                            <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                <div {...stylex.props(authoringStyles.field)} data-react-authoring-field="tags">
                                    <AuthoringFieldLabel text="Tags" dirty={isFieldDirty('tags')} />
                                    <TagChipInput
                                        values={tagsList}
                                        placeholder="Type a tag, press Enter"
                                        onCommit={next => updateDraft({ tags: next })}
                                    />
                                </div>
                            </div>
                            <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                <label {...stylex.props(authoringStyles.field)} data-react-authoring-field="characterWorld">
                                    <AuthoringFieldLabel text="World Info" dirty={isFieldDirty('characterWorld')} />
                                    <input
                                        className="text_pole"
                                        {...stylex.props(authoringStyles.control)}
                                        value={stringDraft('characterWorld')}
                                        onChange={(event) => updateDraft({ characterWorld: event.target.value })}
                                        placeholder="Linked world file name"
                                        list="authoring-character-world-names"
                                        aria-invalid={Boolean(stringDraft('characterWorld').trim()) && worldNames.length > 0 && !worldNames.includes(stringDraft('characterWorld').trim()) ? 'true' : undefined}
                                    />
                                    <datalist id="authoring-character-world-names">
                                        {worldNames.map(name => (
                                            <option key={name} value={name} />
                                        ))}
                                    </datalist>
                                    {stringDraft('characterWorld').trim() && worldNames.length > 0 && !worldNames.includes(stringDraft('characterWorld').trim()) ? (
                                        <small {...stylex.props(authoringStyles.fieldWarning)}>No world file with this name — the link will be ignored.</small>
                                    ) : null}
                                </label>
                            </div>
                        </div>
                    </div>
                    <div {...stylex.props(authoringStyles.section)} data-react-authoring-section="content">
                        <h4 {...stylex.props(authoringStyles.subsectionLabel)}>Card content</h4>
                        <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-description" data-react-authoring-field="description">
                            <AuthoringFieldLabel
                                text="Description"
                                dirty={isFieldDirty('description')}
                                meta={descriptionValue.trim() ? `${descriptionValue.length} chars` : undefined}
                                onExpand={() => setExpandedField({ key: 'description', label: 'Description' })}
                            />
                            <AuthoringTextarea
                                id="authoring-description"
                                rows={4}
                                value={descriptionValue}
                                xstyle={authoringStyles.textareaPreview}
                                placeholder="Describe the character. Supports {{char}} and {{user}} macros."
                                onChange={(event) => updateDraft({ description: event.target.value })}
                            />
                        </label>
                        <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-first-message" data-react-authoring-field="firstMessage">
                            <AuthoringFieldLabel
                                text="First message"
                                dirty={isFieldDirty('firstMessage')}
                                meta={firstMessageValue.trim() ? `${firstMessageValue.length} chars` : undefined}
                                onExpand={() => setExpandedField({ key: 'firstMessage', label: 'First message' })}
                            />
                            <AuthoringTextarea
                                id="authoring-first-message"
                                rows={3}
                                value={firstMessageValue}
                                xstyle={authoringStyles.textareaPreview}
                                placeholder="The opening message. Supports {{char}} and {{user}} macros."
                                onChange={(event) => updateDraft({ firstMessage: event.target.value })}
                            />
                        </label>
                        <div {...stylex.props(authoringStyles.field)} data-react-authoring-field="alternateGreetings">
                            <AuthoringFieldLabel
                                text="Alternate greetings"
                                dirty={isFieldDirty('alternateGreetings')}
                                meta={`${greetings.length} greeting${greetings.length === 1 ? '' : 's'}`}
                            />
                            <button
                                type="button"
                                {...stylex.props(authoringStyles.greetingAdd)}
                                onClick={() => void commands?.openAlternateGreetings?.(characterToolActionPayload)}
                            >
                                <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                                {greetings.length > 0 ? 'Manage greetings' : 'Add alternate greetings'}
                            </button>
                            {greetings.length > 0 ? (
                                <p {...stylex.props(authoringStyles.greetingPreview)} title={greetings[0]}>
                                    {greetings[0]}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <section {...stylex.props(authoringStyles.advancedSection)} data-react-authoring-section="advanced">
                        <div {...stylex.props(authoringStyles.advancedHead)}>
                            <button
                                type="button"
                                {...stylex.props(authoringStyles.advancedToggle)}
                                aria-expanded={advancedOpen}
                                aria-controls="character-authoring-advanced-body"
                                onClick={() => setAdvancedOpen(open => !open)}
                            >
                                <i
                                    className={`fa-solid fa-chevron-down ${stylex.props(authoringStyles.advancedToggleIcon, advancedOpen ? authoringStyles.advancedToggleIconOpen : null).className ?? ''}`}
                                    aria-hidden="true"
                                />
                                <span>Advanced</span>
                            </button>
                            {advancedChips.length > 0 ? (
                                <span
                                    {...stylex.props(authoringStyles.advancedChips)}
                                    title={advancedChips.map(chip => chip.label).join(' · ')}
                                >
                                    {advancedChips.slice(0, 3).map(chip => (
                                        <button
                                            key={chip.field}
                                            type="button"
                                            {...stylex.props(authoringStyles.advancedChipButton)}
                                            title={`Jump to ${chip.label}`}
                                            onClick={() => jumpToAdvancedField(chip.field)}
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                    {advancedChips.length > 3 ? (
                                        <button
                                            type="button"
                                            {...stylex.props(authoringStyles.advancedChipButton)}
                                            title={`Show ${advancedChips.length - 3} more — jump to ${advancedChips[3].label}`}
                                            onClick={() => jumpToAdvancedField(advancedChips[3].field)}
                                        >
                                            +{advancedChips.length - 3}
                                        </button>
                                    ) : null}
                                </span>
                            ) : null}
                        </div>
                        {!advancedOpen && advancedChips.length === 0 ? (
                            <p {...stylex.props(authoringStyles.advancedHint)}>
                                Prompt overrides, extra definition fields, character note and creator metadata.
                            </p>
                        ) : null}
                        <div {...stylex.props(authoringStyles.advancedClip, advancedOpen ? authoringStyles.advancedClipOpen : null)}>
                            <div
                                id="character-authoring-advanced-body"
                                inert={!advancedOpen}
                                aria-hidden={!advancedOpen}
                                {...stylex.props(authoringStyles.advancedBody)}
                            >
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>Prompt overrides</h4>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-system-prompt" data-react-authoring-field="systemPrompt">
                                        <AuthoringFieldLabel text="System prompt" dirty={isFieldDirty('systemPrompt')} meta={stringDraft('systemPrompt').trim() ? `${stringDraft('systemPrompt').length} chars` : undefined} onExpand={() => setExpandedField({ key: 'systemPrompt', label: 'System prompt' })} />
                                        <AuthoringTextarea
                                            id="authoring-system-prompt"
                                            rows={2}
                                            value={stringDraft('systemPrompt')}
                                            placeholder="Replaces the default main prompt. Use {{original}} to include it."
                                            onChange={(event) => updateDraft({ systemPrompt: event.target.value })}
                                        />
                                    </label>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-post-history-instructions" data-react-authoring-field="postHistoryInstructions">
                                        <AuthoringFieldLabel text="Post-history instructions" dirty={isFieldDirty('postHistoryInstructions')} meta={stringDraft('postHistoryInstructions').trim() ? `${stringDraft('postHistoryInstructions').length} chars` : undefined} onExpand={() => setExpandedField({ key: 'postHistoryInstructions', label: 'Post-history instructions' })} />
                                        <AuthoringTextarea
                                            id="authoring-post-history-instructions"
                                            rows={2}
                                            value={stringDraft('postHistoryInstructions')}
                                            placeholder="Replaces the default post-history instructions. Use {{original}} to include it."
                                            onChange={(event) => updateDraft({ postHistoryInstructions: event.target.value })}
                                        />
                                    </label>
                                </div>
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>Definition</h4>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-scenario" data-react-authoring-field="scenario">
                                        <AuthoringFieldLabel text="Scenario" dirty={isFieldDirty('scenario')} meta={stringDraft('scenario').trim() ? `${stringDraft('scenario').length} chars` : undefined} onExpand={() => setExpandedField({ key: 'scenario', label: 'Scenario' })} />
                                        <AuthoringTextarea
                                            id="authoring-scenario"
                                            rows={2}
                                            value={stringDraft('scenario')}
                                            onChange={(event) => updateDraft({ scenario: event.target.value })}
                                        />
                                    </label>
                                </div>
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>Character&apos;s note</h4>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-depth-prompt" data-react-authoring-field="depthPrompt.prompt">
                                        <AuthoringFieldLabel text="Depth prompt" dirty={isFieldDirty('depthPrompt')} meta={depthPrompt.prompt?.trim() ? `${depthPrompt.prompt.length} chars` : undefined} onExpand={() => setExpandedField({ key: 'depthPrompt.prompt', label: 'Depth prompt' })} />
                                        <AuthoringTextarea
                                            id="authoring-depth-prompt"
                                            rows={2}
                                            value={depthPrompt.prompt ?? ''}
                                            placeholder="Inserted in-chat at the chosen depth and role."
                                            onChange={(event) => updateDraft({
                                                depthPrompt: { ...depthPrompt, prompt: event.target.value },
                                            })}
                                        />
                                    </label>
                                    <div {...stylex.props(authoringStyles.fieldRow)}>
                                        <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                            <label {...stylex.props(authoringStyles.field)} data-react-authoring-field="depthPrompt.depth">
                                                <AuthoringFieldLabel text="Depth" dirty={isFieldDirty('depthPrompt')} />
                                                <input
                                                    className="text_pole"
                                                    {...stylex.props(authoringStyles.control)}
                                                    type="number"
                                                    min={0}
                                                    value={depthPrompt.depth ?? ''}
                                                    onChange={(event) => updateDraft({
                                                        depthPrompt: {
                                                            ...depthPrompt,
                                                            depth: event.target.value === '' ? null : Number(event.target.value),
                                                        },
                                                    })}
                                                />
                                            </label>
                                        </div>
                                        <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                            <label {...stylex.props(authoringStyles.field)} data-react-authoring-field="depthPrompt.role">
                                                <AuthoringFieldLabel text="Depth role" dirty={isFieldDirty('depthPrompt')} />
                                                <select
                                                    className="text_pole"
                                                    {...stylex.props(authoringStyles.control)}
                                                    value={String(depthPrompt.role ?? 'system')}
                                                    onChange={(event) => updateDraft({
                                                        depthPrompt: { ...depthPrompt, role: event.target.value },
                                                    })}
                                                >
                                                    <option value="system">System</option>
                                                    <option value="user">User</option>
                                                    <option value="assistant">Assistant</option>
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>Creator metadata</h4>
                                    <div {...stylex.props(authoringStyles.fieldRow)}>
                                        <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                            <label {...stylex.props(authoringStyles.field)} data-react-authoring-field="creator">
                                                <AuthoringFieldLabel text="Creator" dirty={isFieldDirty('creator')} />
                                                <input
                                                    className="text_pole"
                                                    {...stylex.props(authoringStyles.control)}
                                                    value={stringDraft('creator')}
                                                    onChange={(event) => updateDraft({ creator: event.target.value })}
                                                />
                                            </label>
                                        </div>
                                        <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                            <label {...stylex.props(authoringStyles.field)} data-react-authoring-field="characterVersion">
                                                <AuthoringFieldLabel text="Character version" dirty={isFieldDirty('characterVersion')} />
                                                <input
                                                    className="text_pole"
                                                    {...stylex.props(authoringStyles.control)}
                                                    value={stringDraft('characterVersion')}
                                                    onChange={(event) => updateDraft({ characterVersion: event.target.value })}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-creator-notes" data-react-authoring-field="creatorNotes">
                                        <AuthoringFieldLabel text="Creator notes" dirty={isFieldDirty('creatorNotes')} meta={stringDraft('creatorNotes').trim() ? `${stringDraft('creatorNotes').length} chars` : undefined} onExpand={() => setExpandedField({ key: 'creatorNotes', label: 'Creator notes' })} />
                                        <AuthoringTextarea
                                            id="authoring-creator-notes"
                                            rows={2}
                                            value={stringDraft('creatorNotes')}
                                            placeholder="Shown in the character list. Not sent to the model."
                                            onChange={(event) => updateDraft({ creatorNotes: event.target.value })}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </section>
                </fieldset>
                <div {...stylex.props(authoringStyles.panelActions)} aria-label={`${title} actions`}>
                    {!isCreateMode ? (
                        <button
                            type="button"
                            className={`menu_button ${stylex.props(authoringStyles.dangerButton).className ?? ''}`}
                            disabled={isActionPending}
                            title="Permanently delete this card — the confirmation can also remove its chats"
                            onClick={() => void commands?.deleteAuthoring?.(kind)}
                        >
                            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                            Delete
                        </button>
                    ) : null}
                    {isCreateMode ? (
                        <button
                            type="button"
                            className={`menu_button ${stylex.props(authoringStyles.saveButton).className ?? ''}`}
                            disabled={isActionPending}
                            title="Create character (Ctrl+S)"
                            onClick={submitDraft}
                        >
                            Create
                        </button>
                    ) : null}
                    <div {...stylex.props(authoringStyles.footerTools)}>
                        <button
                            type="button"
                            className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                            disabled={isActionPending}
                            onClick={() => void commands?.openWorldInfo?.(characterToolActionPayload)}
                        >
                            World Info
                        </button>
                        {!isCreateMode ? (
                            <button
                                type="button"
                                className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                                disabled={isActionPending}
                                data-character-export-trigger=""
                                onClick={() => void commands?.exportAuthoring?.(characterToolActionPayload)}
                            >
                                Export
                            </button>
                        ) : null}
                        {!isCreateMode ? (
                            <button
                                type="button"
                                className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                                disabled={isActionPending}
                                title="在角色卡、绑定世界书和当前聊天中查找替换文本"
                                onClick={() => setTextReplaceOpen(true)}
                            >
                                查找替换
                            </button>
                        ) : null}
                        <AuthoringActionsMenu
                            actions={liveManagementActions ?? managementActions}
                            disabled={isActionPending}
                            onOpen={refreshManagementActions}
                            onRun={actionId => void commands?.runManagementAction?.({ ...characterToolActionPayload, actionId })}
                        />
                    </div>
                </div>
                {textReplaceOpen ? (
                    <CharacterAuthoringTextReplaceDialog
                        commands={commands}
                        payload={characterToolActionPayload}
                        onClose={(applied) => {
                            setTextReplaceOpen(false);
                            if (applied) {
                                void commands?.closeTextReplace?.({ applied });
                            }
                        }}
                    />
                ) : null}
                {expandedField ? createPortal(
                    <div
                        {...stylex.props(authoringStyles.modalOverlay)}
                        role="presentation"
                        onMouseDown={(event) => {
                            event.stopPropagation();
                            if (event.target === event.currentTarget) {
                                setExpandedField(null);
                            }
                        }}
                        onMouseUp={event => event.stopPropagation()}
                        onClick={event => event.stopPropagation()}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                event.stopPropagation();
                                setExpandedField(null);
                            }
                            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                                event.preventDefault();
                                submitDraft();
                            }
                        }}
                    >
                        <dialog open aria-modal="true" aria-label={expandedField.label} {...stylex.props(authoringStyles.modalCard)}>
                            <div {...stylex.props(authoringStyles.modalHead)}>
                                <span {...stylex.props(authoringStyles.modalTitle)}>{expandedField.label}</span>
                                <span {...stylex.props(authoringStyles.fieldMeta)}>
                                    {getExpandedFieldValue(expandedField.key).length} chars
                                </span>
                                <button
                                    type="button"
                                    {...stylex.props(authoringStyles.iconAction)}
                                    title="Close editor"
                                    aria-label="Close editor"
                                    onClick={() => setExpandedField(null)}
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            </div>
                            <AuthoringTextarea
                                autoFocus
                                value={getExpandedFieldValue(expandedField.key)}
                                xstyle={authoringStyles.modalTextarea}
                                onChange={(event) => setExpandedFieldValue(expandedField.key, event.target.value)}
                            />
                            <p {...stylex.props(authoringStyles.modalHint)}>
                                Esc to close{bridgeState.mode === 'edit' ? ' — changes autosave' : ''}. Ctrl+S saves now.
                            </p>
                        </dialog>
                    </div>,
                    document.body,
                ) : null}
            </section>
        </WorkspacePanelShell>
    );
}

function MainChatMessageListWorkspacePanel({
    commands,
}: {
    commands?: MainChatCommands;
}) {
    const mainChatStore = getMainChatStore();
    const mainChatStoreSnapshot = useSyncExternalStore(
        mainChatStore.subscribe,
        mainChatStore.getState().getSnapshot,
        mainChatStore.getState().getSnapshot,
    );
    const snapshot = mainChatStoreSnapshot;
    const messageIds = mainChatStoreSnapshot.window.visibleMessageIds.length > 0
        ? mainChatStoreSnapshot.window.visibleMessageIds
        : mainChatStoreSnapshot.orderedMessageIds;
    const messages = messageIds
        .map(messageId => mainChatStoreSnapshot.messagesById[messageId])
        .filter((message): message is NonNullable<typeof message> => Boolean(message));
    // Turn-summary display projection: covered ids collapse into a card at the
    // anchor position; expanded cards keep the card header and render the
    // covered rows underneath. Auto-refill is authoritative in the legacy
    // reconcile (status flip reintroduces raw rows on the next snapshot).
    const [expandedTurnKeys, setExpandedTurnKeys] = useState<ReadonlySet<string>>(() => new Set());
    const turnSummaries = mainChatStoreSnapshot.turnSummaries ?? [];
    const turnSummaryByAnchor = useMemo(() => {
        const map = new Map<string, (typeof turnSummaries)[number]>();
        const visibleIds = new Set(messages.map(message => message.id));
        for (const entry of turnSummaries) {
            // Anchor at the first covered message that is actually rendered —
            // the record's coveredMessageIds[0] can sit outside the current
            // window slice, which would hide the card entirely.
            const anchor = entry.coveredMessageIds.find(id => visibleIds.has(id));
            if (anchor !== undefined) {
                map.set(anchor, entry);
            }
        }
        return map;
    }, [turnSummaries, messages]);
    const coveredMessageIds = useMemo(() => {
        const ids = new Set<string>();
        for (const entry of turnSummaries) {
            for (const coveredId of entry.coveredMessageIds) {
                ids.add(coveredId);
            }
        }
        return ids;
    }, [turnSummaries]);
    // Drop expansion state for turn keys that no longer resolve (chat switch,
    // summary removal) so stale keys cannot leak into another chat's cards.
    const expandedActiveTurnKeys = useMemo(() => {
        const validKeys = new Set(turnSummaries.map(entry => entry.turnKey));
        const pruned = new Set<string>();
        for (const key of expandedTurnKeys) {
            if (validKeys.has(key)) {
                pruned.add(key);
            }
        }
        return pruned;
    }, [expandedTurnKeys, turnSummaries]);
    const handleTurnSummaryToggle = useCallback((turnKey: string, expanded: boolean) => {
        setExpandedTurnKeys(current => {
            const next = new Set(current);
            if (expanded) {
                next.add(turnKey);
            } else {
                next.delete(turnKey);
            }
            return next;
        });
    }, []);
    const slash = mainChatStoreSnapshot.slash;
    const shouldShowSlashAutocomplete = slash.autocompleteVisible && slash.options.length > 0;
    const shouldShowSlashDetails = slash.detailsVisible && slash.detailsHtml !== '';
    const shouldShowSlashStatus = slash.paused || slash.aborted || slash.errorLabel !== null;

    useEffect(() => {
        void commands?.setSlashVisibleOwner(true);
        return () => {
            void commands?.setSlashVisibleOwner(false);
        };
    }, [commands]);

    return (
        <>
            {/* Message-row controls render as native <button> elements carrying
                the legacy icon classes; reset the UA button chrome those classes
                never specified (.menu_button provides its own background/border,
                so only appearance is reset). */}
            <style>{`
button.mes_button {
    -webkit-appearance: none;
    appearance: none;
    background: none;
    border: none;
}

button.menu_button {
    -webkit-appearance: none;
    appearance: none;
}
`}</style>
            {snapshot.window.showMoreVisible ? (
                <button
                    type="button"
                    id="show_more_messages"
                    data-main-chat-windowing-owner="react"
                    data-main-chat-load-more-owner="react"
                    onClick={event => {
                        event.stopPropagation();
                        void commands?.loadMoreMessages();
                    }}
                >
                    Show more messages
                </button>
            ) : null}
            {shouldShowSlashAutocomplete ? (
                <div
                    className="autoComplete-wrap"
                    data-main-chat-slash-ui-owner="react"
                    style={{ left: '0', right: '0', bottom: '100%' }}
                >
                    <ul className="autoComplete">
                        {slash.options.map((option, index) => (
                            <li
                                key={`${option.type}:${option.name}`}
                                className={`item${option.selected ? ' selected' : ''}${option.selectable ? '' : ' not-selectable'}`}
                                data-option-type={option.type}
                                data-main-chat-slash-option={option.name}
                                onPointerDown={event => {
                                    event.preventDefault();
                                    if (option.selectable) {
                                        void commands?.selectSlashAutocompleteOption(index);
                                    }
                                }}
                            >
                                <span className="type monospace">{option.typeIcon || ' '}</span>
                                <span className="specs">
                                    <span className="name monospace">/{option.name}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {shouldShowSlashStatus || shouldShowSlashDetails ? (
                <div
                    className="autoComplete-detailsWrap full"
                    data-main-chat-slash-ui-details="react"
                    style={{ left: '0', right: '0', bottom: '100%' }}
                >
                    <div className="autoComplete-details">
                        {shouldShowSlashStatus ? (
                            <output>
                                {slash.errorLabel
                                    ? `Error: ${slash.errorLabel}`
                                    : slash.aborted
                                        ? 'Aborted'
                                        : slash.paused
                                            ? 'Paused'
                                            : ''}
                            </output>
                        ) : null}
                        {/* Audited: detailsHtml is serialized DOM produced by first-party
                            SlashCommand.renderDetails() builders (public/scripts/slash-commands.js),
                            mirroring the legacy `.append()` path. Not raw user input. */}
                        {shouldShowSlashDetails ? (
                            <div dangerouslySetInnerHTML={{ __html: slash.detailsHtml }} />
                        ) : null}
                    </div>
                </div>
            ) : null}
            {messages.map(message => {
                const turnSummary = turnSummaryByAnchor.get(message.id);
                const covered = coveredMessageIds.has(message.id);
                if (covered && !turnSummary) {
                    // Covered by a summary whose anchor is elsewhere in the list —
                    // collapsed turns only render their card.
                    const owner = turnSummaries.find(entry => entry.coveredMessageIds.includes(message.id));
                    if (owner && !expandedActiveTurnKeys.has(owner.turnKey)) {
                        return null;
                    }
                }
                const expanded = turnSummary ? expandedActiveTurnKeys.has(turnSummary.turnKey) : false;
                if (covered && turnSummary && !expanded) {
                    return (
                        <TurnSummaryCard
                            key={`summary:${turnSummary.turnKey}`}
                            summary={turnSummary}
                            expanded={false}
                            onToggle={handleTurnSummaryToggle}
                        />
                    );
                }
                return (
                    <Fragment key={message.uid || message.id}>
                        {turnSummary ? (
                            <TurnSummaryCard
                                summary={turnSummary}
                                expanded={true}
                                onToggle={handleTurnSummaryToggle}
                            />
                        ) : null}
                        <MainChatMessageRow
                            message={message}
                            commands={commands}
                            isLast={message.id === messageIds.at(-1)}
                        />
                    </Fragment>
                );
            })}
        </>
    );
}

function renderPanel(
    kind: WorkspacePanelKind,
    state: unknown,
    commands: WorkspacePanelBridge | undefined,
): ReactNode {
    switch (kind) {
        case 'worldInfo':
            return <WorldInfoWorkspacePanel state={state} commands={commands as WorldInfoCommands} />;
        case 'mainChatMessageList':
            return <MainChatMessageListWorkspacePanel commands={commands as MainChatCommands | undefined} />;
        case 'characterAuthoring':
            return <AuthoringWorkspacePanel kind="characterAuthoring" state={state} commands={commands as AuthoringCommands | undefined} />;
        default:
            return <WorkspacePanelPlaceholder kind={kind} />;
    }
}

function WorkspacePanelRoot({
    kind,
    commands,
}: {
    kind: WorkspacePanelKind;
    commands?: WorkspacePanelBridge;
}) {
    const { data: panelState } = useQuery({
        queryKey: workspacePanelStateQueryKey(kind),
        queryFn: async () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        initialData: () => queryClient.getQueryData(workspacePanelStateQueryKey(kind)) ?? null,
        staleTime: Number.POSITIVE_INFINITY,
    });

    return renderPanel(kind, panelState, commands);
}

const workspaceShellNavigationEntries: WorkspaceShellNavigationEntry[] = [
    { command: 'openPromptManager', icon: 'fa-sliders', label: '提示词', panelKind: 'promptManager', slotKey: 'promptManager' },
    { command: 'openCharacterLibrary', icon: 'fa-address-book', label: '角色库', panelKind: 'characterLibrary', slotKey: 'characterLibrary' },
    { command: 'openWorldInfo', icon: 'fa-book-atlas', label: '世界书', panelKind: 'worldInfo', slotKey: 'worldInfo' },
    { command: 'openRegex', icon: 'fa-code', label: '正则', panelKind: 'regex', slotKey: 'regex' },
    { command: 'openSettings', icon: 'fa-gear', label: '设置', panelKind: 'settings', slotKey: 'settings' },
];

function asWorkspacePanelDockDispatchResult(result: unknown): WorkspacePanelDockDispatchResult {
    if (!result || typeof result !== 'object') {
        return {};
    }

    return result as WorkspacePanelDockDispatchResult;
}

function getWorkspacePanelDockFallbackReason(result: unknown) {
    const dispatchResult = asWorkspacePanelDockDispatchResult(result);
    return typeof dispatchResult.reason === 'string' && dispatchResult.reason.trim()
        ? dispatchResult.reason
        : null;
}

function normalizeWorkspacePanelDockStatus(result: unknown) {
    const dispatchResult = asWorkspacePanelDockDispatchResult(result);
    if (dispatchResult.mounted === true || dispatchResult.status === 'mounted') {
        return 'success';
    }

    if (dispatchResult.status === 'disabled') {
        return 'disabled';
    }

    if (dispatchResult.status === 'fallback') {
        return dispatchResult.reason === 'feature-disabled' ? 'disabled' : 'error';
    }

    if (
        dispatchResult.status === 'loading'
        || dispatchResult.status === 'empty'
        || dispatchResult.status === 'success'
        || dispatchResult.status === 'error'
    ) {
        return dispatchResult.status;
    }

    return 'success';
}

function getWorkspacePanelVisibleStatusLabel(status: WorkspacePanelStatus) {
    switch (status) {
        case 'loading':
            return 'opening';
        case 'empty':
            return 'needs setup';
        case 'error':
            return 'needs attention';
        case 'idle':
            return 'idle';
        case 'success':
        default:
            return 'ready';
    }
}

function useWorkspacePanelDockSnapshot() {
    const [dockSnapshot, setDockSnapshot] = useState<WorkspacePanelDockSnapshot>(
        () => getWorkspacePanelDockSnapshot() as WorkspacePanelDockSnapshot,
    );

    useEffect(() => subscribeWorkspacePanelDock((nextSnapshot: WorkspacePanelDockSnapshot) => {
        setDockSnapshot(nextSnapshot);
    }), []);

    return dockSnapshot;
}

function executeWorkspaceShellNavigationCommand(
    commands: WorkspaceShellCommands | undefined,
    command: WorkspaceShellNavigationEntry['command'],
) {
    if (!commands) {
        return undefined;
    }

    switch (command) {
        case 'openCharacterLibrary':
            return commands.openCharacterLibrary();
        case 'openWorldInfo':
            return commands.openWorldInfo();
        case 'openSettings':
            return commands.openSettings();
        case 'openCharacterAuthoring':
            return commands.openCharacterAuthoring();
        case 'openRegex':
            return commands.openRegex();
        case 'openPromptManager':
            return commands.openPromptManager();
        case 'activateWorkspaceShellSlot':
        case 'deactivateWorkspaceShellSlot':
        case 'closeWorkspacePanel':
        case 'setWorkspaceShellSlotPinned':
            throw new Error(`Workspace shell command requires explicit arguments: ${command}`);
    }
}

function ReactWorkspaceShellChrome({
    state = {},
    commands,
    runtime: _runtime,
}: {
    state?: WorkspaceShellChromeState;
    commands?: WorkspaceShellCommands;
    runtime: RuntimePort;
}) {
    const contextTitle = state.contextTitle?.trim() || 'Choose a character';
    const status = state.status ?? (state.activeContext === 'none' ? 'empty' : 'success');
    const dockSnapshot = useWorkspacePanelDockSnapshot();
    const panelDispatchSequenceRef = useRef(0);
    // A close intent queues a deferred unmount behind setTimeout; while it is
    // pending the dock snapshot still reports the panel as active, so a second
    // click in that window must mean "reopen" (supersede the close), not a
    // second close that would outlive the reopen.
    const pendingCloseIntentRef = useRef<string | null>(null);

    // Drawers can close without a nav dispatch (Escape, the chrome close
    // button, mutual exclusion when another drawer opens). The legacy shell
    // emits emberdesk:workspace-drawer-change from its open/close funnels;
    // reconcile the dock highlight so a closed drawer's entry does not stay
    // pressed.
    useEffect(() => {
        const reconcileDockWithDrawers = () => {
            const dock = getWorkspacePanelDockSnapshot();
            const active = dock.activePanelKind;
            if (!active) {
                return;
            }
            const entry = workspaceShellNavigationEntries.find(
                candidate => candidate.panelKind === active && candidate.slotKey,
            );
            if (!entry?.slotKey) {
                return;
            }
            const slot = getWorkspaceShellChildSlot(entry.slotKey);
            const drawer = document.querySelector(slot.mountTarget)?.closest('.drawer-content');
            if (drawer && !drawer.classList.contains('openDrawer')) {
                recordWorkspacePanelDockClose(active);
            }
        };
        window.addEventListener('emberdesk:workspace-drawer-change', reconcileDockWithDrawers);
        return () => window.removeEventListener('emberdesk:workspace-drawer-change', reconcileDockWithDrawers);
    }, []);

    const dispatchCommand = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        if (entry.panelKind) {
            panelDispatchSequenceRef.current = dispatchSequence;
            recordWorkspacePanelDockIntent(entry.panelKind);
        }

        try {
            const result = entry.slotKey
                ? await commands?.activateWorkspaceShellSlot(entry.slotKey)
                : await executeWorkspaceShellNavigationCommand(commands, entry.command);
            if (entry.panelKind) {
                if (panelDispatchSequenceRef.current !== dispatchSequence) {
                    return;
                }
                recordWorkspacePanelDockResult(entry.panelKind, {
                    fallbackReason: getWorkspacePanelDockFallbackReason(result),
                    status: normalizeWorkspacePanelDockStatus(result),
                });
            }
        } catch (error) {
            if (entry.panelKind) {
                if (panelDispatchSequenceRef.current !== dispatchSequence) {
                    return;
                }
                recordWorkspacePanelDockResult(entry.panelKind, {
                    fallbackReason: 'action-failed',
                    status: 'error',
                });
            }
            console.warn('React workspace shell panel action failed.', error);
        }
    }, [commands]);

    const closePanel = useCallback(async (entry: WorkspaceShellNavigationEntry) => {
        if (!entry.panelKind) {
            return;
        }

        const dispatchSequence = panelDispatchSequenceRef.current + 1;
        panelDispatchSequenceRef.current = dispatchSequence;
        try {
            if (entry.slotKey) {
                await commands?.deactivateWorkspaceShellSlot(entry.slotKey);
            } else {
                await commands?.closeWorkspacePanel(entry.panelKind);
            }
            if (panelDispatchSequenceRef.current !== dispatchSequence) {
                return;
            }
            // A close guard (e.g. unsaved settings) may have refused the close;
            // the drawer is still open, so keep the dock highlight.
            const slot = entry.slotKey ? getWorkspaceShellChildSlot(entry.slotKey) : null;
            if (slot?.mountTarget
                && document.querySelector(slot.mountTarget)?.closest('.drawer-content')?.classList.contains('openDrawer')) {
                return;
            }
            recordWorkspacePanelDockClose(entry.panelKind);
        } catch (error) {
            if (panelDispatchSequenceRef.current !== dispatchSequence) {
                return;
            }
            recordWorkspacePanelDockResult(entry.panelKind, {
                fallbackReason: 'close-failed',
                status: 'error',
            });
            console.warn('React workspace shell panel close failed.', error);
        }
    }, [commands]);

    return (
        <header
            {...stylex.props(workspaceShellStyles.chrome)}
            data-react-workspace-shell-chrome="true"
            data-react-workspace-shell-chrome-status={status}
            data-react-workspace-shell-chrome-context={state.activeContext ?? 'none'}
            data-doc-id="feature.next_workspace_shell page.chat_workspace"
        >
            <section {...stylex.props(workspaceShellStyles.context)} aria-label="Current workspace context">
                <div {...stylex.props(workspaceShellStyles.title)}>{contextTitle}</div>
            </section>
            <nav {...stylex.props(workspaceShellStyles.nav)} aria-label="工作区导航">
                {workspaceShellNavigationEntries.map(entry => {
                    const isPanelEntryActive = Boolean(entry.panelKind && dockSnapshot.activePanelKind === entry.panelKind);
                    const childSlot = entry.slotKey ? getWorkspaceShellChildSlot(entry.slotKey) : null;
                    // Drawer lock state is the .pinnedOpen class on the drawer
                    // host, restored by the legacy init pass from the NavLockOn /
                    // LNavLockOn storage seeds. The class changes without a React
                    // re-render, so the click guard re-reads it at click time.
                    const isDrawerPinned = () => Boolean(childSlot?.mountTarget
                        && document.querySelector(childSlot.mountTarget)?.closest('.drawer-content')?.classList.contains('pinnedOpen'));
                    const isPinned = isDrawerPinned();
                    const panelActionLabel = entry.panelKind
                        ? `${isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned ? 'Close' : 'Open'} ${entry.label}`
                        : entry.label;

                    return (
                        <Fragment key={entry.command}>
                            <button
                                type="button"
                                {...stylex.props(workspaceShellStyles.navButton, isPanelEntryActive ? workspaceShellStyles.navButtonActive : null)}
                                aria-label={panelActionLabel}
                                title={panelActionLabel}
                                aria-pressed={entry.panelKind ? isPanelEntryActive : undefined}
                                data-workspace-shell-panel-entry={entry.panelKind}
                                data-workspace-shell-panel-active={isPanelEntryActive ? 'true' : 'false'}
                                data-workspace-shell-child-slot={entry.slotKey}
                                data-workspace-shell-child-slot-owner={childSlot?.contentOwner}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (entry.panelKind
                                        && isPanelEntryActive
                                        && pendingCloseIntentRef.current !== entry.panelKind
                                        && dockSnapshot.activePanelStatus !== 'error'
                                        && !isDrawerPinned()) {
                                        pendingCloseIntentRef.current = entry.panelKind;
                                        window.setTimeout(() => {
                                            void closePanel(entry).finally(() => {
                                                if (pendingCloseIntentRef.current === entry.panelKind) {
                                                    pendingCloseIntentRef.current = null;
                                                }
                                            });
                                        }, 0);
                                        return;
                                    }
                                    window.setTimeout(() => {
                                        void dispatchCommand(entry);
                                    }, 0);
                                }}
                            >
                                <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                                <span {...stylex.props(workspaceShellStyles.navButtonLabel)}>{entry.label}</span>
                            </button>
                        </Fragment>
                    );
                })}
            </nav>
        </header>
    );
}

function renderIntoShellChrome(mount: WorkspaceShellChromeMount) {
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <QueryClientProvider client={queryClient}>
                    <ReactWorkspaceShellChrome state={mount.state} commands={mount.commands} runtime={mount.runtime} />
                </QueryClientProvider>
            </Theme>
        </StrictMode>,
    );
}

function syncMainChatStoreSnapshot(state: unknown) {
    const mainChatSnapshot = asMainChatMessageListState(state).mainChatSnapshot;
    const mainChatStore = getMainChatStore();

    if (mainChatSnapshot) {
        mainChatStore.getState().replaceSnapshot(mainChatSnapshot);
        return;
    }

    mainChatStore.getState().reset();
}

function renderIntoPanel(mount: WorkspacePanelMount) {
    if (mount.kind === 'mainChatMessageList') {
        syncMainChatStoreSnapshot(mount.state);
    }
    recordWorkspacePanelUpdate(mount.kind, mount.state ?? null, mount.commands);
    if (mount.kind === 'mainChatMessageList') {
        updateMainChatObservation(mount.state ?? {});
    }
    queryClient.setQueryData(workspacePanelStateQueryKey(mount.kind), mount.state ?? null);
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <QueryClientProvider client={queryClient}>
                    <WorkspacePanelRoot kind={mount.kind} commands={mount.commands} />
                </QueryClientProvider>
            </Theme>
        </StrictMode>,
    );
}


/**
 * Settings drawer content host. The drawer chrome (title/pin/close) is shared
 * with the other top-center panels via WorkspacePanelChrome; Escape,
 * mutual-exclusion, pin refusal, and the unsaved-changes guard all run
 * through closeWorkspaceChildSlotHost in script.js. The dirty flag is
 * mirrored to globalThis.__emberDeskSettingsDirty for that close guard.
 */
function SettingsDrawerHost({
    initialTab,
    runtime,
}: {
    initialTab?: string | null;
    runtime: RuntimePort;
}) {
    const handleSettingsDirtyChange = useCallback((dirty: boolean) => {
        (globalThis as Record<string, unknown>).__emberDeskSettingsDirty = dirty;
    }, []);

    return (
        <WorkspacePanelChrome
            title="设置"
            icon="fa-solid fa-gear"
            grabberId="SettingsPanelheader"
        >
            <SettingsSurface
                variant="drawer"
                initialTab={initialTab}
                onDirtyStateChange={handleSettingsDirtyChange}
                runtime={runtime}
            />
        </WorkspacePanelChrome>
    );
}

function renderSettingsPanel(mount: SettingsPanelMount) {
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <QueryClientProvider client={queryClient}>
                    <SettingsDrawerHost
                        initialTab={mount.initialTab}
                        runtime={mount.runtime}
                    />
                </QueryClientProvider>
            </Theme>
        </StrictMode>,
    );
}

/**
 * Mounts the settings surface inside the #SettingsPanel drawer-content host.
 * The React root persists while the drawer toggles, so form state survives
 * close/reopen; the surface only re-renders when a new initialTab is passed.
 */
export function mountSettingsPanel(options: {
    runtime: RuntimePort;
    initialTab?: string | null;
}) {
    attachGlobalCompatibilityBridge();
    const initialTab = typeof options.initialTab === 'string' ? options.initialTab : null;
    if (mountedSettingsPanel) {
        mountedSettingsPanel.initialTab = initialTab;
        mountedSettingsPanel.runtime = options.runtime;
        renderSettingsPanel(mountedSettingsPanel);
        return { kind: 'settings', mounted: true, status: 'mounted' as const };
    }

    const drawer = document.getElementById('SettingsPanel');
    if (!(drawer instanceof HTMLElement)) {
        return { kind: 'settings', mounted: false, status: 'error' as const, reason: 'host-missing' as const };
    }
    const host = document.createElement('div');
    host.id = 'emberdesk-react-settings-panel-host';
    host.setAttribute('data-react-settings-panel-host', 'true');
    drawer.replaceChildren(host);

    mountedSettingsPanel = {
        root: createRoot(host),
        host,
        runtime: options.runtime,
        initialTab,
    };
    renderSettingsPanel(mountedSettingsPanel);
    return { kind: 'settings', mounted: true, status: 'mounted' as const };
}

export function unmountSettingsPanel() {
    if (!mountedSettingsPanel) {
        return;
    }
    mountedSettingsPanel.root.unmount();
    mountedSettingsPanel.host.remove();
    mountedSettingsPanel = null;
    (globalThis as Record<string, unknown>).__emberDeskSettingsDirty = false;
    if (mountedPanels.size === 0 && !mountedShellChrome) {
        detachGlobalCompatibilityBridge();
    }
}

export function mountWorkspacePanel(kind: WorkspacePanelKind, container: HTMLElement, options: WorkspacePanelMountOptions) {
    attachGlobalCompatibilityBridge();
    const existingPanel = mountedPanels.get(kind);
    if (existingPanel) {
        if (existingPanel.container !== container) {
            existingPanel.root.unmount();
            mountedPanels.delete(kind);
        } else {
            existingPanel.state = options.state;
            existingPanel.commands = options.commands;
            existingPanel.runtime = options.runtime;
            renderIntoPanel(existingPanel);
            return;
        }
    }

    const mount = {
        root: createRoot(container),
        container,
        kind,
        runtime: options.runtime,
        state: options.state,
        commands: options.commands,
    };
    mountedPanels.set(kind, mount);
    recordWorkspacePanelMount(kind, options.state ?? null, options.commands);
    renderIntoPanel(mount);
}

export function mountWorkspaceShellChrome(container: HTMLElement, options: WorkspaceShellChromeMountOptions) {
    attachGlobalCompatibilityBridge();
    if (mountedShellChrome) {
        if (mountedShellChrome.container !== container) {
            mountedShellChrome.root.unmount();
        } else {
            mountedShellChrome.state = options.state;
            mountedShellChrome.commands = options.commands;
            mountedShellChrome.runtime = options.runtime;
            renderIntoShellChrome(mountedShellChrome);
            return;
        }
    }

    mountedShellChrome = {
        root: createRoot(container),
        container,
        runtime: options.runtime,
        state: options.state,
        commands: options.commands,
    };
    renderIntoShellChrome(mountedShellChrome);
}

export function unmountWorkspaceShellChrome() {
    if (!mountedShellChrome) {
        return;
    }

    mountedShellChrome.root.unmount();
    mountedShellChrome = null;
    if (mountedPanels.size === 0) {
        detachGlobalCompatibilityBridge();
    }
}

export function updateWorkspacePanel(kind: WorkspacePanelKind, options: { state?: unknown } = {}) {
    const mount = mountedPanels.get(kind);
    if (!mount) {
        return;
    }

    if ('state' in options) {
        mount.state = options.state;
    }
    renderIntoPanel(mount);
}

export function unmountWorkspacePanel(kind: WorkspacePanelKind) {
    const mount = mountedPanels.get(kind);
    if (!mount) {
        return;
    }

    mount.root.unmount();
    mountedPanels.delete(kind);
    recordWorkspacePanelUnmount(kind);
    if (kind === 'mainChatMessageList') {
        resetMainChatObservationStore();
    }
    if (mountedPanels.size === 0) {
        detachGlobalCompatibilityBridge();
    }
}

interface ChatBackupsMount {
    root: Root;
    host: HTMLElement;
    options: ChatBackupsMountOptions;
}

interface ChatBackupsMountOptions {
    buttonContainer: HTMLElement;
    listContainer: HTMLElement;
    commands: ChatBackupsCommands;
    /** Bump to force a list reload while the browser stays open. */
    refreshToken?: number;
}

let mountedChatBackups: ChatBackupsMount | null = null;

function renderChatBackupsBrowser(mount: ChatBackupsMount) {
    mount.root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <ChatBackupsBrowser
                    buttonContainer={mount.options.buttonContainer}
                    listContainer={mount.options.listContainer}
                    commands={mount.options.commands}
                    refreshToken={mount.options.refreshToken ?? 0}
                />
            </Theme>
        </StrictMode>,
    );
}

export function mountChatBackupsBrowser(options: ChatBackupsMountOptions) {
    attachGlobalCompatibilityBridge();
    if (mountedChatBackups) {
        mountedChatBackups.options = options;
        renderChatBackupsBrowser(mountedChatBackups);
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-chat-backups-host';
    host.setAttribute('data-react-chat-backups-host', 'true');
    host.style.display = 'none';
    document.body.appendChild(host);

    mountedChatBackups = {
        root: createRoot(host),
        host,
        options,
    };
    renderChatBackupsBrowser(mountedChatBackups);
}

export function unmountChatBackupsBrowser() {
    if (!mountedChatBackups) {
        return;
    }

    mountedChatBackups.root.unmount();
    mountedChatBackups.host.remove();
    mountedChatBackups = null;
    if (mountedPanels.size === 0 && !mountedShellChrome && !mountedSettingsPanel) {
        detachGlobalCompatibilityBridge();
    }
}

const mountedSmallPanels = new Map<HTMLElement, Root>();

function mountSmallPanel(container: HTMLElement, element: ReactElement) {
    attachGlobalCompatibilityBridge();
    if (mountedSmallPanels.has(container)) {
        return;
    }

    const root = createRoot(container);
    mountedSmallPanels.set(container, root);
    // Commit synchronously: adapters bind legacy handlers to the rendered
    // IDs immediately after the mount call returns.
    flushSync(() => root.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                {element}
            </Theme>
        </StrictMode>,
    ));
}


/**
 * Mounts the Tag Management popup content inside the legacy popup shell.
 * Presentation-only: tags.js keeps behavior ownership via delegated
 * .tag_view_* handlers and #tag_sort_mode_select.
 */
export function mountTagManagement(container: HTMLElement, options: { bogusFolders: boolean }) {
    mountSmallPanel(container, <TagManagement bogusFolders={options.bogusFolders} />);
}

/**
 * Mounts the Regex Editor popup content inside the legacy popup shell.
 * Presentation-only: extensions/regex/index.js keeps behavior ownership via
 * the preserved field classes and element IDs.
 */
export function mountRegexEditor(container: HTMLElement) {
    mountSmallPanel(container, <RegexEditor />);
}

/**
 * Mounts the Regex extension settings drawer content. Presentation-only:
 * extensions/regex/index.js keeps behavior ownership.
 */
export function mountRegexSettings(container: HTMLElement) {
    mountSmallPanel(container, <RegexSettingsPanel />);
}

/**
 * Mounts the Tool Binding editor popup chrome inside a caller-provided node.
 * public/scripts/tool-bindings.js fills values and owns persistence.
 */
export function mountToolBindingEditor(container: HTMLElement) {
    mountSmallPanel(container, <ToolBindingEditor />);
}

/**
 * Mounts the Regex Debugger popup chrome. The rule/step templates inside are
 * rendered inertly; legacy code clones them into the dynamic lists.
 */
export function mountRegexDebugger(container: HTMLElement) {
    mountSmallPanel(container, <RegexDebugger />);
}

/**
 * Mounts the regex import target picker inside the legacy popup shell.
 */
export function mountRegexImportTarget(container: HTMLElement, options: { characterName?: string; presetName?: string }) {
    mountSmallPanel(container, <RegexImportTarget {...options} />);
}

/**
 * Mounts the Macro documentation browser inside a caller-provided node
 * (e.g. inside a chat message). The adapter supplies live MacroDefinition
 * objects and the legacy detail/signature renderers as helpers.
 */
export function mountMacroBrowser(container: HTMLElement, props: MacroBrowserProps) {
    mountSmallPanel(container, <MacroBrowserPanel {...props} />);
}

/**
 * Mounts the World Info drawer markup. Presentation-only: world-info.js keeps
 * behavior ownership and fills dynamic containers (entry list, editor select).
 */
export function mountWorldInfoPanel(container: HTMLElement) {
    mountSmallPanel(container, <WorldInfoPanel />);
}

/**
 * Mounts the chat composer markup into #send_form. Synchronous commit:
 * script.js binds #send_but/#send_textarea handlers immediately after.
 */
export function mountChatComposer(container: HTMLElement) {
    mountSmallPanel(container, <ChatComposer />);
}

/**
 * Mounts the Advanced Definitions popup markup into #character_popup.
 * The shell stays legacy-owned (display/opacity transitions); inner markup
 * is React-rendered before script.js binds #character_cross/#character_popup_ok.
 */
export function mountCharacterPopup(container: HTMLElement) {
    mountSmallPanel(container, <CharacterPopup />);
}

/**
 * Mounts the right navigation panel markup into #right-nav-panel.
 * Synchronous commit: script.js binds #form_create and toolbar buttons,
 * tags.js fills .rm_tag_filter, and the character list renders into
 * #rm_print_characters_block — all after this mount.
 */
export function mountRightNavPanel(container: HTMLElement) {
    mountSmallPanel(container, <RightNavPanel />);
}

/**
 * Mounts the AI response configuration drawer into #left-nav-panel.
 * The outer markup preserves legacy IDs so openai.js bindings, the preset
 * manager, and settings_map wiring reactivate unchanged; the prompt list
 * inside #completion_prompt_manager is a React view over the legacy bridge
 * (oai_settings.prompts / prompt_order).
 */
export function mountPromptPanel(container: HTMLElement, bridge: PromptPanelBridge) {
    mountSmallPanel(container, <AiConfigPanel promptList={<PromptManagerList bridge={bridge} />} presetSaveButton={<PresetSaveButton bridge={bridge} />} promptHeaderActions={<><PromptInspectorButton bridge={bridge} /><PromptManagerAddButton bridge={bridge} /></>} />);
}

let promptInspectorContainer: HTMLElement | null = null;

/**
 * Mounts the prompt-inspector overlay into a host div appended to <body> by
 * the legacy shell. The bridge produces preview snapshots; the component is
 * presentation-only.
 */
export function mountPromptInspector(container: HTMLElement, bridge: PromptInspectorBridge) {
    promptInspectorContainer = container;
    mountSmallPanel(container, <PromptInspector bridge={bridge} />);
}

export function unmountPromptInspector() {
    const container = promptInspectorContainer;
    promptInspectorContainer = null;
    if (!container) {
        return;
    }
    const root = mountedSmallPanels.get(container);
    mountedSmallPanels.delete(container);
    root?.unmount();
}

/**
 * Mounts the past-chats popup header/list shell into #select_chat_popup.
 * The list rows inside #select_chat_div are React-owned via mountSelectChatList.
 */
export function mountSelectChatPopup(container: HTMLElement) {
    mountSmallPanel(container, <SelectChatPopup />);
}

let selectChatListRoot: Root | null = null;
let selectChatListContainer: HTMLElement | null = null;
let selectChatListBridge: SelectChatListBridge | null = null;
let selectChatListState: SelectChatListState | null = null;

function renderSelectChatList() {
    if (!selectChatListContainer || !selectChatListBridge || !selectChatListState) {
        return;
    }
    if (!selectChatListContainer.isConnected) {
        // Popup shell replaces children on remount; drop the stale root.
        selectChatListRoot = null;
        selectChatListContainer = null;
        return;
    }
    selectChatListRoot ??= createRoot(selectChatListContainer);
    // Synchronous commit: delegated handlers and post-render measurements
    // (highlight scroll/flash) run immediately after this returns.
    flushSync(() => selectChatListRoot?.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <SelectChatList state={selectChatListState as SelectChatListState} bridge={selectChatListBridge as SelectChatListBridge} />
            </Theme>
        </StrictMode>,
    ));
}

/**
 * Mounts or updates the React-owned chat list inside #select_chat_div.
 * displayChats (chat-ops-service) stays the fetch/sort orchestration and calls
 * this with projected row data. Returns false when the container is absent so
 * the caller can fail closed.
 */
export function mountSelectChatList(container: HTMLElement, bridge: SelectChatListBridge, state: SelectChatListState): boolean {
    if (!(container instanceof HTMLElement)) {
        return false;
    }
    attachGlobalCompatibilityBridge();
    selectChatListContainer = container;
    selectChatListBridge = bridge;
    selectChatListState = state;
    renderSelectChatList();
    return true;
}

export function updateSelectChatList(state: SelectChatListState): boolean {
    if (!selectChatListContainer?.isConnected) {
        return false;
    }
    selectChatListState = state;
    renderSelectChatList();
    return true;
}

/**
 * Mounts the character context menu items into #character_context_menu.
 * Must run before bulk-edit init binds CharacterContextMenu's click handlers.
 */
export function mountCharacterContextMenu(container: HTMLElement) {
    mountSmallPanel(container, <CharacterContextMenu />);
}

let optionsMenuRoot: Root | null = null;
let optionsMenuContainer: HTMLElement | null = null;
let optionsMenuState: { showBackToMain: boolean; canRegenerate: boolean } = { showBackToMain: false, canRegenerate: false };

function renderOptionsMenu() {
    if (!optionsMenuContainer?.isConnected) {
        return;
    }
    optionsMenuRoot ??= createRoot(optionsMenuContainer);
    flushSync(() => optionsMenuRoot?.render(
        <StrictMode>
            <Theme theme={emberDeskTheme} mode="dark">
                <OptionsMenu showBackToMain={optionsMenuState.showBackToMain} canRegenerate={optionsMenuState.canRegenerate} />
            </Theme>
        </StrictMode>,
    ));
}

/**
 * Mounts the options popup items into #options. The shell keeps its
 * display:none + Popper positioning; item click bindings land after mount.
 * Item visibility/enabled state (branch "Back to parent", "Regenerate") is
 * state-driven via updateOptionsMenuState so legacy jQuery .show()/.hide()
 * calls are retired.
 */
export function mountOptionsMenu(container: HTMLElement, state?: { showBackToMain?: boolean; canRegenerate?: boolean }) {
    attachGlobalCompatibilityBridge();
    optionsMenuContainer = container;
    optionsMenuState = { ...optionsMenuState, ...state };
    renderOptionsMenu();
}

export function updateOptionsMenuState(patch: Partial<typeof optionsMenuState>): boolean {
    if (!optionsMenuContainer?.isConnected) {
        return false;
    }
    optionsMenuState = { ...optionsMenuState, ...patch };
    renderOptionsMenu();
    return true;
}

/**
 * Mounts the export-format buttons into #export_format_popup. Clicks are
 * delegated at document level; mount only needs to precede user interaction.
 */
export function mountExportFormatPopup(container: HTMLElement) {
    mountSmallPanel(container, <ExportFormatPopup />);
}

/**
 * Mounts the confirm-popup buttons into #dialogue_popup_controls. The popup
 * shell (text/input/holder) stays legacy; dom-handlers.js binds the buttons
 * by ID after mount.
 */
export function mountDialoguePopupControls(container: HTMLElement) {
    mountSmallPanel(container, <DialoguePopupControls />);
}

/**
 * Mounts the delete-messages confirm buttons into #dialogue_del_mes. The
 * container stays legacy; dom-handlers.js binds the buttons by ID after mount.
 */
export function mountDialogueDelMesControls(container: HTMLElement) {
    mountSmallPanel(container, <DialogueDelMesControls />);
}
