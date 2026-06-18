import { getConfigValue } from './util.js';

/**
 * Whether the React character-library workspace panel is enabled.
 * @returns {boolean}
 */
export function isReactCharacterLibraryEnabled() {
    return getConfigValue('features.react.panels.characterLibrary', false, 'boolean');
}
