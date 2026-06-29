import { z } from 'zod';

export interface CharacterLibraryToolbarSortOption {
    value: string;
    label: string;
    hidden?: boolean;
}

export interface CharacterLibraryToolbarState {
    searchQuery: string;
    sortValue: string;
    sortOptions: CharacterLibraryToolbarSortOption[];
    isGrid: boolean;
    isBulkEdit: boolean;
    bulkSelectedCount: number;
    tagControlsElement: HTMLElement | null;
    extensionButtonsElement: HTMLElement | null;
}

export const characterLibraryToolbarSchema = z.object({
    searchQuery: z.string(),
    sortValue: z.string(),
    isGrid: z.boolean(),
    isBulkEdit: z.boolean(),
    bulkSelectedCount: z.number().int().min(0),
});

export function buildCharacterLibraryToolbarDefaults(state: CharacterLibraryToolbarState) {
    return {
        searchQuery: state.searchQuery,
        sortValue: state.sortValue,
        isGrid: state.isGrid,
        isBulkEdit: state.isBulkEdit,
        bulkSelectedCount: state.bulkSelectedCount,
    };
}

export function getCharacterLibraryBulkSelectionShortText(count: number, locale = globalThis.navigator?.language ?? 'en') {
    return locale.toLowerCase().startsWith('zh') ? `${count}个` : `${count} sel`;
}
