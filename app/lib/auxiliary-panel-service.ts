/** Ports for one React-owned overlay. The workspace supplies DOM and bundle operations. */
export interface AuxiliaryPanelPorts<Module, Host, Focus> {
    load(): Promise<Module>;
    createHost(): Host;
    isConnected(host: Host): boolean;
    mount(module: Module, host: Host, close: () => void): void;
    unmount(module: Module, host: Host): void;
    remove(host: Host): void;
    captureFocus?(): Focus;
    restoreFocus?(focus: Focus | undefined): void;
    canOpen?(): boolean;
    onError(error: unknown): void;
}

/** Owns one overlay lifecycle; closing invalidates loads and unmounts before reopening. */
export function createAuxiliaryPanelController<Module, Host, Focus>(ports: AuxiliaryPanelPorts<Module, Host, Focus>) {
    let current: { module: Module; host: Host; focus: Focus | undefined } | null = null;
    let generation = 0;

    function close(): void {
        generation++;
        const previous = current;
        current = null;
        if (!previous) return;
        try {
            ports.unmount(previous.module, previous.host);
        } catch (error) {
            ports.onError(error);
        } finally {
            ports.remove(previous.host);
            ports.restoreFocus?.(previous.focus);
        }
    }

    async function open(): Promise<void> {
        if (current && ports.isConnected(current.host)) return;
        if (ports.canOpen && !ports.canOpen()) return;
        const id = ++generation;
        const focus = ports.captureFocus?.();
        let host: Host | undefined;
        try {
            const module = await ports.load();
            if (id !== generation) return;
            host = ports.createHost();
            current = { module, host, focus };
            ports.mount(module, host, close);
        } catch (error) {
            if (id !== generation) return;
            if (host !== undefined) ports.remove(host);
            current = null;
            ports.onError(error);
        }
    }

    return { open, close };
}
