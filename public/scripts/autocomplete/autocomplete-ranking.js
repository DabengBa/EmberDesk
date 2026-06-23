export const DEFAULT_SLASH_COMMAND_RESULT_LIMIT = 12;

function getOptionName(option) {
    return String(option?.name ?? '').toLowerCase();
}

function getFuzzyScore(name, query) {
    const normalizedName = String(name ?? '').toLowerCase();
    const normalizedQuery = String(query ?? '').toLowerCase();
    let queryIndex = 0;
    let start = Number.POSITIVE_INFINITY;
    let end = Number.POSITIVE_INFINITY;
    let currentRun = 0;
    let longestRun = 0;

    for (let nameIndex = 0; nameIndex < normalizedName.length && queryIndex < normalizedQuery.length; nameIndex++) {
        if (normalizedName[nameIndex] !== normalizedQuery[queryIndex]) {
            currentRun = 0;
            continue;
        }

        if (start === Number.POSITIVE_INFINITY) {
            start = nameIndex;
        }
        end = nameIndex;
        queryIndex++;
        currentRun++;
        longestRun = Math.max(longestRun, currentRun);
    }

    return {
        isMatch: queryIndex === normalizedQuery.length,
        start,
        span: end - start,
        longestRun,
    };
}

function compareFallbackFuzzy(a, b, query) {
    const scoreA = getFuzzyScore(getOptionName(a), query);
    const scoreB = getFuzzyScore(getOptionName(b), query);

    if (scoreA.isMatch !== scoreB.isMatch) {
        return scoreA.isMatch ? -1 : 1;
    }
    if (scoreA.start !== scoreB.start) {
        return scoreA.start - scoreB.start;
    }
    if (scoreA.longestRun !== scoreB.longestRun) {
        return scoreB.longestRun - scoreA.longestRun;
    }
    if (scoreA.span !== scoreB.span) {
        return scoreA.span - scoreB.span;
    }
    return 0;
}

export function getAutocompleteMatchRank(option, query = '') {
    const normalizedQuery = String(query ?? '').trim().toLowerCase();
    const optionName = getOptionName(option);

    if (!normalizedQuery) {
        return 0;
    }
    if (optionName === normalizedQuery) {
        return 0;
    }
    if (optionName.startsWith(normalizedQuery)) {
        return 1;
    }
    if (optionName.includes(normalizedQuery)) {
        return 2;
    }
    return 3;
}

export function sortAutocompleteResults(options, {
    query = '',
    matchType = 'strict',
    fuzzyCompare,
} = {}) {
    return options
        .map((option, index) => ({ option, index }))
        .sort((aEntry, bEntry) => {
            const a = aEntry.option;
            const b = bEntry.option;
            const priorityA = a.sortPriority ?? 100;
            const priorityB = b.sortPriority ?? 100;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            const rankA = getAutocompleteMatchRank(a, query);
            const rankB = getAutocompleteMatchRank(b, query);
            if (rankA !== rankB) {
                return rankA - rankB;
            }

            if (rankA > 2 && matchType === 'fuzzy' && typeof fuzzyCompare === 'function') {
                return fuzzyCompare(a, b);
            }
            if (rankA > 2 && matchType === 'fuzzy') {
                const fuzzyOrder = compareFallbackFuzzy(a, b, query);
                if (fuzzyOrder !== 0) {
                    return fuzzyOrder;
                }
            }

            return aEntry.index - bEntry.index;
        })
        .map(entry => entry.option);
}

export function limitAutocompleteResults(options, {
    query = '',
    isSlashCommand = false,
    limit = DEFAULT_SLASH_COMMAND_RESULT_LIMIT,
} = {}) {
    const normalizedQuery = String(query ?? '').trim();
    if (!isSlashCommand || normalizedQuery) {
        return options;
    }

    return options.slice(0, limit);
}
