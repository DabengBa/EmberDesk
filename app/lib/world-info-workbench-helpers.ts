import type {
    WorldInfoWorkspacePanelState,
    WorkspacePanelStatus,
} from '../world-info-workbench';

export function buildWorldInfoPanelFormDefaults(state: WorldInfoWorkspacePanelState) {
    return {
        selectedWorldIndex: state.selectedWorldIndex ?? '',
        searchQuery: state.searchQuery ?? '',
        sortValue: state.sortValue ?? '',
    };
}

export function getWorldInfoPanelStatus(bridgeState: WorldInfoWorkspacePanelState): WorkspacePanelStatus {
    if (!bridgeState.editorSelectorPresent && !bridgeState.importMenuPresent) {
        return 'error';
    }
    return 'success';
}
