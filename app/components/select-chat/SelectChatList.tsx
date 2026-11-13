import { translate, useTranslated } from '../../compat/i18n.js';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { createHistoryPanelController } from '../../lib/history-panel-service';

/**
 * React-owned past-chat rows rendered inside the legacy #select_chat_div
 * container. Replicates the #past_chat_template markup exactly so delegated
 * document handlers (.select_chat_block load, .renameChatButton,
 * .exportChatButton/.exportRawChatButton, .PastChat_cross), keyboard
 * navigation contracts, and extension selectors keep working unchanged.
 */
export interface SelectChatListItem {
    fileName: string;
    fileSize: string;
    messageCount: number;
    preview: string;
    dateLabel: string;
}

export interface SelectChatListState {
    items: SelectChatListItem[];
    /** file_name of the currently open chat — gets the highlight attribute. */
    currentChat: string;
    avatarImg: string;
    searchQuery: string;
    highlightNames?: string[];
    loading?: boolean;
}

export interface SelectChatListBridge {
    /** Empties the search box and retriggers the input handler (legacy path). */
    clearSearch?(): void;
    openChat?(fileName: string): void | Promise<void>;
    renameChat?(fileName: string): void | Promise<void>;
    exportChat?(fileName: string, format: 'jsonl' | 'txt'): void | Promise<void>;
    deleteChat?(fileName: string): void | Promise<void>;
    highlightRow?(row: HTMLElement): void;
    controller?: ReturnType<typeof createHistoryPanelController<SelectChatListItem>>;
}

function SelectChatRow({ item, avatarImg, isCurrent, bridge }: { item: SelectChatListItem; avatarImg: string; isCurrent: boolean; bridge: SelectChatListBridge }) {
    useTranslated('');
    return (
        <div className="select_chat_block_wrapper flex-container">
            <div
                className="select_chat_block wide100p"
                role="group"
                aria-label={item.fileName}
                tabIndex={-1}
                onClick={bridge.openChat ? event => {
                    if ((event.target as Element).closest('.chat-file-action')) return;
                    event.stopPropagation();
                    void bridge.openChat?.(item.fileName);
                } : undefined}
                {...{ file_name: item.fileName }}
                {...(isCurrent ? { highlight: 'true' } : {})}
            >
                <div className="avatar"><img src={avatarImg} alt="" loading="lazy" decoding="async" /></div>
                <div className="select_chat_name_wrapper">
                    <div className="select_chat_title">
                        <button type="button" className="select_chat_open" aria-label={`${translate('Open chat')}: ${item.fileName}`}>
                            <span className="select_chat_block_filename select_chat_block_filename_item" title={item.fileName}>{item.fileName}</span>
                        </button>
                        <button type="button" title={translate('Rename chat file')} aria-label={translate('Rename chat file')} className="renameChatButton chat-file-action fa-solid fa-pencil fa-sm" data-i18n="[title][aria-label]Rename chat file" onClick={bridge.renameChat ? event => { event.stopPropagation(); void bridge.renameChat?.(item.fileName); } : undefined} />
                    </div>
                    <div className="select_chat_details">
                        <div className="select_chat_info flex-container">
                            <small className="chat_messages_date select_chat_block_filename_item">{item.dateLabel}</small>
                            <small className="chat_file_size select_chat_block_filename_item">({item.fileSize},</small>
                            <small className="chat_messages_num select_chat_block_filename_item">{item.messageCount} 💬)</small>
                        </div>
                        <div className="select_chat_actions flex-container gap10px">
                            <button type="button" title={translate('Export JSONL chat file')} aria-label={translate('Export JSONL chat file')} data-format="jsonl" className="exportRawChatButton chat-file-action fa-solid fa-file-export" data-i18n="[title][aria-label]Export JSONL chat file" onClick={bridge.exportChat ? event => { event.stopPropagation(); void bridge.exportChat?.(item.fileName, 'jsonl'); } : undefined} />
                            <button type="button" title={translate('Download chat as plain text document')} aria-label={translate('Download chat as plain text document')} data-format="txt" className="exportChatButton chat-file-action fa-solid fa-file-lines" data-i18n="[title][aria-label]Download chat as plain text document" onClick={bridge.exportChat ? event => { event.stopPropagation(); void bridge.exportChat?.(item.fileName, 'txt'); } : undefined} />
                            <button type="button" title={translate('Delete chat file')} aria-label={translate('Delete chat file')} {...{ file_name: item.fileName }} className="PastChat_cross chat-file-action fa-solid fa-trash-can" data-i18n="[title][aria-label]Delete chat file" onClick={bridge.deleteChat ? event => { event.stopPropagation(); void bridge.deleteChat?.(item.fileName); } : undefined} />
                        </div>
                    </div>
                </div>
                <div className="select_chat_block_mes">{item.preview}</div>
            </div>
        </div>
    );
}

export function SelectChatList({ state, bridge }: { state: SelectChatListState; bridge: SelectChatListBridge }) {
    useTranslated('');
    const highlightedItems = useRef<SelectChatListItem[] | null>(null);
    useLayoutEffect(() => {
        if (state.loading || highlightedItems.current === state.items || !state.highlightNames?.length) return;
        highlightedItems.current = state.items;
        const container = document.getElementById('select_chat_div');
        if (!container) return;
        const rows = Array.from(container.querySelectorAll<HTMLElement>('.select_chat_block_wrapper'));
        for (const name of state.highlightNames) {
            const row = rows.find(element => element.querySelector('.select_chat_block')?.getAttribute('file_name') === name);
            if (!row) continue;
            container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top;
            bridge.highlightRow?.(row);
        }
    }, [state.items, state.highlightNames, state.loading, bridge]);
    if (state.items.length === 0) {
        return (
            <output id="select_chat_empty" className="select_chat_empty">
                <span>{state.searchQuery ? translate('No chats match your search.') : translate('No saved chats yet.')}</span>
                {state.searchQuery ? (
                    <button type="button" className="menu_button" onClick={() => bridge.clearSearch?.()}>
                        {translate('Clear search')}
                    </button>
                ) : null}
            </output>
        );
    }

    return (
        <>
            {state.items.map(item => (
                <SelectChatRow
                    key={item.fileName}
                    item={item}
                    avatarImg={state.avatarImg}
                    isCurrent={state.currentChat === item.fileName}
                    bridge={bridge}
                />
            ))}
        </>
    );
}

/** Subscribe at the React boundary so loaded rows and search state have one owner. */
export function LiveSelectChatList({ controller, state, bridge }: { controller: NonNullable<SelectChatListBridge['controller']>; state: SelectChatListState; bridge: SelectChatListBridge }) {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    useLayoutEffect(() => {
        controller.commitRenderedSelection(snapshot.items.find(item => item.fileName === state.currentChat)?.fileName ?? null);
        return () => controller.commitRenderedSelection(null);
    });
    return <SelectChatList state={{ ...state, items: snapshot.items, searchQuery: snapshot.searchQuery, highlightNames: snapshot.highlightNames, loading: snapshot.loading }} bridge={bridge} />;
}
