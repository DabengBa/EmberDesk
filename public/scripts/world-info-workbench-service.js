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
    normalizeWorldInfoEntryPosition,
    sortWorldInfoEntries,
} from './world-info-domain.js';

const WORKBENCH_COMMENT_MAX_LENGTH = 100;

/** Serialize asynchronous World Info mounts so an older snapshot cannot mount last. */
export function createWorldInfoMountScheduler(mount) {
    let pending = Promise.resolve();
    return (...args) => {
        const result = pending.then(() => mount(...args));
        pending = result.catch(() => {});
        return result;
    };
}

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
    return (Array.isArray(worldNames) ? worldNames : []).map((name) => ({
        value: name,
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
    const searchQuery = String(meta.searchQuery ?? '');
    const resolvedSelection = selectedWorldName && worldNames.includes(selectedWorldName)
        ? selectedWorldName
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
        selectedWorldIndex: resolvedSelection,
        entryCount: snapshot?.entryCount ?? 0,
        entrySummaries: Array.isArray(snapshot?.entrySummaries) ? snapshot.entrySummaries : [],
        searchQuery,
        sortValue: String(meta.sortValue ?? '0'),
        sortOptions: (meta.sortOptions ?? WORLD_INFO_DEFAULT_SORT_OPTIONS).map(option => ({
            value: option.value,
            label: option.label,
            hidden: Boolean(option.hidden) && !searchQuery,
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
        scanDepth: Number.isFinite(meta.scanDepth) ? meta.scanDepth : null,
        selectedEntryUid: snapshot?.selectedEntryUid ?? '',
        selectedEntry: snapshot?.selectedEntry ?? null,
        hasEditorWorld: Boolean(snapshot?.hasEditorWorld ?? selectedWorldName),
    };
}


/**
 * @typedef {object} WorldInfoWorkbenchSessionDeps
 * @property {string[]} worldNames
 * @property {string[]} [selectedWorldInfo]
 * @property {string} [initialSortValue]
 * @property {(name: string) => Promise<object|null|undefined>} loadWorldInfo
 * @property {(name: string, data: object, immediately?: boolean) => Promise<void>} [saveWorldInfo]
 * @property {() => ({sortField?: string, sortOrder?: string, sortRule?: string}|null)} [getSortOption]
 * @property {() => string} [getSearchQuery]
 * @property {(entry: object, query: string) => boolean} [matchesSearch]
 * @property {(entries: any[]) => any[]} [applyFilters]
 * @property {(uid: string|number) => number|undefined} [getSearchScore]
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
    // Invalidates in-flight selection and snapshots without creating another
    // source of selection state.
    let selectionRevision = 0;
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

    function captureSelectionGuard() {
        const revision = selectionRevision;
        return () => revision === selectionRevision;
    }

    function setWorldNames(nextNames) {
        worldNames = Array.isArray(nextNames) ? [...nextNames] : [];
        if (selectedWorldName && !worldNames.includes(selectedWorldName)) {
            selectionRevision++;
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
            selectionRevision++;
            selectedWorldName = '';
            selectedEntryUid = '';
            searchQuery = '';
            return;
        }

        // Names win over indexes so integer-named books keep resolving to
        // themselves; fall back to positional index for legacy callers.
        const asIndex = Number(selectedValue);
        const indexedName = Number.isInteger(asIndex) && asIndex >= 0 ? worldNames[asIndex] : null;
        const worldName = worldNames.includes(selectedValue) ? selectedValue : indexedName;

        if (!worldName) {
            selectionRevision++;
            selectedWorldName = '';
            selectedEntryUid = '';
            searchQuery = '';
            return;
        }

        if (worldName === selectedWorldName) {
            return;
        }

        selectionRevision++;
        selectedWorldName = worldName;
        selectedEntryUid = '';
        // Preserve legacy editor semantics: selecting another book starts with
        // an unfiltered entry list instead of carrying a query across books.
        searchQuery = '';
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
            selectionRevision++;
            selectedWorldName = '';
            selectedEntryUid = '';
            return false;
        }
        // Reselecting the same book is a no-op: keep entry selection and
        // skip the redundant cache warm.
        if (name === selectedWorldName) {
            return true;
        }
        selectionRevision++;
        selectedWorldName = name;
        selectedEntryUid = '';
        await deps.loadWorldInfo(name);
        return true;
    }

    /**
     * @param {string|number} uid
     */
    async function selectEntry(uid) {
        const revision = ++selectionRevision;
        const worldName = selectedWorldName;
        const normalizedUid = String(uid ?? '');
        if (!normalizedUid || !worldName) {
            selectedEntryUid = '';
            return false;
        }

        const data = await deps.loadWorldInfo(worldName);
        if (revision !== selectionRevision) {
            return false;
        }
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
        selectionRevision++;
        searchQuery = String(nextQuery ?? '');
        return searchQuery;
    }

    function applySortOption(nextSortValue) {
        selectionRevision++;
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
            getSearchScore: deps.getSearchScore,
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
     * @param {string} [sourceWorldName] book captured by the caller
     * @returns {Promise<boolean>}
     */
    async function updateEntryFields(uid, fields = {}, sourceWorldName = selectedWorldName) {
        const worldName = String(sourceWorldName ?? '');
        const revision = selectionRevision;
        if (!worldName || worldName !== selectedWorldName || !fields || typeof fields !== 'object') {
            return false;
        }

        if (typeof deps.saveWorldInfo !== 'function') {
            throw new Error('updateEntryFields requires saveWorldInfo');
        }

        // Keep the complete read/modify/write operation in one callback so a
        // repository can serialize it before reading (U002).
        const capturedFields = structuredClone(fields);
        const capturedUid = String(uid ?? '');
        const mutate = async (save = data => deps.saveWorldInfo(worldName, data, true)) => {
            const data = await deps.loadWorldInfo(worldName);
            if (!data?.entries) {
                return false;
            }

            const normalizedUid = capturedUid;
            const entry = data.entries[normalizedUid] ?? data.entries[Number(normalizedUid)];
            if (!entry) {
                return false;
            }

            let changed = false;
            for (const [field, rawValue] of Object.entries(capturedFields)) {
                if (!WORLD_INFO_WORKBENCH_EDITABLE_FIELDS.has(field)) {
                    continue;
                }
                const value = field === 'position' ? normalizeWorldInfoEntryPosition(rawValue) : rawValue;
                entry[field] = value;
                if (field === 'position' && value !== WORLD_INFO_POSITION.atDepth) {
                    entry.role = null;
                }
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
                        deps.setOriginalDataValue(data, entry.uid, 'extensions.role', entry.role);
                    }
                }
                changed = true;
            }

            if (!changed) {
                return false;
            }

            await save(data);
            if (revision === selectionRevision) {
                selectedEntryUid = String(entry.uid);
            }
            return true;
        };
        return typeof deps.runWorldInfoMutation === 'function'
            ? deps.runWorldInfoMutation(worldName, mutate)
            : mutate();
    }

    /**
     * Fill empty comment/memo fields with the entry's primary keywords.
     * @returns {Promise<number>} count of updated entries
     */
    async function backfillMemos() {
        const worldName = selectedWorldName;
        if (!worldName) {
            return 0;
        }

        const mutate = async (save = data => deps.saveWorldInfo(worldName, data, true)) => {
            const data = await deps.loadWorldInfo(worldName);
            if (!data?.entries) {
                return 0;
            }

            let counter = 0;
            for (const entry of Object.values(data.entries)) {
                if (!entry.comment && Array.isArray(entry.key) && entry.key.length > 0) {
                    entry.comment = entry.key.join(', ').slice(0, WORKBENCH_COMMENT_MAX_LENGTH);
                    if (typeof deps.setOriginalDataValue === 'function') {
                        deps.setOriginalDataValue(data, entry.uid, 'comment', entry.comment);
                    }
                    counter++;
                }
            }

            if (counter > 0) {
                await save(data);
            }
            return counter;
        };
        return typeof deps.runWorldInfoMutation === 'function' ? deps.runWorldInfoMutation(worldName, mutate) : mutate();
    }

    /**
     * Rewrite entry `order` values to follow the currently displayed sorting,
     * counting down from `start` (never below 0).
     * @param {number} start
     * @returns {Promise<number>} count of updated entries
     */
    async function applySortingAsOrder(start) {
        const worldName = selectedWorldName;
        if (!worldName) {
            return 0;
        }

        const sortOption = resolveSortOption();
        const mutate = async (save = data => deps.saveWorldInfo(worldName, data, true)) => {
            const data = await deps.loadWorldInfo(worldName);
            if (!data?.entries) {
                return 0;
            }

            const entries = Object.values(data.entries);
            sortWorldInfoEntries(entries, {
                customSort: sortOption,
                getSearchScore: typeof deps.getSearchScore === 'function' ? deps.getSearchScore : null,
            });

            let updated = 0;
            let current = start;
            for (const entry of entries) {
                const newOrder = Math.max(current--, 0);
                if (entry.order === newOrder) {
                    continue;
                }
                entry.order = newOrder;
                if (typeof deps.setOriginalDataValue === 'function') {
                    deps.setOriginalDataValue(data, entry.uid, 'order', newOrder);
                }
                updated++;
            }

            if (updated > 0) {
                await save(data);
            }
            return updated;
        };
        return typeof deps.runWorldInfoMutation === 'function' ? deps.runWorldInfoMutation(worldName, mutate) : mutate();
    }

    /**
     * Delete entries by uid (caller confirms first).
     * @param {Array<string|number>} uids
     * @returns {Promise<number>} count of deleted entries
     */
    async function deleteEntries(uids) {
        const worldName = selectedWorldName;
        const revision = selectionRevision;
        if (!worldName || !Array.isArray(uids) || uids.length === 0) {
            return 0;
        }

        uids = [...uids];
        const mutate = async (save = data => deps.saveWorldInfo(worldName, data, true)) => {
            const data = await deps.loadWorldInfo(worldName);
            if (!data?.entries) {
                return 0;
            }

            let deleted = 0;
            for (const uid of uids) {
                const key = data.entries[String(uid)] !== undefined ? String(uid) : String(Number(uid));
                if (data.entries[key] === undefined) {
                    continue;
                }
                delete data.entries[key];
                if (typeof deps.deleteOriginalDataValue === 'function') {
                    deps.deleteOriginalDataValue(data, uid);
                }
                deleted++;
            }

            if (deleted > 0) {
                await save(data);
                if (revision === selectionRevision && uids.map(String).includes(selectedEntryUid)) {
                    selectedEntryUid = '';
                }
            }
            return deleted;
        };
        return typeof deps.runWorldInfoMutation === 'function' ? deps.runWorldInfoMutation(worldName, mutate) : mutate();
    }

    /**
     * Enable or disable entries by uid.
     * @param {Array<string|number>} uids
     * @param {boolean} enabled
     * @returns {Promise<number>} count of updated entries
     */
    async function setEntriesEnabled(uids, enabled) {
        const worldName = selectedWorldName;
        if (!worldName || !Array.isArray(uids) || uids.length === 0) {
            return 0;
        }

        uids = [...uids];
        const mutate = async (save = data => deps.saveWorldInfo(worldName, data, true)) => {
            const data = await deps.loadWorldInfo(worldName);
            if (!data?.entries) {
                return 0;
            }

            let updated = 0;
            for (const uid of uids) {
                const key = data.entries[String(uid)] !== undefined ? String(uid) : String(Number(uid));
                const entry = data.entries[key];
                if (!entry) {
                    continue;
                }
                const nextDisable = !enabled;
                if (entry.disable === nextDisable) {
                    continue;
                }
                entry.disable = nextDisable;
                if (typeof deps.setOriginalDataValue === 'function') {
                    deps.setOriginalDataValue(data, entry.uid, 'disable', nextDisable);
                }
                updated++;
            }

            if (updated > 0) {
                await save(data);
            }
            return updated;
        };
        return typeof deps.runWorldInfoMutation === 'function' ? deps.runWorldInfoMutation(worldName, mutate) : mutate();
    }

    async function getFacadeSnapshot() {
        const revision = selectionRevision;
        const editorWorldName = selectedWorldName;
        const entrySummaries = await getEntrySummaries();
        if (revision !== selectionRevision) {
            return getFacadeSnapshot();
        }
        let nextSelectedUid = selectedEntryUid;

        if (nextSelectedUid && !entrySummaries.some(entry => entry.uid === nextSelectedUid)) {
            nextSelectedUid = '';
            selectedEntryUid = '';
        }

        const selectedEntry = nextSelectedUid
            ? await getSelectedEntryDetail(nextSelectedUid)
            : null;

        if (revision !== selectionRevision) {
            return getFacadeSnapshot();
        }

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
        captureSelectionGuard,
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
        backfillMemos,
        applySortingAsOrder,
        deleteEntries,
        setEntriesEnabled,
        getFacadeSnapshot,
        getReactPanelState,
    };
}
