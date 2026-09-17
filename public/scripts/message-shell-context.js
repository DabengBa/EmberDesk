let messageShellContext = null;

export function registerMessageShellContext(context) {
    messageShellContext = context;
}

export function getMessageShellContext() {
    return messageShellContext;
}

export function requireMessageShellContext() {
    if (!messageShellContext) {
        throw new Error('Message shell context is not registered.');
    }

    return messageShellContext;
}

export function clearMessageShellContext() {
    messageShellContext = null;
}
