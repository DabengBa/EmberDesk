import { mountReactWorkspacePanel } from './workspace-panels-react-bridge.js';

export async function mountWorkspacePanelHost({
    kind,
    features,
    ensureContainer,
    getState,
    bridge,
    stateOverrides = undefined,
    onDisabled = null,
}) {
    if (!features?.reactPanels?.[kind]) {
        if (typeof onDisabled === 'function') {
            onDisabled();
        }
        return false;
    }

    return mountReactWorkspacePanel({
        kind,
        container: ensureContainer(),
        state: getState(stateOverrides),
        bridge,
        features,
    });
}

export function createWorkspacePanelActionBridge({
    dispatchAction,
    remount,
    shouldRemount = () => true,
}) {
    return {
        dispatchAction(action, payload = {}) {
            return Promise.resolve(dispatchAction(action, payload)).then(actionResult => {
                if (shouldRemount(actionResult, action, payload)) {
                    remount();
                }
                return actionResult;
            }, error => {
                if (shouldRemount(undefined, action, payload)) {
                    remount();
                }
                throw error;
            });
        },
    };
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
