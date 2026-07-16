/**
 * Pure World Info domain helpers: entry projection, sort, and field defaults.
 * No DOM, browser document access, or workbench ownership.
 */

export const WORLD_INFO_LOGIC = {
    AND_ANY: 0,
    NOT_ALL: 1,
    NOT_ANY: 2,
    AND_ALL: 3,
};

export const WORLD_INFO_POSITION = {
    before: 0,
    after: 1,
    ANTop: 2,
    ANBottom: 3,
    atDepth: 4,
    EMTop: 5,
    EMBottom: 6,
    outlet: 7,
};

export const DEFAULT_DEPTH = 4;
export const DEFAULT_WEIGHT = 100;

export const NEW_WORLD_INFO_ENTRY_TEMPLATE = {
    key: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: WORLD_INFO_LOGIC.AND_ANY,
    addMemo: false,
    order: 100,
    position: 0,
    disable: false,
    ignoreBudget: false,
    excludeRecursion: false,
    preventRecursion: false,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: DEFAULT_DEPTH,
    outletName: '',
    group: '',
    groupOverride: false,
    groupWeight: DEFAULT_WEIGHT,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: 0,
    sticky: null,
    cooldown: null,
    delay: null,
    characterFilterNames: [],
    characterFilterTags: [],
    characterFilterExclude: false,
    triggers: [],
};

export const WORLD_INFO_WORKBENCH_EDITABLE_FIELDS = new Set([
    'key',
    'keysecondary',
    'comment',
    'content',
    'constant',
    'selective',
    'selectiveLogic',
    'addMemo',
    'order',
    'position',
    'disable',
    'ignoreBudget',
    'excludeRecursion',
    'preventRecursion',
    'matchPersonaDescription',
    'matchCharacterDescription',
    'matchCharacterPersonality',
    'matchCharacterDepthPrompt',
    'matchScenario',
    'matchCreatorNotes',
    'delayUntilRecursion',
    'probability',
    'useProbability',
    'depth',
    'outletName',
    'group',
    'groupOverride',
    'groupWeight',
    'scanDepth',
    'caseSensitive',
    'matchWholeWords',
    'useGroupScoring',
    'automationId',
    'role',
    'sticky',
    'cooldown',
    'delay',
    'characterFilterNames',
    'characterFilterTags',
    'characterFilterExclude',
    'triggers',
]);

/**
 * Human-readable injection position for workbench list/editor display.
 * @param {object} entry
 * @returns {string}
 */
export function getWorldInfoWorkbenchPositionLabel(entry) {
    if (!entry || typeof entry !== 'object') {
        return '';
    }

    switch (entry.position) {
        case WORLD_INFO_POSITION.before: return '角色定义前';
        case WORLD_INFO_POSITION.after: return '角色定义后';
        case WORLD_INFO_POSITION.EMTop: return '示例消息顶部';
        case WORLD_INFO_POSITION.EMBottom: return '示例消息底部';
        case WORLD_INFO_POSITION.ANTop: return '作者注释顶部';
        case WORLD_INFO_POSITION.ANBottom: return '作者注释底部';
        case WORLD_INFO_POSITION.atDepth: return `按深度 ${entry.depth ?? DEFAULT_DEPTH}`;
        case WORLD_INFO_POSITION.outlet: return entry.outletName ? `出口: ${entry.outletName}` : '出口';
        default: return '未知位置';
    }
}

/**
 * @param {object} entry
 * @returns {object}
 */
export function buildWorldInfoWorkbenchEntrySummary(entry) {
    const keys = Array.isArray(entry?.key) ? entry.key.filter(Boolean) : [];
    const title = String(entry?.comment || '').trim() || keys.join(', ') || `Entry ${entry?.uid ?? ''}`;
    const constant = Boolean(entry?.constant);
    return {
        uid: String(entry?.uid ?? ''),
        title,
        disabled: Boolean(entry?.disable),
        constant,
        keywordsSummary: constant ? 'Constant' : (keys.join(', ') || 'No keywords'),
        positionLabel: getWorldInfoWorkbenchPositionLabel(entry),
        order: Number(entry?.order ?? 0),
        hasSecondaryKeys: Array.isArray(entry?.keysecondary) && entry.keysecondary.length > 0,
        probability: Number(entry?.probability ?? 100),
        useProbability: entry?.useProbability !== false,
        group: String(entry?.group || ''),
        sticky: entry?.sticky ?? null,
        cooldown: entry?.cooldown ?? null,
        delay: entry?.delay ?? null,
    };
}

/**
 * Clone entry fields for React editor state without advertising retired capabilities.
 * `vectorized` remains in the payload for lossless save round-trips only.
 * @param {object} entry
 * @returns {object|null}
 */
export function buildWorldInfoWorkbenchEntryDetail(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        uid: String(entry.uid ?? ''),
        comment: String(entry.comment ?? ''),
        content: String(entry.content ?? ''),
        key: Array.isArray(entry.key) ? [...entry.key] : [],
        keysecondary: Array.isArray(entry.keysecondary) ? [...entry.keysecondary] : [],
        constant: Boolean(entry.constant),
        selective: entry.selective !== false,
        selectiveLogic: Number(entry.selectiveLogic ?? WORLD_INFO_LOGIC.AND_ANY),
        disable: Boolean(entry.disable),
        order: Number(entry.order ?? 100),
        position: Number(entry.position ?? WORLD_INFO_POSITION.before),
        role: Number(entry.role ?? 0),
        depth: Number(entry.depth ?? DEFAULT_DEPTH),
        probability: Number(entry.probability ?? 100),
        useProbability: entry.useProbability !== false,
        ignoreBudget: Boolean(entry.ignoreBudget),
        excludeRecursion: Boolean(entry.excludeRecursion),
        preventRecursion: Boolean(entry.preventRecursion),
        delayUntilRecursion: Number(entry.delayUntilRecursion ?? 0),
        sticky: entry.sticky ?? null,
        cooldown: entry.cooldown ?? null,
        delay: entry.delay ?? null,
        group: String(entry.group ?? ''),
        groupOverride: Boolean(entry.groupOverride),
        groupWeight: Number(entry.groupWeight ?? DEFAULT_WEIGHT),
        scanDepth: entry.scanDepth ?? null,
        caseSensitive: entry.caseSensitive ?? null,
        matchWholeWords: entry.matchWholeWords ?? null,
        useGroupScoring: entry.useGroupScoring ?? null,
        automationId: String(entry.automationId ?? ''),
        outletName: String(entry.outletName ?? ''),
        matchPersonaDescription: Boolean(entry.matchPersonaDescription),
        matchCharacterDescription: Boolean(entry.matchCharacterDescription),
        matchCharacterPersonality: Boolean(entry.matchCharacterPersonality),
        matchCharacterDepthPrompt: Boolean(entry.matchCharacterDepthPrompt),
        matchScenario: Boolean(entry.matchScenario),
        matchCreatorNotes: Boolean(entry.matchCreatorNotes),
        characterFilterNames: Array.isArray(entry.characterFilterNames) ? [...entry.characterFilterNames] : [],
        characterFilterTags: Array.isArray(entry.characterFilterTags) ? [...entry.characterFilterTags] : [],
        characterFilterExclude: Boolean(entry.characterFilterExclude),
        triggers: Array.isArray(entry.triggers) ? [...entry.triggers] : [],
        // Compatibility-only: not rendered as a capability in the workbench UI.
        vectorized: Boolean(entry.vectorized),
        positionLabel: getWorldInfoWorkbenchPositionLabel(entry),
    };
}

/**
 * Adds missing fields to WI entries that are present in the entry template, but not in the data.
 * Additionally verify that array/object fields are of the expected type.
 * @param {any[]} data WI entries
 * @param {object} [template] optional template overrides
 * @returns {any[]} Data with backfilled fields
 */
export function addMissingWorldInfoFields(data, template = NEW_WORLD_INFO_ENTRY_TEMPLATE) {
    data.forEach((entry) => {
        Object.entries(template).forEach(([key, value]) => {
            if (!Object.hasOwn(entry, key)) {
                entry[key] = structuredClone(value);
            }
        });

        if (!Array.isArray(entry.key)) {
            entry.key = [];
        }

        if (!Array.isArray(entry.keysecondary)) {
            entry.keysecondary = [];
        }

        if (!entry.characterFilter || typeof entry.characterFilter !== 'object' || Array.isArray(entry.characterFilter)) {
            entry.characterFilter = {
                isExclude: false,
                names: [],
                tags: [],
            };
        }
    });

    return data;
}

/**
 * Sorts World Info entries using pure sort options (no DOM).
 *
 * @param {any[]} data WI entries
 * @param {object} [options={}]
 * @param {{sortField?: string, sortOrder?: string, sortRule?: string}|null} [options.customSort]
 * @param {(uid: string|number) => number} [options.getSearchScore]
 * @returns {any[]} Sorted data (mutates in place for parity with legacy)
 */
export function sortWorldInfoEntries(data, { customSort = null, getSearchScore = null } = {}) {
    const sortField = customSort?.sortField;
    const sortOrder = customSort?.sortOrder ?? 'desc';
    const sortRule = customSort?.sortRule ?? null;
    const orderSign = sortOrder === 'asc' ? 1 : -1;

    if (!data.length) return data;

    /** @type {(a: any, b: any) => number} */
    let primarySort;

    const secondarySort = (a, b) => b.order - a.order;
    const tertiarySort = (a, b) => a.uid - b.uid;

    if (sortRule === 'search') {
        primarySort = (a, b) => {
            const aScore = typeof getSearchScore === 'function' ? getSearchScore(a.uid) : 0;
            const bScore = typeof getSearchScore === 'function' ? getSearchScore(b.uid) : 0;
            return aScore - bScore;
        };
    } else if (sortRule === 'custom') {
        primarySort = (a, b) => {
            const aValue = a.displayIndex;
            const bValue = b.displayIndex;
            return aValue - bValue;
        };
    } else if (sortRule === 'priority') {
        primarySort = (a, b) => {
            const aValue = a.disable ? 2 : a.constant ? 0 : 1;
            const bValue = b.disable ? 2 : b.constant ? 0 : 1;
            return aValue - bValue;
        };
    } else {
        primarySort = (a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                if (sortRule === 'length') {
                    return orderSign * (aValue.length - bValue.length);
                }
                return orderSign * aValue.localeCompare(bValue);
            }

            return orderSign * (Number(aValue) - Number(bValue));
        };
    }

    data.sort((a, b) => {
        return primarySort(a, b) || secondarySort(a, b) || tertiarySort(a, b);
    });

    return data;
}

/**
 * Build the list pipeline used by workbench summaries: normalize -> filter -> sort -> project.
 * @param {Record<string, object>|null|undefined} entriesMap
 * @param {object} [options]
 * @param {(entries: any[]) => any[]} [options.applyFilters]
 * @param {{sortField?: string, sortOrder?: string, sortRule?: string}|null} [options.customSort]
 * @param {(uid: string|number) => number} [options.getSearchScore]
 * @returns {any[]}
 */
export function buildWorldInfoEntryList(entriesMap, {
    applyFilters = null,
    customSort = null,
    getSearchScore = null,
} = {}) {
    if (!entriesMap || typeof entriesMap !== 'object') {
        return [];
    }

    let entriesArray = Object.keys(entriesMap).map(uid => {
        const entry = entriesMap[uid];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
        }
        entry.displayIndex = entry.displayIndex ?? entry.uid;
        return entry;
    }).filter(entry => entry !== null);

    entriesArray = addMissingWorldInfoFields(entriesArray);

    if (typeof applyFilters === 'function') {
        entriesArray = applyFilters(entriesArray);
    }

    entriesArray = sortWorldInfoEntries(entriesArray, { customSort, getSearchScore });
    return entriesArray;
}
