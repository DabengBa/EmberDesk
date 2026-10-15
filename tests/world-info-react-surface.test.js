import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function extractWorldInfoBlock(html) {
    const match = html.match(/<div id="WorldInfo"[^>]*>([\s\S]*?)<\/div>\s*<div id="settings-panel-button"/);
    return match ? match[0] : '';
}

describe('World Info drawer React surface', () => {
    const indexHtml = readRepoFile('public/index.html');
    const panel = readRepoFile('app/components/panels/WorldInfoPanel.tsx');
    const workspace = readRepoFile('app/workspace-panels.tsx');
    const worldInfoJs = readRepoFile('public/scripts/world-info.js');
    const script = readRepoFile('public/script.js');

    test('drawer shell is preserved while owned inner markup is replaced by React host', () => {
        expect(indexHtml).toContain('id="WorldInfo"');
        const block = extractWorldInfoBlock(indexHtml);
        expect(block).toContain('class="drawer-content closedDrawer"');
        // Legacy-owned inner markup must be gone from the shell.
        expect(block).not.toContain('id="WorldInfoheader"');
        expect(block).not.toContain('id="wi-holder"');
        expect(block).not.toContain('id="world_info"');
    });

    test('React component preserves all legacy IDs and contract classes', () => {
        // The drawer header is shared chrome (WorkspacePanelChrome); the
        // grabber id arrives as a prop value rather than raw markup.
        expect(panel).toContain('grabberId="WorldInfoheader"');
        const ids = [
            'wi-holder',
            'wiGlobalPanel', 'wiGlobalPanelTitle', 'wiGlobalCount', 'wiTopBlock',
            'WIMultiSelector', 'world_info',
            'wiEditorPanel', 'wiEditorPanelTitle', 'world_popup',
        ];
        for (const id of ids) {
            expect(panel).toContain(`id="${id}"`);
        }
        expect(panel).toContain('className="wi-section wi-global-panel"');
        expect(panel).toContain('className="wi-global-grid inline-drawer wide100p"');
    });

    test('activation rules drawer and retired global controls are gone', () => {
        // Only Scan Depth remains configurable, surfaced as a plain number
        // input inside the React workbench global summary row.
        const retiredIds = [
            'wiActivationSettings', 'wiSliders', 'wiCheckboxes',
            'world_info_depth', 'world_info_depth_counter',
            'world_info_case_sensitive', 'world_info_match_whole_words',
            'world_info_include_names', 'world_info_character_strategy',
        ];
        for (const id of retiredIds) {
            expect(panel).not.toContain(`id="${id}"`);
        }
        expect(panel).not.toContain('wi-settings-toggle');
        expect(panel).not.toContain('wi-global-rules-content');
        expect(panel).not.toContain('data-i18n="Activation Rules"');
    });

    test('workspace bundle exports the mount entry and world-info.js adapts it', () => {
        expect(workspace).toMatch(/export function mountWorldInfoPanel\(container: HTMLElement\)/);
        expect(worldInfoJs).toContain('loadWorkspacePanelsModule');
        expect(worldInfoJs).toContain('module.mountWorldInfoPanel(host)');
        expect(worldInfoJs).toContain('export async function mountWorldInfoPanel()');
    });

    test('mount runs before initWorldInfo bindings in startup order', () => {
        expect(script).toContain('mountWorldInfoPanel');
        // The mount call is wrapped in a measureStartupStage arrow function.
        const mountIdx = script.indexOf('=> mountWorldInfoPanel()');
        // Startup path: the initWorldInfo() call inside hydrateFeatureModules
        // (the earlier occurrence is a deferred panel hook, not startup order).
        const initIdx = script.lastIndexOf('initWorldInfo();');
        expect(mountIdx).toBeGreaterThan(-1);
        expect(initIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(initIdx);
    });
});
