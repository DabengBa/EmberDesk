import { test, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createSortSaveGuard } from '../public/scripts/character-sort-save-guard.js';

function setup() {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function saveSettings(loopCounter = 0)');
    const end = source.indexOf('\n/**', start);
    const listeners = new Set();
    const guard = createSortSaveGuard({ addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) });
    const requests = [];
    const power_user = { sort_field: 'name', sort_order: 'asc', sort_rule: 'string' };
    const context = {
        settingsReady: true, TempResponseLength: { isCustomized: () => false }, currentVersion: '1', settings: {},
        resolvePersistedCurrentVersion: () => '1', accountStorage: { getState: () => ({}) },
        active_character: null, amount_gen: 1, max_context: 1, main_api: 'x', getWorldInfoSettings: () => ({}),
        power_user, feature_settings: {}, tags: [], tag_map: {}, oai_settings: {}, background_settings: {}, settingsDocumentRevision: 1,
        beginSettingsSaveSnapshot: revision => guard.begin(revision), finishSettingsSaveSnapshot: (s, r) => guard.finish(s, r),
        compressRequest: async request => request, getRequestHeaders: () => ({}),
        fetch: (_, request) => new Promise(resolve => requests.push({ request, resolve })),
        eventSource: { emit: async () => {} }, event_types: { SETTINGS_UPDATED: 'updated' },
        toastr: { error: jest.fn(), warning: jest.fn() }, t: strings => strings[0], console: { error: jest.fn(), warn: jest.fn() },
    };
    const saveSettings = runInNewContext(`(${source.slice(start, end).replace('export ', '')})`, context);
    return { saveSettings, guard, listeners, requests, power_user, context };
}

test('real saveSettings snapshots the sort and retains the guard through concurrent responses and failure', async () => {
    const { saveSettings, guard, listeners, requests, power_user, context } = setup();
    guard.changed();
    const old = saveSettings();
    await new Promise(setImmediate);
    power_user.sort_order = 'desc';
    guard.changed();
    const current = saveSettings();
    await new Promise(setImmediate);
    expect(JSON.parse(requests[0].request.body).power_user.sort_order).toBe('asc');
    expect(JSON.parse(requests[1].request.body).power_user.sort_order).toBe('desc');
    requests[1].resolve({ ok: true, json: async () => ({ result: 'ok', settings_revision: 3 }) });
    await current;
    expect(listeners.size).toBe(0);
    requests[0].resolve({ ok: true, json: async () => ({ result: 'ok', settings_revision: 2 }) });
    await old;
    expect(listeners.size).toBe(0);
    guard.changed();
    const failed = saveSettings();
    await new Promise(setImmediate);
    requests[2].resolve({ ok: false, status: 500, statusText: 'error' });
    await failed;
    expect(listeners.size).toBe(1);
    expect(context.toastr.error).toHaveBeenCalled();
    const retry = saveSettings();
    await new Promise(setImmediate);
    requests[3].resolve({ ok: false, status: 409, json: async () => ({ settings_revision: 4 }) });
    await new Promise(setImmediate);
    expect(listeners.size).toBe(1);
    expect(JSON.parse(requests[4].request.body).settings_revision).toBe(4);
    requests[4].resolve({ ok: true, json: async () => ({ result: 'ok', settings_revision: 5 }) });
    await retry;
    expect(listeners.size).toBe(0);
});

test.each([{}, { result: 'ok' }, { result: 'ok', settings_revision: null }, { settings_revision: 2 }])('unconfirmed HTTP 200 %j retains the sort warning', async response => {
    const { saveSettings, guard, listeners, requests } = setup();
    guard.changed();
    const save = saveSettings();
    await new Promise(setImmediate);
    requests[0].resolve({ ok: true, json: async () => response });
    await save;
    expect(listeners.size).toBe(1);
});

test('confirmed save releases the warning while SETTINGS_UPDATED is still pending', async () => {
    const { saveSettings, guard, listeners, requests, context } = setup();
    let finishEvent;
    context.eventSource.emit = jest.fn(() => new Promise(resolve => { finishEvent = resolve; }));
    const finishSnapshot = jest.spyOn(context, 'finishSettingsSaveSnapshot');
    guard.changed();
    const save = saveSettings();
    await new Promise(setImmediate);
    requests[0].resolve({ ok: true, json: async () => ({ result: 'ok', settings_revision: 2 }) });
    await new Promise(setImmediate);
    expect(context.eventSource.emit).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    expect(finishSnapshot).toHaveBeenCalledTimes(1);
    guard.changed();
    finishEvent();
    await save;
    expect(finishSnapshot).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(1);
});

test('a rejected SETTINGS_UPDATED callback does not undo a confirmed save or finish twice', async () => {
    const { saveSettings, guard, listeners, requests, context } = setup();
    context.eventSource.emit = jest.fn(async () => { throw new Error('listener failed'); });
    const finishSnapshot = jest.spyOn(context, 'finishSettingsSaveSnapshot');
    guard.changed();
    const save = saveSettings();
    await new Promise(setImmediate);
    requests[0].resolve({ ok: true, json: async () => ({ result: 'ok', settings_revision: 2 }) });
    await save;
    expect(listeners.size).toBe(0);
    expect(finishSnapshot).toHaveBeenCalledTimes(1);
});
