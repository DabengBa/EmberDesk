import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { translate, useTranslated } from '../../compat/i18n.js';
import type { AuthoringCommands } from '../../compat/workspace-commands';
import { createCharacterAuthoringSession, shouldApplyCharacterAuthoringSaveResult } from '../../../public/scripts/character-authoring.js';
import { resolveBoundWorldInfoBookName } from '../../../public/scripts/world-info-bound-book.js';
import { CharacterTagManagerDialog } from '../fields/CharacterTagManagerDialog';
import { useAutosizeTextareaRef } from '../../lib/autosize-textarea';
import { authoringStyles } from '../../styles/workspace-panels.styles.js';
import { chipInputStyles } from '../../styles/fields.styles.js';
import { WorkspacePanelShell } from '../panels/WorkspacePanelShell';
import { CharacterAuthoringTextReplaceDialog } from './CharacterAuthoringTextReplaceDialog';

interface AuthoringWorkspacePanelState {
    externalMediaAllowed?: boolean;
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
    auxWorldNames?: string[];
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
    useTranslated('');
    return (
        <span {...stylex.props(authoringStyles.fieldLabel)}>
            {translate(text)}
            {dirty ? <span {...stylex.props(authoringStyles.dirtyDot)} title={translate('Unsaved change')} aria-label={translate('Unsaved change')} /> : null}
            {meta ? <span {...stylex.props(authoringStyles.fieldMeta)}>{meta}</span> : null}
            {onExpand ? (
                <button
                    type="button"
                    {...stylex.props(authoringStyles.iconAction, authoringStyles.fieldExpandButton)}
                    title={translate('Maximize editing')}
                    aria-label={translate('Maximize editing ${0}').replace('${0}', translate(text))}
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

export function AuthoringWorkspacePanel({
    kind,
    state,
    commands,
}: {
    kind: 'characterAuthoring';
    state?: unknown;
    commands?: AuthoringCommands;
}) {
    useTranslated('');
    const bridgeState = asAuthoringState(state);
    const title = bridgeState.title ?? 'Character Authoring';

    const worldNames = Array.isArray(bridgeState.worldNames)
        ? bridgeState.worldNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        : [];
    const auxWorldNames = useMemo(() => (Array.isArray(bridgeState.auxWorldNames)
        ? bridgeState.auxWorldNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        : []), [bridgeState.auxWorldNames]);
    const authoringDraft = bridgeState.draft;
    const authoringMode = bridgeState.mode ?? 'create';
    const managementActionDefs = bridgeState.managementActions;
    const initialSession = useMemo(() => createCharacterAuthoringSession(authoringDraft ?? {}, { mode: authoringMode }), [authoringDraft, authoringMode]);
    const [authoringSession, setAuthoringSession] = useState(initialSession);
    const [auxBooks, setAuxBooks] = useState<string[]>(auxWorldNames);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [expandedField, setExpandedField] = useState<{ key: string; label: string } | null>(null);
    const [textReplaceOpen, setTextReplaceOpen] = useState(false);
    const [tagManagerOpen, setTagManagerOpen] = useState(false);
    const [avatarPreviewOverride, setAvatarPreviewOverride] = useState<string | null>(null);
    const [externalMediaAllowed, setExternalMediaAllowed] = useState(bridgeState.externalMediaAllowed === true);
    const [externalMediaSaving, setExternalMediaSaving] = useState(false);
    const [liveManagementActions, setLiveManagementActions] = useState<AuthoringManagementAction[] | null>(null);
    const saveGenerationRef = useRef(0);
    const saveInFlightRef = useRef<Promise<boolean> | null>(null);

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
        setAuxBooks(auxWorldNames);
        setFieldErrors({});
        setAdvancedOpen(false);
        setExpandedField(null);
        setTextReplaceOpen(false);
        setTagManagerOpen(false);
        setAvatarPreviewOverride(null);
        setExternalMediaAllowed(bridgeState.externalMediaAllowed === true);
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

    const submitDraft = useCallback(async (): Promise<boolean> => {
        if (textReplaceOpen) {
            return false;
        }
        if (authoringCommandMutation.isPending) {
            return await (saveInFlightRef.current ?? Promise.resolve(false));
        }
        const submitResult = authoringSession.submit();
        if (!submitResult.ok) {
            setFieldErrors((submitResult.fieldErrors ?? {}) as Record<string, string>);
            return false;
        }

        setFieldErrors({});
        const saveGeneration = saveGenerationRef.current;
        const submittedDraft = authoringSession.draft;
        const savePromise = authoringCommandMutation.mutateAsync({
            ...(submitResult.payload ?? {}) as Record<string, unknown>,
            changedFields: [...authoringSession.dirtyFields],
        })
            .then((result) => {
                const ok = !(result && typeof result === 'object' && 'ok' in (result as Record<string, unknown>)
                    && (result as { ok?: boolean }).ok === false);
                if (!shouldApplyCharacterAuthoringSaveResult({
                    generation: saveGeneration,
                    activeGeneration: saveGenerationRef.current,
                    ok,
                })) {
                    return ok;
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
                return ok;
            })
            .catch(() => {
                // Mutation state carries the failed status; keep the dirty draft intact for retry.
                return false;
            });
        saveInFlightRef.current = savePromise;
        const ok = await savePromise;
        if (saveInFlightRef.current === savePromise) {
            saveInFlightRef.current = null;
        }
        return ok;
    }, [authoringCommandMutation, authoringSession, authoringMode, textReplaceOpen]);
    const submitDraftRef = useRef(submitDraft);
    useEffect(() => {
        submitDraftRef.current = submitDraft;
    }, [submitDraft]);

    // Autosave: edit mode only — create-mode submits would mint a new card per pass.
    useEffect(() => {
        if (bridgeState.mode !== 'edit' || textReplaceOpen || !authoringSession.dirty) {
            return;
        }
        const timer = window.setTimeout(() => submitDraftRef.current(), 900);
        return () => window.clearTimeout(timer);
    }, [authoringSession, bridgeState.mode, textReplaceOpen]);

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
    const boundWorldInfoBookName = resolveBoundWorldInfoBookName(stringDraft('characterWorld'), worldNames);
    const applyAuxBooks = (next: string[]) => {
        setAuxBooks(next);
        void commands?.setAuxWorldBooks?.({ ...(characterToolActionPayload ?? {}), books: next });
    };
    const dirtyFieldSet = new Set(authoringSession.dirtyFields);
    const isFieldDirty = (key: string) => dirtyFieldSet.has(key);
    const advancedChips = [
        stringDraft('systemPrompt').trim() ? { label: translate('System prompt'), field: 'systemPrompt' } : null,
        stringDraft('postHistoryInstructions').trim() ? { label: translate('Post-history'), field: 'postHistoryInstructions' } : null,
        stringDraft('scenario').trim() ? { label: translate('Scenario'), field: 'scenario' } : null,
        (depthPrompt.prompt?.trim() || depthPrompt.depth != null) ? { label: `${translate('Depth prompt')} @${depthPrompt.depth ?? 4}`, field: 'depthPrompt.prompt' } : null,
        stringDraft('creator').trim() ? { label: translate('Creator'), field: 'creator' } : null,
        stringDraft('characterVersion').trim() ? { label: `${translate('Version')} ${stringDraft('characterVersion').trim()}`, field: 'characterVersion' } : null,
        stringDraft('creatorNotes').trim() ? { label: translate('Notes'), field: 'creatorNotes' } : null,
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
            kind={kind}
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
                <fieldset
                    {...stylex.props(authoringStyles.fields)}
                    style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
                >
                    <div {...stylex.props(authoringStyles.section, authoringStyles.sectionFirst)} data-react-authoring-section="basics">
                        <div {...stylex.props(authoringStyles.heroRow)}>
                            <label {...stylex.props(authoringStyles.heroAvatar)} title={translate("Change avatar")} data-react-authoring-field="avatar">
                                <input
                                    type="button"
                                    className="avatar-upload-trigger"
                                    aria-label={translate("Change character avatar")}
                                    onClick={event => {
                                        event.preventDefault();
                                        document.getElementById('authoring-avatar-file')?.click();
                                    }}
                                />
                                <img
                                    {...stylex.props(authoringStyles.heroAvatarImg)}
                                    src={avatarPreviewSrc}
                                    alt={translate("Character avatar")}
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
                                    aria-label={translate("Upload character avatar")}
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
                                    <span className="sr-only">{translate("Name")}</span>
                                    <input
                                        className="text_pole"
                                        {...stylex.props(authoringStyles.heroNameInput, authoringStyles.control)}
                                        value={nameValue}
                                        placeholder={translate("Character name")}
                                        aria-invalid={fieldErrors.name ? 'true' : 'false'}
                                        onChange={(event) => updateDraft({ name: event.target.value })}
                                    />
                                    {fieldErrors.name ? <small role="alert" {...stylex.props(authoringStyles.fieldWarning)}>{fieldErrors.name}</small> : null}
                                </label>
                                <div {...stylex.props(authoringStyles.heroMetaRow)}>
                                    {!isCreateMode ? (
                                        <span {...stylex.props(authoringStyles.footerStatus)} aria-live="polite">
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
                                                ? translate('Saving…')
                                                : authoringCommandMutation.isError
                                                    ? translate('Save failed — next change retries')
                                                    : authoringSession.dirty
                                                        ? translate('${0} unsaved').replace('${0}', String(dirtyFieldSet.size))
                                                        : translate('Saved')}
                                        </span>
                                    ) : null}
                                    <button
                                        type="button"
                                        {...stylex.props(authoringStyles.favToggle, draft.favorite ? authoringStyles.favToggleActive : null)}
                                        aria-pressed={Boolean(draft.favorite)}
                                        aria-label={translate("Favorite")}
                                        title={translate("Toggle favorite")}
                                        data-react-authoring-field="favorite"
                                        onClick={() => updateDraft({ favorite: !draft.favorite })}
                                    >
                                        <i className={`fa-${draft.favorite ? 'solid' : 'regular'} fa-star`} aria-hidden="true" />
                                        {translate('Favorite')}
                                    </button>
                                    {tokenTotal ? (
                                        <span
                                            {...stylex.props(authoringStyles.metaChip, authoringSession.dirty ? authoringStyles.metaChipStale : null)}
                                            title={authoringSession.dirty
                                                ? `${tokenTotal} ${translate('Tokens at last save; recount on next save')}`
                                                : `${tokenTotal} ${translate('Tokens at last save')} (${tokenPermanent} ${translate('Permanent tokens')})`}
                                        >
                                            <i className="fa-solid fa-coins" aria-hidden="true" />
                                            {authoringSession.dirty ? `~${tokenTotal}` : tokenTotal} {translate("Tokens")}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div {...stylex.props(authoringStyles.fieldRow)}>
                            <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                <div {...stylex.props(authoringStyles.field)} data-react-authoring-field="tags">
                                    <AuthoringFieldLabel text="Tags" dirty={isFieldDirty('tags')} />
                                    <button
                                        type="button"
                                        {...stylex.props(authoringStyles.tagManagerTrigger)}
                                        aria-label={translate('Manage tags')}
                                        onClick={() => setTagManagerOpen(true)}
                                    >
                                        <span {...stylex.props(authoringStyles.tagManagerPreview)}>
                                            {tagsList.slice(0, 4).map(tag => (
                                                <span key={tag} {...stylex.props(authoringStyles.tagManagerPreviewChip)} title={tag}>{tag}</span>
                                            ))}
                                            {tagsList.length === 0 ? <span {...stylex.props(authoringStyles.tagManagerPreviewEmpty)}>{translate('No tags')}</span> : null}
                                        </span>
                                        <span {...stylex.props(authoringStyles.tagManagerPreviewCount)}>
                                            {translate('Manage tags')} · {tagsList.length}
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <div {...stylex.props(authoringStyles.fieldRowItem)}>
                                <div {...stylex.props(authoringStyles.field)} data-react-authoring-field="characterWorld">
                                    <AuthoringFieldLabel text="World Info" dirty={isFieldDirty('characterWorld')} meta={translate('Travels with card')} />
                                    <div {...stylex.props(authoringStyles.fieldInputRow)}>
                                        <select
                                            className="text_pole"
                                            {...stylex.props(authoringStyles.control, authoringStyles.fieldInput)}
                                            value={stringDraft('characterWorld')}
                                            aria-label={translate("Bound World Info file")}
                                            aria-invalid={Boolean(stringDraft('characterWorld').trim()) && worldNames.length > 0 && !worldNames.includes(stringDraft('characterWorld').trim()) ? 'true' : undefined}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                if (value === '__create_new_world__') {
                                                    void (async () => {
                                                        const created = await commands?.createBoundWorldInfo?.(characterToolActionPayload) as string | false | null;
                                                        if (typeof created === 'string' && created) {
                                                            updateDraft({ characterWorld: created });
                                                        }
                                                    })();
                                                } else {
                                                    updateDraft({ characterWorld: value });
                                                }
                                            }}
                                        >
                                            <option value="">{translate("(no binding)")}</option>
                                            {worldNames.map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                            {stringDraft('characterWorld').trim() && worldNames.length > 0 && !worldNames.includes(stringDraft('characterWorld').trim()) ? (
                                                <option value={stringDraft('characterWorld')}>
                                                    {translate("Not found")}: {stringDraft('characterWorld')}
                                                </option>
                                            ) : null}
                                            <option value="__create_new_world__">{translate("+ Create new world book...")}</option>
                                        </select>
                                        <button
                                            type="button"
                                            className={`menu_button ${stylex.props(authoringStyles.toolAction, authoringStyles.fieldRowAction).className ?? ''}`}
                                            data-react-authoring-action="openBoundWorldInfo"
                                            disabled={!boundWorldInfoBookName || isActionPending}
                                            title={boundWorldInfoBookName
                                                ? translate('Open bound World Info book')
                                                : translate('No bound world book to open')}
                                            aria-label={boundWorldInfoBookName
                                                ? translate('Open bound World Info book')
                                                : translate('No bound world book to open')}
                                            onClick={() => void commands?.openBoundWorldInfo?.(characterToolActionPayload)}
                                        >
                                            <i className="fa-solid fa-book-open" aria-hidden="true" />
                                        </button>
                                    </div>
                                    <small {...stylex.props(authoringStyles.fieldHint)}>{translate("Auxiliary books (local only)")}</small>
                                    {auxBooks.length > 0 ? (
                                        <div {...stylex.props(chipInputStyles.box, authoringStyles.auxBox)}>
                                            {auxBooks.map(name => (
                                                <span key={name} {...stylex.props(chipInputStyles.chip)}>
                                                    {name}
                                                    <button
                                                        type="button"
                                                        {...stylex.props(chipInputStyles.chipRemove)}
                                                        aria-label={translate("Remove auxiliary book ${0}").replace('${0}', name)}
                                                        onClick={() => applyAuxBooks(auxBooks.filter(book => book !== name))}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                            <select
                                                className="text_pole"
                                                {...stylex.props(authoringStyles.auxAddSelect)}
                                                value=""
                                                aria-label={translate("Add auxiliary book")}
                                                onChange={event => {
                                                    const name = event.target.value;
                                                    if (name) {
                                                        applyAuxBooks([...auxBooks, name]);
                                                    }
                                                }}
                                            >
                                                <option value="">{translate("+ Add…")}</option>
                                                {worldNames
                                                    .filter(name => !auxBooks.includes(name) && name !== boundWorldInfoBookName)
                                                    .map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <select
                                            {...stylex.props(authoringStyles.auxAddGhost)}
                                            value=""
                                            aria-label={translate("Add auxiliary book")}
                                            onChange={event => {
                                                const name = event.target.value;
                                                if (name) {
                                                    applyAuxBooks([...auxBooks, name]);
                                                }
                                            }}
                                        >
                                            <option value="">{translate("+ Add auxiliary book…")}</option>
                                            {worldNames
                                                .filter(name => name !== boundWorldInfoBookName)
                                                .map(name => (
                                                    <option key={name} value={name}>{name}</option>
                                                ))}
                                        </select>
                                    )}
                                    {stringDraft('characterWorld').trim() && worldNames.length > 0 && !worldNames.includes(stringDraft('characterWorld').trim()) ? (
                                        <small {...stylex.props(authoringStyles.fieldWarning)}>{translate("No world file with this name — the link will be ignored.")}</small>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div {...stylex.props(authoringStyles.section)} data-react-authoring-section="content">
                        <h4 {...stylex.props(authoringStyles.subsectionLabel)}>{translate("Card content")}</h4>
                        {!isCreateMode && typeof draft.avatar === 'string' && draft.avatar ? (
                            <label {...stylex.props(authoringStyles.checkboxLabel)}>
                                <input {...stylex.props(authoringStyles.checkbox)} type="checkbox" checked={externalMediaAllowed} disabled={externalMediaSaving} onChange={event => {
                                    const allowed = event.target.checked;
                                    const characterId = draft.avatar as string;
                                    setExternalMediaAllowed(allowed);
                                    setExternalMediaSaving(true);
                                    void Promise.resolve(commands?.setExternalMediaAllowed?.({ characterId, allowed })).then(result => {
                                        if (result === false) setExternalMediaAllowed(!allowed);
                                    }).catch(() => setExternalMediaAllowed(!allowed)).finally(() => setExternalMediaSaving(false));
                                }} />
                                {translate('Allow external CSS resources for this character')}
                            </label>
                        ) : null}
                        <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-description" data-react-authoring-field="description">
                            <AuthoringFieldLabel
                                text="Description"
                                dirty={isFieldDirty('description')}
                                meta={descriptionValue.trim() ? translate('${0} characters').replace('${0}', String(descriptionValue.length)) : undefined}
                                onExpand={() => setExpandedField({ key: 'description', label: 'Description' })}
                            />
                            <AuthoringTextarea
                                id="authoring-description"
                                rows={4}
                                value={descriptionValue}
                                xstyle={authoringStyles.textareaPreview}
                                placeholder={translate("Describe the character. Supports {{char}} and {{user}} macros.")}
                                onChange={(event) => updateDraft({ description: event.target.value })}
                            />
                        </label>
                        <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-first-message" data-react-authoring-field="firstMessage">
                            <AuthoringFieldLabel
                                text="First message"
                                dirty={isFieldDirty('firstMessage')}
                                meta={firstMessageValue.trim() ? translate('${0} characters').replace('${0}', String(firstMessageValue.length)) : undefined}
                                onExpand={() => setExpandedField({ key: 'firstMessage', label: 'First message' })}
                            />
                            <AuthoringTextarea
                                id="authoring-first-message"
                                rows={3}
                                value={firstMessageValue}
                                xstyle={authoringStyles.textareaPreview}
                                placeholder={translate("The opening message. Supports {{char}} and {{user}} macros.")}
                                onChange={(event) => updateDraft({ firstMessage: event.target.value })}
                            />
                        </label>
                        <div {...stylex.props(authoringStyles.field)} data-react-authoring-field="alternateGreetings">
                            <AuthoringFieldLabel
                                text="Alternate greetings"
                                dirty={isFieldDirty('alternateGreetings')}
                                meta={translate('${0} greetings').replace('${0}', String(greetings.length))}
                            />
                            <button
                                type="button"
                                {...stylex.props(authoringStyles.greetingAdd)}
                                onClick={() => void commands?.openAlternateGreetings?.(characterToolActionPayload)}
                            >
                                <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                                {translate(greetings.length > 0 ? 'Manage greetings' : 'Add alternate greetings')}
                            </button>

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
                                <span>{translate("Advanced")}</span>
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
                                            title={translate('Jump to ${0}').replace('${0}', chip.label)}
                                            onClick={() => jumpToAdvancedField(chip.field)}
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                    {advancedChips.length > 3 ? (
                                        <button
                                            type="button"
                                            {...stylex.props(authoringStyles.advancedChipButton)}
                                            title={translate('Show ${0} more — jump to ${1}').replace('${0}', String(advancedChips.length - 3)).replace('${1}', advancedChips[3].label)}
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
                                {translate('Prompt overrides, extra definition fields, character note and creator metadata.')}
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
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>{translate("Prompt overrides")}</h4>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-system-prompt" data-react-authoring-field="systemPrompt">
                                        <AuthoringFieldLabel text="System prompt" dirty={isFieldDirty('systemPrompt')} meta={stringDraft('systemPrompt').trim() ? translate('${0} characters').replace('${0}', String(stringDraft('systemPrompt').length)) : undefined} onExpand={() => setExpandedField({ key: 'systemPrompt', label: translate('System prompt') })} />
                                        <AuthoringTextarea
                                            id="authoring-system-prompt"
                                            rows={2}
                                            value={stringDraft('systemPrompt')}
                                            placeholder={translate("Replaces the default main prompt. Use {{original}} to include it.")}
                                            onChange={(event) => updateDraft({ systemPrompt: event.target.value })}
                                        />
                                    </label>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-post-history-instructions" data-react-authoring-field="postHistoryInstructions">
                                        <AuthoringFieldLabel text="Post-history instructions" dirty={isFieldDirty('postHistoryInstructions')} meta={stringDraft('postHistoryInstructions').trim() ? translate('${0} characters').replace('${0}', String(stringDraft('postHistoryInstructions').length)) : undefined} onExpand={() => setExpandedField({ key: 'postHistoryInstructions', label: 'Post-history instructions' })} />
                                        <AuthoringTextarea
                                            id="authoring-post-history-instructions"
                                            rows={2}
                                            value={stringDraft('postHistoryInstructions')}
                                            placeholder={translate("Replaces the default post-history instructions. Use {{original}} to include it.")}
                                            onChange={(event) => updateDraft({ postHistoryInstructions: event.target.value })}
                                        />
                                    </label>
                                </div>
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>{translate("Definition")}</h4>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-scenario" data-react-authoring-field="scenario">
                                        <AuthoringFieldLabel text="Scenario" dirty={isFieldDirty('scenario')} meta={stringDraft('scenario').trim() ? translate('${0} characters').replace('${0}', String(stringDraft('scenario').length)) : undefined} onExpand={() => setExpandedField({ key: 'scenario', label: translate('Scenario') })} />
                                        <AuthoringTextarea
                                            id="authoring-scenario"
                                            rows={2}
                                            value={stringDraft('scenario')}
                                            onChange={(event) => updateDraft({ scenario: event.target.value })}
                                        />
                                    </label>
                                </div>
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>{translate("Character's note")}</h4>
                                    <label {...stylex.props(authoringStyles.field)} htmlFor="authoring-depth-prompt" data-react-authoring-field="depthPrompt.prompt">
                                        <AuthoringFieldLabel text="Depth prompt" dirty={isFieldDirty('depthPrompt')} meta={depthPrompt.prompt?.trim() ? translate('${0} characters').replace('${0}', String(depthPrompt.prompt.length)) : undefined} onExpand={() => setExpandedField({ key: 'depthPrompt.prompt', label: 'Depth prompt' })} />
                                        <AuthoringTextarea
                                            id="authoring-depth-prompt"
                                            rows={2}
                                            value={depthPrompt.prompt ?? ''}
                                            placeholder={translate("Inserted in-chat at the chosen depth and role.")}
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
                                                    <option value="system">{translate("System")}</option>
                                                    <option value="user">{translate("User")}</option>
                                                    <option value="assistant">{translate("Assistant")}</option>
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div {...stylex.props(authoringStyles.advancedSubgroup)}>
                                    <h4 {...stylex.props(authoringStyles.subsectionLabel)}>{translate("Creator metadata")}</h4>
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
                                        <AuthoringFieldLabel text="Creator notes" dirty={isFieldDirty('creatorNotes')} meta={stringDraft('creatorNotes').trim() ? translate('${0} characters').replace('${0}', String(stringDraft('creatorNotes').length)) : undefined} onExpand={() => setExpandedField({ key: 'creatorNotes', label: 'Creator notes' })} />
                                        <AuthoringTextarea
                                            id="authoring-creator-notes"
                                            rows={2}
                                            value={stringDraft('creatorNotes')}
                                            placeholder={translate("Shown in the character list. Not sent to the model.")}
                                            onChange={(event) => updateDraft({ creatorNotes: event.target.value })}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </section>
                </fieldset>
                <div {...stylex.props(authoringStyles.panelActions)} aria-label={translate('${0} actions').replace('${0}', title)}>
                    <div {...stylex.props(authoringStyles.footerPrimaryActions)}>
                    {!isCreateMode ? (
                        <button
                            type="button"
                            className={`menu_button ${stylex.props(authoringStyles.dangerButton).className ?? ''}`}
                            disabled={isActionPending}
                            title={translate("Permanently delete this card — the confirmation can also remove its chats")}
                            onClick={() => void commands?.deleteAuthoring?.(kind)}
                        >
                            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                            {translate('Delete')}
                        </button>
                    ) : null}
                    {isCreateMode ? (
                        <button
                            type="button"
                            className={`menu_button ${stylex.props(authoringStyles.saveButton).className ?? ''}`}
                            disabled={isActionPending}
                            title={translate("Create character (Ctrl+S)")}
                            onClick={submitDraft}
                        >
                            {translate('Create')}
                        </button>
                    ) : null}
                    </div>
                    <div {...stylex.props(authoringStyles.footerTools)}>
                        <button
                            type="button"
                            className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                            disabled={isActionPending}
                            onClick={() => void commands?.openWorldInfo?.(characterToolActionPayload)}
                        >
                            {translate('World Info')}
                        </button>
                        {!isCreateMode ? (
                            <button
                                type="button"
                                className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                                disabled={isActionPending}
                                data-character-export-trigger=""
                                onClick={() => void commands?.exportAuthoring?.(characterToolActionPayload)}
                            >
                                {translate('Export')}
                            </button>
                        ) : null}
                        {!isCreateMode ? (
                            <button
                                type="button"
                                className={`menu_button ${stylex.props(authoringStyles.toolAction).className ?? ''}`}
                                disabled={isActionPending}
                                title={translate('Find and replace text in the character card, bound world book, and current chat')}
                                onClick={() => setTextReplaceOpen(true)}
                            >
                                {translate('Find and replace')}
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
                        commands={{
                            ...commands,
                            previewTextReplace: async request => {
                                if (saveInFlightRef.current && !await saveInFlightRef.current) return { ok: false, reason: 'character_save_failed' };
                                return commands?.previewTextReplace?.(request);
                            },
                            applyTextReplace: async request => {
                                if (saveInFlightRef.current && !await saveInFlightRef.current) return { ok: false, reason: 'character_save_failed' };
                                return commands?.applyTextReplace?.(request);
                            },
                        }}
                        payload={characterToolActionPayload}
                        onClose={async (applied) => {
                            if (!applied) {
                                setTextReplaceOpen(false);
                                return { ok: true };
                            }

                            // Preview/apply already persisted the latest draft before mutating
                            // canonical storage. Saving again here would restore stale text.
                            if (saveInFlightRef.current && !await saveInFlightRef.current) {
                                return { ok: false, reason: 'character_save_failed' };
                            }

                            // Without a host command there is nothing to refresh from;
                            // closing is the only way out, so do not trap the dialog.
                            if (typeof commands?.closeTextReplace !== 'function') {
                                setTextReplaceOpen(false);
                                return { ok: true };
                            }

                            const result = await commands.closeTextReplace({ applied });
                            if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
                                return result && typeof result === 'object' && 'reason' in result ? result : { ok: false, reason: 'character_refresh_failed' };
                            }

                            const draft = (result as { draft?: unknown }).draft;
                            if (applied.card && (!draft || typeof draft !== 'object')) {
                                return { ok: false, reason: 'character_refresh_failed' };
                            }
                            if (draft && typeof draft === 'object') {
                                saveGenerationRef.current += 1;
                                setAuthoringSession(createCharacterAuthoringSession(draft, { mode: authoringMode }));
                            }
                            setTextReplaceOpen(false);
                            return { ok: true };
                        }}
                    />
                ) : null}
                {tagManagerOpen ? (
                    <CharacterTagManagerDialog
                        values={tagsList}
                        onChange={next => updateDraft({ tags: next })}
                        onClose={() => setTagManagerOpen(false)}
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
                        <dialog open aria-modal="true" aria-label={translate(expandedField.label)} {...stylex.props(authoringStyles.modalCard)}>
                            <div {...stylex.props(authoringStyles.modalHead)}>
                                <span {...stylex.props(authoringStyles.modalTitle)}>{translate(expandedField.label)}</span>
                                <span {...stylex.props(authoringStyles.fieldMeta)}>
                                    {translate('${0} characters').replace('${0}', String(getExpandedFieldValue(expandedField.key).length))}
                                </span>
                                <button
                                    type="button"
                                    {...stylex.props(authoringStyles.iconAction)}
                                    title={translate("Close editor")}
                                    aria-label={translate("Close editor")}
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
                                {translate('Esc to close. Ctrl+S saves now.')} {bridgeState.mode === 'edit' ? translate('Changes autosave.') : ''}
                            </p>
                        </dialog>
                    </div>,
                    document.body,
                ) : null}
            </section>
        </WorkspacePanelShell>
    );
}
