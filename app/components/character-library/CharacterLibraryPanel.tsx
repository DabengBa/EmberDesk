import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CharacterLibraryCharacterRow } from './CharacterLibraryCharacterRow';
import { CharacterLibraryFolderRow } from './CharacterLibraryFolderRow';
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
import type { CharacterLibraryPaginationState } from '@/lib/character-library-helpers';
import { characterLibraryStyles } from '@/styles/workspace-panels.styles';
import { translate } from '../../compat/i18n.js';

export interface CharacterLibraryPanelEntity {
    type: string;
    id: string | number;
    renderKey?: string;
    item?: Record<string, unknown>;
    entities?: Array<unknown>;
    hidden?: number;
    isUseless?: boolean;
    folderIconClass?: string;
    folderColor?: string;
    folderColor2?: string;
    tags?: CharacterLibraryTagModel[];
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
    pagination?: CharacterLibraryPaginationState | null;
    paginationElement?: HTMLElement | null;
    estimatedRowHeight?: number;
    scrollElement: HTMLElement | null;
    isGrid?: boolean;
    bulkMode?: boolean;
    selectedCharacterIds?: Array<string | number>;
    activeCharacterId?: string | number | null;
}

export interface CharacterLibraryPanelBridge {
    onSelectCharacter?(id: string | number): void;
    onOpenFolder?(id: string | number): void;
    onBackFolder?(): void;
    onClearFilters?(): void;
    onBulkToggleCharacter?(id: string | number, checked: boolean): void;
    setCharacterListPage?(page: number): void;
    setCharacterListPageSize?(pageSize: number): void;
}

function PaginationNavItem({
    className,
    disabled,
    page,
    title,
    glyph,
    onNavigate,
}: {
    className: string;
    disabled: boolean;
    page: number;
    title: string;
    glyph: string;
    onNavigate: (page: number) => void;
}) {
    return (
        <li
            className={className}
            data-num={disabled ? undefined : page}
            title={disabled ? undefined : title}
        >
            <a
                href={`#page-${page}`}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : undefined}
                onClick={(event) => {
                    event.preventDefault();
                    if (!disabled) {
                        onNavigate(page);
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!disabled) {
                            onNavigate(page);
                        }
                    }
                }}
            >
                {glyph}
            </a>
        </li>
    );
}

/**
 * React-owned pagination control rendered inside the legacy
 * #rm_print_characters_pagination host. Mirrors the paginationjs DOM shape
 * (nav/pages/size-changer, including J-paginationjs-* hooks) so existing theme
 * CSS and extension selectors keep matching.
 */
function CharacterLibraryPagination({
    pagination,
    container,
    bridge,
}: {
    pagination: CharacterLibraryPaginationState;
    container: HTMLElement;
    bridge: CharacterLibraryPanelBridge;
}) {
    const totalPages = Math.max(Math.ceil(pagination.totalCount / Math.max(pagination.pageSize, 1)), 1);
    const currentPage = pagination.currentPage;
    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;
    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages && page !== currentPage) {
            bridge.setCharacterListPage?.(page);
        }
    };

    return createPortal(
        <div className="paginationjs" data-react-pagination-owner="react">
            <div className="paginationjs-nav J-paginationjs-nav">{pagination.label}</div>
            <div className="paginationjs-pages">
                <ul>
                    <PaginationNavItem
                        className={`paginationjs-first${isFirstPage ? ' disabled' : ' J-paginationjs-first'}`}
                        disabled={isFirstPage}
                        page={1}
                        title="First page"
                        glyph={'\u00AB'}
                        onNavigate={goToPage}
                    />
                    <PaginationNavItem
                        className={`paginationjs-prev${isFirstPage ? ' disabled' : ' J-paginationjs-previous'}`}
                        disabled={isFirstPage}
                        page={currentPage - 1}
                        title="Previous page"
                        glyph={'<'}
                        onNavigate={goToPage}
                    />
                    <PaginationNavItem
                        className={`paginationjs-next${isLastPage ? ' disabled' : ' J-paginationjs-next'}`}
                        disabled={isLastPage}
                        page={currentPage + 1}
                        title="Next page"
                        glyph={'>'}
                        onNavigate={goToPage}
                    />
                    <PaginationNavItem
                        className={`paginationjs-last${isLastPage ? ' disabled' : ' J-paginationjs-last'}`}
                        disabled={isLastPage}
                        page={totalPages}
                        title="Last page"
                        glyph={'\u00BB'}
                        onNavigate={goToPage}
                    />
                </ul>
            </div>
            <div className="paginationjs-size-changer">
                <select
                    className="J-paginationjs-size-select"
                    aria-label="Characters per page"
                    value={String(pagination.pageSize)}
                    onChange={event => bridge.setCharacterListPageSize?.(Number(event.target.value))}
                >
                    {pagination.pageSizeOptions.map(option => (
                        <option key={option} value={String(option)}>{`${option} ${translate('/ page')}`}</option>
                    ))}
                </select>
            </div>
        </div>,
        container,
    );
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

    const lastRenderedPageRef = useRef(state.pagination?.currentPage ?? state.currentPage);
    useEffect(() => {
        const nextPage = state.pagination?.currentPage ?? state.currentPage;
        if (lastRenderedPageRef.current === nextPage) {
            return;
        }
        lastRenderedPageRef.current = nextPage;
        const scrollElement = scrollElementRef.current;
        if (scrollElement) {
            scrollElement.scrollTop = 0;
        }
    }, [state.pagination?.currentPage, state.currentPage]);

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

    // The scroll container collapses while the character editor is open, so the
    // browser clamps scrollTop to 0 without firing a scroll event the
    // virtualizer can observe. Its remembered scrollOffset then renders rows
    // for a stale scroll position, leaving a large empty strip above them.
    // Restore the element's scroll offset when it regains a visible size (the
    // ResizeObserver fires on the display:none -> visible transition), and once
    // on mount in case the element already shrank back while hidden.
    useEffect(() => {
        const scrollElement = scrollElementRef.current;
        if (!scrollElement || typeof ResizeObserver === 'undefined') {
            return;
        }
        const restoreScrollOffset = () => {
            const rememberedOffset = virtualizer.scrollOffset;
            if (typeof rememberedOffset !== 'number' || scrollElement.clientHeight === 0) {
                return;
            }
            if (Math.abs(scrollElement.scrollTop - rememberedOffset) <= 1) {
                return;
            }
            // Prefer the remembered position so users return to where they
            // were. If the element cannot physically reach it (content shrank
            // or fits the viewport), the scrollTop write clamps without firing
            // a scroll event — and scrollToOffset() cannot help either, since
            // it only writes the DOM and relies on that same event to update
            // the internal offset. Sync scrollOffset directly so the rendered
            // window follows the element's real position instead of leaving an
            // empty strip where the skipped rows should be.
            scrollElement.scrollTop = rememberedOffset;
            if (Math.abs(scrollElement.scrollTop - rememberedOffset) > 1) {
                virtualizer.scrollOffset = scrollElement.scrollTop;
                virtualizer.scrollAdjustments = 0;
                virtualizer.measure();
            }
        };
        const observer = new ResizeObserver(restoreScrollOffset);
        observer.observe(scrollElement);
        restoreScrollOffset();
        return () => observer.disconnect();
    }, [virtualizer, state.scrollElement]);

    return (
        <>
            {/* The character/folder rows render as native <button> elements so
                keyboard activation stays intact without ARIA roles. The legacy
                .character_select/.bogus_folder_select classes provide every
                visual except the UA button background, so reset just that here
                at class specificity to keep state rules (hover/active/selected)
                winning over it. */}
            <style>{`
button.character_select,
button.bogus_folder_select {
    background-color: transparent;
    text-align: left;
    color: inherit;
}
`}</style>
            {state.renderPlan.includeBackBlock
                ? <CharacterLibraryBackBlock onBack={() => bridge.onBackFolder?.()} />
                : null}
            {state.renderPlan.showEmptyBlock
                ? (
                    <CharacterLibraryEmptyBlock
                        text={state.renderPlan.emptyText ?? translate('No items')}
                        message={state.renderPlan.emptyMessage ?? translate('There are no items to display.')}
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
                                className={`character-library-react-panel__row ${stylex.props(characterLibraryStyles.panelRow, isGrid ? characterLibraryStyles.panelRowGrid : null).className ?? ''}`}
                                data-index={item.index}
                                ref={virtualizer.measureElement}
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
                                        className={`character-library-react-panel__cell ${stylex.props(characterLibraryStyles.panelCell).className ?? ''}`}
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
            {state.pagination && state.paginationElement instanceof HTMLElement
                ? (
                    <CharacterLibraryPagination
                        pagination={state.pagination}
                        container={state.paginationElement}
                        bridge={bridge}
                    />
                )
                : null}
        </>
    );
}
