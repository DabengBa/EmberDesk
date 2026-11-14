import { DOMPurify } from '../lib.js';

import { requireCharacterTagsShellContext } from './character-tags-shell-context.js';
import { eventSource, event_types } from './events.js';
import { FILTER_TYPES, FILTER_STATES, DEFAULT_FILTER_STATE, isFilterState, FilterHelper } from './filters.js';

import { download, parseJsonFile, uuidv4, equalsIgnoreCaseAndAccents, removeFromArray, getFreeName, findChar, escapeHtml } from './utils.js';
import { power_user } from './power-user.js';

import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup } from './popup.js';

import { INTERACTABLE_CONTROL_CLASS } from './keyboard.js';
import { renderTemplateAsync } from './templates.js';
import { t, translate } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';
import { createCharacterTagsService } from './character-tags-service.js';

export {
    TAG_FOLDER_TYPES,
    TAG_FOLDER_DEFAULT_TYPE,
    tags,
    tag_map,
    filterByTagState,
    isBogusFolder,
    isBogusFolderOpen,
    chooseBogusFolder,
    getTagBlock,
    loadTagsSettings,
    printTagFilters,
    getTagsList,
    printTagList,
    appendTagToList,
    createTagMapFromList,
    renameTagKey,
    importTags,
    sortTags,
    compareTagsForSort,
    removeTagFromMap,
};


const CHARACTER_FILTER_SELECTOR = '#rm_characters_block .rm_tag_filter';
const TAG_TEMPLATE = $('#tag_template .tag');
const FOLDER_TEMPLATE = $('#bogus_folder_template .bogus_folder_select');


/**
 * Gets the context information (selector and search input) for a filter helper.
 * Used to reduce code duplication when working with different filter contexts.
 * @param {FilterHelper} filterHelper - The filter helper instance
 * @returns {{selector: string, searchInput: string}|null} Context info or null if unknown
 */
function getFilterContext(_filterHelper) {
    return {
        selector: CHARACTER_FILTER_SELECTOR,
        searchInput: '#character_search_bar',
    };
}

/**
 * Get the filter helper for a given list selector.
 * @param {string|JQuery<HTMLElement>} listSelector - jQuery selector for the list
 * @returns {FilterHelper} The appropriate filter helper instance
 */
function getFilterHelper(_listSelector) {
    return requireCharacterTagsShellContext().state.entitiesFilter;
}

const ACTIONABLE_FILTER_STORAGE_KEYS = Object.freeze({
    FAV: 'TagFilterState_FAV',
});

/**
 * Gets the storage key prefix for a filter helper to enable persistence.
 * @param {FilterHelper} filterHelper - The filter helper to check
 * @returns {string|null} Storage key prefix or null if no persistence
 */
function getFilterStorageKey(filterHelper) {
    if (filterHelper === requireCharacterTagsShellContext().state.entitiesFilter) {
        return 'CharacterList';
    }
    return null;
}

/**
 * Checks if the given filter helper is the main character list filter.
 * @param {FilterHelper} filterHelper - The filter helper to check
 * @returns {boolean} True if this is the main character list
 */
function isMainCharacterList(filterHelper) {
    return filterHelper === requireCharacterTagsShellContext().state.entitiesFilter;
}

/** @enum {number} */
export const tag_filter_type = {
    character: 0,
};

/**
 * Gets the power_user setting key for tag filter visibility for a given context.
 * @param {number} type - The tag_filter_type
 * @returns {string} The power_user setting key
 */

/**
 * Gets the tag filter visibility state for a given context.
 * @param {number} type - The tag_filter_type
 * @returns {boolean} Whether tag filters should be shown
 */

/** @enum {number} */
export const tag_import_setting = {
    ASK: 1,
    NONE: 2,
    ALL: 3,
    ONLY_EXISTING: 4,
};

/** @enum {string} */
export const tag_sort_mode = {
    MANUAL: 'manual',
    ALPHABETICAL: 'alphabetical',
    BY_ENTRIES: 'by_entries',
};

/**
 * A collection of global actionable tags for the filter panel.
 *
 * Tags with `filter_state` property (FAV) maintain persistent state:
 * - The character list saves state in account storage.
 * - The main character list also maintains tag.filter_state for backward compatibility.
 *
 * Tags without `filter_state` (VIEW) are action buttons only.
 */
const ACTIONABLE_TAGS = {
    FAV: { id: '1', sort_order: 1, name: 'Show only favorites', color: 'color-mix(in srgb, var(--golden) 50%, transparent)', filter_state: undefined, action: filterByFav, icon: 'fa-solid fa-star', class: 'filterByFavorites' },
    VIEW: { id: '2', sort_order: 4, name: 'Manage tags', color: 'color-mix(in srgb, var(--SmartThemeEmColor) 45%, transparent)', action: onViewTagsListClick, icon: 'fa-solid fa-gear', class: 'manageTags' },
};

/**
 * Map of tag IDs to their corresponding filter types.
 * Used for the actionable Favorites tag.
 * Built lazily: tags.js participates in an import cycle with filters.js, so
 * FILTER_TYPES cannot be read at module evaluation time.
 * @type {Map<string, string>}
 */
let tagIdToFilterType = null;

/**
 * Returns the actionable-tag to filter-type map, creating it on first use.
 * @returns {Map<string, string>}
 */
function getTagIdToFilterType() {
    tagIdToFilterType ??= new Map([
        [ACTIONABLE_TAGS.FAV.id, FILTER_TYPES.FAV],
    ]);
    return tagIdToFilterType;
}

/** @type {{[key: string]: Tag}} An optional list of actionables that can be utilized by extensions */
const InListActionable = {
};

/** @type {Tag[]} A list of default tags */
const DEFAULT_TAGS = [
    { id: uuidv4(), name: 'Plain Text', create_date: Date.now() },
    { id: uuidv4(), name: 'OpenAI', create_date: Date.now() },
    { id: uuidv4(), name: 'W++', create_date: Date.now() },
    { id: uuidv4(), name: 'Boostyle', create_date: Date.now() },
    { id: uuidv4(), name: 'PList', create_date: Date.now() },
    { id: uuidv4(), name: 'AliChat', create_date: Date.now() },
];

/**
 * @typedef FolderType Bogus folder type
 * @property {string} icon - The icon as a string representation / character
 * @property {string} class - The class to apply to the folder type element
 * @property {string} [fa_icon] - Optional font-awesome icon class representing the folder type element
 * @property {string} [tooltip] - Optional tooltip for the folder type element
 * @property {string} [color] - Optional color for the folder type element
 * @property {string} [size] - A string representation of the size that the folder type element should be
 */

/**
 * @type {{ OPEN: FolderType, CLOSED: FolderType, NONE: FolderType, [key: string]: FolderType }}
 * The list of all possible tag folder types
 */
const TAG_FOLDER_TYPES = {
    OPEN: { icon: '✔', class: 'folder_open', fa_icon: 'fa-folder-open', tooltip: 'Open Folder (Show all characters even if not selected)', color: 'green', size: '1' },
    CLOSED: { icon: '👁', class: 'folder_closed', fa_icon: 'fa-eye-slash', tooltip: 'Closed Folder (Hide all characters unless selected)', color: 'lightgoldenrodyellow', size: '0.7' },
    NONE: { icon: '✕', class: 'no_folder', tooltip: 'No Folder', color: 'red', size: '1' },
};
const TAG_FOLDER_DEFAULT_TYPE = 'NONE';

/**
 * @typedef {object} Tag - Object representing a tag
 * @property {string} id - The id of the tag (As a kind of has string. This is used whenever the tag is referenced or linked, as the name might change)
 * @property {string} name - The name of the tag
 * @property {string} [folder_type] - The bogus folder type of this tag (based on `TAG_FOLDER_TYPES`)
 * @property {string} [filter_state] - The saved state of the filter chosen of this tag (based on `FILTER_STATES`)
 * @property {number} [sort_order] - A custom integer representing the sort order if tags are sorted
 * @property {string} [color] - The background color of the tag
 * @property {string} [color2] - The foreground color of the tag
 * @property {number} [create_date] - A number representing the date when this tag was created
 * @property {boolean} [is_hidden_on_character_card] - Whether this tag is hidden on the character card
 *
 * @property {function} [action] - An optional function that gets executed when this tag is an actionable tag and is clicked on.
 * @property {string} [class] - An optional css class added to the control representing this tag when printed. Used for custom tags in the filters.
 * @property {string} [icon] - An optional css class of an icon representing this tag when printed. This will replace the tag name with the icon. Used for custom tags in the filters.
 * @property {string} [title] - An optional title for the tooltip of this tag. If there is no tooltip specified, and "icon" is chosen, the tooltip will be the "name" property.
 */

/**
 * An list of all tags that are available
 * @type {Tag[]}
 */
let tags = [];

/**
 * A map representing the key of an entity (character avatar, etc.) with a corresponding array of tags this entity has assigned. The array might not exist if no tags were assigned yet.
 * @type {{[identifier: string]: string[]?}}
 */
let tag_map = {};

const tagListeners = new Set();
let tagRevision = 0;

const characterTagsService = createCharacterTagsService({
    getTags: () => tags,
    getMap: () => tag_map,
    getCharacters: () => requireCharacterTagsShellContext().state.characters,
    equalNames: equalsIgnoreCaseAndAccents,
    newTag: name => newTag(name),
    changed: (messageTagsChanged) => {
        tagRevision++;
        requireCharacterTagsShellContext().saveSettingsDebounced();
        requireCharacterTagsShellContext().printCharactersDebounced();
        if (messageTagsChanged) applyCharacterTagsToMessageDivs();
        for (const listener of tagListeners) listener();
    },
});

function createTagRuntime(getValue, commands) {
    let revision = -1;
    let snapshot;
    return {
        getSnapshot() {
            if (revision !== tagRevision) {
                snapshot = getValue();
                revision = tagRevision;
            }
            return snapshot;
        },
        subscribe(listener) {
            tagListeners.add(listener);
            return () => tagListeners.delete(listener);
        },
        commands,
    };
}

function getTagViews() {
    const allIds = Object.values(tag_map).flat();
    const counts = new Map(tags.map(tag => [tag.id, allIds.filter(id => id === tag.id).length]));
    return sortTags(tags, counts).map(tag => ({ ...tag, count: counts.get(tag.id) || 0 }));
}

export function createTagManagementRuntime() {
    const commands = {
        createTag(name) {
            const value = name?.trim() || getFreeName('New Tag', tags.map(tag => tag.name));
            return characterTagsService.create(value).id;
        },
        renameTag(id, name) {
            return characterTagsService.rename(id, name);
        },
        async deleteTag(id) {
            const tag = tags.find(item => item.id === id);
            if (!tag) return;
            const otherTags = sortTags(tags.filter(item => item.id !== id).map(item => ({ id: item.id, name: item.name })));
            const popupContent = $(await renderTemplateAsync('deleteTag', { otherTags }));
            const mergeSelect = popupContent.filter('#merge_tag_select').add(popupContent.find('#merge_tag_select'));
            appendTagToList(popupContent.find('#tag_to_delete'), tag);
            let mergeId = null;
            const result = await callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, '', {
                onClosing: popup => {
                    if (popup.result === POPUP_RESULT.AFFIRMATIVE) mergeId = mergeSelect.val() || null;
                    return true;
                },
            });
            if (result !== POPUP_RESULT.AFFIRMATIVE || !tags.includes(tag)) return;
            characterTagsService.deleteTag(id, mergeId ? String(mergeId) : null);
        },
        setTagColor(id, field, value) {
            if (field === 'color' || field === 'color2') characterTagsService.setProperty(id, field, value);
        },
        cycleTagFolder(id) {
            const tag = tags.find(item => item.id === id);
            if (tag) { const types = Object.keys(TAG_FOLDER_TYPES); characterTagsService.setProperty(id, 'folder_type', types[(types.indexOf(tag.folder_type) + 1) % types.length]); }
        },
        toggleTagHidden(id) { const tag = tags.find(item => item.id === id); if (tag) characterTagsService.setProperty(id, 'is_hidden_on_character_card', !tag.is_hidden_on_character_card); },
        setSortMode(mode) {
            if (!Object.values(tag_sort_mode).includes(mode) || mode === power_user.tag_sort_mode) return;
            power_user.tag_sort_mode = mode;
            characterTagsService.notify(false);
        },
        reorderTags(ids) {
            power_user.tag_sort_mode = tag_sort_mode.MANUAL;
            characterTagsService.reorder(ids);
        },
        backupTags: onTagsBackupClick,
        async restoreTags(file) {
            const data = await parseJsonFile(file);
            if (!data || !Array.isArray(data.tags) || !data.tag_map || typeof data.tag_map !== 'object') {
                toastr.warning('Invalid file format', 'Tag Restore'); return;
            }
            let overwrite = false;
            if (tags.length) {
                const result = await Popup.show.confirm('Tag Restore', 'You have existing tags. If the backup contains any of those tags, do you want the backup to overwrite their settings (Name, color, folder state, etc)?', { okButton: 'Overwrite', cancelButton: 'Keep Existing' });
                overwrite = result === POPUP_RESULT.AFFIRMATIVE;
            }
            const result = characterTagsService.restore(data, overwrite);
            if (!result.valid) { toastr.warning('Invalid file format', 'Tag Restore'); return; }
            if (result.warnings.length) {
                const warnings = result.warnings;
                toastr.warning('Tags restored with warnings. Check console or click on this message for details.', 'Tag Restore', { timeOut: toastr.options.timeOut * 2, onclick: () => Popup.show.text('Tag Restore Warnings', `<samp class="justifyLeft">${DOMPurify.sanitize(warnings.join('\n'))}<samp>`, { allowVerticalScrolling: true }) });
                console.warn(`TAG RESTORE REPORT\n====================\n${warnings.join('\n')}`);
            } else toastr.success('Tags restored successfully.', 'Tag Restore');
        },
        async pruneTags() {
            const assigned = new Set(Object.values(tag_map).flat());
            const unused = tags.filter(tag => !assigned.has(tag.id));
            const avatars = new Set(requireCharacterTagsShellContext().state.characters.map(character => String(character.avatar)));
            const missing = Object.keys(tag_map).filter(key => !avatars.has(key));
            if (!unused.length && !missing.length) { toastr.info(t`No unused tags or references found.`); return; }
            const confirm = await Popup.show.confirm(t`Prune ${unused.length} tags and ${missing.length} references`, t`Are you sure you want to remove all unused tags and references to missing or deleted characters?`, { defaultResult: POPUP_RESULT.NEGATIVE });
            if (!confirm) return;
            characterTagsService.prune();
            toastr.success(t`Unused tags pruned successfully.`);
        },
    };
    return createTagRuntime(() => ({ tags: getTagViews(), sortMode: power_user.tag_sort_mode }), commands);
}

/** @param {string[]} avatarKeys */
export function createBulkTagEditorRuntime(avatarKeys) {
    const keys = [...new Set(avatarKeys)];
    const commands = {
        addTag: id => characterTagsService.assign(keys, [id]),
        createAndAddTag: name => {
            if (!name.trim()) return;
            const tag = characterTagsService.create(name.trim());
            characterTagsService.assign(keys, [tag.id]);
        },
        removeTag: id => characterTagsService.remove(keys, [id]),
        async resetTags() {
            if (await Popup.show.confirm(t`Remove all tags from ${keys.length} character(s)?`, t`Every tag will be removed from each selected character. This cannot be undone.`, { defaultResult: POPUP_RESULT.NEGATIVE })) {
                characterTagsService.reset(keys);
            }
        },
        async removeMutualTags() {
            const ids = characterTagsService.mutual(keys).map(tag => tag.id);
            if (!ids.length) { toastr.info(t`No mutual tags to remove.`); return; }
            if (await Popup.show.confirm(t`Remove ${ids.length} mutual tag(s) from ${keys.length} character(s)?`, t`Only the tags shared by every selected character will be removed.`, { defaultResult: POPUP_RESULT.NEGATIVE })) {
                characterTagsService.remove(keys, ids);
            }
        },
        async importExistingTags() {
            for (const key of keys) {
                const character = requireCharacterTagsShellContext().state.characters.find(item => item.avatar === key);
                if (character) await importTags(character, { importSetting: tag_import_setting.ONLY_EXISTING });
            }
        },
        async importAllTags() {
            for (const key of keys) {
                const character = requireCharacterTagsShellContext().state.characters.find(item => item.avatar === key);
                if (character) await importTags(character, { importSetting: tag_import_setting.ALL });
            }
        },
    };
    return createTagRuntime(() => {
        const shared = new Set(characterTagsService.mutual(keys).map(tag => tag.id));
        const all = getTagViews();
        return { availableTags: all.filter(tag => !shared.has(tag.id)), selectedTags: all.filter(tag => shared.has(tag.id)), characterCount: keys.length };
    }, commands);
}

/**
 * A cache of all cut-off tag lists that got expanded until the last reload. They will be printed expanded again.
 * It contains the key of the entity.
 * @type {string[]} ids
 */
let expanded_tags_cache = [];

/**
 * Applies the basic filter for the current state of the tags and their selection on an entity list.
 * @param {Array<Object>} entities List of entities for display, consisting of tags, characters, and folders.
 * @param {Object} param1 Optional parameters, explained below.
 * @param {Boolean} [param1.globalDisplayFilters] When enabled, applies the final filter for the global list. Icludes filtering out entities in closed/hidden folders and empty folders.
 * @param {Object} [param1.subForEntity] When given an entity, the list of entities gets filtered specifically for that one as a "sub list", filtering out other tags, elements not tagged for this and hidden elements.
 * @param {Boolean} [param1.filterHidden] Optional switch with which filtering out hidden items (from closed folders) can be disabled.
 * @returns The filtered list of entities
 */
function filterByTagState(entities, { globalDisplayFilters = false, subForEntity = undefined, filterHidden = true } = {}) {
    return characterTagsService.filterEntities(entities, requireCharacterTagsShellContext().state.entitiesFilter.getFilterData(FILTER_TYPES.TAG), {
        globalDisplayFilters, subForEntity, filterHidden,
        search: requireCharacterTagsShellContext().state.entitiesFilter.getFilterData(FILTER_TYPES.SEARCH),
        isTagged: (entity, id) => requireCharacterTagsShellContext().state.entitiesFilter.isElementTagged(entity, id),
    });
}

/**
 * Indicates whether a given tag is defined as a folder. Meaning it's neither undefined nor 'NONE'.
 *
 * @param {Tag} tag - The tag to check
 * @returns {boolean} Whether it's a tag folder
 */
function isBogusFolder(tag) {
    return tag?.folder_type !== undefined && tag.folder_type !== TAG_FOLDER_DEFAULT_TYPE;
}

/**
 * Retrieves all currently open bogus folders
 *
 * @return {Tag[]} An array of open bogus folders
 */
function getOpenBogusFolders() {
    return requireCharacterTagsShellContext().state.entitiesFilter.getFilterData(FILTER_TYPES.TAG)?.selected
        .map(tagId => tags.find(x => x.id === tagId))
        .filter(isBogusFolder) ?? [];
}

/**
 * Indicates whether a user is currently in a bogus folder
 *
 * @returns {boolean} If currently viewing a folder
 */
function isBogusFolderOpen() {
    return getOpenBogusFolders().length > 0;
}

/**
 * Function to be called when a specific tag/folder is chosen to "drill down".
 *
 * @param {*} source The jQuery element clicked when choosing the folder
 * @param {string} tagId The tag id that is behind the chosen folder
 * @param {boolean} remove Whether the given tag should be removed (otherwise it is added/chosen)
 */
function chooseBogusFolder(source, tagId, remove = false) {
    // Navigation is based on the filter model, not React-owned chips.
    if (tagId === 'back') {
        tagId = getOpenBogusFolders().at(-1)?.id;
        remove = true;
    }
    if (tagId) setCharacterTagFilterState(tagId, remove ? DEFAULT_FILTER_STATE : FILTER_STATES.SELECTED.key, requireCharacterTagsShellContext().state.entitiesFilter);
}

/**
 * Builds the tag block for the specified item.
 *
 * @param {Tag} tag The tag item
 * @param {any[]} entities The list ob sub items for this tag
 * @param {number} hidden A count of how many sub items are hidden
 * @param {boolean} isUseless Whether the tag is useless (should be displayed greyed out)
 * @returns The html for the tag block
 */
function getTagBlock(tag, entities, hidden = 0, isUseless = false) {
    let count = entities.length;

    const tagFolder = TAG_FOLDER_TYPES[tag.folder_type];

    const template = FOLDER_TEMPLATE.clone();
    template.addClass(tagFolder.class);
    template.attr({ 'tagid': tag.id, 'id': `BogusFolder${tag.id}` });
    template.find('.avatar').css({ 'background-color': tag.color, 'color': tag.color2 }).attr('title', `[Folder] ${tag.name}`);
    template.find('.ch_name').text(tag.name).attr('title', `[Folder] ${tag.name}`);
    template.find('.bogus_folder_hidden_counter').text(hidden > 0 ? `${hidden} hidden` : '');
    template.find('.bogus_folder_counter').text(`${count} ` + (count != 1 ? t`characters` : t`character`));
    template.find('.bogus_folder_icon').addClass(tagFolder.fa_icon);
    if (isUseless) template.addClass('useless');

    // Fill inline character images
    requireCharacterTagsShellContext().buildAvatarList(template.find('.bogus_folder_avatars_block'), entities);

    return template;
}

/**
 * Common logic for applying actionable tag filters (Favorites).
 * Persists state to storage for all filter contexts.
 * @param {FilterHelper} filterHelper - Instance of FilterHelper class
 * @param {object} tag - The actionable tag object
 * @param {string} filterType - The filter type constant
 * @param {string} storageKey - The storage key base for persistence
 */
function applyActionableTagFilter(filterHelper, tag, filterType, storageKey) {
    const states = Object.keys(FILTER_STATES);
    const current = filterHelper.getFilterData(filterType) || DEFAULT_FILTER_STATE;
    const state = states[(states.indexOf(current) + 1) % states.length];

    // Persist to storage for all contexts
    const storagePrefix = getFilterStorageKey(filterHelper);
    if (storagePrefix) {
        const contextStorageKey = `${storagePrefix}_${storageKey}`;
        accountStorage.setItem(contextStorageKey, state);
    }

    // Also update global state for main character list (backward compatibility)
    if (isMainCharacterList(filterHelper)) {
        tag.filter_state = state;
    }

    // Update the filter helper for the current context
    filterHelper.setFilterData(filterType, state);
}

/**
 * Determines the filter state for a tag based on context.
 * For actionable tags: reads from persisted state via filter helper.
 * For regular tags: reads from the filter helper's TAG filter data.
 * @param {FilterHelper} filterHelper - The filter helper for the current context
 * @param {object} tag - The tag object
 * @param {boolean} isFilterActionable - Whether the tag is an actionable filter tag
 * @returns {string} The filter state
 */
function determineTagFilterState(filterHelper, tag, isFilterActionable) {
    if (isFilterActionable) {
        // For actionable tags: read from filter helper (which is loaded from storage)
        const filterType = getTagIdToFilterType().get(tag.id) || null;
        if (filterType) {
            return filterHelper.getFilterData(filterType) || DEFAULT_FILTER_STATE;
        }
    } else {
        // For regular tags: read from the filter helper's TAG filter data
        const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG);
        if (tagFilterData.excluded.includes(tag.id)) {
            return 'EXCLUDED';
        }
        if (tagFilterData.selected.includes(tag.id)) {
            return 'SELECTED';
        }
    }

    return DEFAULT_FILTER_STATE;
}

/**
 * Applies the favorite filter to the character list.
 * @param {FilterHelper} filterHelper Instance of FilterHelper class.
 */
function filterByFav(filterHelper) {
    applyActionableTagFilter.call(this, filterHelper, ACTIONABLE_TAGS.FAV, FILTER_TYPES.FAV, ACTIONABLE_FILTER_STORAGE_KEYS.FAV);
}

function loadTagsSettings(settings) {
    tags = settings.tags !== undefined ? settings.tags : DEFAULT_TAGS;
    tag_map = settings.tag_map !== undefined ? settings.tag_map : Object.create(null);
}

function renameTagKey(oldKey, newKey) {
    characterTagsService.renameKey(oldKey, newKey);
}

function createTagMapFromList(listElement, key) {
    const tagIds = listElement === '#tagList' ? getDraftTagIds() : $(listElement).find('.tag').map((_, el) => $(el).attr('id')).get();
    characterTagsService.replace(key, tagIds);
}

export function getDraftTagIds() {
    if (requireCharacterTagsShellContext().state.menu_type === 'create') return characterTagsService.getDraft();
    const key = getTagKey();
    return key ? [...(tag_map[key] || [])] : [];
}

export function assignTagIdsToAvatar(avatar, ids) {
    characterTagsService.replace(avatar, ids);
}

export function deleteTagKey(avatar) {
    characterTagsService.deleteKey(avatar);
}

/**
 * Gets a list of all tags for a given entity key.
 * If you have an entity, you can get it's key easily via `getTagKeyForEntity(entity)`.
 *
 * @param {string} key - The key for which to get tags via the tag map
 * @param {boolean} [sort=true] - Whether the tag list should be sorted
 * @returns {Tag[]} A list of tags
 */
function getTagsList(key, sort = true) {
    if (key === null || key === undefined) {
        return [];
    }

    const list = characterTagsService.list(key);
    if (sort) list.sort(compareTagsForSort);
    return list;
}


/**
 * Gets the current tag key based on the currently selected character
 */
function getTagKey() {
    if (requireCharacterTagsShellContext().state.this_chid !== undefined && requireCharacterTagsShellContext().state.menu_type === 'character_edit') {
        return requireCharacterTagsShellContext().state.characters[requireCharacterTagsShellContext().state.this_chid].avatar;
    }

    return null;
}

/**
 * Gets the tag key for any provided entity/id/key. If a valid tag key is provided, it just returns this.
 * Robust method to find a valid tag key for any entity.
 *
 * @param {object|number|string} entityOrKey An entity with id property (character, tag), or directly an id or tag key.
 * @returns {string|undefined} The tag key that can be found.
 */
export function getTagKeyForEntity(entityOrKey) {
    let x = entityOrKey;

    // If it's an object and has an 'id' property, we take this for further processing
    if (typeof x === 'object' && x !== null && 'id' in x) {
        x = x.id;
    }

    // Next lets check if its a valid character or character id, so we can swith it to its tag
    let character;
    if (!character && requireCharacterTagsShellContext().state.characters.indexOf(x) >= 0) character = x; // Check for char object
    if (!character && !isNaN(parseInt(entityOrKey))) character = requireCharacterTagsShellContext().state.characters[x]; // check if its a char id
    if (!character) character = requireCharacterTagsShellContext().state.characters.find(y => y.avatar === x); // check if its a char key

    if (character) {
        x = character.avatar;
    }

    // Uninitialized character tag map
    if (character && !(x in tag_map)) {
        return characterTagsService.ensureKey(x);
    }

    // We should hopefully have a key now. Let's check
    if (x in tag_map) {
        return x;
    }

    // If none of the above, we cannot find a valid tag key
    return undefined;
}

/**
 * Checks for a tag key based on an entity for a given element.
 * It checks the given element and upwards parents for a set character id (chid), and if there is any, returns its unique entity key.
 *
 * @param {JQuery<HTMLElement>|string} element - The element to search the entity id on
 * @returns {string|undefined} The tag key that can be found.
 */
export function getTagKeyForEntityElement(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    // Start with the given element and traverse up the DOM tree
    while (element.length && element.parent().length) {
        const chid = element.attr('data-chid');
        if (chid) {
            return getTagKeyForEntity(chid);
        }

        // Move up to the parent element
        element = element.parent();
    }

    return undefined;
}

/**
 * Gets the key for a character by searching based on the name or avatar. If none can be found, a toastr will be shown and null returned.

 * @param {string?} [charName] The optionally provided char name
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.suppressLogging=false] - Whether to suppress the toastr warning
 * @returns {string?} - The character key, or null if none found
 */
export function searchCharByName(charName, { suppressLogging = false } = {}) {
    const entity = charName
        ? findChar({ name: charName })
        : requireCharacterTagsShellContext().state.characters[requireCharacterTagsShellContext().state.this_chid];
    const key = getTagKeyForEntity(entity);
    if (!key) {
        if (!suppressLogging) toastr.warning(`Character ${charName} not found.`);
        return null;
    }
    return key;
}

/**
 * Adds one or more tags to a given entity
 *
 * @param {Tag|Tag[]} tag - The tag or tags to add
 * @param {string|string[]} entityId - The entity or entities to add this tag to. Has to be the entity key (e.g. `addTagToEntity`).
 * @param {object} [options={}] - Optional arguments
 * @param {JQuery<HTMLElement>|string?} [options.tagListSelector=null] - An optional selector if a specific list should be updated with the new tag too (for example because the add was triggered for that function)
 * @param {PrintTagListOptions} [options.tagListOptions] - Optional parameters for printing the tag list. Can be set to be consistent with the expected behavior of tags in the list that was defined before.
 * @returns {boolean} Whether at least one tag was added
 */
export function addTagsToEntity(tag, entityId, { tagListSelector = null, tagListOptions = {} } = {}) {
    const tags = Array.isArray(tag) ? tag : [tag];
    const entityIds = Array.isArray(entityId) ? entityId : [entityId];

    const keys = entityIds.map(id => id == null ? getTagKey() : getTagKeyForEntity(id)).filter(Boolean);
    const result = characterTagsService.assign(keys, tags.map(item => item.id), true);

    // We should manually add the selected tag to the print tag function, so we cover places where the tag list did not automatically include it
    tagListOptions.addTag = tags;

    // add tag to the UI and internal map - we reprint so sorting and new markup is done correctly
    if (tagListSelector) printTagList(tagListSelector, tagListOptions);


    return result;
}

/**
 * Removes a tag from a given entity
 * @param {Tag} tag - The tag to remove
 * @param {string|string[]} entityId - The entity to remove this tag from. Has to be the entity key (e.g. `addTagToEntity`). (Also allows multiple entities to be passed in)
 * @param {object} [options={}] - Optional arguments
 * @param {JQuery<HTMLElement>|string?} [options.tagListSelector=null] - An optional selector if a specific list should be updated with the tag removed too (for example because the add was triggered for that function)
 * @param {JQuery<HTMLElement>?} [options.tagElement=null] - Optionally a direct html element of the tag to be removed, so it can be removed from the UI
 * @returns {boolean} Whether at least one tag was removed
 */
export function removeTagFromEntity(tag, entityId, { tagListSelector = null, tagElement = null } = {}) {
    const ids = Array.isArray(entityId) ? entityId : [entityId];
    const keys = ids.map(id => id == null ? getTagKey() : getTagKeyForEntity(id)).filter(Boolean);
    const result = characterTagsService.remove(keys, [tag.id], true);

    // We don't reprint the lists, we can just remove the html elements from them.
    if (tagListSelector) {
        const $selector = (typeof tagListSelector === 'string') ? $(tagListSelector) : tagListSelector;
        $selector.find(`.tag[id="${tag.id}"]`).remove();
    }
    if (tagElement) tagElement.remove();


    return result;
}

/**
 * Adds a tag from a given character. If no character is provided, adds it from the currently active one.
 * @param {string} tagId - The id of the tag
 * @param {string} characterId - The id/key of the character
 * @returns {boolean} Whether the tag was added or not
 */

/**
 * Removes a tag from a given character. If no character is provided, removes it from the currently active one.
 * @param {string} tagId - The id of the tag
 * @param {string} characterId - The id/key of the character
 * @returns {boolean} Whether the tag was removed or not
 */
function removeTagFromMap(tagId, characterId = null) {
    const key = characterId !== null && characterId !== undefined ? getTagKeyForEntity(characterId) : getTagKey();
    return key ? characterTagsService.remove([key], [tagId], true) : false;
}

/**
 * Get a list of existing tags matching a list of provided new tag names
 *
 * @param {string[]} newTags - A list of strings representing tag names
 * @returns {Tag[]} List of existing tags
 */
function getExistingTags(newTags) {
    let existingTags = [];
    for (let tagName of newTags) {
        let foundTag = getTag(tagName);
        if (foundTag) {
            existingTags.push(foundTag);
        }
    }
    return existingTags;
}

const IMPORT_EXLCUDED_TAGS = ['ROOT', 'TAVERN'];
const ANTI_TROLL_MAX_TAGS = 50;

/**
 * Imports tags for a given character
 *
 * @param {Character} character - The character
 * @param {object} [options] - Options
 * @param {tag_import_setting} [options.importSetting=null] - Force a tag import setting
 * @returns {Promise<boolean>} Boolean indicating whether any tag was imported
 */
async function importTags(character, { importSetting = null } = {}) {
    const avatar = character.avatar;
    // Gather the tags to import based on the selected setting
    const tagNamesToImport = await handleTagImport(character, { importSetting });
    if (!requireCharacterTagsShellContext().state.characters.some(item => item.avatar === avatar)) return false;
    if (!tagNamesToImport?.length) {
        console.debug('No tags to import');
        return;
    }

    const tagsToImport = tagNamesToImport.map(tag => getTag(tag, { createNew: true }));
    const added = characterTagsService.assign([avatar], tagsToImport.map(tag => tag.id));
    const tagNames = tagsToImport.map(x => escapeHtml(x.name)).join(', ');

    if (added) {
        toastr.success(t`Imported tags:` + `<br />${tagNames}`, t`Importing Tags`, { escapeHtml: false });
    } else {
        toastr.error(t`Couldn't import tags:` + `<br />${tagNames}`, t`Importing Tags`, { escapeHtml: false });
    }

    return added;
}

/**
 * Handles the import of tags for a given character and returns the resulting list of tags to add
 *
 * @param {Character} character - The character
 * @param {object} [options] - Options
 * @param {tag_import_setting} [options.importSetting=null] - Force a tag import setting
 * @returns {Promise<string[]>} Array of strings representing the tags to import
 */
async function handleTagImport(character, { importSetting = null } = {}) {
    /** @type {string[]} */
    const alreadyAssignedTags = tag_map[character.avatar] ?? [];
    const importTags = character.tags.map(t => t.trim()).filter(t => t)
        .filter(t => !IMPORT_EXLCUDED_TAGS.includes(t))
        .filter(t => {
            const existingTag = getTag(t);
            return !existingTag || !alreadyAssignedTags.includes(existingTag.id);
        })
        .slice(0, ANTI_TROLL_MAX_TAGS);
    const existingTags = getExistingTags(importTags);
    const newTags = importTags.filter(t => !existingTags.some(existingTag => existingTag.name.toLowerCase() === t.toLowerCase()))
        .map(newTag);
    const folderTags = getOpenBogusFolders();

    // Choose the setting for this dialog. First check override, then saved setting or finally use "ASK".
    const setting = importSetting ?? tag_import_setting.ASK;

    switch (setting) {
        case tag_import_setting.ALL:
            return [...existingTags, ...newTags, ...folderTags].map(t => t.name);
        case tag_import_setting.ONLY_EXISTING:
            return [...existingTags, ...folderTags].map(t => t.name);
        case tag_import_setting.ASK: {
            if (!existingTags.length && !newTags.length && !folderTags.length) {
                return [];
            }
            return await showTagImportPopup(character, existingTags, newTags, folderTags);
        }
        case tag_import_setting.NONE:
            return [];
        default: throw new Error(`Invalid tag import setting: ${setting}`);
    }
}

/**
 * Shows a popup to import tags for a given character and returns the resulting list of tags to add
 *
 * @param {Character} character - The character
 * @param {Tag[]} existingTags - List of existing tags
 * @param {Tag[]} newTags - List of new tags
 * @param {Tag[]} folderTags - List of tags in the current folder
 * @returns {Promise<string[]>} Array of strings representing the tags to import
 */
async function showTagImportPopup(character, existingTags, newTags, folderTags) {
    /** @type {{[key: string]: import('./popup.js').CustomPopupButton}} */
    const importButtons = {
        NONE: { result: 2, text: 'Import None' },
        ALL: { result: 3, text: 'Import All' },
        EXISTING: { result: 4, text: 'Import Existing' },
    };
    const popupContent = $(await renderTemplateAsync('charTagImport', { charName: character.name }));

    // Print tags after popup is shown, so that events can be added
    printTagList(popupContent.find('#import_existing_tags_list'), { tags: existingTags, tagOptions: { removable: true, removeAction: tag => removeFromArray(existingTags, tag) } });
    printTagList(popupContent.find('#import_new_tags_list'), { tags: newTags, tagOptions: { removable: true, removeAction: tag => removeFromArray(newTags, tag) } });
    printTagList(popupContent.find('#import_folder_tags_list'), { tags: folderTags, tagOptions: { removable: true, removeAction: tag => removeFromArray(folderTags, tag) } });

    if (folderTags.length === 0) popupContent.find('#folder_tags_block').hide();

    const result = await callGenericPopup(popupContent, POPUP_TYPE.TEXT, null, {
        wider: true, okButton: 'Import', cancelButton: true,
        customButtons: Object.values(importButtons),
    });
    if (!result) {
        return [];
    }

    switch (result) {
        case POPUP_RESULT.AFFIRMATIVE: // Default 'Import' option where it imports all selected
        case importButtons.ALL.result:
            return [...existingTags, ...newTags, ...folderTags].map(t => t.name);
        case importButtons.EXISTING.result:
            return [...existingTags, ...folderTags].map(t => t.name);
        case importButtons.NONE.result:
        default:
            return [];
    }
}

/**
 * Gets a tag from the tags array based on the provided tag name (insensitive soft matching)
 * Optionally creates the tag if it doesn't exist
 *
 * @param {string} tagName - The name of the tag to search for
 * @param {object} [options={}] - Optional parameters
 * @param {boolean} [options.createNew=false] - Whether to create the tag if it doesn't exist
 * @returns {Tag?} The tag object that matches the provided tag name, or undefined if no match is found
 */
function getTag(tagName, { createNew = false } = {}) {
    let tag = characterTagsService.find(tagName);
    if (!tag && createNew) {
        tag = createNewTag(tagName);
    }
    return tag;
}

/**
 * Creates a new tag with default properties and a randomly generated id
 *
 * Does **not** trigger a save, so it's up to the caller to do that
 *
 * @param {string} tagName - name of the tag
 * @returns {Tag} the newly created tag, or the existing tag if it already exists (with a logged warning)
 */
function createNewTag(tagName) {
    const existing = getTag(tagName);
    if (existing) {
        toastr.warning(`Cannot create new tag. A tag with the name already exists:<br />${escapeHtml(existing.name)}`, 'Creating Tag', { escapeHtml: false });
        return existing;
    }

    const tag = characterTagsService.create(tagName);
    console.debug('Created new tag', tag.name, 'with id', tag.id);
    return tag;
}

/**
 * Creates a new tag object with the given tag name and default properties
 *
 * Not to be confused with `createNewTag`, which actually creates the tag and adds it to the existing list of tags.
 * Use this one to create temporary tag objects, for example for drawing.
 *
 * @param {string} tagName - The name of the tag
 * @return {Tag} The newly created tag object
 */
function newTag(tagName) {
    return {
        id: uuidv4(),
        name: tagName,
        folder_type: TAG_FOLDER_DEFAULT_TYPE,
        filter_state: DEFAULT_FILTER_STATE,
        sort_order: Math.max(0, ...tags.map(t => t.sort_order)) + 1,
        is_hidden_on_character_card: false,
        color: '',
        color2: '',
        create_date: Date.now(),
    };
}

/**
 * @typedef {object} TagOptions - Options for tag behavior. (Same object will be passed into "appendTagToList")
 * @property {boolean} [removable=false] - Whether tags can be removed.
 * @property {boolean} [isFilter=false] - Whether tags can be selected as a filter.
 * @property {function} [action=undefined] - Action to perform on tag interaction.
 * @property {(tag: Tag)=>boolean} [removeAction=undefined] - Action to perform on tag removal instead of the default remove action. If the action returns false, the tag will not be removed.
 * @property {boolean} [isGeneralList=false] - If true, indicates that this is the general list of tags.
 * @property {boolean} [skipExistsCheck=false] - If true, the tag gets added even if a tag with the same id already exists.
 * @property {boolean} [isCharacterList=false] - If true, indicates that this is the character's list of tags.
 * @property {boolean} [isInactive=false] - If true, indicates that the tag is inactive (for styling purposes).
 */

/**
 * @typedef {object} PrintTagListOptions - Optional parameters for printing the tag list.
 * @property {Tag[]|function(): Tag[]} [tags=undefined] - Optional override of tags that should be printed. Those will not be sorted. If no supplied, tags for the relevant character are printed. Can also be a function that returns the tags.
 * @property {Tag|Tag[]} [addTag=undefined] - Optionally provide one or multiple tags that should be manually added to this print. Either to the overridden tag list or the found tags based on the entity/key. Will respect the tag exists check.
 * @property {object|number|string} [forEntityOrKey=undefined] - Optional override for the chosen entity, otherwise the currently selected is chosen. Can be an entity with id property (character, tag), or directly an id or tag key.
 * @property {boolean|string} [empty=true] - Whether the list should be initially empty. If a string string is provided, 'always' will always empty the list, otherwise it'll evaluate to a boolean.
 * @property {boolean} [sort=true] - Whether the tags should be sorted via the sort function, or kept as is.
 * @property {function(object): function} [tagActionSelector=undefined] - An optional override for the action property that can be assigned to each tag via tagOptions.
 * If set, the selector is executed on each tag as input argument. This allows a list of tags to be provided and each tag can have it's action based on the tag object itself.
 * @property {TagOptions} [tagOptions={}] - Options for tag behavior. (Same object will be passed into "appendTagToList")
 * @property {string[]} [inactiveTags=[]] - List of tag IDs that are considered inactive (for styling purposes).
 */

/**
 * Prints the list of tags
 *
 * @param {JQuery<HTMLElement>|string} element - The container element where the tags are to be printed. (Optionally can also be a string selector for the element, which will then be resolved)
 * @param {PrintTagListOptions} [options] - Optional parameters for printing the tag list.
 */
function printTagList(element, { tags = undefined, addTag = undefined, forEntityOrKey = undefined, empty = true, sort = true, tagActionSelector = undefined, tagOptions = {}, inactiveTags = [] } = {}) {
    const $element = (typeof element === 'string') ? $(element) : element;
    const key = forEntityOrKey !== undefined ? getTagKeyForEntity(forEntityOrKey) : getTagKey();
    let printableTags = tags ? (typeof tags === 'function' ? tags() : tags) : getTagsList(key, sort);

    if (tagOptions.isCharacterList) {
        printableTags = printableTags.filter(tag => !tag.is_hidden_on_character_card);
    }

    if (empty === 'always' || (empty && (printableTags?.length > 0 || key))) {
        $element.empty();
    }

    if (addTag) {
        const addTags = Array.isArray(addTag) ? addTag : [addTag];
        printableTags = printableTags.concat(addTags.filter(tag => tagOptions.skipExistsCheck || !printableTags.some(t => t.id === tag.id)));
    }

    // one last sort, because we might have modified the tag list or manually retrieved it from a function
    if (sort) printableTags = printableTags.sort(compareTagsForSort);

    const customAction = typeof tagActionSelector === 'function' ? tagActionSelector : null;

    // Well, lets check if the tag list was expanded. Based on either a css class, or when any expand was clicked yet, then we search whether this element id matches
    const expanded = $element.hasClass('tags-expanded') || (expanded_tags_cache.length && expanded_tags_cache.indexOf(key ?? getTagKeyForEntityElement(element)) >= 0);

    // We prepare some stuff. No matter which list we have, there is a maximum value of tags we are going to display
    // Constants to define tag printing limits
    const DEFAULT_TAGS_LIMIT = 50;
    const tagsDisplayLimit = expanded ? Number.MAX_SAFE_INTEGER : DEFAULT_TAGS_LIMIT;

    // Functions to determine tag properties
    const isFilterActive = (/** @type {Tag} */ tag) => tag.filter_state && !isFilterState(tag.filter_state, FILTER_STATES.UNDEFINED);
    const shouldPrintTag = (/** @type {Tag} */ tag) => isBogusFolder(tag) || isFilterActive(tag);

    // Calculating the number of tags to print
    const mandatoryPrintTagsCount = printableTags.filter(shouldPrintTag).length;
    const availableSlotsForAdditionalTags = Math.max(tagsDisplayLimit - mandatoryPrintTagsCount, 0);

    // Counters for printed and hidden tags
    let additionalTagsPrinted = 0;
    let tagsSkipped = 0;

    for (const tag of printableTags) {
        // If we have a custom action selector, we override that tag options for each tag
        if (customAction) {
            const action = customAction(tag);
            if (action && typeof action !== 'function') {
                console.error('The action parameter must return a function for tag.', tag);
            } else {
                tagOptions.action = action;
            }
        }

        // Check if we should print this tag
        if (shouldPrintTag(tag) || additionalTagsPrinted++ < availableSlotsForAdditionalTags) {
            // Check if this tag is in the inactive list
            const isInactive = inactiveTags.includes(tag.id);
            appendTagToList($element, tag, { ...tagOptions, isInactive });
        } else {
            tagsSkipped++;
        }
    }

    // After the loop, check if we need to add the placeholder.
    // The placehold if clicked expands the tags and remembers either via class or cache array which was expanded, so it'll stay expanded until the next reload.
    if (tagsSkipped > 0) {
        const id = 'placeholder_' + uuidv4();

        // Add click event
        const showHiddenTags = (_, event) => {
            const elementKey = key ?? getTagKeyForEntityElement($element);
            console.log(`Hidden tags shown for element ${elementKey}`);

            // Mark the current character as expanded. This will be kept in memory until reload
            $element.addClass('tags-expanded');
            expanded_tags_cache.push(elementKey);

            // Do not bubble further, we are just expanding
            event.stopPropagation();
            printTagList($element, { tags: tags, addTag: addTag, forEntityOrKey: forEntityOrKey, empty: empty, tagActionSelector: tagActionSelector, tagOptions: tagOptions, inactiveTags: inactiveTags });
        };

        // Print the placeholder object with its styling and action to show the remaining tags
        /** @type {Tag} */
        const placeholderTag = { id: id, name: '...', title: `${tagsSkipped} tags not displayed.\n\nClick to expand remaining tags.`, color: 'transparent', action: showHiddenTags, class: 'placeholder-expander' };
        // It should never be marked as a removable tag, because it's just an expander action
        /** @type {TagOptions} */
        const placeholderTagOptions = { ...tagOptions, removable: false };
        appendTagToList($element, placeholderTag, placeholderTagOptions);
    }
}

/**
 * Appends a tag to the list element
 *
 * @param {JQuery<HTMLElement>} listElement - List element
 * @param {Tag} tag - Tag object to append
 * @param {TagOptions} [options={}] - Options for tag behavior
 * @returns {void}
 */
function appendTagToList(listElement, tag, { removable = false, isFilter = false, action = undefined, removeAction = undefined, isGeneralList = false, skipExistsCheck = false, isInactive = false } = {}) {
    if (!listElement) {
        return;
    }
    if (!skipExistsCheck && $(listElement).find(`.tag[id="${tag.id}"]`).length > 0) {
        return;
    }

    let tagElement = TAG_TEMPLATE.clone();
    tagElement.attr('id', tag.id);

    //tagElement.css('color', 'var(--SmartThemeBodyColor)');
    tagElement.css('background-color', tag.color);
    tagElement.css('color', tag.color2);

    tagElement.find('.tag_name').text(tag.name);
    const removeButton = tagElement.find('.tag_remove');
    if (removable) removeButton.show(); else removeButton.hide();
    if (removable && removeAction) {
        tagElement.attr('custom-remove-action', String(true));
        removeButton.on('click', () => {
            const result = removeAction(tag);
            if (result !== false) tagElement.remove();
        });
    }

    if (tag.class) {
        tagElement.addClass(tag.class);
    }
    if (tag.title) {
        tagElement.attr('title', tag.title);
    }
    if (tag.icon) {
        tagElement.find('.tag_name').text('').attr('title', `${translate(tag.name)} ${tag.title || ''}`.trim()).addClass(tag.icon);
        tagElement.addClass('actionable');
    }
    if (isInactive) {
        tagElement.addClass('tag-absent');
    }

    // We could have multiple ways of actions passed in. The manual arguments have precendence in front of a specified tag action
    const clickableAction = action ?? tag.action;

    // If this is a tag for a general list and its either a filter or actionable, lets mark its current state
    if ((isFilter || clickableAction) && isGeneralList) {
        const filterHelper = getFilterHelper($(listElement));
        const isFilterActionable = clickableAction && 'filter_state' in tag;

        if (isFilter || isFilterActionable) {
            const filterState = determineTagFilterState(filterHelper, tag, isFilterActionable);
            toggleTagThreeState(tagElement, { stateOverride: filterState });
        }
    }

    if (isFilter) {
        tagElement.on('click', () => onTagFilterClick.bind(tagElement)(listElement));
        tagElement.addClass(INTERACTABLE_CONTROL_CLASS);
    }

    if (clickableAction) {
        const filter = getFilterHelper($(listElement));
        tagElement.on('click', (e) => clickableAction.bind(tagElement)(filter, e));
        tagElement.addClass('clickable-action').addClass(INTERACTABLE_CONTROL_CLASS);
    }

    $(listElement).append(tagElement);
}

function onTagFilterClick(listElement) {
    const tagId = $(this).attr('id');
    const existingTag = tags.find((tag) => tag.id === tagId);
    const parent = $(this).parents('.tags');

    let state = toggleTagThreeState($(this));

    const filterHelper = getFilterHelper($(listElement));

    // Update the tag's filter_state for the main character list (backward compatibility)
    if (existingTag && isMainCharacterList(filterHelper)) {
        existingTag.filter_state = state;
        requireCharacterTagsShellContext().saveSettingsDebounced();
    }

    // Persist to storage for all contexts
    const storagePrefix = getFilterStorageKey(filterHelper);
    if (storagePrefix && existingTag) {
        const storageKey = `${storagePrefix}_tag_${tagId}`;
        accountStorage.setItem(storageKey, state);
    }

    // Apply all tag filters by reading from DOM state (this triggers the filter helper update)
    runTagFilters(listElement);

    // Focus the tag again we were at, if possible. To improve keyboard navigation
    setTimeout(() => parent.find(`.tag[id="${tagId}"]`).trigger('focus'), requireCharacterTagsShellContext().state.DEFAULT_PRINT_TIMEOUT + 1);

    updateTagFilterIndicator(listElement);
}

/**
 * Builds the plain-data view state for the React-owned character tag filter
 * controls. Actionable tags come first, then every used tag with its current
 * filter state (for the popover picker rows), then the subset with an active
 * filter state for the always-visible inline pills, plus open-folder drilldown
 * chips.
 * @param {FilterHelper} filterHelper - Filter helper owning the character list context
 * @returns {{actionableTags: object[], inListActionableTags: object[], tags: object[], activeTags: object[], drilldownTags: object[], hasActiveTagFilters: boolean}}
 */
export function createCharacterTagFilterViewState(filterHelper) {
    const actionTags = Object.values(ACTIONABLE_TAGS);

    const toChipModel = (tag) => {
        const isActionableFilter = 'filter_state' in tag;
        return {
            id: String(tag.id),
            name: String(tag.name ?? ''),
            title: tag.title ? String(tag.title) : '',
            icon: tag.icon ? String(tag.icon) : '',
            className: tag.class ? String(tag.class) : '',
            color: tag.color ?? '',
            color2: tag.color2 ?? '',
            actionable: true,
            removable: false,
            filterState: isActionableFilter ? determineTagFilterState(filterHelper, tag, true) : null,
        };
    };

    const usedTagIds = new Set(Object.values(tag_map).flat());
    const printableTags = tags.filter(tag => usedTagIds.has(tag.id)).sort(compareTagsForSort);
    const tagModels = printableTags.map(tag => ({
        id: String(tag.id),
        name: String(tag.name ?? ''),
        title: tag.title ? String(tag.title) : '',
        icon: '',
        className: tag.class ? String(tag.class) : '',
        color: tag.color ?? '',
        color2: tag.color2 ?? '',
        actionable: false,
        removable: false,
        filterState: determineTagFilterState(filterHelper, tag, false),
    }));
    const activeTags = tagModels
        .filter(tag => !isFilterState(tag.filterState, FILTER_STATES.UNDEFINED))
        .map(tag => ({ ...tag, removable: true, blockLegacyRemove: true }));

    const drilldownTags = getOpenBogusFolders().map(tag => ({
        id: String(tag.id),
        name: String(tag.name ?? ''),
        title: tag.title ? String(tag.title) : '',
        icon: '',
        className: tag.class ? String(tag.class) : '',
        color: tag.color ?? '',
        color2: tag.color2 ?? '',
        actionable: false,
        removable: true,
        filterState: null,
    }));

    const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG) ?? { selected: [], excluded: [] };

    return {
        actionableTags: actionTags.map(toChipModel),
        inListActionableTags: Object.values(InListActionable).map(toChipModel),
        tags: tagModels,
        activeTags,
        drilldownTags,
        hasActiveTagFilters: (Array.isArray(tagFilterData.selected) ? tagFilterData.selected.length : 0) > 0
            || (Array.isArray(tagFilterData.excluded) ? tagFilterData.excluded.length : 0) > 0,
    };
}

/**
 * Persists a tag's tri-state filter value for a character-list context: updates
 * the filter helper data, mirrors the state onto the tag entity (main list only),
 * and writes the per-account storage override.
 * @param {string} tagId - The tag id to update
 * @param {string} nextState - A FILTER_STATES key (SELECTED/EXCLUDED/UNDEFINED)
 * @param {FilterHelper} filterHelper - Filter helper owning the list context
 * @returns {string} The applied filter state key
 */
function writeCharacterTagFilterState(tagId, nextState, filterHelper) {
    const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG) ?? { selected: [], excluded: [] };
    nextState = isFilterState(nextState, FILTER_STATES.SELECTED) ? FILTER_STATES.SELECTED.key
        : isFilterState(nextState, FILTER_STATES.EXCLUDED) ? FILTER_STATES.EXCLUDED.key : FILTER_STATES.UNDEFINED.key;
    filterHelper.setFilterData(FILTER_TYPES.TAG, characterTagsService.filterState(tagFilterData, tagId, nextState));

    const existingTag = tags.find(tag => String(tag.id) === String(tagId));
    if (existingTag && isMainCharacterList(filterHelper)) {
        characterTagsService.setProperty(existingTag.id, 'filter_state', nextState);
    }
    const storagePrefix = getFilterStorageKey(filterHelper);
    if (storagePrefix && existingTag) {
        accountStorage.setItem(`${storagePrefix}_tag_${tagId}`, nextState);
    }

    return nextState;
}

/**
 * Sets a character-list tag filter to an explicit tri-state value, without
 * reading DOM state. Used by the React-owned tag filter popover and pills.
 * @param {string} tagId - The tag id to update
 * @param {string} nextState - A FILTER_STATES key (SELECTED/EXCLUDED/UNDEFINED)
 * @param {FilterHelper} [filterHelper] - Filter helper owning the list context
 * @returns {string} The applied filter state key
 */
export function setCharacterTagFilterState(tagId, nextState, filterHelper = requireCharacterTagsShellContext().state.entitiesFilter) {
    return writeCharacterTagFilterState(tagId, nextState, filterHelper);
}

/**
 * Cycles a character-list tag filter chip through SELECTED → EXCLUDED → UNDEFINED
 * directly on the filter data, without reading DOM state. Used by React-owned chips.
 * @param {string} tagId - The tag id to cycle
 * @param {FilterHelper} [filterHelper] - Filter helper owning the list context
 * @returns {string} The resulting filter state key
 */
export function cycleCharacterTagFilterState(tagId, filterHelper = requireCharacterTagsShellContext().state.entitiesFilter) {
    const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG) ?? { selected: [], excluded: [] };
    const selected = Array.isArray(tagFilterData.selected) ? tagFilterData.selected : [];
    const excluded = Array.isArray(tagFilterData.excluded) ? tagFilterData.excluded : [];

    let nextState;
    if (selected.includes(tagId)) {
        nextState = FILTER_STATES.EXCLUDED.key;
    } else if (excluded.includes(tagId)) {
        nextState = FILTER_STATES.UNDEFINED.key;
    } else {
        nextState = FILTER_STATES.SELECTED.key;
    }

    return writeCharacterTagFilterState(tagId, nextState, filterHelper);
}

/**
 * Opens the tag management popup for the character list context.
 * @returns {Promise<void>}
 */
export function openCharacterTagManager() {
    return onViewTagsListClick();
}

/**
 * Runs the click action of an actionable character tag filter chip (favorites,
 * folders, tag manager, tag list visibility, clear filters, or extension-provided
 * in-list actionables) with the same arguments the legacy chip binding used.
 * @param {string} tagId - The actionable tag id
 * @param {FilterHelper} [filterHelper] - Filter helper owning the list context
 * @returns {boolean} Whether an action was found and invoked
 */
export function runCharacterTagFilterAction(tagId, filterHelper = requireCharacterTagsShellContext().state.entitiesFilter) {
    const actionableTags = [...Object.values(ACTIONABLE_TAGS), ...Object.values(InListActionable)];
    const tag = actionableTags.find(item => String(item.id) === String(tagId));
    if (!tag || typeof tag.action !== 'function') {
        return false;
    }

    tag.action.call(null, filterHelper, null);
    return true;
}

/**
 * Loads persisted filter states for a given filter context.
 * @param {FilterHelper} filterHelper - The filter helper instance
 * @param {string} storagePrefix - The storage key prefix for this context
 */
function loadFilterStatesForContext(filterHelper, storagePrefix) {
    const validStates = new Set(Object.keys(FILTER_STATES));
    const readState = (/** @type {string} */ storageKey) => {
        const v = accountStorage.getItem(storageKey);
        return v && validStates.has(v) ? v : null;
    };

    // Load actionable tag states (Favorites)
    const favState = readState(`${storagePrefix}_${ACTIONABLE_FILTER_STORAGE_KEYS.FAV}`);
    if (favState) {
        filterHelper.setFilterData(FILTER_TYPES.FAV, favState, true);
    }

    // Load regular tag filter states
    const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG);
    for (const tag of tags) {
        const storageKey = `${storagePrefix}_tag_${tag.id}`;
        const state = readState(storageKey);

        if (state) {
            if (state === 'SELECTED') {
                if (!tagFilterData.selected.includes(tag.id)) {
                    tagFilterData.selected.push(tag.id);
                }
            } else if (state === 'EXCLUDED') {
                if (!tagFilterData.excluded.includes(tag.id)) {
                    tagFilterData.excluded.push(tag.id);
                }
            }
        }
    }
    filterHelper.setFilterData(FILTER_TYPES.TAG, tagFilterData, true);
}

/**
 * Toggle the filter state of a given tag element
 *
 * @param {JQuery<HTMLElement>} element - The jquery element representing the tag for which the state should be toggled
 * @param {object} param1 - Optional parameters
 * @param {import('./filters.js').FilterState|string} [param1.stateOverride] - Optional state override to which the state should be toggled to. If not set, the state will move to the next one in the chain.
 * @param {boolean} [param1.simulateClick] - Optionally specify that the state should not just be set on the html element, but actually achieved via triggering the "click" on it, which follows up with the general click handlers and reprinting
 * @returns {string} The string representing the new state
 */
function toggleTagThreeState(element, { stateOverride = undefined, simulateClick = false } = {}) {
    const states = Object.keys(FILTER_STATES);

    // Make it clear we're getting indexes and handling the 'not found' case in one place
    function getStateIndex(key, fallback) {
        const index = states.indexOf(key);
        return index !== -1 ? index : states.indexOf(fallback);
    }

    const overrideKey = typeof stateOverride == 'string' && states.includes(stateOverride) ? stateOverride : Object.keys(FILTER_STATES).find(key => FILTER_STATES[key] === stateOverride);

    const currentStateIndex = getStateIndex(element.attr('data-toggle-state'), DEFAULT_FILTER_STATE);
    const targetStateIndex = overrideKey !== undefined ? getStateIndex(overrideKey, DEFAULT_FILTER_STATE) : (currentStateIndex + 1) % states.length;

    if (simulateClick) {
        // Calculate how many clicks are needed to go from the current state to the target state
        let clickCount = 0;
        if (targetStateIndex >= currentStateIndex) {
            clickCount = targetStateIndex - currentStateIndex;
        } else {
            clickCount = (states.length - currentStateIndex) + targetStateIndex;
        }

        for (let i = 0; i < clickCount; i++) {
            $(element).trigger('click');
        }

        console.debug('manually click-toggle three-way filter from', states[currentStateIndex], 'to', states[targetStateIndex], 'on', element);
    } else {
        element.attr('data-toggle-state', states[targetStateIndex]);

        // Update css class and remove all others
        states.forEach(state => {
            element.toggleClass(FILTER_STATES[state].class, state === states[targetStateIndex]);
        });

        if (states[currentStateIndex] !== states[targetStateIndex]) {
            console.debug('toggle three-way filter from', states[currentStateIndex], 'to', states[targetStateIndex], 'on', element);
        }
    }


    return states[targetStateIndex];
}

function runTagFilters(listElement) {
    const tagIds = $(listElement).find('.tag.selected:not(.actionable)').map((_, el) => $(el).attr('id')).get();
    const excludedTagIds = $(listElement).find('.tag.excluded:not(.actionable)').map((_, el) => $(el).attr('id')).get();
    const filterHelper = getFilterHelper($(listElement));
    filterHelper.setFilterData(FILTER_TYPES.TAG, { excluded: excludedTagIds, selected: tagIds });
}

function printTagFilters(_type = tag_filter_type.character) {
    removeMissingTagFilters();
}

/**
 * Updates the tag filter indicator based on the selected/excluded tags in the given filter selector
 * @param {string|JQuery<HTMLElement>} filterSelector - The selector or jQuery element for the tag filter container
 */
function updateTagFilterIndicator(filterSelector) {
    const selector = filterSelector || CHARACTER_FILTER_SELECTOR;
    const tagFilter = typeof selector === 'string' ? $(selector) : selector;
    const showTagListButton = tagFilter.closest('.rm_tag_controls').find('.showTagList');
    const hasActiveTags = tagFilter.find('.tag:not(.actionable)').is('.selected, .excluded');
    showTagListButton.toggleClass('indicator', hasActiveTags);
}


function onCharacterCreateClick() {
    characterTagsService.setDraft([]);
}

export function applyTagsOnCharacterSelect(_chid = null) {
    // The legacy authoring form is hidden; React owns the visible editor.
}

async function onViewTagsListClick() {
    const html = $(document.createElement('div'));
    html.attr('id', 'tag_view_list');
    const tagManagementHost = $(document.createElement('div'));
    html.append(tagManagementHost);
    const workspacePanels = await loadWorkspacePanelsModule();
    let cleanup = () => {};
    try {
        const result = callGenericPopup(html, POPUP_TYPE.TEXT, null, { allowVerticalScrolling: true, wide: true, large: true });
        // Mount after the popup is connected: the color picker emits a change
        // when connected, before React's effects subscribe to user edits.
        cleanup = workspacePanels.mountTagManagement(tagManagementHost.get(0), { runtime: createTagManagementRuntime() });
        await result;
    } finally {
        cleanup();
    }
}

function sortTags(tags, counts = null) {
    return tags.slice().sort((a, b) => compareTagsForSort(a, b, counts));
}

/**
 * Compares two given tags and returns the compare result
 *
 * @param {Tag} a - First tag
 * @param {Tag} b - Second tag
 * @param {Map<string, number>} [counts=null] - Optional map of tag ID to usage count
 * @returns {number} The compare result
 */
function compareTagsForSort(a, b, counts = null) {
    return characterTagsService.compare(a, b, power_user.tag_sort_mode, counts || undefined);
}

function onTagsBackupClick() {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `tags_${timestamp}.json`;
    const data = {
        tags: tags,
        tag_map: tag_map,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    download(blob, filename, 'application/json');
}

/**
 * Clears all filters for the current list context.
 * @param {FilterHelper} filterHelper - The filter helper for the current context
 */
export function onClearAllFiltersClick(filterHelper) {
    console.debug('clear all filters clicked');

    const context = getFilterContext(filterHelper);
    if (!context) {
        console.warn('Unknown filter helper in onClearAllFiltersClick');
        return;
    }

    const { selected = [], excluded = [] } = filterHelper.getFilterData(FILTER_TYPES.TAG) || {};
    for (const id of new Set([...selected, ...excluded])) writeCharacterTagFilterState(id, DEFAULT_FILTER_STATE, filterHelper);
    if (filterHelper.getFilterData(FILTER_TYPES.FAV) !== DEFAULT_FILTER_STATE) {
        const storagePrefix = getFilterStorageKey(filterHelper);
        if (storagePrefix) accountStorage.setItem(`${storagePrefix}_${ACTIONABLE_FILTER_STORAGE_KEYS.FAV}`, DEFAULT_FILTER_STATE);
        if (isMainCharacterList(filterHelper)) ACTIONABLE_TAGS.FAV.filter_state = DEFAULT_FILTER_STATE;
        filterHelper.setFilterData(FILTER_TYPES.FAV, DEFAULT_FILTER_STATE);
    }

    // Reset search input for this context
    $(context.searchInput).val('').trigger('input');
}

/**
 * Copy tags from one character to another.
 * @param {{oldAvatar: string, newAvatar: string}} data Event data
 */
function copyTags(data) {
    characterTagsService.copyKey(data.oldAvatar, data.newAvatar);
}

function removeMissingTagFilters() {
    const tagIds = new Set(tags.map(tag => tag.id));
    const assignedTagIds = new Set(Object.values(tag_map).flat());
    const openBogusFolderIds = new Set(getOpenBogusFolders().map(tag => tag.id));
    const isEmptyOpenBogusFolder = (tagId) => openBogusFolderIds.has(tagId) && !assignedTagIds.has(tagId);

    for (const helper of [requireCharacterTagsShellContext().state.entitiesFilter]) {
        const { selected, excluded } = helper.getFilterData(FILTER_TYPES.TAG);
        let anyRemoved = false;

        if (Array.isArray(selected)) {
            for (let i = selected.length - 1; i >= 0; i--) {
                if (!tagIds.has(selected[i]) || isEmptyOpenBogusFolder(selected[i])) {
                    selected.splice(i, 1);
                    anyRemoved = true;
                }
            }
        }

        if (Array.isArray(excluded)) {
            for (let i = excluded.length - 1; i >= 0; i--) {
                if (!tagIds.has(excluded[i]) || isEmptyOpenBogusFolder(excluded[i])) {
                    excluded.splice(i, 1);
                    anyRemoved = true;
                }
            }
        }

        if (anyRemoved) {
            helper.setFilterData(FILTER_TYPES.TAG, { selected, excluded });
        }
    }
}

export function applyCharacterTagsToMessageDivs({ mesIds = [] } = {}) {
    try {
        const messagesFilter = buildMessagesFilter(mesIds);
        const messages = $('#chat').children(messagesFilter);

        // Clear existing tags
        messages.each(function () {
            const element = this; // Get the raw DOM element

            for (const attr of Array.from(element.attributes)) {
                if (attr.name.startsWith('data-char-tag-') || attr.name === 'data-char-tags') {
                    element.removeAttribute(attr.name);
                }
            }
        });

        const tagsList = tags, characterTagData = tag_map;

        if (!tagsList?.length || !characterTagData) {
            return;
        }

        const tagNamesById = tagsList.reduce((acc, tag) => {
            acc[tag.id] = tag.name;
            return acc;
        }, {});

        const characterTagsCache = new Map();

        // Iterate each message div
        messages.each(function () {
            const $this = $(this); // Store the jQuery object
            const avatarFileName = extractCharacterAvatar($this.find('.avatar img').attr('src'));

            if (!avatarFileName) {
                return;
            }

            let tagsForCharacter = characterTagsCache.get(avatarFileName);

            // If tags are NOT in the cache, compute and store them
            if (!tagsForCharacter) {
                const tagIds = characterTagData[avatarFileName];
                if (tagIds?.length) {
                    const tagNames = tagIds
                        .map(id => tagNamesById[id])
                        .filter(Boolean);

                    if (tagNames.length) {
                        tagsForCharacter = {
                            tagNames,
                            joinedTagNames: tagNames
                                .map(name => name?.replace(/,/g, ' ')) // replace commas with spaces to avoid issues with tag names containing commas
                                .join(','),
                        };
                        // Add the newly computed tags to the cache
                        characterTagsCache.set(avatarFileName, tagsForCharacter);
                    }
                }
            }

            // If we have tags (either from cache or newly computed), apply them
            if (tagsForCharacter) {
                applyTags($this, tagsForCharacter);
            }
        });
    } catch (error) {
        console.error('Error applying character tags to message divs:', error);
    }
}

/**
 * Builds a jQuery selector string to filter messages by their IDs.
 * @param {number|number[]} mesIds - An id or array of message IDs to filter by.
 * @returns {string} A jQuery selector string that matches messages with the specified IDs.
 * If mesIds is empty, it returns '.mes' to select all messages.
 * @example
 * buildMessagesFilter([1, 5]); // Returns '.mes[mesid="1"],.mes[mesid="5"]'
 * buildMessagesFilter([]); // Returns '.mes'
 */
function buildMessagesFilter(mesIds) {
    const allMessages = '.mes';

    if (!mesIds) {
        return allMessages; // If no mesIds provided, select all messages
    }

    const mesIdsArray = Array.isArray(mesIds) ? mesIds : [mesIds];

    if (mesIdsArray?.length) {
        // Create a valid jQuery selector for multiple attribute values.
        // Example output: '.mes[mesid="1"],.mes[mesid="5"]'
        return mesIdsArray.map(id => `.mes[mesid="${id}"]`).join(',');
    }

    // If mesIds is empty, select all messages.
    return allMessages;
}

/**
 * Helper function to apply all necessary data attributes to a DOM element.
 * @param {JQuery<HTMLElement>} $element - The jQuery object for the message div.
 * @param {object} tagData - An object containing tag information.
 * @param {string[]} tagData.tagNames - An array of tag names.
 * @param {string} tagData.joinedTagNames - A comma-separated string of tag names.
 */
function applyTags($element, tagData) {
    $element.attr('data-char-tags', tagData.joinedTagNames);
    tagData.tagNames.forEach(tagName => {
        const normalizedTagName = normalizeTagName(tagName);

        if (!normalizedTagName) {
            return; // Skip empty tag names
        }

        $element.attr(`data-char-tag-${normalizedTagName}`, '');
    });
}

/**
 * Normalizes a tag name by trimming, converting spaces to hyphens, replacing accented characters,
 * removing special characters, and converting to lowercase.
 * @param {string} name The tag name to normalize.
 * @returns {string} The normalized tag name.
 */
function normalizeTagName(name) {
    if (!name?.trim()) {
        return '';
    }

    // Normalize the tag name by trimming, converting spaces to hyphens, replacing accented characters, removing special characters, and converting to lowercase
    return name.trim()
        .normalize('NFD') // Normalize accented characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
        .replace(/[^a-zA-Z0-9\s_-]/g, '') // Remove special characters except spaces, underscores, and hyphens
        .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
        .toLowerCase();
}

/**
 * Extracts the character avatar file name from the avatar source URL.
 * @param {string} avatarSrc The source URL of the character avatar.
 * @returns {string|null} The normalized avatar file name, or null if the input is falsy or doesn't contain a valid file name.
 */
function extractCharacterAvatar(avatarSrc) {
    if (!avatarSrc) {
        return null;
    }

    try {
        const url = new URL(avatarSrc, window.location.origin);
        return url?.searchParams.get('file');
    } catch (error) {
        console.error('Unable to parse character avatar using avatarSrc', avatarSrc, error);
        return null;
    }
}

function restoreSavedTagFilters() {
    try {
        loadFilterStatesForContext(requireCharacterTagsShellContext().state.entitiesFilter, 'CharacterList');
    } catch (e) {
        console.warn('Failed to restore actionable filter states from account storage', e);
    }
}

export function initTags() {
    $(document).on('click', '#rm_button_create', onCharacterCreateClick);
    $(document).on('click', '.tags_view', function (event) {
        // 1. Prevent the label from toggling the checkbox
        event.preventDefault();
        // 2. Open the tag view list dialog
        onViewTagsListClick();
    });
    eventSource.on(event_types.CHARACTER_DUPLICATED, copyTags);
    eventSource.makeFirst(event_types.CHAT_CHANGED, () => applyTagsOnCharacterSelect());

    restoreSavedTagFilters();
}
