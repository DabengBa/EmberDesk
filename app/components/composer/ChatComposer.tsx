import type { KeyboardEvent } from 'react';
import { composerStyles } from '../../styles/composer.styles';
import { ContractIconButton } from '../contract/ContractIconButton';

import { translate, useTranslated } from '@/compat/i18n.js';
/**
 * Chat composer markup (React-owned shell inside #send_form).
 * The textarea stays UNCONTROLLED as a render target: its text value is owned
 * by public/scripts/main-chat-composer-service.js — the single command/state
 * path used by submit flows, STscript commands, macros, and injected composer text,
 * and autocomplete clearing — while user typing reaches the service through
 * native 'input' events. Button visibility is toggled by legacy code
 * (showSendButtons/showStopButtons) via CSS display; this component renders
 * once and never re-renders over those mutations.
 *
 * stscript_* controls stay plain divs: their visibility chain is driven by
 * tag-qualified legacy CSS (`#rightSendForm>div.stscript_btn` under
 * .isExecutingCommandsFromChatInput/.script_paused) which a <button> tag
 * would break. Keyboard activation dispatches a real click so the delegated
 * legacy handlers in public/scripts/dom-handlers.js stay the single command path.
 */
function activateOnEnterOrSpace(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    event.preventDefault();
    event.currentTarget.click();
}

export function ChatComposer() {
    useTranslated('');
    return (
        <>
                <form id="file_form" className="wide100p displayNone">
                    <div className="file_attached">
                        <input id="file_form_input" type="file" multiple hidden />
                        <input id="embed_file_input" type="file" multiple hidden />
                        <i className="fa-solid fa-file-alt" />
                        <span className="file_name">File Name</span>
                        <span className="file_size">File Size</span>
                        <ContractIconButton
                            id="file_form_reset"
                            type="reset"
                            className="menu_button"
                            label="Remove the file"
                            title="Remove the file"
                            icon={<i className="fa fa-times" aria-hidden="true" />}
                            nativeTitle
                        />
                    </div>
                </form>
                <div id="nonQRFormItems">
                    <div id="leftSendForm" className="alignContentCenter">
                        <ContractIconButton
                            id="options_button"
                            aria-expanded="false"
                            aria-controls="options"
                            className="interactable"
                            label="Chat options"
                            title="Chat options"
                            icon={<i className="fa-solid fa-bars" aria-hidden="true" />}
                            nativeTitle
                            tabIndex={0}
                        />
                    </div>
                    <div className="send_textarea_wrap">
                        <textarea id="send_textarea" name="text" data-i18n="[aria-label]Chat message;[no_connection_text]Not connected to API!;[connected_text]Type a message, or /? for help" aria-label="Chat message" aria-describedby="send_textarea_hint" placeholder="Not connected to API!" no_connection_text="Not connected to API!" connected_text="Type a message, or /? for help" autoComplete="off"></textarea>
                        <small id="send_textarea_hint" className="send_textarea_hint" >{translate('Type /? for commands. Send requires an API connection.')}</small>
                    </div>
                    <div id="rightSendForm" className="alignContentCenter">
                        <div id="stscript_continue" title="Continue script execution" className="stscript_btn stscript_continue" role="button" aria-label="Continue script execution" tabIndex={0} onKeyDown={activateOnEnterOrSpace} data-i18n="[title]Continue script execution;[aria-label]Continue script execution">
                            <i className="fa-solid fa-play" />
                        </div>
                        <div id="stscript_pause" title="Pause script execution" className="stscript_btn stscript_pause" role="button" aria-label="Pause script execution" tabIndex={0} onKeyDown={activateOnEnterOrSpace} data-i18n="[title]Pause script execution;[aria-label]Pause script execution">
                            <i className="fa-solid fa-pause" />
                        </div>
                        <div id="stscript_stop" title="Abort script execution" className="stscript_btn stscript_stop" role="button" aria-label="Abort script execution" tabIndex={0} onKeyDown={activateOnEnterOrSpace} data-i18n="[title]Abort script execution;[aria-label]Abort script execution">
                            <i className="fa-solid fa-stop" />
                        </div>
                        <ContractIconButton
                            id="mes_stop"
                            className="mes_stop"
                            label="Abort request"
                            title="Abort request"
                            icon={<i className="fa-solid fa-circle-stop" aria-hidden="true" />}
                            xstyle={composerStyles.idleHidden}
                            nativeTitle
                            tabIndex={0}
                        />
                        <ContractIconButton
                            id="send_but"
                            className="interactable displayNone"
                            label="Send message"
                            title="Send a message"
                            icon={<i className="fa-solid fa-paper-plane" aria-hidden="true" />}
                            nativeTitle
                            tabIndex={0}
                        />
                    </div>
                </div>
        </>
    );
}
