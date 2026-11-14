let characterTagsShellContext = null;

export function registerCharacterTagsShellContext(context) {
    characterTagsShellContext = context;
}

export function getCharacterTagsShellContext() {
    return characterTagsShellContext;
}

export function requireCharacterTagsShellContext() {
    if (!characterTagsShellContext) {
        throw new Error('Character tags shell context is not registered.');
    }

    return characterTagsShellContext;
}

export function clearCharacterTagsShellContext() {
    characterTagsShellContext = null;
}
