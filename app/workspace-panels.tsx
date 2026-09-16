import { Fragment, StrictMode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

import {
    attachGlobalCompatibilityBridge,
    detachGlobalCompatibilityBridge,
} from './compat/global-compatibility-bridge.js';
import type { RuntimePort } from './compat/runtime-port';
import type {
    AuthoringCommands,
    ExtensionsHostCommands,
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
    recordWorkspacePanelDockPin,
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
import {
    createCharacterAuthoringSession,
    shouldApplyCharacterAuthoringSaveResult,
} from '../public/scripts/character-authoring.js';

import {
    WorldInfoWorkbenchPanel,
    type WorldInfoWorkspacePanelState as WorldInfoWorkbenchPanelState,
} from './world-info-workbench';
import { SettingsSurface } from './components/settings/SettingsSurface';
import './styles/settings-surface.css';

function parseFiniteNumber(value: string): number | undefined {
    if (value.trim() === '') {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export type WorkspacePanelKind = 'worldInfo' | 'extensionsHost' | 'mainChatMessageList' | 'characterAuthoring';
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

interface ExtensionsHostWorkspacePanelState {
    extensionsSettingsPresent?: boolean;
    extensionsSettings2Present?: boolean;
    regexContainerPresent?: boolean;
    extensionsMenuButtonPresent?: boolean;
    extensionsMenuPresent?: boolean;
    extrasApiControlsPresent?: boolean;
    manageButtonPresent?: boolean;
    installButtonPresent?: boolean;
    notifyUpdatesEnabled?: boolean;
    extrasApiUrl?: string;
    extrasApiKeySet?: boolean;
    autoconnectEnabled?: boolean;
    extrasStatusText?: string;
    mountPointStatuses?: ExtensionsHostReactMountPointStatus[];
    deferredState?: 'idle' | 'loading' | 'failed';
    deferredPlaceholderPresent?: boolean;
}

interface ExtensionsHostReactMountPointStatus {
    id: string;
    label: string;
    ready?: boolean;
}

interface MainChatMessageListWorkspacePanelState {
    mainChatSnapshot?: MainChatSnapshot;
}

interface AuthoringWorkspacePanelState {
    mode?: 'create' | 'edit';
    title?: string;
    subtitle?: string;
    dirty?: boolean;
    unsupportedFields?: string[];
    draft?: Record<string, unknown>;
    candidates?: AuthoringCandidateState[];
    tagOptions?: AuthoringCandidateState[];
}

interface AuthoringCandidateState {
    id: string;
    label: string;
}


const queryClient = new QueryClient();
const mountedPanels = new Map<WorkspacePanelKind, WorkspacePanelMount>();
let mountedShellChrome: WorkspaceShellChromeMount | null = null;

interface SettingsOverlayMount {
    root: Root;
    host: HTMLElement;
    returnFocusTo: HTMLElement | null;
    runtime: RuntimePort;
    initialTab: string | null;
    panelKind: WorkspaceDockPanelKind;
    onRequestClose?: () => void;
}

let mountedSettingsOverlay: SettingsOverlayMount | null = null;

const extensionsHostPanelFormSchema = z.object({
    extrasApiUrl: z.string(),
    extrasApiKey: z.string(),
});

function buildExtensionsHostPanelFormDefaults(state: ExtensionsHostWorkspacePanelState) {
    return {
        extrasApiUrl: state.extrasApiUrl ?? '',
        extrasApiKey: '',
    };
}

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
    slots = [],
    children,
}: {
    kind: WorkspacePanelKind;
    title: string;
    status: WorkspacePanelStatus;
    actions?: WorkspacePanelRecoveryAction[];
    legacyBoundary?: string;
    hideDiagnostics?: boolean;
    slots?: WorkspacePanelLegacySlot[];
    children: ReactNode;
}) {
    const boundaryAttributes = legacyBoundary ? {
        [`data-${kind.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-legacy-boundary`]: legacyBoundary,
    } : {};

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel={kind}
            data-react-workspace-panel-shell={kind}
            data-workspace-panel-status={status}
            {...boundaryAttributes}
        >
            <div className="flex-container flexFlowColumn gap8">
                <div className="flex-container justifyspacebetween alignitemscenter gap8">
                    <div className="title_restorable">{title}</div>
                    {status === 'loading' || status === 'error' ? (
                        <span
                            className="workspace-panel-status-badge"
                            data-workspace-panel-status={status}
                        >
                            {getWorkspacePanelVisibleStatusLabel(status)}
                        </span>
                    ) : null}
                </div>
                {actions.length > 0 ? (
                    <div
                        className="workspace-panel-recovery"
                        data-workspace-panel-recovery-state={status}
                    >
                        <div className="workspace-panel-recovery-actions">
                            {actions.map(action => (
                                <button
                                    key={action.id}
                                    type="button"
                                    className="menu_button menu_button_icon"
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
                    <details className="workspace-panel-diagnostics" data-workspace-panel-diagnostics={kind}>
                        <summary>Diagnostics</summary>
                        <div className="flex-container flexFlowColumn gap4">
                            <div className="flex-container justifyspacebetween alignitemscenter gap8">
                                <span>Status</span>
                                <span className="workspace-panel-status-badge" data-workspace-panel-status={status}>{status}</span>
                            </div>
                            {slots.length > 0 ? (
                                <div className="flex-container flexFlowColumn gap4" data-workspace-legacy-slots={kind}>
                                    {slots.map(slot => {
                                        const protectedSlot = slot.id === 'extensions-settings'
                                            || slot.id === 'extensions-settings2'
                                            || slot.id === 'regex-container'
                                            || slot.id === 'extensions-menu-button'
                                            || slot.id === 'extensions-menu';

                                        return (
                                            <div
                                                key={slot.id}
                                                className={protectedSlot ? 'workspace-panel-legacy-slot workspace-panel-legacy-slot-protected' : 'workspace-panel-legacy-slot'}
                                                data-workspace-legacy-slot={slot.id}
                                                data-workspace-legacy-slot-ready={slot.ready ? 'true' : 'false'}
                                            >
                                                <span>{slot.label}</span>
                                                <span
                                                    className="workspace-panel-legacy-slot-status"
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

function asExtensionsHostState(state: unknown): ExtensionsHostWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as ExtensionsHostWorkspacePanelState;
}

function asAuthoringState(state: unknown): AuthoringWorkspacePanelState {
    if (!state || typeof state !== 'object') {
        return {};
    }

    return state as AuthoringWorkspacePanelState;
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
    const subtitle = bridgeState.subtitle ?? 'React owner for character drafts';
    const unsupportedFields = Array.isArray(bridgeState.unsupportedFields) ? bridgeState.unsupportedFields : [];
    const initialSession = useMemo(() => createCharacterAuthoringSession(bridgeState.draft ?? {}, { mode: bridgeState.mode ?? 'create' }), [bridgeState.draft, bridgeState.mode]);
    const [authoringSession, setAuthoringSession] = useState(initialSession);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const saveGenerationRef = useRef(0);
    const authoringCommandMutation = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => await commands?.saveCharacterAuthoring?.(payload),
        retry: false,
    });

    useEffect(() => {
        saveGenerationRef.current += 1;
        setAuthoringSession(initialSession);
        setFieldErrors({});
    }, [initialSession]);

    const updateDraft = useCallback((patch: Record<string, unknown>) => {
        setAuthoringSession((currentSession: typeof initialSession) => currentSession.update(patch));
        setFieldErrors({});
    }, []);

    const submitDraft = useCallback(() => {
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
                setAuthoringSession(() => createCharacterAuthoringSession(submittedDraft, { mode: bridgeState.mode ?? 'create' }));
            })
            .catch(() => {
                // Mutation state carries the failed status; keep the dirty draft intact for retry.
            });
    }, [authoringCommandMutation, authoringSession, bridgeState.mode, kind]);

    const cancelDraft = useCallback(() => {
        saveGenerationRef.current += 1;
        setAuthoringSession((currentSession: typeof initialSession) => currentSession.cancel());
        setFieldErrors({});
        void commands?.cancelAuthoring?.(kind);
    }, [commands, kind]);

    const draft = authoringSession.draft as Record<string, unknown>;
    const statusLabel = authoringCommandMutation.isPending ? 'Saving' : authoringSession.dirty ? 'Unsaved' : 'Ready';
    const stringDraft = (key: string) => (typeof draft[key] === 'string' ? draft[key] as string : '');
    const nameValue = stringDraft('name');
    const descriptionValue = stringDraft('description');
    const firstMessageValue = stringDraft('firstMessage');
    const tagsText = Array.isArray(draft.tags)
        ? draft.tags.filter((tag): tag is string => typeof tag === 'string').join(', ')
        : '';
    const alternateGreetingsText = Array.isArray(draft.alternateGreetings)
        ? draft.alternateGreetings.filter((item): item is string => typeof item === 'string').join('\n')
        : '';
    const depthPrompt = draft.depthPrompt && typeof draft.depthPrompt === 'object'
        ? draft.depthPrompt as { prompt?: string; depth?: number | null; role?: string | number | null }
        : { prompt: '', depth: null, role: 'system' };
    const characterToolPayload = authoringSession.submit();
    const characterActionPayload = characterToolPayload.ok ? characterToolPayload.payload : undefined;
    const characterToolActionPayload = characterActionPayload ? { ...characterActionPayload, draft } : undefined;
    const isCreateMode = (bridgeState.mode ?? 'create') === 'create';
    const isActionPending = authoringCommandMutation.isPending;

    return (
        <WorkspacePanelShell
            kind={kind as WorkspacePanelKind}
            title={title}
            status={authoringCommandMutation.isError ? 'error' : 'success'}
        >
            <section
                className="react-authoring-panel"
                data-doc-id="feature.character_library_panel term.character_card page.chat_workspace"
                data-react-authoring-owner={kind}
                data-react-authoring-mode={bridgeState.mode ?? 'create'}
                data-react-authoring-dirty={authoringSession.dirty ? 'true' : 'false'}
            >
                <header className="react-authoring-panel-header">
                    <div>
                        <div className="react-authoring-panel-kicker">{bridgeState.mode === 'edit' ? 'Editing' : 'Creating'}</div>
                        <h3>{title}</h3>
                        <p>{subtitle}</p>
                    </div>
                    <span className="react-authoring-panel-state" aria-live="polite">
                        {statusLabel}
                    </span>
                </header>
                {unsupportedFields.length > 0 ? (
                    <div className="react-authoring-panel-warning" role="status">
                        Unsupported extension fields are preserved server-side and not edited here: {unsupportedFields.join(', ')}
                    </div>
                ) : null}
                <div className="react-authoring-panel-actions" aria-label={`${title} actions`}>
                    <button type="button" className="menu_button react-authoring-save" disabled={isActionPending} onClick={submitDraft}>Save</button>
                    <button type="button" className="menu_button react-authoring-secondary-action" disabled={isActionPending} onClick={cancelDraft}>Cancel</button>
                    <>
                            <button
                                type="button"
                                className="menu_button react-authoring-tool-action"
                                disabled={isActionPending}
                                onClick={() => void commands?.openWorldInfo?.(characterToolActionPayload)}
                            >
                                World Info
                            </button>
                            <button
                                type="button"
                                className="menu_button react-authoring-tool-action"
                                disabled={isActionPending}
                                onClick={() => void commands?.openAlternateGreetings?.(characterToolActionPayload)}
                            >
                                Alternate Greetings
                            </button>
                            <button type="button" className="menu_button react-authoring-tool-action" disabled={isActionPending} onClick={() => void commands?.duplicateAuthoring?.(kind)}>Duplicate</button>
                            <button type="button" className="menu_button react-authoring-tool-action" disabled={isActionPending} onClick={() => void commands?.exportAuthoring?.(characterActionPayload)}>Export</button>
                    </>
                </div>
                <fieldset
                    className="react-authoring-fields"
                    disabled={isActionPending}
                    style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
                >
                    <label className="react-authoring-field" data-react-authoring-field="name">
                        <span>Name</span>
                        <input
                            className="text_pole"
                            value={nameValue}
                            aria-invalid={fieldErrors.name ? 'true' : 'false'}
                            onChange={(event) => updateDraft({ name: event.target.value })}
                        />
                        {fieldErrors.name ? <small role="alert">{fieldErrors.name}</small> : null}
                    </label>
                    <>
                            <div className="react-authoring-field" data-react-authoring-field="avatar">
                                <span>Avatar</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('avatar')}
                                    aria-label="Avatar filename"
                                    onChange={(event) => updateDraft({ avatar: event.target.value })}
                                    placeholder="Avatar filename"
                                />
                                <input
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
                                            updateDraft({ avatar: file.name });
                                        }
                                    }}
                                />
                            </div>
                            <label className="react-authoring-field" data-react-authoring-field="favorite">
                                <span>Favorite</span>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.favorite)}
                                    onChange={(event) => updateDraft({ favorite: event.target.checked })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="description">
                                <span>Description</span>
                                <textarea
                                    className="text_pole"
                                    rows={5}
                                    value={descriptionValue}
                                    onChange={(event) => updateDraft({ description: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="firstMessage">
                                <span>First message</span>
                                <textarea
                                    className="text_pole"
                                    rows={4}
                                    value={firstMessageValue}
                                    onChange={(event) => updateDraft({ firstMessage: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="alternateGreetings">
                                <span>Alternate greetings</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={alternateGreetingsText}
                                    onChange={(event) => updateDraft({
                                        alternateGreetings: event.target.value
                                            .split('\n')
                                            .map(line => line.trimEnd())
                                            .filter((line, index, lines) => line.length > 0 || index < lines.length - 1),
                                    })}
                                    placeholder="One greeting per line"
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="personality">
                                <span>Personality</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('personality')}
                                    onChange={(event) => updateDraft({ personality: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="scenario">
                                <span>Scenario</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('scenario')}
                                    onChange={(event) => updateDraft({ scenario: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="exampleMessages">
                                <span>Example messages</span>
                                <textarea
                                    className="text_pole"
                                    rows={4}
                                    value={stringDraft('exampleMessages')}
                                    onChange={(event) => updateDraft({ exampleMessages: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="systemPrompt">
                                <span>System prompt</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('systemPrompt')}
                                    onChange={(event) => updateDraft({ systemPrompt: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="postHistoryInstructions">
                                <span>Post-history instructions</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('postHistoryInstructions')}
                                    onChange={(event) => updateDraft({ postHistoryInstructions: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="creatorNotes">
                                <span>Creator notes</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={stringDraft('creatorNotes')}
                                    onChange={(event) => updateDraft({ creatorNotes: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="creator">
                                <span>Creator</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('creator')}
                                    onChange={(event) => updateDraft({ creator: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="characterVersion">
                                <span>Character version</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('characterVersion')}
                                    onChange={(event) => updateDraft({ characterVersion: event.target.value })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="tags">
                                <span>Tags</span>
                                <input
                                    className="text_pole"
                                    value={tagsText}
                                    onChange={(event) => updateDraft({
                                        tags: event.target.value
                                            .split(',')
                                            .map(tag => tag.trim())
                                            .filter(Boolean),
                                    })}
                                    placeholder="Comma-separated tags"
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="characterWorld">
                                <span>World Info</span>
                                <input
                                    className="text_pole"
                                    value={stringDraft('characterWorld')}
                                    onChange={(event) => updateDraft({ characterWorld: event.target.value })}
                                    placeholder="Linked world file name"
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="depthPrompt.prompt">
                                <span>Depth prompt</span>
                                <textarea
                                    className="text_pole"
                                    rows={3}
                                    value={depthPrompt.prompt}
                                    onChange={(event) => updateDraft({
                                        depthPrompt: { ...depthPrompt, prompt: event.target.value },
                                    })}
                                />
                            </label>
                            <label className="react-authoring-field" data-react-authoring-field="depthPrompt.depth">
                                <span>Depth</span>
                                <input
                                    className="text_pole"
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
                            <label className="react-authoring-field" data-react-authoring-field="depthPrompt.role">
                                <span>Depth role</span>
                                <select
                                    className="text_pole"
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
                        </>

                </fieldset>
                {!isCreateMode ? (
                    <div className="react-authoring-danger-zone">
                        <button type="button" className="menu_button red_button" disabled={isActionPending} onClick={() => void commands?.deleteAuthoring?.(kind)}>Delete</button>
                    </div>
                ) : null}
            </section>
        </WorkspacePanelShell>
    );
}

function getExtensionsHostPanelStatus(bridgeState: ExtensionsHostWorkspacePanelState): WorkspacePanelStatus {
    if (bridgeState.deferredState === 'loading') {
        return 'loading';
    }

    if (bridgeState.deferredState === 'failed') {
        return 'error';
    }

    if (
        bridgeState.extensionsSettingsPresent
        || bridgeState.extensionsSettings2Present
        || bridgeState.regexContainerPresent
        || bridgeState.extrasApiControlsPresent
    ) {
        return 'success';
    }

    return 'empty';
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

function ExtensionsHostWorkspacePanel({ state, commands }: { state?: unknown; commands?: ExtensionsHostCommands }) {
    const bridgeState = asExtensionsHostState(state);
    const status = getExtensionsHostPanelStatus(bridgeState);
    const formDefaults = useMemo(() => buildExtensionsHostPanelFormDefaults(bridgeState), [bridgeState]);
    const extensionsHostForm = useForm({
        defaultValues: formDefaults,
        validators: {
            onChange: extensionsHostPanelFormSchema,
        },
    });
    const extensionsHostCommandMutation = useMutation({
        mutationFn: async (command: () => Promise<unknown> | unknown) => {
            await command();
        },
        retry: false,
    });
    useEffect(() => {
        extensionsHostForm.reset(formDefaults);
    }, [extensionsHostForm, formDefaults]);
    // Claim stable compatibility slots outside the React tree so unmount does not
    // destroy extension content. Re-entry keeps the same DOM nodes and children.
    useLayoutEffect(() => {
        void commands?.ensureExtensionCompatibilitySlots('react-extensions-host');
    }, [commands]);
    const recoveryActions: WorkspacePanelRecoveryAction[] = [];

    if (status === 'empty') {
        recoveryActions.push({
            id: 'install-extension',
            label: 'Install extension',
            disabled: !bridgeState.installButtonPresent,
            onClick: () => extensionsHostCommandMutation.mutate(() => commands?.openInstallExtension()),
        });
    }

    if (status === 'empty' || status === 'error') {
        recoveryActions.push({
            id: 'open-manage-extensions',
            label: 'Open manage',
            disabled: !bridgeState.manageButtonPresent,
            onClick: () => extensionsHostCommandMutation.mutate(() => commands?.openManageExtensions()),
        });
    }

    if (status === 'error' || bridgeState.deferredState === 'failed') {
        recoveryActions.push({
            id: 'retry-deferred-extensions',
            label: 'Retry extensions',
            onClick: () => extensionsHostCommandMutation.mutate(() => commands?.retryDeferredExtensions()),
        });
        recoveryActions.push({
            id: 'connect-extras-api',
            label: 'Retry connection',
            disabled: !bridgeState.extrasApiControlsPresent,
            onClick: () => extensionsHostCommandMutation.mutate(() => commands?.connectExtrasApi()),
        });
    }

    return (
        <WorkspacePanelShell
            kind="extensionsHost"
            title="Extensions"
            status={status}
            actions={recoveryActions}
            legacyBoundary="react-owned-slots-lifecycle"
            slots={[
                { id: 'extensions-settings', label: 'Settings column', ready: bridgeState.extensionsSettingsPresent },
                { id: 'extensions-settings2', label: 'Settings column 2', ready: bridgeState.extensionsSettings2Present },
                { id: 'regex-container', label: 'Regex container', ready: bridgeState.regexContainerPresent },
                { id: 'extensions-menu-button', label: 'Wand button', ready: bridgeState.extensionsMenuButtonPresent },
                { id: 'extensions-menu', label: 'Wand menu', ready: bridgeState.extensionsMenuPresent },
                { id: 'extras-api', label: 'Extras API', ready: bridgeState.extrasApiControlsPresent },
            ]}
        >
            <div className="flex-container flexFlowColumn gap8" data-extensions-host-react-workflow="host-actions">
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <label className="checkbox_label flexNoGap">
                        <input
                            type="checkbox"
                            data-extensions-host-react-control="notify-updates"
                            checked={Boolean(bridgeState.notifyUpdatesEnabled)}
                            onChange={() => extensionsHostCommandMutation.mutate(() => commands?.toggleNotifyUpdates())}
                        />
                            Notify updates
                    </label>
                    <button
                        type="button"
                        className="menu_button"
                        data-extensions-host-react-action="manage"
                        onClick={() => extensionsHostCommandMutation.mutate(() => commands?.openManageExtensions())}
                        disabled={!bridgeState.manageButtonPresent}
                    >
                            Manage
                    </button>
                    <button
                        type="button"
                        className="menu_button"
                        data-extensions-host-react-action="install"
                        onClick={() => extensionsHostCommandMutation.mutate(() => commands?.openInstallExtension())}
                        disabled={!bridgeState.installButtonPresent}
                    >
                            Install
                    </button>
                </div>
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <extensionsHostForm.Field name="extrasApiUrl">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="url"
                                data-extensions-host-react-control="extras-url"
                                aria-label="Extras API URL"
                                value={field.state.value}
                                onChange={event => {
                                    const url = event.target.value;
                                    field.handleChange(url);
                                    extensionsHostCommandMutation.mutate(() => commands?.updateExtrasApiUrl(url));
                                }}
                            />
                        )}
                    </extensionsHostForm.Field>
                    <extensionsHostForm.Field name="extrasApiKey">
                        {field => (
                            <input
                                className="text_pole textarea_compact"
                                type="password"
                                data-extensions-host-react-control="extras-api-key"
                                aria-label="Extras API key"
                                placeholder={bridgeState.extrasApiKeySet ? 'Saved key' : 'Extras API key'}
                                value={field.state.value}
                                onChange={event => {
                                    const apiKey = event.target.value;
                                    field.handleChange(apiKey);
                                    extensionsHostCommandMutation.mutate(() => commands?.updateExtrasApiKey(apiKey));
                                }}
                            />
                        )}
                    </extensionsHostForm.Field>
                </div>
                <div className="flex-container flexwrap gap8 alignitemscenter">
                    <label className="checkbox_label flexNoGap">
                        <input
                            type="checkbox"
                            data-extensions-host-react-control="autoconnect"
                            checked={Boolean(bridgeState.autoconnectEnabled)}
                            onChange={() => extensionsHostCommandMutation.mutate(() => commands?.toggleAutoconnect())}
                            disabled={!bridgeState.extrasApiControlsPresent}
                        />
                            Auto-connect
                    </label>
                    <button
                        type="button"
                        className="menu_button"
                        data-extensions-host-react-action="connect"
                        onClick={() => extensionsHostCommandMutation.mutate(() => commands?.connectExtrasApi())}
                        disabled={!bridgeState.extrasApiControlsPresent}
                    >
                            Connect
                    </button>
                    <output>{bridgeState.extrasStatusText || 'Not connected...'}</output>
                </div>
                {/* Protected mount IDs remain in established drawer DOM under React lifecycle
                    (ensureExtensionCompatibilitySlots). Do not render empty React placeholders
                    for those IDs — reparenting into React would destroy extension content on unmount. */}
                <div
                    className="flex-container flexFlowColumn gap8"
                    data-extensions-host-react-workflow="compatibility-slots"
                    data-extensions-host-compat-owner="react-lifecycle"
                    aria-hidden="true"
                />
            </div>
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
                        {shouldShowSlashDetails ? (
                            <div dangerouslySetInnerHTML={{ __html: slash.detailsHtml }} />
                        ) : null}
                    </div>
                </div>
            ) : null}
            {messages.map(message => (
                <MainChatMessageRow
                    key={message.id}
                    message={message}
                    commands={commands}
                    isLast={message.id === messageIds.at(-1)}
                />
            ))}
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
        case 'extensionsHost':
            return <ExtensionsHostWorkspacePanel state={state} commands={commands as ExtensionsHostCommands | undefined} />;
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
    { command: 'openAIConfig', icon: 'fa-sliders', label: 'AI Config', panelKind: 'aiConfig' },
    { command: 'openFormatting', icon: 'fa-font', label: 'Formatting', panelKind: 'advancedFormatting' },
    { command: 'openCharacterLibrary', icon: 'fa-address-book', label: 'Character Library', panelKind: 'characterLibrary', slotKey: 'characterLibrary' },
    { command: 'openWorldInfo', icon: 'fa-book-atlas', label: 'World Info', panelKind: 'worldInfo', slotKey: 'worldInfo' },
    { command: 'openExtensions', icon: 'fa-cubes', label: 'Extensions', panelKind: 'extensionsHost', slotKey: 'extensionsHost' },
    { command: 'openSettings', icon: 'fa-gear', label: 'Settings', panelKind: 'settings' },
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
        case 'openAIConfig':
            return commands.openAIConfig();
        case 'openFormatting':
            return commands.openFormatting();
        case 'openCharacterLibrary':
            return commands.openCharacterLibrary();
        case 'openWorldInfo':
            return commands.openWorldInfo();
        case 'openExtensions':
            return commands.openExtensions();
        case 'openSettings':
            return commands.openSettings();
        case 'openCharacterAuthoring':
            return commands.openCharacterAuthoring();
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

    const togglePanelPin = useCallback(async (entry: WorkspaceShellNavigationEntry, isPinned: boolean) => {
        if (!entry.panelKind || !entry.slotKey) {
            return;
        }

        try {
            await commands?.setWorkspaceShellSlotPinned(entry.slotKey, !isPinned);
            recordWorkspacePanelDockPin(entry.panelKind, !isPinned);
        } catch (error) {
            recordWorkspacePanelDockResult(entry.panelKind, {
                fallbackReason: 'pin-failed',
                status: 'error',
            });
            console.warn('React workspace shell panel pin failed.', error);
        }
    }, [commands]);

    return (
        <header
            className="react-workspace-shell-chrome"
            data-react-workspace-shell-chrome="true"
            data-react-workspace-shell-chrome-status={status}
            data-react-workspace-shell-chrome-context={state.activeContext ?? 'none'}
            data-doc-id="feature.next_workspace_shell page.chat_workspace"
        >
            <section className="react-workspace-shell-context" aria-label="Current workspace context">
                <div className="react-workspace-shell-title">{contextTitle}</div>
            </section>
            <nav className="react-workspace-shell-nav" aria-label="Workspace navigation">
                {workspaceShellNavigationEntries.map(entry => {
                    const isPanelEntryActive = Boolean(entry.panelKind && dockSnapshot.activePanelKind === entry.panelKind);
                    const isPinned = Boolean(entry.panelKind && dockSnapshot.pinnedPanelKinds.includes(entry.panelKind));
                    const panelActionLabel = entry.panelKind
                        ? `${isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned ? 'Close' : 'Open'} ${entry.label}`
                        : entry.label;
                    const childSlot = entry.slotKey ? getWorkspaceShellChildSlot(entry.slotKey) : null;

                    return (
                        <Fragment key={entry.command}>
                            <button
                                type="button"
                                className="react-workspace-shell-nav-button"
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
                                    if (entry.panelKind && isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned) {
                                        window.setTimeout(() => {
                                            void closePanel(entry);
                                        }, 0);
                                        return;
                                    }
                                    window.setTimeout(() => {
                                        void dispatchCommand(entry);
                                    }, 0);
                                }}
                            >
                                <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                                <span>{entry.label}</span>
                            </button>
                            {entry.panelKind && entry.slotKey && isPanelEntryActive ? (
                                <button
                                    type="button"
                                    className="react-workspace-shell-pin-button"
                                    aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${entry.label}`}
                                    aria-pressed={isPinned}
                                    data-workspace-shell-panel-pin={entry.panelKind}
                                    onClick={() => {
                                        void togglePanelPin(entry, isPinned);
                                    }}
                                >
                                    <i className="fa-solid fa-thumbtack" aria-hidden="true" />
                                </button>
                            ) : null}
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
            <QueryClientProvider client={queryClient}>
                <ReactWorkspaceShellChrome state={mount.state} commands={mount.commands} runtime={mount.runtime} />
            </QueryClientProvider>
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
            <QueryClientProvider client={queryClient}>
                <WorkspacePanelRoot kind={mount.kind} commands={mount.commands} />
            </QueryClientProvider>
        </StrictMode>,
    );
}


function SettingsOverlayHost({
    initialTab,
    panelKind,
    onRequestClose,
    runtime,
}: {
    initialTab?: string | null;
    panelKind: WorkspaceDockPanelKind;
    onRequestClose?: () => void;
    runtime: RuntimePort;
}) {
    const handleClose = useCallback(() => {
        recordWorkspacePanelDockClose(panelKind);
        onRequestClose?.();
    }, [onRequestClose, panelKind]);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const dialog = dialogRef.current;
        const backdrop = backdropRef.current;
        if (dialog && !dialog.open) {
            dialog.show();
            dialog.focus();
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleClose();
                return;
            }
            if (event.key !== 'Tab' || !dialog) {
                return;
            }
            const focusable = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ),
            ).filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
            if (focusable.length === 0) {
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (!active || !dialog.contains(active)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        const onBackdropClick = () => handleClose();
        window.addEventListener('keydown', onKeyDown, true);
        backdrop?.addEventListener('click', onBackdropClick);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown, true);
            backdrop?.removeEventListener('click', onBackdropClick);
            if (dialog?.open) {
                dialog.close();
            }
        };
    }, [handleClose]);

    return (
        <>
            <div
                ref={backdropRef}
                className="settings-overlay-backdrop"
                data-settings-overlay-backdrop="true"
            />
            <dialog
                ref={dialogRef}
                className="settings-overlay"
                data-settings-overlay="true"
                aria-label="Settings"
                tabIndex={-1}
                data-doc-id="page.settings feature.next_workspace_shell"
                onCancel={(event) => {
                    event.preventDefault();
                    handleClose();
                }}
            >
                <SettingsSurface
                    variant="overlay"
                    initialTab={initialTab}
                    onRequestClose={handleClose}
                    runtime={runtime}
                />
            </dialog>
        </>
    );
}

function renderSettingsOverlay(mount: SettingsOverlayMount) {
    mount.root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <SettingsOverlayHost
                    initialTab={mount.initialTab}
                    panelKind={mount.panelKind}
                    onRequestClose={mount.onRequestClose}
                    runtime={mount.runtime}
                />
            </QueryClientProvider>
        </StrictMode>,
    );
}

export function mountSettingsOverlay(options: {
    runtime: RuntimePort;
    initialTab?: string | null;
    panelKind?: WorkspaceDockPanelKind;
    onRequestClose?: () => void;
}) {
    attachGlobalCompatibilityBridge();
    const initialTab = typeof options.initialTab === 'string' ? options.initialTab : null;
    const panelKind: WorkspaceDockPanelKind =
        options.panelKind === 'aiConfig' || options.panelKind === 'advancedFormatting'
            ? options.panelKind
            : 'settings';
    if (mountedSettingsOverlay) {
        mountedSettingsOverlay.initialTab = initialTab;
        mountedSettingsOverlay.panelKind = panelKind;
        mountedSettingsOverlay.onRequestClose = options.onRequestClose;
        mountedSettingsOverlay.runtime = options.runtime;
        renderSettingsOverlay(mountedSettingsOverlay);
        return { kind: panelKind, mounted: true, status: 'mounted' as const };
    }

    const activeElement = document.activeElement;
    const returnFocusTo = activeElement instanceof HTMLElement ? activeElement : null;
    const host = document.createElement('div');
    host.id = 'emberdesk-react-settings-overlay-host';
    host.setAttribute('data-react-settings-overlay-host', 'true');
    document.body.appendChild(host);

    mountedSettingsOverlay = {
        root: createRoot(host),
        host,
        returnFocusTo,
        runtime: options.runtime,
        initialTab,
        panelKind,
        onRequestClose: options.onRequestClose,
    };
    renderSettingsOverlay(mountedSettingsOverlay);
    return { kind: panelKind, mounted: true, status: 'mounted' as const };
}

export function unmountSettingsOverlay() {
    if (!mountedSettingsOverlay) {
        return;
    }
    const { host, returnFocusTo, root } = mountedSettingsOverlay;
    root.unmount();
    host.remove();
    mountedSettingsOverlay = null;
    if (returnFocusTo?.isConnected) {
        returnFocusTo.focus({ preventScroll: true });
    }
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
