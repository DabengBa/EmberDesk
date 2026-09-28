/**
 * Frontend-frames bridge for React main-chat rows.
 *
 * The DOM algorithm lives in public/scripts/frontend-frame.js (framework-free,
 * DOM-marker state). This adapter resolves shell facts through
 * SillyTavern.getContext() — React code outside app/compat may not touch the
 * global directly — and owns the row-level lifecycle effect:
 *
 *   finalized non-streaming row → inline frames inside `.mes_text`
 *   streaming row               → closed-fence frames in a sibling
 *                                 `.ed-frontend-stream` host (`.mes_text`
 *                                 innerHTML is rewritten per token, so iframes
 *                                 must live outside it); gated by
 *                                 `allow_streaming`. NOTE: streaming rows keep
 *                                 `state === 'finalized'` — the real signal is
 *                                 `snapshot.streaming.activeMessageId`, not
 *                                 the message state field.
 *   depth ineligible            → never mount (pre-insertion eligibility, not
 *                                 mount-then-remove)
 *   editing / error / etc       → nothing mounts; leftovers removed
 *   every commit                → self-healing re-scan (React may rewrite the
 *                                 dangerouslySetInnerHTML subtree on any commit)
 *   FRONTEND_FRAMES_CHANGED_EVENT → re-render so every mounted row re-scans
 *                              when the shell controller invalidates frames
 */

import { useEffect, useReducer, type RefObject } from 'react';
import {
    FRONTEND_FRAMES_CHANGED_EVENT,
    computeDepthEligible,
    mountFrontendFrames,
    mountStreamingFrames,
    normalizeFrontendFramesSettings,
    unmountFrontendFrames,
    unmountStreamingFrames,
} from '../../public/scripts/frontend-frame.js';
import { translate } from './i18n.js';
import { getMainChatSnapshot } from '../stores/main-chat-store';
import type { MainChatMessageRecord } from '../stores/main-chat-store';

interface ShellEventSource {
    emit?: (eventName: string, payload?: unknown) => void;
    on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
}

interface ShellFrameContext {
    powerUserSettings?: { frontend_frames?: unknown } & Record<string, unknown>;
    eventSource?: ShellEventSource;
    name1?: string;
    name2?: string;
    characterId?: number | string;
    chatId?: string;
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
    const streaming = snapshot.streaming;
    return {
        settings,
        eligible: computeDepthEligible({
            messageId,
            renderedIds,
            isSystemById,
            depth: settings.depth,
            depthIgnoreHidden: settings.depth_ignore_hidden,
        }),
        // The row being written by the live streaming transport. Row `state`
        // stays 'finalized' while tokens arrive — this is the authoritative
        // per-row streaming signal.
        isStreamingRow: streaming.activeMessageId === String(messageId)
            && (streaming.phase === 'connecting' || streaming.phase === 'streaming'),
        messageId,
        userAvatarUrl: shell?.getUserAvatarUrl?.() ?? '',
        charAvatarUrl: shell?.getCharacterAvatarUrl?.() ?? '',
        baseHref: typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '',
        eventSource: shell?.eventSource,
        // Convenience snapshot for EmberDeskFrame.getContext() — frozen by the
        // bridge per call. NOT a security boundary: same-origin frames can
        // always reach window.parent for the live context.
        getContextSnapshot: (frameId: string) => ({
            frameId,
            messageId,
            userName: shell?.name1 ?? '',
            characterName: shell?.name2 ?? '',
            characterId: shell?.characterId ?? null,
            chatId: shell?.chatId ?? '',
            userAvatarUrl: shell?.getUserAvatarUrl?.() ?? '',
            charAvatarUrl: shell?.getCharacterAvatarUrl?.() ?? '',
            settings: shell?.powerUserSettings ? { ...shell.powerUserSettings } : undefined,
        }),
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
 * Mounts/unmounts frontend frames for one React main-chat row.
 * @param rowRef Ref to the row root (`.mes`) element — frames may live either
 *               inside `.mes_text` (finalized) or in a sibling stream host
 * @param message Owning message record (drives the state guard)
 */
export function useFrontendFrames(
    rowRef: RefObject<HTMLDivElement | null>,
    message: MainChatMessageRecord,
) {
    const [, bumpEpoch] = useReducer((value: number) => value + 1, 0);

    useEffect(() => {
        const handler = () => bumpEpoch();
        document.addEventListener(FRONTEND_FRAMES_CHANGED_EVENT, handler);
        return () => document.removeEventListener(FRONTEND_FRAMES_CHANGED_EVENT, handler);
    }, []);

    useEffect(() => {
        const rowEl = rowRef.current;
        if (!rowEl) {
            return;
        }
        const ctx = buildFrameContext(message.id);
        const mesTextEl = rowEl.querySelector('.mes_text');
        const streamingRow = ctx.isStreamingRow || message.state === 'streaming';
        if (streamingRow && !message.editing && message.state !== 'error') {
            if (mesTextEl instanceof HTMLElement) {
                unmountFrontendFrames(mesTextEl);
            }
            mountStreamingFrames(rowEl, { ...ctx, text: message.content });
            return;
        }
        if (message.state === 'finalized' && !message.editing) {
            unmountStreamingFrames(rowEl);
            if (mesTextEl instanceof HTMLElement) {
                mountFrontendFrames(mesTextEl, ctx);
            }
            return;
        }
        // editing / error / extension-mutated: mount nothing, clean leftovers.
        if (mesTextEl instanceof HTMLElement) {
            unmountFrontendFrames(mesTextEl);
        }
        unmountStreamingFrames(rowEl);
    });
}
