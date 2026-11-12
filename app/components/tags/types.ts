/**
 * Typed boundary between the tag model (public/scripts/character-tags-service.js
 * through the tags.js facade) and the React surfaces that render it.
 *
 * The runtime owns all authoritative tag state and persistence. Components
 * render snapshots and forward intents; they must not mutate or copy tag
 * collections of their own.
 */

export type TagSortMode = 'manual' | 'alphabetical' | 'by_entries';

export type TagColorField = 'color' | 'color2';

/**
 * Presentation view of one global tag (the tag library, not the per-card
 * `card.data.tags` list).
 */
export interface TagView {
    id: string;
    name: string;
    color?: string;
    color2?: string;
    folder_type?: string;
    is_hidden_on_character_card?: boolean;
    sort_order?: number;
    create_date?: number;
    /** Number of entities this tag is assigned to. */
    count: number;
}

export interface TagManagementSnapshot {
    tags: TagView[];
    sortMode: TagSortMode;
}

export interface TagManagementCommands {
    createTag(name?: string): string;
    renameTag(id: string, name: string): boolean;
    /** The host keeps the existing merge-confirmation dialog. */
    deleteTag(id: string): Promise<void>;
    setTagColor(id: string, field: TagColorField, value: string): void;
    cycleTagFolder(id: string): void;
    toggleTagHidden(id: string): void;
    setSortMode(mode: TagSortMode): void;
    reorderTags(ids: string[]): void;
    backupTags(): void;
    restoreTags(file: File): Promise<void>;
    pruneTags(): Promise<void>;
}

export interface TagManagementRuntime {
    /** Reference-stable while nothing changed. */
    getSnapshot(): TagManagementSnapshot;
    subscribe(listener: () => void): () => void;
    commands: TagManagementCommands;
}

export interface BulkTagEditorSnapshot {
    /** Tags not yet assigned to every captured character. */
    availableTags: TagView[];
    /** Tags shared by all captured characters. */
    selectedTags: TagView[];
    characterCount: number;
}

export interface BulkTagEditorCommands {
    addTag(id: string): void;
    createAndAddTag(name: string): void;
    removeTag(id: string): void;
    resetTags(): Promise<void>;
    removeMutualTags(): Promise<void>;
    importExistingTags(): Promise<void>;
    importAllTags(): Promise<void>;
}

export interface BulkTagEditorRuntime {
    getSnapshot(): BulkTagEditorSnapshot;
    subscribe(listener: () => void): () => void;
    commands: BulkTagEditorCommands;
}

export interface TagFolderView {
    icon: string;
    className: string;
    tooltip: string;
    color: string;
    size: string;
}

/**
 * Display metadata for the tag-as-folder control. The service owns which
 * folder type comes next in the cycle; this table only describes how each
 * stored `folder_type` renders (mirrors the legacy TAG_FOLDER_TYPES contract).
 */
export const TAG_FOLDER_VIEWS: Record<string, TagFolderView> = {
    OPEN: { icon: '✔', className: 'folder_open', tooltip: 'Open Folder (Show all characters even if not selected)', color: 'green', size: '1' },
    CLOSED: { icon: '👁', className: 'folder_closed', tooltip: 'Closed Folder (Hide all characters unless selected)', color: 'lightgoldenrodyellow', size: '0.7' },
    NONE: { icon: '✕', className: 'no_folder', tooltip: 'No Folder', color: 'red', size: '1' },
};

export const TAG_FOLDER_DEFAULT_VIEW: TagFolderView = TAG_FOLDER_VIEWS.NONE;
