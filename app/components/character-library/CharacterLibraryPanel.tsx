import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LegacyElementHost } from './LegacyElementHost';

export interface CharacterLibraryPanelEntity {
    type: string;
    id: string | number;
    renderKey?: string;
    item?: Record<string, unknown>;
    entities?: Array<unknown>;
    hidden?: number;
    isUseless?: boolean;
}

export interface CharacterLibraryPanelRenderPlan {
    includeBackBlock: boolean;
    hiddenCount: number;
    showEmptyBlock: boolean;
    showHiddenBlock: boolean;
}

export interface CharacterLibraryPanelState {
    currentPage: number;
    pageSize: number;
    pageEntities: CharacterLibraryPanelEntity[];
    renderPlan: CharacterLibraryPanelRenderPlan;
    estimatedRowHeight?: number;
    scrollElement: HTMLElement | null;
}

export interface CharacterLibraryPanelBridge {
    createEntityElement(entity: CharacterLibraryPanelEntity): HTMLElement | Promise<HTMLElement | null> | null;
    createBackBlockElement?(): HTMLElement | Promise<HTMLElement | null> | null;
    createEmptyElement?(): HTMLElement | Promise<HTMLElement | null> | null;
    createHiddenElement?(hiddenCount: number): HTMLElement | Promise<HTMLElement | null> | null;
    getAllCharacters?(): Array<Record<string, unknown>>;
    fetchAllCharacters?(): Promise<Array<Record<string, unknown>>>;
    syncCharactersFromQuery?(characters: Array<Record<string, unknown>>): Promise<void> | void;
}

interface LegacyEntityRowProps {
    bridge: CharacterLibraryPanelBridge;
    entity: CharacterLibraryPanelEntity;
}

function LegacyEntityRow({ bridge, entity }: LegacyEntityRowProps) {
    return (
        <LegacyElementHost
            factory={() => bridge.createEntityElement(entity)}
        />
    );
}

export function CharacterLibraryPanel({ bridge, state }: { bridge: CharacterLibraryPanelBridge; state: CharacterLibraryPanelState; }) {
    const scrollElementRef = useRef<HTMLElement | null>(state.scrollElement);

    useEffect(() => {
        scrollElementRef.current = state.scrollElement;
    }, [state.scrollElement]);

    const charactersQuery = useQuery({
        queryKey: ['character-library', 'all'],
        queryFn: async () => {
            return await bridge.fetchAllCharacters?.() ?? bridge.getAllCharacters?.() ?? [];
        },
        initialData: () => bridge.getAllCharacters?.() ?? [],
        retry: false,
        staleTime: 30000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (!charactersQuery.data) {
            return;
        }

        void bridge.syncCharactersFromQuery?.(charactersQuery.data);
    }, [bridge, charactersQuery.data, charactersQuery.dataUpdatedAt]);

    const estimatedRowHeight = state.estimatedRowHeight ?? 112;
    const virtualizer = useVirtualizer({
        count: state.pageEntities.length,
        getScrollElement: () => scrollElementRef.current,
        estimateSize: () => estimatedRowHeight,
        overscan: 6,
    });

    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const showVirtualRows = !state.renderPlan.includeBackBlock && !state.renderPlan.showEmptyBlock;
    const hiddenBlockFactory = useMemo(() => {
        return () => bridge.createHiddenElement?.(state.renderPlan.hiddenCount) ?? null;
    }, [bridge, state.renderPlan.hiddenCount]);
    const emptyBlockFactory = useMemo(() => {
        return () => bridge.createEmptyElement?.() ?? null;
    }, [bridge]);
    const backBlockFactory = useMemo(() => {
        return () => bridge.createBackBlockElement?.() ?? null;
    }, [bridge]);

    return (
        <>
            {state.renderPlan.includeBackBlock ? <LegacyElementHost factory={backBlockFactory} /> : null}
            {state.renderPlan.showEmptyBlock ? <LegacyElementHost factory={emptyBlockFactory} /> : null}
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
                                <LegacyEntityRow
                                    bridge={bridge}
                                    entity={entity}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : null}
            {state.renderPlan.showHiddenBlock ? <LegacyElementHost factory={hiddenBlockFactory} /> : null}
        </>
    );
}
