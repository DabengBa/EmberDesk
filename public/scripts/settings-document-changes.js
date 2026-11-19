const fieldSections = new Set(['oai_settings', 'power_user', 'feature_settings', 'world_info_settings', 'background', 'accountStorage', 'tag_map']);
const serverOwned = new Set(['external_media_allowed_overrides', 'external_media_forbidden_overrides', 'external_media_authorization_canonical_ids']);

const own = (object, key) => object && Object.hasOwn(object, key) ? object[key] : undefined;

export function equalSettingsValues(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equalSettingsValues(a[key], b[key]));
}

export function settingsValue(document, [section, field]) {
    return field === undefined ? own(document, section) : own(own(document, section), field);
}

export function setSettingsValue(document, [section, field], value) {
    const define = (target, key, next) => Object.defineProperty(target, key, { value: next, writable: true, configurable: true, enumerable: true });
    if (field !== undefined && !own(document, section)) {
        if (value === undefined) return;
        define(document, section, {});
    }
    const target = field === undefined ? document : document[section];
    const key = field ?? section;
    if (value === undefined) delete target[key];
    else define(target, key, structuredClone(value));
}

export function settingsChanges(base, draft) {
    const changes = [];
    const compare = (path, before, value) => {
        if (!equalSettingsValues(before, value)) changes.push({ id: JSON.stringify(path), path, value });
    };
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
        if (key === 'settings_revision') continue;
        if (fieldSections.has(key)) {
            for (const field of new Set([...Object.keys(own(base, key) ?? {}), ...Object.keys(own(draft, key) ?? {})])) {
                if (key === 'power_user' && serverOwned.has(field)) continue;
                compare([key, field], own(own(base, key), field), own(own(draft, key), field));
            }
        } else compare([key], own(base, key), own(draft, key));
    }
    return changes;
}
