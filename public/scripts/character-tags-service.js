/**
 * Model operations over the host's live tag settings. The host retains ownership
 * of settings loading, persistence and presentation.
 * @param {object} deps
 * @param {() => any[]} deps.getTags
 * @param {() => Record<string, string[]>} deps.getMap
 * @param {() => any[]} deps.getCharacters
 * @param {(a: string, b: string) => boolean} deps.equalNames
 * @param {(name: string) => any} deps.newTag
 * @param {(messageTagsChanged: boolean) => void} deps.changed
 */
export function createCharacterTagsService({ getTags, getMap, getCharacters, equalNames, newTag, changed }) {
    let draft = [];
    const find = name => getTags().find(tag => equalNames(tag.name, name));
    const validKeys = keys => [...new Set(keys)].filter(key => getCharacters().some(character => character.avatar === key));
    const hasTag = id => getTags().some(tag => tag.id === id);
    const notify = (messageTagsChanged = true) => changed(messageTagsChanged);
    const getDraft = () => [...draft];
    const setDraft = ids => { draft = [...new Set(ids)].filter(hasTag); };

    function create(name) {
        const existing = find(name);
        if (existing) return existing;
        const tag = newTag(name);
        getTags().push(tag);
        notify(false);
        return tag;
    }

    function assign(keys, ids, allowMapKeys = false) {
        let dirty = false;
        const validIds = [...new Set(ids)].filter(hasTag);
        for (const key of allowMapKeys ? [...new Set(keys)].filter(key => key && (Object.hasOwn(getMap(), key) || validKeys([key]).length)) : validKeys(keys)) {
            const current = getMap()[key] || [];
            const next = [...new Set([...current, ...validIds])];
            if (next.length !== current.length) {
                getMap()[key] = next;
                dirty = true;
            }
        }
        if (dirty) notify();
        return dirty;
    }

    function remove(keys, ids, allowMapKeys = false) {
        let dirty = false;
        for (const key of allowMapKeys ? [...new Set(keys)].filter(key => key && (Object.hasOwn(getMap(), key) || validKeys([key]).length)) : validKeys(keys)) {
            const current = getMap()[key] || [];
            const next = current.filter(id => !ids.includes(id));
            if (next.length !== current.length) {
                getMap()[key] = next;
                dirty = true;
            }
        }
        if (dirty) notify();
        return dirty;
    }

    function mutual(keys) {
        keys = validKeys(keys);
        if (!keys.length) return [];
        return getTags().filter(tag => keys.every(key => (getMap()[key] || []).includes(tag.id)));
    }

    function reset(keys) {
        let dirty = false;
        for (const key of validKeys(keys)) {
            if ((getMap()[key] || []).length) {
                getMap()[key] = [];
                dirty = true;
            }
        }
        if (dirty) notify();
        return dirty;
    }

    function replace(key, ids) {
        if (!key) return;
        getMap()[key] = [...new Set(ids)].filter(hasTag);
        notify();
    }

    function deleteKey(key) {
        if (Object.hasOwn(getMap(), key)) {
            delete getMap()[key];
            notify();
        }
    }

    function list(key) {
        return (getMap()[key] || []).map(id => getTags().find(tag => tag.id === id)).filter(Boolean);
    }

    function ensureKey(key) {
        if (key && !Object.hasOwn(getMap(), key)) getMap()[key] = [];
        return key;
    }

    function filterState(data, id, state) {
        const selected = (data.selected || []).filter(value => String(value) !== String(id));
        const excluded = (data.excluded || []).filter(value => String(value) !== String(id));
        if (state === 'SELECTED') selected.push(id);
        if (state === 'EXCLUDED') excluded.push(id);
        return { selected, excluded };
    }

    function filterEntities(entities, data, { globalDisplayFilters = false, subForEntity, filterHidden = true, search, isTagged }) {
        entities = entities.filter(entity => entity.type !== 'tag' || (!data.selected.includes(entity.id) && !data.excluded.includes(entity.id)));
        if (globalDisplayFilters) {
            const closed = entities.filter(entity => entity.type === 'tag' && entity.item.folder_type === 'CLOSED');
            entities = entities.filter(entity => {
                if (filterHidden && entity.type !== 'tag' && closed.some(folder => isTagged(entity, folder.id) && !data.selected.includes(folder.id))) return false;
                return entity.type !== 'tag' || entity.entities.length > 0 || search;
            });
        }
        if (subForEntity?.type === 'tag') {
            const tag = subForEntity.item;
            const closed = entities.filter(entity => entity.type === 'tag' && entity.item.folder_type === 'CLOSED');
            entities = entities.filter(entity => entity.type !== 'tag' && isTagged(entity, tag.id)
                && !(filterHidden && tag.folder_type !== 'CLOSED' && closed.some(folder => isTagged(entity, folder.id) && !data.selected.includes(folder.id))));
        }
        return entities;
    }

    function rename(id, name) {
        const tag = getTags().find(item => item.id === id);
        name = name.trim();
        if (!tag || !name || getTags().some(item => item !== tag && equalNames(item.name, name))) return false;
        if (tag.name !== name) { tag.name = name; notify(); }
        return true;
    }

    function setProperty(id, field, value) {
        const tag = getTags().find(item => item.id === id);
        if (!tag || tag[field] === value) return false;
        tag[field] = value;
        notify(false);
        return true;
    }

    function deleteTag(id, mergeId = null) {
        const index = getTags().findIndex(tag => tag.id === id);
        if (index < 0) return false;
        if (mergeId === id || !hasTag(mergeId)) mergeId = null;
        for (const key of Object.keys(getMap())) {
            const ids = getMap()[key];
            if (Array.isArray(ids) && ids.includes(id)) {
                getMap()[key] = [...new Set(ids.flatMap(value => value === id ? (mergeId ? [mergeId] : []) : [value]))];
            }
        }
        getTags().splice(index, 1);
        notify();
        return true;
    }

    function copyKey(oldKey, newKey) {
        getMap()[newKey] = [...new Set([...(getMap()[newKey] || []), ...(getMap()[oldKey] || [])])];
        notify();
    }

    function renameKey(oldKey, newKey) {
        if (oldKey === newKey) return;
        getMap()[newKey] = getMap()[oldKey] || [];
        delete getMap()[oldKey];
        notify();
    }

    function compare(a, b, mode, counts = new Map()) {
        const alphabetical = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        if (mode === 'alphabetical') return alphabetical;
        if (mode === 'by_entries') return ((counts.get(b.id) || 0) - (counts.get(a.id) || 0)) || alphabetical;
        if (a.sort_order !== undefined && b.sort_order !== undefined) return a.sort_order - b.sort_order;
        if (a.sort_order !== undefined) return -1;
        if (b.sort_order !== undefined) return 1;
        return alphabetical;
    }

    function sorted(items, mode, counts) {
        if (!counts && mode === 'by_entries') {
            counts = new Map();
            for (const ids of Object.values(getMap())) for (const id of ids || []) counts.set(id, (counts.get(id) || 0) + 1);
        }
        return items.slice().sort((a, b) => compare(a, b, mode, counts));
    }

    function reorder(ids) {
        ids.forEach((id, index) => { const tag = getTags().find(item => item.id === id); if (tag) tag.sort_order = index; });
        notify(false);
    }

    function prune() {
        const assigned = new Set(Object.values(getMap()).flat());
        const avatars = new Set(getCharacters().map(character => String(character.avatar)));
        for (let i = getTags().length - 1; i >= 0; i--) if (!assigned.has(getTags()[i].id)) getTags().splice(i, 1);
        for (const key of Object.keys(getMap())) if (!avatars.has(key)) delete getMap()[key];
        notify();
    }
    /** Merge a settings backup, preserving existing IDs on name collisions. */
    function restore(data, overwrite = false) {
        if (!data || !Array.isArray(data.tags) || !data.tag_map || typeof data.tag_map !== 'object' || Array.isArray(data.tag_map)) {
            return { valid: false, warnings: ['Invalid file format'] };
        }
        const warnings = [];
        const remapped = new Map();
        for (const tag of data.tags) {
            if (!tag?.id || !tag?.name || typeof tag.name !== 'string') {
                warnings.push(`Tag object is invalid: ${JSON.stringify(tag)}.`);
                continue;
            }
            let existing = getTags().find(item => item.id === tag.id);
            if (existing && !overwrite) {
                warnings.push(`Tag '${tag.name}' with id ${tag.id} already exists.`);
                continue;
            }
            const sameId = existing;
            existing = find(tag.name);
            if (existing && !overwrite) {
                warnings.push(`Tag with name '${tag.name}' already exists.`);
                remapped.set(tag.id, existing.id);
                continue;
            }
            for (const collision of new Set([sameId, existing].filter(Boolean))) {
                getTags().splice(getTags().indexOf(collision), 1);
                if (collision.id !== tag.id) remapped.set(collision.id, tag.id);
            }
            getTags().push(tag);
        }
        const resolve = id => {
            const seen = new Set();
            while (remapped.has(id) && !seen.has(id)) { seen.add(id); id = remapped.get(id); }
            return id;
        };
        for (const key of Object.keys(getMap())) {
            if (Array.isArray(getMap()[key])) getMap()[key] = [...new Set(getMap()[key].map(resolve))];
        }
        for (const [key, ids] of Object.entries(data.tag_map)) {
            if (!Array.isArray(ids)) {
                warnings.push(`Tag map for key ${key} is invalid: ${JSON.stringify(ids)}.`);
                continue;
            }
            if (!getCharacters().some(character => String(character.avatar) === key)) {
                warnings.push(`Tag map key ${key} does not exist as a character.`);
                continue;
            }
            getMap()[key] = [...new Set([...(getMap()[key] || []), ...ids].map(resolve))]
                .filter(id => getTags().some(tag => String(tag.id) === String(id)));
        }
        notify();
        return { valid: true, warnings };
    }

    return { find, create, assign, remove, mutual, reset, replace, deleteKey, getDraft, setDraft, list, ensureKey, filterState, filterEntities, rename, setProperty, deleteTag, copyKey, renameKey, compare, sorted, reorder, prune, restore, notify };
}
