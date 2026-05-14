import { t } from '../script.js';
import { POPUP_TYPE, callGenericPopup } from './popup.js';

/**
 * Shows a cascade dialog for world info files bound to characters being deleted.
 *
 * @param {Array<{ name: string, entryCount: number, boundCharacters: Array, deleteCandidateAvatars: string[] }>} worldInfos
 * @returns {Promise<{ deleteWorlds: string[], clearWorldReferences: boolean } | null>}
 *   null if user cancelled.
 */
export async function showWorldInfoCascadeDialog(worldInfos) {
    if (!worldInfos || worldInfos.length === 0) {
        return { deleteWorlds: [], clearWorldReferences: false };
    }

    const hasOtherBindings = worldInfos.some(
        (w) => w.boundCharacters.length > w.deleteCandidateAvatars.length,
    );

    let html = `<div class="world-cascade-dialog">`;
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

    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Delete`,
        wider: true,
    });

    if (!result) {
        return null;
    }

    const checkboxes = document.querySelectorAll('.world-cascade-checkbox');
    const deleteWorlds = [];
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
