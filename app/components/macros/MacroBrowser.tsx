import { useMemo, useRef, useState, useEffect, useCallback, useId } from 'react';
import Fuse from 'fuse.js';
import { t, translate, useTranslated } from '../../compat/i18n.js';

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
    useTranslated('');
    const { isExtension, isThirdParty, name } = macro.source ?? {};
    const classes = ['macro-source', 'fa-solid'];
    if (isExtension) {
        classes.push('isExtension', 'fa-cubes', isThirdParty ? 'isThirdParty' : 'isCore');
    } else {
        classes.push('isCore', 'fa-star-of-life');
    }
    const title = [
        translate(isExtension ? 'Extension' : 'Core'),
        isThirdParty ? translate('Third Party') : (isExtension ? translate('Built-in') : null),
        name,
    ].filter(Boolean).join('\n');
    return <span className={classes.join(' ')} title={title} />;
}

function MacroItem({ macro, selected, filtered, onSelect, formatSignature, detailsId }: {
    macro: MacroBrowserMacro;
    selected: boolean;
    filtered: boolean;
    onSelect: () => void;
    formatSignature: (macro: MacroBrowserMacro) => string;
    detailsId: string;
}) {
    useTranslated('');
    const classes = ['macro-item'];
    if (macro.aliasOf) classes.push('isAlias');
    if (selected) classes.push('selected');
    if (filtered) classes.push('isFiltered');
    return (
        <button type="button" className={classes.join(' ')} data-macro-name={macro.name} aria-pressed={selected} aria-controls={detailsId} onClick={onSelect}>
            <code className="macro-signature">{formatSignature(macro)}</code>
            <span className="macro-desc-preview">{macro.description || translate('No description')}</span>
            {macro.aliasOf && (
                <span className="macro-alias-indicator fa-solid fa-arrow-turn-up" title={t`Alias of ${`{{${macro.aliasOf}}}`}`} aria-hidden="true" />
            )}
            <SourceIndicator macro={macro} />
        </button>
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
    useTranslated('');
    const [query, setQuery] = useState('');
    const [sorted, setSorted] = useState(false);
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const detailsId = useId();
    const searchLabel = useTranslated('Search macros');

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
    const searchIndex = useMemo(() => {
        const searchData = searchCorpus.map(macro => ({
            name: macro.name,
            aliasOf: macro.aliasOf,
            aliases: macro.aliases?.map(a => a.alias).join(' '),
            description: macro.description || '',
            category: categoryConfigOf(categoryConfig, macro.category).label,
            argNames: (macro.unnamedArgDefs ?? []).map(d => d.name).join(' '),
            argDescriptions: (macro.unnamedArgDefs ?? []).map(d => d.description || '').join(' '),
        }));
        return new Fuse(searchData, {
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
    }, [searchCorpus, categoryConfig]);
    const matchedNames = useMemo(() => {
        const trimmed = query.trim().replace(/[{}]/g, '');
        return trimmed ? new Set(searchIndex.search(trimmed).map(r => r.item.aliasOf || r.item.name)) : null;
    }, [query, searchIndex]);
    const noResults = !macros.some(macro => !matchedNames || matchedNames.has(macro.name));

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
        <div className="macroBrowser" data-empty={noResults || undefined}>
            {/* macro-item rows are native <button> elements; the .macro-item
                class supplies layout/hover styles but not a background, so
                reset the UA button background/border at class specificity to
                keep .macroBrowser .macro-item:hover/.selected winning. */}
            <style>{`
button.macro-item {
    background-color: transparent;
    border: none;
    text-align: left;
    color: inherit;
}
`}</style>
            <div className="macro-toolbar">
                <label className="macro-search-label">
                    {searchLabel}
                    <input
                        ref={searchRef}
                        type="search"
                        className="macro-search-input text_pole"
                        placeholder={translate('Search macros by name or description...')}
                        value={query}
                        onChange={e => handleSearch(e.target.value)}
                    />
                </label>
                <button
                    type="button"
                    className={`macro-sort-btn menu_button${sorted ? ' active' : ''}`}
                    title={translate('Sort macros alphabetically within each category')}
                    aria-pressed={sorted}
                    onClick={() => setSorted(s => !s)}
                >
                    <i className="fa-solid fa-arrow-down-a-z" aria-hidden="true" /> {translate('Sort A-Z')}
                </button>
            </div>
            {noResults && (
                <div className="macro-empty-state">
                    <p role="status">{translate(query.trim() ? 'No macros match your search.' : 'No macros available.')}</p>
                    {query.trim() && <button type="button" className="menu_button" onClick={() => { handleSearch(''); searchRef.current?.focus(); }}>{translate('Clear search')}</button>}
                </div>
            )}
            <div className="macro-container" hidden={noResults}>
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
                                    {translate(categoryConfigOf(categoryConfig, category).label)}
                                </div>
                                {list.map(macro => (
                                    <MacroItem
                                        key={macro.name}
                                        macro={macro}
                                        selected={selectedName === macro.name}
                                        filtered={matchedNames ? !matchedNames.has(macro.name) : false}
                                        onSelect={() => setSelectedName(macro.name)}
                                        formatSignature={helpers.formatMacroSignature}
                                        detailsId={detailsId}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
                <div className="macro-details-panel" id={detailsId} role="region" aria-label={translate('Macro details')} aria-live="polite">
                    {detailsNode
                        ? <LegacyNodeSlot node={detailsNode} />
                        : <div className="macro-details-placeholder">{translate('Select a macro to view details')}</div>}
                </div>
            </div>
        </div>
    );
}
