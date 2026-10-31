import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { createPortal } from 'react-dom';
import { translate, useTranslated } from '@/compat/i18n.js';
import { authoringStyles } from '@/styles/workspace-panels.styles.js';

export function CharacterTagManagerDialog({
    values,
    onChange,
    onClose,
}: {
    values: string[];
    onChange: (values: string[]) => void;
    onClose: () => void;
}) {
    useTranslated('');
    const [query, setQuery] = useState('');
    const [pending, setPending] = useState('');
    const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
    const filteredValues = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return values
            .map((value, index) => ({ value, index }))
            .filter(({ value }) => !normalizedQuery || value.toLocaleLowerCase().includes(normalizedQuery));
    }, [query, values]);

    const addTag = () => {
        const pendingValues = pending.split(',').map(value => value.trim()).filter(Boolean);
        const nextValues = pendingValues.filter((value, index) => (
            pendingValues.indexOf(value) === index && !values.includes(value)
        ));
        if (nextValues.length === 0) {
            return;
        }
        onChange([...values, ...nextValues]);
        setPending('');
    };

    const toggleSelected = (index: number, checked: boolean) => {
        setSelected(current => {
            const next = new Set(current);
            if (checked) {
                next.add(index);
            } else {
                next.delete(index);
            }
            return next;
        });
    };

    const removeSelected = () => {
        onChange(values.filter((_, index) => !selected.has(index)));
        setSelected(new Set());
    };

    return createPortal(
        <div
            {...stylex.props(authoringStyles.modalOverlay, authoringStyles.tagManagerOverlay)}
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            onKeyDown={event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            <dialog open aria-modal="true" aria-label={translate('Tags')} {...stylex.props(authoringStyles.modalCard, authoringStyles.tagManagerModal)}>
                <div {...stylex.props(authoringStyles.modalHead)}>
                    <span {...stylex.props(authoringStyles.modalTitle)}>{translate('Tags')}</span>
                    <span {...stylex.props(authoringStyles.fieldMeta)}>{translate('${0} tags').replace('${0}', String(values.length))}</span>
                    <button
                        type="button"
                        {...stylex.props(authoringStyles.iconAction)}
                        title={translate('Close')}
                        aria-label={translate('Close')}
                        onClick={onClose}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
                <input
                    type="search"
                    className="text_pole"
                    autoFocus
                    value={query}
                    placeholder={translate('Search tags')}
                    aria-label={translate('Search tags')}
                    {...stylex.props(authoringStyles.control, authoringStyles.tagManagerInput, authoringStyles.tagManagerSearch)}
                    onChange={event => setQuery(event.target.value)}
                />
                <form
                    {...stylex.props(authoringStyles.tagManagerAddRow)}
                    onSubmit={event => {
                        event.preventDefault();
                        addTag();
                    }}
                >
                    <input
                        type="text"
                        className="text_pole"
                        value={pending}
                        placeholder={translate('Add tag')}
                        aria-label={translate('Add tag')}
                        {...stylex.props(authoringStyles.control, authoringStyles.tagManagerInput, authoringStyles.fieldInput)}
                        onChange={event => setPending(event.target.value)}
                    />
                    <button type="submit" className="menu_button" {...stylex.props(authoringStyles.tagManagerAction, authoringStyles.tagManagerAddAction)} disabled={!pending.trim() || values.includes(pending.trim())}>
                        <i className="fa-solid fa-plus" aria-hidden="true" />
                        {translate('Add')}
                    </button>
                </form>
                <div {...stylex.props(authoringStyles.tagManagerList)}>
                    {filteredValues.length > 0 ? filteredValues.map(({ value, index }) => (
                        <div key={index} {...stylex.props(authoringStyles.tagManagerRow)}>
                            <label {...stylex.props(authoringStyles.tagManagerChoice)}>
                                <input
                                    type="checkbox"
                                    checked={selected.has(index)}
                                    aria-label={value}
                                    {...stylex.props(authoringStyles.tagManagerCheckbox)}
                                    onChange={event => toggleSelected(index, event.target.checked)}
                                />
                                <span title={value}>{value}</span>
                            </label>
                            <button
                                type="button"
                                {...stylex.props(authoringStyles.iconAction)}
                                title={translate('Remove tag ${0}').replace('${0}', value)}
                                aria-label={translate('Remove tag ${0}').replace('${0}', value)}
                                onClick={() => {
                                    onChange(values.filter((_, valueIndex) => valueIndex !== index));
                                    setSelected(new Set());
                                }}
                            >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>
                    )) : (
                        <div {...stylex.props(authoringStyles.tagManagerEmpty)}>{translate(values.length ? 'No matching tags' : 'No tags')}</div>
                    )}
                </div>
                <div {...stylex.props(authoringStyles.tagManagerFooter)}>
                    <button type="button" className="menu_button" {...stylex.props(authoringStyles.tagManagerAction)} disabled={selected.size === 0} onClick={removeSelected}>
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                        {translate('Remove selected')} {selected.size > 0 ? `(${selected.size})` : ''}
                    </button>
                </div>
            </dialog>
        </div>,
        document.body,
    );
}
