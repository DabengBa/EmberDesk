/**
 * Deferred panel loader for lazy-loading heavy markup blocks.
 * Serves fragments from /panels/<id>.html, inserts them into
 * data-deferred-panel placeholders, localizes, and runs post-insert hooks.
 */

import { applyLocale } from './i18n.js';

/** @type {Map<string, 'loading'|'loaded'|'error'>} */
const panelState = new Map();

/** @type {Map<string, Promise<void>>} */
const inflight = new Map();

/** @type {Map<string, (container: HTMLElement) => void>} */
const onLoadHooks = new Map();

/**
 * Register a post-load hook for a panel.
 * @param {string} id Panel ID
 * @param {(container: HTMLElement) => void} hook
 */
export function registerPanelHook(id, hook) {
    onLoadHooks.set(id, hook);
}

/**
 * Ensure a deferred panel is loaded. Loads once, reuses on subsequent calls.
 * @param {string} id Panel ID matching the data-deferred-panel attribute and the fragment file name
 * @returns {Promise<void>}
 */
export async function ensurePanel(id) {
    if (panelState.get(id) === 'loaded') return;

    if (inflight.has(id)) return inflight.get(id);

    const promise = (async () => {
        try {
            panelState.set(id, 'loading');
            const container = document.querySelector(`[data-deferred-panel="${id}"]`);
            if (!container) {
                panelState.set(id, 'error');
                return;
            }

            const resp = await fetch(`/panels/${id}.html`);
            if (!resp.ok) throw new Error(`Failed to load panel ${id}: ${resp.status}`);

            const html = await resp.text();
            container.innerHTML = html;

            // Localize inserted content
            applyLocale(container);

            // Run post-load hook
            const hook = onLoadHooks.get(id);
            if (hook) hook(container);

            panelState.set(id, 'loaded');
        } catch (err) {
            console.error(`Deferred panel ${id} load failed:`, err);
            panelState.set(id, 'error');

            // Show retry affordance
            const container = document.querySelector(`[data-deferred-panel="${id}"]`);
            if (container) {
                container.innerHTML = `<div class="deferred-panel-placeholder" style="padding:1em;color:var(--SmartThemeQuoteColor);text-align:center;cursor:pointer;" data-deferred-retry="${id}"><i class="fa-solid fa-rotate-right"></i> <span data-i18n="Retry">Retry</span></div>`;
            }
        } finally {
            inflight.delete(id);
        }
    })();

    inflight.set(id, promise);
    return promise;
}

/**
 * Check if a panel is loaded.
 * @param {string} id
 * @returns {boolean}
 */
export function isPanelLoaded(id) {
    return panelState.get(id) === 'loaded';
}

// Auto-wire retry clicks
document.addEventListener('click', (e) => {
    const retryTarget = e.target.closest('[data-deferred-retry]');
    if (retryTarget) {
        ensurePanel(retryTarget.dataset.deferredRetry);
    }
});
