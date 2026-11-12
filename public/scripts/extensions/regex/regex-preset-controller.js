import { t } from '../../i18n.js';
import { equalsIgnoreCaseAndAccents } from '../../utils.js';

/**
 * Regex preset controller. Preserves the legacy RegexPresetManager semantics
 * (id-based selection state, unsaved-changes prompt, enable-set snapshots and
 * per-scope apply ordering) without owning DOM or persistence directly.
 *
 * Persisted shape (unchanged): feature_settings.regex_presets = [
 *   { id, name, isSelected, global: [{id}], scoped: [{id}], preset: [{id}] }
 * ]
 */
export function createRegexPresetController({
    getScriptsByType,
    getScriptsForTarget,
    captureTarget,
    saveScriptsByType,
    featureSettings,
    saveSettings,
    afterChange,
    confirmUnsaved,
    confirmDelete,
    promptName,
    notify,
    uuid,
    SCRIPT_TYPES,
}) {
    const listeners = new Set();
    let currentPresetId = null;
    let lastKnownState = null;

    const emit = () => listeners.forEach(listener => listener());
    const presets = () => {
        if (!Array.isArray(featureSettings.regex_presets)) featureSettings.regex_presets = [];
        return featureSettings.regex_presets;
    };
    const regexListToPresetItems = list => Array.isArray(list) ? list.filter(x => !x.disabled).map(s => ({ id: s.id })) : [];
    const captureCurrentState = () => ({
        global: regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.GLOBAL)).map(item => item.id).sort(),
        scoped: regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.SCOPED)).map(item => item.id).sort(),
        preset: regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.PRESET)).map(item => item.id).sort(),
    });
    const hasStateChanged = (state1, state2) => {
        if (!state1 || !state2) return false;
        return ['global', 'scoped', 'preset'].some(key => {
            const a = state1[key] || [];
            const b = state2[key] || [];
            return a.length !== b.length || !a.every(id => b.includes(id));
        });
    };
    const updateStoredState = presetId => {
        currentPresetId = presetId;
        lastKnownState = captureCurrentState();
    };

    async function applyPresetList({ presetList, targetList, saveFunction }) {
        if (!Array.isArray(targetList) || !Array.isArray(presetList)) return;
        targetList.forEach(script => { script.disabled = !presetList.some(p => p.id === script.id); });
        targetList.sort((a, b) => {
            const aIndex = presetList.findIndex(p => p.id === a.id);
            const bIndex = presetList.findIndex(p => p.id === b.id);
            return aIndex - bIndex || targetList.indexOf(a) - targetList.indexOf(b);
        });
        await saveFunction(targetList);
    }

    async function applyPreset(presetId) {
        const preset = presets().find(p => p.id === presetId);
        if (!preset) {
            notify.error(t`Could not find the selected preset.`);
            return;
        }
        // Bind every affected scope identity before the first await so a
        // character/preset switch mid-apply cannot write to the new context.
        const targets = {};
        for (const scriptType of Object.values(SCRIPT_TYPES)) {
            try {
                targets[scriptType] = captureTarget(scriptType);
            } catch {
                targets[scriptType] = null;
            }
        }
        for (const scriptType of Object.values(SCRIPT_TYPES)) {
            const target = targets[scriptType];
            const live = target ? getScriptsForTarget(target) : getScriptsByType(scriptType);
            if (!target && live.length === 0) continue;
            if (!target) throw new Error('Regex scope became unavailable while applying the preset');
            await applyPresetList({
                presetList: {
                    [SCRIPT_TYPES.GLOBAL]: preset.global,
                    [SCRIPT_TYPES.SCOPED]: preset.scoped,
                    [SCRIPT_TYPES.PRESET]: preset.preset,
                }[scriptType],
                targetList: live,
                saveFunction: scripts => saveScriptsByType(scripts, scriptType, target),
            });
        }
        await afterChange();
    }

    async function savePreset(presetId, isUpdate) {
        const existingPreset = isUpdate ? presets().find(p => p.id === presetId) : null;
        if (isUpdate && !existingPreset) {
            notify.error(t`Could not find the preset to update.`);
            return false;
        }
        const name = isUpdate ? existingPreset.name : await promptName();
        if (!name || !name.trim().length) return false;
        const id = isUpdate ? existingPreset.id : presetId;
        const preset = {
            id,
            name,
            isSelected: false,
            global: regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.GLOBAL)),
            scoped: regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.SCOPED)),
            preset: regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.PRESET)),
        };
        if (isUpdate) Object.assign(existingPreset, preset);
        else presets().push(preset);
        presets().forEach(p => { p.isSelected = p.id === id; });
        await saveSettings();
        notify.success(isUpdate ? t`Regex preset updated` : t`Regex preset saved`);
        return true;
    }

    async function checkUnsavedChanges() {
        if (!currentPresetId || !lastKnownState) return;
        if (!hasStateChanged(lastKnownState, captureCurrentState())) return;
        const currentPreset = presets().find(p => p.id === currentPresetId);
        const presetName = currentPreset ? currentPreset.name : t`Unknown Preset`;
        if (await confirmUnsaved(presetName)) {
            await savePreset(currentPresetId, true);
        }
    }

    async function select(id, { fromSlashCommand = false } = {}) {
        if (!id) return;
        if (!fromSlashCommand) await checkUnsavedChanges();
        await applyPreset(id);
        presets().forEach(p => { p.isSelected = p.id === id; });
        await saveSettings();
        updateStoredState(id);
        emit();
    }

    async function create() {
        const newId = uuid();
        if (await savePreset(newId, false)) updateStoredState(newId);
        emit();
    }

    async function update() {
        const selectedPresetId = presets().find(p => p.isSelected)?.id ?? currentPresetId;
        if (!selectedPresetId) return;
        if (await savePreset(selectedPresetId, true)) updateStoredState(selectedPresetId);
        emit();
    }

    async function apply() {
        const selectedPresetId = presets().find(p => p.isSelected)?.id ?? currentPresetId;
        if (!selectedPresetId) return;
        await applyPreset(selectedPresetId);
        updateStoredState(selectedPresetId);
        emit();
    }

    async function remove() {
        const list = presets();
        const presetIndex = list.findIndex(p => p.id === (list.find(p => p.isSelected)?.id ?? currentPresetId));
        if (presetIndex === -1) {
            notify.error(t`Could not find the preset to delete.`);
            return;
        }
        const presetName = list[presetIndex].name;
        if (!await confirmDelete(presetName)) return;
        list.splice(presetIndex, 1);
        list.forEach((p, i) => { p.isSelected = i === 0; });
        await saveSettings();
        notify.success(t`Regex preset deleted`);
        const newSelectedPresetId = list.find(p => p.isSelected)?.id;
        if (newSelectedPresetId) {
            await applyPreset(newSelectedPresetId);
            updateStoredState(newSelectedPresetId);
        } else {
            currentPresetId = null;
            lastKnownState = null;
        }
        emit();
    }

    // Initialize stored state with the currently selected preset.
    const initialSelected = presets().find(p => p.isSelected);
    if (initialSelected) updateStoredState(initialSelected.id);

    return {
        list: () => ({
            presets: presets().map(({ id, name }) => ({ id, name })),
            selected: presets().find(p => p.isSelected)?.id ?? '',
        }),
        select,
        selectByNameOrId: async (name, { quiet = false } = {}) => {
            const foundId = presets().find(p => p.id === name)?.id
                ?? presets().find(p => equalsIgnoreCaseAndAccents(p.name, name))?.id;
            if (foundId) {
                await select(foundId, { fromSlashCommand: true });
                return foundId;
            }
            if (!quiet) notify.warning(t`Regex preset "${name}" not found`);
            return '';
        },
        create,
        update,
        apply,
        delete: remove,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    };
}
