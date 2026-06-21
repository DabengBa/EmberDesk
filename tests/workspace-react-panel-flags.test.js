import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-workspace-react-panels-config-'));
const configPath = path.join(tmpConfigDir, 'config.yaml');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

beforeAll(() => {
    fs.writeFileSync(configPath, [
        'enableUserAccounts: true',
        'features:',
        '  react:',
        '    pages:',
        '      login: false',
        '      setup: false',
        '      settings: false',
        '    panels:',
        '      characterLibrary: false',
        '      mainChatMessageList: false',
        '      worldInfo: false',
        '      backgroundLibrary: false',
        '      extensionsHost: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERLIBRARY;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST;
});

describe('workspace React panel flags', () => {
    test('injects all guarded workspace panel flags into the legacy shell payload', async () => {
        const featureBootstrapModule = await import(`../src/workspace-react-features.js?workspacePanelFlags=${Date.now()}-${Math.random()}`);

        expect(featureBootstrapModule.getWorkspaceReactFeatures()).toEqual({
            reactPanels: {
                characterLibrary: false,
                mainChatMessageList: false,
                worldInfo: false,
                backgroundLibrary: false,
                extensionsHost: false,
            },
        });

        process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST = 'true';

        expect(featureBootstrapModule.getWorkspaceReactFeatures()).toEqual({
            reactPanels: {
                characterLibrary: false,
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: true,
                extensionsHost: true,
            },
        });
    });

    test('escapes the workspace panel feature bootstrap payload before injecting it into HTML', async () => {
        const featureBootstrapModule = await import(`../src/workspace-react-features.js?workspacePanelEscaping=${Date.now()}-${Math.random()}`);
        const html = featureBootstrapModule.injectWorkspaceReactFeatures('<html><head></head><body></body></html>', {
            reactPanels: {
                characterLibrary: true,
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: true,
                extensionsHost: true,
                unsafe: '<script>alert(1)</script>&',
            },
        });

        expect(html).toContain('window.__emberDeskWorkspaceFeatures');
        expect(html).toContain('"mainChatMessageList":true');
        expect(html).toContain('"worldInfo":true');
        expect(html).toContain('"backgroundLibrary":true');
        expect(html).toContain('"extensionsHost":true');
        expect(html).toContain('\\u003cscript');
        expect(html).toContain('\\u0026');
        expect(html).not.toContain('<script>alert(1)</script>&');
    });

    test('documents new workspace panel flags and bundle build command', () => {
        const configSource = read('default/config.yaml');
        const packageSource = read('package.json');
        const viteSource = read('vite.config.ts');

        expect(configSource).toContain('mainChatMessageList: false');
        expect(configSource).toContain('worldInfo: false');
        expect(configSource).toContain('backgroundLibrary: false');
        expect(configSource).toContain('extensionsHost: false');
        expect(packageSource).toContain('"build:react:workspace-panels": "vite build --mode workspace-panels"');
        expect(viteSource).toContain('const isWorkspacePanelsBuild = mode === \'workspace-panels\';');
        expect(viteSource).toContain('entry: path.resolve(process.cwd(), \'app/workspace-panels.tsx\')');
        expect(viteSource).toContain('fileName: () => \'assets/workspace-panels.js\'');
    });

    test('prebuilds flagged React panel bundles before Playwright starts the server', () => {
        const playwrightSource = read('tests/playwright.config.js');

        expect(playwrightSource).toContain('const workspacePanelFlagEnvKeys = [');
        expect(playwrightSource).toContain('EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST');
        expect(playwrightSource).toContain('EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO');
        expect(playwrightSource).toContain('EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY');
        expect(playwrightSource).toContain('EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST');
        expect(playwrightSource).toContain('shouldBuildCharacterLibraryPanel ? \'bun run build:react:character-library\' : null');
        expect(playwrightSource).toContain('shouldBuildWorkspacePanels ? \'bun run build:react:workspace-panels\' : null');
        expect(playwrightSource).toContain('command: webServerCommand');
    });
});
