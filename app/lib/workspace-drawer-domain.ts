export type WorkspaceDrawer = { id: string; open: boolean; pinned: boolean };
export type WorkspaceDrawerPorts = {
    get: (id: string) => WorkspaceDrawer | null | undefined;
    list: () => WorkspaceDrawer[];
    listVisible?: () => WorkspaceDrawer[];
    read: (key: string) => string | null;
    write: (key: string, value: string) => void;
    notify: () => void;
};

const openedKeys: Record<string, string> = {
    'left-nav-panel': 'LNavOpened', 'right-nav-panel': 'NavOpened',
    WorldInfo: 'WINavOpened', RegexPanel: 'RegexNavOpened', SettingsPanel: 'SettingsNavOpened',
};
const lockedKeys: Record<string, string> = { 'left-nav-panel': 'LNavLockOn', 'right-nav-panel': 'NavLockOn' };
const outsidePointerExclusions = '#character_cross, #avatar-and-name-block, #shadow_popup, .popup, #world_popup, .ui-widget, .text_pole, #toast-container, .wi-content-editor-modal';

export function createWorkspaceDrawerService(ports: WorkspaceDrawerPorts) {
    const guards = new Map<string, () => boolean>();
    let queue = Promise.resolve();
    const allowed = (id: string) => {
        const guard = guards.get(id);
        return !guard || Boolean(guard());
    };
    const persistOpen = (drawer: WorkspaceDrawer, open: boolean) => {
        drawer.open = open;
        const key = openedKeys[drawer.id];
        if (key) ports.write(key, String(open));
    };
    const close = (id: string, { force = false } = {}) => {
        const drawer = ports.get(id);
        if (!drawer || (!force && drawer.pinned) || !allowed(id)) return false;
        if (force) drawer.pinned = false;
        persistOpen(drawer, false);
        ports.notify();
        return true;
    };
    const open = (id: string, { preserveOpenDrawers = false } = {}) => {
        const next = queue.then(() => {
            const drawer = ports.get(id);
            if (!drawer) return;
            if (!preserveOpenDrawers) {
                for (const other of ports.list()) {
                    if (other.id !== id && other.open && !other.pinned && allowed(other.id)) persistOpen(other, false);
                }
            }
            persistOpen(drawer, true);
            ports.notify();
        });
        queue = next.catch(() => {});
        return next;
    };
    return {
        open, close,
        waitForOpen: () => queue,
        setCloseGuard(id: string, guard: (() => boolean) | null) {
            if (guard) guards.set(id, guard); else guards.delete(id);
        },
        setPinned(id: string, pinned: boolean) {
            const drawer = ports.get(id);
            if (!drawer) throw new Error(`Workspace drawer has no mount target: ${id}`);
            drawer.pinned = pinned;
            const key = lockedKeys[id];
            if (key) ports.write(key, String(pinned));
        },
        initializePins({ mobile, width }: { mobile: boolean; width: number }) {
            if (mobile) return;
            const fallback = String(width > 1000);
            for (const key of ['LNavOpened', 'NavOpened', 'LNavLockOn', 'NavLockOn']) {
                if (ports.read(key) === null) ports.write(key, fallback);
            }
            for (const [id, key] of Object.entries(lockedKeys)) {
                const drawer = ports.get(id);
                if (drawer) drawer.pinned = ports.read(key) === 'true';
            }
        },
        getRestorable({ mobile, width }: { mobile: boolean; width: number }) {
            if (mobile || width <= 1000) return [];
            return Object.entries(openedKeys).filter(([, key]) => ports.read(key) === 'true').map(([id]) => id);
        },
        closeUnpinned() {
            for (const drawer of ports.list()) if (drawer.open && !drawer.pinned) close(drawer.id);
        },
        handleEscape(phase: 'primary' | 'world' | 'right') {
            const visible = ports.listVisible ? ports.listVisible() : ports.list().filter(drawer => drawer.open);
            const selected = visible.filter(drawer => phase === 'primary'
                ? drawer.id !== 'WorldInfo' && drawer.id !== 'right-nav-panel'
                : phase === 'world' ? drawer.id === 'WorldInfo' : drawer.id === 'right-nav-panel' && !drawer.pinned);
            for (const drawer of selected) close(drawer.id);
            return selected.length > 0;
        },
        handleOutsidePointer(target: Pick<Element, 'closest'> | null) {
            if (!target || target.closest(outsidePointerExclusions) || target.closest('.openDrawer')) return;
            for (const drawer of ports.list()) {
                if (drawer.id && drawer.open && !drawer.pinned) close(drawer.id);
            }
        },
    };
}
