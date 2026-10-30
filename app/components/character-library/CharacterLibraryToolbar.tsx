import { useForm } from '@tanstack/react-form';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    buildCharacterLibraryToolbarDefaults,
    characterLibraryToolbarSchema,
    getCharacterLibraryBulkSelectionShortText,
    type CharacterLibraryTagChip,
    type CharacterLibraryTagFiltersState,
    type CharacterLibraryToolbarState,
} from '@/lib/character-library-helpers';
import { characterLibraryStyles } from '@/styles/workspace-panels.styles';
import { translate, useTranslated } from '../../compat/i18n.js';
import { HostedDomSlot } from './HostedDomSlot';

export interface CharacterLibraryToolbarBridge {
    clickLegacyAction(actionId: string): void;
    applySearchQuery(searchQuery: string): void;
    applySortOption(sortValue: string): void;
    toggleBulkEdit(): void;
    selectAllInBulkMode(): void;
    deleteSelectedInBulkMode(): void;
    cycleTagFilter?(tagId: string): void;
    setTagFilter?(tagId: string, nextState: string): void;
    clearTagFilter?(tagId: string): void;
    clearAllTagFilters?(): void;
    openTagManager?(): void;
    runTagFilterAction?(tagId: string): void;
}

const TAG_FILTER_STATE_CLASS: Record<string, string> = {
    SELECTED: 'selected',
    EXCLUDED: 'excluded',
    UNDEFINED: 'undefined',
};

const TAG_FILTER_STATE_KEYS = {
    SELECTED: 'SELECTED',
    EXCLUDED: 'EXCLUDED',
    UNDEFINED: 'UNDEFINED',
} as const;

function ToolbarActionButton({
    label,
    onClick,
    title,
    icon,
    compact = false,
    disabled = false,
    labelKey,
    titleKey,
}: {
    label: string;
    onClick: () => void;
    title: string;
    icon: string;
    compact?: boolean;
    disabled?: boolean;
    labelKey?: string;
    titleKey?: string;
}) {
    useTranslated('');
    const resolvedTitle = translate(title, titleKey ?? null);
    const resolvedLabel = translate(label, labelKey ?? null);
    return (
        <button
            type="button"
            className={`menu_button character-list-action${disabled ? ' disabled' : ''} ${stylex.props(characterLibraryStyles.toolbarAction, compact ? characterLibraryStyles.toolbarActionCompact : characterLibraryStyles.toolbarActionFull).className ?? ''}`}
            title={resolvedTitle}
            aria-label={resolvedTitle}
            data-i18n={`[title]${titleKey ?? title};[aria-label]${titleKey ?? title}`}
            data-compact={compact ? 'true' : undefined}
            onClick={onClick}
            disabled={disabled}
            aria-disabled={disabled}
        >
            <i className={`fa-solid ${icon} ${stylex.props(characterLibraryStyles.toolbarActionIcon).className ?? ''}`} aria-hidden="true" />
            <span className={compact ? 'sr-only' : 'character-list-action-label'} data-i18n={labelKey ?? label}>{resolvedLabel}</span>
        </button>
    );
}

function CharacterTagFilterChip({
    chip,
    onActivate,
}: {
    chip: CharacterLibraryTagChip;
    onActivate?: () => void;
}) {
    useTranslated('');
    const stateClass = chip.filterState ? TAG_FILTER_STATE_CLASS[String(chip.filterState).toUpperCase()] ?? 'undefined' : null;
    const className = [
        'tag',
        chip.actionable ? 'actionable clickable-action interactable' : 'interactable',
        stateClass,
        chip.className || null,
    ].filter(Boolean).join(' ');
    const iconTitle = chip.icon ? `${translate(chip.name)} ${chip.title ?? ''}`.trim() : undefined;
    const chipChildren = (
        <>
            <span className={chip.icon ? `tag_name ${chip.icon}` : 'tag_name'} title={iconTitle}>
                {chip.icon ? '' : chip.name}
            </span>
            <i className="fa-solid fa-circle-xmark tag_remove" style={chip.removable ? undefined : { display: 'none' }} />
        </>
    );
    // Non-actionable chips are hidden by the legacy stylesheet when the tag list
    // toggle is off; active-filter pills must stay visible, so display is forced.
    const chipStyle = {
        backgroundColor: chip.color || undefined,
        color: chip.color2 || undefined,
        display: !chip.actionable ? 'flex' : undefined,
    };
    const blockRemoveProps = chip.blockLegacyRemove ? { 'custom-remove-action': 'true' } : {};
    if (!onActivate) {
        return (
            <span
                id={chip.id}
                className={className}
                style={chipStyle}
                data-toggle-state={chip.filterState ?? undefined}
                title={chip.icon ? undefined : (chip.title || undefined)}
                {...blockRemoveProps}
            >
                {chipChildren}
            </span>
        );
    }
    return (
        <button
            type="button"
            id={chip.id}
            className={className}
            style={chipStyle}
            data-toggle-state={chip.filterState ?? undefined}
            title={chip.icon ? undefined : (chip.title || undefined)}
            onClick={onActivate}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onActivate();
                }
            }}
            {...blockRemoveProps}
        >
            {chipChildren}
        </button>
    );
}

function CharacterTagFilterPopover({
    filters,
    anchorRef,
    onClose,
    bridge,
}: {
    filters: CharacterLibraryTagFiltersState;
    anchorRef: React.RefObject<HTMLElement | null>;
    onClose: () => void;
    bridge: CharacterLibraryToolbarBridge;
}) {
    useTranslated('');
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const [query, setQuery] = useState('');
    const measureAnchor = useCallback(() => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) {
            return null;
        }
        return {
            top: Math.round(rect.bottom + 6),
            right: Math.max(Math.round(window.innerWidth - rect.right), 8),
        };
    }, [anchorRef]);
    const [position, setPosition] = useState<{ top: number; right: number }>(() => measureAnchor() ?? { top: 0, right: 0 });

    useEffect(() => {
        const updatePosition = () => {
            const next = measureAnchor();
            if (next) {
                setPosition(next);
            }
        };
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [measureAnchor]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target instanceof Node ? event.target : null;
            if (!target || popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) {
                return;
            }
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [anchorRef, onClose]);

    const normalizedQuery = query.trim().toLowerCase();
    const visibleTags = useMemo(
        () => normalizedQuery
            ? filters.tags.filter(tag => tag.name.toLowerCase().includes(normalizedQuery))
            : filters.tags,
        [filters.tags, normalizedQuery],
    );
    const setState = (tag: CharacterLibraryTagChip, nextState: string) => {
        const current = String(tag.filterState ?? TAG_FILTER_STATE_KEYS.UNDEFINED).toUpperCase();
        if (current === nextState) {
            bridge.clearTagFilter?.(tag.id);
        } else {
            bridge.setTagFilter?.(tag.id, nextState);
        }
    };

    return createPortal(
        <div
            ref={popoverRef}
            role="dialog"
            aria-label={translate('Tag filters')}
            className={`character-tag-filter-popover ${stylex.props(characterLibraryStyles.tagFilterPopover).className ?? ''}`}
            style={{ top: position.top, right: position.right }}
        >
            <div {...stylex.props(characterLibraryStyles.tagFilterPopoverHead)}>
                <input
                    type="search"
                    className={`text_pole textarea_compact ${stylex.props(characterLibraryStyles.tagFilterPopoverSearch).className ?? ''}`}
                    placeholder={translate('Filter tags…')}
                    aria-label={translate('Filter tags…')}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                />
                <button
                    type="button"
                    className={`menu_button ${stylex.props(characterLibraryStyles.tagFilterPopoverClear).className ?? ''}`}
                    title={translate('Clear filters')}
                    aria-label={translate('Clear filters')}
                    disabled={!filters.hasActiveTagFilters}
                    onClick={() => bridge.clearAllTagFilters?.()}
                >
                    <i className="fa-solid fa-filter-circle-xmark" aria-hidden="true" />
                </button>
            </div>
            <div {...stylex.props(characterLibraryStyles.tagFilterPopoverList)} role="listbox" aria-label={translate('Tag filters')}>
                {visibleTags.length === 0 ? (
                    <div {...stylex.props(characterLibraryStyles.tagFilterPopoverEmpty)}>{translate('No tags match')}</div>
                ) : visibleTags.map(tag => {
                    const state = String(tag.filterState ?? TAG_FILTER_STATE_KEYS.UNDEFINED).toUpperCase();
                    return (
                        <div key={tag.id} {...stylex.props(characterLibraryStyles.tagFilterRow)} role="option" aria-selected={state === TAG_FILTER_STATE_KEYS.SELECTED}>
                            <span
                                {...stylex.props(characterLibraryStyles.tagFilterRowDot)}
                                style={{ backgroundColor: tag.color || 'var(--SmartThemeEmColor)' }}
                                aria-hidden="true"
                            />
                            <span {...stylex.props(characterLibraryStyles.tagFilterRowName)} title={tag.name}>{tag.name}</span>
                            <span {...stylex.props(characterLibraryStyles.tagFilterSeg)} role="group">
                                <button
                                    type="button"
                                    {...stylex.props(characterLibraryStyles.tagFilterSegButton, state === TAG_FILTER_STATE_KEYS.SELECTED && characterLibraryStyles.tagFilterSegSelected)}
                                    aria-pressed={state === TAG_FILTER_STATE_KEYS.SELECTED}
                                    onClick={() => setState(tag, TAG_FILTER_STATE_KEYS.SELECTED)}
                                >
                                    {translate('Include')}
                                </button>
                                <button
                                    type="button"
                                    {...stylex.props(characterLibraryStyles.tagFilterSegButton, state === TAG_FILTER_STATE_KEYS.EXCLUDED && characterLibraryStyles.tagFilterSegExcluded)}
                                    aria-pressed={state === TAG_FILTER_STATE_KEYS.EXCLUDED}
                                    onClick={() => setState(tag, TAG_FILTER_STATE_KEYS.EXCLUDED)}
                                >
                                    {translate('Exclude')}
                                </button>
                            </span>
                        </div>
                    );
                })}
            </div>
            <div {...stylex.props(characterLibraryStyles.tagFilterPopoverFoot)}>
                <span>{translate('${0} tags in use').replace('${0}', String(filters.tags.length))}</span>
                <button
                    type="button"
                    {...stylex.props(characterLibraryStyles.tagFilterPopoverManage)}
                    onClick={() => {
                        onClose();
                        bridge.openTagManager?.();
                    }}
                >
                    {translate('Manage tags')}
                </button>
            </div>
        </div>,
        document.body,
    );
}

function CharacterTagFilterChips({
    filters,
    container,
    bridge,
}: {
    filters: CharacterLibraryTagFiltersState | null;
    container: HTMLElement | null;
    bridge: CharacterLibraryToolbarBridge;
}) {
    useTranslated('');
    const pickerButtonRef = useRef<HTMLButtonElement | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const closePicker = useCallback(() => setPickerOpen(false), []);

    if (!filters || !container) {
        return null;
    }

    const activeCount = filters.activeTags.length;
    const chips = [...filters.actionableTags, ...filters.inListActionableTags];
    return createPortal(
        <>
            {chips.map(chip => (
                <CharacterTagFilterChip
                    key={chip.id}
                    chip={chip}
                    onActivate={() => bridge.runTagFilterAction?.(chip.id)}
                />
            ))}
            <button
                type="button"
                ref={pickerButtonRef}
                className={`tag actionable clickable-action interactable character-tag-filter-picker ${stylex.props(characterLibraryStyles.tagFilterPicker).className ?? ''}`}
                title={translate('Tag filters')}
                aria-label={`${translate('Tag filters')}${activeCount > 0 ? ` (${activeCount})` : ''}`}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen(open => !open)}
            >
                <i className="fa-solid fa-filter" aria-hidden="true" />
                <span className="character-tag-filter-picker-label">
                    {translate('Tag filters')}{activeCount > 0 ? ` (${activeCount})` : ''}
                </span>
                <i className="fa-solid fa-caret-down" aria-hidden="true" />
            </button>
            {filters.activeTags.map(chip => (
                <CharacterTagFilterChip
                    key={chip.id}
                    chip={chip}
                    onActivate={() => bridge.clearTagFilter?.(chip.id)}
                />
            ))}
            {pickerOpen ? (
                <CharacterTagFilterPopover
                    filters={filters}
                    anchorRef={pickerButtonRef}
                    onClose={closePicker}
                    bridge={bridge}
                />
            ) : null}
        </>,
        container,
    );
}

function CharacterTagDrilldownChips({
    filters,
    container,
}: {
    filters: CharacterLibraryTagFiltersState | null;
    container: HTMLElement | null;
}) {
    if (!filters || !container) {
        return null;
    }

    return createPortal(
        <>
            {filters.drilldownTags.map(chip => (
                <CharacterTagFilterChip key={chip.id} chip={chip} />
            ))}
        </>,
        container,
    );
}

export function CharacterLibraryToolbar({
    bridge,
    state,
}: {
    bridge: CharacterLibraryToolbarBridge;
    state: CharacterLibraryToolbarState;
}) {
    const nextDefaults = useMemo(() => buildCharacterLibraryToolbarDefaults(state), [state]);
    const bulkSelectedLabel = translate('${0} characters selected').replace('${0}', String(state.bulkSelectedCount));
    const bulkSelectedShortText = getCharacterLibraryBulkSelectionShortText(state.bulkSelectedCount);
    const tagFilterElement = useMemo<HTMLElement | null>(
        () => {
            const element = state.tagControlsElement?.querySelector('.rm_tag_filter');
            return element instanceof HTMLElement ? element : null;
        },
        [state.tagControlsElement],
    );
    const tagDrilldownElement = useMemo<HTMLElement | null>(
        () => {
            const element = state.tagControlsElement?.querySelector('.rm_tag_bogus_drilldown');
            return element instanceof HTMLElement ? element : null;
        },
        [state.tagControlsElement],
    );
    const tagControlsFactory = useCallback(() => state.tagControlsElement, [state.tagControlsElement]);
    const extensionButtonsFactory = useCallback(() => state.extensionButtonsElement, [state.extensionButtonsElement]);
    const toolbarForm = useForm({
        defaultValues: nextDefaults,
        validators: {
            onChange: characterLibraryToolbarSchema,
        },
    });

    useEffect(() => {
        toolbarForm.reset(nextDefaults);
    }, [nextDefaults, toolbarForm]);

    return (
        <div className={`emberdesk-react-character-library-toolbar ${stylex.props(characterLibraryStyles.toolbar).className ?? ''}`}>
            <div {...stylex.props(characterLibraryStyles.toolbarActions)}>
                <div {...stylex.props(characterLibraryStyles.toolbarActionsInner)}>
                    <ToolbarActionButton label="新" labelKey="Character Toolbar New" icon="fa-plus" compact title="Create New Character" onClick={() => bridge.clickLegacyAction('rm_button_create')} />
                    <ToolbarActionButton label="导" labelKey="Character Toolbar File" icon="fa-file-arrow-up" compact title="Import Character from File" onClick={() => bridge.clickLegacyAction('character_import_button')} />
                    <ToolbarActionButton label="URL" labelKey="Character Toolbar URL" icon="fa-link" compact title="Import content from external URL" onClick={() => bridge.clickLegacyAction('external_import_button')} />
                    <HostedDomSlot factory={extensionButtonsFactory} />
                </div>
                <div {...stylex.props(characterLibraryStyles.toolbarActionsInnerNoWrap)}>
                    {state.isBulkEdit ? (
                        <>
                            <output
                                className={`character-library-bulk-selected-count paginationjs-nav ${stylex.props(characterLibraryStyles.bulkSelectedCount).className ?? ''}`}
                                title={bulkSelectedLabel}
                                aria-label={bulkSelectedLabel}
                            >
                                {bulkSelectedShortText}
                            </output>
                            <ToolbarActionButton label="全" labelKey="Character Toolbar All" icon="fa-check-double" compact title="Bulk select all characters" onClick={() => bridge.selectAllInBulkMode()} />
                            <ToolbarActionButton
                                label="删"
                                labelKey="Character Toolbar Delete"
                                icon="fa-trash"
                                compact
                                title="Bulk delete characters"
                                onClick={() => bridge.deleteSelectedInBulkMode()}
                                disabled={state.bulkSelectedCount === 0}
                            />
                        </>
                    ) : null}
                    <ToolbarActionButton label="批" labelKey="Character Toolbar Bulk" icon="fa-list-check" compact title="Bulk edit characters" titleKey="Bulk_edit_characters" onClick={() => bridge.toggleBulkEdit()} />
                </div>
                <HostedDomSlot
                    className={`character-library-toolbar-filters ${stylex.props(characterLibraryStyles.toolbarFilters).className ?? ''}`}
                    factory={tagControlsFactory}
                />
            </div>
            <div {...stylex.props(characterLibraryStyles.toolbarFields)}>
                <div {...stylex.props(characterLibraryStyles.toolbarSearchField)}>
                    <toolbarForm.Field name="searchQuery">
                        {field => (
                            <input
                                id="emberdesk-react-character-search"
                                className={`text_pole textarea_compact ${stylex.props(characterLibraryStyles.toolbarInput).className ?? ''}`}
                                type="search"
                                aria-label={translate('Search characters')}
                                placeholder={translate('Search...')}
                                value={field.state.value}
                                onChange={event => {
                                    const searchQuery = event.target.value;
                                    field.handleChange(searchQuery);
                                    bridge.applySearchQuery(searchQuery);
                                }}
                            />
                        )}
                    </toolbarForm.Field>
                </div>
                <div {...stylex.props(characterLibraryStyles.toolbarField)}>
                    <toolbarForm.Field name="sortValue">
                        {field => (
                            <select
                                id="emberdesk-react-character-sort"
                                className={`text_pole textarea_compact ${stylex.props(characterLibraryStyles.toolbarInput, characterLibraryStyles.toolbarSelect).className ?? ''}`}
                                aria-label={translate('Sort characters')}
                                title={translate('Characters sorting order')}
                                value={field.state.value}
                                onChange={event => {
                                    const sortValue = event.target.value;
                                    field.handleChange(sortValue);
                                    bridge.applySortOption(sortValue);
                                }}
                            >
                                {state.sortOptions.map(option => (
                                    <option key={option.value} value={option.value} hidden={option.hidden}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </toolbarForm.Field>
                </div>
            </div>
            <CharacterTagFilterChips filters={state.tagFilters} container={tagFilterElement} bridge={bridge} />
            <CharacterTagDrilldownChips filters={state.tagFilters} container={tagDrilldownElement} />
        </div>
    );
}
