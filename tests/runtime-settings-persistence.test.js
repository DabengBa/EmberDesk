import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createRuntimeSettingsPersistence, withStrictSettingsSaveFailureHandler } from '../public/scripts/runtime-settings-persistence.js';
import { createSettingsWriteOwner } from '../public/scripts/settings-write-owner.js';

function fixture() {
    const calls = [];
    const live = { amount: 80, model: 'original' };
    let revision = 2;
    let document;
    const conflict = createSettingsWriteOwner();
    const ports = {
        conflict, isReady: () => true, schedule: value => calls.push(['schedule', value]),
        isResponseCustomized: () => false, restoreResponse: () => {}, version: () => '1', ensureVersion: async () => {},
        persistedCurrentVersion: () => '1', accountStorage: () => ({}), activeCharacter: () => '', amountGen: () => live.amount,
        maxContext: () => 2048, mainApi: () => 'openai', worldInfoSettings: () => ({}), powerUser: () => ({}),
        featureSettings: () => ({}), tags: () => [], tagMap: () => ({}), oaiSettings: () => ({ openai_model: live.model }), background: () => ({}),
        getRevision: () => revision,
        setRevision: value => { revision = value; }, setDocument: value => { document = value; },
        beginSnapshot: value => { calls.push(['begin', value]); return 'token'; },
        finishSnapshot: (token, value) => calls.push(['finish', token, value]),
        compress: async request => request, headers: () => ({}),
        post: async () => ({ ok: true, json: async () => ({ result: 'ok', settings_revision: 3 }) }),
        applyResolution: changes => { for (const { path, value } of changes) if (path[1] === 'openai_model') live.model = value; },
        onConflict: () => {}, onError: () => {}, emitUpdated: async () => calls.push('emit'),
    };
    const initialize = () => {
        const service = createRuntimeSettingsPersistence(ports);
        const { settings_revision, ...document } = service.buildRuntimeSettingsPayload();
        service.initialize(document, settings_revision);
        return service;
    };
    return { ports, calls, live, initialize, getDocument: () => document, getRevision: () => revision };
}

test('saves revision and emits after committing document without protocol field', async () => {
    const f = fixture();
    const service = f.initialize();
    f.live.amount = 100;
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

test('overlapping runtime saves use the revision committed by the previous save', async () => {
    const f = fixture();
    let releaseFirst;
    const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
    let rules = [];
    f.ports.featureSettings = () => ({ regex: [...rules] });
    const requests = [];
    f.ports.post = jest.fn(async request => {
        requests.push(JSON.parse(request.body));
        if (requests.length === 1) await firstResponse;
        return { ok: true, json: async () => ({ result: 'ok', settings_revision: requests.length + 2 }) };
    });
    const service = f.initialize();
    rules = ['alpha'];
    const first = service.saveSettings(0, { strict: true });
    await Promise.resolve();
    rules = [];
    const second = service.saveSettings(0, { strict: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(requests).toHaveLength(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(requests.map(request => [request.settings_revision, request.feature_settings.regex])).toEqual([
        [2, ['alpha']], [3, []],
    ]);
    expect(f.getRevision()).toBe(4);
});

test('a true overlap blocks queued strict saves and keeps an optimistic draft after rollback', async () => {
    const f = fixture();

    let release;
    const wait = new Promise(resolve => { release = resolve; });
    f.ports.post = jest.fn(async () => {
        await wait;
        return { status: 409 };
    });
    f.ports.fetchLatest = async () => ({ document: { oai_settings: { openai_model: 'remote' } }, revision: 3 });
    const service = f.initialize();
    f.live.model = 'local';
    const first = withStrictSettingsSaveFailureHandler(() => { f.live.model = 'original'; }, () => service.saveSettings(0, { strict: true }));
    const second = service.saveSettings(0, { strict: true });
    const results = Promise.allSettled([first, second]);
    release();
    const [a, b] = await results;
    expect(a.status).toBe('rejected');
    expect(a.reason.message).toBe('Failed to save settings: revision conflict');
    expect(b.status).toBe('rejected');
    expect(b.reason.message).toBe('Unresolved runtime settings conflict');
    expect(f.ports.post).toHaveBeenCalledTimes(1);
    expect(f.getRevision()).toBe(2);
    expect(f.live.model).toBe('original');
    expect(service.recoveryDocument().oai_settings.openai_model).toBe('local');
    const [row] = service.conflictRows();
    expect(row).toMatchObject({ mine: 'local', saved: 'remote' });
    await service.resolveConflict([{ ...row, use: 'saved' }]);
    expect(f.live.model).toBe('remote');
    expect(f.ports.conflict.hasConflict()).toBe(false);
    expect(f.ports.post).toHaveBeenCalledTimes(1);
});

test('a no-change runtime save does not POST or emit a settings update', async () => {
    const f = fixture();
    f.ports.post = jest.fn();
    await f.initialize().saveSettings(0, { strict: true });
    expect(f.ports.post).not.toHaveBeenCalled();
    expect(f.calls).toEqual([['begin', 2], ['finish', 'token', 2]]);
});

test('rebasing one field does not mark an unseen remote field as reviewed', async () => {
    const f = fixture();
    f.ports.post = jest.fn()
        .mockResolvedValueOnce({ status: 409 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'ok', settings_revision: 4 }) });
    f.ports.fetchLatest = async () => ({ document: { amount_gen: 80, oai_settings: { openai_model: 'remote' } }, revision: 3 });
    const service = f.initialize();
    f.live.amount = 100;
    await service.saveSettings(0, { strict: true });
    expect(f.getDocument()).toMatchObject({ amount_gen: 100, oai_settings: { openai_model: 'remote' } });
    f.live.model = 'local';
    await expect(service.saveSettings(0, { strict: true })).rejects.toThrow('revision conflict');
    expect(service.conflictRows()).toEqual([expect.objectContaining({ mine: 'local', saved: 'remote' })]);
    expect(f.ports.post).toHaveBeenCalledTimes(2);
});

test('a settings-updated subscriber may await another save without deadlocking', async () => {
    const f = fixture();
    let service;
    let notifications = 0;
    f.ports.emitUpdated = async () => {
        if (++notifications === 1) {
            f.live.amount = 120;
            await service.saveSettings(0, { strict: true });
        }
    };
    f.ports.post = jest.fn(f.ports.post);
    service = f.initialize();
    f.live.amount = 100;
    await service.saveSettings(0, { strict: true });
    expect(f.ports.post).toHaveBeenCalledTimes(2);
    expect(notifications).toBe(2);
});

test('strict rollback handler belongs only to its synchronous save invocation', async () => {
    const f = fixture();
    const rollback = jest.fn();
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    f.ports.post = jest.fn(async () => ({ ok: false, status: 500, statusText: 'offline' }));
    try {
        const service = f.initialize();
        f.live.amount = 100;
        const first = withStrictSettingsSaveFailureHandler(rollback, () => service.saveSettings(0, { strict: true }));
        const second = service.saveSettings(0, { strict: true });
        const results = await Promise.allSettled([first, second]);
        expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
        expect(rollback).toHaveBeenCalledTimes(1);
        expect(f.ports.post).toHaveBeenCalledTimes(2);
    } finally {
        errorLog.mockRestore();
    }
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
        runtimeSettingsConflict: createSettingsWriteOwner(), settingsReady: false, saveSettingsDebounced: scheduled,
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
