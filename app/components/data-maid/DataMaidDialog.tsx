import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { apiFetch } from '../../lib/request';
import { humanFileSize } from '../../lib/format';
import { translate as t } from '../../compat/i18n.js';
import { dataMaidStyles as styles } from '../../styles/data-maid.styles';

interface DataMaidRecord {
    name: string;
    hash: string;
    parent?: string;
    size?: number;
    mtime?: number;
}

type DataMaidCategoryKey =
    | 'files'
    | 'images'
    | 'chats'
    | 'groupChats'
    | 'avatarThumbnails'
    | 'personaThumbnails'
    | 'chatBackups'
    | 'settingsBackups';

interface DataMaidReportResult {
    report: Partial<Record<DataMaidCategoryKey, DataMaidRecord[]>>;
    token: string;
}

interface ConfirmRequest {
    text: string;
    action: () => void | Promise<void>;
}

type ToastrLike = {
    success?(message: string): void;
    error?(message: string): void;
    warning?(message: string): void;
    info?(message: string): void;
};

// Mirrors VIDEO_EXTENSIONS in public/scripts/constants.js (client-side preview only).
const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', '3gp', 'mkv', 'mpg'];

function getToastr(): ToastrLike {
    return (globalThis as { toastr?: ToastrLike }).toastr ?? {};
}

function formatDate(mtime: number | undefined): string {
    if (typeof mtime !== 'number') {
        return '';
    }
    const date = new Date(mtime);
    return Number.isNaN(date.getTime())
        ? String(mtime)
        : date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export function DataMaidDialog({ onRequestClose }: { onRequestClose?: () => void }) {


    const categories = useMemo(() => ([
        { key: 'files', name: t('Files'), description: t('Files that are not associated with chat messages or Data Bank. WILL DELETE MANUAL UPLOADS!') },
        { key: 'images', name: t('Images'), description: t('Images that are not associated with chat messages. WILL DELETE MANUAL UPLOADS!') },
        { key: 'chats', name: t('Chats'), description: t('Chat files associated with deleted characters.') },
        { key: 'groupChats', name: t('Group Chats'), description: t('Chat files associated with deleted groups.') },
        { key: 'avatarThumbnails', name: t('Avatar Thumbnails'), description: t('Thumbnails for avatars of missing or deleted characters.') },
        { key: 'personaThumbnails', name: t('Persona Thumbnails'), description: t('Thumbnails for missing or deleted personas.') },
        { key: 'chatBackups', name: t('Chat Backups'), description: t('Automatically generated chat backups.') },
        { key: 'settingsBackups', name: t('Settings Backups'), description: t('Automatically generated settings backups.') },
    ] as { key: DataMaidCategoryKey; name: string; description: string }[]), [t]);

    const [isScanning, setIsScanning] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [report, setReport] = useState<DataMaidReportResult['report'] | null>(null);
    const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
    const [viewing, setViewing] = useState<{ name: string; kind: 'media' | 'text'; url: string; text?: string; isVideo: boolean } | null>(null);
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
    const tokenRef = useRef<string | null>(null);
    const closedRef = useRef(false);

    const scan = useCallback(async () => {
        if (isScanning) {
            getToastr().warning?.(t('The scan is already running. Please wait for it to finish.'));
            return;
        }

        try {
            setIsScanning(true);
            const response = await apiFetch('/api/data-maid/report', { omitContentType: true });
            if (!response.ok) {
                throw new Error(`Error fetching Data Maid report: ${response.statusText}`);
            }
            const result: DataMaidReportResult = await response.json();
            tokenRef.current = result.token;
            setReport(result.report ?? {});
            setHasScanned(true);
        } catch (error) {
            getToastr().error?.(t('An error has occurred. Check the console for details.'));
            console.error('Error generating Data Maid report:', error);
        } finally {
            setIsScanning(false);
        }
    }, [isScanning, t]);

    const getViewUrl = useCallback((hash: string) => (
        `/api/data-maid/view?hash=${encodeURIComponent(hash)}&token=${encodeURIComponent(tokenRef.current ?? '')}`
    ), []);

    const deleteHashes = useCallback(async (hashes: string[]): Promise<boolean> => {
        try {
            const response = await apiFetch('/api/data-maid/delete', { body: { hashes, token: tokenRef.current } });
            if (!response.ok) {
                throw new Error(`Error deleting item: ${response.statusText}`);
            }
            return true;
        } catch (error) {
            console.error('Error deleting item:', error);
            return false;
        }
    }, []);

    const deleteItem = useCallback((categoryKey: DataMaidCategoryKey, hash: string) => {
        setConfirm({
            text: t('This will permanently delete the file. THIS CANNOT BE UNDONE!'),
            action: async () => {
                if (await deleteHashes([hash])) {
                    setReport(current => {
                        if (!current) return current;
                        const items = current[categoryKey]?.filter(item => item.hash !== hash) ?? [];
                        return { ...current, [categoryKey]: items };
                    });
                }
            },
        });
    }, [deleteHashes, t]);

    const deleteCategory = useCallback((categoryKey: DataMaidCategoryKey, items: DataMaidRecord[]) => {
        setConfirm({
            text: t('This will permanently delete all files in this category. THIS CANNOT BE UNDONE!'),
            action: async () => {
                const hashes = items.map(item => item.hash).filter(Boolean);
                if (await deleteHashes(hashes)) {
                    setReport(current => current ? { ...current, [categoryKey]: [] } : current);
                }
            },
        });
    }, [deleteHashes, t]);

    const download = useCallback((item: DataMaidRecord) => {
        const url = getViewUrl(item.hash);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name || item.hash;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, [getViewUrl]);

    const view = useCallback(async (categoryKey: DataMaidCategoryKey, item: DataMaidRecord) => {
        const url = getViewUrl(item.hash);
        const isImage = ['images', 'avatarThumbnails'].includes(categoryKey);
        if (isImage) {
            const isVideo = VIDEO_EXTENSIONS.includes(item.name.split('.').pop() ?? '');
            setViewing({ name: item.name, kind: 'media', url, isVideo });
            return;
        }

        try {
            const response = await fetch(url);
            const text = await response.text();
            setViewing({ name: item.name, kind: 'text', url, text, isVideo: false });
        } catch (error) {
            console.error('Error viewing item:', error);
            getToastr().error?.(t('An error has occurred. Check the console for details.'));
        }
    }, [getViewUrl, t]);

    const toggleCategory = useCallback((key: string) => {
        setOpenCategories(current => {
            const next = new Set(current);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const close = useCallback(async () => {
        if (closedRef.current) {
            return;
        }
        closedRef.current = true;

        if (tokenRef.current) {
            try {
                const response = await apiFetch('/api/data-maid/finalize', { body: { token: tokenRef.current } });
                if (!response.ok) {
                    throw new Error(`Error finalizing Data Maid: ${response.statusText}`);
                }
            } catch (error) {
                console.error('Error finalizing Data Maid:', error);
            }
        }
        onRequestClose?.();
    }, [onRequestClose]);

    const visibleCategories = categories
        .map(category => ({ ...category, items: (report?.[category.key] ?? []).slice().sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0)) }))
        .filter(category => category.items.length > 0);

    return createPortal(
        <div
            {...stylex.props(styles.overlay)}
            onClick={event => { event.stopPropagation(); void close(); }}
            onMouseDown={event => event.stopPropagation()}
            onMouseUp={event => event.stopPropagation()}
            onKeyDown={event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    void close();
                }
            }}
            data-data-maid-overlay="true"
        >
            <div
                role="dialog"
                aria-modal="true"
                {...stylex.props(styles.dialog)}
                onClick={event => event.stopPropagation()}
            >
                <div {...stylex.props(styles.dialogHeader)}>
                    <div className={`info-block warning margin0 ${stylex.props(styles.headerInfo).className ?? ''}`}>
                        <small>{t('Once deleted, the files will be gone forever!')}</small>
                        <br />
                        <small>{t('Make sure to back up your data in advance.')}</small>
                    </div>
                    <button type="button" className="menu_button menu_button_icon" onClick={() => void scan()} disabled={isScanning}>
                        <i className="fa fa-cog" />
                        <span>{t('Scan')}</span>
                    </button>
                    <button type="button" className="menu_button" onClick={() => void close()}>{t('Close')}</button>
                </div>
                <hr />
                {!hasScanned && !isScanning && (
                    <div {...stylex.props(styles.placeholder)}>{t("No results yet. Tap 'Scan' to start scanning.")}</div>
                )}
                {isScanning && (
                    <div {...stylex.props(styles.spinner)}>
                        <i className="fa-solid fa-spinner fa-spin fa-3x" />
                    </div>
                )}
                {hasScanned && !isScanning && visibleCategories.length === 0 && (
                    <div {...stylex.props(styles.placeholder)}>{t('No items found to clean up. Come back later!')}</div>
                )}
                {hasScanned && !isScanning && visibleCategories.length > 0 && (
                    <div {...stylex.props(styles.resultsList)}>
                        {visibleCategories.map(category => {
                            const isOpen = openCategories.has(category.key);
                            return (
                                <div key={category.key} {...stylex.props(styles.category)}>
                                    <div {...stylex.props(styles.categoryToggle)} onClick={() => toggleCategory(category.key)}>
                                        <div {...stylex.props(styles.categoryHeader)}>
                                            <div {...stylex.props(styles.categoryDetails)}>
                                                <div {...stylex.props(styles.categoryName)}>{category.name}</div>
                                                <small>{category.description}</small>
                                                <div {...stylex.props(styles.categoryInfo)}>
                                                    <small>
                                                        <i className="fa-solid fa-file-alt fa-sm" /> {category.items.length}
                                                    </small>
                                                    <span>¦</span>
                                                    <small>
                                                        <i className="fa-solid fa-hdd fa-sm" /> {humanFileSize(category.items.reduce((sum, item) => sum + (item.size ?? 0), 0))}
                                                    </small>
                                                </div>
                                            </div>
                                            <div
                                                className="right_menu_button"
                                                title={t('Delete all items in this category')}
                                                role="button"
                                                tabIndex={0}
                                                onClick={event => { event.stopPropagation(); deleteCategory(category.key, category.items); }}
                                                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); deleteCategory(category.key, category.items); } }}
                                            >
                                                <i className="fa-solid fa-fw fa-broom" />
                                            </div>
                                        </div>
                                        <div className={`fa-solid ${isOpen ? 'fa-circle-chevron-up' : 'fa-circle-chevron-down'} inline-drawer-icon`} />
                                    </div>
                                    {isOpen && (
                                        <div className={`dataMaidCategoryContent ${stylex.props(styles.categoryContent).className ?? ''}`}>
                                            <div {...stylex.props(styles.categoryItems)}>
                                                {category.items.map(item => (
                                                    <div key={item.hash} className={`dataMaidItem ${stylex.props(styles.item).className ?? ''}`} data-hash={item.hash}>
                                                        <div {...stylex.props(styles.itemHeader)}>
                                                            <div {...stylex.props(styles.itemName)}>
                                                                {item.parent && (<><span className="dataMaidItemParent">({item.parent})</span><span>/</span></>)}
                                                                <b>{item.name}</b>
                                                            </div>
                                                            <div {...stylex.props(styles.itemActions)}>
                                                                <button type="button" className={`menu_button menu_button_icon margin0 ${stylex.props(styles.itemActionButton).className ?? ''}`} title={t('View item content')} onClick={() => void view(category.key, item)}>
                                                                    <i className="fa-solid fa-fw fa-eye" />
                                                                </button>
                                                                <button type="button" className={`menu_button menu_button_icon margin0 ${stylex.props(styles.itemActionButton).className ?? ''}`} title={t('Download item')} onClick={() => download(item)}>
                                                                    <i className="fa-solid fa-fw fa-download" />
                                                                </button>
                                                                <button type="button" className={`menu_button menu_button_icon margin0 ${stylex.props(styles.itemActionButton).className ?? ''}`} title={t('Delete this item')} onClick={() => deleteItem(category.key, item.hash)}>
                                                                    <i className="fa-solid fa-fw fa-trash-alt" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div {...stylex.props(styles.itemInfo)}>
                                                            <small>
                                                                <i className="fa-solid fa-file fa-sm" /> {humanFileSize(item.size ?? 0)}
                                                            </small>
                                                            <span>¦</span>
                                                            <small>
                                                                <i className="fa-solid fa-calendar fa-sm" /> {formatDate(item.mtime)}
                                                            </small>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {viewing !== null && createPortal(
                <div
                    {...stylex.props(styles.overlay)}
                    onClick={event => { event.stopPropagation(); setViewing(null); }}
                    onMouseDown={event => event.stopPropagation()}
                    onMouseUp={event => event.stopPropagation()}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.stopPropagation();
                            setViewing(null);
                        }
                    }}
                >
                    <div role="dialog" aria-modal="true" {...stylex.props(styles.viewerDialog)} onClick={event => event.stopPropagation()}>
                        {viewing.kind === 'media'
                            ? (viewing.isVideo
                                ? <video controls src={viewing.url} {...stylex.props(styles.imageView)} />
                                : <img src={viewing.url} alt={viewing.name} {...stylex.props(styles.imageView)} />)
                            : <textarea readOnly {...stylex.props(styles.textView)} value={viewing.text ?? ''} />}
                        <div {...stylex.props(styles.dialogActions)}>
                            <button type="button" className="menu_button" onClick={() => setViewing(null)}>{t('Close')}</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
            {confirm !== null && createPortal(
                <div
                    {...stylex.props(styles.overlay)}
                    onClick={event => { event.stopPropagation(); setConfirm(null); }}
                    onMouseDown={event => event.stopPropagation()}
                    onMouseUp={event => event.stopPropagation()}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.stopPropagation();
                            setConfirm(null);
                        }
                    }}
                >
                    <div role="alertdialog" aria-modal="true" {...stylex.props(styles.confirmDialog)} onClick={event => event.stopPropagation()}>
                        <p {...stylex.props(styles.dialogText)}>{t('Are you sure?')}{'\n'}{confirm.text}</p>
                        <div {...stylex.props(styles.dialogActions)}>
                            <button type="button" className="menu_button" onClick={() => setConfirm(null)}>{t('Cancel')}</button>
                            <button type="button" className="menu_button" onClick={() => { const action = confirm.action; setConfirm(null); void action(); }}>{t('Confirm')}</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>,
        document.body,
    );
}
