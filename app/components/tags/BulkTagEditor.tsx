import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ContractButton } from '../contract/ContractButton';
import { t, translate, useTranslated } from '@/compat/i18n.js';
import { tagSurfaceStyles as s } from '@/styles/tags.styles';
import type { BulkTagEditorRuntime, TagView } from './types';

type ToastrLike = {
    error?(message: string): void;
};

function reportFailure(action: string, error: unknown) {
    console.error(`[BulkTagEditor] ${action} failed`, error);
    const toastr = (globalThis as { toastr?: ToastrLike }).toastr;
    toastr?.error?.(translate('Tag operation failed.'));
}

export interface BulkTagEditorProps {
    runtime: BulkTagEditorRuntime;
    avatars?: Array<{ id: string; name: string; url: string; isFav: boolean }>;
    /** Provided by the host that owns the popup shell. */
    onClose?: () => void;
    onOpenTagManager?: () => void;
}

const normalizeName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
type Suggestion = { type: 'create'; name: string } | { type: 'existing'; tag: TagView };

function suggestionId(suggestion: Suggestion): string {
    return suggestion.type === 'create' ? 'bulkTagSuggestion-create' : `bulkTagSuggestion-${suggestion.tag.id}`;
}

/**
 * Bulk tag popup content bound to a set of already-captured characters.
 * React owns markup/input; the runtime owns the tag map and persistence.
 */
export function BulkTagEditor({ runtime, avatars = [], onClose, onOpenTagManager }: BulkTagEditorProps) {
    useTranslated('');
    const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const { commands } = runtime;
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [busy, setBusy] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const run = useCallback(async (key: string, action: () => Promise<void>) => {
        setBusy(key);
        try {
            await action();
        } catch (error) {
            reportFailure(key, error);
        } finally {
            setBusy(current => (current === key ? null : current));
        }
    }, []);

    const suggestions = useMemo(() => {
        const selectedIds = new Set(snapshot.selectedTags.map(tag => tag.id));
        const name = query.trim();
        const matches = snapshot.availableTags.filter(tag => !selectedIds.has(tag.id) && normalizeName(tag.name).includes(normalizeName(name)));
        const exact = snapshot.availableTags.some(tag => normalizeName(tag.name) === normalizeName(name));
        const choices: Suggestion[] = matches.map(tag => ({ type: 'existing', tag }));
        if (name && !exact) choices.unshift({ type: 'create', name });
        return choices;
    }, [query, snapshot.availableTags, snapshot.selectedTags]);

    const selectSuggestion = (suggestion: Suggestion) => {
        setQuery('');
        setActiveIndex(-1);
        setShowSuggestions(false);
        try {
            if (suggestion.type === 'existing') commands.addTag(suggestion.tag.id);
            else commands.createAndAddTag(suggestion.name);
        } catch (error) {
            reportFailure('add', error);
        }
    };

    const commitQuery = () => {
        const name = query.trim();
        if (!name) {
            return;
        }
        const exact = snapshot.availableTags.find(tag => normalizeName(tag.name) === normalizeName(name));
        const picked = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
        selectSuggestion(picked ?? (exact ? { type: 'existing', tag: exact } : { type: 'create', name }));
    };

    const disabled = busy !== null;

    return (
        <div id="bulk_tag_popup_holder">
            <h3 id="bulk_tag_popup_title" className="marginBot5">
                {t`Modify tags of ${snapshot.characterCount} characters`}
            </h3>
            <small className="bulk_tags_desc m-b-1">
                {translate('Add or remove the mutual tags of all selected characters. Import all or existing tags for all selected characters.')}
            </small>
            <div id="bulk_tags_avatars_block" className="avatars_inline avatars_inline_small tags tags_inline">
                {avatars.map(avatar => (
                    <div key={avatar.id} className={`avatar inline_avatar flex alignitemscenter textAlignCenter${avatar.isFav ? ' is_fav' : ''}`} title={avatar.name}>
                        <img src={avatar.url} alt={avatar.name} loading="lazy" decoding="async" />
                    </div>
                ))}
            </div>
            <br />
            <div
                id="bulk_tags_div"
                className="marginBot5"
                data-character-count={String(snapshot.characterCount)}
            >
                <div className="tag_controls">
                    <div {...stylex.props(s.suggestionAnchor)}>
                        <input
                            ref={inputRef}
                            id="bulkTagInput"
                            className="text_pole tag_input wide100p margin0"
                            placeholder={translate('Search / Create tags')}
                            aria-label={translate('Search / Create tags')}
                            aria-autocomplete="list"
                            aria-expanded={showSuggestions && suggestions.length > 0}
                            aria-controls="bulkTagSuggestions"
                            aria-activedescendant={activeIndex >= 0 && suggestions[activeIndex] ? suggestionId(suggestions[activeIndex]) : undefined}
                            autoComplete="off"
                            maxLength={25}
                            role="combobox"
                            value={query}
                            onInput={event => event.stopPropagation()}
                            onChange={event => {
                                setQuery(event.target.value);
                                setActiveIndex(-1);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setShowSuggestions(false)}
                            onKeyDown={event => {
                                if (event.nativeEvent.isComposing) {
                                    return;
                                }
                                if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    setShowSuggestions(true);
                                    setActiveIndex(current => Math.min(current + 1, suggestions.length - 1));
                                } else if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    setActiveIndex(current => Math.max(current - 1, -1));
                                } else if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitQuery();
                                } else if (event.key === 'Escape') {
                                    if (query || showSuggestions) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setQuery('');
                                        setActiveIndex(-1);
                                        setShowSuggestions(false);
                                    }
                                }
                            }}
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <ul id="bulkTagSuggestions" role="listbox" {...stylex.props(s.suggestionList)}>
                                {suggestions.map((suggestion, index) => (
                                    <li
                                        key={suggestionId(suggestion)}
                                        id={suggestionId(suggestion)}
                                        role="option"
                                        aria-selected={index === activeIndex}
                                        {...stylex.props(s.suggestionItem, index === activeIndex && s.suggestionActive)}
                                        onMouseDown={event => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            selectSuggestion(suggestion);
                                            inputRef.current?.focus();
                                        }}
                                    >
                                        {suggestion.type === 'create' ? `${translate('Create')}: ${suggestion.name}` : suggestion.tag.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <ContractButton
                        className="tags_view menu_button"
                        label="View all tags"
                        title="View all tags"
                        iconOnly
                        nativeTitle
                        icon={<i className="fa-solid fa-tags" aria-hidden="true" />}
                        onClick={event => {
                            // Legacy document delegate for .tags_view would
                            // reopen the manager; the host owns that call now.
                            event.stopPropagation();
                            onOpenTagManager?.();
                        }}
                    />
                </div>
                <div id="bulkTagList" className="m-t-1 tags">
                    {snapshot.selectedTags.map(tag => (
                        <div
                            key={tag.id}
                            className="tag"
                            id={tag.id}
                            style={{ backgroundColor: tag.color, color: tag.color2 }}
                        >
                            <span className="tag_name">{tag.name}</span>
                            <div
                                className={`fa-solid fa-circle-xmark tag_remove ${stylex.props(s.focusable).className ?? ''}`}
                                role="button"
                                tabIndex={0}
                                title={translate('Remove tag')}
                                aria-label={`${translate('Remove tag')}: ${tag.name}`}
                                onClick={event => {
                                    event.stopPropagation();
                                    commands.removeTag(tag.id);
                                }}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        commands.removeTag(tag.id);
                                    }
                                }}

                            />
                        </div>
                    ))}
                </div>
            </div>
            <div id="dialogue_popup_controls" className="m-t-1">
                <ContractButton
                    id="bulk_tag_popup_reset"
                    className="menu_button"
                    label="Remove all"
                    title="Remove all tags from the selected characters"
                    nativeTitle
                    disabled={disabled}
                    icon={<i className="fa-solid fa-trash-can margin-right-10px" aria-hidden="true" />}
                    onClick={() => void run('reset', () => commands.resetTags())}
                />
                <ContractButton
                    id="bulk_tag_popup_remove_mutual"
                    className="menu_button"
                    label="Remove mutual"
                    title="Remove all mutual tags from the selected characters"
                    nativeTitle
                    disabled={disabled}
                    icon={<i className="fa-solid fa-trash-can margin-right-10px" aria-hidden="true" />}
                    onClick={() => void run('removeMutual', () => commands.removeMutualTags())}
                />
                <ContractButton
                    id="bulk_tag_popup_import_all_tags"
                    className="menu_button"
                    label="Import All"
                    title="Import all tags from selected characters"
                    nativeTitle
                    disabled={disabled}
                    onClick={() => void run('importAll', () => commands.importAllTags())}
                />
                <ContractButton
                    id="bulk_tag_popup_import_existing_tags"
                    className="menu_button"
                    label="Import Existing"
                    title="Import existing tags from selected characters"
                    nativeTitle
                    disabled={disabled}
                    onClick={() => void run('importExisting', () => commands.importExistingTags())}
                />
                <ContractButton
                    id="bulk_tag_popup_cancel"
                    className="menu_button"
                    label="Close"
                    onClick={onClose}
                />
            </div>
        </div>
    );
}
