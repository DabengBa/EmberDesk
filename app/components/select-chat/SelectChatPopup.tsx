import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';

/**
 * Past-chats popup inner markup (React-owned inside #select_chat_popup).
 * #shadow_select_chat_popup shell stays legacy (display/opacity toggles);
 * #select_chat_div is the dynamic list container filled by script.js.
 * Action chrome is Astryx contract buttons; #select_chat_search stays a
 * plain input because legacy code drives it via jQuery .val()/input events.
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
                <ContractButton id="newChatFromManageScreenButton" className="menu_button menu_button_icon" variant="ghost" label="New Chat" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
                <ContractButton id="chat_import_button" className="menu_button menu_button_icon" variant="ghost" label="Import Chat" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                <input type="search" id="select_chat_search" className="text_pole flex1" data-i18n="[placeholder]Search..." placeholder="Search..." autoComplete="off" />
                <ContractIconButton id="select_chat_cross" className="opacity50p hoverglow fontsize120p" label="Close" labelKey="Close" icon={<i className="fa-solid fa-circle-xmark" aria-hidden="true" />} />
            </div>
            <div id="select_chat_div"></div>
        </>
    );
}
