import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CharacterLibraryCharacterRow } from './CharacterLibraryCharacterRow';
import { CharacterLibraryFolderRow } from './CharacterLibraryFolderRow';
import { CharacterLibraryGroupRow } from './CharacterLibraryGroupRow';
import {
    CharacterLibraryBackBlock,
    CharacterLibraryEmptyBlock,
    CharacterLibraryHiddenBlock,
} from './CharacterLibraryStatusBlocks';
import { projectCharacterEntityToRowModel } from '@/lib/character-library-row-helpers';

export interface CharacterLibraryPanelEntity {
    type: string;
    id: string | number;
    renderKey?: string;
    item?: Record<string, unknown>;
    entities?: Array<unknown>;
    hidden?: number;
    isUseless?: boolean;
    memberNames?: string[];
    memberCount?: number;
    avatarHtml?: string | null;
    folderIconClass?: string;
    folderColor?: string;
    folderColor2?: string;
}

export interface CharacterLibraryPanelRenderPlan {
    includeBackBlock: boolean;
    hiddenCount: number;
    showEmptyBlock: boolean;
    showHiddenBlock: boolean;
    emptyText?: string;
    emptyMessage?: string;
    showClearFilters?: boolean;
}

export interface CharacterLibraryPanelState {
    currentPage: number;
    pageSize: number;
    pageEntities: CharacterLibraryPanelEntity[];
    renderPlan: CharacterLibraryPanelRenderPlan;
    estimatedRowHeight?: number;
    scrollElement: HTMLElement | null;
    bulkMode?: boolean;
    selectedCharacterIds?: Array<string | number>;
    activeCharacterId?: string | number | null;
    activeGroupId?: string | number | null;
}

export interface CharacterLibraryPanelBridge {
    onSelectCharacter?(id: string | number): void;
    onSelectGroup?(id: string | number): void;
    onOpenFolder?(id: string | number): void;
    onBackFolder?(): void;
    onClearFilters?(): void;
    onBulkToggleCharacter?(id: string | number, checked: boolean): void;
    /** Optional: remaining non-row DOM hosts (toolbar only). Kept for transition. */
    createEntityElement?(entity: CharacterLibraryPanelEntity): HTMLElement | Promise<HTMLElement | null> | null;
}

interface EntityRowProps {
    bridge: CharacterLibraryPanelBridge;
    entity: CharacterLibraryPanelEntity;
    bulkMode: boolean;
    selectedCharacterIds: Array<string | number>;
    activeCharacterId?: string | number | null;
}

function EntityRow({
    bridge,
    entity,
    bulkMode,
    selectedCharacterIds,
    activeCharacterId,
}: EntityRowProps) {
    if (entity.type === 'character' && entity.item) {
        const model = projectCharacterEntityToRowModel({
            type: entity.type,
            id: entity.id,
            item: entity.item,
        }, {
            activeCharacterId,
            resolveAvatarUrl: (avatar) => {
                if (avatar === 'none') {
                    return String(entity.item?.avatarUrl ?? '');
                }
                return String(entity.item?.avatarUrl ?? entity.item?.avatar ?? avatar);
            },
        });
        if (model) {
            const selected = selectedCharacterIds.some(id => String(id) === String(entity.id));
            return (
                <CharacterLibraryCharacterRow
                    model={model}
                    selected={selected}
                    bulkMode={bulkMode}
                    onSelect={(id) => bridge.onSelectCharacter?.(id)}
                    onBulkToggle={(id, checked) => bridge.onBulkToggleCharacter?.(id, checked)}
                />
            );
        }
    }

    if (entity.type === 'group' && entity.item) {
        const item = entity.item;
        return (
            <CharacterLibraryGroupRow
                id={entity.id}
                name={String(item.name ?? '')}
                memberNames={entity.memberNames ?? []}
                memberCount={entity.memberCount}
                isFav={Boolean(item.fav)}
                avatarHtml={entity.avatarHtml}
                onSelect={(id) => bridge.onSelectGroup?.(id)}
            />
        );
    }

    if (entity.type === 'tag' && entity.item) {
        const item = entity.item;
        return (
            <CharacterLibraryFolderRow
                id={entity.id}
                name={String(item.name ?? '')}
                count={Array.isArray(entity.entities) ? entity.entities.length : 0}
                hiddenCount={entity.hidden ?? 0}
                iconClass={entity.folderIconClass}
                color={entity.folderColor}
                color2={entity.folderColor2}
                isUseless={Boolean(entity.isUseless)}
                onOpen={(id) => bridge.onOpenFolder?.(id)}
            />
        );
    }

    return null;
}

export function CharacterLibraryPanel({ bridge, state }: { bridge: CharacterLibraryPanelBridge; state: CharacterLibraryPanelState; }) {
    const scrollElementRef = useRef<HTMLElement | null>(state.scrollElement);
    useEffect(() => {
        scrollElementRef.current = state.scrollElement;
    }, [state.scrollElement]);

    const estimatedRowHeight = state.estimatedRowHeight ?? 112;
    const bulkMode = Boolean(state.bulkMode);
    const selectedCharacterIds = state.selectedCharacterIds ?? [];
    const virtualizer = useVirtualizer({
        count: state.pageEntities.length,
        getScrollElement: () => scrollElementRef.current,
        estimateSize: () => estimatedRowHeight,
        overscan: 6,
    });

    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const showVirtualRows = !state.renderPlan.showEmptyBlock;

    return (
        <>
            {state.renderPlan.includeBackBlock
                ? <CharacterLibraryBackBlock onBack={() => bridge.onBackFolder?.()} />
                : null}
            {state.renderPlan.showEmptyBlock
                ? (
                    <CharacterLibraryEmptyBlock
                        text={state.renderPlan.emptyText ?? 'No items'}
                        message={state.renderPlan.emptyMessage ?? 'There are no items to display.'}
                        showClearFilters={state.renderPlan.showClearFilters}
                        onClearFilters={() => bridge.onClearFilters?.()}
                    />
                )
                : null}
            {showVirtualRows ? (
                <div
                    className="character-library-react-panel"
                    style={{ height: `${totalSize}px`, position: 'relative', width: '100%' }}
                >
                    {virtualItems.map(item => {
                        const entity = state.pageEntities[item.index];
                        if (!entity) {
                            return null;
                        }

                        return (
                            <div
                                key={entity.renderKey ?? `${entity.type}:${entity.id}`}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${item.start}px)`,
                                }}
                            >
                                <EntityRow
                                    bridge={bridge}
                                    entity={entity}
                                    bulkMode={bulkMode}
                                    selectedCharacterIds={selectedCharacterIds}
                                    activeCharacterId={state.activeCharacterId}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : null}
            {state.renderPlan.showHiddenBlock
                ? <CharacterLibraryHiddenBlock hiddenCount={state.renderPlan.hiddenCount} />
                : null}
        </>
    );
}
