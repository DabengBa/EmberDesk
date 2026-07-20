import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CharacterLibraryCharacterRow } from './CharacterLibraryCharacterRow';
import { CharacterLibraryFolderRow } from './CharacterLibraryFolderRow';
import { CharacterLibraryGroupRow } from './CharacterLibraryGroupRow';
import {
    CharacterLibraryBackBlock,
    CharacterLibraryEmptyBlock,
    CharacterLibraryHiddenBlock,
} from './CharacterLibraryStatusBlocks';
import {
    projectCharacterEntityToRowModel,
    type CharacterLibraryTagModel,
} from '@/lib/character-library-row-helpers';
import {
    getCharacterLibraryGridColumnCount,
    getCharacterLibraryGridRowCount,
    getCharacterLibraryGridRowRange,
} from '@/lib/character-library-grid-helpers.js';

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
    tags?: CharacterLibraryTagModel[];
    assistantAvatar?: string | null;
    auxFieldName?: string;
    showAvatarUrl?: boolean;
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
    isGrid?: boolean;
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
            assistantAvatar: entity.assistantAvatar,
            auxFieldName: entity.auxFieldName,
            showAvatarUrl: entity.showAvatarUrl,
            resolveTags: () => entity.tags ?? [],
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
                tags={entity.tags}
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
    const isGrid = Boolean(state.isGrid);
    const [gridColumnCount, setGridColumnCount] = useState(() => (
        getCharacterLibraryGridColumnCount(state.scrollElement?.clientWidth)
    ));

    useEffect(() => {
        scrollElementRef.current = state.scrollElement;
    }, [state.scrollElement]);

    useEffect(() => {
        const scrollElement = state.scrollElement;
        if (!isGrid || !scrollElement) {
            setGridColumnCount(1);
            return;
        }

        const updateGridColumnCount = () => {
            const nextColumnCount = getCharacterLibraryGridColumnCount(scrollElement.clientWidth);
            setGridColumnCount(currentColumnCount => (
                currentColumnCount === nextColumnCount ? currentColumnCount : nextColumnCount
            ));
        };
        updateGridColumnCount();

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(updateGridColumnCount);
        observer.observe(scrollElement);
        return () => observer.disconnect();
    }, [isGrid, state.scrollElement]);

    const estimatedRowHeight = state.estimatedRowHeight ?? 112;
    const bulkMode = Boolean(state.bulkMode);
    const selectedCharacterIds = state.selectedCharacterIds ?? [];
    const virtualizer = useVirtualizer({
        count: isGrid
            ? getCharacterLibraryGridRowCount(state.pageEntities.length, gridColumnCount)
            : state.pageEntities.length,
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
                    className={`character-library-react-panel${isGrid ? ' character-library-react-panel--grid' : ''}`}
                    style={{ height: `${totalSize}px`, position: 'relative', width: '100%' }}
                >
                    {virtualItems.map(item => {
                        const entity = state.pageEntities[item.index];
                        const rowRange = isGrid
                            ? getCharacterLibraryGridRowRange(item.index, gridColumnCount)
                            : { start: item.index, end: item.index + 1 };
                        const rowEntities = isGrid
                            ? state.pageEntities.slice(rowRange.start, rowRange.end)
                            : (entity ? [entity] : []);
                        if (rowEntities.length === 0) {
                            return null;
                        }

                        return (
                            <div
                                key={rowEntities[0]?.renderKey ?? `${rowEntities[0]?.type}:${rowEntities[0]?.id}`}
                                className="character-library-react-panel__row"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${item.start}px)`,
                                    gridTemplateColumns: isGrid ? `repeat(${gridColumnCount}, minmax(0, 1fr))` : undefined,
                                }}
                            >
                                {rowEntities.map(rowEntity => (
                                    <div
                                        className="character-library-react-panel__cell"
                                        key={rowEntity.renderKey ?? `${rowEntity.type}:${rowEntity.id}`}
                                    >
                                        <EntityRow
                                            bridge={bridge}
                                            entity={rowEntity}
                                            bulkMode={bulkMode}
                                            selectedCharacterIds={selectedCharacterIds}
                                            activeCharacterId={state.activeCharacterId}
                                        />
                                    </div>
                                ))}
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
