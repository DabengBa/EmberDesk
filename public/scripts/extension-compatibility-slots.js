/**
 * Stable compatibility mount slots for the React Extensions Host.
 * Owns slot identity and single-mount lifecycle; does not re-render extension content.
 */

/** @typedef {'extensions_settings'|'extensions_settings2'|'regex_container'|'extensionsMenuButton'|'extensionsMenu'} ExtensionCompatibilitySlotId */

/**
 * @type {ReadonlyArray<{
 *   id: ExtensionCompatibilitySlotId,
 *   label: string,
 *   reactSlotId: string,
 *   tagName: string,
 *   className?: string,
 *   attributes?: Record<string, string>,
 * }>}
 */
export const EXTENSION_COMPATIBILITY_SLOTS = Object.freeze([
    {
        id: 'extensions_settings',
        label: 'Settings column',
        reactSlotId: 'extensions-settings',
        tagName: 'div',
        className: 'flex1 wide50p',
    },
    {
        id: 'extensions_settings2',
        label: 'Settings column 2',
        reactSlotId: 'extensions-settings2',
        tagName: 'div',
        className: 'flex1 wide50p',
    },
    {
        id: 'regex_container',
        label: 'Regex container',
        reactSlotId: 'regex-container',
        tagName: 'div',
        className: 'extension_container',
    },
    {
        id: 'extensionsMenuButton',
        label: 'Wand button',
        reactSlotId: 'extensions-menu-button',
        tagName: 'div',
        className: 'list-group-item flex-container flexGap5 interactable',
        attributes: {
            tabindex: '0',
            role: 'listitem',
            'data-i18n': '[title]Extensions',
            title: 'Extensions',
        },
    },
    {
        id: 'extensionsMenu',
        label: 'Wand menu',
        reactSlotId: 'extensions-menu',
        tagName: 'div',
        className: 'list-group',
    },
]);

const OWNER_ATTR = 'data-extensions-host-slot-owner';
const GENERATION_ATTR = 'data-extensions-host-slot-generation';

/**
 * @param {Document} [doc]
 */
export function createExtensionCompatibilitySlotManager(doc = globalThis.document) {
    if (!doc || typeof doc.getElementById !== 'function') {
        throw new Error('createExtensionCompatibilitySlotManager requires a document');
    }

    /** @type {number} */
    let generation = 0;
    /** @type {Map<string, Element>} */
    const claimed = new Map();
    /** @type {string|null} */
    let ownerToken = null;

    /**
     * @param {ExtensionCompatibilitySlotId|string} id
     * @returns {Element|null}
     */
    function findSlot(id) {
        return doc.getElementById(id);
    }

    /**
     * @param {(typeof EXTENSION_COMPATIBILITY_SLOTS)[number]} descriptor
     * @param {ParentNode|null} [parent]
     * @returns {Element}
     */
    function ensureSlotElement(descriptor, parent = null) {
        let el = findSlot(descriptor.id);
        if (el) {
            return el;
        }

        el = doc.createElement(descriptor.tagName || 'div');
        el.id = descriptor.id;
        if (descriptor.className) {
            el.className = descriptor.className;
        }
        if (descriptor.attributes) {
            for (const [key, value] of Object.entries(descriptor.attributes)) {
                el.setAttribute(key, value);
            }
        }
        el.setAttribute(OWNER_ATTR, ownerToken || 'react-extensions-host');
        if (parent && typeof parent.appendChild === 'function') {
            parent.appendChild(el);
        }
        return el;
    }

    /**
     * Claim existing protected nodes or create missing ones under an optional host.
     * Re-entry with the same owner does not remount or clear child content.
     * @param {{
     *   owner?: string,
     *   parentForSettings?: ParentNode|null,
     *   parentForSettings2?: ParentNode|null,
     *   parentForRegex?: ParentNode|null,
     *   parentForMenu?: ParentNode|null,
     * }} [options]
     */
    function ensureSlots(options = {}) {
        const nextOwner = options.owner || 'react-extensions-host';
        const sameOwner = ownerToken === nextOwner && claimed.size === EXTENSION_COMPATIBILITY_SLOTS.length;
        if (!sameOwner) {
            generation += 1;
            ownerToken = nextOwner;
            claimed.clear();
        }

        for (const descriptor of EXTENSION_COMPATIBILITY_SLOTS) {
            let parent = null;
            if (descriptor.id === 'extensions_settings') {
                parent = options.parentForSettings ?? null;
            } else if (descriptor.id === 'extensions_settings2') {
                parent = options.parentForSettings2 ?? null;
            } else if (descriptor.id === 'regex_container') {
                parent = options.parentForRegex ?? options.parentForSettings2 ?? null;
            } else if (descriptor.id === 'extensionsMenuButton' || descriptor.id === 'extensionsMenu') {
                parent = options.parentForMenu ?? null;
            }

            const existing = findSlot(descriptor.id);
            const el = ensureSlotElement(descriptor, existing ? null : parent);
            // Only set ownership metadata; never wipe children (extension content lives here).
            el.setAttribute(OWNER_ATTR, ownerToken);
            el.setAttribute(GENERATION_ATTR, String(generation));
            claimed.set(descriptor.id, el);
        }

        return getStatus();
    }

    function getStatus() {
        return EXTENSION_COMPATIBILITY_SLOTS.map((descriptor) => {
            const el = findSlot(descriptor.id) || claimed.get(descriptor.id) || null;
            return {
                id: descriptor.id,
                reactSlotId: descriptor.reactSlotId,
                label: descriptor.label,
                ready: Boolean(el),
                owned: Boolean(el && el.getAttribute(OWNER_ATTR) === ownerToken),
                generation: el ? Number(el.getAttribute(GENERATION_ATTR) || 0) : 0,
            };
        });
    }

    function getGeneration() {
        return generation;
    }

    function getOwnerToken() {
        return ownerToken;
    }

    /**
     * Release ownership metadata without removing the nodes (content may still be needed).
     */
    function releaseOwnership() {
        for (const descriptor of EXTENSION_COMPATIBILITY_SLOTS) {
            const el = findSlot(descriptor.id);
            if (el && el.getAttribute(OWNER_ATTR) === ownerToken) {
                el.removeAttribute(OWNER_ATTR);
                el.removeAttribute(GENERATION_ATTR);
            }
        }
        claimed.clear();
        ownerToken = null;
    }

    return {
        ensureSlots,
        getStatus,
        getGeneration,
        getOwnerToken,
        releaseOwnership,
        findSlot,
        slots: EXTENSION_COMPATIBILITY_SLOTS,
    };
}

/** @type {ReturnType<typeof createExtensionCompatibilitySlotManager>|null} */
let defaultManager = null;

/**
 * Shared browser manager (lazy).
 * @returns {ReturnType<typeof createExtensionCompatibilitySlotManager>|null}
 */
export function getExtensionCompatibilitySlotManager() {
    if (typeof document === 'undefined') {
        return null;
    }
    if (!defaultManager) {
        defaultManager = createExtensionCompatibilitySlotManager(document);
    }
    return defaultManager;
}

/**
 * @param {ReturnType<typeof createExtensionCompatibilitySlotManager>|null} manager
 */
export function setExtensionCompatibilitySlotManagerForTests(manager) {
    defaultManager = manager;
}
