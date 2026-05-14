import { t } from './i18n.js';
import { POPUP_TYPE, Popup } from './popup.js';

/**
 * Shows a standalone cascade dialog (used as fallback when caller cannot embed
 * the cascade section into its own confirmation dialog).
 *
 * @param {Array<{ name: string, entryCount: number, boundCharacters: Array, deleteCandidateAvatars: string[] }>} worldInfos
 * @returns {Promise<{ deleteWorlds: string[], clearWorldReferences: boolean } | null>}
 */
export async function showWorldInfoCascadeDialog(worldInfos) {
    const html = buildCascadeSectionHtml(worldInfos);
    if (!html) {
        return { deleteWorlds: [], clearWorldReferences: false };
    }

    let capturedCascade = { deleteWorlds: [], clearWorldReferences: false };

    const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Delete`,
        wider: true,
        onClosing: () => {
            capturedCascade = captureCascadeChoices();
        },
    });

    const result = await popup.show();
    if (!result) {
        return null;
    }

    return capturedCascade;
}

/**
 * Builds the world info section HTML for embedding into the delete confirmation dialog.
 *
 * @param {Array<{ name: string, entryCount: number, boundCharacters: Array, deleteCandidateAvatars: string[] }>} worldInfos
 * @returns {string|null} HTML string to inject, or null if no world infos.
 */
export function buildCascadeSectionHtml(worldInfos) {
    if (!worldInfos || worldInfos.length === 0) {
        return null;
    }

    const hasOtherBindings = worldInfos.some(
        (w) => w.boundCharacters.length > w.deleteCandidateAvatars.length,
    );

    let html = `<hr>`;
    html += `<div class="world-cascade-dialog">`;
    html += `<h3>${t`Linked World Info`}</h3>`;
    html += `<p>${t`The following world info files are referenced by the characters being deleted.`}</p>`;
    html += `<div class="world-cascade-list">`;

    for (const world of worldInfos) {
        const otherCount = world.boundCharacters.length - world.deleteCandidateAvatars.length;
        const hasWarning = otherCount > 0;

        html += `<div class="world-cascade-item${hasWarning ? ' world-cascade-warn' : ''}">`;
        html += `<label class="world-cascade-label flex-container alignItemsCenter flexGap10">`;
        html += `<input type="checkbox" class="world-cascade-checkbox" data-world="${escapeAttr(world.name)}">`;
        html += `<div class="flex1">`;
        html += `<strong>${escapeHtml(world.name)}</strong>`;
        html += `<span class="opacity50p"> — ${world.entryCount} ${t`entries`}</span>`;
        html += `</div>`;
        html += `</label>`;

        if (hasWarning) {
            html += `<div class="world-cascade-warning flex-container alignItemsCenter flexGap5 marginTopBot5">`;
            html += `<i class="fa-solid fa-triangle-exclamation fa-fw warning"></i>`;
            html += `<span class="warning">${otherCount} ${t`other character(s) are still using this world info.`}</span>`;
            html += `</div>`;
        }

        html += `</div>`;
    }

    html += `</div>`;

    if (hasOtherBindings) {
        html += `<div class="world-cascade-global marginTopBot5">`;
        html += `<label class="flex-container alignItemsCenter flexGap10">`;
        html += `<input type="checkbox" id="world-cascade-clear-refs">`;
        html += `<span>${t`Also clear world info references in remaining characters`}</span>`;
        html += `</label>`;
        html += `<small class="opacity50p">${t`The embedded world book content inside those characters will NOT be removed and can still be imported later.`}</small>`;
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

/**
 * Captures cascade checkbox values from the popup DOM.
 * Call this inside an onClosing / onClose handler, before the DOM is removed.
 *
 * @returns {{ deleteWorlds: string[], clearWorldReferences: boolean }}
 */
export function captureCascadeChoices() {
    const deleteWorlds = [];
    const checkboxes = document.querySelectorAll('.world-cascade-checkbox');
    for (const cb of checkboxes) {
        if (cb.checked) {
            deleteWorlds.push(cb.dataset.world);
        }
    }
    const clearRefsEl = document.getElementById('world-cascade-clear-refs');
    const clearWorldReferences = clearRefsEl?.checked ?? false;
    return { deleteWorlds, clearWorldReferences };
}

/** @param {string} str */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** @param {string} str */
function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
