import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { MainChatCommands } from '../../compat/workspace-commands';
import { translate, useTranslated } from '../../compat/i18n.js';
import type { MainChatGreetingsSnapshot } from '../../stores/main-chat-store';
import { mainChatGreetingPickerStyles as styles } from './MainChatGreetingPicker.styles';

function greetingLabel(index: number) {
    return index === 0
        ? translate('First message')
        : translate('Alternate greeting ${0}').replace('${0}', String(index));
}

function greetingSummary(text: string, query: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const needle = query.replace(/\s+/g, ' ').trim();
    const match = needle ? normalized.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
    const start = match > 35 ? match - 35 : 0;
    const end = Math.min(normalized.length, Math.max(start + 100, match + needle.length));
    const before = start > 0 ? '…' : '';
    const after = end < normalized.length ? '…' : '';
    if (match < 0) return `${normalized.slice(0, 100)}${normalized.length > 100 ? '…' : ''}`;
    return <>{before}{normalized.slice(start, match)}<mark {...stylex.props(styles.match)}>{normalized.slice(match, match + needle.length)}</mark>{normalized.slice(match + needle.length, end)}{after}</>;
}

export function MainChatGreetingPicker({
    greetings,
    commands,
}: {
    greetings: MainChatGreetingsSnapshot;
    commands?: MainChatCommands;
}) {
    useTranslated('');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const focusRestoreRef = useRef<HTMLElement | null>(null);
    const searchId = useId();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [previewIndex, setPreviewIndex] = useState<number | null>(greetings.selectedIndex);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const greetingSessionId = greetings.chatId;
    const selectedGreeting = greetings.options.find(option => option.index === greetings.selectedIndex) ?? null;

    const filteredGreetings = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!query) return greetings.options;
        return greetings.options.filter(option => (
            `${greetingLabel(option.index)} ${option.text}`.toLocaleLowerCase().includes(query)
        ));
    }, [greetings.options, search]);
    const previewGreeting = filteredGreetings.find(option => option.index === previewIndex)
        ?? filteredGreetings[0]
        ?? null;

    const close = useCallback(() => {
        if (busy) return;
        setOpen(false);
    }, [busy]);

    useEffect(() => {
        setOpen(false);
        setSearch('');
        setPreviewIndex(greetings.selectedIndex);
        setBusy(false);
        setError('');
    }, [greetingSessionId, greetings.selectedIndex]);

    useEffect(() => {
        if (!open) return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        dialog.showModal();
        return () => dialog.close();
    }, [open]);

    useEffect(() => {
        if (open) return;
        const target = focusRestoreRef.current;
        focusRestoreRef.current = null;
        if (target?.isConnected) target.focus();
    }, [open]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (open && !busy && dialog && !dialog.contains(document.activeElement)) {
            dialog.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
        }
    }, [open, busy]);

    const openPicker = () => {
        focusRestoreRef.current = triggerRef.current;
        setSearch('');
        setPreviewIndex(greetings.selectedIndex ?? greetings.options[0]?.index ?? null);
        setError('');
        setOpen(true);
    };

    const confirmSelection = async () => {
        if (busy || previewGreeting === null || !greetings.characterId || !greetings.chatId) return;
        setBusy(true);
        setError('');
        try {
            const selected = await commands?.selectGreeting(previewGreeting.index, greetings.characterId, greetings.chatId);
            if (selected === true) {
                setOpen(false);
                return;
            }
            setError(translate('Could not use that greeting. The chat state may have changed; try again.'));
        } catch {
            setError(translate('Could not use that greeting. Check the connection and try again.'));
        } finally {
            setBusy(false);
        }
    };

    // A pending save can temporarily disable selection in a refreshed snapshot.
    // Keep an open native dialog mounted so its modal/focus lifecycle survives.
    if (!open && (!greetings.canSelect || greetings.options.length < 2)) return null;

    return (
        <section data-testid="main-chat-greeting-picker">
            <button
                ref={triggerRef}
                data-greeting-picker-trigger=""
                type="button"
                className={`menu_button ${stylex.props(styles.trigger).className ?? ''}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={translate('Select greeting')}
                disabled={!greetings.canSelect}
                onClick={openPicker}
            >
                <i className="fa-solid fa-message" aria-hidden="true" />
                <span>{selectedGreeting ? greetingLabel(selectedGreeting.index) : translate('Select greeting')}</span>
                {selectedGreeting ? <span {...stylex.props(styles.count)}>{greetings.options.indexOf(selectedGreeting) + 1} / {greetings.options.length}</span> : null}
                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
            </button>
            {open ? (
                <dialog
                    ref={dialogRef}
                    aria-labelledby={`${searchId}-title`}
                    {...stylex.props(styles.overlay)}
                    onCancel={event => {
                        event.preventDefault();
                        close();
                    }}
                    onClick={event => {
                        if (event.target === event.currentTarget) close();
                    }}
                >
                    <div {...stylex.props(styles.panel)}>
                        <div {...stylex.props(styles.header)}>
                            <h2 id={`${searchId}-title`} {...stylex.props(styles.title)}>{translate('Select greeting')}</h2>
                            <button type="button" className={`menu_button ${stylex.props(styles.closeButton).className ?? ''}`} aria-label={translate('Cancel and close')} disabled={busy} onClick={close}>
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>
                        <label htmlFor={searchId} className="sr-only">{translate('Search greetings')}</label>
                        <input
                            id={searchId}
                            type="search"
                            autoFocus
                            {...stylex.props(styles.search)}
                            placeholder={translate('Search greetings')}
                            value={search}
                            disabled={busy}
                            onChange={event => setSearch(event.target.value)}
                        />
                        <div {...stylex.props(styles.content)}>
                            <div {...stylex.props(styles.options)} aria-label={translate('Greeting list')}>
                                {filteredGreetings.map(option => {
                                    const active = option.index === previewGreeting?.index;
                                    return (
                                        <button
                                            key={option.index}
                                            type="button"
                                            {...stylex.props(styles.option, active && styles.optionActive)}
                                            aria-pressed={active}
                                            disabled={busy}
                                            onClick={() => {
                                                setPreviewIndex(option.index);
                                                setError('');
                                            }}
                                        >
                                            <span {...stylex.props(styles.optionTitle)}>
                                                {greetingLabel(option.index)}
                                                {option.index === greetings.selectedIndex ? <span {...stylex.props(styles.current)}>{translate('In use')}</span> : null}
                                            </span>
                                            <span {...stylex.props(styles.optionPreview)}>{greetingSummary(option.text, search)}</span>
                                        </button>
                                    );
                                })}
                                {filteredGreetings.length === 0 ? <p {...stylex.props(styles.empty)} role="status">{translate('No matching greetings found.')}</p> : null}
                            </div>
                            <article {...stylex.props(styles.preview)} aria-live="polite">
                                <h3 {...stylex.props(styles.previewTitle)}>{previewGreeting
                    ? translate('Preview · ${0}').replace('${0}', greetingLabel(previewGreeting.index))
                    : translate('No greeting to preview')}</h3>
                                <p {...stylex.props(styles.previewText)}>{previewGreeting?.text ?? translate('Change or clear the search to see more.')}</p>
                            </article>
                        </div>
                        {error ? <p {...stylex.props(styles.status)} role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</p> : null}
                        <div {...stylex.props(styles.actions)}>
                            <button type="button" className={`menu_button ${stylex.props(styles.action).className ?? ''}`} disabled={busy} onClick={close}>{translate('Cancel')}</button>
                            <button
                                type="button"
                                className={`menu_button ${stylex.props(styles.action, styles.confirmAction).className ?? ''}`}
                                disabled={busy || !greetings.canSelect || previewGreeting === null}
                                onClick={() => void confirmSelection()}
                            >
                                {busy
                        ? translate('Applying…')
                        : previewGreeting
                            ? translate('Use ${0}').replace('${0}', greetingLabel(previewGreeting.index))
                            : translate('Use this greeting')}
                            </button>
                        </div>
                    </div>
                </dialog>
            ) : null}
        </section>
    );
}
