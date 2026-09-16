import { useForm } from '@tanstack/react-form';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useMemo } from 'react';
import {
    buildCharacterLibraryToolbarDefaults,
    characterLibraryToolbarSchema,
    getCharacterLibraryBulkSelectionShortText,
    type CharacterLibraryToolbarState,
} from '@/lib/character-library-helpers';
import { characterLibraryStyles } from '@/styles/workspace-panels.styles';
import { HostedDomSlot } from './HostedDomSlot';

export interface CharacterLibraryToolbarBridge {
    clickLegacyAction(actionId: string): void;
    applySearchQuery(searchQuery: string): void;
    applySortOption(sortValue: string): void;
    toggleGrid(): void;
    toggleBulkEdit(): void;
    selectAllInBulkMode(): void;
    deleteSelectedInBulkMode(): void;
}

function ToolbarActionButton({
    label,
    onClick,
    title,
    icon,
    compact = false,
    disabled = false,
}: {
    label: string;
    onClick: () => void;
    title: string;
    icon: string;
    compact?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            className={`menu_button character-list-action${disabled ? ' disabled' : ''} ${stylex.props(characterLibraryStyles.toolbarAction, compact ? characterLibraryStyles.toolbarActionCompact : characterLibraryStyles.toolbarActionFull).className ?? ''}`}
            title={title}
            aria-label={title}
            data-compact={compact ? 'true' : undefined}
            onClick={onClick}
            disabled={disabled}
            aria-disabled={disabled}
        >
            <i className={`fa-solid ${icon} ${stylex.props(characterLibraryStyles.toolbarActionIcon).className ?? ''}`} aria-hidden="true" />
            <span className={compact ? 'sr-only' : 'character-list-action-label'}>{label}</span>
        </button>
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
                    <HostedDomSlot factory={() => state.extensionButtonsElement} />
                </div>
                <div {...stylex.props(characterLibraryStyles.toolbarActionsInnerNoWrap)}>
                    <ToolbarActionButton
                        label={state.isGrid ? 'List' : 'Grid'}
                        icon={state.isGrid ? 'fa-list' : 'fa-table-cells-large'}
                        compact
                        title={state.isGrid ? 'Switch to character list view' : 'Switch to character grid view'}
                        onClick={() => bridge.toggleGrid()}
                    />
                    <ToolbarActionButton label="Bulk" icon="fa-list-check" compact title="Bulk edit characters" onClick={() => bridge.toggleBulkEdit()} />
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
                </div>
            </div>
            <div {...stylex.props(characterLibraryStyles.toolbarFields)}>
                <div {...stylex.props(characterLibraryStyles.toolbarField)}>
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
            </div>
            <HostedDomSlot
                className={`character-library-toolbar-filters ${stylex.props(characterLibraryStyles.toolbarFilters).className ?? ''}`}
                factory={() => state.tagControlsElement}
            />
        </div>
    );
}
