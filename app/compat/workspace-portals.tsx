import { Component, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';

export interface WorkspacePortalMount {
    isMounted(): boolean;
    render(element: ReactNode, synchronous?: boolean): void;
    unmount(): void;
}

interface PortalContent {
    element: ReactNode;
    onError?: (error: unknown) => void;
}

interface PortalEntry extends PortalContent {
    key: string;
    host: HTMLElement;
    wasConnected: boolean;
}

const entries = new Map<string, PortalEntry>();
const listeners = new Set<() => void>();
let snapshot: readonly PortalEntry[] = [];
let nextKey = 0;

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function publish() {
    snapshot = [...entries.values()];
    listeners.forEach(listener => listener());
}

function getSnapshot() {
    return snapshot;
}

export function createWorkspacePortalMount(host: HTMLElement, onError?: (error: unknown) => void): WorkspacePortalMount {
    const key = String(++nextKey);
    return {
        isMounted: () => entries.has(key),
        render(element, synchronous = false) {
            const update = () => {
                entries.set(key, { key, host, element, onError, wasConnected: host.isConnected || (entries.get(key)?.wasConnected ?? false) });
                publish();
            };
            if (synchronous) flushSync(update);
            else update();
        },
        unmount() {
            if (entries.delete(key)) flushSync(publish);
        },
    };
}

// A failed panel must not bring down the application or another panel.
class PortalErrorBoundary extends Component<PortalContent, { element: ReactNode; failed: boolean }> {
    state = { element: this.props.element, failed: false };

    static getDerivedStateFromProps({ element }: PortalContent, state: { element: ReactNode }) {
        return element !== state.element ? { element, failed: false } : null;
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        const { onError } = this.props;
        if (onError) queueMicrotask(() => onError(error));
    }

    render() {
        return this.state.failed ? null : this.props.element;
    }
}

export function WorkspacePortalOutlet() {
    const panels = useSyncExternalStore(subscribe, getSnapshot);
    useEffect(() => {
        const observer = new MutationObserver(() => {
            let changed = false;
            for (const [key, entry] of entries) {
                if (entry.host.isConnected) {
                    entry.wasConnected = true;
                } else if (entry.wasConnected) {
                    entries.delete(key);
                    changed = true;
                }
                // Popup controllers first mount in a detached host so they can
                // read refs synchronously, and only attach the host on show().
            }
            if (changed) publish();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    return panels.map(({ key, host, element, onError }) =>
        createPortal(<PortalErrorBoundary element={element} onError={onError} />, host, key));
}
