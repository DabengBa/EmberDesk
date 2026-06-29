import { t } from './i18n.js';
import { POPUP_TYPE, POPUP_RESULT, Popup } from './popup.js';

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
        cancelButton: t`Cancel`,
        wider: true,
        leftAlign: true,
        defaultResult: POPUP_RESULT.NEGATIVE,
        customButtons: [{
            text: t`Delete All`,
            result: POPUP_RESULT.CUSTOM1,
            classes: ['popup-button-danger'],
        }],
        onClosing: () => {
            capturedCascade = captureCascadeChoices();
            return true;
        },
        onOpen: (p) => {
            const btn = p.dlg.querySelector('[data-result="' + POPUP_RESULT.CUSTOM1 + '"]');
            if (btn) {
                btn.classList.add('popup-button-danger');
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.world-cascade-checkbox').forEach((cb) => { cb.checked = true; });
                    p.complete(POPUP_RESULT.AFFIRMATIVE);
                });
            }
        },
    });
    popup.okButton.classList.add('popup-button-danger');

    const result = await popup.show();
    if (!result) {
        return null;
    }

    return capturedCascade;
}

/**
 * Shows a confirmation dialog with integrated world info section and a "Delete All" button.
 *
 * @param {string} title - Dialog heading text
 * @param {string} content - Combined HTML content (deleteConfirm template + cascade section)
 * @returns {Promise<{ confirmed: boolean, deleteChats: boolean, deleteWorlds: string[], clearWorldReferences: boolean }>}
 */
export async function showDeleteConfirmWithCascade(title, content) {
    let deleteChats = false;
    let capturedCascade = { deleteWorlds: [], clearWorldReferences: false };

    const fullContent = title ? `<h3>${title}</h3>${content}` : content;

    const popup = new Popup(fullContent, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Delete`,
        cancelButton: t`Cancel`,
        wider: true,
        leftAlign: true,
        defaultResult: POPUP_RESULT.NEGATIVE,
        customButtons: [{
            text: t`Delete All`,
            result: POPUP_RESULT.CUSTOM1,
            classes: ['popup-button-danger'],
        }],
        onClosing: () => {
            deleteChats = !!document.getElementById('del_char_checkbox')?.checked;
            capturedCascade = captureCascadeChoices();
            return true;
        },
        onOpen: (p) => {
            const btn = p.dlg.querySelector('[data-result="' + POPUP_RESULT.CUSTOM1 + '"]');
            if (btn) {
                btn.classList.add('popup-button-danger');
                btn.addEventListener('click', () => {
                    const chatCb = document.getElementById('del_char_checkbox');
                    if (chatCb) chatCb.checked = true;
                    document.querySelectorAll('.world-cascade-checkbox').forEach((cb) => { cb.checked = true; });
                    p.complete(POPUP_RESULT.AFFIRMATIVE);
                });
            }
        },
    });
    popup.okButton.classList.add('popup-button-danger');

    const result = await popup.show();
    if (!result) {
        return { confirmed: false, deleteChats: false, deleteWorlds: [], clearWorldReferences: false };
    }

    return { confirmed: true, deleteChats, ...capturedCascade };
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

    let html = '<div class="world-cascade-section">';
    html += '<div class="world-cascade-section-header">';
    html += '<i class="fa-solid fa-book fa-fw"></i>';
    html += `<span>${t`Linked World Info`}</span>`;
    html += '</div>';
    html += '<div class="world-cascade-list">';

    for (const world of worldInfos) {
        const otherCount = world.boundCharacters.length - world.deleteCandidateAvatars.length;
        const hasWarning = otherCount > 0;

        html += `<div class="world-cascade-item${hasWarning ? ' world-cascade-warn' : ''}">`;
        html += '<label class="world-cascade-label">';
        html += `<input type="checkbox" class="world-cascade-checkbox" data-world="${escapeAttr(world.name)}">`;
        html += `<strong>${escapeHtml(world.name)}</strong>`;
        html += `<span class="world-cascade-meta">${world.entryCount} ${t`entries`}</span>`;
        html += '</label>';

        if (hasWarning) {
            html += '<div class="world-cascade-warning">';
            html += '<i class="fa-solid fa-triangle-exclamation fa-fw"></i>';
            html += `<span>${otherCount} ${t`other character(s) are still using this world info.`}</span>`;
            html += '</div>';
        }

        html += '</div>';
    }

    html += '</div>';

    html += '</div>';
    return html;
}

/**
 * Captures cascade checkbox values from the popup DOM.
 * Call this inside an onClosing handler, before the DOM is removed.
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
    return { deleteWorlds, clearWorldReferences: false };
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
