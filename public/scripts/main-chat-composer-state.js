const MAIN_CHAT_COMPOSER_CONTEXTS = new Set([
    'character',
    'group',
    'assistant',
    'none',
]);

/**
 * Classifies main-chat composer bridge metadata without exposing prompt text.
 *
 * @param {object} input
 * @param {number} [input.valueLength=0]
 * @param {boolean} [input.hasValue=false]
 * @param {boolean} [input.canSubmit=false]
 * @param {boolean} [input.isFocused=false]
 * @param {boolean} [input.isDisabled=false]
 * @param {boolean} [input.isGenerating=false]
 * @param {'character'|'group'|'assistant'|'none'} [input.activeContext='none']
 * @returns {object}
 */
export function getMainChatComposerState({
    valueLength = 0,
    hasValue = false,
    canSubmit = false,
    isFocused = false,
    isDisabled = false,
    isGenerating = false,
    activeContext = 'none',
} = {}) {
    const normalizedLength = normalizeLength(valueLength);
    const normalizedContext = MAIN_CHAT_COMPOSER_CONTEXTS.has(activeContext) ? activeContext : 'none';
    const normalizedFocused = Boolean(isFocused);
    const normalizedDisabled = Boolean(isDisabled);
    const normalizedGenerating = Boolean(isGenerating);
    const normalizedHasValue = hasValue === true || normalizedLength > 0;
    const isEmpty = !normalizedHasValue;

    return {
        valueLength: normalizedLength,
        isEmpty,
        canSubmit: Boolean(canSubmit) && !isEmpty && !normalizedDisabled && !normalizedGenerating && normalizedContext !== 'none',
        isFocused: normalizedFocused,
        isDisabled: normalizedDisabled,
        isGenerating: normalizedGenerating,
        activeContext: normalizedContext,
    };
}

function normalizeLength(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}
