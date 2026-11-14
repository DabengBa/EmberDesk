import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { translate, useTranslated } from '../../compat/i18n.js';
import type { AuthoringCommands } from '../../compat/workspace-commands';
import { authoringStyles } from '../../styles/workspace-panels.styles.js';

const TEXT_REPLACE_CARD_FIELDS = [
    { id: 'description', labelKey: 'Description' },
    { id: 'scenario', labelKey: 'Scenario' },
    { id: 'firstMes', labelKey: 'First message' },
    { id: 'exampleMessages', labelKey: 'Example messages' },
    { id: 'alternateGreetings', labelKey: 'Alternate greetings' },
    { id: 'systemPrompt', labelKey: 'System prompt' },
    { id: 'postHistoryInstructions', labelKey: 'Post-history instructions' },
    { id: 'depthPrompt', labelKey: 'Depth prompt' },
    { id: 'creatorNotes', labelKey: 'Creator notes' },
    { id: 'creator', labelKey: 'Creator' },
    { id: 'characterVersion', labelKey: 'Character version' },
    { id: 'tags', labelKey: 'Tags' },
] as const;

const TEXT_REPLACE_WORLD_FIELDS = [
    { id: 'content', labelKey: 'Body' },
    { id: 'comment', labelKey: 'Comment' },
    { id: 'keys', labelKey: 'Keywords' },
] as const;

const TEXT_REPLACE_CHAT_FIELDS = [
    { id: 'mes', labelKey: 'Message body' },
    { id: 'reasoning', labelKey: 'Reasoning' },
] as const;

/**
 * Server matches carry a locale-independent field id in `label`; resolve the
 * display copy here so previews follow the live locale.
 */
const TEXT_REPLACE_FIELD_LABEL_KEYS: Record<string, string> = Object.fromEntries(
    [...TEXT_REPLACE_CARD_FIELDS, ...TEXT_REPLACE_WORLD_FIELDS, ...TEXT_REPLACE_CHAT_FIELDS].map(field => [field.id, field.labelKey]),
);

function textReplaceFieldLabel(label: unknown, field: string | undefined): string {
    const key = typeof label === 'string' && label in TEXT_REPLACE_FIELD_LABEL_KEYS ? label : field;
    return key && key in TEXT_REPLACE_FIELD_LABEL_KEYS ? translate(TEXT_REPLACE_FIELD_LABEL_KEYS[key]) : String(label ?? field ?? '');
}


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
    generation_in_flight: translate('A reply is being generated. Wait for it to finish or stop it, then apply again.'),
    canonical_world_info_unavailable: translate('World book storage is unavailable'),
    canonical_chat_unavailable: translate('Chat storage is unavailable'),
    canonical_storage_disabled: translate('Character storage is unavailable'),
    character_not_found: translate('The current character card was not found'),
    missing_avatar_url: translate('The character identifier is missing'),
    missing_chat_file_name: translate('No chat is open'),
    invalid_regex: translate('Invalid regular expression'),
    empty_query: translate('The search text cannot be empty'),
    no_areas_selected: translate('Select at least one replacement area'),
    network_error: translate('The request failed. Try again later.'),
    empty_response: translate('The server returned no result'),
};

function describeTextReplaceFailure(result: TextReplaceResult | null | undefined): string {
    const reason = String(result?.reason ?? '');
    if (!reason) {
        return translate('The operation failed');
    }
    if (reason === 'character_save_failed') return translate('The character could not be saved. Your edits are still here.');
    if (reason === 'character_refresh_failed') return translate('The character could not be reloaded. Retry before closing.');
    if (reason === 'chat_refresh_failed') return translate('The chat could not be reloaded. Retry before closing.');
    if (reason.startsWith('invalid_regex:')) {
        return `${TEXT_REPLACE_REASON_LABELS.invalid_regex}：${reason.slice('invalid_regex:'.length).trim()}`;
    }
    return TEXT_REPLACE_REASON_LABELS[reason] ?? translate('The operation failed (${0})').replace('${0}', reason);
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
    useTranslated('');
    const path = String(match.path ?? '');
    const context = match.entryTitle
        ? translate('Entry “${0}”').replace('${0}', match.entryTitle)
        : match.index != null
            ? `${translate('Message ${0} (${1})')
                    .replace('${0}', String(match.index + 1))
                    .replace('${1}', match.role === 'user' ? translate('User') : match.role === 'system' ? translate('System') : translate('Character'))}${match.name ? ` · ${match.name}` : ''}`
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
                    {textReplaceFieldLabel(match.label, match.field)} <code>{path}</code>
                    {context ? ` — ${context}` : ''}
                    {translate('(${0} matches)').replace('${0}', String(match.occurrences ?? 0))}
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

export function CharacterAuthoringTextReplaceDialog({
    commands,
    payload,
    onClose,
}: {
    commands?: AuthoringCommands;
    payload?: Record<string, unknown>;
    onClose: (applied: false | { card?: boolean; worldBook?: boolean; chat?: boolean }) => Promise<unknown> | unknown;
}) {
    useTranslated('');
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
    // true when the apply response was lost/aborted and the canonical outcome is unknown
    const unknownApplyRef = useRef(false);
    // coordination context for a pending apply: used to poll intent status on unknown result
    const coordinationRef = useRef<{ sessionId: string; intentId: string } | null>(null);
    const [finalizing, setFinalizing] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);
    // Keep a ref to commands so handleClose always reads the latest value
    // even though commands is not in handleClose's dependency array.
    const commandsRef = useRef(commands);
    commandsRef.current = commands;

    useEffect(() => {
        const background = Array.from(document.body.children).filter((element): element is HTMLElement =>
            element instanceof HTMLElement && element !== overlayRef.current && !element.inert,
        );
        background.forEach(element => { element.inert = true; });
        return () => { background.forEach(element => { element.inert = false; }); };
    }, []);

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
        { key: 'card', title: translate('Character fields'), matches: previewAreas?.card?.matches ?? [] },
        { key: 'worldBook', title: previewAreas?.worldBook?.embedded ? translate('Embedded world book') : translate('World book'), matches: previewAreas?.worldBook?.matches ?? [] },
        { key: 'chats', title: translate('Current chat'), matches: previewAreas?.chats?.matches ?? [] },
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
            setError(translate('Preview request failed'));
        } finally {
            setBusy('');
        }
    }, [commands, buildRequest, requestSignature]);

    const requestApply = useCallback(async () => {
        const remaining = effectiveOccurrences ?? 0;
        if (remaining <= 0) {
            return;
        }
        if (!window.confirm(translate('${0} matches will be replaced and cannot be undone. Continue?').replace('${0}', String(remaining)))) {
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
                if (result?.reason === 'network_error' || result?.reason === 'empty_response' || (result?.status != null && result.status >= 500)) {
                    unknownApplyRef.current = true;
                    // Store any coordination context so handleClose can poll the server.
                    const coord = (result as Record<string, unknown>)?._coordination;
                    if (coord && typeof coord === 'object' && 'sessionId' in coord && 'intentId' in coord) {
                        coordinationRef.current = coord as { sessionId: string; intentId: string };
                    }
                    setError(translate('The apply result is unknown. Do not close until you can verify the canonical state.'));
                }
                if (!unknownApplyRef.current) {
                    setError(describeTextReplaceFailure(result));
                }
            }
        } catch {
            unknownApplyRef.current = true;
            setError(translate('The apply result is unknown. Do not close until you can verify the canonical state.'));
        } finally {
            setBusy('');
        }
    }, [commands, buildRequest, effectiveOccurrences, worldArea, chatArea]);

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
            areaStatusNotes.push(translate('Character fields: no matches'));
        }
        if (previewAreas?.worldBook?.status === 'unchanged') {
            areaStatusNotes.push(translate('World book: no matches'));
        }
        if (previewAreas?.worldBook?.status === 'unbound') {
            areaStatusNotes.push(translate('No world book is bound and the card has no embedded world book'));
        }
        if (previewAreas?.worldBook?.status === 'missing') {
            areaStatusNotes.push(translate('Bound world book “${0}” was not found').replace('${0}', previewAreas.worldBook.name ?? ''));
        }
        if (previewAreas?.chats?.status === 'unchanged') {
            areaStatusNotes.push(translate('Current chat: no matches'));
        }
        if (previewAreas?.chats?.status === 'missing') {
            areaStatusNotes.push(translate('The current chat storage could not be found'));
        }
    }

    const handleClose = useCallback(async () => {
        if (busy || finalizing) {
            return;
        }
        // When the apply result is unknown (network abort), force a canonical
        // re-read of all areas that were targeted. This covers the case where
        // the server committed but the browser got no response: the form will
        // reload to the canonical value (LostAfter) rather than keeping the
        // stale draft (LostBefore). If the server did not commit, the form
        // reloads to whatever canonical currently holds.
        if (unknownApplyRef.current) {
            setFinalizing(true);
            setError('');
            try {
                // Poll the coordination server to find out if the apply committed.
                // If confirmed committed (or unknown_partial), force canonical reload.
                // If not committed, reload anyway so the form reflects canonical state.
                let outcome = 'not_committed';
                const coord = coordinationRef.current;
                if (coord && typeof commandsRef.current?.queryReplaceIntentOutcome === 'function') {
                    outcome = await (commandsRef.current.queryReplaceIntentOutcome as (c: unknown) => Promise<string>)(coord);
                }
                if (outcome === 'committed' || outcome === 'unknown_partial') {
                    // Server committed (or may have partially committed): force a
                    // canonical re-read so the form shows the replaced content.
                    const forceReload = { card: cardArea, worldBook: worldArea, chat: chatArea };
                    const result = await onClose(forceReload);
                    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
                        setError(describeTextReplaceFailure(result as TextReplaceResult));
                    }
                } else {
                    // Server did not commit (request never reached the server or was
                    // rejected before any write). Keep the dialog open so the user
                    // can retry or discard the draft manually.
                    setError(translate('The apply did not reach the server. Retry or discard the draft before closing.'));
                }
            } catch {
                setError(translate('Character refresh failed. Retry before closing.'));
            } finally {
                setFinalizing(false);
            }
            return;
        }
        if (!appliedRef.current) {
            onClose(false);
            return;
        }
        setFinalizing(true);
        setError('');
        try {
            const result = await onClose(appliedRef.current);
            if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
                setError(describeTextReplaceFailure(result as TextReplaceResult));
            }
        } catch {
            setError(translate('Character refresh failed. Retry before closing.'));
        } finally {
            setFinalizing(false);
        }
    }, [busy, finalizing, onClose]);
    /* Note: handleClose also reads commands.queryReplaceIntentOutcome for intent
       polling but commands is a stable host-injected reference — omitting it
       here is intentional to avoid spurious rebuilds of the close handler.
       coordinationRef captures the latest coordination context via a ref instead. */

    return createPortal(
        <div
            ref={overlayRef}
            {...stylex.props(authoringStyles.modalOverlay)}
            role="presentation"
            onMouseDown={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) {
                    void handleClose();
                }
            }}
            onMouseUp={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    void handleClose();
                }
            }}
        >
            <dialog open aria-modal="true" aria-label={translate('Find and replace')} {...stylex.props(authoringStyles.modalCard, authoringStyles.replaceModalCard)}>
                <div {...stylex.props(authoringStyles.modalHead)}>
                    <span {...stylex.props(authoringStyles.modalTitle)}>{translate('Find and replace')}</span>
                    <span {...stylex.props(authoringStyles.fieldMeta)}>{translate('Applies to the current character card')}</span>
                    <button
                        type="button"
                        {...stylex.props(authoringStyles.iconAction)}
                        title={translate('Close')}
                        aria-label={translate('Close')}
                        disabled={busy !== '' || finalizing}
                        onClick={() => void handleClose()}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
                {applyResult ? (
                    <div {...stylex.props(authoringStyles.replaceBody)}>
                        <div {...stylex.props(authoringStyles.replaceResultBox)}>
                            {applyResult.applied?.card ? <div>✓ {translate('Character card updated')}</div> : null}
                            {applyResult.applied?.worldBook ? <div>✓ {translate('World book updated')}{applyResult.areas?.worldBook?.boundCharacterCount && applyResult.areas.worldBook.boundCharacterCount > 1 ? translate('(also affects ${0} cards)').replace('${0}', String(applyResult.areas.worldBook.boundCharacterCount)) : ''}</div> : null}
                            {applyResult.applied?.chat ? <div>✓ {translate('Current chat updated (${0} matches)').replace('${0}', String(applyResult.areas?.chats?.occurrences ?? 0))}</div> : null}
                            {applyResult.areas?.card?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ {translate('Character card write failed:')}{applyResult.areas.card.reason ?? ''}</div> : null}
                            {applyResult.areas?.worldBook?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ {translate('World book write failed:')}{applyResult.areas.worldBook.reason ?? ''}</div> : null}
                            {applyResult.areas?.chats?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ {translate('Chat write failed:')}{applyResult.areas.chats.reason ?? ''}</div> : null}
                            {!error && !applyResult.applied?.card && !applyResult.applied?.worldBook && !applyResult.applied?.chat
                                && applyResult.areas?.card?.status !== 'failed'
                                && applyResult.areas?.worldBook?.status !== 'failed'
                                && applyResult.areas?.chats?.status !== 'failed' ? (
                                    <div>{translate('No matches needed writing.')}</div>
                                ) : null}
                            {(applyResult.warnings ?? []).map((warning, index) => (
                                <div key={index} {...stylex.props(authoringStyles.replaceWarningText)}>
                                    {warning.code === 'shared_world_book'
                                        ? translate('World book “${0}” is shared by ${1} character cards').replace('${0}', String(warning.name ?? '')).replace('${1}', String(warning.characters ?? 0))
                                        : warning.code === 'world_book_projection_failed'
                                            ? translate('Writing the compatibility file for world book “${0}” failed and is queued for repair').replace('${0}', String(warning.name ?? ''))
                                            : translate('Warning: ${0}').replace('${0}', String(warning.code ?? ''))}
                                </div>
                            ))}
                        </div>
                        {error ? <div {...stylex.props(authoringStyles.replaceErrorText)}>{error}</div> : null}

                        <div {...stylex.props(authoringStyles.replaceFooter)}>
                            <button type="button" className={`menu_button ${stylex.props(authoringStyles.saveButton).className ?? ''}`} disabled={busy !== '' || finalizing} onClick={() => void handleClose()}>
                                {finalizing ? translate('Loading…') : translate('Done')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div {...stylex.props(authoringStyles.replaceBody)}>
                        <div {...stylex.props(authoringStyles.replaceFieldRow)}>
                            <label {...stylex.props(authoringStyles.replaceField)}>
                                <span {...stylex.props(authoringStyles.fieldLabel)}>{translate('Find')}</span>
                                <textarea
                                    className="text_pole"
                                    rows={2}
                                    value={query}
                                    autoFocus
                                    placeholder={regex ? translate('Regular expression (supports capture references like $1)') : translate('Text to find')}
                                    {...stylex.props(authoringStyles.control, authoringStyles.replaceQueryInput)}
                                    onChange={event => setQuery(event.target.value)}
                                />
                            </label>
                            <label {...stylex.props(authoringStyles.replaceField)}>
                                <span {...stylex.props(authoringStyles.fieldLabel)}>{translate('Replace with')}</span>
                                <textarea
                                    className="text_pole"
                                    rows={2}
                                    value={replacement}
                                    placeholder={translate('Replacement text (may be empty)')}
                                    {...stylex.props(authoringStyles.control, authoringStyles.replaceQueryInput)}
                                    onChange={event => setReplacement(event.target.value)}
                                />
                            </label>
                        </div>
                        <div {...stylex.props(authoringStyles.replaceChecksRow)}>
                            <TextReplaceCheckRow checked={caseSensitive} label={translate('Case sensitive')} disabled={busy !== ''} onChange={setCaseSensitive} />
                            <TextReplaceCheckRow checked={wholeWord} label={translate('Whole word')} disabled={busy !== ''} onChange={setWholeWord} />
                            <TextReplaceCheckRow checked={regex} label={translate('Regex')} disabled={busy !== ''} onChange={setRegex} />
                        </div>
                        <div {...stylex.props(authoringStyles.replaceScopeBlock)}>
                            <TextReplaceCheckRow
                                checked={cardArea}
                                label={<strong>{translate('Character fields')}</strong>}
                                disabled={busy !== ''}
                                onChange={setCardArea}
                            />
                            {cardArea ? (
                                <div {...stylex.props(authoringStyles.replaceChecksRow, authoringStyles.replaceChecksNested)}>
                                    {TEXT_REPLACE_CARD_FIELDS.map(field => (
                                        <TextReplaceCheckRow
                                            key={field.id}
                                            checked={cardFields.has(field.id)}
                                            label={field.id === 'tags' ? translate('Tags (deduplicated after replacement)') : translate(field.labelKey)}
                                            disabled={busy !== ''}
                                            onChange={checked => toggleField(cardFields, setCardFields, field.id, checked)}
                                        />
                                    ))}
                                </div>
                            ) : null}
                            <TextReplaceCheckRow
                                checked={worldArea}
                                label={<strong>{translate('World book')}</strong>}
                                disabled={busy !== ''}
                                onChange={setWorldArea}
                            />
                            {worldArea ? (
                                <div {...stylex.props(authoringStyles.replaceChecksRow, authoringStyles.replaceChecksNested)}>
                                    {TEXT_REPLACE_WORLD_FIELDS.map(field => (
                                        <TextReplaceCheckRow
                                            key={field.id}
                                            checked={worldFields.has(field.id)}
                                            label={translate(field.labelKey)}
                                            disabled={busy !== ''}
                                            onChange={checked => toggleField(worldFields, setWorldFields, field.id, checked)}
                                        />
                                    ))}
                                </div>
                            ) : null}
                            <TextReplaceCheckRow
                                checked={chatArea}
                                label={<strong>{translate('Current chat')}</strong>}
                                disabled={busy !== ''}
                                onChange={setChatArea}
                            />
                            {chatArea ? (
                                <div {...stylex.props(authoringStyles.replaceChecksRow, authoringStyles.replaceChecksNested)}>
                                    {TEXT_REPLACE_CHAT_FIELDS.map(field => (
                                        <TextReplaceCheckRow
                                            key={field.id}
                                            checked={chatFields.has(field.id)}
                                            label={translate(field.labelKey)}
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
                                    <div {...stylex.props(authoringStyles.replaceWarningText)}>{translate('Parameters changed. Preview again before applying.')}</div>
                                ) : null}
                                <div {...stylex.props(authoringStyles.fieldLabel)}>
                                    {translate('${0} matches').replace('${0}', String(effectiveOccurrences ?? 0))}
                                </div>
                                {previewAreas?.worldBook?.boundCharacterCount && previewAreas.worldBook.boundCharacterCount > 1 ? (
                                    <div {...stylex.props(authoringStyles.replaceWarningText)}>
                                        {translate('World book “${0}” is shared by ${1} character cards')
                                            .replace('${0}', String(previewAreas.worldBook.name ?? ''))
                                            .replace('${1}', String(previewAreas.worldBook.boundCharacterCount))}
                                    </div>
                                ) : null}
                                {areaStatusNotes.map((note, index) => (
                                    <div key={index} {...stylex.props(authoringStyles.replaceMutedText)}>{note}</div>
                                ))}
                                {(preview.warnings ?? []).filter(warning => warning.code !== 'shared_world_book').map((warning, index) => (
                                    <div key={index} {...stylex.props(authoringStyles.replaceWarningText)}>{translate('Warning: ${0}').replace('${0}', String(warning.code ?? ''))}</div>
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
                                {busy === 'preview' ? translate('Previewing…') : translate('Preview')}
                            </button>
                            {preview && !previewStale ? (
                                <button
                                    type="button"
                                    className={`menu_button ${stylex.props(authoringStyles.saveButton).className ?? ''}`}
                                    disabled={busy !== '' || !(effectiveOccurrences && effectiveOccurrences > 0)}
                                    onClick={() => void requestApply()}
                                >
                                    {busy === 'apply'
                        ? translate('Applying…')
                        : translate('Apply ${0} replacements').replace('${0}', String(effectiveOccurrences ?? 0))}
                                </button>
                            ) : null}
                        </div>
                        <p {...stylex.props(authoringStyles.modalHint)}>
                            {translate('Preview the matches first; replacements write to live data and cannot be rolled back.')}
                        </p>
                    </div>
                )}
            </dialog>
        </div>,
        document.body,
    );
}
