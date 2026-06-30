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

export function getWorldInfoShellEventSourceProperty(property) {
    const source = requireWorldInfoShellContext().eventSource;
    const value = source[property];
    return typeof value === 'function' ? value.bind(source) : value;
}

export function clearWorldInfoShellContext() {
    worldInfoShellContext = null;
}
