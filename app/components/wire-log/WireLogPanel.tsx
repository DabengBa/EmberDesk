import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';

import { WireLogBrowser } from './WireLogBrowser';
import { panelStyles as styles } from './wire-log-panel.styles';
import type { WireLogConfig } from './types';

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
            aria-label="链路日志"
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
                    <span {...stylex.props(styles.title)}>链路日志</span>
                    {scoped && chatId ? (
                        <span {...stylex.props(styles.scope)} title={chatId}>{`会话：${chatId}`}</span>
                    ) : (
                        <span {...stylex.props(styles.scope)}>全部会话</span>
                    )}
                    <span {...stylex.props(styles.spacer)} />
                    <button
                        type="button"
                        {...stylex.props(styles.button, scoped ? styles.buttonActive : null)}
                        disabled={!chatId}
                        aria-pressed={scoped}
                        title={chatId ? '只看当前会话 / 查看全部' : '当前没有打开的会话'}
                        onClick={() => setScoped(value => !value)}
                    >
                        {scoped ? '只看当前会话' : '查看全部'}
                    </button>
                    <button
                        type="button"
                        {...stylex.props(styles.button)}
                        title="关闭"
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
