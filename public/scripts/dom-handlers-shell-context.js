let domHandlersShellContext = null;

export function registerDomHandlersShellContext(context) {
    domHandlersShellContext = context;
}

export function getDomHandlersShellContext() {
    return domHandlersShellContext;
}

export function requireDomHandlersShellContext() {
    if (!domHandlersShellContext) {
        throw new Error('DOM handlers shell context is not registered.');
    }

    return domHandlersShellContext;
}

export function clearDomHandlersShellContext() {
    domHandlersShellContext = null;
}
