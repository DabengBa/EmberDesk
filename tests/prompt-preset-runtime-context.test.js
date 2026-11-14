import { readFileSync } from 'node:fs';
import { expect, jest, test } from '@jest/globals';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('prompt facade installs synchronous substitution without importing the composition root', () => {
    const source = read('public/scripts/PromptManager.js');
    expect(source).not.toMatch(/import\s+\{[^}]*\}\s+from\s+['"]\.\.\/script\.js['"]/s);
    const code = source.replace(/^import .*;$/gm, '').replace(/^export (?=const |class |function )/gm, '').replace(/export \{[\s\S]*?\};\s*$/, '');
    const facade = new Function('eventSource', 'event_types', 'TokenHandler', 'uuidv4', `${code}; return { installPromptManagerDomain, Prompt };`)(
        { on() {} }, {}, class {}, () => 'id',
    );
    let name = 'Alice';
    let ports;
    facade.installPromptManagerDomain(value => { ports = value; return { Prompt: class {} }; }, (text, options) => `${name}:${text}:${options.key}`);
    expect(ports.substitute('hello', { key: 1 })).toBe('Alice:hello:1');
    name = 'Bob';
    expect(ports.substitute('hello', { key: 2 })).toBe('Bob:hello:2');
    expect(new facade.Prompt()).toBeInstanceOf(facade.Prompt);
});

function presetFixture() {
    const source = read('public/scripts/preset-manager.js');
    expect(source).not.toMatch(/from\s+['"]\.\.\/script\.js['"]/);
    const code = source.slice(source.indexOf('let presetManagerContext')).replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
    const preset = { extensions: {} };
    const settings = { extensions: {} };
    let selected = 'Alice';
    const service = {
        findPreset: name => ({ Alice: '0', Bob: '1' })[name],
        getSelectedPreset: () => ({ Alice: '0', Bob: '1' })[selected],
        getSelectedPresetName: () => selected,
        getSelectionRevision: () => 0,
        select: jest.fn(async name => { selected = name; }),
        save: jest.fn(async name => name),
    };
    let chatChanged;
    const api = new Function('getOpenAIPresetService', 'eventSource', 'event_types', 'openai_setting_names', 'openai_settings', 'oai_settings', 'ensurePlainObject', 'lodash', 'structuredClone', `${code}; return { installPresetManagerContext, initPresetManager, getPresetManager, saveSettingsStrict };`)(
        () => service, { on: (_, callback) => { chatChanged = callback; } }, { CHAT_CHANGED: 'chat' }, { Alice: 0, Bob: 1 }, [preset, {}], settings,
        value => value, { set: (obj, path, value) => { obj[path] = value; } }, structuredClone,
    );
    const state = { main_api: 'openai', characters: [{ name: 'Alice' }, { name: 'Bob' }], this_chid: 0 };
    const saveSettings = jest.fn(async () => {});
    api.installPresetManagerContext({ get main_api() { return state.main_api; }, get characters() { return state.characters; }, get this_chid() { return state.this_chid; }, saveSettings });
    return { api, state, saveSettings, service, settings, preset, chat: () => chatChanged() };
}

test('preset selection follows live API and character state', async () => {
    const f = presetFixture();
    await f.api.initPresetManager();
    f.state.this_chid = 1;
    f.chat();
    expect(f.service.select).toHaveBeenCalledWith('Bob');
    f.state.main_api = 'other';
    expect(f.api.getPresetManager()).toBeNull();
    f.state.main_api = 'openai';
    expect(f.api.getPresetManager()).not.toBeNull();
});

test('strict preset writes await the installed settings owner and compensate on failure', async () => {
    const f = presetFixture();
    await f.api.initPresetManager();
    let finish;
    f.saveSettings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.service.save.mockRejectedValueOnce(new Error('preset failed'));
    const pending = f.api.getPresetManager().writePresetExtensionField({ path: 'regex', value: ['new'], strict: true, expectedPreset: f.preset });
    expect(f.saveSettings).toHaveBeenCalledWith(0, { strict: true });
    expect(f.service.save).not.toHaveBeenCalled();
    finish();
    await expect(pending).rejects.toThrow('preset failed');
    expect(f.saveSettings).toHaveBeenCalledTimes(2);
    expect(f.settings.extensions).toEqual({});
    f.service.save.mockClear();
    f.saveSettings.mockRejectedValueOnce(new Error('queued'));
    await expect(f.api.getPresetManager().writePresetExtensionField({ path: 'regex', value: ['new'], strict: true, expectedPreset: f.preset })).rejects.toThrow('queued');
    expect(f.service.save).not.toHaveBeenCalled();
    expect(f.settings.extensions).toEqual({});
    f.saveSettings.mockRejectedValueOnce(new Error('revision conflict'));
    await expect(f.api.saveSettingsStrict()).rejects.toThrow('revision conflict');
});
