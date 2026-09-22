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

/**
 * Matches world-info-domain `isValidRegex`: `/pattern/flags` literals usable
 * as entry keywords.
 */
export function isRegexKeyword(token: string): boolean {
    const match = token.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) {
        return false;
    }
    const [, pattern, flags] = match;
    if (pattern.match(/(^|[^\\])\//)) {
        return false;
    }
    try {
        new RegExp(pattern.replace('\\/', '/'), flags);
        return true;
    } catch {
        return false;
    }
}

export function countRegexKeywords(values: string[] | undefined): number {
    if (!Array.isArray(values)) {
        return 0;
    }
    return values.filter(isRegexKeyword).length;
}
