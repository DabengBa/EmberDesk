import { describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    REACT_WORKSPACE_PANELS_ASSET_PATH,
    createWorkspacePanelsModuleLoader,
    getDefaultWorkspaceReactFeatures,
    isReactWorkspacePanelEnabled,
    mountReactWorkspacePanel,
} from '../public/scripts/workspace-panels-react-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('React workspace panels bridge helpers', () => {
    test('uses a default disabled feature payload for all workspace panel islands', () => {
        expect(getDefaultWorkspaceReactFeatures()).toEqual({
            reactPanels: {
                characterLibrary: false,
                worldInfo: false,
                backgroundLibrary: false,
                extensionsHost: false,
            },
        });

        expect(isReactWorkspacePanelEnabled('worldInfo')).toBe(false);
    });

    test('reads individual panel enablement without enabling unrelated panels', () => {
        const features = {
            reactPanels: {
                characterLibrary: true,
                worldInfo: true,
                backgroundLibrary: false,
                extensionsHost: false,
            },
        };

        expect(isReactWorkspacePanelEnabled('worldInfo', features)).toBe(true);
        expect(isReactWorkspacePanelEnabled('backgroundLibrary', features)).toBe(false);
        expect(isReactWorkspacePanelEnabled('extensionsHost', features)).toBe(false);
    });

    test('loads the shared workspace panels bundle once and resets the cache after failure', async () => {
        const importedModule = { mountWorkspacePanel: jest.fn() };
        const importModule = jest.fn()
            .mockResolvedValueOnce(importedModule)
            .mockRejectedValueOnce(new Error('missing bundle'))
            .mockResolvedValueOnce(importedModule);
        const loadModule = createWorkspacePanelsModuleLoader(importModule);

        await expect(loadModule()).resolves.toBe(importedModule);
        await expect(loadModule()).resolves.toBe(importedModule);
        expect(importModule).toHaveBeenCalledTimes(1);
        expect(importModule).toHaveBeenCalledWith(REACT_WORKSPACE_PANELS_ASSET_PATH);

        const failingLoader = createWorkspacePanelsModuleLoader(importModule);
        await expect(failingLoader()).rejects.toThrow('missing bundle');
        await expect(failingLoader()).resolves.toBe(importedModule);
    });

    test('mounts enabled panels and returns false for fallback when disabled, missing, or failed', async () => {
        const container = { nodeType: 1 };
        const panelModule = { mountWorkspacePanel: jest.fn() };
        const onError = jest.fn();

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container,
            features: { reactPanels: { worldInfo: false } },
            loadModule: async () => panelModule,
            onError,
        })).resolves.toBe(false);

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container: null,
            features: { reactPanels: { worldInfo: true } },
            loadModule: async () => panelModule,
            onError,
        })).resolves.toBe(false);

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container,
            features: { reactPanels: { worldInfo: true } },
            loadModule: async () => {
                throw new Error('chunk missing');
            },
            onError,
        })).resolves.toBe(false);
        expect(onError).toHaveBeenCalledWith(expect.any(Error), 'worldInfo');

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container,
            state: { selectorsSeparated: true },
            features: { reactPanels: { worldInfo: true } },
            loadModule: async () => panelModule,
            onError,
        })).resolves.toBe(true);
        expect(panelModule.mountWorkspacePanel).toHaveBeenCalledWith('worldInfo', container, { state: { selectorsSeparated: true } });
    });

    test('wires World Info deferred replay to an independent React host with legacy editor/import state', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('mountReactWorkspacePanel');
        expect(scriptSource).toContain('const WORLD_INFO_REACT_HOST_ID = \'emberdesk-react-world-info-panel-host\';');
        expect(scriptSource).toContain('function ensureWorldInfoReactHost()');
        expect(scriptSource).toContain('function getWorldInfoReactBridgeState()');
        expect(scriptSource).toContain('globalSelectorPresent: Boolean(globalSelector)');
        expect(scriptSource).toContain('editorSelectorPresent: Boolean(editorSelector)');
        expect(scriptSource).toContain('selectorsSeparated: Boolean(globalSelector && editorSelector && globalSelector !== editorSelector)');
        expect(scriptSource).toContain('importBusy: importMenuItem?.getAttribute(\'aria-disabled\') === \'true\' || importFileInput?.disabled === true');
        expect(scriptSource).toContain('dropTargetPresent: Boolean(worldPopup)');
        expect(scriptSource).toContain('async function mountReactWorldInfoPanel()');
        expect(scriptSource).toContain('if (!getWorkspaceReactFeatures()?.reactPanels?.worldInfo)');
        expect(scriptSource).toContain('kind: \'worldInfo\'');
        expect(scriptSource).toContain('state: getWorldInfoReactBridgeState()');
        expect(scriptSource).toContain('void mountReactWorldInfoPanel();');
        expect(scriptSource).not.toContain('mountReactWorkspacePanel({\n        kind: \'worldInfo\',\n        container: document.getElementById(\'world_popup\')');

        expect(workspacePanelSource).toContain('function WorldInfoWorkspacePanel');
        expect(workspacePanelSource).toContain('data-react-workspace-panel="worldInfo"');
        expect(workspacePanelSource).toContain('interface WorldInfoWorkspacePanelState');
        expect(workspacePanelSource).toContain('data-world-info-bridge-state={stateId}');
        expect(workspacePanelSource).toContain('stateId="global-selector"');
        expect(workspacePanelSource).toContain('stateId="editor-selector"');
        expect(workspacePanelSource).toContain('stateId="import"');
        expect(workspacePanelSource).toContain('stateId="drop-target"');
        expect(workspacePanelSource).toContain('data-world-info-legacy-boundary="activation-import-regex-prompt-delete"');
    });

    test('wires Background Library to an independent React host with load and refresh state', () => {
        const scriptSource = read('public/script.js');
        const backgroundsSource = read('public/scripts/backgrounds.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('const BACKGROUND_LIBRARY_REACT_HOST_ID = \'emberdesk-react-background-library-panel-host\';');
        expect(scriptSource).toContain('function ensureBackgroundLibraryReactHost()');
        expect(scriptSource).toContain('function getBackgroundLibraryReactBridgeState(');
        expect(scriptSource).toContain('systemContainerPresent: Boolean(systemContainer)');
        expect(scriptSource).toContain('chatContainerPresent: Boolean(chatContainer)');
        expect(scriptSource).toContain('systemItemCount');
        expect(scriptSource).toContain('chatItemCount');
        expect(scriptSource).toContain('getBackgroundPanelState({');
        expect(scriptSource).toContain('async function mountReactBackgroundLibraryPanel(');
        expect(scriptSource).toContain('kind: \'backgroundLibrary\'');
        expect(scriptSource).toContain('state: getBackgroundLibraryReactBridgeState(stateOverrides)');
        expect(scriptSource).toContain('function handleReactBackgroundLibraryStateChange(event)');
        expect(scriptSource).toContain('document.addEventListener(\'emberdesk:background-library-state-change\', handleReactBackgroundLibraryStateChange);');
        expect(scriptSource).toContain('void mountReactBackgroundLibraryPanel();');

        expect(backgroundsSource).toContain('function dispatchBackgroundLibraryStateChange(detail = {})');
        expect(backgroundsSource).toContain('document.dispatchEvent(new CustomEvent(\'emberdesk:background-library-state-change\'');
        expect(backgroundsSource).toContain('dispatchBackgroundLibraryStateChange({ isLoading });');

        expect(workspacePanelSource).toContain('interface BackgroundLibraryWorkspacePanelState');
        expect(workspacePanelSource).toContain('function BackgroundLibraryWorkspacePanel');
        expect(workspacePanelSource).toContain('data-react-workspace-panel="backgroundLibrary"');
        expect(workspacePanelSource).toContain('data-background-library-bridge-state="status"');
        expect(workspacePanelSource).toContain('data-background-library-bridge-state="global-gallery"');
        expect(workspacePanelSource).toContain('data-background-library-bridge-state="chat-gallery"');
        expect(workspacePanelSource).toContain('data-background-library-legacy-boundary="upload-delete-rename-select-lock-slash"');
    });

    test('wires Extensions Host to an independent React host without replacing protected mount points', () => {
        const scriptSource = read('public/script.js');
        const extensionsSource = read('public/scripts/extensions.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('const EXTENSIONS_HOST_REACT_HOST_ID = \'emberdesk-react-extensions-host-panel-host\';');
        expect(scriptSource).toContain('function ensureExtensionsHostReactHost()');
        expect(scriptSource).toContain('function getExtensionsHostReactBridgeState(');
        expect(scriptSource).toContain('extensionsSettingsPresent: Boolean(extensionsSettings)');
        expect(scriptSource).toContain('extensionsSettings2Present: Boolean(extensionsSettings2)');
        expect(scriptSource).toContain('regexContainerPresent: Boolean(regexContainer)');
        expect(scriptSource).toContain('extensionsMenuButtonPresent: Boolean(extensionsMenuButton)');
        expect(scriptSource).toContain('extensionsMenuPresent: Boolean(extensionsMenu)');
        expect(scriptSource).toContain('extrasApiControlsPresent: Boolean(extensionsStatus && extensionsUrl && extensionsApiKey && extensionsConnect && extensionsAutoconnect)');
        expect(scriptSource).toContain('async function mountReactExtensionsHostPanel(');
        expect(scriptSource).toContain('if (!getWorkspaceReactFeatures()?.reactPanels?.extensionsHost)');
        expect(scriptSource).toContain('kind: \'extensionsHost\'');
        expect(scriptSource).toContain('state: getExtensionsHostReactBridgeState(stateOverrides)');
        expect(scriptSource).toContain('function handleReactExtensionsHostStateChange(event)');
        expect(scriptSource).toContain('document.addEventListener(\'emberdesk:extensions-host-state-change\', handleReactExtensionsHostStateChange);');
        expect(scriptSource).toContain('void mountReactExtensionsHostPanel();');
        expect(scriptSource).not.toContain('container: document.getElementById(\'extensions_settings\')');
        expect(scriptSource).not.toContain('container: document.getElementById(\'extensions_settings2\')');
        expect(scriptSource).not.toContain('container: document.getElementById(\'regex_container\')');

        expect(extensionsSource).toContain('function dispatchExtensionsHostStateChange(detail = {})');
        expect(extensionsSource).toContain('document.dispatchEvent(new CustomEvent(\'emberdesk:extensions-host-state-change\'');
        expect(extensionsSource).toContain('dispatchExtensionsHostStateChange({ deferredState: deferredExtensionLoaderState });');

        expect(workspacePanelSource).toContain('interface ExtensionsHostWorkspacePanelState');
        expect(workspacePanelSource).toContain('function ExtensionsHostWorkspacePanel');
        expect(workspacePanelSource).toContain('data-react-workspace-panel="extensionsHost"');
        expect(workspacePanelSource).toContain('data-extensions-host-bridge-state={stateId}');
        expect(workspacePanelSource).toContain('stateId="extensions-settings"');
        expect(workspacePanelSource).toContain('stateId="extensions-settings2"');
        expect(workspacePanelSource).toContain('stateId="regex-container"');
        expect(workspacePanelSource).toContain('stateId="wand-menu"');
        expect(workspacePanelSource).toContain('stateId="extras-api"');
        expect(workspacePanelSource).toContain('data-extensions-host-legacy-boundary="mount-points-loader-wand-regex-aliases"');
    });
});
