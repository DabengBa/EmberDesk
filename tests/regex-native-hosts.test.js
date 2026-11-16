import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the production popup consumers with no jQuery global.
const source = readFileSync(new URL('../public/scripts/extensions/regex/index.js', import.meta.url), 'utf8');
function extract(start, end, context) {
    const from = source.indexOf(start);
    return runInNewContext(`(${source.slice(from, source.indexOf(end, from)).replace('export ', '')})`, context);
}
function element(tagName) {
    return { tagName, children: [], textContent: '', append(child) { this.children.push(child); } };
}
const t = (parts, ...values) => parts.reduce((s, part, i) => s + part + (values[i] ?? ''), '');

test('regex debugger uses a text-safe native pre for final output', async () => {
    let props;
    const popup = jest.fn();
    const context = {
        document: { createElement: element }, t,
        loadWorkspacePanelsModule: async () => ({ mountRegexDebugger: (host, value) => { props = value; } }),
        getDebugGroups: () => [], saveDebugOrder: () => {}, runForDebug: () => {}, debuggerRef: {},
        callGenericPopup: popup, POPUP_TYPE: { TEXT: 1 },
        Popup: class { async show() {} },
    };
    await extract('async function onRegexDebuggerOpenClick()', '\nconst regexImportController', context)();
    props.commands.openFinalPopup({ text: '<img onerror=alert(1)>' });
    expect(popup.mock.calls[0][0]).toMatchObject({ tagName: 'pre', textContent: '<img onerror=alert(1)>' });
    props.commands.openFinalPopup({ html: '<b>safe-rendered</b>' });
    expect(popup.mock.calls[1][0]).toBe('<b>safe-rendered</b>');
});

test('regex editor mounts inside the native host passed to Popup', async () => {
    let host, popupContent;
    const context = {
        document: { createElement: element }, t, getScriptsForTarget: () => [],
        loadWorkspacePanelsModule: async () => ({ mountRegexEditor: node => { host = node; } }),
        Popup: class { constructor(content) { popupContent = content; } async show() { return 0; } },
        POPUP_TYPE: { CONFIRM: 2 }, POPUP_RESULT: { AFFIRMATIVE: 1 },
        runRegexScript: () => {}, editorInfoFor: () => {},
    };
    const result = await extract('async function onRegexEditorOpenClick(', '\n/**\n * Pure info-block', context)(false, 0, {});
    expect(result).toBe('cancelled');
    expect(popupContent.children).toEqual([host]);
});

test('regex init mounts the settings owner into the existing panel with a native host', async () => {
    const panel = element('section');
    const mount = jest.fn();
    const context = {
        document: { getElementById: () => panel, createElement: element, addEventListener: jest.fn() },
        feature_settings: {}, migrateSettings: () => {},
        loadWorkspacePanelsModule: async () => ({ mountRegexSettings: mount }),
        regexListBridge: { refresh: jest.fn() }, createRegexPresetController: () => ({}),
        getScriptsByType: () => {}, getScriptsForTarget: () => {}, captureRegexTarget: () => {},
        saveScriptsByType: () => {}, saveSettingsStrict: () => {}, refreshRegexEffects: () => {},
        toastr: {}, uuidv4: () => {}, SCRIPT_TYPES: {}, regexToolbar: {}, getToolBindingsBridge: () => ({}),
        loadRegexScripts: async () => {}, eventSource: { on: jest.fn() },
        event_types: {}, onMainApiChanged: () => {}, checkCharEmbeddedRegexScripts: () => {},
        purgeEmbeddedRegexScripts: () => {}, onPresetRenamed: () => {},
        checkPresetEmbeddedRegexScripts: () => {}, purgePresetEmbeddedRegexScripts: () => {},
    };
    const from = source.indexOf('export async function init()');
    const init = runInNewContext(`(${source.slice(from).replace('export ', '')})`, context);
    await init();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0][0]).toBe(panel.children[0]);
});
