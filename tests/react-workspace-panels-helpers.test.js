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
                mainChatMessageList: false,
                worldInfo: false,
                backgroundLibrary: false,
                extensionsHost: false,
            },
        });

        expect(isReactWorkspacePanelEnabled('worldInfo')).toBe(false);
        expect(isReactWorkspacePanelEnabled('mainChatMessageList')).toBe(false);
    });

    test('reads individual panel enablement without enabling unrelated panels', () => {
        const features = {
            reactPanels: {
                characterLibrary: true,
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: false,
                extensionsHost: false,
            },
        };

        expect(isReactWorkspacePanelEnabled('worldInfo', features)).toBe(true);
        expect(isReactWorkspacePanelEnabled('mainChatMessageList', features)).toBe(true);
        expect(isReactWorkspacePanelEnabled('backgroundLibrary', features)).toBe(false);
        expect(isReactWorkspacePanelEnabled('extensionsHost', features)).toBe(false);
    });

    test('ships a main-chat message-list panel contract through the shared workspace panel asset', () => {
        const configSource = read('default/config.yaml');
        const packageSource = read('package.json');
        const seedScriptSource = read('scripts/seed-dev-environment.mjs');
        const workspaceFeatureSource = read('src/workspace-react-features.js');
        const bridgeSource = read('public/scripts/workspace-panels-react-bridge.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');

        expect(configSource).toContain('mainChatMessageList: false');
        expect(packageSource).toContain('"build:react:workspace-panels": "vite build --mode workspace-panels"');
        expect(seedScriptSource).toContain('EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST');
        expect(seedScriptSource).toContain("['mainChatMessageList', process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST]");
        expect(workspaceFeatureSource).toContain('mainChatMessageList: isReactMainChatMessageListPanelEnabled()');
        expect(workspaceFeatureSource).toContain('return isReactWorkspacePanelEnabled(\'mainChatMessageList\');');
        expect(bridgeSource).toContain('mainChatMessageList: false');
        expect(workspacePanelSource).toContain('type WorkspacePanelKind = \'worldInfo\' | \'backgroundLibrary\' | \'extensionsHost\' | \'mainChatMessageList\';');
        expect(scriptSource).toContain('mainChatMessageList: false');
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
        expect(panelModule.mountWorkspacePanel).toHaveBeenCalledWith('worldInfo', container, expect.objectContaining({ state: { selectorsSeparated: true } }));
    });

    test('uses a shared Query-backed workspace panel shell with safe legacy slot markers', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(workspacePanelSource).toContain('import { QueryClient, QueryClientProvider, useQuery } from \'@tanstack/react-query\';');
        expect(workspacePanelSource).toContain('function workspacePanelStateQueryKey(kind: WorkspacePanelKind)');
        expect(workspacePanelSource).toContain('queryKey: workspacePanelStateQueryKey(kind)');
        expect(workspacePanelSource).toContain('queryClient.setQueryData(workspacePanelStateQueryKey(mount.kind), mount.state ?? null);');
        expect(workspacePanelSource).toContain('function WorkspacePanelShell');
        expect(workspacePanelSource).toContain('data-react-workspace-panel-shell={kind}');
        expect(workspacePanelSource).toContain('data-workspace-panel-status={status}');
        expect(workspacePanelSource).toContain('data-workspace-legacy-slot={slot.id}');
        expect(workspacePanelSource).toContain('slot.id === \'extensions-settings\'');
        expect(workspacePanelSource).not.toContain('id="extensions_settings"');
        expect(workspacePanelSource).not.toContain('id="regex_container"');
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
        expect(workspacePanelSource).toContain('kind="worldInfo"');
        expect(workspacePanelSource).toContain('interface WorldInfoWorkspacePanelState');
        expect(workspacePanelSource).toContain('data-world-info-bridge-state={stateId}');
        expect(workspacePanelSource).toContain('stateId="global-selector"');
        expect(workspacePanelSource).toContain('stateId="editor-selector"');
        expect(workspacePanelSource).toContain('stateId="import"');
        expect(workspacePanelSource).toContain('stateId="drop-target"');
        expect(workspacePanelSource).toContain('legacyBoundary="activation-import-regex-prompt-delete"');
        expect(workspacePanelSource).toContain("{ id: 'legacy-editor', label: 'Legacy editor', ready: bridgeState.dropTargetPresent }");
    });

    test('renders a World Info editor/import/export workflow through React-owned controls and legacy actions', () => {
        const scriptSource = read('public/script.js');
        const bridgeSource = read('public/scripts/workspace-panels-react-bridge.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function getWorldInfoReactBridge()');
        expect(scriptSource).toContain('worldNames: getWorldInfoReactWorldNames(editorSelector)');
        expect(scriptSource).toContain('selectedWorldName: getWorldInfoReactSelectedWorldName(editorSelector)');
        expect(scriptSource).toContain('entrySummaries: getWorldInfoReactEntrySummaries()');
        expect(scriptSource).toContain('searchQuery: worldInfoSearch?.value ?? \'\'');
        expect(scriptSource).toContain('sortOptions: getWorldInfoReactSortOptions(worldInfoSortOrder)');
        expect(scriptSource).toContain('case \'applySearchQuery\':');
        expect(scriptSource).toContain('$(\'#world_info_search\').val(String(payload?.searchQuery ?? \'\')).trigger(\'input\');');
        expect(scriptSource).toContain('case \'importWorld\':');
        expect(scriptSource).toContain('document.getElementById(\'world_import_menu_item\')?.click();');
        expect(scriptSource).toContain('case \'exportWorld\':');
        expect(scriptSource).toContain('document.getElementById(\'world_export_menu_item\')?.click();');
        expect(scriptSource).toContain('bridge: getWorldInfoReactBridge()');

        expect(bridgeSource).toContain('bridge,');
        expect(bridgeSource).toContain('panelModule.mountWorkspacePanel(kind, container, { state, bridge });');

        expect(workspacePanelSource).toContain('import { useForm } from \'@tanstack/react-form\';');
        expect(workspacePanelSource).toContain('import { z } from \'zod\';');
        expect(workspacePanelSource).toContain('const worldInfoPanelFormSchema = z.object(');
        expect(workspacePanelSource).toContain('function buildWorldInfoPanelFormDefaults');
        expect(workspacePanelSource).toContain('const worldInfoActionMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-world-info-react-control="world-select"');
        expect(workspacePanelSource).toContain('data-world-info-react-control="search"');
        expect(workspacePanelSource).toContain('data-world-info-react-control="sort"');
        expect(workspacePanelSource).toContain('data-world-info-react-action="import"');
        expect(workspacePanelSource).toContain('data-world-info-react-action="export"');
        expect(workspacePanelSource).toContain('data-world-info-react-entry={entry.uid}');
        expect(workspacePanelSource).toContain('worldInfoActionMutation.mutate({ action: \'importWorld\' })');
        expect(workspacePanelSource).toContain('worldInfoActionMutation.mutate({ action: \'exportWorld\' })');
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
        expect(workspacePanelSource).toContain('kind="backgroundLibrary"');
        expect(workspacePanelSource).toContain('data-background-library-bridge-state="status"');
        expect(workspacePanelSource).toContain('data-background-library-bridge-state="global-gallery"');
        expect(workspacePanelSource).toContain('data-background-library-bridge-state="chat-gallery"');
        expect(workspacePanelSource).toContain('legacyBoundary="upload-delete-rename-select-lock-slash"');
        expect(workspacePanelSource).toContain("{ id: 'background-actions', label: 'Background actions', ready: bridgeState.systemContainerPresent || bridgeState.chatContainerPresent }");
    });

    test('renders a Background Library gallery workflow through React-owned filters and legacy actions', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function getBackgroundLibraryReactBridge()');
        expect(scriptSource).toContain('systemBackgrounds: getBackgroundLibraryReactGalleryItems(systemContainer)');
        expect(scriptSource).toContain('chatBackgrounds: getBackgroundLibraryReactGalleryItems(chatContainer)');
        expect(scriptSource).toContain('sortValue: backgroundSort?.value ?? \'\'');
        expect(scriptSource).toContain('folderViewActive: document.getElementById(\'Backgrounds\')?.classList.contains(\'in-folder-view\') === true');
        expect(scriptSource).toContain('case \'applyBackgroundFilter\':');
        expect(scriptSource).toContain('case \'applyBackgroundSort\':');
        expect(scriptSource).toContain('$(\'#bg-sort\').val(String(payload?.sortValue ?? \'\')).trigger(\'change\');');
        expect(scriptSource).toContain('case \'uploadBackground\':');
        expect(scriptSource).toContain('document.getElementById(\'add_bg_button\')?.click();');
        expect(scriptSource).toContain('case \'selectBackground\':');
        expect(scriptSource).toContain('backgroundElement?.click();');
        expect(scriptSource).toContain('const lockControl = document.querySelector(\'.bg_example.selected-background .jg-lock\') ?? document.querySelector(\'.bg_example .jg-lock\');');
        expect(scriptSource).toContain('const unlockControl = document.querySelector(\'.bg_example.locked-background .jg-unlock\') ?? document.querySelector(\'.bg_example .jg-unlock\');');
        expect(scriptSource).toContain('bridge: getBackgroundLibraryReactBridge()');

        expect(workspacePanelSource).toContain('const backgroundLibraryPanelFormSchema = z.object(');
        expect(workspacePanelSource).toContain('function buildBackgroundLibraryPanelFormDefaults');
        expect(workspacePanelSource).toContain('const backgroundLibraryActionMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-background-library-react-control="filter"');
        expect(workspacePanelSource).toContain('data-background-library-react-control="sort"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="upload"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="lock"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="unlock"');
        expect(workspacePanelSource).toContain('data-background-library-react-gallery={source}');
        expect(workspacePanelSource).toContain('<BackgroundGallery source="global" items={systemBackgrounds} actionMutation={backgroundLibraryActionMutation} />');
        expect(workspacePanelSource).toContain('<BackgroundGallery source="chat" items={chatBackgrounds} actionMutation={backgroundLibraryActionMutation} />');
        expect(workspacePanelSource).toContain('data-background-library-react-item={item.id}');
        expect(workspacePanelSource).toContain('backgroundLibraryActionMutation.mutate({ action: \'uploadBackground\' })');
        expect(workspacePanelSource).toContain('backgroundLibraryActionMutation.mutate({ action: \'lockBackground\' })');
        expect(workspacePanelSource).toContain('backgroundLibraryActionMutation.mutate({ action: \'unlockBackground\' })');
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
        expect(workspacePanelSource).toContain('kind="extensionsHost"');
        expect(workspacePanelSource).toContain('data-extensions-host-bridge-state={stateId}');
        expect(workspacePanelSource).toContain('stateId="extensions-settings"');
        expect(workspacePanelSource).toContain('stateId="extensions-settings2"');
        expect(workspacePanelSource).toContain('stateId="regex-container"');
        expect(workspacePanelSource).toContain('stateId="wand-menu"');
        expect(workspacePanelSource).toContain('stateId="extras-api"');
        expect(workspacePanelSource).toContain('legacyBoundary="mount-points-loader-wand-regex-aliases"');
        expect(workspacePanelSource).toContain("{ id: 'extensions-menu', label: 'Wand menu', ready: bridgeState.extensionsMenuPresent }");
    });

    test('renders an Extensions Host workflow through React-owned controls and protected legacy actions', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function getExtensionsHostReactBridge()');
        expect(scriptSource).toContain('notifyUpdatesEnabled: document.getElementById(\'extensions_notify_updates\')?.checked === true');
        expect(scriptSource).toContain('extrasApiUrl: extensionsUrl?.value ?? \'\'');
        expect(scriptSource).toContain('extrasApiKeySet: Boolean(extensionsApiKey?.value)');
        expect(scriptSource).toContain('autoconnectEnabled: extensionsAutoconnect?.checked === true');
        expect(scriptSource).toContain('extrasStatusText: extensionsStatus?.textContent?.trim() ?? \'\'');
        expect(scriptSource).toContain('mountPointStatuses: getExtensionsHostReactMountPointStatuses()');
        expect(scriptSource).toContain('case \'toggleNotifyUpdates\':');
        expect(scriptSource).toContain('document.getElementById(\'extensions_notify_updates\')?.click();');
        expect(scriptSource).toContain('case \'openManageExtensions\':');
        expect(scriptSource).toContain('document.getElementById(\'extensions_details\')?.click();');
        expect(scriptSource).toContain('case \'openInstallExtension\':');
        expect(scriptSource).toContain('document.getElementById(\'third_party_extension_button\')?.click();');
        expect(scriptSource).toContain('case \'updateExtrasApiUrl\':');
        expect(scriptSource).toContain('$(\'#extensions_url\').val(String(payload?.url ?? \'\')).trigger(\'input\');');
        expect(scriptSource).toContain('case \'updateExtrasApiKey\':');
        expect(scriptSource).toContain('$(\'#extensions_api_key\').val(String(payload?.apiKey ?? \'\')).trigger(\'input\');');
        expect(scriptSource).toContain('case \'connectExtrasApi\':');
        expect(scriptSource).toContain('document.getElementById(\'extensions_connect\')?.click();');
        expect(scriptSource).toContain('case \'toggleAutoconnect\':');
        expect(scriptSource).toContain('document.getElementById(\'extensions_autoconnect\')?.click();');
        expect(scriptSource).toContain('bridge: getExtensionsHostReactBridge()');

        expect(workspacePanelSource).toContain('const extensionsHostPanelFormSchema = z.object(');
        expect(workspacePanelSource).toContain('function buildExtensionsHostPanelFormDefaults');
        expect(workspacePanelSource).toContain('const extensionsHostActionMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="notify-updates"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="manage"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="install"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="extras-url"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="extras-api-key"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="autoconnect"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="connect"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-mount-point={mountPoint.id}');
        expect(workspacePanelSource).toContain('extensionsHostActionMutation.mutate({ action: \'toggleNotifyUpdates\' })');
        expect(workspacePanelSource).toContain('extensionsHostActionMutation.mutate({ action: \'openManageExtensions\' })');
        expect(workspacePanelSource).toContain('extensionsHostActionMutation.mutate({ action: \'openInstallExtension\' })');
        expect(workspacePanelSource).toContain('extensionsHostActionMutation.mutate({ action: \'connectExtrasApi\' })');
    });

    test('wires main-chat message-list to a guarded React host with fail-closed fallback hooks', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('const MAIN_CHAT_MESSAGE_LIST_REACT_HOST_ID = \'emberdesk-react-main-chat-message-list-host\';');
        expect(scriptSource).toContain('function ensureMainChatMessageListReactHost()');
        expect(scriptSource).toContain('host.hidden = true;');
        expect(scriptSource).toContain('function getMainChatMessageListReactBridgeState()');
        expect(scriptSource).toContain('chatId: getCurrentChatId()');
        expect(scriptSource).toContain('messageNodes: messageRows');
        expect(scriptSource).toContain('showMoreNode: showMoreButton');
        expect(scriptSource).toContain('scrollTop: chatContainer?.scrollTop ?? 0');
        expect(scriptSource).toContain('scrollHeight: chatContainer?.scrollHeight ?? 0');
        expect(scriptSource).toContain('clientHeight: chatContainer?.clientHeight ?? 0');
        expect(scriptSource).toContain('function getMainChatGenerationControlBridgeState()');
        expect(scriptSource).toContain('generationControl: getMainChatGenerationControlBridgeState()');
        expect(scriptSource).toContain('function getMainChatStreamingTransportBridgeState()');
        expect(scriptSource).toContain('streamingTransport: getMainChatStreamingTransportBridgeState()');
        expect(scriptSource).toContain('function getMainChatComposerBridgeState()');
        expect(scriptSource).toContain('composer: getMainChatComposerBridgeState()');
        expect(scriptSource).toContain('function getMainChatSlashCommandBridgeState()');
        expect(scriptSource).toContain('slashCommand: getMainChatSlashCommandBridgeState()');
        expect(scriptSource).toContain('activeContext: getMainChatComposerActiveContext()');
        expect(scriptSource).toContain('text: textarea?.value ?? \'\'');
        expect(scriptSource).toContain('autocompleteVisible: isMainChatSlashAutocompleteVisible()');
        expect(scriptSource).toContain('observedTokenCount: streamingProcessor?.observedTokenCount ?? 0');
        expect(scriptSource).toContain('observedChunkCount: streamingProcessor?.observedChunkCount ?? 0');
        expect(scriptSource).toContain('const continueSurface = isMainChatGenerationControlElementVisible(document.getElementById(\'mes_continue\')) ? \'legacy\' : \'hidden\';');
        expect(scriptSource).toContain('continueSurface,');
        expect(scriptSource).toContain("failureRetryVisible: isMainChatGenerationControlElementVisible(failureRetry)");
        expect(scriptSource).toContain("failureNoticeVisible: Boolean(failureNotice)");
        expect(scriptSource).toContain("recoveryStage: recoveryStatus?.dataset?.recoveryStage === 'fallback' ? 'fallback' : 'primary'");
        expect(scriptSource).not.toContain("recoveryStatusText.includes('备用')");
        expect(scriptSource).toContain('function getMainChatMessageListReactBridge()');
        expect(scriptSource).toContain('case \'loadMoreUntilMessage\':');
        expect(scriptSource).toContain('async function mountReactMainChatMessageListPanel(');
        expect(scriptSource).toContain('if (!getWorkspaceReactFeatures()?.reactPanels?.mainChatMessageList)');
        expect(scriptSource).toContain('kind: \'mainChatMessageList\'');
        expect(scriptSource).toContain('state: getMainChatMessageListReactBridgeState()');
        expect(scriptSource).toContain('bridge: getMainChatMessageListReactBridge()');
        expect(scriptSource).toContain('cleanupMainChatMessageListReactHost()');
        expect(scriptSource).toContain('document.getElementById(\'chat\')');
        expect(scriptSource).toContain('void mountReactMainChatMessageListPanel();');
        expect(scriptSource).toContain('event_types.CHAT_LOADED');
        expect(scriptSource).toContain('event_types.MORE_MESSAGES_LOADED');
        expect(scriptSource).not.toContain('container: document.getElementById(\'chat\')');

        expect(workspacePanelSource).toContain('function MainChatMessageListWorkspacePanel');
        expect(workspacePanelSource).toContain('chatId?: string;');
        expect(workspacePanelSource).toContain('generationControl?: MainChatGenerationControlState;');
        expect(workspacePanelSource).toContain('streamingTransport?: MainChatStreamingTransportState;');
        expect(workspacePanelSource).toContain('composer?: MainChatComposerState;');
        expect(workspacePanelSource).toContain('slashCommand?: MainChatSlashCommandState;');
        expect(workspacePanelSource).toContain('interface MainChatComposerState');
        expect(workspacePanelSource).toContain('interface MainChatSlashCommandState');
        expect(workspacePanelSource).toContain('const mainChatComposerSchema = z.object(');
        expect(workspacePanelSource).toContain('const mainChatSlashCommandSchema = z.object(');
        expect(workspacePanelSource).toContain('const mainChatComposerFallback: MainChatComposerState = {');
        expect(workspacePanelSource).toContain('const mainChatSlashCommandFallback: MainChatSlashCommandState = {');
        expect(workspacePanelSource).toContain('scrollTop?: number;');
        expect(workspacePanelSource).toContain('scrollHeight?: number;');
        expect(workspacePanelSource).toContain('clientHeight?: number;');
        expect(workspacePanelSource).toContain('function syncMainChatMessageListDom(');
        expect(workspacePanelSource).toContain('bridgeState.messageNodes ?? []');
        expect(workspacePanelSource).toContain('bridgeState.showMoreNode');
        expect(workspacePanelSource).toContain('host.hidden = true;');
        expect(workspacePanelSource).toContain('chatContainer.insertBefore(node, insertAfter.nextSibling);');
        expect(workspacePanelSource).toContain('const composer = mainChatComposerSchema.safeParse(bridgeState.composer);');
        expect(workspacePanelSource).toContain('const slashCommand = mainChatSlashCommandSchema.safeParse(bridgeState.slashCommand);');
        expect(workspacePanelSource).toContain('data-main-chat-message-list-controller="true"');
        expect(workspacePanelSource).toContain('data-main-chat-message-list-status={bridgeState.hasChatContainer ? \'ready\' : \'missing\'}');
        expect(workspacePanelSource).toContain('data-main-chat-generation-control-phase={bridgeState.generationControl?.phase ?? \'idle\'}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-length={bridgeState.composer?.valueLength ?? 0}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-empty={bridgeState.composer?.isEmpty ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-can-submit={bridgeState.composer?.canSubmit ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-focused={bridgeState.composer?.isFocused ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-disabled={bridgeState.composer?.isDisabled ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-generating={bridgeState.composer?.isGenerating ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-composer-context={bridgeState.composer?.activeContext ?? \'none\'}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-active={bridgeState.slashCommand?.active ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-query-length={bridgeState.slashCommand?.queryLength ?? 0}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-autocomplete={bridgeState.slashCommand?.autocompleteVisible ? \'visible\' : \'hidden\'}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-executing={bridgeState.slashCommand?.executing ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-paused={bridgeState.slashCommand?.paused ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-aborted={bridgeState.slashCommand?.aborted ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('data-main-chat-slash-command-error={bridgeState.slashCommand?.errorLabel ?? \'\'}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-phase={bridgeState.streamingTransport?.phase ?? \'idle\'}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-tokens={bridgeState.streamingTransport?.observedTokenCount ?? 0}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-message-id={bridgeState.streamingTransport?.activeMessageId ?? \'\'}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-fallback={bridgeState.streamingTransport?.fromFallbackAttempt ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain('return <MainChatMessageListWorkspacePanel state={state} bridge={bridge} />;');
        expect(workspacePanelSource).not.toContain('title="Main Chat Message List"');
        expect(workspacePanelSource).not.toContain('legacyBoundary="message-rendering-streaming-actions-load-more"');
    });

    test('defines a finalized rich-body snapshot contract for main-chat rows and validates row eligibility', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function buildMainChatRichBodySnapshot(');
        expect(scriptSource).toContain('function isMainChatRichBodyEligible(');
        expect(scriptSource).toContain('richBodySnapshots:');
        expect(scriptSource).toContain('eligible:');
        expect(scriptSource).toContain('messageHtml:');
        expect(scriptSource).toContain('reasoningHtml:');
        expect(scriptSource).toContain('mediaHtml:');
        expect(scriptSource).toContain('fileHtml:');
        expect(scriptSource).toContain('biasHtml:');
        expect(scriptSource).toContain('schema: mainChatRichBodySnapshotSchema');

        expect(workspacePanelSource).toContain('const mainChatRichBodySnapshotSchema = z.object(');
        expect(workspacePanelSource).toContain('interface MainChatRichBodySnapshot');
        expect(workspacePanelSource).toContain('richBodySnapshots?: MainChatRichBodySnapshot[];');
        expect(workspacePanelSource).toContain('data-main-chat-rich-body-owner="react"');
        expect(workspacePanelSource).toContain('data-main-chat-rich-body-row={snapshot.messageId}');
    });

    test('defines a hidden message-action snapshot contract for safe main-chat rows', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('buildMessageActionSnapshot');
        expect(scriptSource).toContain('const mainChatMessageActionSnapshotSchema = \'mainChatMessageActionSnapshotSchema\';');
        expect(scriptSource).toContain('messageActionSnapshots = messageRows');
        expect(scriptSource).toContain('schema: mainChatMessageActionSnapshotSchema');
        expect(scriptSource).toContain('messageActionSnapshots: messageActionSnapshots');

        expect(workspacePanelSource).toContain('interface MainChatMessageActionSnapshot');
        expect(workspacePanelSource).toContain('messageActionSnapshots?: MainChatMessageActionSnapshot[];');
        expect(workspacePanelSource).toContain('const mainChatMessageActionSnapshotSchema = z.object(');
        expect(workspacePanelSource).toContain('data-main-chat-message-actions-owner="react"');
        expect(workspacePanelSource).toContain('data-main-chat-message-actions-row={snapshot.messageId}');
        expect(workspacePanelSource).toContain('data-main-chat-message-actions-expanded={snapshot.expanded ? \'true\' : \'false\'}');
    });
});
