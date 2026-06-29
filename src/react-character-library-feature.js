import { isReactWorkspacePanelEnabled } from './react-feature-flags.js';

/**
 * Whether the React character-library workspace panel is enabled.
 * @returns {boolean}
 */
export function isReactCharacterLibraryEnabled() {
    return isReactWorkspacePanelEnabled('characterLibrary');
}
