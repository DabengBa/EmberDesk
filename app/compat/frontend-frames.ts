/**
 * Frontend-frames bridge for React main-chat rows.
 *
 * The DOM algorithm lives in public/scripts/frontend-frame.js (framework-free,
 * DOM-marker state). This adapter resolves shell facts through
 * SillyTavern.getContext() — React code outside app/compat may not touch the
 * global directly — and owns the row-level lifecycle effect:
 *
 *   state !== 'finalized'  → never mount (streaming partial docs must not run)
 *   depth ineligible       → never mount (pre-insertion eligibility, not
 *                            mount-then-remove)
 *   every commit           → self-healing re-scan (React may rewrite the
 *                            dangerouslySetInnerHTML subtree on any commit)
 *   FRONTEND_FRAMES_CHANGED_EVENT → re-render so every mounted row re-scans
 *                           when the shell controller invalidates frames
 */

import { useEffect, useReducer, type RefObject } from 'react';
import {
    FRONTEND_FRAMES_CHANGED_EVENT,
    computeDepthEligible,
    mountFrontendFrames,
    normalizeFrontendFramesSettings,
    unmountFrontendFrames,
} from '../../public/scripts/frontend-frame.js';
import { translate } from './i18n.js';
import { getMainChatSnapshot } from '../stores/main-chat-store';
import type { MainChatMessageRecord } from '../stores/main-chat-store';

interface ShellFrameContext {
    powerUserSettings?: { frontend_frames?: unknown };
    eventSource?: { emit?: (eventName: string, payload?: unknown) => void };
    getUserAvatarUrl?: () => string;
    getCharacterAvatarUrl?: () => string;
}

let cachedShellContext: ShellFrameContext | null = null;

function resolveShellContext(): ShellFrameContext | null {
    if (cachedShellContext) {
        return cachedShellContext;
    }
    const ctx = (globalThis as { SillyTavern?: { getContext?: () => ShellFrameContext } }).SillyTavern?.getContext?.();
    if (ctx) {
        cachedShellContext = ctx;
    }
    return cachedShellContext ?? null;
}

function buildFrameContext(messageId: string) {
    const shell = resolveShellContext();
    const settings = normalizeFrontendFramesSettings(shell?.powerUserSettings?.frontend_frames);
    const snapshot = getMainChatSnapshot();
    const renderedIds: readonly (string | number)[] = snapshot.window.visibleMessageIds.length > 0
        ? snapshot.window.visibleMessageIds
        : snapshot.orderedMessageIds;
    const isSystemById: Record<string, boolean> = {};
    for (const id of renderedIds) {
        isSystemById[id] = snapshot.messagesById[id]?.role === 'system';
    }
    return {
        settings,
        eligible: computeDepthEligible({
            messageId,
            renderedIds,
            isSystemById,
            depth: settings.depth,
            depthIgnoreHidden: settings.depth_ignore_hidden,
        }),
        messageId,
        userAvatarUrl: shell?.getUserAvatarUrl?.() ?? '',
        charAvatarUrl: shell?.getCharacterAvatarUrl?.() ?? '',
        baseHref: typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '',
        emit: (eventName: string, frameId: string) => {
            try {
                shell?.eventSource?.emit?.(eventName, frameId);
            } catch {
                // event emission is best-effort
            }
        },
        translate,
    };
}

/**
 * Mounts/unmounts frontend frames inside the row's `.mes_text` host element.
 * @param mesTextRef Ref to the rendered rich-body container
 * @param message Owning message record (drives the finalized guard)
 */
export function useFrontendFrames(
    mesTextRef: RefObject<HTMLDivElement | null>,
    message: MainChatMessageRecord,
) {
    const [, bumpEpoch] = useReducer((value: number) => value + 1, 0);

    useEffect(() => {
        const handler = () => bumpEpoch();
        document.addEventListener(FRONTEND_FRAMES_CHANGED_EVENT, handler);
        return () => document.removeEventListener(FRONTEND_FRAMES_CHANGED_EVENT, handler);
    }, []);

    useEffect(() => {
        const host = mesTextRef.current;
        if (!host) {
            return;
        }
        if (message.state !== 'finalized' || message.editing) {
            unmountFrontendFrames(host);
            return;
        }
        // No dep array and no cleanup return: React may rewrite the
        // dangerouslySetInnerHTML subtree on any commit (including renders
        // where the string value is observably equal), so the scan must be
        // self-healing after every commit, not only on dep changes.
        // mountFrontendFrames is idempotent for already-mounted slots and
        // self-unmounts when the row became ineligible, so epoch bumps and
        // unrelated re-renders never tear down healthy frames.
        mountFrontendFrames(host, buildFrameContext(message.id));
    });
}
