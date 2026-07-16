import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('character library React sole owner', () => {
    test('always enables the React character library owner without a product flag branch', () => {
        const scriptSource = read('public/script.js');
        expect(scriptSource).toContain('export function isReactCharacterLibraryPanelEnabled()');
        expect(scriptSource).toContain('// Character Library is React sole-owner; feature flag is retired.');
        expect(scriptSource).toContain('return true;');
        expect(scriptSource).toContain('Legacy list fallback is retired');
        expect(scriptSource).toContain('Legacy toolbar fallback is retired');
        expect(scriptSource).not.toContain('Falling back to legacy render path');
    });

    test('renders React-owned character rows instead of LegacyElementHost list rows', () => {
        const panelSource = read('app/components/character-library/CharacterLibraryPanel.tsx');
        expect(panelSource).toContain('CharacterLibraryCharacterRow');
        expect(panelSource).toContain('CharacterLibraryGroupRow');
        expect(panelSource).toContain('CharacterLibraryFolderRow');
        expect(panelSource).not.toContain('LegacyElementHost');
        expect(fs.existsSync(path.join(repoRoot, 'app/components/character-library/LegacyElementHost.tsx'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'app/components/character-library/HostedDomSlot.tsx'))).toBe(true);
    });

    test('keeps workspace feature bootstrap compatibility while list ownership is always React', async () => {
        const featureBootstrapModule = await import(`../src/workspace-react-features.js?workspaceFeatures=${Date.now()}-${Math.random()}`);
        const source = read('public/script.js');
        const serverMainSource = read('src/server-main.js');
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
        expect(source).toContain('globalThis.__emberDeskWorkspaceFeatures');
        expect(serverMainSource).toContain('injectWorkspaceReactFeatures');
        expect(serverMainSource).toContain('getWorkspaceReactFeatures');
    });

    test('documents character library as enabled by default in config', () => {
        const configSource = read('default/config.yaml');
        expect(configSource).toContain('panels:');
        expect(configSource).toContain('characterLibrary: true');
    });
});
