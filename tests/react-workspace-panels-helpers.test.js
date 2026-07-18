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
    createWorkspacePanelActionBridge,
    createWorkspacePanelStateChangeHandler,
    decideWorkspacePanelHostLifecycle,
    mountWorkspacePanelHost,
} from '../public/scripts/workspace-panel-host-controller.js';
import {
    WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS,
    WORKSPACE_SHELL_TAKEOVER_STATUSES,
    decideWorkspaceShellTakeover,
    isReactWorkspaceShellTakeoverEnabled,
} from '../public/scripts/workspace-shell-takeover-contract.js';

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
                groupAuthoring: true,
            },
            reactPages: {
                settings: true,
            },
            reactShell: {
                strict: false,
                takeover: false,
            },
        });

        expect(isReactWorkspacePanelEnabled('worldInfo')).toBe(true);
        expect(isReactWorkspacePanelEnabled('mainChatMessageList')).toBe(true);
        expect(isReactWorkspaceShellTakeoverEnabled()).toBe(false);
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

    test('decides same-entry shell takeover with strict failures separated from production safety fallback', () => {
        expect(WORKSPACE_SHELL_TAKEOVER_STATUSES).toEqual({
            DISABLED: 'disabled',
            FAILED: 'failed',
            READY: 'ready',
            ROLLBACK: 'rollback',
        });
        expect(WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS).toEqual({
            BUNDLE_LOAD_FAILED: 'bundle-load-failed',
            FEATURE_DISABLED: 'feature-disabled',
            INVALID_PAYLOAD: 'invalid-payload',
            MISSING_HOST: 'missing-host',
            MOUNT_FAILED: 'mount-failed',
            ROLLBACK_REQUESTED: 'rollback-requested',
        });

        expect(decideWorkspaceShellTakeover({
            features: { reactShell: { takeover: false } },
            hasHost: true,
        })).toEqual({
            reason: 'feature-disabled',
            status: 'disabled',
            takeover: false,
        });

        expect(decideWorkspaceShellTakeover({
            features: { reactShell: { takeover: true } },
            hasHost: true,
        })).toEqual({
            status: 'ready',
            takeover: true,
        });

        expect(() => decideWorkspaceShellTakeover({
            features: { reactShell: { takeover: true } },
            hasHost: false,
            strict: true,
        })).toThrow('React workspace shell takeover required but failed: missing-host');

        expect(() => decideWorkspaceShellTakeover({
            features: { reactShell: { strict: true, takeover: 'true' } },
            hasHost: true,
        })).toThrow('React workspace shell takeover required but failed: invalid-payload');

        expect(decideWorkspaceShellTakeover({
            features: { reactShell: { takeover: true } },
            hasHost: false,
            strict: false,
        })).toEqual({
            reason: 'missing-host',
            status: 'failed',
            takeover: false,
        });

        expect(() => decideWorkspaceShellTakeover({
            features: { reactShell: { strict: true, takeover: true } },
            hasHost: false,
        })).toThrow('React workspace shell takeover required but failed: missing-host');

        expect(decideWorkspaceShellTakeover({
            failureReason: WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.BUNDLE_LOAD_FAILED,
            features: { reactShell: { takeover: true } },
            hasHost: true,
            strict: false,
        })).toEqual({
            reason: 'bundle-load-failed',
            status: 'failed',
            takeover: false,
        });

        expect(() => decideWorkspaceShellTakeover({
            failureReason: WORKSPACE_SHELL_TAKEOVER_FAILURE_REASONS.MOUNT_FAILED,
            features: { reactShell: { takeover: true } },
            hasHost: true,
            strict: true,
        })).toThrow('React workspace shell takeover required but failed: mount-failed');

        expect(decideWorkspaceShellTakeover({
            features: { reactShell: { takeover: true } },
            hasHost: true,
            rollback: true,
        })).toEqual({
            reason: 'rollback-requested',
            status: 'rollback',
            takeover: false,
        });
    });

    test('wires same-entry shell takeover diagnostics without replacing the legacy workspace shell', () => {
        const scriptSource = read('public/script.js');

        expect(scriptSource).toContain("from './scripts/workspace-shell-takeover-contract.js';");
        expect(scriptSource).toContain('const WORKSPACE_SHELL_TAKEOVER_MARKER_ID = \'emberdesk-react-shell-takeover-foundation\';');
        expect(scriptSource).toContain('function publishWorkspaceShellTakeoverDiagnostic');
        expect(scriptSource).toContain('decideWorkspaceShellTakeover({');
        expect(scriptSource).toContain('strict,');
        expect(scriptSource).toContain('if (!document.body)');
        expect(scriptSource).toContain('data-react-workspace-shell-takeover-status');
        expect(scriptSource).toContain('data-react-workspace-shell-takeover-reason');
        expect(scriptSource).toContain('publishWorkspaceShellTakeoverDiagnostic();');
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
        expect(scriptSource).not.toContain('workspace-next');
        expect(scriptSource).not.toContain('/workspace-next');

        expect(bridgeSource).toContain('mountReactWorkspaceShellChrome');
        expect(bridgeSource).toContain('panelModule.mountWorkspaceShellChrome');
        expect(workspacePanelSource).toContain('export function mountWorkspaceShellChrome');
        expect(workspacePanelSource).toContain('ReactWorkspaceShellChrome');
        expect(workspacePanelSource).toContain('AI Config');
        expect(workspacePanelSource).toContain('Formatting');
        expect(workspacePanelSource).toContain('Character Library');
        expect(workspacePanelSource).toContain('World Info');
        expect(workspacePanelSource).toContain('Backgrounds');
        expect(workspacePanelSource).toContain('Extensions');
        expect(workspacePanelSource).toContain('Settings');
        expect(scriptSource).toContain("case 'openAIConfig':");
        expect(scriptSource).toContain("window.location.assign('/settings?tab=providers');");
        expect(scriptSource).toContain("case 'openFormatting':");
        expect(scriptSource).toContain("window.location.assign('/settings?tab=advanced');");
        expect(scriptSource).toContain("case 'openSettings':");
        expect(scriptSource).toContain("window.location.assign('/settings');");
        expect(scriptSource).not.toContain("await openWorkspaceShellDrawer('user-settings-block');");
    });

    test('coordinates React shell panel entries with transient dock state and legacy fallback results', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelStoreSource = read('app/stores/workspace-panel-store.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        [
            ['aiConfig', 'AI Config', 'openAIConfig'],
            ['advancedFormatting', 'Formatting', 'openFormatting'],
            ['settings', 'Settings', 'openSettings'],
            ['groupChats', 'Group Chats', 'openGroupChats'],
        ].forEach(([panelKind, label, action]) => {
            expect(workspacePanelStoreSource).toContain(`'${panelKind}',`);
            expect(workspacePanelSource).toContain(`{ action: '${action}'`);
            expect(workspacePanelSource).toContain(`label: '${label}'`);
            expect(workspacePanelSource).toContain(`panelKind: '${panelKind}'`);
        });

        expect(workspacePanelSource).toContain('recordWorkspacePanelDockIntent,');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockClose,');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockResult,');
        expect(workspacePanelSource).toContain('getWorkspacePanelDockSnapshot,');
        expect(workspacePanelSource).toContain('subscribeWorkspacePanelDock,');
        expect(workspacePanelSource).toContain('panelKind?: WorkspaceDockPanelKind;');
        expect(workspacePanelSource).toContain('function useWorkspacePanelDockSnapshot()');
        expect(workspacePanelSource).toContain('function normalizeWorkspacePanelDockStatus(');
        expect(workspacePanelSource).toContain('function getWorkspacePanelDockKindLabel(');
        expect(workspacePanelSource).toContain('function getWorkspacePanelDockStatusLabel(');
        expect(workspacePanelSource).toContain('function getWorkspacePanelVisibleStatusLabel(');
        expect(workspacePanelSource).toContain('const dockSnapshot = useWorkspacePanelDockSnapshot();');
        expect(workspacePanelSource).toContain('const panelDispatchSequenceRef = useRef(0);');
        expect(workspacePanelSource).toContain('const dispatchSequence = panelDispatchSequenceRef.current + 1;');
        expect(workspacePanelSource).toContain('if (panelDispatchSequenceRef.current !== dispatchSequence) {');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockIntent(entry.panelKind);');
        expect(workspacePanelSource).toContain('recordWorkspacePanelDockResult(entry.panelKind, {');
        expect(workspacePanelSource).toContain('fallbackReason: getWorkspacePanelDockFallbackReason(result),');
        expect(workspacePanelSource).toContain('locked: Boolean(asWorkspacePanelDockDispatchResult(result).locked),');
        expect(workspacePanelSource).toContain('pinned: Boolean(asWorkspacePanelDockDispatchResult(result).pinned),');
        expect(workspacePanelSource).toContain('status: normalizeWorkspacePanelDockStatus(result),');
        expect(workspacePanelSource).toContain('data-workspace-shell-panel-entry={entry.panelKind}');
        expect(workspacePanelSource).toContain('data-workspace-shell-panel-active={isPanelEntryActive ? \'true\' : \'false\'}');
        expect(workspacePanelSource).toContain("? `${isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error' ? 'Close' : 'Open'} ${entry.label}`");
        expect(workspacePanelSource).toContain('aria-label={panelActionLabel}');
        expect(workspacePanelSource).toContain('title={panelActionLabel}');
        expect(workspacePanelSource).toContain('aria-pressed={entry.panelKind ? isPanelEntryActive : undefined}');
        expect(workspacePanelSource).toContain('event.stopPropagation();');
        expect(workspacePanelSource).toContain("if (entry.panelKind && isPanelEntryActive && dockSnapshot.activePanelStatus !== 'error') {");
        expect(workspacePanelSource).toContain("void closePanel(entry);");
        expect(workspacePanelSource).toContain("window.setTimeout(() => {\n                                    void dispatchAction(entry);\n                                }, 0);");
        expect(workspacePanelSource).toContain('data-workspace-panel-dock-status={dockSnapshot.activePanelStatus}');
        expect(workspacePanelSource).toContain('getWorkspacePanelDockKindLabel(dockSnapshot.activePanelKind)');
        expect(workspacePanelSource).toContain('getWorkspacePanelDockStatusLabel(dockSnapshot.activePanelStatus)');
        expect(scriptSource).toContain('async dispatchAction(action, payload = {}) {\n            await waitForWorkspaceShellPanelOpenTask();');
        expect(scriptSource).toContain("case 'openCharacterLibrary':");
        expect(workspacePanelSource).toContain("panelKind: 'characterLibrary'");
        expect(scriptSource).toContain("case 'openWorldInfo':");
        expect(scriptSource).toContain('function waitForWorkspaceShellPanelOpenTask()');
        expect(scriptSource).toContain('await waitForWorkspaceShellPanelOpenTask();');
        expect(scriptSource).toContain("void ensureWorkspaceShellDeferredPanel('world-info-body');");
        expect(scriptSource.indexOf('await waitForWorkspaceShellPanelOpenTask();')).toBeLessThan(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();"));
        expect(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();")).toBeLessThan(scriptSource.indexOf("void ensureWorkspaceShellDeferredPanel('world-info-body');"));
        expect(scriptSource.indexOf("await openWorkspaceShellDrawer('WorldInfo');")).toBeLessThan(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();"));
        expect(scriptSource.indexOf("const worldInfoMount = await mountReactWorldInfoPanel();")).toBeLessThan(scriptSource.indexOf("return createWorkspaceShellPanelResult('worldInfo', worldInfoMount);"));
        expect(scriptSource.indexOf("await openWorkspaceShellDrawer('Backgrounds');")).toBeLessThan(scriptSource.indexOf("return createWorkspaceShellPanelResult('backgroundLibrary', await mountReactBackgroundLibraryPanel());"));
        expect(scriptSource.indexOf("await openWorkspaceShellDrawer('rm_extensions_block');")).toBeLessThan(scriptSource.indexOf("return createWorkspaceShellPanelResult('extensionsHost', await mountReactExtensionsHostPanel());"));
        expect(scriptSource).toContain('function openWorkspaceShellDrawerImmediate(drawerId)');
        expect(scriptSource).toContain("drawer.style.opacity = '1';");
        expect(scriptSource).toContain('function closeWorkspaceShellDrawer(drawerId)');
        expect(scriptSource).toContain('function closeWorkspaceShellPanel(kind)');
        expect(scriptSource).toContain('function getWorkspaceShellPanelDrawerId(kind)');
        expect(scriptSource).toContain("aiConfig: 'left-nav-panel'");
        expect(scriptSource).toContain("advancedFormatting: 'AdvancedFormatting'");
        expect(scriptSource).toContain("settings: 'user-settings-block'");
        expect(scriptSource).toContain("groupChats: 'right-nav-panel'");
        expect(scriptSource).toContain('function selectRightMenuImmediate(selectedMenuId)');
        expect(scriptSource).toContain('async function openWorkspaceShellCharacterLibrary()');
        expect(scriptSource).toContain("openWorkspaceShellDrawerImmediate('right-nav-panel');");
        expect(scriptSource).toContain("if (menu_type !== 'characters') {\n        selected_button = 'characters';\n        setMenuType('characters');\n        selectRightMenuImmediate('rm_characters_block');");
        expect(scriptSource.match(/openWorkspaceShellCharacterLibrary\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain("$('#rm_button_characters').trigger('click');");
        expect(scriptSource.match(/openWorkspaceShellCharacterLibrary\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain("openWorkspaceShellDrawer('right-nav-panel')");
        expect(scriptSource.match(/openWorkspaceShellCharacterLibrary\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain('printCharacters(');
        expect(scriptSource).toContain("case 'openCharacterLibrary':\n                    return openWorkspaceShellCharacterLibrary();");
        expect(scriptSource).toContain("case 'closeWorkspacePanel':\n                    return closeWorkspaceShellPanel(payload?.kind);");
        expect(scriptSource).toContain("case 'openCharacterLibrary':\n                    await openWorkspaceShellCharacterLibrary();");
        expect(workspacePanelSource).toContain("panelKind: 'worldInfo'");
        expect(scriptSource).toContain("case 'openBackgrounds':");
        expect(workspacePanelSource).toContain("panelKind: 'backgroundLibrary'");
        expect(scriptSource).toContain("case 'openExtensions':");
        expect(workspacePanelSource).toContain("panelKind: 'extensionsHost'");
        expect(scriptSource).toContain('return createWorkspaceShellPanelResult(');
        expect(scriptSource).toContain('function getWorkspaceShellPanelDockState(kind)');
        expect(scriptSource).toContain('locked: dockState.locked,');
        expect(scriptSource).toContain('pinned: dockState.pinned,');
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('characterLibrary',");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('worldInfo', worldInfoMount);");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('backgroundLibrary', await mountReactBackgroundLibraryPanel());");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('extensionsHost', await mountReactExtensionsHostPanel());");
        expect(scriptSource).toContain("case 'openAIConfig':\n                    window.location.assign('/settings?tab=providers');");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('aiConfig', { kind: 'aiConfig', mounted: false, status: 'success' });");
        expect(scriptSource).toContain("case 'openFormatting':\n                    window.location.assign('/settings?tab=advanced');");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('advancedFormatting', { kind: 'advancedFormatting', mounted: false, status: 'success' });");
        expect(scriptSource).toContain("return createWorkspaceShellPanelResult('settings', { kind: 'settings', mounted: false, status: 'success' });");
        const openSettingsBranch = scriptSource.match(/case 'openSettings':[\s\S]*?case 'openGroupChats':/)?.[0] ?? '';
        expect(openSettingsBranch).toContain("window.location.assign('/settings');");
        expect(openSettingsBranch).not.toContain("openWorkspaceShellDrawer('user-settings-block')");
        expect(openSettingsBranch).not.toContain('reactPages?.settings');
        expect(scriptSource).toContain("case 'openGroupChats':\n                    return openWorkspaceShellGroupChats();");
        expect(scriptSource.match(/openWorkspaceShellGroupChats\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').not.toContain("$('#rm_button_group_chats').trigger('click');");

        const styleSource = read('public/style.css');
        expect(styleSource).toContain('.react-workspace-shell-nav-button[data-workspace-shell-panel-active="true"]');
        expect(styleSource).toContain('.react-workspace-panel-dock-status');
        expect(styleSource).toContain('.react-workspace-panel-dock-status[data-workspace-panel-dock-status="error"]');
        expect(styleSource).toContain('.react-workspace-panel-dock-status[data-workspace-panel-dock-status="disabled"]');
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

        expect(configSource).toContain('mainChatMessageList: true');
        expect(configSource).not.toContain('characterAuthoring:');
        expect(configSource).not.toContain('groupAuthoring:');
        expect(packageSource).toContain('"build:react:workspace-panels": "vite build --mode workspace-panels"');
        expect(seedScriptSource).toContain('EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST');
        expect(seedScriptSource).toContain("['mainChatMessageList', process.env.EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST]");
        expect(workspaceFeatureSource).toContain('mainChatMessageList: isReactMainChatMessageListPanelEnabled()');
        expect(workspaceFeatureSource).toContain('// Main Chat message list is React sole-owner; product flag is retired.');
        expect(workspaceFeatureSource).toContain('return true;');
        expect(bridgeSource).toContain('mainChatMessageList: true');
        expect(bridgeSource).toContain('characterAuthoring: true');
        expect(bridgeSource).toContain('groupAuthoring: true');
        expect(workspacePanelSource).toContain('type WorkspacePanelKind = \'worldInfo\' | \'backgroundLibrary\' | \'extensionsHost\' | \'mainChatMessageList\' | \'characterAuthoring\' | \'groupAuthoring\';');
        expect(scriptSource).toContain('mainChatMessageList: true');
        expect(scriptSource).toContain('characterAuthoring: true');
        expect(scriptSource).toContain('groupAuthoring: true');
    });

    test('ships React authoring form fields and legacy write-through action bridge', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');
        const groupChatsSource = read('public/scripts/group-chats.js');

        expect(workspacePanelSource).toContain('createCharacterAuthoringSession');
        expect(workspacePanelSource).toContain("../public/scripts/character-authoring.js");
        expect(workspacePanelSource).toContain('createGroupAuthoringSession');
        expect(workspacePanelSource).toContain("../public/scripts/group-authoring.js");
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
        expect(workspacePanelSource).toContain('authoringActionMutation.mutateAsync({ action: submitResult.action, payload: submitResult.payload })');
        expect(workspacePanelSource).toContain('shouldApplyCharacterAuthoringSaveResult');
        expect(workspacePanelSource).toContain('createCharacterAuthoringSession(submittedDraft');
        expect(workspacePanelSource).toContain('saveGenerationRef');
        expect(workspacePanelSource).toContain("status={authoringActionMutation.isError ? 'error' : 'success'}");
        expect(workspacePanelSource).toContain("const isCreateMode = (bridgeState.mode ?? 'create') === 'create';");
        expect(workspacePanelSource).toContain('const isActionPending = authoringActionMutation.isPending;');
        expect(workspacePanelSource).toContain("authoringActionMutation.mutate({ action: 'cancelAuthoring'");
        expect(workspacePanelSource).not.toContain("id: 'retry-authoring-save'");
        expect(workspacePanelSource).not.toContain('actions={shellActions}');
        expect(workspacePanelSource).not.toContain('recoveryActions={[]}');
        expect(workspacePanelSource).toContain('react-authoring-secondary-action');
        expect(workspacePanelSource).toContain('react-authoring-tool-action');
        expect(workspacePanelSource).toContain('react-authoring-danger-zone');
        expect(workspacePanelSource).toContain('className="react-authoring-panel-warning" role="status"');
        expect(workspacePanelSource).toContain('disabled={isActionPending}');
        expect(workspacePanelSource).toContain('{!isCreateMode ? (');
        expect(scriptSource).toContain("case 'saveCharacterAuthoring':");
        expect(scriptSource).toContain("case 'saveGroupAuthoring':");
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
        const groupSaveSource = scriptSource.match(/async function applyGroupAuthoringSaveModel\(saveModel = \{\}\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(groupSaveSource).not.toBe('');
        expect(groupSaveSource).toContain("fetch('/api/groups/create'");
        expect(groupSaveSource).not.toContain("$('#rm_group_submit').trigger('click')");
        expect(groupSaveSource).toContain('const groupId = reactGroupAuthoringGroupId;');
        expect(groupSaveSource).toContain('await editGroup(groupId, true, true)');
        expect(groupSaveSource).toContain('await getGroups();');
        expect(groupSaveSource).toContain('await printCharacters(true);');
        expect(scriptSource).toContain('function hideLegacyGroupAuthoringEditor(hidden)');
        expect(scriptSource).toContain('hideLegacyGroupAuthoringEditor(true);');
        expect(scriptSource).not.toContain('hideLegacyGroupAuthoringEditor(Boolean(result?.mounted));');
        expect(scriptSource).not.toContain('hideLegacyGroupAuthoringEditor(false);');
        expect(scriptSource).toContain('function queueReactCharacterAuthoringRemount()');
        expect(scriptSource).toContain('function queueReactGroupAuthoringRemount()');
        expect(scriptSource).toContain("eventSource.on(event_types.CHARACTER_EDITOR_OPENED, () => {");
        expect(scriptSource).toContain('queueReactCharacterAuthoringRemount();');
        expect(scriptSource).toContain("eventSource.on('groupSelected', event => {");
        expect(scriptSource).toContain('reactGroupAuthoringGroupId = groupId == null ? null : String(groupId);');
        expect(scriptSource).toContain('queueReactGroupAuthoringRemount();');
        expect(scriptSource).toContain('hideLegacyCharacterAuthoringEditor(true);');
        expect(scriptSource).toContain('data-react-authoring-build-error');
        expect(scriptSource).not.toContain('hideLegacyCharacterAuthoringEditor(Boolean(result?.mounted));');
        expect(scriptSource.match(/openWorkspaceShellCharacterAuthoring\(\) \{[\s\S]*?\n\}/)?.[0] ?? '').toContain("select_selected_character(this_chid, { switchMenu: false });");
        expect(scriptSource).toContain('setGroupAuthoringMembersDraft');
        expect(groupChatsSource).toContain('export function setGroupAuthoringMembersDraft');
        const groupAuthoringBridgeSource = scriptSource.match(/function getGroupAuthoringReactBridge\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(groupAuthoringBridgeSource).not.toBe('');
        expect(groupAuthoringBridgeSource).toContain("case 'cancelAuthoring':");
        expect(groupAuthoringBridgeSource).toContain('hideLegacyGroupAuthoringEditor(true);');
        expect(groupAuthoringBridgeSource).toContain('return openWorkspaceShellGroupChats();');
        expect(groupAuthoringBridgeSource).toContain("return action !== 'cancelAuthoring' && action !== 'deleteAuthoring';");
        expect(groupAuthoringBridgeSource).toContain("return false;");
        expect(scriptSource).toContain("case 'deleteAuthoring':");
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

        expect(workspacePanelSource).toContain('interface MainChatQuietTransportState');
        expect(workspacePanelSource).toContain('const mainChatQuietTransportSchema = z.object({');
        expect(workspacePanelSource).not.toContain('data-main-chat-quiet-transport-');
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
        const bridge = { dispatchAction: jest.fn() };
        const onDisabled = jest.fn();

        await expect(mountWorkspacePanelHost({
            kind: 'worldInfo',
            ensureContainer,
            getState,
            bridge,
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

    test('remounts shared workspace panel hosts after action settle based on action result', async () => {
        const remount = jest.fn();
        const dispatchAction = jest.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const bridge = createWorkspacePanelActionBridge({
            dispatchAction,
            remount,
            shouldRemount(actionResult) {
                return actionResult !== false;
            },
        });

        await expect(bridge.dispatchAction('first')).resolves.toBe(true);
        await expect(bridge.dispatchAction('second')).resolves.toBe(false);

        expect(dispatchAction).toHaveBeenNthCalledWith(1, 'first', {});
        expect(dispatchAction).toHaveBeenNthCalledWith(2, 'second', {});
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
        expect(scriptSource).toContain('createWorkspacePanelActionBridge({');
        expect(scriptSource).toContain('createWorkspacePanelStateChangeHandler(');
        expect(scriptSource).toContain('initWorkspacePanelDrawerBridge({');
        expect(scriptSource).toContain("kind: 'worldInfo'");
        expect(scriptSource).toContain("kind: 'backgroundLibrary'");
        expect(scriptSource).toContain("kind: 'extensionsHost'");
        expect(scriptSource).toContain("kind: 'mainChatMessageList'");
        expect(scriptSource).toContain("kind: 'characterAuthoring'");
        expect(scriptSource).toContain("kind: 'groupAuthoring'");

        expect(hostControllerSource).toContain('export async function mountWorkspacePanelHost({');
        expect(hostControllerSource).toContain('export function createWorkspacePanelActionBridge({');
        expect(hostControllerSource).toContain('export function createWorkspacePanelStateChangeHandler(remount)');
        expect(hostControllerSource).toContain('export function initWorkspacePanelDrawerBridge({');
        expect(hostControllerSource).toContain('return Promise.resolve(dispatchAction(action, payload)).then(actionResult => {');
        expect(hostControllerSource).toContain('if (shouldRemount(actionResult, action, payload)) {');
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
        expect(scriptSource).toContain('return mountWorkspacePanelHost({');
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

        expect(scriptSource).toContain('function getWorldInfoReactBridge()');
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
        expect(scriptSource).toContain('case \'applySearchQuery\':');
        expect(scriptSource).toContain('case \'importWorld\':');
        expect(scriptSource).toContain('case \'exportWorld\':');
        expect(scriptSource).toContain('return createWorkspacePanelActionBridge({');
        expect(scriptSource).toContain('dispatchAction(action, payload = {}) {');
        expect(scriptSource).toContain('void mountReactWorldInfoPanel();');
        expect(scriptSource).toContain('bridge: getWorldInfoReactBridge()');
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

        expect(bridgeSource).toContain('bridge,');
        expect(bridgeSource).toContain('panelModule.mountWorkspacePanel(kind, container, { state, bridge });');

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
        expect(read('app/world-info-workbench.tsx')).toContain('export function buildWorldInfoPanelFormDefaults');
        expect(read('app/world-info-workbench.tsx')).toContain('export function getWorldInfoPanelStatus');
        expect(read('app/world-info-workbench.tsx')).toContain('const worldInfoActionMutation = useMutation({');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-control="world-select"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-control="search"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-control="sort"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-action="import"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-action="export"');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-entry={entry.uid}');
        expect(read('app/world-info-workbench.tsx')).toContain('data-world-info-react-entry={entry.uid}');
        expect(workspacePanelSource).toContain('className="workspace-panel-item-label"');
        expect(workspacePanelSource).toContain('className="workspace-panel-item-status"');
        expect(read('app/world-info-workbench.tsx')).toContain("action: 'importWorld'");
        expect(read('app/world-info-workbench.tsx')).toContain("action: 'exportWorld'");
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
        expect(scriptSource).toContain("case 'enterFolder':");
        expect(scriptSource).toContain("case 'exitFolder':");
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

        expect(scriptSource).toContain('function getBackgroundLibraryReactBridge()');
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
        expect(scriptSource).toContain('case \'applyBackgroundFilter\':');
        expect(scriptSource).toContain('case \'applyBackgroundSort\':');
        expect(scriptSource).toContain('case \'uploadBackground\':');
        expect(scriptSource).toContain('case \'selectBackground\':');
        expect(scriptSource).toContain('return createWorkspacePanelActionBridge({');
        expect(scriptSource).toContain('dispatchAction(action, payload = {}) {');
        expect(scriptSource).toContain('void mountReactBackgroundLibraryPanel({ refreshQueued: false });');
        expect(scriptSource).toContain('bridge: getBackgroundLibraryReactBridge()');
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
        expect(workspacePanelSource).toContain('const backgroundLibraryActionMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-background-library-react-control="filter"');
        expect(workspacePanelSource).toContain('data-background-library-react-control="sort"');
        expect(workspacePanelSource).not.toContain('data-background-library-react-action="upload"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="lock"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="unlock"');
        expect(workspacePanelSource).toContain('data-background-library-react-gallery={source}');
        expect(workspacePanelSource).toContain('<BackgroundGallery source="global" items={systemBackgrounds} actionMutation={backgroundLibraryActionMutation} />');
        expect(workspacePanelSource).toContain('<BackgroundGallery source="chat" items={chatBackgrounds} actionMutation={backgroundLibraryActionMutation} />');
        expect(workspacePanelSource).toContain('className="workspace-panel-background-item"');
        expect(workspacePanelSource).toContain('className="workspace-panel-background-details"');
        expect(workspacePanelSource).toContain('data-background-library-react-item={item.id}');
        expect(workspacePanelSource).toContain("action: 'uploadBackground',");
        expect(workspacePanelSource).toContain("payload: { source: 'global' },");
        expect(workspacePanelSource).toContain("payload: { source: 'chat' },");
        expect(workspacePanelSource).toContain('data-background-library-react-action="upload-global"');
        expect(workspacePanelSource).toContain('data-background-library-react-action="upload-chat"');
        expect(scriptSource).toContain("return requestBackgroundUploadSelection(payload?.source ?? 'global');");
        expect(workspacePanelSource).toContain('backgroundLibraryActionMutation.mutate({ action: \'lockBackground\' })');
        expect(workspacePanelSource).toContain('backgroundLibraryActionMutation.mutate({ action: \'unlockBackground\' })');
        expect(scriptSource).toContain('getBackgroundLibraryServicePanelState');
        expect(scriptSource).toContain('renameBackgroundLibraryItem');
        expect(scriptSource).toContain('deleteBackgroundLibraryItem');
        expect(scriptSource).toContain("case 'renameBackground':");
        expect(scriptSource).toContain("case 'deleteBackground':");
        expect(backgroundsSource).toContain('export async function renameBackgroundLibraryItem');
        expect(backgroundsSource).toContain('export async function deleteBackgroundLibraryItem');
        expect(backgroundsSource).toContain('ensureBackgroundLibrarySession().applyFilter');
        expect(backgroundsSource).toContain('ensureBackgroundLibrarySession().applySort');
        expect(backgroundsSource).toContain('ensureBackgroundLibrarySession().selectBackground');
        expect(workspacePanelSource).toContain('data-background-library-react-item-action="rename"');
        expect(workspacePanelSource).toContain('data-background-library-react-item-action="delete"');
        expect(workspacePanelSource).toContain("action: 'renameBackground'");
        expect(workspacePanelSource).toContain("action: 'deleteBackground'");
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
        expect(scriptSource).toContain('return mountWorkspacePanelHost({');
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

        expect(scriptSource).toContain('function getExtensionsHostReactBridge()');
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
        expect(scriptSource).toContain('case \'toggleNotifyUpdates\':');
        expect(scriptSource).toContain('case \'openManageExtensions\':');
        expect(scriptSource).toContain('case \'openInstallExtension\':');
        expect(scriptSource).toContain('case \'updateExtrasApiUrl\':');
        expect(scriptSource).toContain('case \'updateExtrasApiKey\':');
        expect(scriptSource).toContain('case \'connectExtrasApi\':');
        expect(scriptSource).toContain('case \'toggleAutoconnect\':');
        expect(scriptSource).toContain('return createWorkspacePanelActionBridge({');
        expect(scriptSource).toContain('shouldRemount(actionResult) {');
        expect(scriptSource).toContain('return actionResult !== false;');
        expect(scriptSource).toContain('bridge: getExtensionsHostReactBridge()');
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
        expect(workspacePanelSource).toContain('const extensionsHostActionMutation = useMutation({');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="notify-updates"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="manage"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="install"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="extras-url"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="extras-api-key"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-control="autoconnect"');
        expect(workspacePanelSource).toContain('data-extensions-host-react-action="connect"');
        expect(workspacePanelSource).toContain('data-workspace-legacy-slot={slot.id}');
        expect(workspacePanelSource).not.toContain('data-extensions-host-react-mount-point={mountPoint.id}');
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
        expect(scriptSource).toContain('function rememberMainChatStreamingTransportVisibleTerminal(phase, {');
        expect(scriptSource).toContain('function shouldPreferStoppedMainChatTerminalSnapshot(currentPhase = null) {');
        expect(scriptSource).toContain('const shouldPreferStoppedTerminal = shouldPreferStoppedMainChatTerminalSnapshot(');
        expect(scriptSource).toContain("rememberMainChatStreamingTransportVisibleTerminal('stopped', {");
        expect(scriptSource).toContain('activeMessageId: null,');
        expect(scriptSource).toContain('if (controlState.stopVisible) {');
        expect(scriptSource).toContain('resetMainChatStreamingTransportTerminalSnapshot();');
        expect(scriptSource).toContain('function getMainChatComposerBridgeState()');
        expect(scriptSource).toContain("const hasBackendConnection = online_status !== 'no_connection';");
        expect(scriptSource).toContain('const isDisabled = textarea?.disabled === true || sendButton?.disabled === true || !hasBackendConnection;');
        expect(scriptSource).toContain('canSubmit: valueLength > 0 && hasBackendConnection && !isDisabled && !isGenerating && activeContext !== \'none\',');
        expect(scriptSource).toContain('let mainChatMessageListPendingRestoreChatId = null;');
        expect(scriptSource).toContain('let mainChatMessageRenderGeneration = 0;');
        expect(scriptSource).toContain('function queueMainChatMessageListScrollRestore(chatId) {');
        expect(scriptSource).toContain('function consumeMainChatMessageListScrollRestore(chatId = getCurrentChatId()) {');
        expect(scriptSource).toContain('const renderGeneration = ++mainChatMessageRenderGeneration;');
        expect(scriptSource).toContain('if (!consumeMainChatMessageListScrollRestore()) {');
        expect(scriptSource).toContain('delay(debounce_timeout.short).then(() => scrollOnMediaLoad(renderGeneration));');
        expect(scriptSource).toContain('export function scrollOnMediaLoad(renderGeneration = mainChatMessageRenderGeneration) {');
        expect(scriptSource).toContain('if (renderGeneration !== mainChatMessageRenderGeneration) {');
        expect(scriptSource).toContain('queueMainChatMessageListScrollRestore(characters[this_chid].chat);');
        expect(scriptSource).toContain('composer: getMainChatComposerBridgeState()');
        expect(scriptSource).toContain('function getMainChatSlashCommandBridgeState()');
        expect(scriptSource).toContain('slashCommand: getMainChatSlashCommandBridgeState()');
        expect(scriptSource).toContain('function getMainChatSlashUiBridgeState()');
        expect(scriptSource).toContain('slashUi: getMainChatSlashUiBridgeState()');
        expect(scriptSource).toContain('activeContext: getMainChatComposerActiveContext()');
        expect(scriptSource).toContain('text: textarea?.value ?? \'\'');
        expect(scriptSource).toContain('autocompleteVisible: isMainChatSlashAutocompleteVisible()');
        expect(scriptSource).toContain('setMainChatSlashCommandReactOwnerEnabled(false);');
        expect(scriptSource).toContain('void mountReactMainChatMessageListPanel();');
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
        expect(scriptSource).toContain('case \'setSlashVisibleOwner\':');
        expect(scriptSource).toContain('case \'selectSlashAutocompleteOption\':');
        expect(scriptSource).toContain('case \'triggerVisibleGeneration\':');
        expect(scriptSource).toContain('async function mountReactMainChatMessageListPanel(');
        expect(scriptSource).toContain('return createWorkspacePanelActionBridge({');
        expect(scriptSource).toContain('setMainChatSlashCommandReactOwnerEnabled(Boolean(payload?.enabled));');
        expect(scriptSource).toContain('shouldRemount(actionResult) {');
        expect(scriptSource).toContain('kind: \'mainChatMessageList\'');
        expect(scriptSource).toContain('getState: () => getMainChatMessageListReactBridgeState()');
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
        expect(workspacePanelSource).toContain('interface MainChatSlashUiState');
        expect(workspacePanelSource).toContain('const mainChatComposerSchema = z.object(');
        expect(workspacePanelSource).toContain('const mainChatSlashCommandSchema = z.object(');
        expect(workspacePanelSource).toContain('const mainChatSlashUiSchema = z.object(');
        expect(workspacePanelSource).toContain('const visibleTransportMutation = useMutation({');
        expect(workspacePanelSource).toContain('return await bridge?.dispatchAction?.(\'triggerVisibleGeneration\', payload);');
        expect(workspacePanelSource).toContain('const mainChatComposerFallback: MainChatComposerState = {');
        expect(workspacePanelSource).toContain('const mainChatSlashCommandFallback: MainChatSlashCommandState = {');
        expect(workspacePanelSource).toContain('const mainChatSlashUiFallback: MainChatSlashUiState = {');
        expect(workspacePanelSource).toContain('scrollTop?: number;');
        expect(workspacePanelSource).toContain('scrollHeight?: number;');
        expect(workspacePanelSource).toContain('clientHeight?: number;');
        expect(workspacePanelSource).toContain('composerValue?: string;');
        expect(workspacePanelSource).toContain('slashUi?: MainChatSlashUiState;');
        expect(workspacePanelSource).toContain('function syncMainChatMessageListDom(');
        expect(workspacePanelSource).toContain('bridgeState.messageNodes ?? []');
        expect(workspacePanelSource).toContain('bridgeState.showMoreNode');
        expect(workspacePanelSource).toContain('host.hidden = true;');
        expect(workspacePanelSource).toContain('chatContainer.insertBefore(host, chatContainer.firstChild);');
        expect(workspacePanelSource).not.toContain('chatContainer.insertBefore(node, insertAfter.nextSibling);');
        expect(workspacePanelSource).toContain('const composer = mainChatComposerSchema.safeParse(bridgeState.composer);');
        expect(workspacePanelSource).toContain('const slashCommand = mainChatSlashCommandSchema.safeParse(bridgeState.slashCommand);');
        expect(workspacePanelSource).toContain('const slashUi = mainChatSlashUiSchema.safeParse(bridgeState.slashUi);');
        expect(workspacePanelSource).toContain('function ExistingDomNodeSlot(');
        expect(workspacePanelSource).toContain('function MainChatComposerOwnerPortal(');
        expect(workspacePanelSource).toContain('function MainChatSlashUiPortal(');
        expect(workspacePanelSource).not.toContain('<ExistingDomNodeSlot node={targets.sendTextarea} slot="send_textarea" />');
        expect(workspacePanelSource).toContain('data-main-chat-message-list-controller="true"');
        expect(workspacePanelSource).toContain('data-main-chat-message-list-status={bridgeState.hasChatContainer ? \'ready\' : \'missing\'}');
        expect(workspacePanelSource).toContain('data-main-chat-generation-control-phase={effectiveGenerationControl.phase ?? \'idle\'}');
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
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-phase={effectiveStreamingTransport.phase ?? \'idle\'}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-tokens={effectiveStreamingTransport.observedTokenCount ?? 0}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-message-id={effectiveStreamingTransport.activeMessageId ?? \'\'}');
        expect(workspacePanelSource).toContain('data-main-chat-streaming-transport-fallback={effectiveStreamingTransport.fromFallbackAttempt ? \'true\' : \'false\'}');
        expect(workspacePanelSource).not.toContain('data-main-chat-visible-transport-');
        expect(workspacePanelSource).toContain('data-main-chat-windowing-owner={bridgeState.windowingContract?.windowingOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-windowing-load-more-owner={bridgeState.windowingContract?.loadMoreOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-windowing-restore-owner={bridgeState.windowingContract?.restoreOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-windowing-fallback={bridgeState.windowingContract?.fallback ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-windowing-reason={bridgeState.windowingContract?.reason ?? \'unknown\'}');
        expect(workspacePanelSource).toContain('function MainChatShowMoreOwnerPortal(');
        expect(workspacePanelSource).toContain("bridge?.dispatchAction?.('loadMoreMessages', {})");
        expect(workspacePanelSource).toContain("showMoreNode.dataset.mainChatLoadMoreOwner = 'react'");
        expect(scriptSource).toContain('export async function loadEarlierChatMessages');
        expect(scriptSource).toContain("case 'loadMoreMessages':");

        expect(workspacePanelSource).toContain('data-main-chat-row-lifecycle-owner={bridgeState.rowLifecycleContract?.lifecycleOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-row-lifecycle-editing-owner={bridgeState.rowLifecycleContract?.editingOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-row-lifecycle-streaming-owner={bridgeState.rowLifecycleContract?.streamingOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-row-lifecycle-unsafe-owner={bridgeState.rowLifecycleContract?.unsafeOwner ?? \'legacy\'}');
        expect(workspacePanelSource).toContain('data-main-chat-row-lifecycle-extension-owner={bridgeState.rowLifecycleContract?.extensionMutatedOwner ?? \'legacy\'}');
        expect(workspacePanelSource).not.toContain('prepareVisibleGeneration');
        expect(workspacePanelSource).not.toContain('__emberDeskExecuteMainChatVisibleTransportRequest');
        expect(workspacePanelSource).toContain('onVisibleGeneration={async (payload) => {');
        expect(workspacePanelSource).toContain('await visibleTransportMutation.mutateAsync({');
        expect(workspacePanelSource).toContain('<MainChatSlashUiPortal state={bridgeState} bridge={bridge} />');
        expect(workspacePanelSource).toContain('return <MainChatMessageListWorkspacePanel state={state} bridge={bridge} />;');
        expect(workspacePanelSource).not.toContain('title="Main Chat Message List"');
        expect(workspacePanelSource).not.toContain('legacyBoundary="message-rendering-streaming-actions-load-more"');
    });

    test('keeps prepend anchoring scoped to restore-owned history expansion instead of user-driven load-more', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(workspacePanelSource).toContain('const shouldAnchorPrependedHistoryWindow = expandedHistoryWindowRequestedRef.current && isPrependingHistoryWindow;');
        expect(workspacePanelSource).toContain('anchorTo: shouldAnchorPrependedHistoryWindow ? \'start\' : \'end\',');
    });

    test('defines a multi-lifecycle rich-body snapshot contract for main-chat rows and validates row eligibility', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function buildMainChatRichBodySnapshot(');
        expect(scriptSource).toContain('function isMainChatRichBodyEligible(');
        expect(scriptSource).toContain('function getMainChatRichBodyRowState(');
        expect(scriptSource).toContain('function shouldPreserveMainChatRichBodyLiveContent(');
        expect(scriptSource).toContain('richBodySnapshots:');
        expect(scriptSource).toContain('eligible:');
        expect(scriptSource).toContain('preserveLiveContent');
        expect(scriptSource).toContain('messageHtml:');
        expect(scriptSource).toContain('reasoningHtml:');
        expect(scriptSource).toContain('mediaHtml:');
        expect(scriptSource).toContain('fileHtml:');
        expect(scriptSource).toContain('biasHtml:');
        expect(scriptSource).toContain('schema: mainChatRichBodySnapshotSchema');
        expect(scriptSource).toContain('function hasMainChatRichBodyExtensionMutation(');
        expect(scriptSource).toContain("messageRow.querySelector('.mes_streaming')");
        expect(scriptSource).toContain("messageRow.querySelector('.TH-streaming')");
        expect(scriptSource).toContain("messageText.querySelector('.TH-render')");

        expect(workspacePanelSource).toContain('const mainChatRichBodySnapshotSchema = z.object(');
        expect(workspacePanelSource).toContain("state: z.enum(['finalized', 'editing', 'streaming', 'extension-mutated'])");
        expect(workspacePanelSource).toContain('interface MainChatRichBodySnapshot');
        expect(workspacePanelSource).toContain('richBodySnapshots?: MainChatRichBodySnapshot[];');
        expect(workspacePanelSource).toContain('function MainChatRichBodyOwnerPortal(');
        expect(workspacePanelSource).toContain('if (!snapshot.preserveLiveContent && !liveExtensionMutation)');
        expect(workspacePanelSource).toContain('targets.messageNode.innerHTML = snapshot.messageHtml;');
        expect(workspacePanelSource).toContain('targets.reasoningNode.innerHTML = snapshot.reasoningHtml;');
        expect(workspacePanelSource).toContain('targets.mediaNode.innerHTML = snapshot.mediaHtml;');
        expect(workspacePanelSource).toContain('targets.fileNode.innerHTML = snapshot.fileHtml;');
        expect(workspacePanelSource).toContain('targets.biasNode.innerHTML = snapshot.biasHtml;');
        expect(workspacePanelSource).toContain('targets.reasoningDetails.open = snapshot.reasoningOpen ?? false;');
        expect(workspacePanelSource).toContain('targets.messageBlock.dataset.mainChatRichBodyOwner = \'react\'');
        expect(workspacePanelSource).toContain('targets.messageBlock.dataset.mainChatRichBodyRow = snapshot.messageId');
        expect(workspacePanelSource).toContain('targets.messageBlock.dataset.mainChatRichBodyState = snapshot.state;');
        expect(workspacePanelSource).toContain('targets.messageBlock.dataset.mainChatRichBodyPreserveLive = snapshot.preserveLiveContent ? \'true\' : \'false\';');
        expect(workspacePanelSource).toContain('host.dataset.mainChatMutationZone = \'true\'');
        expect(workspacePanelSource).toContain('targets.messageNode.dataset.mainChatMutationZoneKind = \'mes_text\'');
        expect(workspacePanelSource).toContain("messageRow.querySelector('.mes_streaming, .TH-streaming')");
        expect(workspacePanelSource).toContain("targets.messageNode.querySelector('.TH-render')");
    });

    test('defines a visible message-action owner contract for safe main-chat rows', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('buildMessageActionSnapshot');
        expect(scriptSource).toContain('MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA');
        expect(scriptSource).toContain('const mainChatMessageActionSnapshotSchema = MAIN_CHAT_MESSAGE_ACTION_SNAPSHOT_SCHEMA;');
        expect(scriptSource).toContain('messageActionSnapshots = messageRows');
        expect(scriptSource).toContain('schema: mainChatMessageActionSnapshotSchema');
        expect(scriptSource).toContain('messageActionSnapshots: messageActionSnapshots');

        expect(workspacePanelSource).toContain('interface MainChatMessageActionSnapshot');
        expect(workspacePanelSource).toContain('messageActionSnapshots?: MainChatMessageActionSnapshot[];');
        expect(workspacePanelSource).toContain('const mainChatMessageActionSnapshotSchema = z.object(');
        expect(workspacePanelSource).toContain('function MainChatMessageActionsOwnerPortal(');
        expect(workspacePanelSource).toContain('messageButtons.dataset.mainChatMessageActionsOwner = \'react\';');
        expect(workspacePanelSource).toContain('messageButtons.dataset.mainChatMessageActionsRow = snapshot.messageId;');
        expect(workspacePanelSource).toContain('messageButtons.dataset.mainChatMessageActionsExpanded = snapshot.expanded ? \'true\' : \'false\';');
    });

    test('defines a visible message-row snapshot contract and React owner boundary for safe main-chat rows', () => {
        const scriptSource = read('public/script.js');
        const workspacePanelSource = read('app/workspace-panels.tsx');

        expect(scriptSource).toContain('function buildMainChatMessageRowSnapshot(');
        expect(scriptSource).toContain('windowingContract: buildMainChatWindowingContract({');
        expect(scriptSource).toContain('rowLifecycleContract: buildMainChatRowLifecycleContract({');
        expect(scriptSource).toContain('function isMainChatMessageRowEligible(');
        expect(scriptSource).toContain('messageRowSnapshots:');
        expect(scriptSource).toContain('messageRowSnapshots = messageRows');
        expect(scriptSource).toContain('schema: mainChatMessageRowSnapshotSchema');
        expect(scriptSource).toContain('messageHtml:');
        expect(scriptSource).toContain('reasoningHtml:');
        expect(scriptSource).toContain('mediaHtml:');
        expect(scriptSource).toContain('fileHtml:');
        expect(scriptSource).toContain('biasHtml:');
        expect(scriptSource).toContain('messageRow.querySelector(\':scope > .mes_block\')');
        expect(scriptSource).toContain('messageRow.querySelector(\':scope > .swipeRightBlock\')');
        expect(scriptSource).toContain("const row = checkbox.closest('.mes');");
        expect(scriptSource).toContain("row.find('.for_checkbox').first().css('display', 'none');");
        expect(scriptSource).toContain("const deleteCheckbox = row.find('.del_checkbox').first();");
        expect(scriptSource).toContain("selectedRow.find('.del_checkbox').first().prop('checked', true);");
        expect(scriptSource).toContain("showSwipeButtons();\n    void mountReactMainChatMessageListPanel();");

        expect(workspacePanelSource).toContain('interface MainChatMessageRowSnapshot');
        expect(workspacePanelSource).toContain('interface MainChatWindowingContractState');
        expect(workspacePanelSource).toContain('interface MainChatRowLifecycleContractState');
        expect(workspacePanelSource).toContain('messageRowSnapshots?: MainChatMessageRowSnapshot[];');
        expect(workspacePanelSource).toContain('const mainChatMessageRowSnapshotSchema = z.object(');
        expect(workspacePanelSource).toContain('const mainChatWindowingContractSchema = z.object(');
        expect(workspacePanelSource).toContain('const mainChatRowLifecycleContractSchema = z.object(');
        expect(workspacePanelSource).toContain('function getMainChatMessageRowTargets(');
        expect(workspacePanelSource).toContain('function canReactOwnMainChatMessageRow(');
        expect(workspacePanelSource).toContain('messageRow.dataset.mainChatMessageRowOwner = \'react\';');
        expect(workspacePanelSource).toContain('messageRow.dataset.mainChatMessageRow = snapshot.messageId;');
        expect(workspacePanelSource).toContain('messageRow.dataset.mainChatMessageRowState = snapshot.state;');
        expect(workspacePanelSource).toContain('messageRow.dataset.mainChatMessageRowPreserveLive = snapshot.preserveLiveContent ? \'true\' : \'false\';');
        expect(workspacePanelSource).toContain("editingOwner: 'react'");
        expect(workspacePanelSource).toContain("streamingOwner: 'react'");
        expect(workspacePanelSource).toContain("extensionMutatedOwner: 'react'");
    });

    test('publishes main-chat layout shell ownership without taking message row structure', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');

        expect(workspacePanelSource).toContain('data-main-chat-layout-owner="react"');
        expect(workspacePanelSource).toContain('data-main-chat-layout-status=');
        expect(workspacePanelSource).toContain('data-main-chat-local-status=');
        expect(workspacePanelSource).toContain('data-main-chat-local-action={action.id}');
        expect(workspacePanelSource).toContain("state.chatContainer?.querySelector('.generation_failure_retry')");
        expect(workspacePanelSource).toContain("generationControl.failureRetryVisible && !hasMessageRetryAction");
        expect(workspacePanelSource).toContain('bridge?.dispatchAction?.(\'openCharacterLibrary\')');
        expect(workspacePanelSource).toContain('syncMainChatLayoutShellDom(');
        expect(workspacePanelSource).toContain('data-main-chat-layout-owner');
        expect(workspacePanelSource).toContain("role={status === 'error' ? 'alert' : 'status'}");
        expect(workspacePanelSource).toContain("aria-live={status === 'error' ? 'assertive' : 'polite'}");
        expect(workspacePanelSource).not.toContain('createPortal(<MainChatMessageListWorkspacePanel');
        expect(scriptSource).toContain('export async function messageEdit(editMessageId)');
        expect(scriptSource).toContain('updateEditArrowClasses();');
        expect(scriptSource).toContain('scheduleMainChatMessageListPanelRefresh();');
        expect(scriptSource).toContain('this.observedChunkCount += 1;\n                scheduleMainChatMessageListPanelRefresh();');
        expect(scriptSource).toContain("case 'setSlashVisibleOwner':\n                    setMainChatSlashCommandReactOwnerEnabled(Boolean(payload?.enabled));\n                    shouldRefreshPanel = false;");
    });

    test('world info workbench facade owns snapshot and entry field updates without DOM action bypass', () => {
        const scriptSource = read('public/script.js');
        const worldInfoSource = read('public/scripts/world-info.js');
        const workbenchSource = read('app/world-info-workbench.tsx');
        const hostControllerSource = read('public/scripts/workspace-panel-host-controller.js');

        expect(worldInfoSource).toContain('export async function getWorldInfoWorkbenchFacadeSnapshot');
        expect(worldInfoSource).toContain('worldInfoFilter.applyFilters(entriesArray)');
        expect(worldInfoSource).toContain('sortWorldInfoEntries(entriesArray)');
        expect(scriptSource).toContain("action !== 'updateEntryFields' && action !== 'toggleActivationRules'");
        expect(scriptSource).toContain('WIMultiSelector');

        expect(worldInfoSource).toContain('export async function updateWorldInfoWorkbenchEntryFields');
        expect(worldInfoSource).toContain('export async function selectWorldInfoWorkbenchEntry');
        expect(worldInfoSource).toContain('vectorized');
        expect(worldInfoSource).toContain('WORLD_INFO_WORKBENCH_EDITABLE_FIELDS');
        expect(scriptSource).toContain('getWorldInfoReactBridgeStateAsync');
        expect(scriptSource).toContain("case 'updateEntryFields':");
        expect(scriptSource).toContain("case 'clearSelectedEntry':");
        expect(scriptSource).toContain("case 'toggleActivationRules':");
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

});
