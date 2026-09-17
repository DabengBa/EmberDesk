import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { apiFetch } from '../../lib/request';
import { chatBackupsStyles as styles } from '../../styles/chat-backups.styles';

export interface ChatBackupsCommands {
    restoreChatBackup(name: string): Promise<string[] | null>;
    translate?(text: string): string;
}

interface ChatBackupInfo {
    file_name: string;
    last_mes: string | number;
    file_size: string;
    chat_items: number;
}

interface ChatBackupsBrowserProps {
    buttonContainer: HTMLElement;
    listContainer: HTMLElement;
    commands: ChatBackupsCommands;
    refreshToken?: number;
}

type ToastrLike = {
    success?(message: string): void;
    error?(message: string): void;
    warning?(message: string): void;
    info?(message: string): void;
};

function getToastr(): ToastrLike {
    return (globalThis as { toastr?: ToastrLike }).toastr ?? {};
}

function formatTimestamp(timestamp: string | number): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return String(timestamp);
    }
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function sortBackups(backups: ChatBackupInfo[]): ChatBackupInfo[] {
    return [...backups].sort((a, b) => new Date(b.last_mes).getTime() - new Date(a.last_mes).getTime());
}

export function ChatBackupsBrowser({ buttonContainer, listContainer, commands, refreshToken = 0 }: ChatBackupsBrowserProps) {
    const t = useCallback((text: string) => commands.translate?.(text) ?? text, [commands]);
    const [isOpen, setIsOpen] = useState(false);
    const [backups, setBackups] = useState<ChatBackupInfo[] | null>(null);
    const [viewing, setViewing] = useState<{ name: string; content: string } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const loadBackups = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const response = await apiFetch('/api/backups/chat/get', { signal: controller.signal });
        if (!response.ok) {
            console.error('Failed to load chat backups list:', response.statusText);
            return;
        }

        const data: ChatBackupInfo[] = await response.json();
        setBackups(sortBackups(data));
    }, []);

    useEffect(() => {
        if (!isOpen) {
            abortRef.current?.abort();
            return;
        }
        void loadBackups();
        return () => abortRef.current?.abort();
    }, [isOpen, loadBackups, refreshToken]);

    const viewBackup = useCallback(async (name: string) => {
        const response = await apiFetch('/api/backups/chat/download', { body: { name } });
        if (!response.ok) {
            getToastr().error?.(t('Failed to download backup, try again later.'));
            console.error('Failed to download chat backup:', response.statusText);
            return;
        }

        try {
            const parsedLines: { name?: string; send_date?: string | number; mes?: string }[] = [];
            const fileText = await response.text();
            for (const line of fileText.split('\n')) {
                try {
                    const lineData = JSON.parse(line);
                    if (lineData?.mes) {
                        parsedLines.push(lineData);
                    }
                } catch (error) {
                    console.error('Failed to parse chat backup line:', error);
                }
            }
            const content = parsedLines
                .map(l => `${l.name} [${formatTimestamp(l.send_date ?? '')}]\n${l.mes}`)
                .join('\n\n\n');
            setViewing({ name, content });
        } catch (error) {
            console.error('Failed to parse chat backup content:', error);
            getToastr().error?.(t('Failed to parse backup content.'));
        }
    }, [t]);

    const restoreBackup = useCallback(async (name: string) => {
        await commands.restoreChatBackup(name);
    }, [commands]);

    const deleteBackup = useCallback(async (name: string) => {
        setConfirmingDelete(null);
        const response = await apiFetch('/api/backups/chat/delete', { body: { name } });
        if (!response.ok) {
            getToastr().error?.(t('Failed to delete backup, try again later.'));
            console.error('Failed to delete chat backup:', response.statusText);
            return;
        }

        getToastr().success?.(t('Backup deleted successfully.'));
        setBackups(current => current?.filter(backup => backup.file_name !== name) ?? current);
    }, [t]);

    const toggleOpen = useCallback(() => {
        setIsOpen(open => !open);
        setBackups(null);
    }, []);

    return (
        <>
            {createPortal(
                <button
                    type="button"
                    className="menu_button menu_button_icon"
                    data-chat-backups-toggle="true"
                    onClick={toggleOpen}
                >
                    <i className="fa-solid fa-box-open" />
                    <span title={t('Browse chat backups')}>{t('Backups')}</span>
                    <i className={`fa-solid fa-sm ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                </button>,
                buttonContainer,
            )}
            {isOpen && backups !== null && createPortal(
                <div {...stylex.props(styles.list)} data-chat-backups-list="true">
                    {backups.map(backup => (
                        <div key={backup.file_name} {...stylex.props(styles.item)}>
                            <div {...stylex.props(styles.itemName)}>{backup.file_name}</div>
                            <div {...stylex.props(styles.itemInfo)}>
                                {`${formatTimestamp(backup.last_mes)} (${backup.file_size}, ${backup.chat_items} 💬)`}
                            </div>
                            <div {...stylex.props(styles.itemActions)}>
                                <div
                                    className={`right_menu_button fa-solid fa-eye ${stylex.props(styles.itemActionButton).className ?? ''}`}
                                    title={t('View backup')}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => void viewBackup(backup.file_name)}
                                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') void viewBackup(backup.file_name); }}
                                />
                                <div
                                    className={`right_menu_button fa-solid fa-rotate-left ${stylex.props(styles.itemActionButton).className ?? ''}`}
                                    title={t('Restore backup')}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => void restoreBackup(backup.file_name)}
                                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') void restoreBackup(backup.file_name); }}
                                />
                                <div
                                    className={`right_menu_button fa-solid fa-trash ${stylex.props(styles.itemActionButton).className ?? ''}`}
                                    title={t('Delete backup')}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setConfirmingDelete(backup.file_name)}
                                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setConfirmingDelete(backup.file_name); }}
                                />
                            </div>
                        </div>
                    ))}
                </div>,
                listContainer,
            )}
            {viewing !== null && createPortal(
                <div {...stylex.props(styles.dialogOverlay)} onClick={() => setViewing(null)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        {...stylex.props(styles.dialog)}
                        onClick={event => event.stopPropagation()}
                    >
                        <h4 {...stylex.props(styles.dialogTitle)}>{viewing.name}</h4>
                        <textarea
                            className={`text_pole monospace ${stylex.props(styles.dialogTextarea).className ?? ''}`}
                            readOnly
                            value={viewing.content}
                        />
                        <div {...stylex.props(styles.dialogActions)}>
                            <button type="button" className="menu_button" onClick={() => setViewing(null)}>{t('Close')}</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
            {confirmingDelete !== null && createPortal(
                <div {...stylex.props(styles.dialogOverlay)} onClick={() => setConfirmingDelete(null)}>
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        {...stylex.props(styles.dialog, styles.dialogCompact)}
                        onClick={event => event.stopPropagation()}
                    >
                        <p {...stylex.props(styles.dialogText)}>{t('Are you sure?')}</p>
                        <div {...stylex.props(styles.dialogActions)}>
                            <button type="button" className="menu_button" onClick={() => setConfirmingDelete(null)}>{t('Cancel')}</button>
                            <button type="button" className="menu_button" onClick={() => void deleteBackup(confirmingDelete)}>{t('Confirm')}</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
