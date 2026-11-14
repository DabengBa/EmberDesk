/* eslint-disable */
// Generated from app/lib/workspace-drawer-domain.ts; run node scripts/build-workspace-drawer-domain.mjs.










const openedKeys                         = {
    'left-nav-panel': 'LNavOpened', 'right-nav-panel': 'NavOpened',
    WorldInfo: 'WINavOpened', RegexPanel: 'RegexNavOpened', SettingsPanel: 'SettingsNavOpened',
};
const lockedKeys                         = { 'left-nav-panel': 'LNavLockOn', 'right-nav-panel': 'NavLockOn' };
const outsidePointerExclusions = '#character_cross, #avatar-and-name-block, #shadow_popup, .popup, #world_popup, .ui-widget, .text_pole, #toast-container, .wi-content-editor-modal';

export function createWorkspaceDrawerService(ports                      ) {
    const guards = new Map                       ();
    let queue = Promise.resolve();
    const allowed = (id        ) => {
        const guard = guards.get(id);
        return !guard || Boolean(guard());
    };
    const persistOpen = (drawer                 , open         ) => {
        drawer.open = open;
        const key = openedKeys[drawer.id];
        if (key) ports.write(key, String(open));
    };
    const close = (id        , { force = false } = {}) => {
        const drawer = ports.get(id);
        if (!drawer || (!force && drawer.pinned) || !allowed(id)) return false;
        if (force) drawer.pinned = false;
        persistOpen(drawer, false);
        ports.notify();
        return true;
    };
    const open = (id        , { preserveOpenDrawers = false } = {}) => {
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
        setCloseGuard(id        , guard                        ) {
            if (guard) guards.set(id, guard); else guards.delete(id);
        },
        setPinned(id        , pinned         ) {
            const drawer = ports.get(id);
            if (!drawer) throw new Error(`Workspace drawer has no mount target: ${id}`);
            drawer.pinned = pinned;
            const key = lockedKeys[id];
            if (key) ports.write(key, String(pinned));
        },
        initializePins({ mobile, width }                                    ) {
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
        getRestorable({ mobile, width }                                    ) {
            if (mobile || width <= 1000) return [];
            return Object.entries(openedKeys).filter(([, key]) => ports.read(key) === 'true').map(([id]) => id);
        },
        closeUnpinned() {
            for (const drawer of ports.list()) if (drawer.open && !drawer.pinned) close(drawer.id);
        },
        handleEscape(phase                               ) {
            const visible = ports.listVisible ? ports.listVisible() : ports.list().filter(drawer => drawer.open);
            const selected = visible.filter(drawer => phase === 'primary'
                ? drawer.id !== 'WorldInfo' && drawer.id !== 'right-nav-panel'
                : phase === 'world' ? drawer.id === 'WorldInfo' : drawer.id === 'right-nav-panel' && !drawer.pinned);
            for (const drawer of selected) close(drawer.id);
            return selected.length > 0;
        },
        handleOutsidePointer(target                                 ) {
            if (!target || target.closest(outsidePointerExclusions) || target.closest('.openDrawer')) return;
            for (const drawer of ports.list()) {
                if (drawer.id && drawer.open && !drawer.pinned) close(drawer.id);
            }
        },
    };
}
