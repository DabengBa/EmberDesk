/**
 * World Info runtime state: settings values, selected worlds, caches and
 * shared constants. Leaf module with no shell or DOM dependencies so both
 * the UI module (world-info.js) and the scan service (world-info-service.js)
 * can read live bindings without creating an import cycle.
 */

import { WORLD_INFO_POSITION } from './world-info-domain.js';
import { StructuredCloneMap } from './util/StructuredCloneMap.js';

export const world_info_insertion_strategy = {
    evenly: 0,
    character_first: 1,
    global_first: 2,
};

export const world_info_logic = {
    AND_ANY: 0,
    NOT_ALL: 1,
    NOT_ANY: 2,
    AND_ALL: 3,
};

/**
 * @enum {number} Possible states of the WI evaluation
 */
export const scan_state = {
    /**
     * The scan will be stopped.
     */
    NONE: 0,
    /**
     * Initial state.
     */
    INITIAL: 1,
    /**
     * The scan is triggered by a recursion step.
     */
    RECURSION: 2,
    /**
     * The scan is triggered by a min activations depth skew.
     */
    MIN_ACTIVATIONS: 3,
};

export const METADATA_KEY = 'world_info';

export const DEFAULT_DEPTH = 4;
export const DEFAULT_WEIGHT = 100;
export const MAX_SCAN_DEPTH = 1000;

export const KNOWN_DECORATORS = ['@@activate', '@@dont_activate'];

export const world_info_position = WORLD_INFO_POSITION;

export const sortFn = (a, b) => b.order - a.order;

export let world_info = {};
export let selected_world_info = [];
/** @type {string[]} */
export let world_names;
export let world_info_depth = 2;
export let world_info_min_activations = 0; // if > 0, will continue seeking chat until minimum world infos are activated
export let world_info_min_activations_depth_max = 0; // used when (world_info_min_activations > 0)

export let world_info_budget = 25;
export let world_info_include_names = true;
export let world_info_recursive = false;
export let world_info_overflow_alert = false;
export let world_info_case_sensitive = false;
export let world_info_match_whole_words = false;
export let world_info_use_group_scoring = false;
export let world_info_character_strategy = world_info_insertion_strategy.character_first;
export let world_info_budget_cap = 0;
export let world_info_max_recursion_steps = 0;

/**
 * The cache of all world info data that was loaded from the backend.
 *
 * Calling `loadWorldInfo` will fill this cache and utilize this cache, so should be the preferred way to load any world info data.
 * Only use the cache directly if you need synchronous access.
 *
 * This will return a deep clone of the data, so no way to modify the data without actually saving it.
 * Should generally be only used for readonly access.
 *
 * @type {StructuredCloneMap<string,object>}
 * */
export const worldInfoCache = new StructuredCloneMap({ cloneOnGet: true, cloneOnSet: false });

export function getWorldInfoSettings() {
    return {
        world_info,
        world_info_depth,
        world_info_min_activations,
        world_info_min_activations_depth_max,
        world_info_budget,
        world_info_include_names,
        world_info_recursive,
        world_info_overflow_alert,
        world_info_case_sensitive,
        world_info_match_whole_words,
        world_info_character_strategy,
        world_info_budget_cap,
        world_info_use_group_scoring,
        world_info_max_recursion_steps,
    };
}

const WORLD_INFO_SETTING_SETTERS = {
    world_info_depth: (value) => world_info_depth = Number(value),
    world_info_min_activations: (value) => world_info_min_activations = Number(value),
    world_info_min_activations_depth_max: (value) => world_info_min_activations_depth_max = Number(value),
    world_info_budget: (value) => world_info_budget = Number(value),
    world_info_include_names: (value) => world_info_include_names = Boolean(value),
    world_info_recursive: (value) => world_info_recursive = Boolean(value),
    world_info_overflow_alert: (value) => world_info_overflow_alert = Boolean(value),
    world_info_case_sensitive: (value) => world_info_case_sensitive = Boolean(value),
    world_info_match_whole_words: (value) => world_info_match_whole_words = Boolean(value),
    world_info_character_strategy: (value) => world_info_character_strategy = Number(value),
    world_info_budget_cap: (value) => world_info_budget_cap = Number(value),
    world_info_use_group_scoring: (value) => world_info_use_group_scoring = Boolean(value),
    world_info_max_recursion_steps: (value) => world_info_max_recursion_steps = Number(value),
    // Unused
    world_info: (_value) => { },
};

/**
 * Sets a single world info runtime setting with the standard coercion.
 * @param {string} field Setting field name (e.g. 'world_info_depth')
 * @param {any} value Raw value to coerce and assign
 */
export function setWorldInfoSetting(field, value) {
    const setter = WORLD_INFO_SETTING_SETTERS[field];
    if (setter) {
        setter(value);
    }
}

/**
 * Applies all recognized fields of a settings object to the runtime state.
 * @param {object} settings Settings object
 */
export function updateWorldInfoRuntimeSettings(settings) {
    for (const [key, setter] of Object.entries(WORLD_INFO_SETTING_SETTERS)) {
        if (Object.hasOwn(settings, key)) {
            setter(settings[key]);
        }
    }
}

export function setWorldInfo(value) {
    world_info = value;
}

export function setSelectedWorldInfo(list) {
    selected_world_info = list;
}

export function setWorldNames(list) {
    world_names = list;
}

/**
 * Applies the persisted settings payload to the world info runtime state.
 * State only; UI synchronization is the caller's responsibility.
 * @param {object} settings The settings object (legacy keys are consumed and deleted)
 * @param {object} data The settings data payload containing world_names
 */
export function applyWorldInfoSettings(settings, data) {
    updateWorldInfoRuntimeSettings(settings);

    // Migrate old settings
    if (world_info_budget > 100) {
        world_info_budget = 25;
    }

    if (world_info_use_group_scoring === undefined) {
        world_info_use_group_scoring = false;
    }

    // Reset selected world from old string and delete old keys
    // TODO: Remove next release
    const existingWorldInfo = settings.world_info;
    if (typeof existingWorldInfo === 'string') {
        delete settings.world_info;
        selected_world_info = [existingWorldInfo];
    } else if (Array.isArray(existingWorldInfo)) {
        delete settings.world_info;
        selected_world_info = existingWorldInfo;
    }

    world_info = settings.world_info ?? {};

    world_names = data.world_names?.length ? data.world_names : [];

    // Add to existing selected WI if it exists
    selected_world_info = selected_world_info.concat(settings.world_info?.globalSelect?.filter((e) => world_names.includes(e)) ?? []);
}
