/**
 * Stateful World Info workbench session: selection, entry list, field edits.
 * Framework-neutral; no DOM or React dependency.
 */

import {
    WORLD_INFO_POSITION,
    WORLD_INFO_WORKBENCH_EDITABLE_FIELDS,
    buildWorldInfoEntryList,
    buildWorldInfoWorkbenchEntryDetail,
    buildWorldInfoWorkbenchEntrySummary,
} from './world-info-domain.js';

/** Default sort options for the React workbench (parity with legacy select). */
export const WORLD_INFO_DEFAULT_SORT_OPTIONS = [
    { value: '14', label: 'Search', hidden: true, sortRule: 'search' },
    { value: '0', label: 'Priority', sortRule: 'priority' },
    { value: '13', label: 'Custom', sortRule: 'custom' },
    { value: '1', label: 'Title A-Z', sortField: 'comment', sortOrder: 'asc' },
    { value: '2', label: 'Title Z-A', sortField: 'comment', sortOrder: 'desc' },
    { value: '3', label: 'Tokens ↗', sortField: 'content', sortOrder: 'asc', sortRule: 'length' },
    { value: '4', label: 'Tokens ↘', sortField: 'content', sortOrder: 'desc', sortRule: 'length' },
    { value: '5', label: 'Depth ↗', sortField: 'depth', sortOrder: 'asc' },
    { value: '6', label: 'Depth ↘', sortField: 'depth', sortOrder: 'desc' },
    { value: '7', label: 'Order ↗', sortField: 'order', sortOrder: 'asc' },
    { value: '8', label: 'Order ↘', sortField: 'order', sortOrder: 'desc' },
    { value: '9', label: 'UID ↗', sortField: 'uid', sortOrder: 'asc' },
    { value: '10', label: 'UID ↘', sortField: 'uid', sortOrder: 'desc' },
    { value: '11', label: 'Trigger% ↗', sortField: 'probability', sortOrder: 'asc' },
    { value: '12', label: 'Trigger% ↘', sortField: 'probability', sortOrder: 'desc' },
];

/**
 * Resolve sort option metadata by value.
 * @param {string} sortValue
 * @param {typeof WORLD_INFO_DEFAULT_SORT_OPTIONS} [options]
 */
export function resolveWorldInfoSortOption(sortValue, options = WORLD_INFO_DEFAULT_SORT_OPTIONS) {
    const value = String(sortValue ?? '0');
    const found = options.find(option => option.value === value);
    if (!found) {
        return { sortField: 'order', sortOrder: 'desc', sortRule: 'priority' };
    }
    return {
        sortField: found.sortField,
        sortOrder: found.sortOrder,
        sortRule: found.sortRule ?? null,
    };
}

/**
 * Build world name options for React without DOM.
 * @param {string[]} worldNames
 * @param {string} selectedWorldName
 */
export function buildWorldInfoWorldOptions(worldNames, selectedWorldName = '') {
    return (Array.isArray(worldNames) ? worldNames : []).map((name, index) => ({
        value: String(index),
        label: name,
        selected: name === selectedWorldName,
    }));
}

/**
 * Build React panel state from service snapshot + meta without workbench DOM.
 * @param {object} snapshot facade snapshot
 * @param {object} [meta]
 */
export function buildWorldInfoReactPanelState(snapshot, meta = {}) {
    const worldNames = Array.isArray(meta.worldNames) ? meta.worldNames : [];
    const selectedWorldName = snapshot?.editorWorldName || '';
    const resolvedIndex = selectedWorldName && worldNames.includes(selectedWorldName)
        ? String(worldNames.indexOf(selectedWorldName))
        : '';

    return {
        globalSelectorPresent: meta.globalSelectorPresent ?? true,
        editorSelectorPresent: meta.editorSelectorPresent ?? true,
        selectorsSeparated: meta.selectorsSeparated ?? true,
        importMenuPresent: meta.importMenuPresent ?? true,
        importBusy: Boolean(meta.importBusy),
        dropTargetPresent: meta.dropTargetPresent ?? true,
        worldNames: buildWorldInfoWorldOptions(worldNames, selectedWorldName),
        selectedWorldName,
        selectedWorldIndex: resolvedIndex,
        entryCount: snapshot?.entryCount ?? 0,
        entrySummaries: Array.isArray(snapshot?.entrySummaries) ? snapshot.entrySummaries : [],
        searchQuery: String(meta.searchQuery ?? ''),
        sortValue: String(meta.sortValue ?? '0'),
        sortOptions: (meta.sortOptions ?? WORLD_INFO_DEFAULT_SORT_OPTIONS).map(option => ({
            value: option.value,
            label: option.label,
            hidden: Boolean(option.hidden),
        })),
        canCreateEntry: Boolean(selectedWorldName),
        exportMenuPresent: true,
        createWorldMenuPresent: true,
        refreshMenuPresent: true,
        renameMenuPresent: true,
        duplicateMenuPresent: true,
        deleteMenuPresent: true,
        globalActiveNames: Array.isArray(snapshot?.globalActiveNames) ? snapshot.globalActiveNames : [],
        globalActiveCount: snapshot?.globalActiveCount ?? 0,
        selectedEntryUid: snapshot?.selectedEntryUid ?? '',
        selectedEntry: snapshot?.selectedEntry ?? null,
        hasEditorWorld: Boolean(snapshot?.hasEditorWorld ?? selectedWorldName),
    };
}


/**
 * @typedef {object} WorldInfoWorkbenchSessionDeps
 * @property {string[]} worldNames
 * @property {string[]} [selectedWorldInfo]
 * @property {(name: string) => Promise<object|null|undefined>} loadWorldInfo
 * @property {(name: string, data: object, immediately?: boolean) => Promise<void>} [saveWorldInfo]
 * @property {() => ({sortField?: string, sortOrder?: string, sortRule?: string}|null)} [getSortOption]
 * @property {() => string} [getSearchQuery]
 * @property {(entry: object, query: string) => boolean} [matchesSearch]
 * @property {(entries: any[]) => any[]} [applyFilters]
 * @property {(data: object, uid: any, key: string, value: any) => void} [setOriginalDataValue]
 */

/**
 * Create an in-memory workbench session over repository callbacks.
 * @param {WorldInfoWorkbenchSessionDeps} deps
 */
export function createWorldInfoWorkbenchSession(deps) {
    if (!deps || typeof deps.loadWorldInfo !== 'function') {
        throw new Error('createWorldInfoWorkbenchSession requires loadWorldInfo');
    }

    let worldNames = Array.isArray(deps.worldNames) ? [...deps.worldNames] : [];
    let selectedWorldInfo = Array.isArray(deps.selectedWorldInfo) ? [...deps.selectedWorldInfo] : [];
    /** @type {string} */
    let selectedWorldName = '';
    /** @type {string} */
    let selectedEntryUid = '';
    /** @type {string} */
    let searchQuery = typeof deps.initialSearchQuery === 'string' ? deps.initialSearchQuery : '';
    /** @type {string} */
    let sortValue = typeof deps.initialSortValue === 'string' ? deps.initialSortValue : '0';

    function getSelectedWorldName() {
        return selectedWorldName;
    }

    function getSelectedEntryUid() {
        return selectedEntryUid;
    }

    function setWorldNames(nextNames) {
        worldNames = Array.isArray(nextNames) ? [...nextNames] : [];
        if (selectedWorldName && !worldNames.includes(selectedWorldName)) {
            selectedWorldName = '';
            selectedEntryUid = '';
        }
    }

    function setSelectedWorldInfo(nextActive) {
        selectedWorldInfo = Array.isArray(nextActive) ? [...nextActive] : [];
    }

    /**
     * @param {string|number} worldIndex empty string clears selection
     */
    async function selectWorldIndex(worldIndex) {
        const selectedValue = String(worldIndex ?? '');
        if (selectedValue === '') {
            selectedWorldName = '';
            selectedEntryUid = '';
            return;
        }

        const selectedIndex = Number(selectedValue);
        const worldName = Number.isInteger(selectedIndex) && selectedIndex >= 0
            ? worldNames[selectedIndex]
            : null;

        if (!worldName) {
            selectedWorldName = '';
            selectedEntryUid = '';
            return;
        }

        selectedWorldName = worldName;
        selectedEntryUid = '';
        // Warm cache via repository; ignore payload.
        await deps.loadWorldInfo(worldName);
    }

    /**
     * Select by world file name (used after create/rename/import).
     * @param {string} worldName
     */
    async function selectWorldName(worldName) {
        const name = String(worldName ?? '');
        if (!name || !worldNames.includes(name)) {
            selectedWorldName = '';
            selectedEntryUid = '';
            return false;
        }
        selectedWorldName = name;
        selectedEntryUid = '';
        await deps.loadWorldInfo(name);
        return true;
    }

    /**
     * @param {string|number} uid
     */
    async function selectEntry(uid) {
        const normalizedUid = String(uid ?? '');
        if (!normalizedUid || !selectedWorldName) {
            selectedEntryUid = '';
            return false;
        }

        const data = await deps.loadWorldInfo(selectedWorldName);
        if (!data?.entries) {
            selectedEntryUid = '';
            return false;
        }

        const entry = data.entries[normalizedUid] ?? data.entries[Number(normalizedUid)];
        if (!entry) {
            selectedEntryUid = '';
            return false;
        }

        selectedEntryUid = String(entry.uid ?? normalizedUid);
        return true;
    }

    function resolveFilters() {
        if (typeof deps.applyFilters === 'function') {
            return deps.applyFilters;
        }

        const query = typeof deps.getSearchQuery === 'function'
            ? String(deps.getSearchQuery() ?? '')
            : searchQuery;
        if (!query) {
            return (entries) => entries;
        }
        if (typeof deps.matchesSearch === 'function') {
            return (entries) => entries.filter(entry => deps.matchesSearch(entry, query));
        }
        const lowered = query.toLowerCase();
        return (entries) => entries.filter((entry) => {
            const haystack = [
                entry?.comment,
                Array.isArray(entry?.key) ? entry.key.join(' ') : '',
                Array.isArray(entry?.keysecondary) ? entry.keysecondary.join(' ') : '',
                entry?.content,
            ].join(' ').toLowerCase();
            return haystack.includes(lowered);
        });
    }

    function resolveSortOption() {
        if (typeof deps.getSortOption === 'function') {
            return deps.getSortOption() ?? resolveWorldInfoSortOption(sortValue);
        }
        return resolveWorldInfoSortOption(sortValue);
    }

    function applySearchQuery(nextQuery) {
        searchQuery = String(nextQuery ?? '');
        return searchQuery;
    }

    function applySortOption(nextSortValue) {
        sortValue = String(nextSortValue ?? '0');
        return sortValue;
    }

    function getSearchQuery() {
        return searchQuery;
    }

    function getSortValue() {
        return sortValue;
    }

    async function getEntrySummaries() {
        if (!selectedWorldName) {
            return [];
        }

        const data = await deps.loadWorldInfo(selectedWorldName);
        if (!data?.entries) {
            return [];
        }

        const entriesArray = buildWorldInfoEntryList(data.entries, {
            applyFilters: resolveFilters(),
            customSort: resolveSortOption(),
        });

        return entriesArray.map(entry => buildWorldInfoWorkbenchEntrySummary(entry));
    }

    async function getSelectedEntryDetail(uid = selectedEntryUid) {
        if (!selectedWorldName) {
            return null;
        }

        const data = await deps.loadWorldInfo(selectedWorldName);
        if (!data?.entries) {
            return null;
        }

        const normalizedUid = String(uid ?? '');
        if (!normalizedUid) {
            return null;
        }

        const entry = data.entries[normalizedUid] ?? data.entries[Number(normalizedUid)];
        return buildWorldInfoWorkbenchEntryDetail(entry);
    }

    /**
     * @param {string|number} uid
     * @param {Record<string, unknown>} fields
     * @returns {Promise<boolean>}
     */
    async function updateEntryFields(uid, fields = {}) {
        if (!selectedWorldName || !fields || typeof fields !== 'object') {
            return false;
        }

        if (typeof deps.saveWorldInfo !== 'function') {
            throw new Error('updateEntryFields requires saveWorldInfo');
        }

        const data = await deps.loadWorldInfo(selectedWorldName);
        if (!data?.entries) {
            return false;
        }

        const normalizedUid = String(uid ?? '');
        const entry = data.entries[normalizedUid] ?? data.entries[Number(normalizedUid)];
        if (!entry) {
            return false;
        }

        let changed = false;
        for (const [field, value] of Object.entries(fields)) {
            if (!WORLD_INFO_WORKBENCH_EDITABLE_FIELDS.has(field)) {
                continue;
            }
            entry[field] = value;
            if (typeof deps.setOriginalDataValue === 'function') {
                deps.setOriginalDataValue(data, entry.uid, field, value);
                if (field === 'key') {
                    deps.setOriginalDataValue(data, entry.uid, 'keyprimary', value);
                }
                if (field === 'position') {
                    deps.setOriginalDataValue(
                        data,
                        entry.uid,
                        'position',
                        value == WORLD_INFO_POSITION.before ? 'before_char' : 'after_char',
                    );
                    deps.setOriginalDataValue(data, entry.uid, 'extensions.position', value);
                }
            }
            changed = true;
        }

        if (!changed) {
            return false;
        }

        selectedEntryUid = String(entry.uid);
        await deps.saveWorldInfo(selectedWorldName, data, true);
        return true;
    }

    async function getFacadeSnapshot() {
        const editorWorldName = selectedWorldName;
        const entrySummaries = await getEntrySummaries();
        let nextSelectedUid = selectedEntryUid;

        if (nextSelectedUid && !entrySummaries.some(entry => entry.uid === nextSelectedUid)) {
            nextSelectedUid = '';
            selectedEntryUid = '';
        }

        const selectedEntry = nextSelectedUid
            ? await getSelectedEntryDetail(nextSelectedUid)
            : null;

        return {
            globalActiveNames: [...selectedWorldInfo],
            globalActiveCount: selectedWorldInfo.length,
            editorWorldName,
            entryCount: entrySummaries.length,
            entrySummaries,
            selectedEntryUid: nextSelectedUid,
            selectedEntry,
            hasEditorWorld: Boolean(editorWorldName),
        };
    }

    async function getReactPanelState(meta = {}) {
        const snapshot = await getFacadeSnapshot();
        return buildWorldInfoReactPanelState(snapshot, {
            worldNames,
            searchQuery,
            sortValue,
            ...meta,
        });
    }

    return {
        getSelectedWorldName,
        getSelectedEntryUid,
        getSearchQuery,
        getSortValue,
        setWorldNames,
        setSelectedWorldInfo,
        selectWorldIndex,
        selectWorldName,
        selectEntry,
        applySearchQuery,
        applySortOption,
        getEntrySummaries,
        getSelectedEntryDetail,
        updateEntryFields,
        getFacadeSnapshot,
        getReactPanelState,
    };
}
