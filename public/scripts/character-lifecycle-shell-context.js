let characterLifecycleShellContext = null;

export function registerCharacterLifecycleShellContext(context) {
    characterLifecycleShellContext = context;
}

export function getCharacterLifecycleShellContext() {
    return characterLifecycleShellContext;
}

export function requireCharacterLifecycleShellContext() {
    if (!characterLifecycleShellContext) {
        throw new Error('Character lifecycle shell context is not registered.');
    }

    return characterLifecycleShellContext;
}

export function clearCharacterLifecycleShellContext() {
    characterLifecycleShellContext = null;
}
