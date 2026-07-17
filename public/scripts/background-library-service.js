/**
 * Stateful Background Library session: catalog, filter/sort, selection, lock,
 * upload/rename/delete, folders, and React panel snapshots.
 * Framework-neutral; no gallery DOM or React dependency.
 */

import {
    BG_METADATA_KEY,
    BG_SORT_OPTIONS,
    LIST_METADATA_KEY,
    buildBackgroundGalleryItems,
    buildBackgroundLibraryReactPanelState,
    generateUrlParameter,
    getBackgroundPath,
    resolveReplacementFilename,
} from './background-domain.js';

/**
 * @typedef {object} BackgroundLibrarySessionDeps
 * @property {() => ({name?: string, url?: string, sortOrder?: string, animation?: boolean, fitting?: string, thumbnailColumns?: number})} getSettings
 * @property {(next: object) => void} setSettings
 * @property {() => Promise<void>|void} [saveSettings]
 * @property {() => void} [saveSettingsDebounced]
 * @property {() => object} getChatMetadata
 * @property {(key: string, value: any) => void} setChatMetadataValue
 * @property {(key: string) => void} deleteChatMetadataValue
 * @property {() => Promise<void>|void} [saveMetadata]
 * @property {() => void} [saveMetadataDebounced]
 * @property {() => string|null|undefined} [getCurrentChatId]
 * @property {() => Promise<{images?: Array<{filename: string, isAnimated?: boolean}>, config?: object}>} fetchSystemCatalog
 * @property {() => Promise<{folders?: Array, imageFolderMap?: Record<string, string[]>}>} [fetchFolders]
 * @property {() => Promise<{images?: Record<string, object>}>} [fetchImageMetadata]
 * @property {(filename: string) => Promise<void>} [deleteSystemBackground]
 * @property {(oldBg: string, newBg: string) => Promise<void>} [renameSystemBackground]
 * @property {(formData: any) => Promise<{path?: string}|void>} [uploadSystemBackground]
 * @property {(formData: any) => Promise<{path?: string}|void>} [uploadChatBackground]
 * @property {(path: string) => Promise<void>} [deleteMediaFromServer]
 * @property {(prompt: string) => Promise<string>} [generateQuietPrompt]
 * @property {(url: string) => void} [onVisualBackgroundChange]
 * @property {(a: string, b: string) => number} [compareNames]
 */

/**
 * @param {BackgroundLibrarySessionDeps} deps
 */
export function createBackgroundLibrarySession(deps) {
    if (!deps || typeof deps.getSettings !== 'function' || typeof deps.setSettings !== 'function') {
        throw new Error('createBackgroundLibrarySession requires getSettings and setSettings');
    }
    if (typeof deps.getChatMetadata !== 'function'
        || typeof deps.setChatMetadataValue !== 'function'
        || typeof deps.deleteChatMetadataValue !== 'function') {
        throw new Error('createBackgroundLibrarySession requires chat metadata accessors');
    }
    if (typeof deps.fetchSystemCatalog !== 'function') {
        throw new Error('createBackgroundLibrarySession requires fetchSystemCatalog');
    }

    /** @type {Array<{filename: string, isAnimated?: boolean}>} */
    let systemBackgrounds = [];
    /** @type {Array<{id: string, name: string, thumbnailFile?: string}>} */
    let folders = [];
    /** @type {Record<string, string[]>} */
    let imageFolderMap = {};
    /** @type {Map<string, object>} */
    let metadataCache = new Map();
    /** @type {string|null} */
    let activeFolderId = null;
    let filterQuery = '';
    let isLoading = false;
    /** @type {unknown} */
    let error = null;
    /** @type {Set<string>} */
    const selectedSystemBackgroundFiles = new Set();
    let isBackgroundSelectionMode = false;
    /** @type {object|null} */
    let thumbnailConfig = null;

    function getDeps() {
        return deps;
    }

    function getSettings() {
        return deps.getSettings() || {};
    }

    function getChatMetadata() {
        return deps.getChatMetadata() || {};
    }

    function getChatBackgroundList() {
        const metadata = getChatMetadata();
        return Array.isArray(metadata[LIST_METADATA_KEY]) ? [...metadata[LIST_METADATA_KEY]] : [];
    }

    function getLockedUrl() {
        return getChatMetadata()[BG_METADATA_KEY] || '';
    }

    function getTimestamp(filename, isCustom) {
        const key = isCustom ? filename : `backgrounds/${filename}`;
        return metadataCache.get(key)?.addedTimestamp ?? 0;
    }

    function compareNames(a, b) {
        if (typeof deps.compareNames === 'function') {
            return deps.compareNames(a, b);
        }
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    }

    function persistSettings(immediate = false) {
        if (immediate && typeof deps.saveSettings === 'function') {
            return deps.saveSettings();
        }
        if (typeof deps.saveSettingsDebounced === 'function') {
            deps.saveSettingsDebounced();
            return;
        }
        if (typeof deps.saveSettings === 'function') {
            return deps.saveSettings();
        }
    }

    function persistMetadata(immediate = false) {
        if (immediate && typeof deps.saveMetadata === 'function') {
            return deps.saveMetadata();
        }
        if (typeof deps.saveMetadataDebounced === 'function') {
            deps.saveMetadataDebounced();
            return;
        }
        if (typeof deps.saveMetadata === 'function') {
            return deps.saveMetadata();
        }
    }

    function applyVisualBackground(url) {
        if (typeof deps.onVisualBackgroundChange === 'function') {
            deps.onVisualBackgroundChange(url || 'none');
        }
    }

    function buildGalleryProjection() {
        const settings = getSettings();
        return buildBackgroundGalleryItems(systemBackgrounds, getChatBackgroundList(), {
            selectedName: settings.name || '',
            lockedUrl: getLockedUrl(),
            sortOrder: settings.sortOrder || BG_SORT_OPTIONS.AZ,
            filterQuery,
            activeFolderId,
            imageFolderMap,
            getTimestamp,
            compareNames,
        });
    }

    function getSnapshot() {
        const settings = getSettings();
        const gallery = buildGalleryProjection();
        return {
            isLoading,
            error,
            filterQuery,
            sortOrder: settings.sortOrder || BG_SORT_OPTIONS.AZ,
            activeFolderId,
            folders: [...folders],
            imageFolderMap: { ...imageFolderMap },
            systemBackgrounds: systemBackgrounds.map(item => ({ ...item })),
            chatBackgrounds: getChatBackgroundList(),
            selectedName: settings.name || '',
            selectedUrl: settings.url || '',
            lockedUrl: getLockedUrl(),
            selectedSystemBackgroundFiles: [...selectedSystemBackgroundFiles],
            isBackgroundSelectionMode,
            systemGalleryItems: gallery.system,
            chatGalleryItems: gallery.chat,
            thumbnailConfig,
        };
    }

    function getReactPanelState(meta = {}) {
        return buildBackgroundLibraryReactPanelState(getSnapshot(), meta);
    }

    function applyFilter(nextQuery) {
        filterQuery = String(nextQuery ?? '');
        return { ok: true, filterQuery };
    }

    function applySort(sortValue) {
        const normalized = String(sortValue ?? BG_SORT_OPTIONS.AZ);
        deps.setSettings({ ...getSettings(), sortOrder: normalized });
        persistSettings(false);
        return { ok: true, sortOrder: normalized };
    }

    function enterFolder(folderId) {
        const folder = folders.find(item => item.id === folderId);
        if (!folder) {
            return { ok: false, reason: 'folder-not-found' };
        }
        selectedSystemBackgroundFiles.clear();
        activeFolderId = folderId;
        return { ok: true, activeFolderId };
    }

    function exitFolder() {
        selectedSystemBackgroundFiles.clear();
        activeFolderId = null;
        return { ok: true, activeFolderId: null };
    }

    function hydrateCatalog({
        images = null,
        folders: nextFolders = null,
        imageFolderMap: nextMap = null,
        metadata = null,
        config = null,
        isLoading: nextLoading = null,
        error: nextError = null,
        filterQuery: nextFilter = null,
        activeFolderId: nextFolderId = undefined,
    } = {}) {
        if (Array.isArray(images)) {
            systemBackgrounds = images.map(item => ({
                filename: item.filename,
                isAnimated: Boolean(item.isAnimated),
            }));
        }
        if (Array.isArray(nextFolders)) {
            folders = nextFolders.map(item => ({ ...item }));
        }
        if (nextMap && typeof nextMap === 'object') {
            imageFolderMap = { ...nextMap };
        }
        if (metadata && typeof metadata === 'object') {
            metadataCache = new Map(Object.entries(metadata));
        }
        if (config) {
            thumbnailConfig = config;
        }
        if (nextLoading !== null) {
            isLoading = Boolean(nextLoading);
        }
        if (nextError !== undefined) {
            error = nextError;
        }
        if (nextFilter !== null) {
            filterQuery = String(nextFilter ?? '');
        }
        if (nextFolderId !== undefined) {
            activeFolderId = nextFolderId;
        }

        const existing = new Set(systemBackgrounds.map(item => item.filename));
        for (const selected of [...selectedSystemBackgroundFiles]) {
            if (!existing.has(selected)) {
                selectedSystemBackgroundFiles.delete(selected);
            }
        }
        if (activeFolderId && !folders.some(folder => folder.id === activeFolderId)) {
            activeFolderId = null;
        }
        return getSnapshot();
    }

    async function loadCatalog() {
        isLoading = true;
        error = null;
        try {
            const catalog = await deps.fetchSystemCatalog();
            systemBackgrounds = Array.isArray(catalog?.images)
                ? catalog.images.map(item => ({
                    filename: item.filename,
                    isAnimated: Boolean(item.isAnimated),
                }))
                : [];
            thumbnailConfig = catalog?.config ?? thumbnailConfig;

            if (typeof deps.fetchFolders === 'function') {
                const folderPayload = await deps.fetchFolders();
                folders = Array.isArray(folderPayload?.folders) ? folderPayload.folders : [];
                imageFolderMap = folderPayload?.imageFolderMap && typeof folderPayload.imageFolderMap === 'object'
                    ? { ...folderPayload.imageFolderMap }
                    : {};
            }

            if (typeof deps.fetchImageMetadata === 'function') {
                const metadataPayload = await deps.fetchImageMetadata();
                metadataCache = new Map();
                if (metadataPayload?.images && typeof metadataPayload.images === 'object') {
                    for (const [pathKey, value] of Object.entries(metadataPayload.images)) {
                        metadataCache.set(pathKey, value);
                    }
                }
            }

            const existing = new Set(systemBackgrounds.map(item => item.filename));
            for (const selected of [...selectedSystemBackgroundFiles]) {
                if (!existing.has(selected)) {
                    selectedSystemBackgroundFiles.delete(selected);
                }
            }

            if (activeFolderId && !folders.some(folder => folder.id === activeFolderId)) {
                activeFolderId = null;
            }

            isLoading = false;
            return { ok: true, snapshot: getSnapshot() };
        } catch (loadError) {
            error = loadError;
            isLoading = false;
            return { ok: false, error: loadError, snapshot: getSnapshot() };
        }
    }

    async function refresh() {
        return loadCatalog();
    }

    async function setBackground(filename, url) {
        const nextUrl = url || generateUrlParameter(filename, false);
        deps.setSettings({
            ...getSettings(),
            name: filename,
            url: nextUrl,
        });
        if (!getLockedUrl()) {
            applyVisualBackground(nextUrl);
        }
        await persistSettings(false);
        return { ok: true, name: filename, url: nextUrl };
    }

    function lockBackgroundUrl(url) {
        if (typeof deps.getCurrentChatId === 'function' && !deps.getCurrentChatId()) {
            return { ok: false, reason: 'no-chat' };
        }
        const urlToLock = url || getSettings().url || '';
        deps.setChatMetadataValue(BG_METADATA_KEY, urlToLock);
        applyVisualBackground(urlToLock);
        persistMetadata(false);
        return { ok: true, lockedUrl: urlToLock };
    }

    function lockCurrentBackground() {
        return lockBackgroundUrl(getSettings().url || '');
    }

    function unlockCurrentBackground() {
        deps.deleteChatMetadataValue(BG_METADATA_KEY);
        applyVisualBackground(getSettings().url || 'none');
        persistMetadata(false);
        return { ok: true };
    }

    async function selectBackground(backgroundId, source = 'global', { shiftKey = false } = {}) {
        const filename = String(backgroundId ?? '');
        if (!filename) {
            return { ok: false, reason: 'missing-id' };
        }

        const isCustom = source === 'chat';
        if (isBackgroundSelectionMode && !isCustom && !shiftKey) {
            if (selectedSystemBackgroundFiles.has(filename)) {
                selectedSystemBackgroundFiles.delete(filename);
            } else {
                selectedSystemBackgroundFiles.add(filename);
            }
            return { ok: true, groupSelection: true, selected: [...selectedSystemBackgroundFiles] };
        }

        const url = generateUrlParameter(filename, isCustom);
        const locked = Boolean(getLockedUrl());
        const bypassGlobalLock = !isCustom && shiftKey;

        if ((locked || isCustom) && !bypassGlobalLock) {
            deps.setChatMetadataValue(BG_METADATA_KEY, url);
            applyVisualBackground(url);
            persistMetadata(false);
            return { ok: true, locked: true, name: filename, url };
        }

        await setBackground(filename, url);
        return { ok: true, locked: false, name: filename, url };
    }

    async function uploadBackground(formData, { source = 'global' } = {}) {
        try {
            if (source === 'chat') {
                if (typeof deps.uploadChatBackground !== 'function') {
                    return { ok: false, reason: 'upload-chat-unavailable' };
                }
                const result = await deps.uploadChatBackground(formData);
                const path = result?.path || String(formData?.filename || formData?.get?.('filename') || '');
                if (path) {
                    const list = getChatBackgroundList();
                    if (!list.includes(path)) {
                        list.push(path);
                        deps.setChatMetadataValue(LIST_METADATA_KEY, list);
                        await persistMetadata(true);
                    }
                }
                return { ok: true, path, source: 'chat' };
            }

            if (typeof deps.uploadSystemBackground !== 'function') {
                return { ok: false, reason: 'upload-system-unavailable' };
            }
            const result = await deps.uploadSystemBackground(formData);
            const path = result?.path || String(formData?.filename || formData?.get?.('filename') || '');
            if (path && !systemBackgrounds.some(item => item.filename === path)) {
                systemBackgrounds.push({ filename: path, isAnimated: false });
            }
            if (path) {
                await setBackground(path, generateUrlParameter(path, false));
            }
            return { ok: true, path, source: 'global' };
        } catch (uploadError) {
            error = uploadError;
            return { ok: false, error: uploadError };
        }
    }

    async function renameBackground(oldFilename, newFilename, { source = 'global' } = {}) {
        const oldBg = String(oldFilename ?? '');
        const newBg = String(newFilename ?? '');
        if (!oldBg || !newBg || oldBg === newBg) {
            return { ok: false, reason: 'invalid-rename' };
        }

        try {
            const settings = getSettings();
            const oldUrl = generateUrlParameter(oldBg, source === 'chat');
            const newUrl = generateUrlParameter(newBg, source === 'chat');
            const renamesGlobal = settings.name === oldBg;
            const renamesChatLock = getLockedUrl() === oldUrl;

            if (source === 'chat') {
                const list = getChatBackgroundList();
                const index = list.indexOf(oldBg);
                if (index !== -1) {
                    list[index] = newBg;
                    deps.setChatMetadataValue(LIST_METADATA_KEY, list);
                }
            } else {
                if (typeof deps.renameSystemBackground !== 'function') {
                    return { ok: false, reason: 'rename-unavailable' };
                }
                await deps.renameSystemBackground(oldBg, newBg);
                const found = systemBackgrounds.find(item => item.filename === oldBg);
                if (found) {
                    found.filename = newBg;
                }
                if (imageFolderMap[oldBg]) {
                    imageFolderMap[newBg] = imageFolderMap[oldBg];
                    delete imageFolderMap[oldBg];
                }
                for (const folder of folders) {
                    if (folder.thumbnailFile === oldBg) {
                        folder.thumbnailFile = newBg;
                    }
                }
            }

            if (renamesGlobal) {
                deps.setSettings({ ...getSettings(), name: newBg, url: newUrl });
                if (!getLockedUrl() || renamesChatLock) {
                    applyVisualBackground(newUrl);
                }
                await persistSettings(true);
            }
            if (renamesChatLock) {
                deps.setChatMetadataValue(BG_METADATA_KEY, newUrl);
                applyVisualBackground(newUrl);
                await persistMetadata(true);
            }

            return { ok: true, oldBg, newBg, url: newUrl };
        } catch (renameError) {
            error = renameError;
            return { ok: false, error: renameError };
        }
    }

    async function deleteBackground(filename, { source = 'global', deleteFromServer = false } = {}) {
        const bg = String(filename ?? '');
        if (!bg) {
            return { ok: false, reason: 'missing-id' };
        }

        const previousSystem = systemBackgrounds.map(item => ({ ...item }));
        const previousChat = getChatBackgroundList();
        const previousSettings = { ...getSettings() };
        const previousLock = getLockedUrl();
        const previousFolders = folders.map(item => ({ ...item }));
        const previousMap = { ...imageFolderMap };

        try {
            const url = generateUrlParameter(bg, source === 'chat');
            const deletesGlobalSelection = previousSettings.name === bg;
            const deletesChatSelection = previousLock === url;
            const systemNames = systemBackgrounds.map(item => item.filename);
            const replacement = deletesGlobalSelection
                ? resolveReplacementFilename(systemNames, bg)
                : null;

            if (source === 'chat') {
                const list = previousChat.filter(item => item !== bg);
                deps.setChatMetadataValue(LIST_METADATA_KEY, list);
            } else {
                if (typeof deps.deleteSystemBackground !== 'function') {
                    return { ok: false, reason: 'delete-unavailable' };
                }
                await deps.deleteSystemBackground(bg);
                systemBackgrounds = systemBackgrounds.filter(item => item.filename !== bg);
                selectedSystemBackgroundFiles.delete(bg);
                if (imageFolderMap[bg]) {
                    delete imageFolderMap[bg];
                }
                for (const folder of folders) {
                    if (folder.thumbnailFile === bg) {
                        folder.thumbnailFile = '';
                    }
                }
            }

            if (deletesChatSelection) {
                deps.deleteChatMetadataValue(BG_METADATA_KEY);
            }

            if (deletesGlobalSelection) {
                if (replacement) {
                    const replacementUrl = generateUrlParameter(replacement, false);
                    deps.setSettings({ ...getSettings(), name: replacement, url: replacementUrl });
                    if (!getLockedUrl()) {
                        applyVisualBackground(replacementUrl);
                    }
                } else {
                    deps.setSettings({ ...getSettings(), name: '', url: '' });
                    applyVisualBackground('none');
                }
                await persistSettings(true);
            } else if (deletesChatSelection) {
                applyVisualBackground(getSettings().url || 'none');
            }

            if (deletesChatSelection || source === 'chat') {
                await persistMetadata(true);
            }

            if (source === 'chat' && deleteFromServer && typeof deps.deleteMediaFromServer === 'function') {
                await deps.deleteMediaFromServer(bg);
            }

            return {
                ok: true,
                deleted: bg,
                replacement,
                selectedName: getSettings().name || '',
            };
        } catch (deleteError) {
            systemBackgrounds = previousSystem;
            folders = previousFolders;
            imageFolderMap = previousMap;
            deps.setSettings(previousSettings);
            deps.setChatMetadataValue(LIST_METADATA_KEY, previousChat);
            if (previousLock) {
                deps.setChatMetadataValue(BG_METADATA_KEY, previousLock);
            } else {
                deps.deleteChatMetadataValue(BG_METADATA_KEY);
            }
            error = deleteError;
            return { ok: false, error: deleteError, snapshot: getSnapshot() };
        }
    }

    async function runAutoBackgroundSelection() {
        const titles = systemBackgrounds
            .map(item => item.filename)
            .filter(Boolean);
        if (!titles.length) {
            return { ok: false, reason: 'empty-catalog' };
        }
        if (typeof deps.generateQuietPrompt !== 'function') {
            return { ok: false, reason: 'prompt-unavailable' };
        }

        const prompt = `Ignore previous instructions and choose a location ONLY from the provided list that is the most suitable for the current scene. Do not output any other text:\n${titles.join(', ')}`;
        const answer = String(await deps.generateQuietPrompt(prompt) || '').trim();
        const match = systemBackgrounds.find(item => {
            const title = item.filename.replace(/\.[^.]+$/, '');
            return answer.includes(title) || answer.includes(item.filename);
        });
        if (!match) {
            return { ok: false, reason: 'no-match', answer };
        }
        return selectBackground(match.filename, 'global');
    }

    function setBackgroundSelectionMode(enabled) {
        isBackgroundSelectionMode = Boolean(enabled);
        if (!isBackgroundSelectionMode) {
            selectedSystemBackgroundFiles.clear();
        }
        return { ok: true, isBackgroundSelectionMode };
    }

    return {
        getDeps,
        getSnapshot,
        getReactPanelState,
        hydrateCatalog,
        loadCatalog,
        refresh,
        applyFilter,
        applySort,
        enterFolder,
        exitFolder,
        selectBackground,
        setBackground,
        lockCurrentBackground,
        lockBackgroundUrl,
        unlockCurrentBackground,
        uploadBackground,
        renameBackground,
        deleteBackground,
        runAutoBackgroundSelection,
        setBackgroundSelectionMode,
        getBackgroundPath,
        generateUrlParameter,
    };
}
