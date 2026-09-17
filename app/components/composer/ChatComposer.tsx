/**
 * Chat composer markup (React-owned shell inside #send_form).
 * Behavior stays legacy: send_textarea is intentionally UNCONTROLLED because
 * Quick Reply injection, STscript /send, macros, impersonate and autocomplete
 * all write it via jQuery .val() + dispatched input events. Button visibility
 * is toggled by legacy code (showSendButtons/showStopButtons) via CSS display;
 * this component renders once and never re-renders over those mutations.
 */
export function ChatComposer() {
    return (
        <>
                <form id="file_form" className="wide100p displayNone">
                    <div className="file_attached">
                        <input id="file_form_input" type="file" multiple hidden />
                        <input id="embed_file_input" type="file" multiple hidden />
                        <i className="fa-solid fa-file-alt" />
                        <span className="file_name">File Name</span>
                        <span className="file_size">File Size</span>
                        <button id="file_form_reset" type="reset" className="menu_button" title="Remove the file" data-i18n="[title]Remove the file">
                            <i className="fa fa-times" />
                        </button>
                    </div>
                </form>
                <div id="nonQRFormItems">
                    <div id="leftSendForm" className="alignContentCenter">
                        <div id="options_button" className="fa-solid fa-bars interactable" title="Chat options" data-i18n="[title]Chat options;[aria-label]Chat options" role="button" aria-label="Chat options" tabIndex={0}></div>
                    </div>
                    <div className="send_textarea_wrap">
                        <textarea id="send_textarea" name="text" className="mdHotkeys" data-i18n="[aria-label]Chat message;[no_connection_text]Not connected to API!;[connected_text]Type a message, or /? for help" aria-label="Chat message" aria-describedby="send_textarea_hint" placeholder="Not connected to API!" no_connection_text="Not connected to API!" connected_text="Type a message, or /? for help" autoComplete="off"></textarea>
                        <small id="send_textarea_hint" className="send_textarea_hint" data-i18n="Type /? for commands. Send requires an API connection.">Type /? for commands. Send requires an API connection.</small>
                    </div>
                    <div id="rightSendForm" className="alignContentCenter">
                        <div id="stscript_continue" title="Continue script execution" className="stscript_btn stscript_continue" data-i18n="[title]Continue script execution">
                            <i className="fa-solid fa-play" />
                        </div>
                        <div id="stscript_pause" title="Pause script execution" className="stscript_btn stscript_pause" data-i18n="[title]Pause script execution">
                            <i className="fa-solid fa-pause" />
                        </div>
                        <div id="stscript_stop" title="Abort script execution" className="stscript_btn stscript_stop" data-i18n="[title]Abort script execution">
                            <i className="fa-solid fa-stop" />
                        </div>
                        <div id="mes_stop" title="Abort request" className="mes_stop" data-i18n="[title]Abort request;[aria-label]Abort request" role="button" aria-label="Abort request" tabIndex={0}>
                            <i className="fa-solid fa-circle-stop" />
                        </div>
                        <div id="mes_impersonate" className="fa-solid fa-user-secret interactable displayNone" title="Ask AI to write your message for you" data-i18n="[title]Ask AI to write your message for you;[aria-label]Ask AI to write your message" role="button" aria-label="Ask AI to write your message" tabIndex={0}></div>
                        <div id="mes_continue" className="fa-fw fa-solid fa-arrow-right interactable displayNone" title="Continue the last message" data-i18n="[title]Continue the last message;[aria-label]Continue last message" role="button" aria-label="Continue last message" tabIndex={0}></div>
                        <div id="send_but" className="fa-solid fa-paper-plane interactable displayNone" title="Send a message" data-i18n="[title]Send a message;[aria-label]Send message" role="button" aria-label="Send message" tabIndex={0}></div>
                    </div>
                </div>
        </>
    );
}
