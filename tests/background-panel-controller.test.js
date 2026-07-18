import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('background panel status (legacy controller retired)', () => {
    test('domain status helper classifies disabled, loading, empty, success, and error states', async () => {
        const domain = await import(`../public/scripts/background-domain.js?t=${Date.now()}`);
        expect(domain.getBackgroundLibraryPanelStatus({ disabled: true })).toEqual({
            status: 'disabled', showLoading: false, showEmpty: false, showError: false,
        });
        expect(domain.getBackgroundLibraryPanelStatus({ isLoading: true, systemItemCount: 0 })).toEqual({
            status: 'loading', showLoading: true, showEmpty: false, showError: false,
        });
        expect(domain.getBackgroundLibraryPanelStatus({ systemItemCount: 0, chatItemCount: 0 })).toEqual({
            status: 'empty', showLoading: false, showEmpty: true, showError: false,
        });
        expect(domain.getBackgroundLibraryPanelStatus({ systemItemCount: 2 })).toEqual({
            status: 'success', showLoading: false, showEmpty: false, showError: false,
        });
        expect(domain.getBackgroundLibraryPanelStatus({ error: new Error('boom'), systemItemCount: 2 })).toEqual({
            status: 'error', showLoading: false, showEmpty: false, showError: true,
        });
    });

    test('backgrounds facade no longer imports the retired panel controller', () => {
        const source = read('public/scripts/backgrounds.js');
        expect(source).not.toContain("from './background-panel-controller.js'");
        expect(source).not.toContain('replaceBackgroundPanelController');
        expect(source).not.toContain('createBackgroundPanelController');
    });

    test('legacy controller module is deleted', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public/scripts/background-panel-controller.js'))).toBe(false);
    });

    test('React-owned background drawers force hidden compatibility controls out of layout', () => {
        const styles = read('public/css/backgrounds.css');

        expect(styles).toContain('#Backgrounds.bg-drawer-react-owned [data-legacy-background-hidden-by-react="true"]');
        expect(styles).toContain('display: none !important;');
    });

    test('React gallery rows keep a visible background preview', () => {
        const styles = read('public/style.css');

        expect(styles).toContain('.workspace-panel-background-preview');
        expect(styles).toContain('aspect-ratio: 16 / 9;');
        expect(styles).toContain('.workspace-panel-background-actions .menu_button');
        expect(styles).toContain('min-width: max-content;');
    });
});
