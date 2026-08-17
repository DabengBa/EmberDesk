import {
    WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS,
    createWorkspacePanelFallbackResult,
    createWorkspacePanelMountedResult,
} from './workspace-panel-mount-contract.js';
import { mountReactWorkspacePanel } from './workspace-panels-react-bridge.js';

export function decideWorkspacePanelHostLifecycle({
    kind,
    features,
    hasContainer,
}) {
    const featureEnabled = Boolean(features?.reactPanels?.[kind]);

    if (!featureEnabled) {
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED);
    }

    if (!hasContainer) {
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.MISSING_CONTAINER);
    }

    return createWorkspacePanelMountedResult(kind);
}

export async function mountWorkspacePanelHost({
    kind,
    features,
    ensureContainer,
    getState,
    commands,
    runtime,
    stateOverrides = undefined,
    onDisabled = null,
}) {
    if (!features?.reactPanels?.[kind]) {
        if (typeof onDisabled === 'function') {
            onDisabled();
        }
        return createWorkspacePanelFallbackResult(kind, WORKSPACE_PANEL_MOUNT_FALLBACK_REASONS.FEATURE_DISABLED);
    }

    const container = ensureContainer();
    const decision = decideWorkspacePanelHostLifecycle({
        kind,
        features,
        hasContainer: Boolean(container),
    });

    if (!decision.mounted) {
        return decision;
    }

    const resolvedState = await Promise.resolve(getState(stateOverrides));
    return mountReactWorkspacePanel({
        kind,
        container,
        state: resolvedState,
        commands,
        runtime,
        features,
    });
}

export function createWorkspacePanelCommandPort({
    commands,
    remount,
    shouldRemount = () => true,
    shouldRemountOnError = shouldRemount,
}) {
    return Object.fromEntries(Object.entries(commands).map(([commandName, command]) => [
        commandName,
        (...args) => Promise.resolve(command(...args)).then(commandResult => {
            if (shouldRemount(commandResult, commandName, args)) {
                remount();
            }
            return commandResult;
        }, error => {
            if (shouldRemountOnError(error, commandName, args)) {
                remount();
            }
            throw error;
        }),
    ]));
}

export function createWorkspacePanelStateChangeHandler(remount) {
    return function handleWorkspacePanelStateChange(event) {
        const stateOverrides = event instanceof CustomEvent && event.detail ? event.detail : {};
        remount(stateOverrides);
    };
}

export function initWorkspacePanelDrawerBridge({
    removeEventTarget,
    addEventTarget,
    eventName,
    stateChangeHandler,
    drawerSelector,
    drawerNamespace,
    remount,
    initialStateOverrides = undefined,
}) {
    if (removeEventTarget && addEventTarget && eventName && stateChangeHandler) {
        removeEventTarget.removeEventListener(eventName, stateChangeHandler);
        addEventTarget.addEventListener(eventName, stateChangeHandler);
    }

    if (drawerSelector && drawerNamespace) {
        $(drawerSelector).off(`click.${drawerNamespace}`).on(`click.${drawerNamespace}`, () => {
            remount();
        });
    }

    remount(initialStateOverrides);
}
