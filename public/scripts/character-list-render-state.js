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

function createCharacterDeleteFallback(reason) {
    return {
        mode: 'fallback',
        reason,
    };
}

/**
 * Builds the safe ordinary single-delete reconcile plan for the current page.
 * Complex list states intentionally fall back to the existing full-refresh path.
 * @param {object} options
 * @param {{entities: Array<object>, total: number, keys: string[]}} options.beforeSnapshot
 * @param {{entities: Array<object>, total: number, keys: string[]}} options.afterSnapshot
 * @param {string[]} options.deletedAvatars
 * @param {number} options.currentPage
 * @param {number} options.pageSize
 * @param {boolean} [options.hasActiveFilter]
 * @param {boolean} [options.isBulkEdit]
 * @param {boolean} [options.isBogusFolderOpen]
 * @param {boolean} [options.isPrintPending]
 * @returns {{mode: 'incremental', deletedKeys: string[], pageEntities: Array<object>, requiresIdentitySync: boolean, paginationLabel: string, currentPage: number, pageSize: number}|{mode: 'fallback', reason: string}}
 */
export function createCharacterDeleteReconcilePlan({
    beforeSnapshot,
    afterSnapshot,
    deletedAvatars,
    currentPage,
    pageSize,
    hasActiveFilter = false,
    isBulkEdit = false,
    isBogusFolderOpen = false,
    isPrintPending = false,
}) {
    if (!Array.isArray(deletedAvatars) || deletedAvatars.length !== 1) {
        return createCharacterDeleteFallback('multi-delete');
    }
    if (hasActiveFilter) {
        return createCharacterDeleteFallback('active-filter');
    }
    if (isBulkEdit) {
        return createCharacterDeleteFallback('bulk-edit');
    }
    if (isBogusFolderOpen) {
        return createCharacterDeleteFallback('bogus-folder');
    }
    if (isPrintPending) {
        return createCharacterDeleteFallback('print-pending');
    }

    const deletedKey = `character:${deletedAvatars[0]}`;
    if (!beforeSnapshot?.keys?.includes(deletedKey)) {
        return createCharacterDeleteFallback('missing-before-entity');
    }
    if (afterSnapshot?.keys?.includes(deletedKey)) {
        return createCharacterDeleteFallback('still-present-after-delete');
    }

    const safePageSize = Number(pageSize) || 1;
    const totalPages = Math.max(Math.ceil((afterSnapshot?.total ?? 0) / safePageSize), 1);
    const safeCurrentPage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);
    const pageStart = (safeCurrentPage - 1) * safePageSize;
    const pageEntities = afterSnapshot.entities.slice(pageStart, pageStart + safePageSize);

    return {
        mode: 'incremental',
        deletedKeys: [deletedKey],
        pageEntities,
        requiresIdentitySync: true,
        paginationLabel: getCharacterListPaginationRangeLabel({
            currentPage: safeCurrentPage,
            totalNumber: afterSnapshot.total,
            pageSize: safePageSize,
        }),
        currentPage: safeCurrentPage,
        pageSize: safePageSize,
    };
}

/**
 * Rewrites visible character row identity attributes after array indexes shift.
 * @param {ParentNode|null} container
 * @param {Array<object>} pageEntities
 * @returns {number} Number of visible character rows touched
 */
export function syncCharacterListRowIdentity(container, pageEntities) {
    if (!container) {
        return 0;
    }

    const rows = Array.from(container.querySelectorAll('.character_select'));
    const characterEntities = pageEntities.filter(entity => entity.type === 'character');
    const count = Math.min(rows.length, characterEntities.length);

    for (let index = 0; index < count; index++) {
        const row = rows[index];
        const entityId = characterEntities[index].id;
        row.setAttribute('data-chid', entityId);
        row.setAttribute('chid', entityId);
        row.id = `CharID${entityId}`;
    }

    return count;
}
