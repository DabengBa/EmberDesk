// Integration: real shell wiring, settings owner, preset manager and preset service;
// only HTTP/UI edges are controlled. No user data or temp files; 30s lane budget.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { afterAll, afterEach, beforeAll, expect, jest, test } from '@jest/globals';
import lodash from 'lodash';
import { createSettingsWriteOwner } from '../public/scripts/settings-write-owner.js';
import { createRuntimeSettingsPersistence } from '../public/scripts/runtime-settings-persistence.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function between(source, start, end) {
    const a = source.indexOf(start);
    const b = source.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error(`Production seam not found: ${start} / ${end}`);
    return source.slice(a, b);
}
let createPresetService;
beforeAll(async () => {
    const source = stripTypeScriptTypes(read('app/lib/preset-service.ts'));
    ({ createPresetService } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
function response(status, body = {}) {
    return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body };
}

async function fixture() {
    const shell = read('public/script.js');
    const managerSource = read('public/scripts/preset-manager.js');
    const openai = read('public/scripts/openai.js');
    const settings = { preset_settings_openai: 'A', extensions: { regex: ['old'] } };
    const presets = [{ extensions: { regex: ['old'] } }, { extensions: { regex: ['bob'] } }];
    const names = { A: 0, B: 1 };
    const owner = createSettingsWriteOwner();
    const requests = [];
    const events = [];
    const settingsRequest = deferred();
    let nextSettings = () => response(200, { result: 'ok', settings_revision: 3 });
    let nextPreset = () => response(200, { name: 'A' });
    const fetch = jest.fn(async (url, request) => {
        requests.push({ url, body: JSON.parse(request.body) });
        if (url === '/api/settings/save') settingsRequest.resolve();
        return url === '/api/settings/save' ? nextSettings() : nextPreset();
    });
    const eventSource = { on() {}, emit: async (...args) => { events.push(args); } };
    const event_types = { CHAT_CHANGED: 'chat', SETTINGS_UPDATED: 'updated' };
    const presetEnv = {
        oai_settings: settings, openai_settings: presets, openai_setting_names: names,
        settingsToUpdate: { extensions: ['#NULL_SELECTOR', 'extensions'] }, SECRET_KEYS: {}, default_settings: {},
        getSanitizedFilename: x => x, fetch, getRequestHeaders: () => ({}), eventSource, event_types,
        saveSettingsDebounced: jest.fn(), migrateChatCompletionSettings: () => {}, reconnectOpenAi: () => {},
        presetDialogs: {}, structuredClone,
    };
    const openaiCode = between(openai, 'let presetService;', '/** @type {import(\'./PromptManager.js\')');
    const openaiApi = new Function(...Object.keys(presetEnv), `${openaiCode.replaceAll('export function ', 'function ')}; return { installOpenAIPresetService, getOpenAIPresetService };`)(...Object.values(presetEnv));
    const service = openaiApi.installOpenAIPresetService(createPresetService);
    const managerEnv = {
        getOpenAIPresetService: openaiApi.getOpenAIPresetService, eventSource, event_types,
        openai_setting_names: names, openai_settings: presets, oai_settings: settings,
        ensurePlainObject: x => x, lodash, structuredClone,
    };
    const managerCode = managerSource.slice(managerSource.indexOf('let presetManagerContext;'))
        .replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ');
    const manager = new Function(...Object.keys(managerEnv), `${managerCode}; return { installPresetManagerContext, initPresetManager, getPresetManager };`)(...Object.values(managerEnv));
    const saveCode = between(shell, 'const runtimeSettingsPersistence = createRuntimeSettingsPersistence({', '\n/**\n * Sets the generation parameters');
    const installCode = between(shell, 'installPresetManagerContext({', '\n        installPromptManagerDomain(');
    const shellEnv = {
        createRuntimeSettingsPersistence, runtimeSettingsConflict: owner, installPresetManagerContext: manager.installPresetManagerContext,
        fetch, eventSource, event_types, oai_settings: settings, main_api: 'openai', characters: [], this_chid: 0,
        saveSettingsDebounced: jest.fn(), generationCaller: { TempResponseLength: { isCustomized: () => false, restore() {} } },
        currentVersion: '1', deferredVersionTask: { ensure: async () => {} }, resolvePersistedCurrentVersion: () => '1',
        accountStorage: { getState: () => ({}) }, active_character: '', amount_gen: 80, max_context: 2048,
        getWorldInfoSettings: () => ({}), power_user: {}, feature_settings: {}, tags: [], tag_map: {}, background_settings: {},
        beginSettingsSaveSnapshot: () => 'snapshot', finishSettingsSaveSnapshot: () => {},
        compressRequest: async request => request, getRequestHeaders: () => ({}),
        window: { dispatchEvent: jest.fn() }, Event: class {}, toastr: { warning: jest.fn(), error: jest.fn() },
        t: strings => strings[0],
    };
    const shellApi = new Function(...Object.keys(shellEnv), `let settingsReady = true, settingsDocumentRevision = 2, settings = {};
        ${saveCode.replace('export async function ', 'async function ')}
        ${installCode}
        return { setReady: value => { settingsReady = value; }, getRevision: () => settingsDocumentRevision };`)(...Object.values(shellEnv));
    await manager.initPresetManager();
    return { settings, presets, names, owner, requests, events, service, manager: manager.getPresetManager(), shellApi,
        setSettingsResponse: fn => { nextSettings = fn; }, setPresetResponse: fn => { nextPreset = fn; },
        scheduled: shellEnv.saveSettingsDebounced, settingsRequest: settingsRequest.promise };
}

function write(f, options = {}) {
    return f.manager.writePresetExtensionField({ path: 'regex', value: ['new'], strict: true, expectedPreset: f.presets[0], ...options });
}

test('queued strict write rejects before any settings or preset HTTP request', async () => {
    const f = await fixture();
    f.shellApi.setReady(false);
    await expect(write(f)).rejects.toThrow('Settings save is queued: settings not ready');
    expect(f.scheduled).toHaveBeenCalledTimes(1);
    expect(f.requests).toEqual([]);
    expect(f.settings.extensions.regex).toEqual(['old']);
    expect(f.presets[0].extensions.regex).toEqual(['old']);
});

test('409 marks the real owner conflicted and prevents preset and later settings writes', async () => {
    const f = await fixture();
    f.setSettingsResponse(() => response(409));
    await expect(write(f)).rejects.toThrow('Failed to save settings: revision conflict');
    expect(f.owner.hasConflict()).toBe(true);
    expect(f.settings.extensions.regex).toEqual(['old']);
    await expect(write(f)).rejects.toThrow('Unresolved runtime settings conflict');
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save']);
    expect(f.presets[0].extensions.regex).toEqual(['old']);
});

test('preset failure after committed settings compensates through real strict writer using next revision', async () => {
    const f = await fixture();
    let revision = 2;
    f.setSettingsResponse(() => response(200, { result: 'ok', settings_revision: ++revision }));
    f.setPresetResponse(() => response(500));
    await expect(write(f)).rejects.toThrow('Failed to save preset');
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save', '/api/presets/save', '/api/settings/save']);
    expect(f.requests[0].body).toMatchObject({ settings_revision: 2, oai_settings: { extensions: { regex: ['new'] } } });
    expect(f.requests[1].body).toMatchObject({ name: 'A', preset: { extensions: { regex: ['new'] } } });
    expect(f.requests[2].body).toMatchObject({ settings_revision: 3, oai_settings: { extensions: { regex: ['old'] } } });
    expect(f.shellApi.getRevision()).toBe(4);
    expect(f.settings.extensions.regex).toEqual(['old']);
    expect(f.presets[0].extensions.regex).toEqual(['old']);
});

test('a 409 during compensation exposes both failures and locks the real settings owner', async () => {
    const f = await fixture();
    let call = 0;
    f.setSettingsResponse(() => ++call === 1 ? response(200, { result: 'ok', settings_revision: 3 }) : response(409));
    f.setPresetResponse(() => response(500));
    const error = await write(f).catch(value => value);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe('Preset save failed and settings rollback failed');
    expect(error.errors.map(value => value.message)).toEqual(['Failed to save preset', 'Failed to save settings: revision conflict']);
    expect(f.owner.hasConflict()).toBe(true);
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save', '/api/presets/save', '/api/settings/save']);
    expect(f.settings.extensions.regex).toEqual(['old']);
    expect(f.presets[0].extensions.regex).toEqual(['old']);
});

test('preset failure does not compensate over a newer settings edit', async () => {
    const f = await fixture();
    const gate = deferred();
    const presetRequest = deferred();
    f.setPresetResponse(() => { presetRequest.resolve(); return gate.promise; });
    const pending = write(f);
    await presetRequest.promise;
    f.settings.extensions = { regex: ['newer'] };
    gate.resolve(response(500));
    await expect(pending).rejects.toThrow('Failed to save preset');
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save', '/api/presets/save']);
    expect(f.settings.extensions.regex).toEqual(['newer']);
    expect(f.presets[0].extensions.regex).toEqual(['old']);
});
test('selection A → B → A during pending committed settings write rejects without writing either preset or reverting new selection', async () => {
    const f = await fixture();
    const gate = deferred();
    f.setSettingsResponse(() => gate.promise);
    const pending = write(f);
    await f.settingsRequest;
    await f.service.select('B');
    await f.service.select('A');
    f.settings.extensions = { regex: ['newer'] };
    gate.resolve(response(200, { result: 'ok', settings_revision: 3 }));
    await expect(pending).rejects.toThrow('Preset selection changed while saving settings');
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save']);
    expect(f.settings.extensions.regex).toEqual(['newer']);
    expect(f.presets.map(preset => preset.extensions.regex)).toEqual([['old'], ['bob']]);
});

test('replaced preset identity during pending settings commit is not overwritten and is compensated', async () => {
    const f = await fixture();
    const gate = deferred();
    let call = 0;
    f.setSettingsResponse(() => ++call === 1 ? gate.promise : response(200, { result: 'ok', settings_revision: 4 }));
    const pending = write(f);
    await f.settingsRequest;
    const replacement = { extensions: { regex: ['replacement'] } };
    f.presets[0] = replacement;
    gate.resolve(response(200, { result: 'ok', settings_revision: 3 }));
    await expect(pending).rejects.toThrow('Preset no longer exists or changed');
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save', '/api/settings/save']);
    expect(f.settings.extensions.regex).toEqual(['old']);
    expect(f.presets[0]).toBe(replacement);
    expect(replacement.extensions.regex).toEqual(['replacement']);
});

test('successful strict write commits settings before the preset with captured identity', async () => {
    const f = await fixture();
    const identity = f.presets[0];
    await expect(write(f)).resolves.toBeUndefined();
    expect(f.requests.map(x => x.url)).toEqual(['/api/settings/save', '/api/presets/save']);
    expect(f.settings.extensions.regex).toEqual(['new']);
    expect(f.presets[0]).toBe(identity);
    expect(identity.extensions.regex).toEqual(['new']);
});
