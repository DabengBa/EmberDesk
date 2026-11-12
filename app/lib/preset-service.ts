export type PresetRecord = Record<string, unknown>;
export type PresetState = { settings: PresetRecord; presets: PresetRecord[]; names: Record<string, number> };
export type PresetSnapshot = { readonly settings: Readonly<PresetRecord>; readonly names: readonly string[]; readonly selected: string };
export type PresetPort = {
    read(): PresetState;
    fields: Record<string, string>;
    secretKeys?: readonly string[];
    defaults?: PresetRecord;
    persist(name: string, body: PresetRecord): Promise<string>;
    sanitizeName(name: string): Promise<string>;
    remove(name: string): Promise<void>;
    emit(event: 'before' | 'after' | 'saveAfter' | 'changed' | 'deleted' | 'renameBefore' | 'renamed', payload: unknown): Promise<void>;
    changed(): void;
    normalize(value: PresetRecord): PresetRecord;
    afterApply(): void;
    confirmSwitch?(): Promise<'save' | 'discard' | 'cancel'>;
    askName?(current: string): Promise<string | null>;
    confirmDelete?(): Promise<boolean>;
    restorePreset?(name: string): Promise<{ isDefault: boolean; preset: PresetRecord }>;
    confirmRestore?(isDefault: boolean): Promise<boolean>;
    importFile?(file: File): Promise<void>;
    exportFile?(): Promise<void>;
};

const numericRanges: Record<string, [number, number]> = {
    temp_openai: [0, 2], freq_pen_openai: [-2, 2], pres_pen_openai: [-2, 2],
    top_p_openai: [0, 1], openai_max_context: [500, Infinity], openai_max_tokens: [100, 128000],
};
const secretKeys = ['api_key', 'api_key_openai', 'proxy_password', 'authorization', 'custom_include_headers'];
const enumValues: Record<string, readonly unknown[]> = {
    reasoning_effort: ['auto', 'low', 'medium', 'high'],
    verbosity: ['auto', 'low', 'medium', 'high'],
    inline_image_quality: ['auto', 'low', 'high'],
    tool_reasoning_mode: ['disabled', 'since_last_user', 'active_chain'],
    names_behavior: [-1, 0, 1, 2],
};

export function createPresetService(port: PresetPort) {
    const listeners = new Set<() => void>();
    const snapshot = (): PresetSnapshot => {
        const { settings, names } = port.read();
        return { settings: structuredClone(settings), names: Object.keys(names), selected: String(settings.preset_settings_openai ?? '') };
    };
    let current = snapshot();
    function refresh() {
        current = snapshot();
        for (const listener of listeners) listener();
    }
    function changed() { port.changed(); refresh(); }
    function body() {
        const { settings, names, presets } = port.read();
        const selected = String(settings.preset_settings_openai ?? '');
        const result = structuredClone(presets[names[selected]] ?? {});
        for (const [key, field] of Object.entries(port.fields)) {
            if (settings[field] !== undefined) result[key] = structuredClone(settings[field]);
        }
        for (const key of [...secretKeys, ...(port.secretKeys ?? [])]) delete result[key];
        return result;
    }
    async function save(name: string, supplied?: PresetRecord, options: { skipUpdate?: boolean; select?: boolean } = {}) {
        if (!name.trim()) throw new Error('Preset name is required');
        const preset = supplied ? structuredClone(supplied) : body();
        for (const key of [...secretKeys, ...(port.secretKeys ?? [])]) delete preset[key];
        const savedName = await port.persist(name, preset);
        if (options.skipUpdate) return savedName;
        const { settings, presets, names } = port.read();
        if (Object.hasOwn(names, savedName)) presets[names[savedName]] = preset;
        else { names[savedName] = presets.length; presets.push(preset); }
        if (options.select !== false) settings.preset_settings_openai = savedName;
        changed();
        return savedName;
    }
    async function select(name: string) {
        const { settings, presets, names } = port.read();
        if (!Object.hasOwn(names, name)) throw new Error('Preset not found');
        const preset = port.normalize(structuredClone(presets[names[name]]));
        const presetNameBefore = String(settings.preset_settings_openai ?? '');
        settings.preset_settings_openai = name;
        try { await port.emit('before', { preset, presetName: name, presetNameBefore }); } catch (error) { console.error(error); }
        for (const [key, field] of Object.entries(port.fields)) {
            if (key === 'extensions') settings[field] = structuredClone(preset[key] || {});
            else if (key === 'reply_pipeline') settings[field] = structuredClone(preset[key] ?? null);
            else if (preset[key] !== undefined) settings[field] = structuredClone(preset[key]);
        }
        port.afterApply();
        changed();
        await port.emit('after', preset);
        await port.emit('changed', name);
    }
    async function remove(name = String(port.read().settings.preset_settings_openai ?? '')) {
        const { names } = port.read();
        if (!Object.hasOwn(names, name)) throw new Error('Preset not found');
        await port.remove(name);
        const state = port.read();
        delete state.names[name];
        if (state.settings.preset_settings_openai === name) {
            state.settings.preset_settings_openai = '';
            const next = Object.keys(state.names)[0];
            if (next) await select(next);
        }
        changed();
        await port.emit('deleted', name);
    }
    async function rename(name: string) {
        const old = String(port.read().settings.preset_settings_openai ?? '');
        name = await port.sanitizeName(name);
        if (!old || !name.trim() || old === name || Object.hasOwn(port.read().names, name)) throw new Error('Invalid preset name');
        await port.emit('renameBefore', { oldName: old, newName: name });
        await save(name);
        try { await remove(old); } catch (error) { throw new Error('Preset rename partially completed: old preset could not be deleted', { cause: error }); }
        await port.emit('renamed', { oldName: old, newName: name });
    }
    async function requestSelect(name: string) {
        const decision = await port.confirmSwitch?.() ?? 'discard';
        if (decision === 'cancel') return;
        if (decision === 'save') await save(String(port.read().settings.preset_settings_openai ?? ''));
        await select(name);
    }
    async function saveCurrent() {
        await save(String(port.read().settings.preset_settings_openai ?? ''));
        await port.emit('saveAfter', null);
    }
    async function create() {
        const name = await port.askName?.(String(port.read().settings.preset_settings_openai ?? ''));
        if (!name) return;
        const saved = await save(name, undefined, { select: false });
        await select(saved);
    }
    async function renameCurrent() {
        const name = await port.askName?.(String(port.read().settings.preset_settings_openai ?? ''));
        if (name && name !== port.read().settings.preset_settings_openai) await rename(name);
    }
    async function deleteCurrent() {
        if (await port.confirmDelete?.()) await remove();
    }
    async function restoreCurrent() {
        const name = String(port.read().settings.preset_settings_openai ?? '');
        if (!name || !port.restorePreset || !port.confirmRestore) throw new Error('Preset restore unavailable');
        const data = await port.restorePreset(name);
        if (data.isDefault && !Object.keys(data.preset).length) throw new Error('Default preset cannot be restored');
        if (!await port.confirmRestore(data.isDefault)) return;
        if (data.isDefault) await save(name, port.normalize(data.preset), { select: false });
        await select(name);
    }
    function setField(field: string, value: unknown) {
        if (!Object.values(port.fields).includes(field)) throw new Error('Unknown preset field');
        const range = numericRanges[field];
        if (range && (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1])) throw new Error('Invalid field value');
        if (enumValues[field] && !enumValues[field].includes(value)) throw new Error('Invalid field value');
        const previous = port.read().settings[field];
        if (!range && previous != null && typeof previous !== typeof value) throw new Error('Invalid field type');
        port.read().settings[field] = value;
        changed();
    }
    function restore(field: string) {
        if (!port.defaults || !Object.hasOwn(port.defaults, field)) throw new Error('Unknown default field');
        setField(field, structuredClone(port.defaults[field]));
    }
    const getAllPresets = () => Object.keys(port.read().names);
    const findPreset = (name: string) => Object.hasOwn(port.read().names, name) ? String(port.read().names[name]) : undefined;
    const getSelectedPresetName = () => String(port.read().settings.preset_settings_openai ?? '');
    const getSelectedPreset = () => findPreset(getSelectedPresetName());
    return { getSnapshot: () => current, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); }, refresh, setField, restore, select, save, delete: remove, rename, requestSelect, saveCurrent, create, renameCurrent, deleteCurrent, restoreCurrent, importFile: (file: File) => port.importFile?.(file), exportFile: () => port.exportFile?.(), getAllPresets, findPreset, getSelectedPresetName, getSelectedPreset, getPresetBody: body };
}
export type PresetService = ReturnType<typeof createPresetService>;
