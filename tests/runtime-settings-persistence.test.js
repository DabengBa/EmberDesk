import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createRuntimeSettingsPersistence } from '../public/scripts/runtime-settings-persistence.js';

function fixture() {
    const calls = [];
    let revision = 2;
    let document;
    const conflict = { hasConflict: () => false, assertWritable: jest.fn(), saveRuntime: async ({ post }) => post() };
    const ports = {
        conflict, isReady: () => true, schedule: value => calls.push(['schedule', value]),
        isResponseCustomized: () => false, restoreResponse: () => {}, version: () => '1', ensureVersion: async () => {},
        persistedCurrentVersion: () => '1', accountStorage: () => ({}), activeCharacter: () => '', amountGen: () => 80,
        maxContext: () => 2048, mainApi: () => 'openai', worldInfoSettings: () => ({}), powerUser: () => ({}),
        featureSettings: () => ({}), tags: () => [], tagMap: () => ({}), oaiSettings: () => ({}), background: () => ({}),
        getRevision: () => revision,
        setRevision: value => { revision = value; }, setDocument: value => { document = value; },
        beginSnapshot: value => { calls.push(['begin', value]); return 'token'; },
        finishSnapshot: (token, value) => calls.push(['finish', token, value]),
        compress: async request => request, headers: () => ({}),
        post: async () => ({ ok: true, json: async () => ({ result: 'ok', settings_revision: 3 }) }),
        onConflict: () => {}, onError: () => {}, emitUpdated: async () => calls.push('emit'),
    };
    return { ports, calls, getDocument: () => document, getRevision: () => revision };
}

test('saves revision and emits after committing document without protocol field', async () => {
    const f = fixture();
    const service = createRuntimeSettingsPersistence(f.ports);
    await service.saveSettings();
    expect(f.getRevision()).toBe(3);
    expect(f.getDocument()).toMatchObject({ main_api: 'openai', currentVersion: '1' });
    expect(f.getDocument()).not.toHaveProperty('settings_revision');
    expect(f.calls).toEqual([['begin', 2], ['finish', 'token', 3], 'emit']);
});

test('strict save reports a queued write while not ready', async () => {
    const f = fixture();
    f.ports.isReady = () => false;
    const service = createRuntimeSettingsPersistence(f.ports);
    await expect(service.saveSettings(0, { strict: true })).rejects.toThrow('Settings save is queued: settings not ready');
    expect(f.calls).toEqual([['schedule', undefined]]);
});

test('production settings exports forward payload and strict saves to the real owner', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('const runtimeSettingsPersistence = createRuntimeSettingsPersistence({');
    const end = source.indexOf('\n}', source.indexOf('export async function saveSettings(', start)) + 2;
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const scheduled = jest.fn();
    const env = {
        createRuntimeSettingsPersistence,
        runtimeSettingsConflict: { hasConflict: () => false }, settingsReady: false, saveSettingsDebounced: scheduled,
        currentVersion: '1', settings: { currentVersion: 'old' }, settingsDocumentRevision: 2,
        resolvePersistedCurrentVersion: ({ currentVersion }) => currentVersion,
        accountStorage: { getState: () => ({ test: true }) }, active_character: 'alice', amount_gen: 80,
        max_context: 2048, main_api: 'openai', getWorldInfoSettings: () => ({}), power_user: {}, feature_settings: {},
        tags: [], tag_map: {}, oai_settings: {}, background_settings: {},
        beginSettingsSaveSnapshot: () => {}, finishSettingsSaveSnapshot: () => {},
        compressRequest: async x => x, getRequestHeaders: () => ({}),
    };
    const exports = new Function(...Object.keys(env), `${source.slice(start, end).replace('export async function', 'async function')}\nreturn { buildRuntimeSettingsPayload, saveSettings };`)(...Object.values(env));
    expect(exports.buildRuntimeSettingsPayload()).toMatchObject({ active_character: 'alice', settings_revision: 2, currentVersion: '1' });
    await expect(exports.saveSettings(0, { strict: true })).rejects.toThrow('Settings save is queued: settings not ready');
    expect(scheduled).toHaveBeenCalledTimes(1);
});
