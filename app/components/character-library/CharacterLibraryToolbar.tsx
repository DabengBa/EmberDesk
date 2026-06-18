import { useForm } from '@tanstack/react-form';
import { useEffect, useMemo } from 'react';
import {
    buildCharacterLibraryToolbarDefaults,
    characterLibraryToolbarSchema,
    type CharacterLibraryToolbarState,
} from '@/lib/character-library-helpers';
import { LegacyElementHost } from './LegacyElementHost';

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
    disabled = false,
}: {
    label: string;
    onClick: () => void;
    title: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            className={`menu_button character-list-action${disabled ? ' disabled' : ''}`}
            title={title}
            onClick={onClick}
            disabled={disabled}
            aria-disabled={disabled}
        >
            <span className="character-list-action-label">{label}</span>
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
        <div className="emberdesk-react-character-library-toolbar flexFlowColumn gap8">
            <div className="flex-container flexnowrap gap8 justifySpaceBetween alignItemsCenter">
                <div className="flex-container flexwrap gap8 alignItemsCenter">
                    <ToolbarActionButton label="New" title="Create New Character" onClick={() => bridge.clickLegacyAction('rm_button_create')} />
                    <ToolbarActionButton label="File" title="Import Character from File" onClick={() => bridge.clickLegacyAction('character_import_button')} />
                    <ToolbarActionButton label="URL" title="Import content from external URL" onClick={() => bridge.clickLegacyAction('external_import_button')} />
                    <ToolbarActionButton label="Group" title="Create New Chat Group" onClick={() => bridge.clickLegacyAction('rm_button_group_chats')} />
                    <LegacyElementHost factory={() => state.extensionButtonsElement} />
                </div>
                <div className="flex-container flexnowrap gap8 alignItemsCenter">
                    <ToolbarActionButton label={state.isGrid ? 'List' : 'Grid'} title="Toggle character grid view" onClick={() => bridge.toggleGrid()} />
                    <ToolbarActionButton label="Bulk" title="Bulk edit characters" onClick={() => bridge.toggleBulkEdit()} />
                    {state.isBulkEdit ? (
                        <>
                            <span className="paginationjs-nav" role="status">{state.bulkSelectedCount} sel</span>
                            <ToolbarActionButton label="All" title="Bulk select all characters" onClick={() => bridge.selectAllInBulkMode()} />
                            <ToolbarActionButton
                                label="Del"
                                title="Bulk delete characters"
                                onClick={() => bridge.deleteSelectedInBulkMode()}
                                disabled={state.bulkSelectedCount === 0}
                            />
                        </>
                    ) : null}
                </div>
            </div>
            <div className="flex-container flexwrap gap8 alignItemsCenter">
                <div className="flex-container flexnowrap gap8 alignItemsCenter">
                    <label htmlFor="emberdesk-react-character-search">Find</label>
                    <toolbarForm.Field
                        name="searchQuery"
                        children={field => (
                            <input
                                id="emberdesk-react-character-search"
                                className="text_pole textarea_compact"
                                type="search"
                                value={field.state.value}
                                onChange={event => {
                                    const searchQuery = event.target.value;
                                    field.handleChange(searchQuery);
                                    bridge.applySearchQuery(searchQuery);
                                }}
                            />
                        )}
                    />
                </div>
                <div className="flex-container flexnowrap gap8 alignItemsCenter">
                    <label htmlFor="emberdesk-react-character-sort">Sort</label>
                    <toolbarForm.Field
                        name="sortValue"
                        children={field => (
                            <select
                                id="emberdesk-react-character-sort"
                                className="text_pole textarea_compact"
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
                    />
                </div>
            </div>
            <LegacyElementHost factory={() => state.tagControlsElement} />
        </div>
    );
}
