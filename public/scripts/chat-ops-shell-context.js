let chatOpsShellContext = null;

export function registerChatOpsShellContext(context) {
    chatOpsShellContext = context;
}

export function getChatOpsShellContext() {
    return chatOpsShellContext;
}

export function requireChatOpsShellContext() {
    if (!chatOpsShellContext) {
        throw new Error('Chat ops shell context is not registered.');
    }

    return chatOpsShellContext;
}

export function clearChatOpsShellContext() {
    chatOpsShellContext = null;
}
