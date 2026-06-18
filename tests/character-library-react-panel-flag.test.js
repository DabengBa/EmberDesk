import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-character-library-react-config-'));
const configPath = path.join(tmpConfigDir, 'config.yaml');

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
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERLIBRARY;
});

describe('character library React panel flag', () => {
    test('reads the feature flag from config and environment overrides', async () => {
        const featureModule = await import(`../src/react-character-library-feature.js?characterLibraryFlag=${Date.now()}-${Math.random()}`);

        expect(featureModule.isReactCharacterLibraryEnabled()).toBe(false);

        process.env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERLIBRARY = 'true';
        const enabledModule = await import(`../src/react-character-library-feature.js?characterLibraryFlag=${Date.now()}-${Math.random()}`);
        expect(enabledModule.isReactCharacterLibraryEnabled()).toBe(true);

        process.env.EMBERDESK_FEATURES_REACT_PANELS_CHARACTERLIBRARY = 'false';
        const disabledModule = await import(`../src/react-character-library-feature.js?characterLibraryFlag=${Date.now()}-${Math.random()}`);
        expect(disabledModule.isReactCharacterLibraryEnabled()).toBe(false);
    });

    test('injects workspace React panel flags into the legacy workspace shell for front-end startup', async () => {
        const featureBootstrapModule = await import(`../src/workspace-react-features.js?workspaceFeatures=${Date.now()}-${Math.random()}`);
        const source = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');
        const serverMainSource = fs.readFileSync(path.join(repoRoot, 'src', 'server-main.js'), 'utf8');
        const baseHtml = [
            '<!DOCTYPE html>',
            '<html lang="zh-CN">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <title>EmberDesk</title>',
            '</head>',
            '<body><div id="sheld"></div></body>',
            '</html>',
            '',
        ].join('\n');

        const renderedHtml = featureBootstrapModule.injectWorkspaceReactFeatures(baseHtml, {
            reactPanels: {
                characterLibrary: true,
            },
        });

        expect(renderedHtml).toContain('window.__emberDeskWorkspaceFeatures');
        expect(renderedHtml).toContain('"characterLibrary":true');
        expect(renderedHtml).toContain('</head>');
        expect(source).toContain('globalThis.__emberDeskWorkspaceFeatures');
        expect(source).toContain('reactPanels');
        expect(source).toContain('characterLibrary');
        expect(serverMainSource).toContain('injectWorkspaceReactFeatures');
        expect(serverMainSource).toContain('getWorkspaceReactFeatures');
    });

    test('documents the panel flag in default config for rollout and rollback', () => {
        const configSource = fs.readFileSync(path.join(repoRoot, 'default', 'config.yaml'), 'utf8');

        expect(configSource).toContain('panels:');
        expect(configSource).toContain('characterLibrary: false');
    });
});
