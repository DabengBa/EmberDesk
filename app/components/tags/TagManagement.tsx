import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { ContractButton } from '../contract/ContractButton';
import { translate, useTranslated } from '@/compat/i18n.js';
import type { TagColorField, TagManagementRuntime, TagSortMode } from './types';
import { TagManagementRow } from './TagManagementRow';

type ToastrLike = {
    error?(message: string): void;
};

function reportFailure(action: string, error: unknown) {
    console.error(`[TagManagement] ${action} failed`, error);
    const toastr = (globalThis as { toastr?: ToastrLike }).toastr;
    toastr?.error?.(translate('Tag operation failed.'));
}

export interface TagManagementProps {
    runtime: TagManagementRuntime;
    bogusFolders?: boolean;
}

/**
 * Tag library popup content. React owns markup and interactions; the runtime
 * owns the tag model, sorting and persistence.
 */
export function TagManagement({ runtime, bogusFolders = true }: TagManagementProps) {
    useTranslated('');
    const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const [busy, setBusy] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const { commands } = runtime;
    const restoreInputRef = useRef<HTMLInputElement | null>(null);

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

    const tags = snapshot.tags;

    const handleCreate = () => {
        try {
            commands.createTag();
        } catch (error) {
            reportFailure('create', error);
        }
    };

    const handleDelete = (id: string) => {
        void run(`delete:${id}`, () => commands.deleteTag(id));
    };

    const handlePrune = () => {
        void run('prune', () => commands.pruneTags());
    };

    const handleRestore = (file: File) => {
        void run('restore', () => commands.restoreTags(file));
    };

    const handleSortModeChange = (mode: TagSortMode) => {
        try {
            commands.setSortMode(mode);
        } catch (error) {
            reportFailure('sort', error);
        }
    };

    const handleColorChange = (id: string, field: TagColorField, value: string) => {
        try {
            commands.setTagColor(id, field, value);
        } catch (error) {
            reportFailure('color', error);
        }
    };

    const handleMove = (id: string, direction: -1 | 1) => {
        const ids = tags.map(tag => tag.id);
        const index = ids.indexOf(id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ids.length) {
            return;
        }
        [ids[index], ids[target]] = [ids[target], ids[index]];
        try {
            commands.reorderTags(ids);
        } catch (error) {
            reportFailure('reorder', error);
        }
    };

    const handleDrop = (targetId: string) => {
        const sourceId = draggingId;
        setDraggingId(null);
        if (!sourceId || sourceId === targetId) {
            return;
        }
        const ids = tags.map(tag => tag.id).filter(id => id !== sourceId);
        const targetIndex = ids.indexOf(targetId);
        if (targetIndex < 0) {
            return;
        }
        ids.splice(targetIndex, 0, sourceId);
        try {
            commands.reorderTags(ids);
        } catch (error) {
            reportFailure('reorder', error);
        }
    };

    const disabled = busy !== null;
    // tags.js still registers document-level delegates for the legacy
    // .tag_view_* classes; stop them before they double-run a command.
    const stopLegacy = (event: { stopPropagation(): void }) => event.stopPropagation();

    return (
        <>
            <div className="title_restorable alignItemsBaseline">
                <h3>{translate('Tag Management')}</h3>
                <div className="flex-container alignItemsBaseline">
                    <ContractButton
                        className="menu_button menu_button_icon tag_view_prune"
                        label="Prune"
                        nativeTitle
                        title="Remove unused tags"
                        disabled={disabled}
                        icon={<i className="fa-solid fa-scissors" aria-hidden="true" />}
                        onClick={event => {
                            stopLegacy(event);
                            handlePrune();
                        }}
                    />
                    <ContractButton
                        className="menu_button menu_button_icon tag_view_backup"
                        label="Backup"
                        nativeTitle
                        title="Save your tags to a file"
                        disabled={disabled}
                        icon={<i className="fa-solid fa-file-export" aria-hidden="true" />}
                        onClick={event => {
                            stopLegacy(event);
                            commands.backupTags();
                        }}
                    />
                    <ContractButton
                        className="menu_button menu_button_icon tag_view_restore"
                        label="Restore"
                        nativeTitle
                        title="Restore tags from a file"
                        disabled={disabled}
                        icon={<i className="fa-solid fa-file-import" aria-hidden="true" />}
                        onClick={event => {
                            stopLegacy(event);
                            restoreInputRef.current?.click();
                        }}
                    />
                    <ContractButton
                        className="menu_button menu_button_icon tag_view_create"
                        label="Create"
                        nativeTitle
                        title="Create a new tag"
                        disabled={disabled}
                        icon={<i className="fa-solid fa-plus" aria-hidden="true" />}
                        onClick={event => {
                            stopLegacy(event);
                            handleCreate();
                        }}
                    />
                    <input
                        ref={restoreInputRef}
                        type="file"
                        id="tag_view_restore_input"
                        hidden
                        accept=".json"
                        onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) {
                                handleRestore(file);
                            }
                        }}
                    />
                </div>
            </div>
            <div className="justifyLeft m-b-1">
                <div className="flex-container alignItemsBaseline">
                    <span>{translate('Sort mode:')}</span>
                    <select
                        id="tag_sort_mode_select"
                        className="flex1 text_pole"
                        data-i18n="[aria-label]Sort mode"
                        aria-label={translate('Sort mode')}
                        value={snapshot.sortMode}
                        onChange={event => {
                    stopLegacy(event);
                    handleSortModeChange(event.target.value as TagSortMode);
                }}
                    >
                        <option value="manual">{translate('Manual (Drag & Drop)')}</option>
                        <option value="alphabetical">{translate('Alphabetical (A-Z)')}</option>
                        <option value="by_entries">{translate('Most Used (By Count)')}</option>
                    </select>
                </div>
                <small>
                    <span>{translate('Drag handle to reorder. Click name to rename. Click color to change display.')}</span><br />
                    {bogusFolders && <><span>{translate('Click on the folder icon to use this tag as a folder.')}</span><br /></>}
                </small>
            </div>
            <div className="tag_view_list_tags">
                {tags.map(tag => (
                    <TagManagementRow
                        key={tag.id}
                        tag={tag}
                        disabled={disabled}
                        dragging={draggingId === tag.id}
                        onRename={(id, name) => commands.renameTag(id, name)}
                        onDelete={handleDelete}
                        onCycleFolder={id => commands.cycleTagFolder(id)}
                        onToggleHidden={id => commands.toggleTagHidden(id)}
                        onColorChange={handleColorChange}
                        onMove={handleMove}
                        onDragStart={setDraggingId}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={() => { }}
                        onDrop={handleDrop}
                    />
                ))}
            </div>
        </>
    );
}
