import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

describe('Wave B React surfaces', () => {
    test('PromptManager popup markup is React-owned with IDs preserved', () => {
        const popup = readRepoFile('app/components/panels/PromptManagerPopup.tsx');
        const indexHtml = readRepoFile('public/index.html');
        const openai = readRepoFile('public/scripts/openai.js');

        for (const id of [
            'completion_prompt_manager_popup_inspect',
            'completion_prompt_manager_popup_close_button',
            'completion_prompt_manager_popup_entry_form_inspect_list',
            'completion_prompt_manager_popup_edit',
            'completion_prompt_manager_popup_entry_form_name',
            'completion_prompt_manager_popup_entry_form_role',
            'completion_prompt_manager_popup_entry_form_prompt',
            'completion_prompt_manager_popup_entry_form_injection_position',
            'completion_prompt_manager_popup_entry_form_injection_depth',
            'completion_prompt_manager_popup_entry_form_injection_order',
            'completion_prompt_manager_popup_entry_form_injection_trigger',
            'completion_prompt_manager_popup_entry_form_forbid_overrides',
            'completion_prompt_manager_popup_entry_form_save',
            'completion_prompt_manager_popup_entry_form_reset',
            'completion_prompt_manager_popup_entry_form_close',
        ]) {
            expect(popup).toContain(`id="${id}"`);
            expect(indexHtml).not.toContain(`id="${id}"`);
        }
        expect(indexHtml).toContain('id="completion_prompt_manager_popup"');
        // The dynamic prompt list container lives in the AI config drawer
        // (React-owned since the left-nav-panel migration).
        const aiConfig = readRepoFile('app/components/ai-config/AiConfigPanel.tsx');
        expect(aiConfig).toContain('id="completion_prompt_manager"');

        expect(openai).toContain('export async function mountPromptManagerPopup(');
        expect(openai).toContain('module.mountPromptManagerPopup(host)');
    });

    test('external_piece_text attribute is preserved for promptmanager.css attr()', () => {
        const popup = readRepoFile('app/components/panels/PromptManagerPopup.tsx');
        const css = readRepoFile('public/css/promptmanager.css');
        expect(css).toContain('attr(external_piece_text)');
        expect(popup).toContain('external_piece_text=');
        expect(popup).not.toContain('data-external-piece-text');
    });

    test('regex editor/settings/debugger/import-target markup is React-owned', () => {
        const editor = readRepoFile('app/components/regex/RegexEditor.tsx');
        const settings = readRepoFile('app/components/regex/RegexSettingsPanel.tsx');
        const debuggerPanel = readRepoFile('app/components/regex/RegexDebugger.tsx');
        const importTarget = readRepoFile('app/components/regex/RegexImportTarget.tsx');
        const indexJs = readRepoFile('public/scripts/extensions/regex/index.js');

        // Editor: field classes and IDs bound by index.js.
        for (const token of [
            'id="regex_editor_template"',
            'id="regex_test_mode_toggle"',
            'id="regex_test_mode"',
            'id="regex_test_input"',
            'id="regex_test_output"',
            'id="regex_info_block"',
            'className="regex_script_name text_pole textarea_compact"',
            'find_regex',
            'regex_replace_string',
            'regex_trim_strings',
            'name="replace_position"',
            'name="disabled"',
            'name="only_format_display"',
            'name="only_format_prompt"',
            'name="run_on_edit"',
            'name="substitute_regex"',
            'name="min_depth"',
            'name="max_depth"',
        ]) {
            expect(editor).toContain(token);
        }

        // Settings panel: extension drawer buttons bound in index.js init.
        for (const id of ['open_regex_editor', 'open_regex_debugger', 'open_scoped_editor', 'open_preset_editor', 'import_regex_file']) {
            expect(settings).toContain(`id="${id}"`);
        }

        // Debugger: rule/step templates stay as inert <template> nodes for cloning.
        expect(debuggerPanel).toContain('id="regex_debugger_rule_template"');
        expect(debuggerPanel).toContain('id="regex_debugger_step_template"');
        expect(debuggerPanel).toContain('id="regex_debugger_rules"');
        expect(debuggerPanel).toContain('id="regex_debugger_steps_output"');

        // Import target radio group.
        for (const id of ['regex_import_target_global', 'regex_import_target_scoped', 'regex_import_target_preset']) {
            expect(importTarget).toContain(`id="${id}"`);
        }

        // Legacy adapter calls the mounts instead of fetching templates.
        expect(indexJs).toContain('workspacePanels.mountRegexEditor(regexEditorHost)');
        expect(indexJs).toContain('workspacePanels.mountRegexSettings(regexSettingsHost.get(0))');
        expect(indexJs).toContain('workspacePanels.mountRegexDebugger(debuggerHost)');
        expect(indexJs).toContain('workspacePanels.mountRegexImportTarget(template.get(0))');
        expect(indexJs).not.toContain("renderFeatureTemplateAsync('regex', 'editor')");
        expect(indexJs).not.toContain("renderFeatureTemplateAsync('regex', 'dropdown')");
        expect(indexJs).not.toContain("renderFeatureTemplateAsync('regex', 'debugger')");
        expect(indexJs).not.toContain("renderFeatureTemplateAsync('regex', 'importTarget')");

        // Migrated templates are deleted; dynamic row templates remain.
        for (const gone of ['editor.html', 'dropdown.html', 'debugger.html', 'importTarget.html']) {
            expect(fs.existsSync(path.join(repoRoot, 'public/scripts/extensions/regex', gone))).toBe(false);
        }
        for (const kept of ['scriptTemplate.html', 'embeddedScripts.html', 'presetEmbeddedScripts.html']) {
            expect(fs.existsSync(path.join(repoRoot, 'public/scripts/extensions/regex', kept))).toBe(true);
        }
    });

    test('tag management popup content is React-owned', () => {
        const component = readRepoFile('app/components/tags/TagManagement.tsx');
        const tags = readRepoFile('public/scripts/tags.js');

        for (const token of [
            'className="menu_button menu_button_icon tag_view_prune"',
            'className="menu_button menu_button_icon tag_view_backup"',
            'className="menu_button menu_button_icon tag_view_restore"',
            'className="menu_button menu_button_icon tag_view_create"',
            'id="tag_view_restore_input"',
            'id="tag_sort_mode_select"',
        ]) {
            expect(component).toContain(token);
        }

        expect(tags).toContain('workspacePanels.mountTagManagement(tagManagementHost.get(0)');
        expect(tags).not.toContain("renderTemplateAsync('tagManagement'");
        expect(fs.existsSync(path.join(repoRoot, 'public/scripts/templates/tagManagement.html'))).toBe(false);
    });

    test('macro browser is React-owned; legacy keeps shared detail renderers', () => {
        const component = readRepoFile('app/components/macros/MacroBrowser.tsx');
        const adapter = readRepoFile('public/scripts/macros/engine/MacroBrowser.js');
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');

        // React surface keeps the class contract used by macros.css.
        for (const token of [
            'macroBrowser',
            'macro-toolbar',
            'macro-search-input',
            'macro-sort-btn',
            'macro-container',
            'macro-list-panel',
            'macro-category-header',
            'macro-item',
            'macro-signature',
            'macro-desc-preview',
            'macro-alias-indicator',
            'macro-source',
            'macro-details-panel',
            'macro-details-placeholder',
            'isFiltered',
            'isAlias',
        ]) {
            expect(component).toContain(token);
        }
        // Same fuzzy-search weighting as the legacy implementation.
        expect(component).toContain("weight: 10");
        expect(component).toContain('threshold: 0.2');

        // Adapter passes live registry data and the shared helpers.
        expect(adapter).toContain('getAllMacros({ excludeHiddenAliases: true })');
        expect(adapter).toContain('getAllMacros()');
        expect(adapter).toContain('formatMacroSignature, renderMacroDetails');
        expect(adapter).toContain('module.mountMacroBrowser(host');
        expect(workspacePanels).toContain('export function mountMacroBrowser(');

        // Shared detail renderers stay for the autocomplete consumer.
        expect(adapter).toContain('export function renderMacroDetails(');
        expect(adapter).toContain('export function formatMacroSignature(');
        const autocomplete = readRepoFile('public/scripts/autocomplete/EnhancedMacroAutoCompleteOption.js');
        expect(autocomplete).toContain('renderMacroDetails');
    });

    test('mountSmallPanel commits synchronously for post-mount binding', () => {
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');
        expect(workspacePanels).toContain('flushSync');
    });
});
