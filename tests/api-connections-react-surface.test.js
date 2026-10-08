import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('API connections drawer retirement', () => {
    const indexHtml = readRepoFile('public/index.html');
    const workspace = readRepoFile('app/workspace-panels.tsx');
    const script = readRepoFile('public/script.js');
    const settingsSurface = readRepoFile('app/components/settings/SettingsSurface.tsx');

    test('the rm_api_block drawer shell and React host component are gone', () => {
        expect(indexHtml).not.toContain('id="rm_api_block"');
        expect(indexHtml).not.toContain('id="api_button_openai"');
        expect(indexHtml).not.toContain('id="api_connection_form"');
        expect(fs.existsSync(path.join(projectRoot, 'app', 'components', 'api', 'ApiConnectionsPanel.tsx'))).toBe(false);
        expect(workspace).not.toContain('ApiConnectionsPanel');
        expect(script).not.toContain('mountApiConnectionsPanel');
        expect(script).not.toContain('rm_api_block');
    });

    test('provider controls live only on the React Providers settings tab', () => {
        const retainedMarkers = [
            'providers.openaiModel',
            'providers.customUrl',
            'providers.fallbackProviderModel',
            'providers.promptPostProcessing',
            'id="provider-connect-button"',
            'id="provider-test-button"',
        ];
        for (const marker of retainedMarkers) {
            expect(settingsSurface).toContain(marker);
        }

        // The retired drawer IDs must not reappear in the surviving React surface.
        const retiredIds = [
            'model_openai_select', 'model_openai_list',
            'api_key_unified', 'api_key_unified_show', 'api_key_unified_manage',
            'openai_reverse_proxy', 'base_url_status',
            'fallback_provider_section', 'fallback_provider_model', 'fallback_provider_status',
            'prompt_post_processing_form', 'custom_prompt_post_processing',
            'test_api_button', 'api_button_openai',
            'chat_completion_source', 'api_connection_form', 'openai_form',
        ];
        for (const id of retiredIds) {
            expect(settingsSurface).not.toContain(`id="${id}"`);
            expect(indexHtml).not.toContain(`id="${id}"`);
        }
    });

    test('provider actions route through the runtime command port', () => {
        const providerSource = readRepoFile('public/scripts/react-runtime-provider.js');
        const portSource = readRepoFile('app/compat/runtime-port.ts');

        expect(script).toContain('connectProvider: () => connectProviderConnection()');
        expect(script).toContain('testProviderConnection: () => testProviderConnection()');
        expect(providerSource).toContain("'connectProvider'");
        expect(providerSource).toContain("'testProviderConnection'");
        expect(providerSource).toContain('ONLINE_STATUS_CHANGED');
        expect(portSource).toContain('connectProvider(): Promise<void>');
        expect(portSource).toContain('testProviderConnection(): Promise<void>');

        const openaiSource = readRepoFile('public/scripts/openai.js');
        expect(openaiSource).toContain('export async function connectProviderConnection()');
        expect(openaiSource).toContain('export async function testProviderConnection()');
        // No DOM-coupled drawer triggers remain in the provider module.
        expect(openaiSource).not.toContain('api_button_openai');
        expect(openaiSource).not.toContain('test_api_button');
        expect(openaiSource).not.toContain('#api_connection_form');
    });
});
