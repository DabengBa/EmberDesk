/**
 * Framework-neutral Background Library domain helpers.
 * Pure projection, sorting, filtering, and URL identity — no DOM or React.
 */

/**
 * Background sorting options.
 * @readonly
 * @enum {string}
 */
export const BG_SORT_OPTIONS = Object.freeze({
    AZ: 'az',
    ZA: 'za',
    NEWEST: 'newest',
    OLDEST: 'oldest',
});

/**
 * Background source types.
 * @readonly
 * @enum {number}
 */
export const BG_SOURCES = Object.freeze({
    GLOBAL: 0,
    CHAT: 1,
});

export const BG_METADATA_KEY = 'custom_background';
export const LIST_METADATA_KEY = 'chat_backgrounds';

export const ANIMATED_BACKGROUND_EXTENSIONS = Object.freeze(['mp4', 'webp', 'gif', 'apng']);

/**
 * @param {string} fileUrl
 * @returns {string}
 */
export function getBackgroundPath(fileUrl) {
    return `backgrounds/${encodeURIComponent(fileUrl)}`;
}

/**
 * @param {string} file
 * @returns {string}
 */
export function getBackgroundRelativePath(file) {
    return `backgrounds/${file}`;
}

/**
 * @param {string} bg
 * @param {boolean} isCustom
 * @returns {string}
 */
export function generateUrlParameter(bg, isCustom) {
    return isCustom ? `url("${encodeURI(bg)}")` : `url("${getBackgroundPath(bg)}")`;
}

/**
 * @param {string} fileName
 * @returns {boolean}
 */
export function isAnimatedBackgroundExtension(fileName) {
    const fileExtension = String(fileName || '').split('.').pop()?.toLowerCase() ?? '';
    return ANIMATED_BACKGROUND_EXTENSIONS.includes(fileExtension);
}

/**
 * @param {string} fileUrl
 * @param {string[]} customBackgrounds
 * @returns {boolean}
 */
export function isCustomBackgroundUrl(fileUrl, customBackgrounds = []) {
    return (Array.isArray(customBackgrounds) ? customBackgrounds : []).some(
        bg => bg === fileUrl || generateUrlParameter(bg, true) === fileUrl,
    );
}

/**
 * @param {string} title
 * @returns {string}
 */
export function getFriendlyBackgroundTitle(title) {
    const raw = String(title || '');
    const lastDot = raw.lastIndexOf('.');
    if (lastDot <= 0) {
        return raw;
    }
    return raw.slice(0, lastDot);
}

/**
 * @param {string[]} backgrounds
 * @param {{sortOrder?: string, getTimestamp?: (filename: string, isCustom: boolean) => number, isCustom?: boolean, compareNames?: (a: string, b: string) => number}} [options]
 * @returns {string[]}
 */
export function sortBackgrounds(backgrounds, options = {}) {
    const list = Array.isArray(backgrounds) ? [...backgrounds] : [];
    const sortOrder = options.sortOrder || BG_SORT_OPTIONS.AZ;
    const isCustom = Boolean(options.isCustom);
    const compareNames = typeof options.compareNames === 'function'
        ? options.compareNames
        : (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    const getTimestamp = typeof options.getTimestamp === 'function'
        ? options.getTimestamp
        : () => 0;

    return list.sort((a, b) => {
        switch (sortOrder) {
            case BG_SORT_OPTIONS.AZ:
                return compareNames(a, b);
            case BG_SORT_OPTIONS.ZA:
                return compareNames(b, a);
            case BG_SORT_OPTIONS.NEWEST:
            case BG_SORT_OPTIONS.OLDEST: {
                const timestampA = getTimestamp(a, isCustom) ?? 0;
                const timestampB = getTimestamp(b, isCustom) ?? 0;
                return sortOrder === BG_SORT_OPTIONS.NEWEST
                    ? timestampB - timestampA
                    : timestampA - timestampB;
            }
            default:
                return 0;
        }
    });
}

/**
 * @param {Array<{filename?: string, title?: string}>} items
 * @param {string} filterQuery
 * @returns {Array}
 */
export function filterBackgroundTitles(items, filterQuery) {
    const query = String(filterQuery ?? '').trim().toLowerCase();
    const list = Array.isArray(items) ? items : [];
    if (!query) {
        return [...list];
    }

    return list.filter(item => {
        const title = String(item?.title ?? item?.filename ?? '');
        return title.toLowerCase().includes(query);
    });
}

/**
 * @param {Array<{filename: string, isAnimated?: boolean}>} systemBackgrounds
 * @param {string|null} activeFolderId
 * @param {Record<string, string[]>} imageFolderMap
 * @returns {Array<{filename: string, isAnimated?: boolean}>}
 */
export function getFilteredImagesByFolder(systemBackgrounds, activeFolderId, imageFolderMap = {}) {
    const list = Array.isArray(systemBackgrounds) ? systemBackgrounds : [];
    if (!activeFolderId) {
        return [...list];
    }

    return list.filter(img => {
        const folderIds = imageFolderMap?.[img.filename];
        return Array.isArray(folderIds) && folderIds.includes(activeFolderId);
    });
}

/**
 * Prefer next sibling, then previous, then any other system background.
 * @param {string[]} filenames
 * @param {string} deletedFilename
 * @returns {string|null}
 */
export function resolveReplacementFilename(filenames, deletedFilename) {
    const list = Array.isArray(filenames) ? filenames.filter(Boolean) : [];
    const index = list.indexOf(deletedFilename);
    if (index === -1) {
        return list[0] ?? null;
    }
    if (list[index + 1]) {
        return list[index + 1];
    }
    if (list[index - 1]) {
        return list[index - 1];
    }
    return null;
}

/**
 * @param {{filename: string, isCustom?: boolean, isAnimated?: boolean, url?: string, selected?: boolean, locked?: boolean}} item
 * @returns {{id: string, title: string, url: string, isCustom: boolean, animated: boolean, selected: boolean, locked: boolean}}
 */
export function buildBackgroundGalleryItem(item) {
    const filename = String(item?.filename ?? '');
    const isCustom = Boolean(item?.isCustom);
    const titleSource = isCustom ? filename.split('/').pop() : filename;
    return {
        id: filename,
        title: getFriendlyBackgroundTitle(titleSource),
        url: item?.url ?? generateUrlParameter(filename, isCustom),
        isCustom,
        animated: Boolean(item?.isAnimated ?? item?.animated),
        selected: Boolean(item?.selected),
        locked: Boolean(item?.locked),
    };
}

/**
 * @param {Array<{filename: string, isAnimated?: boolean}>} systemBackgrounds
 * @param {string[]} chatBackgrounds
 * @param {{
 *   selectedName?: string,
 *   lockedUrl?: string,
 *   sortOrder?: string,
 *   filterQuery?: string,
 *   activeFolderId?: string|null,
 *   imageFolderMap?: Record<string, string[]>,
 *   getTimestamp?: (filename: string, isCustom: boolean) => number,
 *   compareNames?: (a: string, b: string) => number,
 * }} [options]
 */
export function buildBackgroundGalleryItems(systemBackgrounds, chatBackgrounds, options = {}) {
    const selectedName = String(options.selectedName ?? '');
    const lockedUrl = String(options.lockedUrl ?? '');
    const sortOrder = options.sortOrder || BG_SORT_OPTIONS.AZ;
    const filterQuery = String(options.filterQuery ?? '');
    const activeFolderId = options.activeFolderId ?? null;
    const imageFolderMap = options.imageFolderMap ?? {};

    const filteredSystem = getFilteredImagesByFolder(systemBackgrounds, activeFolderId, imageFolderMap);
    const systemFilenames = sortBackgrounds(
        filteredSystem.map(item => item.filename),
        {
            sortOrder,
            isCustom: false,
            getTimestamp: options.getTimestamp,
            compareNames: options.compareNames,
        },
    );
    const chatFilenames = sortBackgrounds(
        Array.isArray(chatBackgrounds) ? chatBackgrounds : [],
        {
            sortOrder,
            isCustom: true,
            getTimestamp: options.getTimestamp,
            compareNames: options.compareNames,
        },
    );

    const systemMeta = new Map(filteredSystem.map(item => [item.filename, item]));
    const systemItems = filterBackgroundTitles(
        systemFilenames.map(filename => {
            const meta = systemMeta.get(filename) || { filename, isAnimated: false };
            const url = generateUrlParameter(filename, false);
            return buildBackgroundGalleryItem({
                filename,
                isCustom: false,
                isAnimated: meta.isAnimated,
                url,
                selected: selectedName === filename,
                locked: Boolean(lockedUrl) && lockedUrl === url,
            });
        }),
        filterQuery,
    );

    const chatItems = filterBackgroundTitles(
        chatFilenames.map(filename => {
            const url = generateUrlParameter(filename, true);
            return buildBackgroundGalleryItem({
                filename,
                isCustom: true,
                isAnimated: isAnimatedBackgroundExtension(filename),
                url,
                selected: selectedName === filename,
                locked: Boolean(lockedUrl) && lockedUrl === url,
            });
        }),
        filterQuery,
    );

    return {
        system: systemItems,
        chat: chatItems,
    };
}

/**
 * @param {{
 *   isLoading?: boolean,
 *   error?: unknown,
 *   systemItemCount?: number,
 *   chatItemCount?: number,
 *   disabled?: boolean,
 * }} state
 */
export function getBackgroundLibraryPanelStatus(state = {}) {
    if (state.disabled) {
        return { status: 'disabled', showLoading: false, showEmpty: false, showError: false };
    }
    if (state.error) {
        return { status: 'error', showLoading: false, showEmpty: false, showError: true };
    }
    if (state.isLoading) {
        return { status: 'loading', showLoading: true, showEmpty: false, showError: false };
    }
    const itemCount = (state.systemItemCount ?? 0) + (state.chatItemCount ?? 0);
    if (itemCount === 0) {
        return { status: 'empty', showLoading: false, showEmpty: true, showError: false };
    }
    return { status: 'success', showLoading: false, showEmpty: false, showError: false };
}

/**
 * Build React panel state from a service snapshot without reading gallery DOM.
 * @param {object} snapshot
 * @param {object} [meta]
 */
export function buildBackgroundLibraryReactPanelState(snapshot, meta = {}) {
    const systemBackgrounds = Array.isArray(snapshot?.systemGalleryItems)
        ? snapshot.systemGalleryItems
        : Array.isArray(meta.systemBackgrounds)
            ? meta.systemBackgrounds
            : [];
    const chatBackgrounds = Array.isArray(snapshot?.chatGalleryItems)
        ? snapshot.chatGalleryItems
        : Array.isArray(meta.chatBackgrounds)
            ? meta.chatBackgrounds
            : [];
    const panelStatus = getBackgroundLibraryPanelStatus({
        isLoading: Boolean(snapshot?.isLoading ?? meta.isLoading),
        error: snapshot?.error ?? meta.error ?? null,
        systemItemCount: systemBackgrounds.length,
        chatItemCount: chatBackgrounds.length,
        disabled: Boolean(meta.disabled),
    });

    return {
        ...panelStatus,
        systemContainerPresent: meta.systemContainerPresent ?? true,
        chatContainerPresent: meta.chatContainerPresent ?? true,
        systemItemCount: systemBackgrounds.length,
        chatItemCount: chatBackgrounds.length,
        refreshQueued: Boolean(meta.refreshQueued),
        systemBackgrounds,
        chatBackgrounds,
        filterQuery: String(snapshot?.filterQuery ?? meta.filterQuery ?? ''),
        sortValue: String(snapshot?.sortOrder ?? meta.sortValue ?? BG_SORT_OPTIONS.AZ),
        folderViewActive: Boolean(snapshot?.activeFolderId),
        lockedCount: systemBackgrounds.filter(item => item.locked).length
            + chatBackgrounds.filter(item => item.locked).length,
        selectedCount: systemBackgrounds.filter(item => item.selected).length
            + chatBackgrounds.filter(item => item.selected).length,
        activeFolderId: snapshot?.activeFolderId ?? null,
        folders: Array.isArray(snapshot?.folders) ? snapshot.folders : [],
    };
}
