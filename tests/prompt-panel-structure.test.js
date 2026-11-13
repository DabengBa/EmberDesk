import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('prompt panel + side-nav defaults', () => {
    test('pipeline model field round-trips through the editor bridge', () => {
        const panel = read('app/components/prompt-panel/PromptPanel.tsx');
        const script = read('public/script.js');
        expect(panel).toContain("bridge.updatePipelineStep(index, { model: event.target.value })");
        expect(panel).toContain("aria-label={translate('Step model')}");
        expect(panel).toContain('list="prompt-panel-pipeline-models"');
        expect(script).toContain('getOpenAIModelList()');
        const service = read('app/lib/prompt-panel-service.ts');
        expect(service).toContain("step.model = String(patch.model ?? '')");
        expect(service).toContain("model: typeof step?.model === 'string' ? step.model : ''");
    });
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

    test('drawer persistence uses the LNav accountStorage keys', async () => {
        const scriptSource = read('public/script.js');
        const storage = read('public/scripts/util/AccountStorage.js');
        expect(scriptSource).toContain('read: key => accountStorage.getItem(key)');
        expect(scriptSource).toContain('write: (key, value) => accountStorage.setItem(key, value)');
        expect(storage).toContain('/^LNavLockOn$/');
        expect(storage).toContain('/^LNavOpened$/');

        const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
        const records = new Map();
        const drawer = { id: 'left-nav-panel', open: false, pinned: false };
        const service = createWorkspaceDrawerService({
            get: id => id === drawer.id ? drawer : null,
            list: () => [drawer],
            read: key => records.get(key) ?? null,
            write: (key, value) => records.set(key, value),
            notify: () => {},
        });
        await service.open(drawer.id);
        expect(records.get('LNavOpened')).toBe('true');
        expect(service.getRestorable({ mobile: false, width: 1200 })).toContain(drawer.id);
        service.setPinned(drawer.id, true);
        expect(records.get('LNavLockOn')).toBe('true');
        expect(service.close(drawer.id)).toBe(false);
        expect(records.get('LNavOpened')).toBe('true');
        service.setPinned(drawer.id, false);
        expect(records.get('LNavLockOn')).toBe('false');
        expect(service.close(drawer.id)).toBe(true);
        expect(records.get('LNavOpened')).toBe('false');
        expect(service.getRestorable({ mobile: false, width: 1200 })).not.toContain(drawer.id);
    });

    test('workspace shell slot routing maps promptManager to the left panel', () => {
        const scriptSource = read('public/script.js');
        expect(scriptSource).toContain('promptManager: \'left-nav-panel\'');
        expect(scriptSource).toContain('case \'promptManager\':');
        expect(scriptSource).toContain('openWorkspaceShellPromptManager({ preserveOpenDrawers = false } = {})');
        expect(scriptSource).toContain('openPromptManager: openWorkspaceShellPromptManager');
    });

    test('side panels seed viewport-aware open+lock defaults without overriding stored preference', async () => {
        const mods = read('public/scripts/RossAscends-mods.js');
        expect(mods).toContain('drawerService.initializePins({ mobile: isMobile(), width: window.innerWidth })');
        const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
        for (const [width, fallback] of [[1200, 'true'], [1000, 'false']]) {
            const records = new Map([['LNavOpened', 'false'], ['NavLockOn', 'false']]);
            const drawers = new Map(['left-nav-panel', 'right-nav-panel'].map(id => [id, { id, open: false, pinned: false }]));
            const service = createWorkspaceDrawerService({
                get: id => drawers.get(id), list: () => [...drawers.values()], read: key => records.get(key) ?? null,
                write: (key, value) => records.set(key, value), notify: () => {},
            });
            service.initializePins({ mobile: false, width });
            expect(Object.fromEntries(records)).toEqual({ LNavOpened: 'false', NavLockOn: 'false', NavOpened: fallback, LNavLockOn: fallback });
            expect(drawers.get('left-nav-panel').pinned).toBe(fallback === 'true');
            expect(drawers.get('right-nav-panel').pinned).toBe(false);
        }
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
        expect(panel).toContain('presetService.requestSelect');
        const menu = read('app/components/ai-config/PresetActionsMenu.tsx');
        for (const id of ['delete_oai_preset', 'openai_preset_import_file', 'export_oai_preset', 'import_oai_preset']) {
            expect(menu).toContain(`id="${id}"`);
        }
        expect(menu).toContain('onClick={onRename}');
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
        const service = read('app/lib/prompt-panel-service.ts');
        expect(service).toContain('createPromptTokenRecount');
        expect(service).toContain('recount.schedule()');
        expect(scriptSource).toContain('workspace.createPromptPanelService');
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
        const handler = openai.slice(openai.indexOf('confirmSwitch: async'), openai.indexOf('askName: presetDialogs.askName'));
        expect(handler).toContain('isOpenAIPresetDirty');
        expect(handler).toContain('presetDialogs.confirmSwitch()');
        const dialogs = read('public/scripts/preset-dialogs.js');
        expect(dialogs).toContain("id: 'save'");
        expect(dialogs).toContain("id: 'discard'");
        expect(dialogs).toContain("id: 'cancel'");
        expect(read('app/lib/preset-service.ts')).toContain("if (decision === 'save') await save(");
    });

    test('React owns preset actions instead of legacy DOM bindings', () => {
        const openai = read('public/scripts/openai.js');
        expect(openai).not.toContain('$(\'#settings_preset_openai\').on(\'change\'');
        expect(openai).not.toContain('$(\'#update_oai_preset\').on(\'click\'');
        expect(read('app/components/ai-config/AiConfigPanel.tsx')).toContain('presetService.saveCurrent()');
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

    test('prompt bridge moves an entry directly to its destination and saves once', async () => {
        const { createPromptPanelService } = await loadTsModule('app/lib/prompt-panel-service.ts');
        const original = ['first', 'second', 'third', 'fourth'].map(identifier => ({ identifier, enabled: identifier !== 'second' }));
        const order = [...original];
        let saves = 0;
        const bridge = createPromptPanelService({
            settings: () => ({}), order: () => order, ensureOrder: () => order,
            save: () => saves++, syncTools: () => {}, uuid: () => '', dirty: () => false,
            normalizePipeline: () => ({ enabled: false, steps: [] }), triggerTag: name => name,
            toolNames: () => [], modelNames: () => [], count: async () => 0,
            lastRunCounts: () => ({}), bindEvents: () => {}, openInspector: () => {},
        });
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
        expect(read('app/lib/prompt-panel-service.ts')).toContain('presetDirty: ports.dirty()');
    });
});

describe('ui locale contract', () => {
    test('the saved language selection drives the shell locale engine', () => {
        const i18n = read('public/scripts/i18n.js');
        expect(i18n).toContain('let localeFile = readStoredUiLocale();');
        expect(i18n).toContain('resolveUiLocale(language)');
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
        expect(bridge).toContain('standaloneLocale = DEFAULT_UI_LOCALE;');
        expect(bridge).toContain('standaloneLocale = readStoredUiLocale();');
    });
});
