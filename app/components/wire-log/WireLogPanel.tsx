import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';

import { WireLogBrowser } from './WireLogBrowser';
import { panelStyles as styles } from './wire-log-panel.styles';
import type { WireLogConfig } from './types';
import { translate, useTranslated } from '@/compat/i18n.js';

/**
 * Wire Log overlay.
 *
 * The shell (`mountWireLogPanel` in workspace-panels.tsx) appends a host div to
 * `<body>` and mounts this component into it, mirroring the prompt-inspector
 * overlay. Data, filtering and rendering stay in `WireLogBrowser`; this file
 * only supplies the dialog chrome and the current-chat default filter.
 */

export interface WireLogPanelBridge {
    /** Chat file the open chat workspace is showing, or null when none is active. */
    getChatId(): string | null;
    onConfigChange(config: WireLogConfig): void;
    close(): void;
}

export function WireLogPanel({ bridge }: { bridge: WireLogPanelBridge }) {
    useTranslated('');
    const [chatId] = useState(() => bridge.getChatId());
    const [scoped, setScoped] = useState(Boolean(chatId));
    const close = useCallback(() => bridge.close(), [bridge]);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => dialog?.close();
    }, []);

    return (
        <dialog
            ref={dialogRef}
            aria-label={translate('Wire log')}
            onCancel={event => { event.preventDefault(); close(); }}
            onKeyDown={event => {
                if (event.key !== 'Tab') return;
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
                )).filter(node => node.getClientRects().length > 0);
                const first = controls[0];
                const last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }}
            {...stylex.props(styles.overlay)}
            onClick={event => {
                if (event.target === event.currentTarget) {
                    close();
                }
            }}
        >
            <div {...stylex.props(styles.panel)}>
                <div {...stylex.props(styles.header)}>
                    <span {...stylex.props(styles.title)}>{translate('Wire log')}</span>
                    {scoped && chatId ? (
                        <span {...stylex.props(styles.scope)} title={chatId}>{translate('Chat: ${0}').replace('${0}', String(chatId))}</span>
                    ) : (
                        <span {...stylex.props(styles.scope)}>{translate('All chats')}</span>
                    )}
                    <span {...stylex.props(styles.spacer)} />
                    <button
                        type="button"
                        {...stylex.props(styles.button, scoped ? styles.buttonActive : null)}
                        disabled={!chatId}
                        aria-pressed={scoped}
                        title={chatId ? translate('Show only this chat / show all') : translate('No chat is open right now')}
                        onClick={() => setScoped(value => !value)}
                    >
                        {scoped ? translate('Only this chat') : translate('Show all')}
                    </button>
                    <button
                        type="button"
                        {...stylex.props(styles.button)}
                        title={translate('Close')}
                        onClick={close}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
                <div {...stylex.props(styles.body)}>
                    <WireLogBrowser chatId={scoped ? chatId : null} onConfigChange={bridge.onConfigChange} />
                </div>
            </div>
        </dialog>
    );
}
