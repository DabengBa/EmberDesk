import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('prompt panel + side-nav defaults', () => {
    test('left nav drawer host lives in the top-settings holder with fillLeft', () => {
        const indexHtml = read('public/index.html');
        expect(indexHtml).toContain('id="left-nav-panel" class="drawer-content closedDrawer fillLeft"');
        expect(indexHtml).toContain('id="leftNavHolder" class="drawer"');
    });

    test('fillLeft styles mirror the right side panel', () => {
        const style = read('public/style.css');
        expect(style).toContain('.fillLeft {');
        expect(style).toContain('.fillLeft.openDrawer {');
        expect(style).toContain('left: 0;');
    });

    test('drawer persistence uses the LNav accountStorage keys', () => {
        const scriptSource = read('public/script.js');
        const storage = read('public/scripts/util/AccountStorage.js');
        expect(scriptSource).toContain('\'left-nav-panel\': \'LNavOpened\'');
        expect(storage).toContain('/^LNavLockOn$/');
        expect(storage).toContain('/^LNavOpened$/');
    });

    test('workspace shell slot routing maps promptManager to the left panel', () => {
        const scriptSource = read('public/script.js');
        expect(scriptSource).toContain('promptManager: \'left-nav-panel\'');
        expect(scriptSource).toContain('case \'promptManager\':');
        expect(scriptSource).toContain('openWorkspaceShellPromptManager({ preserveOpenDrawers = false } = {})');
        expect(scriptSource).toContain('openPromptManager: openWorkspaceShellPromptManager');
    });

    test('side panels seed viewport-aware open+lock defaults without overriding stored preference', () => {
        const mods = read('public/scripts/RossAscends-mods.js');
        // Wide desktops seed open+locked; anything narrower seeds
        // closed+unlocked. Stored explicit values are never overwritten.
        expect(mods).toContain('const sidePanelDefault = window.innerWidth > 1000 ? \'true\' : \'false\'');
        expect(mods).toContain('\'LNavOpened\', \'NavOpened\', \'LNavLockOn\', \'NavLockOn\'');
        expect(mods).toContain('accountStorage.setItem(key, sidePanelDefault)');
        // The header pin toggles are removed; the seeded lock keys apply
        // .pinnedOpen straight onto each panel host.
        expect(mods).toContain('$(LNavPanel).toggleClass(\'pinnedOpen\'');
        expect(mods).toContain('$(RightNavPanel).toggleClass(\'pinnedOpen\'');
        expect(mods).not.toContain('lm_button_panel_pin');
        expect(mods).not.toContain('rm_button_panel_pin');
        expect(mods).toContain('openWorkspaceShellPromptManager');
    });

    test('React side registers the promptManager slot, nav entry, and mount', () => {
        const commands = read('app/compat/workspace-commands.ts');
        const store = read('app/stores/workspace-panel-store.js');
        const panels = read('app/workspace-panels.tsx');
        expect(commands).toContain('| \'promptManager\'');
        expect(commands).toContain('openPromptManager(): CommandResult;');
        expect(store).toContain('\'promptManager\'');
        expect(store).toContain('mountTarget: \'#left-nav-panel\'');
        expect(panels).toContain('command: \'openPromptManager\'');
        expect(panels).toContain('export function mountPromptPanel(');
        expect(panels).toContain('AiConfigPanel');
        expect(panels).toContain('PromptManagerList');
    });

    test('left panel restores the legacy AI config IDs for openai.js bindings', () => {
        const panel = read('app/components/ai-config/AiConfigPanel.tsx');
        for (const id of [
            'settings_preset_openai',
            'completion_prompt_manager',
            'openai_max_context',
            'openai_max_tokens',
            'stream_toggle',
            'wi_format_textarea',
            'description_format_textarea',
            'send_if_empty_textarea',
        ]) {
            expect(panel).toContain(`id="${id}"`);
        }
        expect(panel).toContain('data-preset-manager-for="openai"');
        const menu = read('app/components/ai-config/PresetActionsMenu.tsx');
        for (const id of ['delete_oai_preset', 'openai_preset_import_file', 'export_oai_preset', 'import_oai_preset']) {
            expect(menu).toContain(`id="${id}"`);
        }
        expect(menu).toContain('data-preset-manager-rename="openai"');
    });

    test('preset section exposes save/new actions, overflow menu, and a dirty-aware save button', () => {
        const panel = read('app/components/ai-config/AiConfigPanel.tsx');
        expect(panel).toContain('presetSaveButton');
        expect(panel).toContain('id="new_oai_preset"');
        expect(panel).toContain('preset-actions-row');
        const menu = read('app/components/ai-config/PresetActionsMenu.tsx');
        expect(menu).toContain('id="update_oai_preset"');
        expect(menu).not.toContain('id="new_oai_preset"');
        expect(menu).toContain('PresetSaveButton');
        expect(menu).toContain('presetDirty');
        const panels = read('app/workspace-panels.tsx');
        expect(panels).toContain('PresetSaveButton');
        // A single menu instance must render these ids — a second instance
        // would duplicate the ids and the delegated handlers would bind to
        // whichever DOM node getElementById finds first.
        expect(panel.match(/<PresetActionsMenu/g)).toHaveLength(1);
    });

    test('prompt manager header carries the add-prompt action and the list expands new entries', () => {
        const panel = read('app/components/ai-config/AiConfigPanel.tsx');
        expect(panel).toContain('promptHeaderActions');
        const component = read('app/components/prompt-panel/PromptPanel.tsx');
        expect(component).toContain('PromptManagerAddButton');
        expect(component).toContain('bridge.addPrompt()');
        expect(component).toContain('knownIdsRef');
        const panels = read('app/workspace-panels.tsx');
        expect(panels).toContain('PromptManagerAddButton');
    });

    test('token column is populated by a debounced recount, not the last-run counts map', () => {
        const scriptSource = read('public/script.js');
        expect(scriptSource).toContain('countTokensOpenAIAsync');
        expect(scriptSource).toContain('tokenCountOverrides');
        expect(scriptSource).toContain('scheduleRecount');
        expect(scriptSource).toContain('CHAT_COMPLETION_PROMPT_READY');
        // The raw counts map must not feed the column — its keys are a mix of
        // section names and identifiers and only populate after a generation.
        expect(scriptSource).not.toContain('tokenCounts: { ...(promptManager?.tokenHandler?.getCounts?.() ?? {}) }');
    });

    test('isOpenAIPresetDirty compares the live settings to the stored preset body', () => {
        const scriptSource = read('public/scripts/openai.js');
        const helper = scriptSource.slice(scriptSource.indexOf('function presetValueSignature'), scriptSource.indexOf('export function isOpenAIPresetDirty'));
        const fn = scriptSource.slice(scriptSource.indexOf('export function isOpenAIPresetDirty'), scriptSource.indexOf('\n}\n', scriptSource.indexOf('export function isOpenAIPresetDirty')) + 3).replace('export function', 'function');
        const stored = { temperature: 1, prompts: [{ name: 'a' }], prompt_order: [{ character_id: 1, order: [] }] };
        const presets = [stored];
        const names = { Base: 0 };
        const current = { preset_settings_openai: 'Base', temperature: 1, prompts: [{ name: 'a' }], prompt_order: [{ character_id: 1, order: [] }], unused_new_key: 'x' };
        const body = oai => ({ temperature: oai.temperature, prompts: oai.prompts, prompt_order: oai.prompt_order, unused_new_key: oai.unused_new_key });
        const isOpenAIPresetDirty = new Function(
            'openai_settings', 'openai_setting_names', 'oai_settings', 'getChatCompletionPreset',
            `${helper}\n${fn}\nreturn isOpenAIPresetDirty;`,
        )(presets, names, current, body);
        expect(isOpenAIPresetDirty()).toBe(false);
        current.temperature = 1.5;
        expect(isOpenAIPresetDirty()).toBe(true);
        current.temperature = 1;
        current.prompt_order = [{ character_id: 1, order: [{ identifier: 'a', enabled: true }] }];
        expect(isOpenAIPresetDirty()).toBe(true);
        current.preset_settings_openai = 'Missing';
        expect(isOpenAIPresetDirty()).toBe(false);
    });

    test('preset switching asks about unsaved changes only for user-initiated selections', () => {
        const openai = read('public/scripts/openai.js');
        const handler = openai.slice(openai.indexOf('function onSettingsPresetChange'), openai.indexOf('async function onNewPresetClick'));
        expect(handler).toContain('isOpenAIPresetDirty');
        expect(handler).toContain('isTrigger');
        expect(handler).toContain('customButtons');
        expect(handler).toContain('POPUP_RESULT.AFFIRMATIVE');
        expect(handler).toContain('POPUP_RESULT.NEGATIVE');
        expect(handler).toContain('saveOpenAIPreset');
    });

    test('openai.js binds the restored preset and settings controls', () => {
        const openai = read('public/scripts/openai.js');
        expect(openai).toContain('$(\'#settings_preset_openai\').on(\'change\'');
        expect(openai).toContain('$(\'#update_oai_preset\').on(\'click\'');
        expect(openai).toContain('$(\'#new_oai_preset\').on(\'click\'');
        expect(openai).toContain('$(\'#delete_oai_preset\').on(\'click\'');
        expect(openai).toContain('export function applyOpenAIPreset(');
        expect(openai).toContain('export async function saveOpenAIPreset(');
        expect(openai).toContain('export async function deleteOpenAIPreset(');
    });

    test('prompt list component edits order/enablement and per-prompt fields via the bridge', () => {
        const component = read('app/components/prompt-panel/PromptPanel.tsx');
        for (const call of ['setPromptEnabled', 'movePrompt', 'updatePrompt', 'addPrompt', 'deletePrompt']) {
            expect(component).toContain(call);
        }
        for (const field of ['injection_position', 'injection_depth', 'injection_order', 'injection_trigger', 'forbid_overrides', 'system_prompt']) {
            expect(component).toContain(field);
        }
    });

    test('prompt bridge moves an entry directly to its destination and saves once', () => {
        const scriptSource = read('public/script.js');
        const method = scriptSource.slice(scriptSource.indexOf('        movePrompt(identifier,'), scriptSource.indexOf('        updatePrompt(identifier,'));
        const original = ['first', 'second', 'third', 'fourth'].map(identifier => ({ identifier, enabled: identifier !== 'second' }));
        const order = [...original];
        let saves = 0;
        const bridge = new Function('getOrderList', 'persist', `return {${method}}`)(() => order, () => saves++);
        bridge.movePrompt('first', 2);
        expect(order).toEqual([original[1], original[2], original[0], original[3]]);
        expect(saves).toBe(1);
        bridge.movePrompt('fourth', 0);
        expect(order).toEqual([original[3], original[1], original[2], original[0]]);
        expect(saves).toBe(2);
        for (const [identifier, target] of [['fourth', 0], ['missing', 1], ['first', -1], ['first', 4], ['first', 1.5]]) {
            bridge.movePrompt(identifier, target);
        }
        expect(order).toEqual([original[3], original[1], original[2], original[0]]);
        expect(saves).toBe(2);
    });

    test('prompt bridge mutates live oai_settings state and persists via promptManager', () => {
        const scriptSource = read('public/script.js');
        expect(scriptSource).toContain('__emberDeskPromptPanelBridge');
        expect(scriptSource).toContain('saveServiceSettings');
        expect(scriptSource).toContain('addPromptOrderForCharacter');
        expect(scriptSource).toContain('isOpenAIPresetDirty');
        expect(scriptSource).toContain('presetDirty');
    });
});

describe('simplified-chinese-only locale', () => {
    test('i18n is pinned to zh-cn with no language selection', () => {
        const i18n = read('public/scripts/i18n.js');
        expect(i18n).toContain('const localeFile = \'zh-cn\';');
        expect(i18n).not.toContain('navigator.language');
        expect(i18n).not.toContain('ui_language_select');
        expect(i18n).not.toContain('lang.json');
        // localStorage survives only for the trackDynamicTranslate debug toggle
        expect(i18n).not.toMatch(/localStorage\.(get|set)Item\('language'/);
    });

    test('only the zh-cn locale file ships', () => {
        const localesDir = path.join(repoRoot, 'public/locales');
        expect(fs.readdirSync(localesDir).sort()).toEqual(['zh-cn.json']);
    });

    test('app i18n bridge fallback matches the pinned locale', () => {
        const bridge = read('app/compat/i18n.js');
        expect(bridge).toContain('getCurrentLocale() : \'zh-cn\'');
    });
});
