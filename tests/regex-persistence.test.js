import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createRegexListBridge } from '../public/scripts/extensions/regex/regex-list-bridge.js';
import { setValueByPath } from '../public/scripts/util/primitives.js';

// Unit proof: production functions with controlled browser and persistence boundaries.
// The lane creates isolated data/tmp roots; the invoking worker owns cleanup. Budget: 10s.
function functions(path, start, end, context) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const code = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
        .replaceAll('export ', '');
    return runInNewContext(`(() => { ${code}; return { captureRegexTarget, getScriptsForTarget, saveScriptsByType, authorizeRegexTarget }; })()`, context);
}

function setup() {
    const alice = { avatar: 'alice.png', data: { extensions: { regex_scripts: [{ id: 'a' }] } } };
    const bob = { avatar: 'bob.png', data: { extensions: { regex_scripts: [{ id: 'b' }] } } };
    const preset = { extensions: { regex_scripts: [{ id: 'p' }] } };
    let selected = 'one';
    const manager = {
        apiId: 'api', getSelectedPresetName: () => selected,
        getCompletionPresetByName: name => name === 'one' ? preset : undefined,
        readPresetExtensionField: ({ name }) => name === 'one' ? preset.extensions.regex_scripts : [],
        writePresetExtensionField: jest.fn(async () => {}),
    };
    const context = {
        SCRIPT_TYPES: { GLOBAL: 0, SCOPED: 1, PRESET: 2 }, SCRIPT_TYPE_UNKNOWN: -1,
        DEFAULT_GET_REGEX_SCRIPTS_OPTIONS: { allowedOnly: false }, characters: [alice, bob], this_chid: 0,
        feature_settings: {}, getPresetManager: () => manager, saveSettingsDebounced: jest.fn(),
        saveSettingsStrict: jest.fn(async () => {}), writeExtensionField: jest.fn(async () => {}),
        lodash: { set: (obj, [key, id], val) => { obj[key] ??= {}; obj[key][id] = val; } }, console,
    };
    const api = functions('public/scripts/extensions/regex/engine.js', 'export function getRegexScripts(', '\n/**\n * Check if character', context);
    return { ...api, context, alice, bob, manager, preset, select: name => { selected = name; } };
}

test('captured character survives selection and index changes, and rejects removal', async () => {
    const s = setup();
    const target = s.captureRegexTarget(1);
    s.context.characters.reverse();
    s.context.this_chid = 0;
    expect(s.getScriptsForTarget(target)).toEqual([{ id: 'a' }]);
    await s.saveScriptsByType([{ id: 'new' }], 1, target);
    expect(s.context.writeExtensionField).toHaveBeenCalledWith(1, 'regex_scripts', [{ id: 'new' }], expect.anything());
    s.context.characters.splice(1, 1);
    await expect(s.saveScriptsByType([], 1, target)).rejects.toThrow();
});

test('captured preset is saved by name after switching and rejects replacement', async () => {
    const s = setup();
    const target = s.captureRegexTarget(2);
    s.select('two');
    expect(s.getScriptsForTarget(target)).toEqual([{ id: 'p' }]);
    await s.saveScriptsByType([{ id: 'new' }], 2, target);
    expect(s.manager.writePresetExtensionField).toHaveBeenCalledWith(expect.objectContaining({ name: 'one', value: [{ id: 'new' }] }));
    s.manager.getCompletionPresetByName = () => ({});
    await expect(s.saveScriptsByType([], 2, target)).rejects.toThrow();
});

test('strict save reports target removal during the pending write', async () => {
    const s = setup();
    const target = s.captureRegexTarget(1);
    let finish;
    s.context.writeExtensionField.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.saveScriptsByType([], 1, target);
    s.context.characters.splice(0, 1);
    finish();
    await expect(pending).rejects.toThrow('no longer exists');
});

test('authorization persists even when already allowed and reports failure', async () => {
    const s = setup();
    const target = s.captureRegexTarget(1);
    s.context.feature_settings.character_allowed_regex = ['alice.png'];
    s.context.saveSettingsStrict.mockRejectedValueOnce(new Error('offline'));
    await expect(s.authorizeRegexTarget(target)).rejects.toThrow('offline');
    expect(s.context.feature_settings.character_allowed_regex).toEqual(['alice.png']);
    await s.authorizeRegexTarget(target);
    expect(s.context.saveSettingsStrict).toHaveBeenCalledTimes(2);
});

test('global strict failure leaves newer memory intact; legacy remains debounced', async () => {
    const s = setup();
    let reject;
    s.context.saveSettingsStrict.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const first = s.saveScriptsByType([{ id: 'first' }], 0, s.captureRegexTarget(0));
    await s.saveScriptsByType([{ id: 'later' }], 0);
    reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    expect(s.context.feature_settings.regex).toEqual([{ id: 'later' }]);
    expect(s.context.saveSettingsDebounced).toHaveBeenCalled();
});

function extract(path, start, end, context) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const i = source.indexOf(start);
    return runInNewContext(`(${source.slice(i, source.indexOf(end, i)).replace('export ', '')})`, context);
}

function settingsSetup() {
    const requests = [];
    const context = {
        settingsReady: true, TempResponseLength: { isCustomized: () => false }, currentVersion: '1', settings: {},
        resolvePersistedCurrentVersion: () => '1', accountStorage: { getState: () => ({}) }, active_character: null,
        amount_gen: 1, max_context: 1, main_api: 'x', getWorldInfoSettings: () => ({}), power_user: {},
        feature_settings: {}, tags: [], tag_map: {}, oai_settings: {}, background_settings: {}, settingsDocumentRevision: 1,
        beginSettingsSaveSnapshot: () => ({}), finishSettingsSaveSnapshot: jest.fn(), compressRequest: async x => x,
        getRequestHeaders: () => ({}), fetch: (_, request) => new Promise(resolve => requests.push({ request, resolve })),
        eventSource: { emit: async () => {} }, event_types: { SETTINGS_UPDATED: 'updated' },
        toastr: { error: jest.fn(), warning: jest.fn() }, t: strings => strings[0], console: { warn: jest.fn(), error: jest.fn() },
        saveSettingsDebounced: jest.fn(),
    };
    const save = extract('public/script.js', 'export async function saveSettings(loopCounter = 0)', '\n/**', context);
    context.saveSettings = save;
    return { save, context, requests };
}

const tick = () => new Promise(setImmediate);
const success = revision => ({ ok: true, json: async () => ({ result: 'ok', settings_revision: revision }) });

test('strict settings waits for response, retries revision conflicts and rejects HTTP errors', async () => {
    const s = settingsSetup();
    let settled = false;
    const save = s.save(0, { strict: true }).finally(() => { settled = true; });
    await tick();
    expect(settled).toBe(false);
    s.requests[0].resolve({ ok: false, status: 409, json: async () => ({ settings_revision: 4 }) });
    await tick();
    expect(JSON.parse(s.requests[1].request.body).settings_revision).toBe(4);
    expect(settled).toBe(false);
    s.requests[1].resolve(success(5));
    await save;
    const failed = s.save(0, { strict: true });
    await tick();
    s.requests[2].resolve({ ok: false, status: 500, statusText: 'offline' });
    await expect(failed).rejects.toThrow('offline');
    const legacy = s.save();
    await tick();
    s.requests[3].resolve({ ok: false, status: 500, statusText: 'offline' });
    await expect(legacy).resolves.toBeUndefined();
});

test('queued settings and temporary override never report strict success', async () => {
    const s = settingsSetup();
    s.context.settingsReady = false;
    await expect(s.save(0, { strict: true })).rejects.toThrow('queued');
    await expect(s.save()).resolves.toBeUndefined();
    s.context.settingsReady = true;
    s.context.TempResponseLength.isCustomized = () => true;
    await expect(s.save(0, { strict: true })).rejects.toThrow('queued');
    expect(s.requests).toHaveLength(0);
    expect(s.context.saveSettingsDebounced).toHaveBeenCalledTimes(3);
});

test('character strict non-OK rejects without reverting a later edit', async () => {
    let finish;
    const character = { avatar: 'a', data: { extensions: {} } };
    const context = {
        getContext: () => ({ characters: [character], characterId: 0 }), UNSET_VALUE: '__unset',
        extensionFieldWrites: new WeakMap(),
        setValueByPath: (object, path, value) => { object.data.extensions.regex_scripts = value; },
        deleteValueByPath: jest.fn(), getRequestHeaders: () => ({}), console,
        fetch: () => new Promise(resolve => { finish = resolve; }),
    };
    const write = extract('public/scripts/feature-settings.js', 'export async function writeExtensionField(', '\n/**', context);
    const first = write(0, 'regex_scripts', [{ id: 'first' }], { strict: true });
    character.data.extensions.regex_scripts = [{ id: 'later' }];
    finish({ ok: false, statusText: 'offline' });
    await expect(first).rejects.toThrow('offline');
    expect(character.data.extensions.regex_scripts).toEqual([{ id: 'later' }]);
});

function presetSetup() {
    const preset = { extensions: {} };
    const settings = { extensions: {} };
    let selected = 'one';
    let revision = 0;
    const context = {
        ensurePlainObject: value => value, lodash: { set: (obj, key, value) => { obj[key] = value; } },
        saveSettings: jest.fn(async () => {}), structuredClone,
        getOpenAIPresetService: () => ({ getSelectionRevision: () => revision }),
    };
    const source = readFileSync(new URL('../public/scripts/preset-manager.js', import.meta.url), 'utf8');
    const start = source.indexOf('    async writePresetExtensionField(');
    const end = source.indexOf('\n    }\n}', start) + 6;
    const method = runInNewContext(`({${source.slice(start, end)}}).writePresetExtensionField`, context);
    const manager = { getPresetList: () => ({ settings }), getSelectedPresetName: () => selected,
        getCompletionPresetByName: name => name === 'one' ? preset : undefined,
        savePreset: jest.fn(async () => {}) };
    return { write: options => method.call(manager, { name: 'one', path: 'regex_scripts', value: [], strict: true, expectedPreset: preset, ...options }),
        context, manager, preset, select: name => { selected = name; revision++; } };
}

test('strict preset rejects either settings or named-preset failure', async () => {
    const s = presetSetup();
    s.context.saveSettings.mockRejectedValueOnce(new Error('settings failed'));
    await expect(s.write()).rejects.toThrow('settings failed');
    expect(s.manager.savePreset).not.toHaveBeenCalled();
    s.manager.savePreset.mockRejectedValueOnce(new Error('preset failed'));
    await expect(s.write()).rejects.toThrow('preset failed');
    expect(s.context.saveSettings).toHaveBeenCalledTimes(3);
    await expect(s.write()).resolves.toBeUndefined();
});

test('strict preset saved after selection switches does not mutate selected settings', async () => {
    const s = presetSetup();
    s.select('two');
    await s.write({ value: [{ id: 'one' }] });
    expect(s.context.saveSettings).not.toHaveBeenCalled();
    expect(s.manager.savePreset).toHaveBeenCalledWith('one', s.preset, { skipUpdate: true });
});

test('preset selection change during settings save rejects before writing or touching replacement settings', async () => {
    const s = presetSetup();
    let finish;
    s.context.saveSettings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.write();
    s.select('two');
    finish();
    await expect(pending).rejects.toThrow('selection changed');
    expect(s.manager.savePreset).not.toHaveBeenCalled();
});

test('preset authorization uses captured API and name after selection changes', async () => {
    const s = setup();
    const target = s.captureRegexTarget(2);
    s.select('two');
    s.context.saveSettingsStrict.mockRejectedValueOnce(new Error('offline'));
    await expect(s.authorizeRegexTarget(target)).rejects.toThrow('offline');
    expect(s.context.feature_settings.preset_allowed_regex.api).toEqual(['one']);
    await s.authorizeRegexTarget(target);
    expect(s.context.saveSettingsStrict).toHaveBeenCalledTimes(2);
});

// Unit/integration: real preset service, regex manager/engine and list bridge with
// in-memory persistence ports. No shared data or temp files; budget 10 seconds.
async function integratedPresetSetup() {
    const source = readFileSync(new URL('../app/lib/preset-service.ts', import.meta.url), 'utf8');
    const { createPresetService } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
    const settings = { preset_settings_openai: 'A', extensions: { regex_scripts: [] } };
    const presets = [{ extensions: { regex_scripts: [] } }, { extensions: { regex_scripts: [] } }];
    const names = { A: 0, B: 1 };
    const port = { read: () => ({ settings, presets, names }), fields: { extensions: 'extensions' },
        persist: jest.fn(async name => name), remove: jest.fn(async () => {}), emit: jest.fn(async () => {}),
        changed: () => {}, normalize: x => x, afterApply: () => {} };
    const service = createPresetService(port);
    const context = { ensurePlainObject: x => x, lodash: { set: (o, k, v) => { o[k] = v; }, get: (o, k) => o[k] },
        saveSettings: jest.fn(async () => {}), getOpenAIPresetService: () => service, structuredClone };
    const sourceManager = readFileSync(new URL('../public/scripts/preset-manager.js', import.meta.url), 'utf8');
    const start = sourceManager.indexOf('    async writePresetExtensionField(');
    const end = sourceManager.indexOf('\n    }\n}', start) + 6;
    const write = runInNewContext(`({${sourceManager.slice(start, end)}}).writePresetExtensionField`, context);
    const manager = { apiId: 'openai', getPresetList: () => ({ settings }), getSelectedPresetName: service.getSelectedPresetName,
        getCompletionPresetByName: name => presets[names[name]],
        readPresetExtensionField: ({ name, path }) => (settings.preset_settings_openai === name ? settings : presets[names[name]])?.extensions?.[path],
        savePreset: (name, body, options) => service.save(name, body, options), writePresetExtensionField: options => write.call(manager, options) };
    const engineContext = { SCRIPT_TYPES: { GLOBAL: 0, SCOPED: 1, PRESET: 2 }, SCRIPT_TYPE_UNKNOWN: -1,
        DEFAULT_GET_REGEX_SCRIPTS_OPTIONS: { allowedOnly: false }, feature_settings: { regex: [{ id: 'r' }] },
        getPresetManager: () => manager, saveSettingsStrict: jest.fn(async () => {}), console };
    const engine = functions('public/scripts/extensions/regex/engine.js', 'export function getRegexScripts(', '\n/**\n * Check if character', engineContext);
    return { service, port, settings, presets, names, manager, context, engine, engineContext };
}

test('captured list target remains usable after ordinary service save', async () => {
    const s = await integratedPresetSetup();
    const target = s.engine.captureRegexTarget(2);
    await s.service.save('A', undefined, { select: false });
    await expect(s.engine.saveScriptsByType([{ id: 'new' }], 2, target)).resolves.toBeUndefined();
    expect(s.settings.extensions.regex_scripts).toEqual([{ id: 'new' }]);
});

test('A to B to A during strict settings write is rejected and does not overwrite A', async () => {
    const s = await integratedPresetSetup();
    const target = s.engine.captureRegexTarget(2);
    let finish;
    s.context.saveSettings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.engine.saveScriptsByType([{ id: 'new' }], 2, target);
    await s.service.select('B');
    await s.service.select('A');
    finish();
    await expect(pending).rejects.toThrow('selection changed');
    expect(s.port.persist).not.toHaveBeenCalled();
    expect(s.settings.extensions.regex_scripts).toEqual([]);
    expect(s.presets[0].extensions.regex_scripts).toEqual([]);
});

test('failed destination preset save leaves no phantom copy and moving can retry', async () => {
    const s = await integratedPresetSetup();
    const bridge = createRegexListBridge({ capture: type => type === 1 ? null : s.engine.captureRegexTarget(type),
        read: s.engine.getScriptsForTarget, save: s.engine.saveScriptsByType, authorize: async () => {},
        confirm: async () => true, edit: async () => {}, exportScripts: () => {}, afterChange: async () => {} });
    bridge.refresh();
    const action = { kind: 'move', refs: [{ groupKey: 'global', id: 'r' }], toType: 2 };
    s.port.persist.mockRejectedValueOnce(new Error('offline'));
    await expect(bridge.execute(action)).rejects.toThrow('offline');
    expect(s.settings.extensions.regex_scripts).toEqual([]);
    expect(s.presets[0].extensions.regex_scripts).toEqual([]);
    expect(s.engineContext.feature_settings.regex.map(rule => rule.id)).toEqual(['r']);
    await expect(bridge.execute(action)).resolves.toBe('saved');
    expect(s.settings.extensions.regex_scripts.map(rule => rule.id)).toEqual(['r']);
    expect(s.engineContext.feature_settings.regex).toEqual([]);
});

test('unselected target becoming selected while its preset write is pending reports partial save', async () => {
    const s = await integratedPresetSetup();
    const target = s.engine.captureRegexTarget(2);
    await s.service.select('B');
    let finish;
    s.port.persist.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.engine.saveScriptsByType([{ id: 'new' }], 2, target);
    await s.service.select('A');
    finish('A');
    await expect(pending).rejects.toThrow('selection changed');
    expect(s.presets[0].extensions.regex_scripts).toEqual([{ id: 'new' }]);
    expect(s.settings.extensions.regex_scripts).toEqual([]);
});

test('failed preset write preserves newer settings edits rather than rolling them back', async () => {
    const s = await integratedPresetSetup();
    const target = s.engine.captureRegexTarget(2);
    let reject;
    s.port.persist.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const pending = s.engine.saveScriptsByType([{ id: 'new' }], 2, target);
    await tick();
    s.settings.extensions.regex_scripts = [{ id: 'later' }];
    reject(new Error('offline'));
    await expect(pending).rejects.toThrow('offline');
    expect(s.settings.extensions.regex_scripts).toEqual([{ id: 'later' }]);
    expect(s.presets[0].extensions.regex_scripts).toEqual([]);
});

// Integration proof: production list bridge, engine, settings save and character
// extension writer; only HTTP and browser boundaries are controlled. Each test
// owns its in-memory state, no shared directory or temp files; budget 10 seconds.
function integratedMoveSetup(sourceType) {
    const settings = settingsSetup();
    const character = { avatar: 'alice.png', data: { extensions: { regex_scripts: sourceType === 1 ? [{ id: 'r' }] : [] } } };
    character.json_data = JSON.stringify({ data: character.data });
    let domValue = character.json_data;
    const featureSettings = { regex: sourceType === 0 ? [{ id: 'r' }] : [] };
    const requests = [];
    let failUrl;
    const fetch = jest.fn(async (url, request) => {
        requests.push({ url, body: JSON.parse(request.body) });
        if (url === failUrl) { failUrl = undefined; return { ok: false, status: 500, statusText: 'offline' }; }
        return success(2);
    });
    settings.context.feature_settings = featureSettings;
    settings.context.fetch = fetch;
    const characterContext = {
        getContext: () => ({ characters: [character], characterId: 0 }), UNSET_VALUE: '__@@UNSET@@__',
        extensionFieldWrites: new WeakMap(),
        setValueByPath, deleteValueByPath: extract('public/scripts/utils.js', 'export function deleteValueByPath(', '\n/**', {}),
        getRequestHeaders: () => ({}), fetch, console: { error: jest.fn(), warn: jest.fn() },
        $: () => ({ val: value => value === undefined ? domValue : (domValue = value) }),
    };
    const writeExtensionField = extract('public/scripts/feature-settings.js', 'export async function writeExtensionField(', '\n/**', characterContext);
    const engineContext = { SCRIPT_TYPES: { GLOBAL: 0, SCOPED: 1, PRESET: 2 }, SCRIPT_TYPE_UNKNOWN: -1,
        DEFAULT_GET_REGEX_SCRIPTS_OPTIONS: { allowedOnly: false }, characters: [character], this_chid: 0,
        feature_settings: featureSettings, getPresetManager: () => null,
        saveSettingsStrict: () => settings.save(0, { strict: true }), writeExtensionField, console };
    const engine = functions('public/scripts/extensions/regex/engine.js', 'export function getRegexScripts(', '\n/**\n * Check if character', engineContext);
    const bridge = createRegexListBridge({ capture: engine.captureRegexTarget, read: engine.getScriptsForTarget,
        save: engine.saveScriptsByType, authorize: async () => {}, confirm: async () => true,
        edit: async () => {}, exportScripts: () => {}, afterChange: async () => {} });
    bridge.refresh();
    return { bridge, engine, character, featureSettings, requests, fetch, getDom: () => domValue, setDom: value => { domValue = value; },
        failNext: url => { failUrl = url; } };
}

test('global destination HTTP failure then recovery allows the real move to retry', async () => {
    const s = integratedMoveSetup(1);
    const action = { kind: 'move', refs: [{ groupKey: 'character:alice.png', id: 'r' }], toType: 0 };
    s.failNext('/api/settings/save');
    await expect(s.bridge.execute(action)).rejects.toThrow('offline');
    expect(s.character.data.extensions.regex_scripts.map(rule => rule.id)).toEqual(['r']);
    expect(s.featureSettings.regex).toEqual([]);
    await expect(s.bridge.execute(action)).resolves.toBe('saved');
    expect(s.featureSettings.regex.map(rule => rule.id)).toEqual(['r']);
    expect(s.character.data.extensions.regex_scripts).toEqual([]);
    expect(s.requests.filter(request => request.url === '/api/settings/save')).toHaveLength(2);
    expect(s.requests.at(-1).url).toBe('/api/characters/merge-attributes');
});

test('character destination HTTP failure then recovery allows the real move to retry', async () => {
    const s = integratedMoveSetup(0);
    const action = { kind: 'move', refs: [{ groupKey: 'global', id: 'r' }], toType: 1 };
    s.failNext('/api/characters/merge-attributes');
    await expect(s.bridge.execute(action)).rejects.toThrow('offline');
    expect(s.featureSettings.regex.map(rule => rule.id)).toEqual(['r']);
    expect(s.character.data.extensions.regex_scripts).toEqual([]);
    expect(JSON.parse(s.character.json_data).data.extensions.regex_scripts).toEqual([]);
    expect(JSON.parse(s.getDom()).data.extensions.regex_scripts).toEqual([]);
    await expect(s.bridge.execute(action)).resolves.toBe('saved');
    expect(s.character.data.extensions.regex_scripts.map(rule => rule.id)).toEqual(['r']);
    expect(JSON.parse(s.character.json_data).data.extensions.regex_scripts.map(rule => rule.id)).toEqual(['r']);
    expect(JSON.parse(s.getDom()).data.extensions.regex_scripts.map(rule => rule.id)).toEqual(['r']);
    expect(s.featureSettings.regex).toEqual([]);
    expect(s.requests.filter(request => request.url === '/api/characters/merge-attributes')).toHaveLength(2);
    expect(s.requests.at(-1).url).toBe('/api/settings/save');
});

test.each([0, 1])('failed destination type %i leaves concurrent in-place edits intact', async destination => {
    const source = destination === 0 ? 1 : 0;
    const s = integratedMoveSetup(source);
    const action = { kind: 'move', refs: [{ groupKey: source === 0 ? 'global' : 'character:alice.png', id: 'r' }], toType: destination };
    let finish;
    s.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.bridge.execute(action);
    await tick();
    const live = destination === 0 ? s.featureSettings.regex : s.character.data.extensions.regex_scripts;
    live.push({ id: 'concurrent' });
    if (destination === 1) {
        const newer = JSON.parse(s.character.json_data);
        newer.data.extensions.regex_scripts.push({ id: 'concurrent' });
        s.character.json_data = JSON.stringify(newer);
    }
    finish({ ok: false, status: 500, statusText: 'offline' });
    await expect(pending).rejects.toThrow('offline');
    expect(live.map(rule => rule.id)).toEqual(['r', 'concurrent']);
    expect(destination === 0 ? s.featureSettings.regex : s.character.data.extensions.regex_scripts).toBe(live);
    if (destination === 1) expect(JSON.parse(s.character.json_data).data.extensions.regex_scripts.map(rule => rule.id)).toEqual(['r', 'concurrent']);
});

test.each([0, 1])('older failed strict write cannot undo a newer successful write of the same type %i array', async type => {
    const s = integratedMoveSetup(type === 0 ? 1 : 0);
    const target = s.engine.captureRegexTarget(type);
    const scripts = [{ id: 'newer' }];
    let finish;
    s.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = s.engine.saveScriptsByType(scripts, type, target);
    await tick();
    await s.engine.saveScriptsByType(scripts, type, target);
    finish({ ok: false, status: 500, statusText: 'offline' });
    await expect(first).rejects.toThrow('offline');
    expect(type === 0 ? s.featureSettings.regex : s.character.data.extensions.regex_scripts).toBe(scripts);
    if (type === 1) expect(JSON.parse(s.character.json_data).data.extensions.regex_scripts).toEqual([{ id: 'newer' }]);
});

test('character rollback preserves unrelated concurrent JSON and form changes', async () => {
    const s = integratedMoveSetup(0);
    let finish;
    s.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const action = { kind: 'move', refs: [{ groupKey: 'global', id: 'r' }], toType: 1 };
    const pending = s.bridge.execute(action);
    await tick();
    const newer = JSON.parse(s.character.json_data);
    newer.data.extensions.world = 'new book';
    s.character.json_data = JSON.stringify(newer);
    s.setDom(s.character.json_data);
    finish({ ok: false, status: 500, statusText: 'offline' });
    await expect(pending).rejects.toThrow('offline');
    const json = JSON.parse(s.character.json_data);
    expect(json.data.extensions).toEqual({ regex_scripts: [], world: 'new book' });
    expect(JSON.parse(s.getDom())).toEqual(json);
});
