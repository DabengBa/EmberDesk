import { useForm } from '@tanstack/react-form';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { translate } from '../../compat/i18n.js';
import { HostedDomSlot } from './HostedDomSlot';

export interface CharacterLibraryToolbarBridge {
    clickLegacyAction(actionId: string): void;
    applySearchQuery(searchQuery: string): void;
    applySortOption(sortValue: string): void;
    toggleGrid(): void;
    toggleBulkEdit(): void;
    selectAllInBulkMode(): void;
    deleteSelectedInBulkMode(): void;
    cycleTagFilter?(tagId: string): void;
    runTagFilterAction?(tagId: string): void;
    expandTagFilterList?(): void;
}

const TAG_FILTER_STATE_CLASS: Record<string, string> = {
    SELECTED: 'selected',
    EXCLUDED: 'excluded',
    UNDEFINED: 'undefined',
};

function ToolbarActionButton({
    label,
    onClick,
    title,
    icon,
    compact = false,
    disabled = false,
    labelKey,
    titleKey,
    ariaExpanded,
    ariaPressed,
}: {
    label: string;
    onClick: () => void;
    title: string;
    icon: string;
    compact?: boolean;
    disabled?: boolean;
    labelKey?: string;
    titleKey?: string;
    ariaExpanded?: boolean;
    ariaPressed?: boolean;
}) {
    const resolvedTitle = translate(title, titleKey ?? null);
    const resolvedLabel = translate(label, labelKey ?? null);
    return (
        <button
            type="button"
            className={`menu_button character-list-action${disabled ? ' disabled' : ''}${ariaPressed ? ' selected' : ''} ${stylex.props(characterLibraryStyles.toolbarAction, compact ? characterLibraryStyles.toolbarActionCompact : characterLibraryStyles.toolbarActionFull).className ?? ''}`}
            title={resolvedTitle}
            aria-label={resolvedTitle}
            data-i18n={`[title]${titleKey ?? title};[aria-label]${titleKey ?? title}`}
            data-compact={compact ? 'true' : undefined}
            onClick={onClick}
            disabled={disabled}
            aria-disabled={disabled}
            aria-expanded={ariaExpanded}
            aria-pressed={ariaPressed}
        >
            <i className={`fa-solid ${icon} ${stylex.props(characterLibraryStyles.toolbarActionIcon).className ?? ''}`} aria-hidden="true" />
            <span className={compact ? 'sr-only' : 'character-list-action-label'} data-i18n={labelKey ?? label}>{resolvedLabel}</span>
        </button>
    );
}

function CharacterTagFilterChip({
    chip,
    showTagFilters,
    hasActiveTagFilters,
    onActivate,
}: {
    chip: CharacterLibraryTagChip;
    showTagFilters: boolean;
    hasActiveTagFilters?: boolean;
    onActivate?: () => void;
}) {
    const isShowTagListChip = Boolean(chip.className?.split(' ').includes('showTagList'));
    const stateClass = chip.filterState ? TAG_FILTER_STATE_CLASS[String(chip.filterState).toUpperCase()] ?? 'undefined' : null;
    // The stylesheet hides non-actionable filter chips by default; the visibility
    // toggle historically flipped them via inline display, so the React chip does
    // the same to keep .rm_tag_filter .tag:not(.actionable) semantics intact.
    const className = [
        'tag',
        chip.actionable ? 'actionable clickable-action interactable' : 'interactable',
        stateClass,
        chip.className || null,
        isShowTagListChip && showTagFilters ? 'selected' : null,
        isShowTagListChip && hasActiveTagFilters ? 'indicator' : null,
    ].filter(Boolean).join(' ');
    const iconTitle = chip.icon ? `${translate(chip.name)} ${chip.title ?? ''}`.trim() : undefined;
    return (
        <span
            id={chip.id}
            className={className}
            style={{
                backgroundColor: chip.color || undefined,
                color: chip.color2 || undefined,
                display: !chip.actionable ? (showTagFilters ? 'flex' : 'none') : undefined,
            }}
            data-toggle-state={chip.filterState ?? undefined}
            title={chip.icon ? undefined : (chip.title || undefined)}
            onClick={onActivate}
        >
            <span className={chip.icon ? `tag_name ${chip.icon}` : 'tag_name'} title={iconTitle}>
                {chip.icon ? '' : chip.name}
            </span>
            <i className="fa-solid fa-circle-xmark tag_remove" style={chip.removable ? undefined : { display: 'none' }} />
        </span>
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
    if (!filters || !container) {
        return null;
    }

    const showTagFilters = filters.showTagFilters;
    const chips = [...filters.actionableTags, ...filters.inListActionableTags, ...filters.tags];
    return createPortal(
        <>
            {chips.map(chip => (
                <CharacterTagFilterChip
                    key={chip.id}
                    chip={chip}
                    showTagFilters={showTagFilters}
                    hasActiveTagFilters={filters.hasActiveTagFilters}
                    onActivate={chip.actionable
                        ? () => bridge.runTagFilterAction?.(chip.id)
                        : () => bridge.cycleTagFilter?.(chip.id)}
                />
            ))}
            {showTagFilters && filters.skippedTagCount > 0 ? (
                <span
                    className="tag placeholder-expander interactable clickable-action"
                    title={`${filters.skippedTagCount} tags not displayed.\n\nClick to expand remaining tags.`}
                    onClick={() => bridge.expandTagFilterList?.()}
                >
                    <span className="tag_name">...</span>
                    <i className="fa-solid fa-circle-xmark tag_remove" style={{ display: 'none' }} />
                </span>
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
                <CharacterTagFilterChip key={chip.id} chip={chip} showTagFilters />
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
    const bulkSelectedLabel = `${state.bulkSelectedCount} characters selected`;
    const bulkSelectedShortText = getCharacterLibraryBulkSelectionShortText(state.bulkSelectedCount);
    const [filtersRowOpen, setFiltersRowOpen] = useState(true);
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
                    <ToolbarActionButton label="New" icon="fa-plus" title="Create New Character" onClick={() => bridge.clickLegacyAction('rm_button_create')} />
                    <ToolbarActionButton label="File" icon="fa-file-arrow-up" compact title="Import Character from File" onClick={() => bridge.clickLegacyAction('character_import_button')} />
                    <ToolbarActionButton label="URL" icon="fa-link" compact title="Import content from external URL" onClick={() => bridge.clickLegacyAction('external_import_button')} />
                    <HostedDomSlot factory={extensionButtonsFactory} />
                </div>
                <div {...stylex.props(characterLibraryStyles.toolbarSearchField)}>
                    <toolbarForm.Field name="searchQuery">
                        {field => (
                            <input
                                id="emberdesk-react-character-search"
                                className={`text_pole textarea_compact ${stylex.props(characterLibraryStyles.toolbarInput).className ?? ''}`}
                                type="search"
                                aria-label="Search characters"
                                placeholder="Search..."
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
                            <ToolbarActionButton label="All" icon="fa-check-double" compact title="Bulk select all characters" onClick={() => bridge.selectAllInBulkMode()} />
                            <ToolbarActionButton
                                label="Del"
                                icon="fa-trash"
                                compact
                                title="Bulk delete characters"
                                onClick={() => bridge.deleteSelectedInBulkMode()}
                                disabled={state.bulkSelectedCount === 0}
                            />
                        </>
                    ) : null}
                    <ToolbarActionButton
                        label="Filters"
                        icon="fa-filter"
                        compact
                        title="Toggle filter controls"
                        onClick={() => setFiltersRowOpen(open => !open)}
                        ariaExpanded={filtersRowOpen}
                        ariaPressed={filtersRowOpen}
                    />
                    <ToolbarActionButton
                        label={state.isGrid ? 'List' : 'Grid'}
                        labelKey={state.isGrid ? 'Character Toolbar List' : 'Character Toolbar Grid'}
                        icon={state.isGrid ? 'fa-list' : 'fa-table-cells-large'}
                        compact
                        title={state.isGrid ? 'Switch to character list view' : 'Switch to character grid view'}
                        onClick={() => bridge.toggleGrid()}
                    />
                    <ToolbarActionButton label="Bulk" icon="fa-list-check" compact title="Bulk edit characters" onClick={() => bridge.toggleBulkEdit()} />
                </div>
            </div>
            <div
                className="character-library-toolbar-secondary"
                {...stylex.props(characterLibraryStyles.toolbarFields)}
                style={filtersRowOpen ? undefined : { display: 'none' }}
            >
                <div {...stylex.props(characterLibraryStyles.toolbarField)}>
                    <toolbarForm.Field name="sortValue">
                        {field => (
                            <select
                                id="emberdesk-react-character-sort"
                                className={`text_pole textarea_compact ${stylex.props(characterLibraryStyles.toolbarInput, characterLibraryStyles.toolbarSelect).className ?? ''}`}
                                aria-label="Sort characters"
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
                <HostedDomSlot
                    className={`character-library-toolbar-filters ${stylex.props(characterLibraryStyles.toolbarFilters).className ?? ''}`}
                    factory={tagControlsFactory}
                />
            </div>
            <CharacterTagFilterChips filters={state.tagFilters} container={tagFilterElement} bridge={bridge} />
            <CharacterTagDrilldownChips filters={state.tagFilters} container={tagDrilldownElement} />
        </div>
    );
}
