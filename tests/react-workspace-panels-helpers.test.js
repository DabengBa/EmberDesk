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
import {
    WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS,
    WORKSPACE_PANEL_MOUNT_STATUSES,
    createWorkspacePanelFallbackResult,
    createWorkspacePanelMountedResult,
} from '../public/scripts/workspace-panel-mount-contract.js';
import {
    createWorkspacePanelCommandPort,
    createWorkspacePanelStateChangeHandler,
    decideWorkspacePanelHostLifecycle,
    mountWorkspacePanelHost,
} from '../public/scripts/workspace-panel-host-controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('React workspace panels bridge helpers', () => {
    test('uses a default sole-owner feature payload for retired workspace panel islands', () => {
        expect(getDefaultWorkspaceReactFeatures()).toEqual({
            reactPanels: {
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: true,
                extensionsHost: true,
                characterAuthoring: true,
                groupAuthoring: false,
            },
            reactPages: {
                settings: true,
            },
        });

        expect(isReactWorkspacePanelEnabled('worldInfo')).toBe(true);
        expect(isReactWorkspacePanelEnabled('mainChatMessageList')).toBe(true);
    });

    test('reads individual panel enablement without enabling unrelated panels', () => {
        const features = {
            reactPanels: {
                mainChatMessageList: true,
                worldInfo: true,
                backgroundLibrary: false,
                extensionsHost: true,
            },
        };

        expect(isReactWorkspacePanelEnabled('worldInfo', features)).toBe(true);
        expect(isReactWorkspacePanelEnabled('mainChatMessageList', features)).toBe(true);
        expect(isReactWorkspacePanelEnabled('backgroundLibrary', features)).toBe(false);
        expect(isReactWorkspacePanelEnabled('extensionsHost', features)).toBe(true);
    });

    test('keeps internal workspace panel mount result constants and helpers aligned', () => {
        expect(WORKSPACE_PANEL_MOUNT_STATUSES).toEqual({
            FALLBACK: 'fallback',
            MOUNTED: 'mounted',
        });
        expect(WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS).toEqual({
            BUNDLE_LOAD_FAILED: 'bundle-load-failed',
            FEATURE_DISABLED: 'feature-disabled',
            MISSING_CONTAINER: 'missing-container',
            MOUNT_FAILED: 'mount-failed',
        });
        expect(createWorkspacePanelMountedResult('worldInfo')).toEqual({
            kind: 'worldInfo',
            mounted: true,
            status: 'mounted',
        });
        expect(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MISSING_CONTAINER)).toEqual({
            kind: 'worldInfo',
            mounted: false,
            reason: 'missing-container',
            status: 'fallback',
        });
    });

    test('mounts the required same-entry React shell without a fallback contract', () => {
        const scriptSource = read('public/script.js');
        const bridgeSource = read('public/scripts/workspace-panels-react-bridge.js');

        expect(scriptSource).toContain('async function mountReactWorkspaceShellChromeHost');
        expect(scriptSource).toContain('hideLegacyWorkspaceChromeForReact();');
        expect(scriptSource).not.toContain('workspace-shell-takeover-contract');
        expect(scriptSource).not.toContain('publishWorkspaceShellTakeoverDiagnostic');
        expect(bridgeSource).not.toContain('workspace-shell-takeover-contract');
        expect(bridgeSource).not.toContain('Falling back to legacy chrome');
        expect(scriptSource).not.toContain('document.body.innerHTML =');
    });

    test('wires a same-entry React workspace chrome host through the shared panel asset', () => {
        const scriptSource = read('public/script.js');
        const bridgeSource = read('public/scripts/workspace-panels-react-bridge.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('WORKSPACE_SHELL_CHROME_HOST_ID');
        expect(scriptSource).toContain('ensureWorkspaceShellChromeHost');
        expect(scriptSource).toContain('mountReactWorkspaceShellChrome');
        expect(scriptSource).toContain('data-react-workspace-shell-chrome-status');
        expect(scriptSource).toContain('data-legacy-workspace-chrome-hidden-by-react');
        expect(scriptSource).toContain("? 'EmberDesk'");
        expect(scriptSource).not.toContain('workspace-next');
        expect(scriptSource).not.toContain('/workspace-next');
        expect(scriptSource).not.toContain('contextSubtitle:');
        expect(scriptSource).not.toContain('chatTitle,');
        expect(scriptSource).not.toContain('temporaryChat:');

        expect(bridgeSource).toContain('mountReactWorkspaceShellChrome');
        expect(bridgeSource).toContain('panelModule.mountWorkspaceShellChrome');
        expect(workspacePanelSource).toContain('export function mountWorkspaceShellChrome');
        expect(workspacePanelSource).toContain('ReactWorkspaceShellChrome');
        expect(workspacePanelSource).toContain('AI Config');
        expect(workspacePanelSource).toContain('Formatting');
        expect(workspacePanelSource).toContain('Character Library');
        expect(workspacePanelSource).not.toContain("{ action: 'openCharacterAuthoring'");
        expect(workspacePanelSource).not.toContain('Workspace ready');
        expect(workspacePanelSource).not.toContain('react-workspace-shell-status-dot');
        expect(workspacePanelSource).not.toContain('react-workspace-shell-kicker');
        expect(workspacePanelSource).not.toContain('react-workspace-shell-meta');
        expect(workspacePanelSource).not.toContain('react-workspace-shell-status');
        expect(workspacePanelSource).not.toContain('react-workspace-panel-dock-status');
        expect(workspacePanelSource).not.toContain('No chat selected');
        expect(workspacePanelSource).toContain('World Info');
        expect(workspacePanelSource).toContain('Backgrounds');
        expect(workspacePanelSource).toContain('Extensions');
        expect(workspacePanelSource).toContain('Settings');
        expect(scriptSource).toContain("openAIConfig: () => openWorkspaceSettingsOverlay({ tab: 'providers', panelKind: 'aiConfig' })");
        expect(scriptSource).toContain("openWorkspaceSettingsOverlay");
        expect(scriptSource).toContain("tab: 'providers'");
        expect(scriptSource).toContain("openFormatting: () => openWorkspaceSettingsOverlay({ tab: 'advanced', panelKind: 'advancedFormatting' })");
        expect(scriptSource).toContain("tab: 'advanced'");
        expect(scriptSource).toContain("openSettings: () => openWorkspaceSettingsOverlay({ tab: null, panelKind: 'settings' })");
        expect(scriptSource).not.toContain("window.location.assign('/settings");
        expect(scriptSource).not.toContain("await openWorkspaceShellDrawer('user-settings-block');");
        expect(workspacePanelSource).toContain('data-settings-overlay');
        expect(workspacePanelSource).toContain('SettingsSurface');
    });

    test('coordinates React shell panel entries through slot lifecycle state', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelStoreSource = read('app/stores/workspace-panel-store.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        [
            ['aiConfig', 'AI Config', 'openAIConfig'],
            ['advancedFormatting', 'Formatting', 'openFormatting'],
            ['settings', 'Settings', 'openSettings'],
        ].forEach(([panelKind, label, action]) => {
            expect(workspacePanelStoreSource).toContain(`'${panelKind}',`);
            expect(workspacePanelSource).toContain(`{ command: '${action}'`);
            expect(workspacePanelSource).toContain(`label: '${label}'`);
            expect(workspacePanelSource).toContain(`panelKind: '${panelKind}'`);
        });

        expect(workspacePanelSource).toContain('recordWorkspacePanelDockIntent,');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockClose,');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockPin,');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockResult,');
        expect(workspacePanelSource).toContain('getWorkspacePanelDockSnapshot,');
        expect(workspacePanelSource).toContain('subscribeWorkspacePanelDock,');
        expect(workspacePanelSource).toContain('panelKind?: WorkspaceDockPanelKind;');
        expect(workspacePanelSource).toContain('function useWorkspacePanelDockSnapshot()');
        expect(workspacePanelSource).toContain('function normalizeWorkspacePanelDockStatus(');
        expect(workspacePanelSource).toContain('function getWorkspacePanelVisibleStatusLabel(');
        expect(workspacePanelSource).toContain('const dockSnapshot = useWorkspacePanelDockSnapshot();');
        expect(workspacePanelSource).toContain('const panelDispatchSequenceRef = useRef(0);');
        expect(workspacePanelSource).toContain('const dispatchSequence = panelDispatchSequenceRef.current + 1;');
        expect(workspacePanelSource).toContain('if (panelDispatchSequenceRef.current !== dispatchSequence) {');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockIntent(entry.panelKind);');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockResult(entry.panelKind, {');
        expect(workspacePanelSource).toContain('fallbackReason: getWorkspacePanelDockFallbackReason(result),');
        expect(workspacePanelSource).not.toContain('locked: Boolean(asWorkspacePanelDockDispatchResult(result).locked),');
        expect(workspacePanelSource).not.toContain('pinned: Boolean(asWorkspacePanelDockDispatchResult(result).pinned),');
        expect(workspacePanelSource).toContain('status: normalizeWorkspacePanelDockStatus(result),');
        expect(workspacePanelSource).toContain('data-workspace-shell-panel-entry={entry.panelKind}');
        expect(workspacePanelSource).toContain('data-workspace-shell-panel-active={isPanelEntryActive ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain("const isPinned = Boolean(entry.panelKind && dockSnapshot.pinnedPanelKinds.includes(entry.panelKind));");
        expect(workspacePanelSource).toContain("? `${isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned ? 'Close' : 'Open'} ${entry.label}`");
        expect(workspacePanelSource).toContain('aria-label={panelActionLabel}');
        expect(workspacePanelSource).toContain('title={panelActionLabel}');
        expect(workspacePanelSource).toContain('aria-pressed={entry.panelKind ? isPanelEntryActive : undefined}');
        expect(workspacePanelSource).toContain('event.stopPropagation();');
        expect(workspacePanelSource).toContain("if (entry.panelKind && isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' && !isPinned) {");
        expect(workspacePanelSource).toContain("void closePanel(entry);");
        expect(workspacePanelSource).toContain('void dispatchCommand(entry);');
        expect(scriptSource).toContain('function getWorkspaceShellCommands()');
        expect(scriptSource).toContain('activateWorkspaceShellSlot,');
        expect(scriptSource).toContain('deactivateWorkspaceShellSlot,');
        expect(scriptSource).toContain('setWorkspaceShellSlotPinned,');
        expect(scriptSource).toContain('openCharacterLibrary: openWorkspaceShellCharacterLibrary,');
        expect(workspacePanelSource).toContain("panelKind: 'characterLibrary'");
        expect(scriptSource).toContain('async function openWorkspaceShellWorldInfo()');
        expect(scriptSource).toContain('function waitForWorkspaceShellPanelOpenTask()');
        expect(scriptSource).toContain('await waitForWorkspaceShellPanelOpenTask();');
        expect(scriptSource).toContain("void ensureWorkspaceShellDeferredPanel('world-info-body');");
        expect(scriptSource.indexOf('await waitForWorkspaceShellPanelOpenTask();')).toBeLessThan(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();"));
        expect(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();")).toBeLessThan(scriptSource.indexOf("void ensureWorkspaceShellDeferredPanel('world-info-body');"));
        expect(scriptSource.indexOf("await openWorkspaceChildSlotHost('WorldInfo');")).toBeLessThan(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();"));
        expect(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();")).toBeLessThan(scriptSource.indexOf("return createWorkspaceShellPanelResult('worldInfo', worldInfoMount);"));
        expect(scriptSource.indexOf("await openWorkspaceChildSlotHost('Backgrounds');")).toBeLessThan(scriptSource.indexOf("return createWorkspaceShellPanelResult('backgroundLibrary', await mountReactBackgroundLibraryPanel());"));
        expect(scriptSource.indexOf("await openWorkspaceChildSlotHost('rm_extensions_block');")).toBeLessThan(scriptSource.indexOf("return createWorkspaceShellPanelResult('extensionsHost', await mountReactExtensionsHostPanel());"));
        expect(scriptSource).toContain('function openWorkspaceChildSlotHostImmediate(hostId)');
        expect(scriptSource).toContain("drawer.style.opacity = '1';");
        expect(scriptSource).toContain('function closeWorkspaceChildSlotHost(hostId, { force = false } = {})');
        expect(scriptSource).toContain('function deactivateWorkspaceChildSlotByKind(slotKey, options = {})');
        expect(scriptSource).toContain('function getWorkspaceChildSlotHostId(slotKey)');
        expect(scriptSource).toContain('group-chat-feature-removed');
        expect(scriptSource).toContain('function showWorkspaceChildSlotContent(selectedMenuId)');
        expect(scriptSource).toContain('async function openWorkspaceShellCharacterLibrary()');
        expect(scriptSource).toContain("openWorkspaceChildSlotHostImmediate('right-nav-panel');");
        expect(scriptSource).toContain("if (menu_type !== 'characters') {\n        selected_button = 'characters';\n        setMenuType('characters');\n        showWorkspaceChildSlotContent('rm_characters_block');");
        expect(scriptSource.match(/openWorkspaceShellCharacterLibrary\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain("$('#rm_button_characters').trigger('click');");
        expect(scriptSource.match(/openWorkspaceShellCharacterLibrary\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain("openWorkspaceChildSlotHost('right-nav-panel')");
        expect(scriptSource.match(/openWorkspaceShellCharacterLibrary\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain('printCharacters(');
        expect(scriptSource).toContain('openCharacterLibrary: openWorkspaceShellCharacterLibrary,');
        expect(scriptSource).toContain('openCharacterLibrary: async () => {');
        expect(workspacePanelSource).toContain("panelKind: 'worldInfo'");
        expect(scriptSource).toContain('openBackgrounds: openWorkspaceShellBackgrounds,');
        expect(workspacePanelSource).toContain("panelKind: 'backgroundLibrary'");
        expect(scriptSource).toContain('openExtensions: openWorkspaceShellExtensions,');
        expect(workspacePanelSource).toContain("panelKind: 'extensionsHost'");
        expect(scriptSource).toContain('return createWorkspaceShellPanelResult(');
        expect(scriptSource).not.toContain('getWorkspaceShellPanelDockState');
        expect(scriptSource).not.toContain('locked: dockState.locked,');
        expect(scriptSource).not.toContain('pinned: dockState.pinned,');
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('characterLibrary',");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('worldInfo', worldInfoMount);");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('backgroundLibrary', await mountReactBackgroundLibraryPanel());");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('extensionsHost', await mountReactExtensionsHostPanel());");
        expect(scriptSource).toContain("openAIConfig: () => openWorkspaceSettingsOverlay({ tab: 'providers', panelKind: 'aiConfig' })");
        expect(scriptSource).toContain("openWorkspaceSettingsOverlay");
        expect(scriptSource).toContain("openFormatting: () => openWorkspaceSettingsOverlay({ tab: 'advanced', panelKind: 'advancedFormatting' })");
        expect(scriptSource).toContain("openSettings: () => openWorkspaceSettingsOverlay({ tab: null, panelKind: 'settings' })");
        expect(scriptSource).not.toContain("window.location.assign('/settings');");
        expect(scriptSource).not.toContain("openWorkspaceShellDrawer('user-settings-block')");
        expect(scriptSource).not.toContain('reactPages?.settings');
        expect(scriptSource).toContain('openGroupChats: openWorkspaceShellGroupChats,');
        expect(scriptSource.match(/openWorkspaceShellGroupChats\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain("$('#rm_button_group_chats').trigger('click');");

        const styleSource = read('public/style.css');
        expect(styleSource).toContain('.react-workspace-shell-nav-button[data-workspace-shell-panel-active="true"]');
        expect(styleSource).not.toMatch(/\.react-workspace-shell-nav\s*\{[^}]*overflow-x:\s*auto/);
        expect(styleSource).not.toContain('.react-workspace-shell-status');
        expect(styleSource).not.toContain('.react-workspace-panel-dock-status');
    });

    test('publishes explicit React shell child-slot contracts before dispatching feature-local capabilities', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const workspacePanelStoreSource = read('app/stores/workspace-panel-store.js');
        const scriptSource = read('public/script.js');

        expect(workspacePanelStoreSource).toContain('export const WORKSPACE_SHELL_CHILD_SLOTS');
        expect(workspacePanelStoreSource).toContain('export function getWorkspaceShellChildSlot(slotKey)');
        expect(workspacePanelSource).toContain('WorkspaceShellSlotKey');
        expect(workspacePanelSource).toContain('slotKey?: WorkspaceShellSlotKey;');
        expect(workspacePanelSource).toContain('data-workspace-shell-child-slot={entry.slotKey}');
        expect(workspacePanelSource).toContain('getWorkspaceShellChildSlot(entry.slotKey)');
        expect(workspacePanelSource).toContain('commands?.activateWorkspaceShellSlot(entry.slotKey)');
        expect(workspacePanelSource).toContain('commands?.deactivateWorkspaceShellSlot(entry.slotKey)');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockPin(entry.panelKind, !isPinned);');
        expect(workspacePanelSource).not.toContain('pinned: Boolean(asWorkspacePanelDockDispatchResult(result).pinned)');
        expect(scriptSource).toContain('async function activateWorkspaceShellSlot(slotKey)');
        expect(scriptSource).toContain('function deactivateWorkspaceShellSlot(slotKey)');
        expect(scriptSource).toContain('function setWorkspaceShellSlotPinned(slotKey, pinned)');
        expect(scriptSource).toContain('setWorkspaceShellSlotPinned,');
        expect(scriptSource).toContain('activateWorkspaceShellSlot,');
        expect(scriptSource).toContain('deactivateWorkspaceShellSlot,');
    });

    test('keeps a failed child slot recoverable without replacing the shell or chat layout', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(workspacePanelSource).not.toContain('data-workspace-shell-slot-recovery=');
        expect(workspacePanelSource).not.toContain('data-workspace-shell-slot-recovery-action="retry"');
    });

    test('ships a main-chat message-list panel contract through the shared workspace panel asset', () => {
        const configSource = read('default/config.yaml');
        const packageSource = read('package.json');
        const seedScriptSource = read('scripts/seed-dev-environment.mjs');
        const workspaceFeatureSource = read('src/workspace-react-features.js');
        const bridgeSource = read('public/scripts/workspace-panels-react-bridge.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');
        const groupChatsSource = read('public/scripts/group-chats.js');
        expect(groupChatsSource).toContain('openGroupById retired');

        expect(configSource).not.toContain('mainChatMessageList:');
        expect(configSource).not.toContain('characterAuthoring:');
        expect(configSource).not.toContain('groupAuthoring:');
        expect(packageSource).toContain('"build:react:workspace-panels": "vite build --mode workspace-panels"');
        expect(seedScriptSource).not.toContain('EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST');
        expect(seedScriptSource).not.toContain('features:');
        expect(workspaceFeatureSource).toContain('// Main Chat message list is React sole-owner; product flag is retired.');
        expect(workspaceFeatureSource).toContain('return true;');
        expect(bridgeSource).toContain('mainChatMessageList: true');
        expect(bridgeSource).toContain('characterAuthoring: true');
        expect(bridgeSource).not.toContain('groupAuthoring: true');
        expect(workspacePanelSource).toContain("export type WorkspacePanelKind = 'worldInfo' | 'backgroundLibrary' | 'extensionsHost' | 'mainChatMessageList' | 'characterAuthoring';");
        expect(scriptSource).toContain('mainChatMessageList: true');
        expect(scriptSource).toContain('characterAuthoring: true');
        expect(scriptSource).not.toContain('groupAuthoring: true');
    });

    test('ships React authoring form fields and legacy write-through action bridge', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');
        const groupChatsSource = read('public/scripts/group-chats.js');

        expect(workspacePanelSource).toContain('createCharacterAuthoringSession');
        expect(workspacePanelSource).toContain("../public/scripts/character-authoring.js");
        expect(workspacePanelSource).toContain('group_chat_feature_removed');
        expect(workspacePanelSource).not.toContain("../public/scripts/group-authoring.js");
        expect(workspacePanelSource).toContain('react-authoring-field');
        expect(workspacePanelSource).toContain('data-react-authoring-field="name"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="description"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="firstMessage"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="personality"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="scenario"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="exampleMessages"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="creatorNotes"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="systemPrompt"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="postHistoryInstructions"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="creator"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="characterVersion"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="characterWorld"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="tags"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="favorite"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="talkativeness"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="alternateGreetings"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="depthPrompt.prompt"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="depthPrompt.depth"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="depthPrompt.role"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="avatar"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="activationStrategy"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="generationMode"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="autoModeDelay"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="allowSelfResponses"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="hideMutedSprites"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="joinPrefix"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="joinSuffix"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="groupFavorite"');
        expect(workspacePanelSource).toContain('data-react-authoring-field="groupTags"');
        expect(workspacePanelSource).not.toContain('Additional extension fields still use the legacy editor:');
        expect(workspacePanelSource).toContain('data-react-authoring-members');
        expect(workspacePanelSource).toContain('data-react-authoring-candidates');
        expect(workspacePanelSource).toContain('data-react-authoring-action="add-member"');
        expect(workspacePanelSource).toContain('data-react-authoring-action="remove-member"');
        expect(workspacePanelSource).toContain('data-react-authoring-action="move-up"');
        expect(workspacePanelSource).toContain('data-react-authoring-action="move-down"');
        expect(workspacePanelSource).toContain('aria-label={`Remove ${member}`}');
        expect(workspacePanelSource).toContain('aria-label={`Move ${member} up`}');
        expect(workspacePanelSource).toContain('aria-label={`Move ${member} down`}');
        expect(workspacePanelSource).toContain('authoringCommandMutation.mutateAsync((submitResult.payload ?? {}) as Record<string, unknown>)');
        expect(workspacePanelSource).toContain('shouldApplyCharacterAuthoringSaveResult');
        expect(workspacePanelSource).toContain('createCharacterAuthoringSession(submittedDraft');
        expect(workspacePanelSource).toContain('saveGenerationRef');
        expect(workspacePanelSource).toContain("status={authoringCommandMutation.isError ? 'error' : 'success'}");
        expect(workspacePanelSource).toContain("const isCreateMode = (bridgeState.mode ?? 'create') === 'create';");
        expect(workspacePanelSource).toContain('const isActionPending = authoringCommandMutation.isPending;');
        expect(workspacePanelSource).toContain('void commands?.cancelAuthoring?.(kind);');
        expect(workspacePanelSource).not.toContain("id: 'retry-authoring-save'");
        expect(workspacePanelSource).not.toContain('actions={shellActions}');
        expect(workspacePanelSource).not.toContain('recoveryActions={[]}');
        expect(workspacePanelSource).toContain('react-authoring-secondary-action');
        expect(workspacePanelSource).toContain('react-authoring-tool-action');
        expect(workspacePanelSource).toContain('react-authoring-danger-zone');
        expect(workspacePanelSource).toContain('className="react-authoring-panel-warning" role="status"');
        expect(workspacePanelSource).toContain('disabled={isActionPending}');
        expect(workspacePanelSource).toContain('{!isCreateMode ? (');
        expect(scriptSource).toContain('function getCharacterAuthoringReactCommands()');
        expect(scriptSource).toContain('function getGroupAuthoringReactCommands()');
        expect(scriptSource).toContain('saveCharacterAuthoring: payload => saveCharacterAuthoringFromPayload(payload)');
        expect(scriptSource).toContain('saveGroupAuthoring: payload => applyGroupAuthoringSaveModel(payload)');
        expect(scriptSource).toContain('function applyCharacterAuthoringSaveModel');
        expect(scriptSource).toContain('async function saveCharacterAuthoringFromPayload');
        expect(scriptSource).toContain('buildCharacterAuthoringFormData');
        expect(scriptSource).toContain('getCharacterAuthoringWriteUrl');
        expect(scriptSource).not.toContain('function waitForCharacterAuthoringSaveCompletion');
        expect(scriptSource).not.toContain('Timed out waiting for legacy character authoring save to complete');
        const characterSaveSource = scriptSource.match(/async function saveCharacterAuthoringFromPayload\(saveModel = \{\}\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(characterSaveSource).not.toBe('');
        expect(characterSaveSource).toContain('buildCharacterAuthoringFormData');
        expect(characterSaveSource).toContain('getCharacterAuthoringWriteUrl');
        expect(characterSaveSource).not.toContain("$('#create_button').trigger('click')");
        expect(characterSaveSource).not.toContain('waitForCharacterAuthoringSaveCompletion');
        expect(scriptSource).toContain('group-chat-feature-removed');
        expect(scriptSource).toContain('function queueReactCharacterAuthoringRemount()');
        expect(scriptSource).toContain("eventSource.on(event_types.CHARACTER_EDITOR_OPENED, () => {");
        expect(scriptSource).toContain('queueReactCharacterAuthoringRemount();');
        expect(scriptSource).toContain('hideLegacyCharacterAuthoringEditor(true);');
        expect(scriptSource).toContain('data-react-authoring-build-error');
        expect(scriptSource).not.toContain('hideLegacyCharacterAuthoringEditor(Boolean(result?.mounted));');
        expect(scriptSource.match(/openWorkspaceShellCharacterAuthoring\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').toContain("select_selected_character(this_chid, { switchMenu: false });");
        expect(scriptSource).toContain('deleteAuthoring: () => {');
        expect(scriptSource).toContain("import { unmountReactWorkspacePanel } from './scripts/workspace-panels-react-bridge.js';");
        expect(workspacePanelSource).not.toContain("action: 'openGroupChats'");
        // group-only cancel short-circuit retired with group authoring product surface
        expect(workspacePanelSource).toContain('void commands?.cancelAuthoring?.(kind);');
    });

    test('keeps authoring action hierarchy and narrow member rows visible in CSS', () => {
        const styleSource = read('public/style.css');

        expect(styleSource).toContain('.react-authoring-panel-actions .react-authoring-save');
        expect(styleSource).toContain('.react-authoring-panel-actions .react-authoring-secondary-action');
        expect(styleSource).toContain('.react-authoring-panel-actions .react-authoring-tool-action');
        expect(styleSource).toContain('.react-authoring-candidates');
        expect(styleSource).toContain('grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));');
        expect(styleSource).toContain('max-height: min(220px, 34dvh);');
        expect(styleSource).toContain('max-height: min(180px, 28dvh);');
        expect(styleSource).toContain('filter: grayscale(0.35);');
        expect(styleSource).toContain('position: sticky;');
        expect(styleSource).toContain('bottom: 0;');
        expect(styleSource).toContain('.react-authoring-member-row:first-of-type');
        expect(styleSource).toContain('.react-authoring-member-row .menu_button');
        expect(styleSource).toContain('min-height: 38px;');
        expect(styleSource).toContain('width: 100%;');
    });

    test('routes quiet/background requests through the generation service without owner markers', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('createGenerationCommand({');
        expect(scriptSource).toContain('createQuietGenerationLifecycleContract');
        expect(scriptSource).toContain('function getMainChatQuietTransportStore()');
        expect(scriptSource).toContain('function getMainChatQuietTransportBridgeState()');
        expect(scriptSource).toContain('rememberMainChatQuietTransportSnapshot({');
        expect(scriptSource).toContain('phase: \'running\'');
        expect(scriptSource).toContain('phase: \'completed\'');
        expect(scriptSource).toContain('phase: isMainChatQuietTransportStopException(error) ? \'stopped\' : \'error\'');
        expect(scriptSource).toContain('quietTransport: getMainChatQuietTransportBridgeState()');

        expect(workspacePanelSource).not.toContain('data-main-chat-quiet-transport-');
        expect(workspacePanelSource).not.toContain('MainChatQuietTransportState');
        expect(workspacePanelSource).not.toContain('mainChatQuietTransportSchema');
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
        expect(importModule).toHaveBeenCalledWith(expect.stringMatching(/^\/react\/login\/assets\/workspace-panels\.js\?v=.+/));

        const failingLoader = createWorkspacePanelsModuleLoader(importModule);
        await expect(failingLoader()).rejects.toThrow('missing bundle');
        await expect(failingLoader()).resolves.toBe(importedModule);
    });

    test('mounts enabled panels and returns structured results for fallback and success', async () => {
        const container = { nodeType: 1 };
        const panelModule = { mountWorkspacePanel: jest.fn() };
        const onError = jest.fn();

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container,
            features: { reactPanels: { worldInfo: false } },
            loadModule: async () => panelModule,
            onError,
        })).resolves.toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED));

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container: null,
            features: { reactPanels: { worldInfo: true } },
            loadModule: async () => panelModule,
            onError,
        })).resolves.toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MISSING_CONTAINER));

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container,
            features: { reactPanels: { worldInfo: true } },
            loadModule: async () => {
                throw new Error('chunk missing');
            },
            onError,
        })).resolves.toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.BUNDLE_LOAD_FAILED));
        expect(onError).toHaveBeenCalledWith(expect.any(Error), 'worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.BUNDLE_LOAD_FAILED);

        await expect(mountReactWorkspacePanel({
            kind: 'backgroundLibrary',
            container,
            features: { reactPanels: { backgroundLibrary: true } },
            loadModule: async () => ({
                mountWorkspacePanel() {
                    throw new Error('mount exploded');
                },
            }),
            onError,
        })).resolves.toEqual(createWorkspacePanelFallbackResult('backgroundLibrary', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MOUNT_FAILED));
        expect(onError).toHaveBeenCalledWith(expect.any(Error), 'backgroundLibrary', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MOUNT_FAILED);

        await expect(mountReactWorkspacePanel({
            kind: 'worldInfo',
            container,
            state: { selectorsSeparated: true },
            features: { reactPanels: { worldInfo: true } },
            loadModule: async () => panelModule,
            onError,
        })).resolves.toEqual(createWorkspacePanelMountedResult('worldInfo'));
        expect(panelModule.mountWorkspacePanel).toHaveBeenCalledWith('worldInfo', container, expect.objectContaining({ state: { selectorsSeparated: true } }));
    });

    test('mounts workspace panel hosts only when the guarded flag stays enabled and forwards disabled cleanup', async () => {
        const ensureContainer = jest.fn(() => ({ nodeType: 1 }));
        const getState = jest.fn(() => ({ ready: true }));
        const commands = { refreshWorld: jest.fn() };
        const onDisabled = jest.fn();

        await expect(mountWorkspacePanelHost({
            kind: 'worldInfo',
            ensureContainer,
            getState,
            commands,
            features: { reactPanels: { worldInfo: false } },
            onDisabled,
        })).resolves.toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED));

        expect(onDisabled).toHaveBeenCalledTimes(1);
        expect(ensureContainer).not.toHaveBeenCalled();
        expect(getState).not.toHaveBeenCalled();
    });

    test('keeps workspace panel host fallback conservative when the container is missing', async () => {
        const ensureContainer = jest.fn(() => null);
        const getState = jest.fn(() => ({ ready: true }));

        await expect(mountWorkspacePanelHost({
            kind: 'worldInfo',
            ensureContainer,
            getState,
            features: { reactPanels: { worldInfo: true } },
        })).resolves.toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MISSING_CONTAINER));

        expect(ensureContainer).toHaveBeenCalledTimes(1);
        expect(getState).not.toHaveBeenCalled();
    });

    test('decides workspace panel host mounting from plain state without touching DOM', () => {
        expect(decideWorkspacePanelHostLifecycle({
            kind: 'worldInfo',
            features: { reactPanels: { worldInfo: true } },
            hasContainer: true,
        })).toEqual(createWorkspacePanelMountedResult('worldInfo'));

        expect(decideWorkspacePanelHostLifecycle({
            kind: 'worldInfo',
            features: { reactPanels: { worldInfo: false } },
            hasContainer: true,
        })).toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED));

        expect(decideWorkspacePanelHostLifecycle({
            kind: 'worldInfo',
            features: { reactPanels: { worldInfo: true } },
            hasContainer: false,
        })).toEqual(createWorkspacePanelFallbackResult('worldInfo', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MISSING_CONTAINER));

        expect(decideWorkspacePanelHostLifecycle({
            kind: 'worldInfo',
            features: { reactPanels: { worldInfo: true } },
            hasContainer: true,
        })).toEqual(createWorkspacePanelMountedResult('worldInfo'));

        expect(decideWorkspacePanelHostLifecycle({
            kind: 'unknownPanel',
            features: { reactPanels: { worldInfo: true } },
            hasContainer: true,
        })).toEqual(createWorkspacePanelFallbackResult('unknownPanel', WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED));
    });

    test('remounts named workspace commands after command settle based on command result', async () => {
        const remount = jest.fn();
        const first = jest.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const second = first;
        const commands = createWorkspacePanelCommandPort({
            commands: { first, second },
            remount,
            shouldRemount(commandResult) {
                return commandResult !== false;
            },
        });

        await expect(commands.first()).resolves.toBe(true);
        await expect(commands.second()).resolves.toBe(false);

        expect(first).toHaveBeenNthCalledWith(1);
        expect(first).toHaveBeenNthCalledWith(2);
        expect(remount).toHaveBeenCalledTimes(1);
    });

    test('normalizes workspace panel state-change events into remount overrides', () => {
        const remount = jest.fn();
        const handleStateChange = createWorkspacePanelStateChangeHandler(remount);

        handleStateChange(new CustomEvent('emberdesk:test', { detail: { refreshQueued: true } }));
        handleStateChange(new Event('emberdesk:test'));

        expect(remount).toHaveBeenNthCalledWith(1, { refreshQueued: true });
        expect(remount).toHaveBeenNthCalledWith(2, {});
    });

    test('routes workspace panel host lifecycle through a shared host controller seam', () => {
        const scriptSource = read('public/script.js');
        const hostControllerSource = read('public/scripts/workspace-panel-host-controller.js');

        expect(scriptSource).toContain("from './scripts/workspace-panel-host-controller.js'");
        expect(scriptSource).toContain('mountWorkspacePanelHost({');
        expect(scriptSource).toContain('createWorkspacePanelCommandPort({');
        expect(scriptSource).toContain('createWorkspacePanelStateChangeHandler(');
        expect(scriptSource).toContain('initWorkspacePanelDrawerBridge({');
        expect(scriptSource).toContain("kind: 'worldInfo'");
        expect(scriptSource).toContain("kind: 'backgroundLibrary'");
        expect(scriptSource).toContain("kind: 'extensionsHost'");
        expect(scriptSource).toContain("kind: 'mainChatMessageList'");
        expect(scriptSource).toContain("kind: 'characterAuthoring'");
        expect(scriptSource).toContain('group-chat-feature-removed');

        expect(hostControllerSource).toContain('export async function mountWorkspacePanelHost({');
        expect(hostControllerSource).toContain('export function createWorkspacePanelCommandPort({');
        expect(hostControllerSource).toContain('export function createWorkspacePanelStateChangeHandler(remount)');
        expect(hostControllerSource).toContain('export function initWorkspacePanelDrawerBridge({');
        expect(hostControllerSource).toContain('return Object.fromEntries(Object.entries(commands).map(([commandName, command]) => [');
        expect(hostControllerSource).toContain('if (shouldRemount(commandResult, commandName, args)) {');
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
        expect(workspacePanelSource).toContain('getWorkspacePanelVisibleStatusLabel(status)');
        expect(workspacePanelSource).toContain('data-workspace-panel-recovery-state={status}');
        expect(workspacePanelSource).toContain('data-workspace-panel-recovery-action={action.id}');
        expect(workspacePanelSource).toContain('className="workspace-panel-diagnostics"');
        expect(workspacePanelSource).toContain('<summary>Diagnostics</summary>');
        expect(workspacePanelSource).toContain('data-workspace-legacy-slot={slot.id}');
        expect(workspacePanelSource).toContain('slot.id === \'extensions-settings\'');
        expect(workspacePanelSource).not.toContain('React workspace panel host');
        expect(workspacePanelSource).not.toContain('is ready for its legacy bridge');
        expect(workspacePanelSource).not.toContain('id="extensions_settings"');
        expect(workspacePanelSource).not.toContain('id="regex_container"');
    });

    test('wires World Info deferred replay to an independent React host with legacy editor/import state', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('mountWorkspacePanelHost');
        expect(scriptSource).toContain('const WORLD_INFO_REACT_HOST_ID = \'emberdesk-react-world-info-panel-host\';');
        expect(scriptSource).toContain('function ensureWorldInfoReactHost()');
        expect(scriptSource).toContain('function hideLegacyWorldInfoWorkbench(hidden');
        expect(scriptSource).toContain('// Sole-owner: React host owns the workbench; legacy editor stays hidden/inert.');
        expect(scriptSource).toContain('function getWorldInfoReactBridgeState(');
        expect(scriptSource).toContain('globalSelectorPresent: Boolean(globalSelector)');
        expect(scriptSource).toContain('editorSelectorPresent: Boolean(editorSelector)');
        expect(scriptSource).toContain('selectorsSeparated: Boolean(globalSelector && editorSelector && globalSelector !== editorSelector)');
        expect(scriptSource).toContain('importBusy: importMenuItem?.getAttribute(\'aria-disabled\') === \'true\' || importFileInput?.disabled === true');
        expect(scriptSource).toContain('dropTargetPresent: Boolean(worldPopup)');
        expect(scriptSource).toContain('async function mountReactWorldInfoPanel()');
        expect(scriptSource).toContain('const result = await mountWorkspacePanelHost({');
        expect(scriptSource).toContain('kind: \'worldInfo\'');
        expect(scriptSource).toContain('getState: () => getWorldInfoReactBridgeStateAsync()');
        expect(scriptSource).toContain('void mountReactWorldInfoPanel();');
        const worldInfoReplayHook = scriptSource.match(/function _replayWorldInfoSettings\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(worldInfoReplayHook).toContain('initWorldInfo();');
        expect(worldInfoReplayHook).toContain('rehydrateWorldInfoPanel({ resetEmptyEditor: false });');
        expect(worldInfoReplayHook).not.toContain('mountReactWorldInfoPanel();');
        expect(scriptSource).not.toContain('mountReactWorkspacePanel({\n        kind: \'worldInfo\',\n        container: document.getElementById(\'world_popup\')');

        expect(workspacePanelSource).toContain('function WorldInfoWorkspacePanel');
        expect(workspacePanelSource).toContain('WorldInfoWorkbenchPanel');
        expect(workspacePanelSource).toContain('kind="worldInfo"');
        expect(read('app/world-info-workbench.tsx')).toContain('export interface WorldInfoWorkspacePanelState');
        expect(workspacePanelSource).toContain("{ id: 'global-selector', label: 'Global selector', ready: bridgeState.globalSelectorPresent }");
        expect(workspacePanelSource).toContain("{ id: 'editor-selector', label: 'Editor selector', ready: Boolean(bridgeState.editorSelectorPresent && bridgeState.selectorsSeparated) }");
        expect(workspacePanelSource).toContain("{ id: 'import-controls', label: 'Import controls', ready: bridgeState.importMenuPresent }");
        expect(workspacePanelSource).toContain("{ id: 'legacy-editor', label: 'Legacy editor', ready: bridgeState.dropTargetPresent }");
        expect(workspacePanelSource).not.toContain('data-world-info-bridge-state={stateId}');
        expect(workspacePanelSource).toContain('legacyBoundary="activation-import-regex-prompt-delete"');
    });

    test('renders a World Info editor/import/export workflow through React-owned controls and explicit world-info helpers', () => {
        const scriptSource = read('public/script.js');
        const bridgeSource = read('public/scripts/workspace-panels-react-bridge.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const worldInfoSource = read('public/scripts/world-info.js');

        expect(scriptSource).toContain('function getWorldInfoReactCommands()');
        expect(scriptSource).toContain('worldNames: getWorldInfoReactWorldNames(editorSelector)');
        expect(scriptSource).toContain('selectedWorldName: getWorldInfoReactSelectedWorldName(editorSelector)');
        expect(scriptSource).toContain('getWorldInfoWorkbenchFacadeSnapshot');
        expect(scriptSource).toContain('searchQuery: worldInfoSearch?.value ?? \'\'');
        expect(scriptSource).toContain('sortOptions: getWorldInfoReactSortOptions(worldInfoSortOrder)');
        expect(scriptSource).toContain('applyWorldInfoSearchQuery');
        expect(scriptSource).toContain('applyWorldInfoSortOption');
        expect(scriptSource).toContain('selectWorldInfoEditorIndex');
        expect(scriptSource).toContain('requestWorldInfoImportSelection');
        expect(scriptSource).toContain('exportCurrentWorldInfo');
        expect(scriptSource).toContain('refreshCurrentWorldInfoEditor');
        expect(scriptSource).toContain('openWorldInfoEntryByUid');
        expect(scriptSource).toContain('renameCurrentWorldInfo');
        expect(scriptSource).toContain('duplicateCurrentWorldInfo');
        expect(scriptSource).toContain('deleteCurrentWorldInfo');
        expect(scriptSource).toContain('applySearchQuery: searchQuery => applyWorldInfoSearchQuery(searchQuery)');
        expect(scriptSource).toContain('importWorld: () => requestWorldInfoImportSelection()');
        expect(scriptSource).toContain('exportWorld: () => exportCurrentWorldInfo()');
        expect(scriptSource).toContain('void mountReactWorldInfoPanel();');
        expect(scriptSource).toContain('commands: getWorldInfoReactCommands()');
        expect(scriptSource).toContain('eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED');
        expect(scriptSource).not.toContain('$(\'#world_info_search\').val(String(payload?.searchQuery ?? \'\')).trigger(\'input\');');
        expect(scriptSource).not.toContain('$(\'#world_info_sort_order\').val(String(payload?.sortValue ?? \'\')).trigger(\'change\');');
        expect(scriptSource).not.toContain('$(\'#world_editor_select\').val(String(payload?.worldIndex ?? \'\')).trigger(\'change\');');
        expect(scriptSource).not.toContain('document.getElementById(\'world_import_menu_item\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'world_export_menu_item\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'world_refresh\')?.click();');
        expect(scriptSource).not.toContain('entry?.querySelector(\'.wi-card-expand-button\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'world_rename_menu_item\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'world_duplicate_menu_item\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'world_delete_menu_item\')?.click();');

        expect(bridgeSource).toContain('commands,');
        expect(bridgeSource).toContain('panelModule.mountWorkspacePanel(kind, container, { state, commands, runtime });');

        expect(worldInfoSource).toContain('export async function selectWorldInfoEditorIndex(worldIndex)');
        expect(worldInfoSource).toContain('export function applyWorldInfoSearchQuery(searchQuery)');
        expect(worldInfoSource).toContain('export function applyWorldInfoSortOption(sortValue)');
        expect(worldInfoSource).toContain('export async function createWorldInfoEntryFromEditor()');
        expect(worldInfoSource).toContain('export async function promptToCreateWorldInfo()');
        expect(worldInfoSource).toContain('export function requestWorldInfoImportSelection()');
        expect(worldInfoSource).toContain('export async function exportCurrentWorldInfo()');
        expect(worldInfoSource).toContain('export function refreshCurrentWorldInfoEditor()');
        expect(worldInfoSource).toContain('export async function openWorldInfoEntryByUid(uid)');
        expect(worldInfoSource).toContain('export async function renameCurrentWorldInfo()');
        expect(worldInfoSource).toContain('export async function duplicateCurrentWorldInfo()');
        expect(worldInfoSource).toContain('export async function deleteCurrentWorldInfo()');

        expect(workspacePanelSource).toContain('import { useForm } from \'@tanstack/react-form\';');
        expect(workspacePanelSource).toContain('import { z } from \'zod\';');
        expect(read('app/world-info-workbench.tsx')).toContain('const worldInfoPanelFormSchema = z.object(');
        const worldInfoWorkbenchHelpersSource = read('app/lib/world-info-workbench-helpers.ts');
        expect(worldInfoWorkbenchHelpersSource).toContain('export function buildWorldInfoPanelFormDefaults');
        expect(worldInfoWorkbenchHelpersSource).toContain('export function getWorldInfoPanelStatus');
        expect(read('app/world-info-workbench.tsx')).toContain('const worldInfoCommandMutation = useMutation({');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-control="world-select"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-control="search"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-control="sort"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-action="import"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-action="export"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-entry={entry.uid}');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-entry={entry.uid}');
        expect(workspacePanelSource).toContain('className="workspace-panel-item-label"');
        expect(workspacePanelSource).toContain('className="workspace-panel-item-status"');
        expect(read('app/world-info-workbench.tsx')).toContain('commands.importWorld()');
        expect(read('app/world-info-workbench.tsx')).toContain('commands.exportWorld()');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-workflow="workbench"');
        expect(read('public/css/world-info.css')).toContain('.wi-workbench-body');

        const styleSource = read('public/style.css');
        expect(styleSource).toContain('.workspace-panel-item-row.menu_button');
        expect(styleSource).toContain('width: 100%;');
        expect(styleSource).toContain('overflow-wrap: anywhere;');
        expect(styleSource).toContain('white-space: nowrap;');
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
        expect(scriptSource).toContain('getBackgroundLibraryPanelStatus as getBackgroundPanelState');
        expect(scriptSource).toContain('async function mountReactBackgroundLibraryPanel(');
        expect(scriptSource).toContain('function hideLegacyBackgroundGallery(');
        expect(scriptSource).toContain("dataset.backgroundLibraryVisibleOwner = hidden ? 'react' : 'legacy'");
        expect(scriptSource).toContain("'#bg-header-fixed'");
        expect(scriptSource).toContain("data-doc-id', 'feature.background_library_panel'");
        expect(scriptSource).toContain('kind: \'backgroundLibrary\'');
        expect(scriptSource).toContain('getState: overrides => getBackgroundLibraryReactBridgeState(overrides ?? stateOverrides)');
        expect(scriptSource).toContain('const handleReactBackgroundLibraryStateChange = createWorkspacePanelStateChangeHandler(');
        expect(scriptSource).toContain('initWorkspacePanelDrawerBridge({');
        expect(scriptSource).toContain('void mountReactBackgroundLibraryPanel(stateOverrides);');

        expect(backgroundsSource).toContain('function dispatchBackgroundLibraryStateChange(detail = {})');
        expect(backgroundsSource).toContain('document.dispatchEvent(new CustomEvent(\'emberdesk:background-library-state-change\'');
        expect(backgroundsSource).toContain('dispatchBackgroundLibraryStateChange({ isLoading });');

        expect(workspacePanelSource).toContain('interface BackgroundLibraryWorkspacePanelState');
        expect(workspacePanelSource).toContain('function BackgroundLibraryWorkspacePanel');
        expect(workspacePanelSource).toContain('title="背景"');
        expect(workspacePanelSource).toContain('className="workspace-panel-background-preview"');
        expect(workspacePanelSource).toContain('style={{ backgroundImage: item.url }}');
        expect(workspacePanelSource).toContain('kind="backgroundLibrary"');
        expect(workspacePanelSource).toContain("{ id: 'global-gallery', label: 'Global gallery', ready: bridgeState.systemContainerPresent }");
        expect(workspacePanelSource).toContain("{ id: 'chat-gallery', label: 'Chat gallery', ready: bridgeState.chatContainerPresent }");
        expect(workspacePanelSource).not.toContain('data-background-library-bridge-state="status"');
        expect(workspacePanelSource).toContain('legacyBoundary="service-owned-catalog-actions"');
        expect(scriptSource).toContain('enterFolder: folderId => enterBackgroundLibraryFolder(folderId)');
        expect(scriptSource).toContain('exitFolder: () => exitBackgroundLibraryFolder()');
        expect(backgroundsSource).toContain('export function enterBackgroundLibraryFolder');
        expect(backgroundsSource).toContain('export function exitBackgroundLibraryFolder');
        expect(workspacePanelSource).toContain('data-background-library-react-action="exit-folder"');
        expect(workspacePanelSource).toContain('data-background-library-react-folders="root"');

        expect(workspacePanelSource).toContain("{ id: 'background-actions', label: 'Background actions', ready: bridgeState.systemContainerPresent || bridgeState.chatContainerPresent }");
    });

    test('renders a Background Library gallery workflow through React-owned filters and explicit background helpers', () => {
        const scriptSource = read('public/script.js');
        const backgroundsSource = read('public/scripts/backgrounds.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function getBackgroundLibraryReactCommands()');
        expect(scriptSource).toContain('systemBackgrounds: getBackgroundLibraryReactGalleryItems(systemContainer)');
        expect(scriptSource).toContain('chatBackgrounds: getBackgroundLibraryReactGalleryItems(chatContainer)');
        expect(scriptSource).toContain('sortValue: backgroundSort?.value ?? \'\'');
        expect(scriptSource).toContain('folderViewActive: document.getElementById(\'Backgrounds\')?.classList.contains(\'in-folder-view\') === true');
        expect(scriptSource).toContain('applyBackgroundLibraryFilter');
        expect(scriptSource).toContain('applyBackgroundLibrarySort');
        expect(scriptSource).toContain('requestBackgroundUploadSelection');
        expect(scriptSource).toContain('selectBackgroundLibraryItem');
        expect(scriptSource).toContain('lockCurrentBackground');
        expect(scriptSource).toContain('unlockCurrentBackground');
        expect(scriptSource).toContain('runAutoBackgroundSelection');
        expect(scriptSource).toContain('refreshBackgroundLibrary');
        expect(scriptSource).toContain('applyBackgroundFilter: filterQuery => applyBackgroundLibraryFilter(filterQuery)');
        expect(scriptSource).toContain('applyBackgroundSort: sortValue => applyBackgroundLibrarySort(sortValue)');
        expect(scriptSource).toContain('uploadBackground: source => requestBackgroundUploadSelection(source)');
        expect(scriptSource).toContain('selectBackground: (id, source) => selectBackgroundLibraryItem(id, source)');
        expect(scriptSource).toContain('void mountReactBackgroundLibraryPanel({ refreshQueued: false });');
        expect(scriptSource).toContain('commands: getBackgroundLibraryReactCommands()');
        expect(scriptSource).not.toContain('$(\'#bg-filter\').val(String(payload?.filterQuery ?? \'\')).trigger(\'input\');');
        expect(scriptSource).not.toContain('$(\'#bg-sort\').val(String(payload?.sortValue ?? \'\')).trigger(\'change\');');
        expect(scriptSource).not.toContain('document.getElementById(\'add_bg_button\')?.click();');
        expect(scriptSource).not.toContain('backgroundElement?.click();');
        expect(scriptSource).not.toContain('const lockControl = document.querySelector(\'.bg_example.selected-background .jg-lock\') ?? document.querySelector(\'.bg_example .jg-lock\');');
        expect(scriptSource).not.toContain('const unlockControl = document.querySelector(\'.bg_example.locked-background .jg-unlock\') ?? document.querySelector(\'.bg_example .jg-unlock\');');

        expect(backgroundsSource).toContain('function syncBackgroundLibraryReactState(detail = {})');
        expect(backgroundsSource).toContain('function applyBackgroundSelection(target, { respectGroupSelectionMode = true, shiftKey = false } = {})');
        expect(backgroundsSource).toContain('if (respectGroupSelectionMode && isBackgroundSelectionMode && !isCustom) {');
        expect(backgroundsSource).toContain('syncBackgroundLibraryReactState();');
        expect(backgroundsSource).toContain('export function applyBackgroundLibraryFilter(filterQuery)');
        expect(backgroundsSource).toContain('export function applyBackgroundLibrarySort(sortValue)');
        expect(backgroundsSource).toContain("export function requestBackgroundUploadSelection(source = 'global')");
        expect(backgroundsSource).toContain('export async function selectBackgroundLibraryItem(backgroundId, source)');
        expect(backgroundsSource).toContain('export function lockCurrentBackground()');
        expect(backgroundsSource).toContain('export function unlockCurrentBackground()');
        expect(backgroundsSource).toContain('export async function runAutoBackgroundSelection()');
        expect(backgroundsSource).toContain('export async function refreshBackgroundLibrary()');
        expect(backgroundsSource).toContain('await ensureBackgroundLibrarySession().selectBackground(');
        expect(backgroundsSource).not.toContain('const candidates = normalizedSource === \'chat\'');
        expect(backgroundsSource).toContain('onLockBackgroundClick();');
        expect(backgroundsSource).toContain('onUnlockBackgroundClick();');
        expect(backgroundsSource).toContain('return applyBackgroundSelection(option.element, { respectGroupSelectionMode: false })');
        expect(backgroundsSource).toContain('return applyBackgroundSelection(bestMatch[0].item.element, { respectGroupSelectionMode: false })');
        expect(backgroundsSource).not.toContain('option.element.click();');
        expect(backgroundsSource).not.toContain('bestMatch[0].item.element.click();');

        expect(workspacePanelSource).toContain('const backgroundLibraryPanelFormSchema = z.object(');
        expect(workspacePanelSource).toContain('function buildBackgroundLibraryPanelFormDefaults');
        expect(workspacePanelSource).toContain('const backgroundLibraryCommandMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-background-library-react-control="filter"');
        expect(workspacePanelSource).toContain('data-background-library-react-control="sort"');
        expect(workspacePanelSource).not.toContain('data-background-library-react-action="upload"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="lock"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="unlock"');
        expect(workspacePanelSource).toContain('data-background-library-react-gallery={source}');
        expect(workspacePanelSource).toContain('<BackgroundGallery source="global" items={systemBackgrounds} commands={commands} />');
        expect(workspacePanelSource).toContain('<BackgroundGallery source="chat" items={chatBackgrounds} commands={commands} />');
        expect(workspacePanelSource).toContain('className="workspace-panel-background-item"');
        expect(workspacePanelSource).toContain('className="workspace-panel-background-details"');
        expect(workspacePanelSource).toContain('data-background-library-react-item={item.id}');
        expect(workspacePanelSource).toContain("commands?.uploadBackground('global')");
        expect(workspacePanelSource).toContain("commands?.uploadBackground('chat')");
        expect(workspacePanelSource).toContain('data-background-library-react-action="upload-global"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="upload-chat"');
        expect(scriptSource).toContain('uploadBackground: source => requestBackgroundUploadSelection(source)');
        expect(workspacePanelSource).toContain('commands?.lockBackground()');
        expect(workspacePanelSource).toContain('commands?.unlockBackground()');
        expect(scriptSource).toContain('getBackgroundLibraryServicePanelState');
        expect(scriptSource).toContain('renameBackgroundLibraryItem');
        expect(scriptSource).toContain('deleteBackgroundLibraryItem');
        expect(scriptSource).toContain('renameBackground: (id, nextName, source) => renameBackgroundLibraryItem(id, nextName, source)');
        expect(scriptSource).toContain('deleteBackground: (id, source, deleteFromServer) => deleteBackgroundLibraryItem(id, source, {');
        expect(backgroundsSource).toContain('export async function renameBackgroundLibraryItem');
        expect(backgroundsSource).toContain('export async function deleteBackgroundLibraryItem');
        expect(backgroundsSource).toContain('ensureBackgroundLibrarySession().applyFilter');
        expect(backgroundsSource).toContain('ensureBackgroundLibrarySession().applySort');
        expect(backgroundsSource).toContain('ensureBackgroundLibrarySession().selectBackground');
        expect(workspacePanelSource).toContain('data-background-library-react-item-action="rename"');
        expect(workspacePanelSource).toContain('data-background-library-react-item-action="delete"');
        expect(workspacePanelSource).toContain('commands?.renameBackground(item.id, nextName, source)');
        expect(workspacePanelSource).toContain('commands?.deleteBackground(item.id, source, source === \'chat\')');
        expect(workspacePanelSource).toContain('legacyBoundary="service-owned-catalog-actions"');
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
        expect(scriptSource).toContain('function hideLegacyExtensionsHostControls(');
        expect(scriptSource).toContain("dataset.extensionsHostVisibleOwner = hidden ? 'react' : 'legacy'");
        expect(scriptSource).toContain('hideLegacyExtensionsHostControls(true)');
        expect(scriptSource).toContain('const result = await mountWorkspacePanelHost({');
        expect(scriptSource).toContain('kind: \'extensionsHost\'');
        expect(scriptSource).toContain('getState: overrides => getExtensionsHostReactBridgeState(overrides ?? stateOverrides)');
        expect(scriptSource).toContain('const handleReactExtensionsHostStateChange = createWorkspacePanelStateChangeHandler(');
        expect(scriptSource).toContain('initWorkspacePanelDrawerBridge({');
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
        expect(workspacePanelSource).toContain("{ id: 'extensions-settings', label: 'Settings column', ready: bridgeState.extensionsSettingsPresent }");
        expect(workspacePanelSource).toContain("{ id: 'extensions-settings2', label: 'Settings column 2', ready: bridgeState.extensionsSettings2Present }");
        expect(workspacePanelSource).toContain("{ id: 'regex-container', label: 'Regex container', ready: bridgeState.regexContainerPresent }");
        expect(workspacePanelSource).toContain("{ id: 'extensions-menu-button', label: 'Wand button', ready: bridgeState.extensionsMenuButtonPresent }");
        expect(workspacePanelSource).toContain("{ id: 'extensions-menu', label: 'Wand menu', ready: bridgeState.extensionsMenuPresent }");
        expect(workspacePanelSource).toContain("{ id: 'extras-api', label: 'Extras API', ready: bridgeState.extrasApiControlsPresent }");
        expect(workspacePanelSource).not.toContain('data-extensions-host-bridge-state={stateId}');
        expect(workspacePanelSource).toContain('legacyBoundary="react-owned-slots-lifecycle"');
        // Lifecycle marker only; protected mount nodes stay outside React JSX.
        expect(workspacePanelSource).toContain('data-extensions-host-react-workflow="compatibility-slots"');
        expect(workspacePanelSource).toContain('data-extensions-host-compat-owner="react-lifecycle"');
        expect(workspacePanelSource).not.toContain('data-extensions-host-compat-slot="extensions_settings"');
        expect(workspacePanelSource).toContain('ensureExtensionCompatibilitySlots');
        expect(workspacePanelSource).not.toContain('id="extensions_settings"');
    });

    
    test('extension operation failure feedback distinguishes retryable, user-action, and forbidden classes', () => {
        const extensionsSource = read('public/scripts/extensions.js');
        expect(extensionsSource).toContain('async function readExtensionOperationError(response)');
        expect(extensionsSource).toContain('function notifyExtensionOperationFailure(error, title)');
        expect(extensionsSource).toContain("failureClass === 'user_action_required'");
        expect(extensionsSource).toContain("failureClass === 'forbidden'");
        expect(extensionsSource).toContain("failureClass === 'retryable'");
        expect(extensionsSource).toContain('notifyExtensionOperationFailure(error, t`Extension update failed`)');
        expect(extensionsSource).toContain('if (!quiet) {');
        expect(extensionsSource).toContain('// Auto-update runs in quiet mode');
        expect(extensionsSource).toContain('await callExtensionHook(fullExtensionName, \'update\');\n            if (!quiet) {\n                toastr.success');
        expect(extensionsSource).toContain('const actionHintMessages = {');
        expect(extensionsSource).toContain('commit_or_stash_local_changes: t`Commit or stash your local changes.`');
        expect(extensionsSource).toContain("error.actionHints.map(hint => actionHintMessages[hint]).filter(Boolean)");
        expect(extensionsSource).not.toContain("error.actionHints.join(', ')");
        expect(extensionsSource).toContain('notifyExtensionOperationFailure(error, t`Extension installation failed`)');
        expect(extensionsSource).toContain('notifyExtensionOperationFailure(error, t`Extension delete failed`)');
        expect(extensionsSource).toContain('notifyExtensionOperationFailure(error, t`Extension move failed`)');
        expect(extensionsSource).toContain('notifyExtensionOperationFailure(error, t`Extension branch switch failed`)');
        // Protected mount points remain established.
        expect(extensionsSource).toContain("$('#extensions_settings')");
        expect(extensionsSource).toContain("$('#extensionsMenuButton')");
        expect(extensionsSource).toContain("$('#extensionsMenu')");
    });

test('renders an Extensions Host workflow through React-owned controls and explicit extensions helpers', () => {
        const scriptSource = read('public/script.js');
        const extensionsSource = read('public/scripts/extensions.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function getExtensionsHostReactCommands()');
        expect(scriptSource).toContain('notifyUpdatesEnabled: document.getElementById(\'extensions_notify_updates\')?.checked === true');
        expect(scriptSource).toContain('extrasApiUrl: extensionsUrl?.value ?? \'\'');
        expect(scriptSource).toContain('extrasApiKeySet: Boolean(extensionsApiKey?.value)');
        expect(scriptSource).toContain('autoconnectEnabled: extensionsAutoconnect?.checked === true');
        expect(scriptSource).toContain('extrasStatusText: extensionsStatus?.textContent?.trim() ?? \'\'');
        expect(scriptSource).toContain('mountPointStatuses: getExtensionsHostReactMountPointStatuses()');
        expect(scriptSource).toContain('toggleExtensionsHostNotifyUpdates');
        expect(scriptSource).toContain('openExtensionsHostManager');
        expect(scriptSource).toContain('openExtensionsHostInstaller');
        expect(scriptSource).toContain('updateExtensionsHostApiUrl');
        expect(scriptSource).toContain('updateExtensionsHostApiKey');
        expect(scriptSource).toContain('connectExtensionsHostApi');
        expect(scriptSource).toContain('setExtensionsHostAutoconnectEnabled');
        expect(scriptSource).toContain('toggleNotifyUpdates: () => toggleExtensionsHostNotifyUpdates()');
        expect(scriptSource).toContain('openManageExtensions: () => openExtensionsHostManager()');
        expect(scriptSource).toContain('openInstallExtension: () => openExtensionsHostInstaller()');
        expect(scriptSource).toContain('updateExtrasApiUrl: url => {');
        expect(scriptSource).toContain('updateExtrasApiKey: apiKey => {');
        expect(scriptSource).toContain('connectExtrasApi: () => connectExtensionsHostApi()');
        expect(scriptSource).toContain('toggleAutoconnect: enabled =>');
        const extensionsHostCommandsSource = scriptSource.match(/function getExtensionsHostReactCommands\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(extensionsHostCommandsSource).toContain('shouldRemount(actionResult, commandName) {');
        expect(extensionsHostCommandsSource).toContain("return commandName !== 'ensureExtensionCompatibilitySlots' && actionResult !== false;");
        expect(scriptSource).toContain('commands: getExtensionsHostReactCommands()');
        expect(scriptSource).not.toContain('document.getElementById(\'extensions_notify_updates\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'extensions_details\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'third_party_extension_button\')?.click();');
        expect(scriptSource).not.toContain('$(\'#extensions_url\').val(String(payload?.url ?? \'\')).trigger(\'input\');');
        expect(scriptSource).not.toContain('$(\'#extensions_api_key\').val(String(payload?.apiKey ?? \'\')).trigger(\'input\');');
        expect(scriptSource).not.toContain('document.getElementById(\'extensions_connect\')?.click();');
        expect(scriptSource).not.toContain('document.getElementById(\'extensions_autoconnect\')?.click();');

        expect(extensionsSource).toContain('function syncExtensionsHostReactState(detail = {})');
        expect(extensionsSource).toContain('export function toggleExtensionsHostNotifyUpdates()');
        expect(extensionsSource).toContain('export async function openExtensionsHostManager()');
        expect(extensionsSource).toContain('export async function openExtensionsHostInstaller()');
        expect(extensionsSource).toContain('export function updateExtensionsHostApiUrl(url)');
        expect(extensionsSource).toContain('export function updateExtensionsHostApiKey(apiKey)');
        expect(extensionsSource).toContain('export async function connectExtensionsHostApi()');
        expect(extensionsSource).toContain('export function setExtensionsHostAutoconnectEnabled(enabled)');
        expect(extensionsSource).toContain('void connectExtensionsHostApi();');
        expect(extensionsSource).toContain('syncExtensionsHostReactState();');

        expect(workspacePanelSource).toContain('const extensionsHostPanelFormSchema = z.object(');
        expect(workspacePanelSource).toContain('function buildExtensionsHostPanelFormDefaults');
        expect(workspacePanelSource).toContain('const extensionsHostCommandMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="notify-updates"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="manage"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="install"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="extras-url"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="extras-api-key"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="autoconnect"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="connect"');
        expect(workspacePanelSource).toContain('data-workspace-legacy-slot={slot.id}');
        expect(workspacePanelSource).not.toContain('data-extensions-host-react-mount-point={mountPoint.id}');
        expect(workspacePanelSource).toContain('commands?.toggleNotifyUpdates()');
        expect(workspacePanelSource).toContain('commands?.openManageExtensions()');
        expect(workspacePanelSource).toContain('commands?.openInstallExtension()');
        expect(workspacePanelSource).toContain('commands?.connectExtrasApi()');
    });

    test('mounts the React main-chat owner directly into #chat', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function ensureMainChatMessageListReactHost()');
        expect(scriptSource).toContain("const chatContainer = document.getElementById('chat');");
        expect(scriptSource).toContain('return chatContainer;');
        expect(scriptSource).toContain('ensureContainer: ensureMainChatMessageListReactHost');
        const mainChatHostSource = scriptSource.match(
            /function ensureMainChatMessageListReactHost\(\) \{[\s\S]*?\n\}/,
        )?.[0] ?? '';
        expect(mainChatHostSource).not.toContain('host.hidden = true;');
        expect(mainChatHostSource).not.toContain("document.createElement('div')");

        expect(workspacePanelSource).toContain('function MainChatMessageListWorkspacePanel');
        expect(workspacePanelSource).not.toContain('LegacyMainChatMessageListWorkspacePanel');
        expect(workspacePanelSource).not.toContain('MainChatMessageListRestoreController');
        expect(workspacePanelSource).not.toContain('createPortal');
        expect(workspacePanelSource).toContain('<MainChatMessageRow');
    });

    test('passes only a typed main-chat snapshot into the React store', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');
        const stateBlock = workspacePanelSource.match(
            /interface MainChatMessageListWorkspacePanelState \{[\s\S]*?\n\}/,
        )?.[0] ?? '';
        const syncBlock = workspacePanelSource.match(
            /function syncMainChatStoreSnapshot\([\s\S]*?\n\}\n\nfunction renderIntoPanel/,
        )?.[0] ?? '';
        const bridgeStateBlock = scriptSource.match(
            /function getMainChatMessageListReactBridgeState\(\) \{[\s\S]*?\n\}\n\nfunction getMainChatMessageListReactCommands/,
        )?.[0] ?? '';

        expect(stateBlock).toContain('mainChatSnapshot?: MainChatSnapshot;');
        expect(stateBlock).not.toMatch(/\bHTMLElement\b|\bmessageNodes\b|\brichBodySnapshots\b|\bmessageActionSnapshots\b/);
        expect(syncBlock).toContain('mainChatStore.getState().replaceSnapshot(mainChatSnapshot);');
        expect(syncBlock).toContain('mainChatStore.getState().reset();');
        expect(bridgeStateBlock).toContain('const mainChatSnapshot = buildMainChatSnapshotFromLegacyChat({');
        expect(bridgeStateBlock).toContain('mainChatSnapshot,');
        expect(bridgeStateBlock).not.toContain('messageNodes');
        expect(bridgeStateBlock).not.toContain('richBodySnapshots');
        expect(bridgeStateBlock).not.toContain('messageActionSnapshots');
    });

    test('renders compatible message rows from store records without DOM reparenting', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const rowSource = read('app/components/main-chat/MainChatMessageRow.tsx');
        const panelBlock = workspacePanelSource.match(
            /function MainChatMessageListWorkspacePanel\([\s\S]*?\n\}\n\nfunction renderPanel/,
        )?.[0] ?? '';

        expect(panelBlock).toContain('mainChatStoreSnapshot.messagesById');
        expect(panelBlock).toContain('key={message.id}');
        expect(panelBlock).toContain('isLast={message.id === messageIds.at(-1)}');
        expect(panelBlock).not.toMatch(/\bHTMLElement\b|\bquerySelector(?:All)?\b|\bmessageNodes\b|innerHTML/);
        expect(rowSource).toContain('className="mes');
        expect(rowSource).toContain('mesid: message.id');
        expect(rowSource).toContain('className="mes_text"');
        expect(rowSource).toContain('data-main-chat-message-row-owner="react"');
        expect(rowSource).toContain('dangerouslySetInnerHTML={{ __html: render.messageHtml }}');
    });

    test('expands only the React window when loading earlier messages', () => {
        const scriptSource = read('public/script.js');
        const loadEarlierBlock = scriptSource.match(
            /export async function loadEarlierChatMessages\([\s\S]*?if \(isReactMainChatOwner\(\)\) \{[\s\S]*?void mountReactMainChatMessageListPanel\(\);\n        return;\n    \}/,
        )?.[0] ?? '';

        expect(scriptSource).toContain('function getMainChatReactVisibleWindow(projectedChat)');
        expect(scriptSource).toContain('const mainChatVisibleStartIndices = new Map();');
        expect(loadEarlierBlock).toContain('mainChatVisibleStartIndices.set(getCurrentChatId(), Math.max(');
        expect(loadEarlierBlock).toContain('await eventSource.emit(event_types.MORE_MESSAGES_LOADED);');
        expect(loadEarlierBlock).not.toContain('updateMessageElement(');
        expect(loadEarlierBlock).not.toContain('messageNodes');
        expect(loadEarlierBlock).not.toContain('chatElement.prepend');
        expect(loadEarlierBlock).not.toContain('firstDisplayedMessage');
    });

    test('world info workbench facade owns snapshot and entry field updates without DOM action bypass', () => {
        const scriptSource = read('public/script.js');
        const worldInfoSource = read('public/scripts/world-info.js');
        const workbenchSource = read('app/world-info-workbench.tsx');
        const hostControllerSource = read('public/scripts/workspace-panel-host-controller.js');

        expect(worldInfoSource).toContain('export async function getWorldInfoWorkbenchFacadeSnapshot');
        expect(worldInfoSource).toContain('worldInfoFilter.applyFilters(entriesArray)');
        expect(worldInfoSource).toContain('sortWorldInfoEntries(entriesArray)');
        expect(scriptSource).toContain("commandName !== 'updateEntryFields' && commandName !== 'toggleActivationRules'");
        expect(scriptSource).toContain('WIMultiSelector');

        expect(worldInfoSource).toContain('export async function updateWorldInfoWorkbenchEntryFields');
        expect(worldInfoSource).toContain('export async function selectWorldInfoWorkbenchEntry');
        expect(worldInfoSource).toContain('vectorized');
        expect(worldInfoSource).toContain('WORLD_INFO_WORKBENCH_EDITABLE_FIELDS');
        expect(scriptSource).toContain('getWorldInfoReactBridgeStateAsync');
        expect(scriptSource).toContain('updateEntryFields: (uid, fields) => updateWorldInfoWorkbenchEntryFields(uid, fields)');
        expect(scriptSource).toContain("clearSelectedEntry: () => selectWorldInfoWorkbenchEntry('')");
        expect(scriptSource).toContain('toggleActivationRules: open => setWorldInfoActivationRulesVisible(open)');
        expect(scriptSource).toContain('setWorldInfoActivationRulesVisible');
        expect(scriptSource).toContain('selectWorldInfoWorkbenchEntry');
        expect(scriptSource).toContain('updateWorldInfoWorkbenchEntryFields');
        expect(scriptSource).not.toContain("document.getElementById('world_import_menu_item')?.click();");
        expect(hostControllerSource).toContain('const resolvedState = await Promise.resolve(getState(stateOverrides));');
        expect(workbenchSource).toContain('data-world-info-react-workflow="workbench"');
        expect(workbenchSource).toContain('data-world-info-react-layout="split"');
        expect(workbenchSource).toContain('data-world-info-react-mobile-view');
        expect(workbenchSource).toContain('返回条目列表');
        expect(workbenchSource).toContain('扫描规则');
        expect(workbenchSource).not.toContain('可向量化');
        expect(workbenchSource).not.toContain('Vectorized');
    });

    test('world info keeps internal panel diagnostics out of the user-visible drawer', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(workspacePanelSource).toContain('hideDiagnostics = false');
        expect(workspacePanelSource).toContain('{!hideDiagnostics && (slots.length > 0 || status !== \'idle\') ? (');
        expect(workspacePanelSource).toContain('hideDiagnostics={true}');
    });

});
