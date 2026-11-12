import fs from 'node:fs';

import { stripTypeScriptTypes } from 'node:module';
import { describe, expect, test } from '@jest/globals';

let factory;
beforeAll(async () => {
    const file = new URL('../app/lib/preset-service.ts', import.meta.url);
    if (fs.existsSync(file)) {
        const source = fs.readFileSync(file, 'utf8');
        factory = (await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)).createPresetService;
    }
});

function fixture() {
    const settings = { preset_settings_openai: 'A', temp_openai: 0.6, extensions: { regex: ['x'] }, prompts: [{ content: 'hi' }] };
    const presets = [{ temperature: 0.5, extensions: { regex: ['x'] }, extra: 'kept' }, { temperature: 1.1 }];
    const names = { A: 0, B: 1 };
    const calls = [];
    const port = {
        read: () => ({ settings, presets, names }),
        fields: { temperature: 'temp_openai', extensions: 'extensions', prompts: 'prompts' },
        sanitizeName: async name => name,
        persist: async (name, body) => { calls.push(['save', name, structuredClone(body)]); return name; },
        remove: async name => { calls.push(['delete', name]); },
        emit: async (event, payload) => { calls.push([event, payload]); },
        changed: () => {}, normalize: value => value, afterApply: () => {},
    };

    expect(factory).toEqual(expect.any(Function));
    return { settings, presets, names, calls, port, service: factory(port) };
}

describe('typed preset service', () => {
    test('save and delete failures leave authority untouched', async () => {
        const { service, port, settings, names, presets } = fixture();
        port.persist = async () => { throw Error('save failed'); };
        await expect(service.save('A')).rejects.toThrow('save failed');
        expect(presets[0].temperature).toBe(0.5);
        port.remove = async () => { throw Error('delete failed'); };
        await expect(service.delete('A')).rejects.toThrow('delete failed');
        expect(names.A).toBe(0);
        expect(settings.preset_settings_openai).toBe('A');
    });

    test('rename persists full current body, keeps both names on partial failure', async () => {
        const { service, port, calls, names, presets } = fixture();
        port.remove = async () => { throw Error('delete failed'); };
        await expect(service.rename('C')).rejects.toThrow(/partial/i);
        expect(calls).toContainEqual(['save', 'C', expect.objectContaining({ temperature: 0.6, extra: 'kept', extensions: { regex: ['x'] }, prompts: [{ content: 'hi' }] })]);
        expect(Object.keys(names)).toEqual(['A', 'B', 'C']);
        expect(presets[names.C].extra).toBe('kept');
    });

    test('rename validates normalized names before events and writes', async () => {
        const { service, port, calls, names, settings } = fixture();
        port.sanitizeName = async name => name.replaceAll('/', '');
        await expect(service.rename('A/')).rejects.toThrow();
        await expect(service.rename('B/')).rejects.toThrow();
        await expect(service.rename('/')).rejects.toThrow();
        expect(calls).toEqual([]);
        expect(Object.keys(names)).toEqual(['A', 'B']);
        expect(settings.preset_settings_openai).toBe('A');
        await service.rename('C/');
        expect(calls).toContainEqual(['renameBefore', { oldName: 'A', newName: 'C' }]);
        expect(calls).toContainEqual(['renamed', { oldName: 'A', newName: 'C' }]);
        expect(calls).toContainEqual(['delete', 'A']);
        expect(calls).toContainEqual(['save', 'C', expect.any(Object)]);
    });

    test('select emits before/apply/after/changed even if before rejects', async () => {
        const { service, port, settings, calls } = fixture();
        port.emit = async (event) => {
            calls.push([event, settings.temp_openai]);
            if (event === 'before') throw Error('extension failure');
        };
        await service.select('B');
        expect(calls).toEqual([['before', 0.6], ['after', 1.1], ['changed', 1.1]]);
        expect(settings.preset_settings_openai).toBe('B');
        expect(service.getSnapshot().selected).toBe('B');
    });

    test('typed field validation updates live state and refresh observes external changes', () => {
        const { service, settings } = fixture();
        expect(() => service.setField('temp_openai', 3)).toThrow();
        expect(settings.temp_openai).toBe(0.6);
        service.setField('temp_openai', 0.8);
        expect(settings.temp_openai).toBe(0.8);
        settings.temp_openai = 1.2;
        service.refresh();
        expect(service.getSnapshot().settings.temp_openai).toBe(1.2);
    });

    test('before event receives live settings and may change the preset before apply', async () => {
        const { service, port, settings } = fixture();
        port.emit = async (event, payload) => {
            if (event === 'before') {
                expect(settings.preset_settings_openai).toBe('B');
                expect(payload.presetNameBefore).toBe('A');
                expect(payload.presetName).toBe('B');
                payload.preset.temperature = 0.9;
            }
        };
        await service.select('B');
        expect(settings.temp_openai).toBe(0.9);
    });

    test('missing extensions and pipeline reset on apply', async () => {
        const { service, port, settings } = fixture();
        port.fields.reply_pipeline = 'reply_pipeline';
        settings.reply_pipeline = { steps: [1] };
        await service.select('B');
        expect(settings.extensions).toEqual({});
        expect(settings.reply_pipeline).toBeNull();
    });

    test('segmented values are controlled and invalid values cannot update live settings', () => {
        const { service, port, settings } = fixture();
        port.fields.reasoning_effort = 'reasoning_effort';
        settings.reasoning_effort = 'high';
        service.setField('reasoning_effort', 'medium');
        expect(settings.reasoning_effort).toBe('medium');
        expect(service.getSnapshot().settings.reasoning_effort).toBe('medium');
        expect(() => service.setField('reasoning_effort', 'invalid')).toThrow();
        expect(settings.reasoning_effort).toBe('medium');
    });

    test('synchronous compatibility readers reflect live arrays and selected index', () => {
        const { service, names, settings } = fixture();
        expect(service.getAllPresets()).toEqual(['A', 'B']);
        expect(service.findPreset('A')).toBe('0');
        expect(service.getSelectedPreset()).toBe('0');
        expect(service.getSelectedPresetName()).toBe('A');
        names.C = 2;
        settings.preset_settings_openai = 'B';
        expect(service.findPreset('C')).toBe('2');
        expect(service.getSelectedPresetName()).toBe('B');
    });

    test('extension save can persist a supplied body without changing the selected preset', async () => {
        const { service, settings, calls } = fixture();
        await service.save('B', { extensions: { regex: ['updated'] }, extra: true }, { skipUpdate: true });
        expect(calls[0]).toEqual(['save', 'B', { extensions: { regex: ['updated'] }, extra: true }]);
        expect(settings.preset_settings_openai).toBe('A');
    });

    test('all SecretManager keys are excluded even when an imported body contains them', async () => {
        const { service, port, calls } = fixture();
        port.secretKeys = ['api_key_custom', 'api_key_minimax'];
        await service.save('C', { temperature: 1, api_key_custom: 'secret', api_key_minimax: 'secret', extra: 'preserved' });
        expect(calls[0][2]).toEqual({ temperature: 1, extra: 'preserved' });
    });

    test('restore uses the same validated live field mutation and not DOM events', () => {
        const { service, port, settings } = fixture();
        port.defaults = { temp_openai: 1 };
        service.restore('temp_openai');
        expect(settings.temp_openai).toBe(1);
        expect(service.getSnapshot().settings.temp_openai).toBe(1);
        expect(() => service.restore('unknown')).toThrow();
    });

    test('preset restore reapplies saved custom settings or persists a confirmed default', async () => {
        const { service, port, settings, calls } = fixture();
        port.restorePreset = async () => ({ isDefault: false, preset: {} });
        port.confirmRestore = async () => true;
        await service.restoreCurrent();
        expect(settings.temp_openai).toBe(0.5);
        port.restorePreset = async () => ({ isDefault: true, preset: { temperature: 1.3 } });
        await service.restoreCurrent();
        expect(settings.temp_openai).toBe(1.3);
        expect(calls).toContainEqual(['save', 'A', { temperature: 1.3 }]);
    });

    test('dirty confirmation cancel leaves preset unchanged; save precedes selection', async () => {
        const { service, port, settings, calls } = fixture();
        port.confirmSwitch = async () => 'cancel';
        await service.requestSelect('B');
        expect(settings.preset_settings_openai).toBe('A');
        port.confirmSwitch = async () => 'save';
        await service.requestSelect('B');
        expect(calls[0][0]).toBe('save');
        expect(calls[1][0]).toBe('before');
        expect(settings.preset_settings_openai).toBe('B');
    });
});

describe('OpenAI preset persistence', () => {
    test('deleting an earlier selection does not remove a newly selected preset', async () => {
        const { service, port, names, settings } = fixture();
        let respond;
        const response = new Promise(resolve => { respond = resolve; });
        port.remove = () => response;
        const deleting = service.delete();
        settings.preset_settings_openai = 'B';
        respond();
        await deleting;
        expect(names).toEqual({ B: 1 });
        expect(settings.preset_settings_openai).toBe('B');
    });
});

test('actual OpenAI composition port installs one service and reads cold-loaded state', async () => {
    const source = fs.readFileSync(new URL('../public/scripts/openai.js', import.meta.url), 'utf8');
    const start = source.indexOf('let presetService;');
    const end = source.indexOf('/** @type {import(\'./PromptManager.js\')', start);
    const fragment = source.slice(start, end).replaceAll('export function ', 'function ');
    const settings = { preset_settings_openai: 'A', temp_openai: 0.5, openai_model: 'gpt' };
    const names = { A: 0 };
    const presets = [{ temperature: 0.5 }];
    const events = [];
    const setup = new Function('oai_settings', 'settingsToUpdate', 'SECRET_KEYS', 'default_settings', 'eventSource', 'event_types', 'saveSettingsDebounced', 'updateFeatureSupportFlags', 'migrateChatCompletionSettings', 'reconnectOpenAi', 'fetch', 'getRequestHeaders', 'saveOpenAIPreset', 'getNames', 'getPresets', 'getSanitizedFilename', `
        let _presetChangeGuard = false;
        const openai_setting_names = getNames(); const openai_settings = getPresets();
        ${fragment}
        return { installOpenAIPresetService, refreshOpenAIPresetService };
    `)(settings, { temperature: ['', 'temp_openai'] }, { OPENAI: 'api_key_openai' }, {}, { emit: async (event, payload) => events.push([event, payload]) }, {
        OAI_PRESET_CHANGED_BEFORE: 'before', OAI_PRESET_CHANGED_AFTER: 'after', PRESET_CHANGED: 'changed', CHATCOMPLETION_MODEL_CHANGED: 'model',
    }, () => {}, () => {}, () => {}, () => {}, async () => ({ ok: true, json: async () => ({ name: 'B' }) }), () => ({}), () => {}, () => names, () => presets, async name => name);
    const service = setup.installOpenAIPresetService(factory);
    expect(setup.installOpenAIPresetService(() => { throw Error('second instance'); })).toBe(service);
    names.B = 1; presets.push({ temperature: 1.1 });
    setup.refreshOpenAIPresetService();
    expect(service.getSnapshot().names).toEqual(['A', 'B']);
    await service.select('B');
    expect(settings.temp_openai).toBe(1.1);
    expect(events.map(event => event[0])).toEqual(['before', 'model', 'after', 'changed']);
});

test('actual preset manager reads and saves OpenAI data without a select element', async () => {
    const { service, settings, names, presets, calls } = fixture();
    const source = fs.readFileSync(new URL('../public/scripts/preset-manager.js', import.meta.url), 'utf8');
    const start = source.indexOf('class PresetManager {');
    const end = source.indexOf('\n/**\n * Selects a preset by name', start);
    const Manager = new Function('getOpenAIPresetService', 'openai_settings', 'openai_setting_names', 'oai_settings', 'ensurePlainObject', 'lodash', `${source.slice(start, end)}; return PresetManager;`)(() => service, presets, names, settings, value => value, { set: (object, path, value) => { object[path] = value; } });
    const manager = new Manager(null, 'openai');
    expect(manager.getAllPresets()).toEqual(['A', 'B']);
    expect(manager.findPreset('A')).toBe('0');
    expect(manager.getSelectedPresetName()).toBe('A');
    expect(manager.getPresetSettings('A')).toEqual(expect.objectContaining({ temperature: 0.6, extra: 'kept' }));
    await manager.savePreset('C');
    expect(calls).toContainEqual(['save', 'C', expect.objectContaining({ temperature: 0.6, extra: 'kept' })]);
    expect(calls.map(call => call[0])).toEqual(['save', 'before', 'after', 'changed']);
    expect(manager.getSelectedPresetName()).toBe('C');
    await manager.writePresetExtensionField({ name: 'B', path: 'regex', value: ['rule'] });
    expect(manager.getSelectedPresetName()).toBe('C');
    expect(calls).toContainEqual(['save', 'B', expect.objectContaining({ extensions: { regex: ['rule'] } })]);
});

test('preset manager no longer registers or reads legacy preset DOM controls', () => {
    const source = fs.readFileSync(new URL('../public/scripts/preset-manager.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/data-preset-manager-|\$\(this\.select\)|presetManager\.select\b/);
    expect(source).not.toMatch(/new PresetManager\(\$\(e\)/);
});

test('manager registers only OpenAI and forwards rename, delete and restore lookup without DOM', async () => {
    const source = fs.readFileSync(new URL('../public/scripts/preset-manager.js', import.meta.url), 'utf8');
    const start = source.indexOf('const presetManagers = {};');
    const code = source.slice(start).replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
    const calls = [];
    const service = {
        rename: async name => calls.push(['rename', name]),
        delete: async name => calls.push(['delete', name]),
    };
    const on = (event, callback) => calls.push(['on', event, callback]);
    const parser = { addCommandObject: command => calls.push(['command', command.name]) };
    const fetch = async (url, options) => {
        calls.push(['fetch', url, JSON.parse(options.body)]);
        return { ok: true, json: async () => ({ isDefault: true, preset: { temperature: 1 } }) };
    };
    const setup = new Function('main_api', 'getOpenAIPresetService', 'eventSource', 'event_types', 'SlashCommandParser', 'SlashCommand', 'SlashCommandArgument', 'ARGUMENT_TYPE', 'fetch', 'getRequestHeaders', code + '\nreturn { initPresetManager, getPresetManager };')(
        'openai', () => service, { on }, { CHAT_CHANGED: 'chat' }, parser,
        { fromProps: value => value }, { fromProps: value => value }, { STRING: 'string' }, fetch, () => ({}),
    );
    await setup.initPresetManager();
    const manager = setup.getPresetManager('openai');
    expect(setup.getPresetManager('retired')).toBeNull();
    await manager.renamePreset('New');
    expect(await manager.deletePreset('Old')).toBe(true);
    expect(await manager.getDefaultPreset('New')).toEqual({ isDefault: true, preset: { temperature: 1 } });
    expect(calls).toEqual(expect.arrayContaining([
        ['command', 'preset'], ['rename', 'New'], ['delete', 'Old'],
        ['fetch', '/api/presets/restore', { name: 'New', apiId: 'openai' }],
    ]));
});
