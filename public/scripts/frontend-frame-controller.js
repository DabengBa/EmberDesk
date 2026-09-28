/**
 * Shell-side controller for message frontend frames.
 *
 * Rows mount their own frames via the `useFrontendFrames` effect (mount-time
 * depth eligibility is computed there, before any iframe exists — scripts must
 * never run for out-of-depth floors). This controller only tears frames down:
 * it re-audits mounted `.ed-frontend-frame` slots when the rendered window,
 * chat membership, or `power_user.frontend_frames` settings change, then
 * broadcasts a document signal so rows can re-scan and mount newly eligible
 * blocks.
 */

import { eventSource, event_types } from './events.js';
import { power_user } from './power-user.js';
import {
    FRONTEND_FRAME_SLOT_CLASS,
    FRONTEND_FRAMES_CHANGED_EVENT,
    FRONTEND_STREAM_HOST_CLASS,
    computeDepthEligible,
    normalizeFrontendFramesSettings,
    unmountFrontendSlot,
} from './frontend-frame.js';

let started = false;

function getRenderedFloorFacts() {
    const rows = Array.from(document.querySelectorAll('#chat .mes[mesid]'));
    const renderedIds = rows.map(row => row.getAttribute('mesid')).filter(id => id !== null);
    const isSystemById = Object.fromEntries(rows.map(row => [
        row.getAttribute('mesid'),
        row.getAttribute('is_system') === 'true',
    ]));
    return { renderedIds, isSystemById };
}

/**
 * Removes mounted frame slots that are no longer eligible: the feature is
 * disabled, or the owning message fell outside the render-depth window.
 * @param {ParentNode|null} [chatRoot]
 */
export function auditFrontendFrames(chatRoot = document.getElementById('chat')) {
    if (!chatRoot) {
        return;
    }
    const settings = normalizeFrontendFramesSettings(power_user.frontend_frames);
    const { renderedIds, isSystemById } = getRenderedFloorFacts();
    chatRoot.querySelectorAll(`.${FRONTEND_FRAME_SLOT_CLASS}`).forEach(slot => {
        const inStreamHost = !!slot.closest(`.${FRONTEND_STREAM_HOST_CLASS}`);
        const messageId = slot.closest('.mes')?.getAttribute('mesid');
        const eligible = settings.enabled
            && (!inStreamHost || settings.allow_streaming)
            && computeDepthEligible({
                messageId,
                renderedIds,
                isSystemById,
                depth: settings.depth,
                depthIgnoreHidden: settings.depth_ignore_hidden,
            });
        if (!eligible) {
            unmountFrontendSlot(slot);
        }
    });
    chatRoot.querySelectorAll(`.${FRONTEND_STREAM_HOST_CLASS}`).forEach(host => {
        if (!host.querySelector(`.${FRONTEND_FRAME_SLOT_CLASS}`)) {
            host.remove();
        }
    });
}

/** Asks mounted rows to re-run their frame scan (mount newly eligible blocks). */
export function notifyFrontendFramesChanged() {
    document.dispatchEvent(new CustomEvent(FRONTEND_FRAMES_CHANGED_EVENT));
}

function reauditAndNotify() {
    auditFrontendFrames();
    notifyFrontendFramesChanged();
}

/**
 * Subscribes to the lifecycle events that can invalidate mounted frames.
 * Idempotent; safe to call once during startup.
 */
export function initFrontendFrameController() {
    if (started) {
        return;
    }
    started = true;
    [
        event_types.SETTINGS_UPDATED,
        event_types.CHAT_LOADED,
        event_types.MORE_MESSAGES_LOADED,
        event_types.MESSAGE_DELETED,
        event_types.MESSAGE_RECEIVED,
        event_types.GENERATION_ENDED,
    ].forEach(eventName => eventSource.on(eventName, reauditAndNotify));
}
