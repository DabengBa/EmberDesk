import { z } from 'zod';
import { translate } from '../compat/i18n.js';

export interface CharacterLibraryToolbarSortOption {
    value: string;
    label: string;
    hidden?: boolean;
}

export interface CharacterLibraryTagChip {
    id: string;
    name: string;
    title?: string;
    icon?: string;
    className?: string;
    color?: string;
    color2?: string;
    actionable?: boolean;
    removable?: boolean;
    blockLegacyRemove?: boolean;
    filterState?: string | null;
}

export interface CharacterLibraryTagFiltersState {
    hasActiveTagFilters: boolean;
    actionableTags: CharacterLibraryTagChip[];
    inListActionableTags: CharacterLibraryTagChip[];
    tags: CharacterLibraryTagChip[];
    activeTags: CharacterLibraryTagChip[];
    drilldownTags: CharacterLibraryTagChip[];
}

export interface CharacterLibraryPaginationState {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    pageSizeOptions: number[];
    label: string;
}

export interface CharacterLibraryToolbarState {
    searchQuery: string;
    sortValue: string;
    sortOptions: CharacterLibraryToolbarSortOption[];
    isBulkEdit: boolean;
    bulkSelectedCount: number;
    tagControlsElement: HTMLElement | null;
    tagFilters: CharacterLibraryTagFiltersState | null;
    extensionButtonsElement: HTMLElement | null;
}

export const characterLibraryToolbarSchema = z.object({
    searchQuery: z.string(),
    sortValue: z.string(),
    isBulkEdit: z.boolean(),
    bulkSelectedCount: z.number().int().min(0),
});

export function buildCharacterLibraryToolbarDefaults(state: CharacterLibraryToolbarState) {
    return {
        searchQuery: state.searchQuery,
        sortValue: state.sortValue,
        isBulkEdit: state.isBulkEdit,
        bulkSelectedCount: state.bulkSelectedCount,
    };
}

/**
 * Compact bulk-selection counter for the character toolbar.
 *
 * Follows the UI locale (not the browser locale) so a Chinese interface never
 * shows an English counter and vice versa.
 * @param count Selected characters
 * @returns Compact counter text
 */
export function getCharacterLibraryBulkSelectionShortText(count: number) {
    return translate('${0} sel').replace('${0}', String(count));
}
