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

type AppliedAreas = { card?: boolean; worldBook?: boolean; chat?: boolean };
type ReplaceIntent = { sessionId: string; intentId: string };

function recoveredAreaStatus(status: string | undefined): TextReplaceArea | undefined {
    if (status === 'not_committed') return { status: 'failed' };
    if (status === 'not_attempted') return { status: 'skipped' };
    return undefined;
}

interface TextReplaceResult {
    ok?: boolean;
    reason?: string;
    status?: number;
    applied?: AppliedAreas;
    outcomeUnknown?: boolean;
    previewVersions?: Record<string, unknown>;
    _coordination?: ReplaceIntent;
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
    preview_stale: translate('The data changed after preview. Preview again before applying.'),
    replace_intent_unavailable: translate('Could not prepare the replacement. Nothing was replaced.'),
    chat_save_failed: translate('The current chat could not be saved. Nothing was replaced.'),
};

function describeTextReplaceFailure(result: TextReplaceResult | null | undefined): string {
    const reason = String(result?.reason ?? '');
    if (!reason) {
        return translate('The operation failed');
    }
    if (reason === 'character_save_failed') return translate('The character could not be saved. Your edits are still here.');
    if (reason === 'character_refresh_failed') return translate('The character could not be reloaded. Retry before closing.');
    if (reason === 'chat_refresh_failed') return translate('The chat could not be reloaded. Retry before closing.');
    if (reason === 'world_book_refresh_failed') return translate('The world book could not be reloaded. Retry before closing.');
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
    disabled,
}: {
    match: TextReplaceMatch;
    excluded: boolean;
    onToggle: (path: string, excluded: boolean) => void;
    disabled?: boolean;
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
                    disabled={disabled}
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
    onClose: (applied: false | AppliedAreas, keepOpen?: boolean, worldName?: string | null) => Promise<unknown> | unknown;
}) {
    useTranslated('');
    const [query, setQuery] = useState('');
    const [replacement, setReplacement] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [regex, setRegex] = useState(false);
    const [cardArea, setCardArea] = useState(true);
    const [worldArea, setWorldArea] = useState(false);
    const [chatArea, setChatArea] = useState(false);
    const [cardFields, setCardFields] = useState<Set<string>>(() => new Set(TEXT_REPLACE_CARD_FIELDS.map(field => field.id)));
    const [worldFields, setWorldFields] = useState<Set<string>>(() => new Set(TEXT_REPLACE_WORLD_FIELDS.map(field => field.id)));
    const [chatFields, setChatFields] = useState<Set<string>>(() => new Set(TEXT_REPLACE_CHAT_FIELDS.map(field => field.id)));
    const [busy, setBusy] = useState<'' | 'preview' | 'apply'>('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<TextReplaceResult | null>(null);
    const [applyResult, setApplyResult] = useState<TextReplaceResult | null>(null);
    const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
    const [confirmSignature, setConfirmSignature] = useState<string | null>(null);
    const [uncertain, setUncertain] = useState<{ intent?: ReplaceIntent; applied?: AppliedAreas } | null>(null);
    const [completed, setCompleted] = useState<AppliedAreas>({});
    const [finalizing, setFinalizing] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);


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
    const worldTitle = previewAreas?.worldBook?.embedded ? translate('Embedded world book') : translate('World book');
    const matchGroups: { key: string; title: string; matches: TextReplaceMatch[] }[] = preview ? [
        { key: 'card', title: translate('Character fields'), matches: previewAreas?.card?.matches ?? [] },
        { key: 'worldBook', title: [worldTitle, previewAreas?.worldBook?.name].filter(Boolean).join(' · '), matches: previewAreas?.worldBook?.matches ?? [] },
        { key: 'chats', title: [translate('Current chat'), previewAreas?.chats?.fileName].filter(Boolean).join(' · '), matches: previewAreas?.chats?.matches ?? [] },
    ].filter(group => group.matches.length > 0) : [];

    const effectiveOccurrences = preview && previewSignature === requestSignature
        ? matchGroups.reduce((sum, group) => sum + group.matches
            .filter(match => !excluded.has(String(match.path ?? '')))
            .reduce((inner, match) => inner + (match.occurrences ?? 0), 0), 0)
        : null;
    const previewStale = preview != null && previewSignature !== requestSignature;
    const selectionSignature = JSON.stringify([requestSignature, [...excluded].sort()]);
    const confirming = !previewStale && confirmSignature === selectionSignature;

    const requestPreview = useCallback(async () => {
        setBusy('preview');
        setError('');
        setPreview(null);
        setConfirmSignature(null);
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
        if (remaining <= 0 || !preview?.previewVersions || !confirming || busy) {
            return;
        }
        setConfirmSignature(null);
        setBusy('apply');
        setError('');
        try {
            const result = await commands?.applyTextReplace?.({
                ...buildRequest(), previewVersions: preview.previewVersions, worldName: previewAreas?.worldBook?.name,
            }) as TextReplaceResult | undefined;
            if (result?.outcomeUnknown || result?._coordination && (
                result.reason === 'network_error' || result.reason === 'empty_response' || result.reason === 'replacement_not_claimed'
                || result.outcomeUnknown === undefined && Number(result.status) >= 500)) {
                setUncertain({ intent: result._coordination, applied: result.applied });
            } else if (result && (result.ok || Object.values(result.applied ?? {}).some(Boolean))) {
                setApplyResult(result);
            }
            if (result?.reason === 'preview_stale') setPreviewSignature(null);
            if (!result?.ok) setError(describeTextReplaceFailure(result));
        } catch {
            setUncertain({});
        } finally {
            setBusy('');
        }
    }, [commands, buildRequest, effectiveOccurrences, preview, previewAreas, confirming, busy]);

    const toggleExclude = useCallback((path: string, exclude: boolean) => {
        setConfirmSignature(null);
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

    const refreshResult = async (keepOpen = false) => {
        if (busy || finalizing || uncertain) return;
        setFinalizing(true);
        setError('');
        try {
            const applied = applyResult?.applied ?? {};
            const result = await onClose(Object.values(applied).some(Boolean) ? applied : false, keepOpen, previewAreas?.worldBook?.name);
            if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
                setError(describeTextReplaceFailure(result as TextReplaceResult));
                return;
            }
            if (keepOpen) {
                setCompleted(previous => ({
                    card: previous.card || applied.card,
                    worldBook: previous.worldBook || applied.worldBook,
                    chat: previous.chat || applied.chat,
                }));
                if (applied.card) setCardArea(false);
                if (applied.worldBook) setWorldArea(false);
                if (applied.chat) setChatArea(false);
                setApplyResult(null);
                setPreview(null);
                setConfirmSignature(null);
            }
        } catch {
            setError(translate('Character refresh failed. Retry before closing.'));
        } finally {
            setFinalizing(false);
        }
    };

    const checkStatus = async () => {
        if (!uncertain?.intent || finalizing) return;
        setFinalizing(true);
        setError('');
        try {
            const status = await commands?.queryReplaceIntentOutcome?.(uncertain.intent);
            const areas = status?.areas ?? {};
            const applied = {
                card: uncertain.applied?.card || areas.card === 'committed',
                worldBook: uncertain.applied?.worldBook || areas.worldBook === 'committed',
                chat: uncertain.applied?.chat || areas.chat === 'committed',
            };
            if (!status || Object.values(areas).includes('unknown')
                || (status.outcome !== 'completed' && !Object.keys(areas).length)) {
                setUncertain({ ...uncertain, applied });
                return;
            }
            setUncertain(null);
            const anyApplied = Object.values(applied).some(Boolean);
            if (anyApplied) {
                const failed = Object.values(areas).includes('not_committed');
                setApplyResult({
                    applied,
                    ok: status.outcome === 'completed' && !failed,
                    areas: { card: recoveredAreaStatus(areas.card), worldBook: recoveredAreaStatus(areas.worldBook), chats: recoveredAreaStatus(areas.chat) },
                });
            } else {
                setPreviewSignature(null);
                setError(translate('Nothing was replaced. Preview again before applying.'));
            }
        } catch {
            // Status could not be read; keep the original intent and draft protected.
        } finally {
            setFinalizing(false);
        }
    };

    const handleClose = () => refreshResult();
    const canRetryRemaining = applyResult?.ok === false && !!(
        cardArea && !applyResult.applied?.card || worldArea && !applyResult.applied?.worldBook || chatArea && !applyResult.applied?.chat
    );

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

                    <button
                        type="button"
                        {...stylex.props(authoringStyles.iconAction)}
                        title={translate('Close')}
                        aria-label={translate('Close')}
                        disabled={busy !== '' || finalizing || !!uncertain}
                        onClick={() => void handleClose()}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
                {uncertain ? (
                    <div {...stylex.props(authoringStyles.replaceBody)}>
                        <div role="status" {...stylex.props(authoringStyles.replaceResultBox)}>
                            {translate('The replacement outcome is not yet known.')}
                            {uncertain.applied?.card ? <div>✓ {translate('Character card updated')}</div> : null}
                            {uncertain.applied?.worldBook ? <div>✓ {translate('World book updated')}</div> : null}
                            {uncertain.applied?.chat ? <div>✓ {translate('Current chat updated')}</div> : null}
                        </div>
                        <div {...stylex.props(authoringStyles.replaceFooter)}>
                            <button type="button" className="menu_button" disabled={finalizing || !uncertain.intent} onClick={() => void checkStatus()}>
                                {finalizing ? translate('Loading…') : translate('Check replacement status')}
                            </button>
                        </div>
                    </div>
                ) : applyResult ? (
                    <div {...stylex.props(authoringStyles.replaceBody)}>
                        <div {...stylex.props(authoringStyles.replaceResultBox)}>
                            {applyResult.applied?.card ? <div>✓ {translate('Character card updated')}</div> : null}
                            {applyResult.applied?.worldBook ? <div>✓ {translate('World book updated')}{applyResult.areas?.worldBook?.boundCharacterCount && applyResult.areas.worldBook.boundCharacterCount > 1 ? translate('(also affects ${0} cards)').replace('${0}', String(applyResult.areas.worldBook.boundCharacterCount)) : ''}</div> : null}
                            {applyResult.applied?.chat ? <div>✓ {applyResult.areas?.chats?.occurrences == null ? translate('Current chat updated') : translate('Current chat updated (${0} matches)').replace('${0}', String(applyResult.areas.chats.occurrences))}</div> : null}
                            {applyResult.areas?.card?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ {translate('Character card write failed:')}{applyResult.areas.card.reason ?? ''}</div> : null}
                            {applyResult.areas?.worldBook?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ {translate('World book write failed:')}{applyResult.areas.worldBook.reason ?? ''}</div> : null}
                            {applyResult.areas?.chats?.status === 'failed' ? <div {...stylex.props(authoringStyles.replaceErrorText)}>✗ {translate('Chat write failed:')}{applyResult.areas.chats.reason ?? ''}</div> : null}
                            {!applyResult.ok && ([
                                { selected: cardArea, area: 'card', label: 'Character card not attempted' },
                                { selected: worldArea, area: 'worldBook', label: 'World book not attempted' },
                                { selected: chatArea, area: 'chats', label: 'Current chat not attempted' },
                            ] as const).map(({ selected, area, label }) => selected && applyResult.areas?.[area]?.status === 'skipped'
                                ? <div key={area}>{translate(label)}</div> : null)}
                            {applyResult.ok && !error && !applyResult.applied?.card && !applyResult.applied?.worldBook && !applyResult.applied?.chat
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
                            {canRetryRemaining ? (
                                <button type="button" className="menu_button" disabled={finalizing} onClick={() => void refreshResult(true)}>
                                    {translate('Review remaining areas')}
                                </button>
                            ) : null}
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
                                    disabled={busy !== ''}
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
                                    disabled={busy !== ''}
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
                                label={<strong>{translate('Character fields')}{completed.card ? ' ✓' : ''}</strong>}
                                disabled={busy !== '' || !!completed.card}
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
                                label={<strong>{translate('World book')}{completed.worldBook ? ' ✓' : ''}</strong>}
                                disabled={busy !== '' || !!completed.worldBook}
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
                                label={<strong>{translate('Current chat')}{completed.chat ? ' ✓' : ''}</strong>}
                                disabled={busy !== '' || !!completed.chat}
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
                                                        disabled={busy !== ''}
                                                        onToggle={toggleExclude}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        {confirming ? <p {...stylex.props(authoringStyles.replaceWarningText)}>{translate('${0} selected replacements cannot be undone.').replace('${0}', String(effectiveOccurrences ?? 0))}</p> : null}
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
                                    disabled={busy !== '' || !preview.previewVersions || !(effectiveOccurrences && effectiveOccurrences > 0)}
                                    onClick={() => confirming ? void requestApply() : setConfirmSignature(selectionSignature)}
                                >
                                    {busy === 'apply'
                                        ? translate('Applying…')
                                        : (confirming ? translate('Confirm ${0} replacements') : translate('Apply ${0} replacements')).replace('${0}', String(effectiveOccurrences ?? 0))}
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
