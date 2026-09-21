import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('API connections drawer React surface', () => {
    const indexHtml = readRepoFile('public/index.html');
    const panel = readRepoFile('app/components/api/ApiConnectionsPanel.tsx');
    const workspace = readRepoFile('app/workspace-panels.tsx');
    const script = readRepoFile('public/script.js');

    test('drawer shell is preserved while owned inner markup is replaced by React host', () => {
        expect(indexHtml).toContain('id="rm_api_block"');
        const block = indexHtml.match(/<div id="rm_api_block"[^>]*>([\s\S]*?)<\/div>/)?.[0] ?? '';
        expect(block).toContain('class="drawer-content closedDrawer"');
        expect(block).not.toContain('id="api_button_openai"');
        expect(block).not.toContain('id="send_textarea"');
    });

    test('React component preserves all contract IDs', () => {
        const ids = [
            'title_api', 'api_connection_form', 'chat_completion_source',
            'openai_form', 'model_openai_select', 'model_openai_list',
            'api_key_section', 'api_key_unified', 'api_key_unified_show',
            'api_key_unified_manage', 'openai_reverse_proxy', 'base_url_status',
            'fallback_provider_enabled', 'fallback_provider_section',
            'fallback_provider_base_url', 'fallback_provider_model',
            'fallback_provider_api_key', 'fallback_provider_api_key_show',
            'fallback_provider_save_key', 'fallback_provider_clear_key',
            'fallback_provider_status', 'fallback_provider_cost_warning',
            'prompt_post_processing_form', 'customize_additional_parameters',
            'custom_prompt_post_processing', 'test_api_button', 'api_button_openai',
            'feature.fallback_provider',
        ];
        for (const id of ids) {
            expect(panel).toContain(`id="${id}"`);
        }
    });

    test('mount runs before initSecrets and registerCoreModules', () => {
        expect(script).toContain('async function mountApiConnectionsPanel()');
        expect(script).toContain('module.mountApiConnectionsPanel(host)');
        const mountIdx = script.indexOf("measureStartupStage('mountApiConnectionsPanel'");
        const secretsIdx = script.indexOf("measureStartupStage('initSecrets'");
        const coreIdx = script.indexOf("measureStartupStage('registerCoreModules'");
        expect(mountIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(secretsIdx);
        expect(mountIdx).toBeLessThan(coreIdx);
    });
});
