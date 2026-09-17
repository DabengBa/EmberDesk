import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import Fuse from 'fuse.js';

type MacroArgDef = {
    name?: string;
    description?: string;
    type?: string | string[];
    optional?: boolean;
    defaultValue?: unknown;
    sampleValue?: string;
};

export type MacroBrowserMacro = {
    name: string;
    description?: string;
    category?: string;
    aliases?: { alias: string; visible?: boolean }[];
    unnamedArgDefs: MacroArgDef[];
    list?: { min: number; max: number | null } | null;
    maxArgs?: number;
    displayOverride?: string | null;
    aliasOf?: string | null;
    returns?: string;
    returnType?: string | string[];
    exampleUsage?: string[];
    source: { name?: string; isExtension?: boolean; isThirdParty?: boolean };
};

export type MacroBrowserHelpers = {
    formatMacroSignature: (macro: MacroBrowserMacro) => string;
    renderMacroDetails: (macro: MacroBrowserMacro, options?: { currentArgIndex?: number; showCategory?: boolean }) => HTMLElement;
};

export type MacroBrowserProps = {
    // List entries (hidden aliases excluded by the adapter).
    macros: MacroBrowserMacro[];
    // Search corpus (hidden aliases included).
    searchCorpus: MacroBrowserMacro[];
    helpers: MacroBrowserHelpers;
    categoryConfig: Record<string, { label: string; order: number }>;
};

function categoryConfigOf(config: MacroBrowserProps['categoryConfig'], category: string | undefined) {
    return config[category ?? ''] ?? { label: category ?? 'misc', order: 100 };
}

function SourceIndicator({ macro }: { macro: MacroBrowserMacro }) {
    const { isExtension, isThirdParty, name } = macro.source ?? {};
    const classes = ['macro-source', 'fa-solid'];
    if (isExtension) {
        classes.push('isExtension', 'fa-cubes', isThirdParty ? 'isThirdParty' : 'isCore');
    } else {
        classes.push('isCore', 'fa-star-of-life');
    }
    const title = [
        isExtension ? 'Extension' : 'Core',
        isThirdParty ? 'Third Party' : (isExtension ? 'Built-in' : null),
        name,
    ].filter(Boolean).join('\n');
    return <span className={classes.join(' ')} title={title} />;
}

function MacroItem({ macro, selected, filtered, onSelect, formatSignature }: {
    macro: MacroBrowserMacro;
    selected: boolean;
    filtered: boolean;
    onSelect: () => void;
    formatSignature: (macro: MacroBrowserMacro) => string;
}) {
    const classes = ['macro-item'];
    if (macro.aliasOf) classes.push('isAlias');
    if (selected) classes.push('selected');
    if (filtered) classes.push('isFiltered');
    return (
        <div className={classes.join(' ')} data-macro-name={macro.name} onClick={onSelect}>
            <code className="macro-signature">{formatSignature(macro)}</code>
            <span className="macro-desc-preview">{macro.description || '<no description>'}</span>
            {macro.aliasOf && (
                <span className="macro-alias-indicator fa-solid fa-arrow-turn-up" title={`Alias of {{${macro.aliasOf}}}`} />
            )}
            <SourceIndicator macro={macro} />
        </div>
    );
}

/** Hosts a legacy-produced HTMLElement inside the React tree. */
function LegacyNodeSlot({ node }: { node: HTMLElement | null }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.replaceChildren(...(node ? [node] : []));
    }, [node]);
    return <div ref={ref} />;
}

export function MacroBrowserPanel({ macros, searchCorpus, helpers, categoryConfig }: MacroBrowserProps) {
    const [query, setQuery] = useState('');
    const [sorted, setSorted] = useState(false);
    const [selectedName, setSelectedName] = useState<string | null>(null);

    // Group list macros by category, honoring sort toggle.
    const grouped = useMemo(() => {
        const map = new Map<string, MacroBrowserMacro[]>();
        for (const macro of macros) {
            const category = macro.category || 'misc';
            if (!map.has(category)) map.set(category, []);
            map.get(category)!.push(macro);
        }
        if (sorted) {
            for (const list of map.values()) {
                list.sort((a, b) => a.name.localeCompare(b.name));
            }
        }
        return [...map.entries()]
            .sort((a, b) => categoryConfigOf(categoryConfig, a[0]).order - categoryConfigOf(categoryConfig, b[0]).order);
    }, [macros, sorted, categoryConfig]);

    // Fuzzy search over the full corpus, matching legacy weighting.
    const matchedNames = useMemo(() => {
        const trimmed = query.trim().replace(/[{}]/g, '');
        if (!trimmed) return null;
        const searchData = searchCorpus.map(macro => ({
            name: macro.name,
            aliases: macro.aliases?.map(a => a.alias).join(' '),
            description: macro.description || '',
            category: categoryConfigOf(categoryConfig, macro.category).label,
            argNames: (macro.unnamedArgDefs ?? []).map(d => d.name).join(' '),
            argDescriptions: (macro.unnamedArgDefs ?? []).map(d => d.description || '').join(' '),
        }));
        const fuse = new Fuse(searchData, {
            keys: [
                { name: 'name', weight: 10 },
                { name: 'aliases', weight: 1 },
                { name: 'description', weight: 5 },
                { name: 'category', weight: 3 },
                { name: 'argNames', weight: 2 },
                { name: 'argDescriptions', weight: 1 },
            ],
            includeScore: true,
            ignoreLocation: true,
            useExtendedSearch: true,
            threshold: 0.2,
        });
        return new Set(fuse.search(trimmed).map(r => r.item.name));
    }, [query, searchCorpus, categoryConfig]);

    const handleSearch = useCallback((value: string) => {
        setQuery(value);
        setSelectedName(null); // legacy clears details on search
    }, []);

    const selectedMacro = useMemo(
        () => (selectedName ? macros.find(m => m.name === selectedName) ?? null : null),
        [selectedName, macros],
    );
    const detailsNode = useMemo(
        () => (selectedMacro ? helpers.renderMacroDetails(selectedMacro) : null),
        [selectedMacro, helpers],
    );

    return (
        <div className="macroBrowser">
            <div className="macro-toolbar">
                <label className="macro-search-label">
                    {'Search: '}
                    <input
                        type="search"
                        className="macro-search-input text_pole"
                        placeholder="Search macros by name or description..."
                        value={query}
                        onChange={e => handleSearch(e.target.value)}
                    />
                </label>
                <button
                    className={`macro-sort-btn menu_button${sorted ? ' active' : ''}`}
                    title="Sort macros alphabetically within each category"
                    onClick={() => setSorted(s => !s)}
                >
                    <i className="fa-solid fa-arrow-down-a-z" /> Sort A-Z
                </button>
            </div>
            <div className="macro-container">
                <div className="macro-list-panel">
                    {grouped.map(([category, list]) => {
                        const visible = matchedNames
                            ? list.some(m => matchedNames.has(m.name))
                            : true;
                        return (
                            <div key={category} style={{ display: 'contents' }}>
                                <div
                                    className={`macro-category-header${visible ? '' : ' isFiltered'}`}
                                    data-category={category}
                                >
                                    {categoryConfigOf(categoryConfig, category).label}
                                </div>
                                {list.map(macro => (
                                    <MacroItem
                                        key={macro.name}
                                        macro={macro}
                                        selected={selectedName === macro.name}
                                        filtered={matchedNames ? !matchedNames.has(macro.name) : false}
                                        onSelect={() => setSelectedName(macro.name)}
                                        formatSignature={helpers.formatMacroSignature}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
                <div className="macro-details-panel">
                    {detailsNode
                        ? <LegacyNodeSlot node={detailsNode} />
                        : <div className="macro-details-placeholder">Select a macro to view details</div>}
                </div>
            </div>
        </div>
    );
}
