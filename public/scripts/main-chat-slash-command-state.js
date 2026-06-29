/**
 * Classifies main-chat slash-command bridge metadata without exposing command text.
 *
 * @param {object} input
 * @param {string} [input.text='']
 * @param {number|null} [input.queryLength=null]
 * @param {boolean} [input.autocompleteVisible=false]
 * @param {boolean} [input.isExecuting=false]
 * @param {boolean} [input.isPaused=false]
 * @param {boolean} [input.isAborted=false]
 * @param {boolean} [input.hasError=false]
 * @param {string|null} [input.errorLabel=null]
 * @returns {object}
 */
export function getMainChatSlashCommandState({
    text = '',
    queryLength = null,
    autocompleteVisible = false,
    isExecuting = false,
    isPaused = false,
    isAborted = false,
    hasError = false,
    errorLabel = null,
} = {}) {
    const normalizedText = typeof text === 'string' ? text.trimStart() : '';
    const active = normalizedText.startsWith('/');
    const paused = Boolean(isPaused);
    const aborted = Boolean(isAborted);
    const executing = Boolean(isExecuting || paused);

    return {
        active,
        queryLength: active ? normalizeQueryLength(queryLength, normalizedText) : 0,
        autocompleteVisible: active && Boolean(autocompleteVisible),
        executing,
        paused,
        aborted,
        errorLabel: normalizeErrorLabel(errorLabel, hasError),
    };
}

function normalizeQueryLength(queryLength, text) {
    if (Number.isInteger(queryLength) && queryLength >= 0) {
        return queryLength;
    }

    const normalizedQuery = text
        .slice(1)
        .split(/\s+/, 1)[0]
        ?.trim() ?? '';

    return normalizedQuery.length;
}

function normalizeErrorLabel(errorLabel, hasError) {
    if (typeof errorLabel === 'string' && errorLabel.trim()) {
        return errorLabel.trim();
    }

    return hasError ? 'error' : null;
}
