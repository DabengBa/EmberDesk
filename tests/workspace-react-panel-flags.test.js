import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';
import {
    applyWorkspaceReactPlaywrightFlagDefaults,
    hasEnabledWorkspaceReactPlaywrightFlag,
    shouldBuildCharacterLibraryPanel,
    shouldBuildWorkspacePanels,
} from './helpers/workspace-react-playwright-flags.js';

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
        '      mainChatMessageList: false',
        '      backgroundLibrary: false',
        '      extensionsHost: false',
        '    shell:',
        '      takeover: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING;
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING;
    delete process.env.EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER;
    delete process.env.EMBERDESK_FEATURES_REACT_SHELL_STRICT;
});

describe('workspace React panel flags', () => {
    test('injects all guarded workspace panel flags into the legacy shell payload', async () => {
        const featureBootstrapModule = await import(`../src/workspace-react-features.js?workspacePanelFlags=${Date.now()}-${Math.random()}`);

        expect(featureBootstrapModule.getWorkspaceReactFeatures()).toEqual({
            reactPages: {
                settings: true,
            },
            reactPanels: {
                mainChatMessageList: false,
                worldInfo: true,
                backgroundLibrary: true,
                extensionsHost: true,
                characterAuthoring: true,
                groupAuthoring: true,
            },
            reactShell: {
                strict: false,
                takeover: false,
            },
        });

        process.env.EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING = 'true';
        process.env.EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING = 'true';

        expect(featureBootstrapModule.getWorkspaceReactFeatures()).toEqual({
            reactPages: {
                settings: true,
            },
            reactPanels: {
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: true,
                extensionsHost: true,
                characterAuthoring: true,
                groupAuthoring: true,
            },
            reactShell: {
                strict: true,
                takeover: true,
            },
        });

        const previousNodeEnv = process.env.NODE_ENV;
        const previousCi = process.env.CI;
        try {
            delete process.env.CI;
            process.env.NODE_ENV = 'development';
            expect(featureBootstrapModule.getWorkspaceReactFeatures().reactShell).toEqual({
                strict: true,
                takeover: true,
            });

            process.env.NODE_ENV = 'production';
            expect(featureBootstrapModule.getWorkspaceReactFeatures().reactShell).toEqual({
                strict: false,
                takeover: true,
            });
        } finally {
            if (previousCi === undefined) {
                delete process.env.CI;
            } else {
                process.env.CI = previousCi;
            }
            if (previousNodeEnv === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = previousNodeEnv;
            }
        }
    });

    test('escapes the workspace panel feature bootstrap payload before injecting it into HTML', async () => {
        const featureBootstrapModule = await import(`../src/workspace-react-features.js?workspacePanelEscaping=${Date.now()}-${Math.random()}`);
        const html = featureBootstrapModule.injectWorkspaceReactFeatures('<html><head></head><body></body></html>', {
            reactPanels: {
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: true,
                extensionsHost: true,
                characterAuthoring: true,
                groupAuthoring: true,
                unsafe: '<script>alert(1)</script>&',
            },
            reactPages: {
                settings: true,
            },
            reactShell: {
                strict: true,
                takeover: true,
            },
        });

        expect(html).toContain('window.__emberDeskWorkspaceFeatures');
        expect(html).toContain('"mainChatMessageList":true');
        expect(html).toContain('"reactShell":{"strict":true,"takeover":true}');
        expect(html).toContain('"reactPages":{"settings":true}');
        expect(html).toContain('"worldInfo":true');
        expect(html).toContain('"backgroundLibrary":true');
        expect(html).toContain('"extensionsHost":true');
        expect(html).toContain('"characterAuthoring":true');
        expect(html).toContain('"groupAuthoring":true');
        expect(html).toContain('\\u003cscript');
        expect(html).toContain('\\u0026');
        expect(html).not.toContain('<script>alert(1)</script>&');
    });

    test('documents new workspace panel flags and bundle build command', () => {
        const configSource = read('default/config.yaml');
        const packageSource = read('package.json');
        const viteSource = read('vite.config.ts');

        expect(configSource).toContain('shell:');
        expect(configSource).toContain('takeover: false');
        expect(configSource).not.toContain('characterLibrary:');
        expect(configSource).toContain('mainChatMessageList: false');
        expect(configSource).not.toContain('worldInfo:');
        expect(configSource).toContain('backgroundLibrary: true');
        expect(configSource).toContain('extensionsHost: true');
        expect(configSource).not.toContain('characterAuthoring:');
        expect(configSource).not.toContain('groupAuthoring:');
        expect(packageSource).toContain('"build:react:workspace-panels": "vite build --mode workspace-panels"');
        expect(viteSource).toContain('const isWorkspacePanelsBuild = mode === \'workspace-panels\';');
        expect(viteSource).toContain('entry: path.resolve(process.cwd(), \'app/workspace-panels.tsx\')');
        expect(viteSource).toContain('fileName: () => \'assets/workspace-panels.js\'');
    });

    test('enables workspace React proof flags for full-suite and targeted Playwright runs', () => {
        const fullSuiteEnv = {};
        const fullSuiteResult = applyWorkspaceReactPlaywrightFlagDefaults(fullSuiteEnv, ['playwright', 'test']);

        expect(fullSuiteResult).toEqual({
            authoringProofEnabled: true,
            shellProofEnabled: true,
        });
        expect(fullSuiteEnv).toMatchObject({
            EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_WORLDINFO: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_BACKGROUNDLIBRARY: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING: 'true',
        });

        const shellSpecEnv = {};
        const shellSpecResult = applyWorkspaceReactPlaywrightFlagDefaults(shellSpecEnv, [
            'playwright',
            'test',
            'workspace-shell-panel-navigation.e2e.js',
        ]);

        expect(shellSpecResult).toEqual({
            authoringProofEnabled: false,
            shellProofEnabled: true,
        });
        expect(shellSpecEnv.EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER).toBe('true');
        // Authoring sole-owner flags remain forced on for every Playwright bootstrap.
        expect(shellSpecEnv.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING).toBe('true');
        expect(shellSpecEnv.EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING).toBe('true');

        const unrelatedSpecEnv = {};
        const unrelatedSpecResult = applyWorkspaceReactPlaywrightFlagDefaults(unrelatedSpecEnv, [
            'playwright',
            'test',
            'login.e2e.js',
        ]);

        expect(unrelatedSpecResult).toEqual({
            authoringProofEnabled: false,
            shellProofEnabled: false,
        });
        expect(unrelatedSpecEnv).toEqual({
            EMBERDESK_FEATURES_REACT_PANELS_CHARACTERAUTHORING: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_GROUPAUTHORING: 'true',
            EMBERDESK_FEATURES_REACT_PANELS_EXTENSIONSHOST: 'true',
        });
    });

    test('always builds the React character-library bundle and only flags guarded workspace panels', () => {
        const shellEnv = {
            EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER: 'true',
        };
        const seedSource = read('scripts/seed-dev-environment.mjs');

        expect(shouldBuildCharacterLibraryPanel({})).toBe(true);
        expect(shouldBuildCharacterLibraryPanel(shellEnv)).toBe(true);
        expect(shouldBuildWorkspacePanels(shellEnv)).toBe(true);
        expect(shouldBuildWorkspacePanels({})).toBe(true);
        expect(hasEnabledWorkspaceReactPlaywrightFlag(shellEnv)).toBe(true);
        expect(hasEnabledWorkspaceReactPlaywrightFlag({})).toBe(false);
        expect(seedSource).toContain('EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER');
        expect(seedSource).toContain('EMBERDESK_FEATURES_REACT_SHELL_STRICT');
        expect(seedSource).not.toContain('EMBERDESK_FEATURES_REACT_PANELS_CHARACTERLIBRARY');
        expect(seedSource).toContain('shell:');
    });
});
