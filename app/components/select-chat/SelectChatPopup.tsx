/**
 * Past-chats popup inner markup (React-owned inside #select_chat_popup).
 * #shadow_select_chat_popup shell stays legacy (display/opacity toggles);
 * #select_chat_div is the dynamic list container filled by script.js.
 */
export function SelectChatPopup() {
    return (
        <>
            <div name="selectChatPopupHeader" className="flex-container alignitemscenter justifySpaceBetween flexGap10">
                <div id="select_chat_import"> {/* import chat popup header */}
                    <form id="form_import_chat" action="javascript:void(null);" method="post" encType="multipart/form-data" style={{ display: 'none' }}>
                        <input type="file" id="chat_import_file" accept=".json, .jsonl" multiple name="avatar" />
                        <input id="chat_import_file_type" name="file_type" className="text_pole" defaultValue="" autoComplete="off" style={{ display: 'none' }} />
                        <input id="chat_import_avatar_url" name="avatar_url" className="text_pole" defaultValue="" autoComplete="off" style={{ display: 'none' }} />
                        <input id="chat_import_character_name" name="character_name" className="text_pole" defaultValue="" autoComplete="off" style={{ display: 'none' }} />
                    </form>
                </div>
                <div id="selectChatPopupHeaderText" className="TxtLrgBoldCenter">
                    <span id="ChatHistoryCharName"></span><span data-i18n="Chat History">Chat History</span>
                    <a href="usage/core-concepts/chatfilemanagement/" className="notes-link" target="_blank"><span className="fa-solid fa-circle-question note-link-span"></span></a>
                </div>
                <div id="newChatFromManageScreenButton" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-plus" />
                    <span data-i18n="New Chat">New Chat</span>
                </div>
                <div id="chat_import_button" className="menu_button menu_button_icon">
                    <i className="fa-solid fa-file-import" />
                    <span data-i18n="Import Chat">Import Chat</span>
                </div>
                <input type="search" id="select_chat_search" className="text_pole flex1" data-i18n="[placeholder]Search..." placeholder="Search..." autoComplete="off" />
                <div id="select_chat_cross" className="opacity50p hoverglow fa-solid fa-circle-xmark fontsize120p" />
            </div>
            <div id="select_chat_div"></div>
        </>
    );
}
