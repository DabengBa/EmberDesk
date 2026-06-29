let worldInfoShellContext = null;

export function registerWorldInfoShellContext(context) {
    worldInfoShellContext = context;
}

export function getWorldInfoShellContext() {
    return worldInfoShellContext;
}

export function requireWorldInfoShellContext() {
    if (!worldInfoShellContext) {
        throw new Error('World Info shell context is not registered.');
    }

    return worldInfoShellContext;
}

export function clearWorldInfoShellContext() {
    worldInfoShellContext = null;
}
