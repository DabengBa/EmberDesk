import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    hasEnabledWorkspaceReactPlaywrightFlag,
    shouldBuildCharacterLibraryPanel,
    shouldBuildWorkspacePanels,
} from './helpers/workspace-react-playwright-flags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('workspace React shell retirement', () => {
    test('removes shell feature flags and inline workspace bootstrap payloads', () => {
        const configSource = read('default/config.yaml');
        const serverMainSource = read('src/server-main.js');
        const featureSource = read('src/workspace-react-features.js');
        const shellSource = read('public/script.js');

        expect(configSource).not.toContain('takeover:');
        expect(configSource).not.toContain('\n    shell:');
        expect(serverMainSource).not.toContain('injectWorkspaceReactFeatures');
        expect(serverMainSource).not.toContain('getWorkspaceReactFeatures');
        expect(featureSource).not.toContain('buildWorkspaceReactFeaturesScript');
        expect(featureSource).not.toContain('injectWorkspaceReactFeatures');
        expect(shellSource).not.toContain('__emberDeskWorkspaceFeatures');
    });

    test('always builds React workspace assets without Playwright flag setup', () => {
        const seedSource = read('scripts/seed-dev-environment.mjs');

        expect(shouldBuildCharacterLibraryPanel({})).toBe(true);
        expect(shouldBuildWorkspacePanels({})).toBe(true);
        expect(hasEnabledWorkspaceReactPlaywrightFlag({})).toBe(false);
        expect(seedSource).not.toContain('EMBERDESK_FEATURES_REACT_SHELL_TAKEOVER');
        expect(seedSource).not.toContain('EMBERDESK_FEATURES_REACT_SHELL_STRICT');
        expect(seedSource).not.toContain('    shell:');
    });

    test('keeps the workspace panels build entry available', () => {
        const packageSource = read('package.json');
        const viteSource = read('vite.config.ts');

        expect(packageSource).toContain('"build:react:workspace-panels": "vite build --mode workspace-panels"');
        expect(viteSource).toContain('const isWorkspacePanelsBuild = mode === \'workspace-panels\';');
        expect(viteSource).toContain('entry: path.resolve(process.cwd(), \'app/workspace-panels.tsx\')');
        expect(viteSource).toContain('fileName: () => \'assets/workspace-panels.js\'');
    });
});
