export const CHARACTER_LIST_PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100, 250, 500, 1000]);

function normalizeKeyPart(value, fallback) {
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return String(fallback);
}

/**
 * Returns the internal stable key used by character-list render planning.
 * DOM identity stays tied to the current character index for compatibility.
 * @param {object} entity
 * @returns {string}
 */
export function getCharacterListEntityKey(entity) {
    switch (entity?.type) {
        case 'character':
            return `character:${normalizeKeyPart(entity.item?.avatar, entity.id)}`;
        case 'group':
            return `group:${normalizeKeyPart(entity.item?.id, entity.id)}`;
        case 'tag':
            return `tag:${normalizeKeyPart(entity.item?.id, entity.id)}`;
        default:
            return `${normalizeKeyPart(entity?.type, 'unknown')}:${normalizeKeyPart(entity?.id, 'unknown')}`;
    }
}

/**
 * Adds render-planning metadata to the current entity list without changing
 * filtering or sorting semantics.
 * @param {Array<object>} entities
 * @returns {{entities: Array<object>, total: number, keys: string[]}}
 */
export function createCharacterListEntitySnapshot(entities) {
    const snapshotEntities = entities.map((entity, renderIndex) => ({
        ...entity,
        renderIndex,
        renderKey: getCharacterListEntityKey(entity),
    }));

    return {
        entities: snapshotEntities,
        total: snapshotEntities.length,
        keys: snapshotEntities.map(entity => entity.renderKey),
    };
}

/**
 * Formats the pagination navigator range.
 * @param {object} options
 * @param {number} options.currentPage
 * @param {number} options.totalNumber
 * @param {number} options.pageSize
 * @param {number} [options.fallbackTotal]
 * @returns {string}
 */
export function getCharacterListPaginationRangeLabel({ currentPage, totalNumber, pageSize, fallbackTotal = 0 }) {
    const actualTotal = totalNumber || fallbackTotal;
    const currentPageSize = Number(pageSize) || 1;
    const safeCurrentPage = Number(currentPage) || 1;
    const rangeStart = actualTotal > 0 ? (safeCurrentPage - 1) * currentPageSize + 1 : 0;
    const rangeEnd = Math.min(safeCurrentPage * currentPageSize, actualTotal);

    return `${rangeStart}-${rangeEnd} / ${actualTotal}`;
}

/**
 * Describes what the current page callback needs to render.
 * @param {object} options
 * @param {Array<object>} options.pageEntities
 * @param {boolean} [options.includeBackBlock]
 * @param {number} options.totalCharacters
 * @param {number} options.totalGroups
 * @param {boolean} options.hasActiveFilter
 * @returns {{pageEntities: Array<object>, includeBackBlock: boolean, displayCount: number, hiddenCount: number, showEmptyBlock: boolean, showHiddenBlock: boolean}}
 */
export function createCharacterListPageRenderPlan({
    pageEntities,
    includeBackBlock = false,
    totalCharacters,
    totalGroups,
    hasActiveFilter,
}) {
    const displayCount = pageEntities.filter(entity => entity.type === 'character' || entity.type === 'group').length;
    const hiddenCount = (totalCharacters + totalGroups) - displayCount;

    return {
        pageEntities,
        includeBackBlock,
        displayCount,
        hiddenCount,
        showEmptyBlock: pageEntities.length === 0,
        showHiddenBlock: hiddenCount > 0 && hasActiveFilter,
    };
}
