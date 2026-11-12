import { download, debounce, parseJsonFile, extractDataFromPng, getFileBuffer, getCharaFilename, select2ChoiceClickSubscribe, getSanitizedFilename, checkOverwriteExistingData, equalsIgnoreCaseAndAccents, normalizeArray, addLongPressEvent, escapeHtml } from './utils.js';
import { isMobile } from './RossAscends-mods.js';
import { FILTER_TYPES, FilterHelper } from './filters.js';
import { debounce_timeout } from './constants.js';
import { callGenericPopup, Popup, POPUP_TYPE } from './popup.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';
import { renderTemplateAsync } from './templates.js';
import { t, translate } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { buildWorldInfoReplayState } from './deferred-panel-replays.js';
import { ensurePanel } from './deferred-panels.js';
import { showLocalDialog, beginLocalDialogOperation } from './local-dialogs.js';
import { convertCharacterBook } from './world-info-converters.js';
import { DragAndDropHandler } from './dragdrop.js';

import { worldInfoRepository } from './world-info-repository.js';
import { createWorldInfoImportUi } from './world-info-import-ui.js';
import { createWorldInfoBookCommands } from './world-info-book-commands.js';
import { createWorldInfoBookUi } from './world-info-book-ui.js';
import { createWorldInfoPanelUi } from './world-info-panel-ui.js';
import { createWorldInfoBookSync } from './world-info-book-sync.js';
import { createWorldInfoEditorUi } from './world-info-editor-ui.js';
import { createWorldInfoReferenceUi } from './world-info-reference-ui.js';
import { createWorldInfoEntryCommands } from './world-info-entry-commands.js';
import { createWorldInfoEditorComposition } from './world-info-editor-composition.js';
import { createWorldInfoRuntimeInitializer } from './world-info-runtime.js';
import {
    getWorldInfoWorkbenchPositionLabel as domainGetWorldInfoWorkbenchPositionLabel,
    buildWorldInfoWorkbenchEntrySummary as domainBuildWorldInfoWorkbenchEntrySummary,
    buildWorldInfoWorkbenchEntryDetail as domainBuildWorldInfoWorkbenchEntryDetail,
    sortWorldInfoEntries as domainSortWorldInfoEntries,
    wi_anchor_position,
    originalWIDataKeyMap,
    setWIOriginalDataValue,
    deleteWIOriginalDataValue,
    splitKeywordsAndRegexes,
    parseRegexFromString,
} from './world-info-domain.js';

export {
    wi_anchor_position,
    originalWIDataKeyMap,
    setWIOriginalDataValue,
    deleteWIOriginalDataValue,
    splitKeywordsAndRegexes,
    parseRegexFromString,
};
import { createWorldInfoWorkbenchSession, resolveWorldInfoSortOption } from './world-info-workbench-service.js';
export { createWorldInfoWorkbenchSession };
export {
    buildWorldInfoReactPanelState,
    WORLD_INFO_DEFAULT_SORT_OPTIONS,
    resolveWorldInfoSortOption,
} from './world-info-workbench-service.js';

import {
    METADATA_KEY,

    MAX_SCAN_DEPTH,

    world_info,
    selected_world_info,
    world_names,
    world_info_depth,
    setWorldInfoSetting,
    setSelectedWorldInfo,

    applyWorldInfoSettings,
    updateWorldInfoRuntimeSettings,
} from './world-info-state.js';
import {
    WorldInfoBuffer,
    getSortedEntries,
    loadWorldInfo,
} from './world-info-service.js';

export {
    METADATA_KEY,
    DEFAULT_DEPTH,
    DEFAULT_WEIGHT,
    MAX_SCAN_DEPTH,
    world_info_insertion_strategy,
    world_info_logic,
    scan_state,
    world_info_position,
    worldInfoCache,
    world_info,
    selected_world_info,
    world_names,
    world_info_depth,
    getWorldInfoSettings,
} from './world-info-state.js';
export {
    checkWorldInfo,
    getSortedEntries,
    getWorldInfoPrompt,
    loadWorldInfo,
} from './world-info-service.js';

export { convertCharacterBook };

import { getWorldInfoShell, saveSettings, getRequestHeaders, getCurrentShellCharacterId, getCurrentShellMenuType, saveCharacterDebounced, saveMetadata, getCurrentChatId, createOrEditCharacter, getOneCharacter, select_selected_character, eventSource, event_types, chat_metadata, characters, create_save } from './world-info-shell-adapter.js';

const saveSettingsDebounced = debounce(() => {
    Object.assign(world_info, { globalSelect: selected_world_info });
    saveSettings();
}, debounce_timeout.relaxed);
// FilterHelper must not be constructed at module evaluation time: world-info.js
// participates in an import cycle with filters.js, so the binding can still be
// uninitialized when this module body runs.
/** @type {FilterHelper} */
export let worldInfoFilter = null;

/**
 * Returns the World Info list filter helper, creating it on first use.
 * @returns {FilterHelper}
 */
function getWorldInfoFilter() {
    worldInfoFilter ??= new FilterHelper(() => {});
    return worldInfoFilter;
}
export const SORT_ORDER_KEY = 'world_info_sort_order';

// Typedef area
/**
 * @typedef {object} WIGlobalScanData The chat-independent data to be scanned. Each of
 *     these fields can be enabled for scanning per entry.
 * @property {string} characterDescription Character description
 * @property {string} characterDepthPrompt Character depth prompt (sometimes referred to as character notes)
 * @property {string} scenario Character defined scenario
 * @property {string} creatorNotes Character creator notes
 * @property {string} trigger The type that triggered the scan, e.g. 'normal', 'quiet', etc.
 */


/**
 * @typedef {object} WIEntryFieldDefinition
 * @property {any} default - Default value for the field
 * @property {string} type - Type of the field, can be 'string', 'number', 'boolean', 'array', 'enum'
 * @property {boolean} [excludeFromTemplate=false] - Whether to exclude this field from the template
 * @property {(value: any) => boolean} [arrayFilter] - Optional filter function for array fields to filter out unwanted values
 */
// End typedef area

/**
 * Updates the world info settings.
 * @param {WorldInfoSettings} settings - Settings object
 * @param {string[]} [activeWorldInfo] - Optional array of active world info names
 */
export function updateWorldInfoSettings(settings, activeWorldInfo) {
    console.debug('[WI] Updating world info settings', settings, activeWorldInfo);

    updateWorldInfoRuntimeSettings(settings);

    if (Array.isArray(activeWorldInfo)) {
        delete settings.world_info;
        setSelectedWorldInfo(activeWorldInfo);
    }

    saveSettingsDebounced();
}

export function setWorldInfoSettings(settings, data) {
    applyWorldInfoSettings(settings, data);

    syncWorldInfoSettingsUi();
    ensureWorldInfoRuntimeInitialized();
}

function refreshGlobalWorldInfoSelectorLabels() {
    const worldInfoSelect = $('#world_info');
    if (worldInfoSelect.data('select2')) {
        worldInfoSelect.trigger('change.select2');
    }
    refreshGlobalWorldInfoSelectorState();
}

function refreshGlobalWorldInfoSelectorState() {
    const worldInfoSelect = $('#world_info');
    const selectedCount = worldInfoSelect.find('option:selected').length;
    $('#wiGlobalCount').text(selectedCount === 1 ? t`1 active` : t`${selectedCount} active`);
}

function syncWorldInfoSettingsUi({ preserveEditorSelection = true, syncGlobalSelect = true, syncEditorSelect = true } = {}) {
    const editorSelectedName = preserveEditorSelection
        ? getSelectedWorldInfoEditorName()
        : '';
    const replayState = buildWorldInfoReplayState({
        worldNames: world_names,
        selectedWorldInfo: selected_world_info,
        editorSelectedName,
    });

    if (syncGlobalSelect) {
        $('#world_info').empty();
        for (const option of replayState.globalOptions) {
            $('#world_info').append(new Option(option.text, option.value, false, option.selected));
        }
        refreshGlobalWorldInfoSelectorLabels();
    }

    if (syncEditorSelect) {
        const editorSelect = $('#world_editor_select');
        editorSelect.find('option[value!=""]').remove();
        for (const option of replayState.editorOptions) {
            editorSelect.append(new Option(option.text, option.value, false, option.selected));
        }
        // Repaint the select2 widget after the option rebuild.
        syncWorldInfoEditorSelectorUi(getWorldInfoWorkbenchSession().getSelectedWorldName());
    }
}

const ensureWorldInfoRuntimeInitialized = createWorldInfoRuntimeInitializer({
    eventSource, eventTypes: event_types,
    getChatWorld: () => chat_metadata[METADATA_KEY],
    getWorldNames: () => world_names,
    setChatWorldActive: active => $('.chat_lorebook_button').toggleClass('world_set', active),
    getSortedEntries,
    getExternalActivations: () => WorldInfoBuffer.externalActivations,
});

export function rehydrateWorldInfoPanel({ resetEmptyEditor = true } = {}) {
    syncWorldInfoSettingsUi({ syncGlobalSelect: false });
    const selectedName = getSelectedWorldInfoEditorName();
    if (selectedName && Array.isArray(world_names) && world_names.includes(selectedName)) {
        void showWorldEditor(selectedName);
    } else if (resetEmptyEditor) {
        void hideWorldEditor();
    }
}

/**
 * Reloads the editor with the specified world info file
 * @param {string} file - The file to load in the editor
 * @param {boolean} [loadIfNotSelected=false] - Indicates whether to load the file even if it's not currently selected
 */
export async function reloadEditor(file, loadIfNotSelected = false) {
    const currentName = getSelectedWorldInfoEditorName();
    if (world_names.includes(file) && (loadIfNotSelected || currentName === file)) {
        await selectWorldInfoEditorName(file);
    }
}

function getSelectedWorldInfoEditorName() {
    // Session state is the source of truth; the hidden legacy select is only a mirror.
    return getWorldInfoWorkbenchSession().getSelectedWorldName();
}

// While true, change events on #world_editor_select are mirror repaints, not
// user selection. jQuery's namespaced 'change.select2' already skips plain
// handlers; the flag stays as a guard for any future non-namespaced repaint.
let suppressEditorSelectMirrorEvent = false;

function syncWorldInfoEditorSelectorUi(selectedName) {
    const editorSelector = $('#world_editor_select');
    editorSelector.val(selectedName);
    if (editorSelector.data('select2')) {
        suppressEditorSelectMirrorEvent = true;
        try {
            editorSelector.trigger('change.select2');
        } finally {
            suppressEditorSelectMirrorEvent = false;
        }
    }
}

/**
 * Selects a world book in the editor by file name. The workbench session holds
 * the canonical selection; the hidden legacy select is mirrored afterwards.
 * @param {string} worldName empty string clears the selection
 */
export async function selectWorldInfoEditorName(worldName) {
    const name = String(worldName ?? '');
    const session = getWorldInfoWorkbenchSession();
    const selection = session.selectWorldName(name);
    applyWorldInfoSearchQuery('');

    // Mirror the resolved name only when it is a real book; an invalid name
    // maps to the empty option instead of writing a nonexistent value.
    const resolvedName = name && world_names?.includes(name) ? name : '';
    syncWorldInfoEditorSelectorUi(resolvedName);

    await selection;
}

/**
 * Legacy entry point: accepts the old positional index or a world file name.
 * Names win over indexes so integer-named books ('1', '2') keep working.
 * @param {string|number} worldIndex index into world_names, or a world name
 */
export async function selectWorldInfoEditorIndex(worldIndex) {
    const selectedValue = String(worldIndex ?? '');
    const asIndex = Number(selectedValue);
    const indexedName = Number.isInteger(asIndex) && asIndex >= 0 ? world_names?.[asIndex] : undefined;
    const name = selectedValue === ''
        ? ''
        : (world_names?.includes(selectedValue) ? selectedValue : indexedName ?? selectedValue);
    await selectWorldInfoEditorName(name);
}

export function applyWorldInfoSearchQuery(searchQuery) {
    const normalizedQuery = String(searchQuery ?? '');
    const session = getWorldInfoWorkbenchSession();
    session.applySearchQuery(normalizedQuery);
    session.applySortOption(normalizedQuery ? '14' : String(accountStorage.getItem(SORT_ORDER_KEY) || '0'));
    getWorldInfoFilter().setFilterData(FILTER_TYPES.WORLD_INFO_SEARCH, normalizedQuery);
}

export function applyWorldInfoSortOption(sortValue) {
    const normalizedSortValue = String(sortValue ?? '');
    const session = getWorldInfoWorkbenchSession();
    session.applySortOption(normalizedSortValue);

    if (normalizedSortValue !== 'search' && normalizedSortValue !== '14') {
        accountStorage.setItem(SORT_ORDER_KEY, normalizedSortValue);
    }
}

/**
 * Updates globally activated World Info books without replaying the legacy selector.
 * @param {string[]} names
 * @returns {string[]}
 */
export function setWorldInfoGlobalActiveNames(names) {
    const validNames = new Set(Array.isArray(world_names) ? world_names : []);
    setSelectedWorldInfo(Array.from(new Set(
        (Array.isArray(names) ? names : [])
            .map(name => String(name ?? ''))
            .filter(name => validNames.has(name)),
    )));
    getWorldInfoWorkbenchSession().setSelectedWorldInfo(selected_world_info);
    saveSettingsDebounced();
    void eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
    return [...selected_world_info];
}

/**
 * Updates the global World Info scan depth (the only remaining editable
 * global WI setting) from the React workbench.
 * @param {number|string} value New scan depth
 * @returns {number} The applied depth
 */
export function updateWorldInfoScanDepth(value) {
    const parsed = Math.floor(Number(value));
    const depth = Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, 0), MAX_SCAN_DEPTH)
        : world_info_depth;
    setWorldInfoSetting('world_info_depth', depth);
    saveSettingsDebounced();
    void eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
    return world_info_depth;
}

export function requestWorldInfoImportSelection() {
    if (isWorldInfoImportBusy()) {
        return false;
    }

    const input = document.getElementById('world_import_file');
    if (input) {
        input.click();
        return true;
    }

    // The toolbar body is deferred; retry the click once it has loaded.
    void ensurePanel('world-info-body').then(() => document.getElementById('world_import_file')?.click());
    return true;
}

export function refreshCurrentWorldInfoEditor() {
    return getWorldInfoWorkbenchSession().getFacadeSnapshot();
}

export async function openWorldInfoEntryByUid(uid) {
    const normalizedUid = String(uid ?? '');
    const numericUid = Number(normalizedUid);

    if (!normalizedUid || !Number.isInteger(numericUid) || numericUid < 0) {
        return false;
    }

    return selectWorldInfoWorkbenchEntry(normalizedUid);
}

const getWorldInfoWorkbenchSession = createWorldInfoEditorComposition({
    getWorldNames: () => world_names,
    getSelectedWorldInfo: () => selected_world_info,
    createSession: createWorldInfoWorkbenchSession,
    getSessionOptions: () => ({
        initialSortValue: String(accountStorage.getItem(SORT_ORDER_KEY) || '0'),
        loadWorldInfo,
        saveWorldInfo,
        runWorldInfoMutation: worldInfoRepository.mutate,
        applyFilters: entries => getWorldInfoFilter().applyFilters(entries),
        getSearchScore: uid => getWorldInfoFilter().getScore(FILTER_TYPES.WORLD_INFO_SEARCH, uid),
        setOriginalDataValue: setWIOriginalDataValue,
        deleteOriginalDataValue: deleteWIOriginalDataValue,
    }),
});
/**
 * Human-readable injection position for workbench list/editor display.
 * @param {object} entry
 * @returns {string}
 */
export function getWorldInfoWorkbenchPositionLabel(entry) {
    return domainGetWorldInfoWorkbenchPositionLabel(entry);
}

/**
 * @param {object} entry
 * @returns {object}
 */
export function buildWorldInfoWorkbenchEntrySummary(entry) {
    return domainBuildWorldInfoWorkbenchEntrySummary(entry);
}

/**
 * Clone entry fields for React editor state without advertising retired capabilities.
 * `vectorized` remains in the payload for lossless save round-trips only.
 * @param {object} entry
 * @returns {object|null}
 */
export function buildWorldInfoWorkbenchEntryDetail(entry) {
    return domainBuildWorldInfoWorkbenchEntryDetail(entry);
}

/**
 * @returns {string}
 */
export function getWorldInfoWorkbenchSelectedEntryUid() {
    return getWorldInfoWorkbenchSession().getSelectedEntryUid();
}

/**
 * Select an entry for the React workbench without requiring legacy card expansion.
 * @param {string|number} uid
 * @returns {Promise<boolean>}
 */
export async function selectWorldInfoWorkbenchEntry(uid) {
    const session = getWorldInfoWorkbenchSession();
    return session.selectEntry(uid);
}

/**
 * Update editable entry fields through the World Info facade and preserve compatibility fields.
 * @param {string|number} uid
 * @param {Record<string, unknown>} fields
 * @returns {Promise<boolean>}
 */
export async function updateWorldInfoWorkbenchEntryFields(uid, fields = {}, sourceWorldName) {
    const session = getWorldInfoWorkbenchSession();
    return session.updateEntryFields(uid, fields, sourceWorldName);
}

/**
 * Build data-backed entry summaries for the current editor book.
 * Falls back to empty when no book is selected.
 * @returns {Promise<object[]>}
 */
export async function getWorldInfoWorkbenchEntrySummaries() {
    const session = getWorldInfoWorkbenchSession();
    return session.getEntrySummaries();
}

/**
 * Full entry detail for the selected workbench entry.
 * @param {string|number} [uid]
 * @returns {Promise<object|null>}
 */
export async function getWorldInfoWorkbenchEntryDetail(uid = getWorldInfoWorkbenchSession().getSelectedEntryUid()) {
    const session = getWorldInfoWorkbenchSession();
    return session.getSelectedEntryDetail(uid);
}

/**
 * Snapshot pieces owned by the World Info facade for the React workbench.
 * @returns {Promise<object>}
 */
export async function getWorldInfoWorkbenchFacadeSnapshot() {
    const session = getWorldInfoWorkbenchSession();
    return session.getFacadeSnapshot();
}

/**
 * React panel state built from workbench service (no workbench DOM required).
 * @returns {Promise<object>}
 */
export async function getWorldInfoReactPanelState(meta = {}) {
    const session = getWorldInfoWorkbenchSession();
    return session.getReactPanelState({
        worldNames: Array.isArray(world_names) ? world_names : [],
        importBusy: isWorldInfoImportBusy(),
        scanDepth: world_info_depth,
        ...meta,
    });
}


/**
 * Loads the given world into the World Editor.
 *
 * @param {string} name - The name of the world
 * @return {Promise<void>} A promise that resolves when the world editor is loaded
 */
export async function showWorldEditor(name) {
    if (!name) {
        await hideWorldEditor();
        return;
    }

    await selectWorldInfoEditorName(name);
}

const { setWorldInfoButtonClass, checkEmbeddedWorld, importEmbeddedWorldInfo, onWorldInfoChange } = createWorldInfoReferenceUi({ characters, accountStorage, callGenericPopup, POPUP_TYPE, Popup, t, convertCharacterBook, saveWorldInfo, updateWorldInfoList: (...args) => updateWorldInfoList(...args), getWorldInfoShell, selectWorldInfoEditorName, getWIElement, saveSettingsDebounced, eventSource, event_types });
export { setWorldInfoButtonClass, checkEmbeddedWorld, importEmbeddedWorldInfo, onWorldInfoChange };
const { updateWorldInfoList, flushDeletedWorldsFromUI } = createWorldInfoBookSync({ getRequestHeaders, getSelectedWorldInfoEditorName, getWorldInfoWorkbenchSession, refreshGlobalWorldInfoSelectorLabels, syncWorldInfoEditorSelectorUi, hideWorldEditor, setWorldInfoButtonClass, getCurrentShellMenuType, saveCharacterDebounced, saveSettingsDebounced });
export { updateWorldInfoList, flushDeletedWorldsFromUI };

async function hideWorldEditor() {
    const selection = getWorldInfoWorkbenchSession().selectWorldName('');
    syncWorldInfoEditorSelectorUi('');
    await selection;
}

function getWIElement(name) {
    const wiElement = $('#world_info').children().filter(function () {
        return $(this).text().toLowerCase() === name.toLowerCase();
    });

    return wiElement;
}

/**
 * Sorts the given data based on the selected sort option
 *
 * @param {any[]} data WI entries
 * @param {object} [options={}] - Optional arguments
 * @param {{sortField?: string, sortOrder?: string, sortRule?: string}} [options.customSort={}] - Custom sort options, instead of the chosen UI sort
 * @returns {any[]} Sorted data
 */
export function sortWorldInfoEntries(data, { customSort = null } = {}) {
    const resolvedCustomSort = customSort ?? resolveWorldInfoSortOption(getWorldInfoWorkbenchSession().getSortValue());

    return domainSortWorldInfoEntries(data, {
        customSort: resolvedCustomSort,
        getSearchScore: (uid) => getWorldInfoFilter().getScore(FILTER_TYPES.WORLD_INFO_SEARCH, uid),
    });
}

const { duplicateWorldInfoEntry, deleteWorldInfoEntry, newWorldInfoEntryDefinition, newWorldInfoEntryTemplate, createWorldInfoEntry } = createWorldInfoEntryCommands({ getFreeWorldEntryUid: (...args) => getFreeWorldEntryUid(...args), Popup, t, escapeHtml });
export { duplicateWorldInfoEntry, deleteWorldInfoEntry, newWorldInfoEntryDefinition, newWorldInfoEntryTemplate, createWorldInfoEntry };

/**
 * Saves the world info
 *
 * This refreshes the cache only after the backend confirms the write.
 *
 * @param {string} name - The name of the world info
 * @param {any} data - The data to be saved
 * @param {boolean} [_immediately=false] - Retained for compatibility; repository writes are queued.
 * @return {Promise<void>} A promise that resolves when the world info is saved
 */
export async function saveWorldInfo(name, data, _immediately = false) {
    return worldInfoRepository.save(name, data);
}

const { renameWorldInfo, deleteWorldInfo, getFreeWorldEntryUid, getFreeWorldName, createNewWorldInfo, assignLorebookToChat, moveWorldInfoEntry, charUpdatePrimaryWorld, charUpdateAddAuxWorld, charSetAuxWorlds } = createWorldInfoBookCommands({
    POPUP_TYPE, showLocalDialog, t, equalsIgnoreCaseAndAccents, saveWorldInfo, getWIElement, selectWorldInfoEditorName, saveSettingsDebounced, characters, getRequestHeaders, getOneCharacter, getCurrentShellCharacterId, select_selected_character, setWorldInfoButtonClass, flushDeletedWorldsFromUI, getSanitizedFilename, checkOverwriteExistingData, updateWorldInfoList, hideWorldEditor, chat_metadata, METADATA_KEY, openWorldInfoEditor, renderTemplateAsync, getCurrentChatId, saveMetadata, callGenericPopup, loadWorldInfo, deleteWIOriginalDataValue, getSelectedWorldInfoEditorName, reloadEditor, getCurrentShellMenuType, create_save, createOrEditCharacter, getCharaFilename, normalizeArray,
});
export { deleteWorldInfo, getFreeWorldEntryUid, getFreeWorldName, createNewWorldInfo, assignLorebookToChat, moveWorldInfoEntry, charUpdatePrimaryWorld, charUpdateAddAuxWorld, charSetAuxWorlds };
const { promptToCreateWorldInfo, exportCurrentWorldInfo, renameCurrentWorldInfo, duplicateCurrentWorldInfo, deleteCurrentWorldInfo } = createWorldInfoBookUi({ getFreeWorldName, showLocalDialog, t, createNewWorldInfo, getSelectedWorldInfoEditorName, loadWorldInfo, download, renameWorldInfo, saveWorldInfo, updateWorldInfoList, selectWorldInfoEditorName, hideWorldEditor, getRequestHeaders, flushDeletedWorldsFromUI, saveSettingsDebounced, deleteWorldInfo });
export { promptToCreateWorldInfo, exportCurrentWorldInfo, renameCurrentWorldInfo, duplicateCurrentWorldInfo, deleteCurrentWorldInfo };
const { createWorldInfoEntryFromEditor, backfillWorldInfoMemosFromWorkbench, promptApplyWorldInfoCurrentSorting, bulkDeleteWorldInfoEntries, bulkSetWorldInfoEntriesEnabled, promptMoveOrCopyWorldInfoEntry } = createWorldInfoEditorUi({ getWorldInfoWorkbenchSession, worldInfoRepository, loadWorldInfo, createWorldInfoEntry, showLocalDialog, t, moveWorldInfoEntry });
export { createWorldInfoEntryFromEditor, backfillWorldInfoMemosFromWorkbench, promptApplyWorldInfoCurrentSorting, bulkDeleteWorldInfoEntries, bulkSetWorldInfoEntriesEnabled, promptMoveOrCopyWorldInfoEntry };
const { importWorldInfo, importWorldInfoFiles, isWorldInfoImportBusy } = createWorldInfoImportUi({
    getWorldNames: () => world_names, deleteWorldInfo, updateWorldInfoList, selectWorldInfoEditorName,
    eventSource, event_types, getSanitizedFilename, equalsIgnoreCaseAndAccents, checkOverwriteExistingData,
    escapeHtml, parseJsonFile, getFileBuffer, extractDataFromPng, getRequestHeaders, t, translate, showLocalDialog, beginLocalDialogOperation,
});
export { importWorldInfo, importWorldInfoFiles };
/**
 * Forces the world info editor to open on a specific world.
 * @param {string} worldName The name of the world to open
 */
export async function openWorldInfoEditor(worldName) {
    console.log(`Opening lorebook for ${worldName}`);
    if (!world_names?.includes(worldName)) {
        console.warn(`Lorebook '${worldName}' is not available in the world list.`);
        return;
    }
    if (!$('#WorldInfo').hasClass('openDrawer')) {
        await getWorldInfoShell().openWorldInfoPanel();
    }
    await selectWorldInfoEditorName(worldName);
}

export const initWorldInfo = createWorldInfoPanelUi({
    onWorldInfoChange, characters, checkEmbeddedWorld, openWorldInfoEditor, importEmbeddedWorldInfo, saveCharacterDebounced, addLongPressEvent, assignLorebookToChat, t, refreshGlobalWorldInfoSelectorState, refreshGlobalWorldInfoSelectorLabels, select2ChoiceClickSubscribe, getSelectedWorldInfoEditorName, selectWorldInfoEditorName, isWorldInfoImportBusy, importWorldInfoFiles, DragAndDropHandler, getFreeWorldName, Popup, createNewWorldInfo, isEditorSelectMirrorSuppressed: () => suppressEditorSelectMirrorEvent, isMobile,
});

/**
 * Mounts the React-owned World Info drawer markup.
 * Must run before initWorldInfoPanel bindings: world-info.js attaches to the
 * preserved element IDs and fills dynamic containers at runtime.
 */
export async function mountWorldInfoPanel() {
    const drawerContent = document.getElementById('WorldInfo');
    if (!drawerContent) {
        console.warn('World Info drawer not found');
        return;
    }
    if (drawerContent.dataset.reactWorldInfoMounted === 'true') {
        return;
    }

    const host = document.createElement('div');
    host.id = 'emberdesk-react-world-info-host';
    drawerContent.replaceChildren(host);

    try {
        const module = await loadWorkspacePanelsModule();
        module.mountWorldInfoPanel(host);
        drawerContent.dataset.reactWorldInfoMounted = 'true';
    } catch (error) {
        console.error('Failed to mount world info panel:', error);
    }
}
