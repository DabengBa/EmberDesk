import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { apiFetch } from '../../lib/request';
import { translate as t } from '../../compat/i18n.js';
import { chatBackupsStyles as styles } from '../../styles/chat-backups.styles';

export interface ChatBackupsCommands {
    restoreChatBackup(name: string): Promise<string[] | null>;
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

function BackupDialog({ title, onClose, children, returnFocus, destructive = false }: { title: string; onClose(): void; children: ReactNode; returnFocus: HTMLElement | null; destructive?: boolean }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => {
        const dialog = dialogRef.current;
        const trigger = returnFocus ?? document.activeElement;
        dialog?.showModal();
        return () => {
            dialog?.close();
            const target = trigger instanceof HTMLElement && trigger.isConnected
                ? trigger : document.querySelector<HTMLButtonElement>('[data-chat-backups-toggle]');
            target?.focus();
        };
    }, [returnFocus]);

    return createPortal(
        <dialog
            ref={dialogRef}
            {...stylex.props(styles.dialogOverlay)}
            role={destructive ? 'alertdialog' : 'dialog'}
            aria-labelledby={titleId}
            onCancel={event => { event.preventDefault(); onClose(); }}
            onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div {...stylex.props(styles.dialog, destructive && styles.dialogCompact)}>
                <h3 id={titleId} {...stylex.props(styles.dialogTitle)}>{title}</h3>
                {children}
            </div>
        </dialog>,
        document.body,
    );
}

export function ChatBackupsBrowser({ buttonContainer, listContainer, commands, refreshToken = 0 }: ChatBackupsBrowserProps) {

    const [isOpen, setIsOpen] = useState(false);
    const [backups, setBackups] = useState<ChatBackupInfo[] | null>(null);
    const [viewing, setViewing] = useState<{ name: string; content: string } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false);
    const dialogTriggerRef = useRef<HTMLElement | null>(null);
    const [busy, setBusy] = useState<'view' | 'restore' | 'delete' | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [actionError, setActionError] = useState('');
    const [status, setStatus] = useState('');
    const [reload, setReload] = useState(0);
    const listId = useId();

    useEffect(() => {
        if (!isOpen) {
            abortRef.current?.abort();
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setBackups(null);
        setLoadError(false);
        void (async () => {
            try {
                const response = await apiFetch('/api/backups/chat/get', { signal: controller.signal });
                if (!response.ok) throw new Error('Backup list request failed');
                const data: ChatBackupInfo[] = await response.json();
                if (!Array.isArray(data)) throw new Error('Invalid backup list');
                if (!controller.signal.aborted) setBackups(sortBackups(data));
            } catch {
                if (!controller.signal.aborted) setLoadError(true);
            }
        })();
        return () => controller.abort();
    }, [isOpen, refreshToken, reload]);

    const runAction = useCallback(async (kind: 'view' | 'restore' | 'delete', action: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(kind);
        setActionError('');
        setStatus('');
        try {
            await action();
        } catch {
            setActionError(t({ view: 'Could not view the backup. Try again.', restore: 'Could not restore the backup. Try again.', delete: 'Could not delete the backup. Try again.' }[kind]));
        } finally {
            busyRef.current = false;
            setBusy(null);
        }
    }, []);

    const viewBackup = useCallback((name: string) => runAction('view', async () => {
        const response = await apiFetch('/api/backups/chat/download', { body: { name } });
        if (!response.ok) throw new Error('Backup download failed');
        const parsedLines: { name?: string; send_date?: string | number; mes?: string }[] = [];
        const fileText = await response.text();
        for (const line of fileText.split('\n').filter(line => line.trim())) {
            const lineData = JSON.parse(line);
            if (lineData?.mes) parsedLines.push(lineData);
        }
        const content = parsedLines.map(line => `${line.name ?? ''} [${formatTimestamp(line.send_date ?? '')}]\n${line.mes}`).join('\n\n\n');
        setViewing({ name, content });
    }), [runAction]);

    const restoreBackup = useCallback((name: string) => runAction('restore', async () => {
        const result = await commands.restoreChatBackup(name);
        if (!result?.length) throw new Error('Backup restore failed');
        setStatus(t('Backup restored successfully.'));
    }), [commands, runAction]);

    const deleteBackup = useCallback((name: string) => runAction('delete', async () => {
        const response = await apiFetch('/api/backups/chat/delete', { body: { name } });
        if (!response.ok) throw new Error('Backup deletion failed');
        setBackups(current => current?.filter(backup => backup.file_name !== name) ?? current);
        setConfirmingDelete(null);
        setStatus(t('Backup deleted successfully.'));
        getToastr().success?.(t('Backup deleted successfully.'));
    }), [runAction]);

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
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    disabled={busy !== null}
                    onClick={toggleOpen}
                >
                    <i className="fa-solid fa-box-open" aria-hidden="true" />
                    <span title={t('Browse chat backups')}>{t('Backups')}</span>
                    <i className={`fa-solid fa-sm ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
                </button>,
                buttonContainer,
            )}
            {isOpen && createPortal(
                <section id={listId} {...stylex.props(styles.list)} data-chat-backups-list="true" aria-label={t('Chat backups')} aria-busy={busy !== null || (!loadError && backups === null)}>
                    {loadError ? <div role="alert" {...stylex.props(styles.feedback)}><span>{t('Could not load chat backups. Try again.')}</span><button type="button" className="menu_button" onClick={() => setReload(value => value + 1)}>{t('Retry')}</button></div>
                        : backups === null ? <p role="status" {...stylex.props(styles.feedback)}>{t('Loading chat backups…')}</p>
                            : backups.length === 0 ? <p role="status" {...stylex.props(styles.feedback)}>{t('No chat backups yet.')}</p> : null}
                    {busy !== null || status ? <p role="status" {...stylex.props(styles.feedback)}>{busy ? t({ view: 'Loading backup preview…', restore: 'Restoring backup…', delete: 'Deleting backup…' }[busy]) : status}</p> : null}
                    {actionError && !confirmingDelete ? <p role="alert" {...stylex.props(styles.feedback)}>{actionError}</p> : null}
                    {backups?.map(backup => (
                        <div key={backup.file_name} {...stylex.props(styles.item)}>
                            <div {...stylex.props(styles.itemName)}>{backup.file_name}</div>
                            <div {...stylex.props(styles.itemInfo)}>
                                {`${formatTimestamp(backup.last_mes)} (${backup.file_size}, ${backup.chat_items} 💬)`}
                            </div>
                            <div {...stylex.props(styles.itemActions)}>
                                <button
                                    type="button"
                                    className={`right_menu_button fa-solid fa-eye ${stylex.props(styles.itemActionButton).className ?? ''}`}
                                    title={t('View backup')}
                                    aria-label={t('View backup')}
                                    disabled={busy !== null}
                                    onClick={event => { dialogTriggerRef.current = event.currentTarget; void viewBackup(backup.file_name); }}
                                />
                                <button
                                    type="button"
                                    className={`right_menu_button fa-solid fa-rotate-left ${stylex.props(styles.itemActionButton).className ?? ''}`}
                                    title={t('Restore backup')}
                                    aria-label={t('Restore backup')}
                                    disabled={busy !== null}
                                    onClick={() => void restoreBackup(backup.file_name)}
                                />
                                <button
                                    type="button"
                                    className={`right_menu_button fa-solid fa-trash ${stylex.props(styles.itemActionButton).className ?? ''}`}
                                    title={t('Delete backup')}
                                    aria-label={t('Delete backup')}
                                    disabled={busy !== null}
                                    onClick={event => { dialogTriggerRef.current = event.currentTarget; setActionError(''); setConfirmingDelete(backup.file_name); }}
                                />
                            </div>
                        </div>
                    ))}
                </section>,
                listContainer,
            )}
            {viewing !== null && (
                <BackupDialog title={viewing.name} returnFocus={dialogTriggerRef.current} onClose={() => setViewing(null)}>
                    <textarea
                        className={`text_pole monospace ${stylex.props(styles.dialogTextarea).className ?? ''}`}
                        readOnly
                        autoFocus
                        value={viewing.content}
                        aria-label={t('Backup content')}
                    />
                    <div {...stylex.props(styles.dialogActions)}>
                        <button type="button" className="menu_button" onClick={() => setViewing(null)}>{t('Close')}</button>
                    </div>
                </BackupDialog>
            )}
            {confirmingDelete !== null && (
                <BackupDialog title={t('Delete backup?')} returnFocus={dialogTriggerRef.current} destructive onClose={() => { if (!busyRef.current) setConfirmingDelete(null); }}>
                    <p {...stylex.props(styles.dialogText)}>{confirmingDelete}</p>
                    <p {...stylex.props(styles.dialogText)}>{t('This permanently deletes the backup file. Your current chat is not deleted.')}</p>
                    {actionError ? <p role="alert" {...stylex.props(styles.feedback)}>{actionError}</p> : null}
                    {busy === 'delete' ? <p role="status">{t('Deleting backup…')}</p> : null}
                    <div {...stylex.props(styles.dialogActions)}>
                        <button type="button" className="menu_button" autoFocus disabled={busy !== null} onClick={() => setConfirmingDelete(null)}>{t('Cancel')}</button>
                        <button type="button" className="menu_button chat-action-danger" disabled={busy !== null} onClick={() => void deleteBackup(confirmingDelete)}>{t('Delete backup')}</button>
                    </div>
                </BackupDialog>
            )}
        </>
    );
}
