/**
 * Pure World Info domain helpers: entry projection, sort, field defaults,
 * keyword/regex parsing, and original-data bookkeeping.
 * No DOM or browser document access; utils.js leaf imports only
 * (no eval-time access, safe across the utils.js -> world-info.js edge).
 */

import { getOptionId, setValueByPath } from './util/primitives.js';

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

// ---------------------------------------------------------------------------
// Keyword / regex parsing and original-data bookkeeping.
// Pure helpers shared by the legacy editor and generation-time scanning.
// ---------------------------------------------------------------------------

export const wi_anchor_position = {
    before: 0,
    after: 1,
};

/**
 * Maps world info entry field names to their original-data entry paths.
 */
export const originalWIDataKeyMap = {
    'displayIndex': 'extensions.display_index',
    'excludeRecursion': 'extensions.exclude_recursion',
    'preventRecursion': 'extensions.prevent_recursion',
    'delayUntilRecursion': 'extensions.delay_until_recursion',
    'selectiveLogic': 'selectiveLogic',
    'comment': 'comment',
    'constant': 'constant',
    'order': 'insertion_order',
    'depth': 'extensions.depth',
    'probability': 'extensions.probability',
    'position': 'extensions.position',
    'role': 'extensions.role',
    'content': 'content',
    'enabled': 'enabled',
    'key': 'keys',
    'keysecondary': 'secondary_keys',
    'selective': 'selective',
    'matchWholeWords': 'extensions.match_whole_words',
    'useGroupScoring': 'extensions.use_group_scoring',
    'caseSensitive': 'extensions.case_sensitive',
    'matchCharacterDescription': 'extensions.match_character_description',
    'matchCharacterPersonality': 'extensions.match_character_personality',
    'matchCharacterDepthPrompt': 'extensions.match_character_depth_prompt',
    'matchScenario': 'extensions.match_scenario',
    'matchCreatorNotes': 'extensions.match_creator_notes',
    'scanDepth': 'extensions.scan_depth',
    'automationId': 'extensions.automation_id',
    'vectorized': 'extensions.vectorized',
    'groupOverride': 'extensions.group_override',
    'groupWeight': 'extensions.group_weight',
    'sticky': 'extensions.sticky',
    'cooldown': 'extensions.cooldown',
    'delay': 'extensions.delay',
    'triggers': 'extensions.triggers',
    'ignoreBudget': 'extensions.ignore_budget',
};

/**
 * Sets the value of a specific key in the original data entry corresponding to the given uid.
 * @param {object} data - The data object containing the original data entries.
 * @param {number} uid - The unique identifier of the data entry.
 * @param {string} key - The key of the value to be set.
 * @param {any} value - The value to be set.
 */
export function setWIOriginalDataValue(data, uid, key, value) {
    if (data.originalData && Array.isArray(data.originalData.entries)) {
        const originalEntry = data.originalData.entries.find(x => x.uid === uid);

        if (!originalEntry) {
            return;
        }

        setValueByPath(originalEntry, key, value);
    }
}

/**
 * Deletes the original data entry corresponding to the given uid from the provided data object.
 * Non-strict equality is used to allow for both string and number comparisons.
 * @param {object} data - The data object containing the original data entries
 * @param {number} uid - The unique identifier of the data entry to be deleted
 */
export function deleteWIOriginalDataValue(data, uid) {
    if (data.originalData && Array.isArray(data.originalData.entries)) {
        const originalIndex = data.originalData.entries.findIndex(x => x.uid == uid);

        if (originalIndex >= 0) {
            data.originalData.entries.splice(originalIndex, 1);
        }
    }
}

/**
 * Gets a real regex object from a slash-delimited regex string.
 * Delimiter is `/` and each occurrence inside the regex has to be escaped.
 * Flags are optional and limited to JavaScript's `RegExp` flags (`g`, `i`, `m`, `s`, `u`, `y`).
 * @param {string} input - A delimited regex string
 * @returns {RegExp|null} The regex object, or null if not a valid regex
 */
export function parseRegexFromString(input) {
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) {
        return null;
    }

    let [, pattern, flags] = match;

    if (pattern.match(/(^|[^\\])\//)) {
        return null;
    }

    pattern = pattern.replace('\\/', '/');

    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}

/**
 * Validates if a string is a valid slash-delimited regex.
 * @param {string} input - A delimited regex string
 * @returns {boolean} Whether this would be a valid regex that can be parsed and executed
 */
export function isValidRegex(input) {
    return parseRegexFromString(input) !== null;
}

/**
 * Tokenizer parsing input and splitting it into keywords and regexes.
 * @param {{_type: string, term: string}} input - The typed input
 * @param {{options: object}} _selection - The selection event object
 * @param {function({id: string, text: string}):void} callback - Callback for each parsed item
 * @returns {{term: string}} - The remaining part that is untokenized in the textbox
 */
export function customTokenizer(input, _selection, callback) {
    let current = input.term;

    let insideRegex = false, regexClosed = false;

    for (let i = 0; i < current.length; i++) {
        const char = current[i];

        if (char === '/' && (i === 0 || current[i - 1] !== '\\')) {
            if (!insideRegex) insideRegex = true;
            else if (!regexClosed) regexClosed = true;
        }

        if (char === ',') {
            const token = current.slice(0, i).trim();

            if (insideRegex && !regexClosed) {
                continue;
            }

            if (token) {
                const isRegex = isValidRegex(token);

                if (token.startsWith('/') && !isRegex) {
                    const tokens = token.split(',').map(x => x.trim());
                    tokens.forEach(x => callback({ id: getOptionId(x), text: x }));
                } else {
                    callback({ id: getOptionId(token), text: token });
                }
            }

            current = current.slice(i + 1);
            insideRegex = false;
            regexClosed = false;
            i = 0;
        }
    }

    return { term: current };
}

/**
 * Splits a given input string that contains one or more keywords or regexes, separated by commas.
 * @param {string} input - One or multiple keywords or regexes, separated by commas
 * @returns {string[]} An array of keywords and regexes
 */
export function splitKeywordsAndRegexes(input) {
    /** @type {string[]} */
    const keywordsAndRegexes = [];

    const addFindCallback = (item) => {
        keywordsAndRegexes.push(item.text);
    };

    const { term } = customTokenizer({ _type: 'custom_call', term: input }, undefined, addFindCallback);
    const finalTerm = term.trim();
    if (finalTerm) {
        addFindCallback({ id: getOptionId(finalTerm), text: finalTerm });
    }

    return keywordsAndRegexes;
}
