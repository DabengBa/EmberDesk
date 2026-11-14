import { lodash } from '../lib.js';

import { eventSource, event_types } from './events.js';
import { getRequestHeaders } from './request-context.js';
import { t } from './i18n.js';
import { getOpenAIPresetService, oai_settings, openai_setting_names, openai_settings } from './openai.js';
import { Popup } from './popup.js';

import { ensurePlainObject } from './utils.js';

let presetManagerContext;

/**
 * Install composition-root accessors before preset initialization or use.
 * @param {{main_api: string, characters: Array, this_chid: number, saveSettings: Function}} context Live state accessors and the existing settings writer.
 */
export function installPresetManagerContext(context) {
    presetManagerContext = context;
}

function saveSettings(...args) {
    return presetManagerContext.saveSettings(...args);
}

const presetManagers = {};

/**
 * Automatically select a preset for the current character name.
 */
function autoSelectPreset() {
    const presetManager = getPresetManager();

    if (!presetManager) {
        console.debug(`Preset Manager not found for API: ${presetManagerContext.main_api}`);
        return;
    }

    const name = presetManagerContext.characters[presetManagerContext.this_chid]?.name;

    if (!name) {
        console.debug(`Preset candidate not found for API: ${presetManagerContext.main_api}`);
        return;
    }

    const preset = presetManager.findPreset(name);
    const selectedPreset = presetManager.getSelectedPreset();

    if (preset === selectedPreset) {
        console.debug(`Preset already selected for API: ${presetManagerContext.main_api}, name: ${name}`);
        return;
    }

    if (preset !== undefined && preset !== null) {
        console.log(`Preset found for API: ${presetManagerContext.main_api}, name: ${name}`);
        presetManager.selectPreset(preset);
    }
}

/**
 * Gets a preset manager by API id.
 * @param {string} apiId API id
 * @returns {PresetManager} Preset manager
 */
export function getPresetManager(apiId = '') {
    if (!apiId) {
        apiId = presetManagerContext.main_api;
    }

    if (!Object.keys(presetManagers).includes(apiId)) {
        return null;
    }

    return presetManagers[apiId];
}

/**
 * Persists user settings and rejects when the write is queued or fails.
 * Shared by features that cannot import `saveSettings` from `script.js`
 * without violating the composition-root reverse-import contract.
 * @returns {Promise<void>} Resolves after the settings save commits.
 */
export async function saveSettingsStrict() {
    await saveSettings(0, { strict: true });
}

/** Register the supported live preset manager. */
function registerPresetManagers() {
    presetManagers.openai = new PresetManager(null, 'openai');
}

class PresetManager {
    constructor(_select, apiId) {
        this.apiId = apiId;
    }

    /**
     * Gets all preset names.
     * @returns {string[]} List of preset names
     */
    getAllPresets() {
        return getOpenAIPresetService().getAllPresets();
    }

    /**
     * Finds a preset by name.
     * @param {string} name Preset name
     * @returns {any} Preset value
     */
    findPreset(name) {
        return getOpenAIPresetService().findPreset(name);
    }

    /**
     * Gets the selected preset value.
     * @returns {any} Selected preset value
     */
    getSelectedPreset() {
        return getOpenAIPresetService().getSelectedPreset();
    }

    /**
     * Gets the selected preset name.
     * @returns {string} Selected preset name
     */
    getSelectedPresetName() {
        return getOpenAIPresetService().getSelectedPresetName();
    }

    /**
     * Selects a preset by option value.
     * @param {string} value Preset option value
     */
    selectPreset(value) {
        const name = Object.keys(openai_setting_names).find(key => String(openai_setting_names[key]) === String(value));
        if (name) void getOpenAIPresetService().select(name).catch(error => { console.error(error); toastr.error(String(error)); });
    }

    /**
     * Updates the preset select element with the current API presets.
     * @param {object} [options] Options for saving the preset
     * @param {boolean} [options.skipUpdate=false] If true, skips updating the preset list after saving.
     */
    async updatePreset(option = { skipUpdate: false }) {
        await this.savePreset(this.getSelectedPresetName(), null, option);
        toastr.success(t`Preset updated`);
    }

    /**
     * Saves the currently selected preset with a new name.
     */
    async savePresetAs() {
        const inputValue = this.getSelectedPresetName();
        const popupText = '<h4>' + t`Hint: Use a character name to bind preset to a specific chat.` + '</h4>';
        const headerText = t`Preset name:`;
        const name = await Popup.show.input(headerText, popupText, inputValue);
        if (!name) {
            console.log('Preset name not provided');
            return;
        }

        await this.savePreset(name);

        const successToast = t`Preset saved`;
        toastr.success(successToast);
    }

    /**
     * Saves a preset with the given name and settings.
     * @param {string} name Name of the preset to save
     * @param {object} [settings] Settings to save as the preset. If not provided, uses the current preset settings.
     * @param {object} [options] Options for saving the preset
     * @param {boolean} [options.skipUpdate=false] If true, skips updating the preset list after saving.
     */
    async savePreset(name, settings, { skipUpdate = false } = {}) {
        const service = getOpenAIPresetService();
        const saved = await service.save(name, settings ?? undefined, { skipUpdate, select: false });
        if (!skipUpdate) await service.select(saved);
        return saved;
    }

    /**
     * Renames the currently selected preset.
     * @param {string} newName New name for the preset
     */
    async renamePreset(newName) {
        return getOpenAIPresetService().rename(newName);
    }

    /**
     * Gets a list of presets for the API.
     * @param {string} [api] API ID. If not specified, uses the current API ID.
     * @returns {{presets: any[], preset_names: object, settings: object}}
     */
    getPresetList(api) {
        let presets = [];
        let preset_names = {};
        let settings = {};

        // If no API specified, use the current API
        if (api === undefined) {
            api = this.apiId;
        }

        switch (api) {
            case 'openai':
                presets = openai_settings;
                preset_names = openai_setting_names;
                settings = oai_settings;
                break;
            default:
                console.warn(`Unknown API ID ${api}`);
        }

        return { presets, preset_names, settings };
    }

    /** Gets the current preset body. */
    getPresetSettings(_name) {
        return getOpenAIPresetService().getPresetBody();
    }

    /**
     * Retrieves a completion preset by name.
     * @param {string} name Name of the preset to retrieve
     * @returns {any} Preset object if found, otherwise undefined
     */
    getCompletionPresetByName(name) {
        // Retrieve a completion preset by name. Return undefined if not found.
        let { presets, preset_names } = this.getPresetList();
        let preset;

        // Some APIs use an array of names, others use an object of {name: index}
        if (Array.isArray(preset_names)) {  // array of names
            if (preset_names.includes(name)) {
                preset = presets[preset_names.indexOf(name)];
            }
        } else {  // object of {names: index}
            if (preset_names[name] !== undefined) {
                preset = presets[preset_names[name]];
            }
        }

        if (preset === undefined) {
            console.error(`Preset ${name} not found`);
        }

        // if the preset isn't found, returns undefined
        return preset;
    }

    /**
     * Deletes a preset by name. If not provided, deletes the currently selected preset.
     * @param {string} [name] Name of the preset to delete.
     */
    async deletePreset(name) {
        await getOpenAIPresetService().delete(name);
        return true;
    }

    /**
     * Retrieves the default preset for the API from the server.
     * @param {string} name Name of the preset to restore
     * @returns {Promise<any>} Default preset object, or undefined if the request fails
     */
    async getDefaultPreset(name) {
        const response = await fetch('/api/presets/restore', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name, apiId: this.apiId }),
        });

        if (!response.ok) {
            const errorToast = t`Failed to restore default preset`;
            toastr.error(errorToast);
            return;
        }

        return await response.json();
    }

    /**
     * Reads a preset extension field from the preset.
     * @param {object} options
     * @param {string} [options.name] Name of the preset. If not provided, uses the currently selected preset name.
     * @param {string} options.path Path to the preset extension field, e.g. 'myextension.data'. If empty, reads the entire extensions object.
     * @return {any} The value of the preset extension field, or null if not found.
     */
    readPresetExtensionField({ name, path }) {
        const { settings } = this.getPresetList();
        const selectedName = this.getSelectedPresetName();
        const presetName = name || selectedName;

        // Read from settings if the selected preset is the same as the provided name
        if (settings && selectedName === presetName) {
            const settingsExtensions = ensurePlainObject(settings.extensions || {});
            return path ? lodash.get(settingsExtensions, path, null) : settingsExtensions;
        }

        // Otherwise, read from the preset by name
        const preset = this.getCompletionPresetByName(presetName);
        if (!preset) {
            return null;
        }

        const presetExtensions = ensurePlainObject(preset.extensions || {});
        const value = path ? lodash.get(presetExtensions, path, null) : presetExtensions;
        return value;
    }

    /**
     * Writes a value to a preset extension field.
     * @param {object} options
     * @param {string} [options.name] Name of the preset. If not provided, uses the currently selected preset name.
     * @param {string} options.path Path to the preset extension field, e.g. 'myextension.data'. If empty, writes to the root of the extensions object.
     * @param {any} options.value Value to write to the preset extension field.
     * @param {boolean} [options.strict] Reject failed settings and missing/replaced presets.
     * @param {object} [options.expectedPreset] Identity to verify before saving.
     * @return {Promise<void>} Resolves when the preset is saved.
     */
    async writePresetExtensionField({ name, path, value, strict = false, expectedPreset }) {
        const { settings } = this.getPresetList();
        const selectedName = this.getSelectedPresetName();
        const presetName = name || selectedName;
        if (strict) {
            const preset = this.getCompletionPresetByName(presetName);
            if (!preset || (expectedPreset && preset !== expectedPreset)) throw new Error('Preset no longer exists');
            const service = getOpenAIPresetService();
            const revision = service.getSelectionRevision();
            const selected = settings && selectedName === presetName;
            const priorSettingsExtensions = settings?.extensions;
            let stagedSettings;
            let stagedSettingsSnapshot;
            let settingsCommitted = false;
            const stagedPreset = structuredClone(preset);
            stagedPreset.extensions = ensurePlainObject(stagedPreset.extensions || {});
            if (path) lodash.set(stagedPreset.extensions, path, value); else stagedPreset.extensions = value;
            const priorPreset = JSON.stringify(preset);
            const selectionChanged = () => service.getSelectionRevision() !== revision || this.getSelectedPresetName() !== selectedName;
            try {
                if (selected) {
                    stagedSettings = structuredClone(ensurePlainObject(settings.extensions || {}));
                    if (path) lodash.set(stagedSettings, path, value); else stagedSettings = value;
                    settings.extensions = stagedSettings;
                    stagedSettingsSnapshot = JSON.stringify(stagedSettings);
                    await saveSettings(0, { strict: true });
                    settingsCommitted = true;
                    if (selectionChanged()) throw new Error('Preset selection changed while saving settings');
                }
                if (this.getCompletionPresetByName(presetName) !== preset || JSON.stringify(preset) !== priorPreset) throw new Error('Preset no longer exists or changed');
                await this.savePreset(presetName, stagedPreset, { skipUpdate: true });
                if (this.getCompletionPresetByName(presetName) !== preset || JSON.stringify(preset) !== priorPreset) throw new Error('Preset no longer exists or changed');
                preset.extensions = stagedPreset.extensions;
                if (selectionChanged()) throw new Error('Preset selection changed while saving settings');
            } catch (error) {
                // Revert only our own still-current field; never clobber a newer edit.
                if (selected && !selectionChanged() && settings.extensions === stagedSettings
                    && JSON.stringify(settings.extensions) === stagedSettingsSnapshot) {
                    settings.extensions = priorSettingsExtensions;
                    if (settingsCommitted) {
                        try { await saveSettings(0, { strict: true }); } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Preset save failed and settings rollback failed'); }
                    }
                }
                throw error;
            }
            return;
        }
        // Write to settings if the selected preset is the same as the provided name
        if (settings && selectedName === presetName) {
            // Set the value at the specified path
            settings.extensions = ensurePlainObject(settings.extensions || {});
            if (path) lodash.set(settings.extensions, path, value); else settings.extensions = value;
            await saveSettings();
        }

        // Also update the preset by name
        const preset = this.getCompletionPresetByName(presetName);
        if (!preset) {
            return;
        }

        // Set the value at the specified path
        preset.extensions = ensurePlainObject(preset.extensions || {});
        if (path) lodash.set(preset.extensions, path, value); else preset.extensions = value;

        // Save the updated preset
        await this.savePreset(presetName, preset, { skipUpdate: true });
    }
}

export async function initPresetManager() {
    eventSource.on(event_types.CHAT_CHANGED, autoSelectPreset);
    registerPresetManagers();
}
