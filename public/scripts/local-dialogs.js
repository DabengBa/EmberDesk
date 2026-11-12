import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';

/** @type {Set<{ scope: string | undefined, ticket: number, cancel: () => void }>} */
const pending = new Set();
const ticketKey = Symbol.for('emberdesk.local-dialog.ticket');
const disposeKey = Symbol.for('emberdesk.local-dialog.dispose');

function nextTicket() {
    const ticket = (globalThis[ticketKey] ?? 0) + 1;
    globalThis[ticketKey] = ticket;
    return ticket;
}

/** Cancel pending and mounted requests, optionally only for one panel scope. */
export function disposeLocalDialogs(scope, cutoff = Infinity) {
    for (const entry of pending) if ((!scope || entry.scope === scope) && entry.ticket <= cutoff) entry.cancel();
}
globalThis[disposeKey] = disposeLocalDialogs;

/** Tie a multi-step operation to the same lifetime as its panel's dialogs. */
export function beginLocalDialogOperation(scope) {
    const controller = new AbortController();
    const entry = { scope, ticket: nextTicket(), cancel: () => controller.abort() };
    pending.add(entry);
    return { signal: controller.signal, release: () => pending.delete(entry) };
}

window.addEventListener('pagehide', () => disposeLocalDialogs());

/** @param {import('../../app/components/local-dialogs/LocalDialog').LocalDialogRequest} request
 * @returns {Promise<import('../../app/components/local-dialogs/LocalDialog').LocalDialogResult>} */
export function showLocalDialog(request) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let host;
        let unmount;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const finish = (result, error, failed = false) => {
            if (settled) return;
            settled = true;
            pending.delete(entry);
            request.signal?.removeEventListener('abort', cancel);
            const restore = host?.contains(document.activeElement);
            try { unmount?.(); } catch (cleanupError) { if (!failed) { error = cleanupError; failed = true; } } finally { host?.remove(); }
            if (restore && previousFocus?.isConnected) previousFocus.focus();
            if (failed) reject(error); else resolve(result);
        };
        const cancel = () => finish(null);
        const ticket = nextTicket();
        const entry = { scope: request.scope, ticket, cancel };
        pending.add(entry);
        request.signal?.addEventListener('abort', cancel, { once: true });
        if (request.signal?.aborted) { cancel(); return; }
        loadWorkspacePanelsModule().then(module => {
            if (settled) return;
            try {
                host = document.createElement('div');
                host.dataset.localDialogHost = '';
                document.body.append(host);
                unmount = module.mountLocalDialog(host, request, result => finish(result), error => finish(null, error, true));
            } catch (error) { finish(null, error, true); }
        }, error => finish(null, error, true));
    });
}
