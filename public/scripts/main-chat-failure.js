export function showMainChatFailure(host, message) {
    const parent = host?.parentElement;
    if (!parent) return;
    const previous = getMainChatFailure(host);
    const alert = host.ownerDocument.createElement('div');
    alert.dataset.reactMainChatBuildError = 'true';
    alert.setAttribute('role', 'alert');
    alert.textContent = message;
    if (previous) previous.replaceWith(alert);
    else host.before(alert);
}

export function getMainChatFailure(host) {
    return host?.parentElement?.querySelector('[data-react-main-chat-build-error]') ?? null;
}

export function clearMainChatFailure(host, expected = getMainChatFailure(host)) {
    if (expected && getMainChatFailure(host) === expected) expected.remove();
}
