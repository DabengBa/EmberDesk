import { translate } from '../../compat/i18n.js';

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
}

export interface SelectChatListBridge {
    /** Empties the search box and retriggers the input handler (legacy path). */
    clearSearch?(): void;
}

function SelectChatRow({ item, avatarImg, isCurrent }: { item: SelectChatListItem; avatarImg: string; isCurrent: boolean }) {
    return (
        <div className="select_chat_block_wrapper flex-container">
            <div
                className="select_chat_block wide100p"
                role="group"
                aria-label={item.fileName}
                tabIndex={-1}
                {...{ file_name: item.fileName }}
                {...(isCurrent ? { highlight: 'true' } : {})}
            >
                <div className="avatar"><img src={avatarImg} alt="" loading="lazy" decoding="async" /></div>
                <div className="select_chat_name_wrapper">
                    <div className="select_chat_title">
                        <button type="button" className="select_chat_open" aria-label={`${translate('Open chat')}: ${item.fileName}`}>
                            <span className="select_chat_block_filename select_chat_block_filename_item" title={item.fileName}>{item.fileName}</span>
                        </button>
                        <button type="button" title={translate('Rename chat file')} aria-label={translate('Rename chat file')} className="renameChatButton chat-file-action fa-solid fa-pencil fa-sm" data-i18n="[title][aria-label]Rename chat file" />
                    </div>
                    <div className="select_chat_details">
                        <div className="select_chat_info flex-container">
                            <small className="chat_messages_date select_chat_block_filename_item">{item.dateLabel}</small>
                            <small className="chat_file_size select_chat_block_filename_item">({item.fileSize},</small>
                            <small className="chat_messages_num select_chat_block_filename_item">{item.messageCount} 💬)</small>
                        </div>
                        <div className="select_chat_actions flex-container gap10px">
                            <button type="button" title={translate('Export JSONL chat file')} aria-label={translate('Export JSONL chat file')} data-format="jsonl" className="exportRawChatButton chat-file-action fa-solid fa-file-export" data-i18n="[title][aria-label]Export JSONL chat file" />
                            <button type="button" title={translate('Download chat as plain text document')} aria-label={translate('Download chat as plain text document')} data-format="txt" className="exportChatButton chat-file-action fa-solid fa-file-lines" data-i18n="[title][aria-label]Download chat as plain text document" />
                            <button type="button" title={translate('Delete chat file')} aria-label={translate('Delete chat file')} {...{ file_name: item.fileName }} className="PastChat_cross chat-file-action fa-solid fa-trash-can" data-i18n="[title][aria-label]Delete chat file" />
                        </div>
                    </div>
                </div>
                <div className="select_chat_block_mes">{item.preview}</div>
            </div>
        </div>
    );
}

export function SelectChatList({ state, bridge }: { state: SelectChatListState; bridge: SelectChatListBridge }) {
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
                />
            ))}
        </>
    );
}
