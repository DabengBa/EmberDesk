import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { composerStyles } from '../../styles/composer.styles';
import { ContractIconButton } from '../contract/ContractIconButton';

import { translate, useTranslated } from '@/compat/i18n.js';
/**
 * React owns input events and renders the shared composer service snapshot.
 * The shell passes its service instance across the bundle boundary. Existing
 * generation controls still set button visibility through the preserved IDs.
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

type ComposerService = typeof import('../../../public/scripts/main-chat-composer-service.js');
type ComposerSnapshot = ReturnType<ComposerService['getComposerSnapshot']>;

export interface ChatComposerProps {
    composer: Pick<ComposerService, 'getComposerSnapshot' | 'subscribeComposerState' | 'setComposerValue' | 'updateComposerInteraction' | 'requestComposerFocus'>;
    submit: (submission: ComposerSnapshot) => Promise<unknown>;
    stop: () => void;
    shouldSendOnEnter: () => boolean;
}

export function ChatComposer({ composer, submit, stop, shouldSendOnEnter }: ChatComposerProps) {
    useTranslated('');
    const snapshot = useSyncExternalStore(composer.subscribeComposerState, composer.getComposerSnapshot);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const focusRequest = useRef(0);
    const restoreFocus = useRef(false);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        if (focusRequest.current !== snapshot.focusRequest) {
            focusRequest.current = snapshot.focusRequest;
            textarea.focus({ preventScroll: true });
        }
        if (!snapshot.composing && (textarea.selectionStart !== snapshot.selectionStart || textarea.selectionEnd !== snapshot.selectionEnd || textarea.selectionDirection !== snapshot.selectionDirection)) {
            textarea.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection);
        }
    }, [snapshot, composer]);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        if (CSS.supports('field-sizing', 'content')) {
            textarea.style.height = 'auto';
            return;
        }
        const chat = document.getElementById('chat');
        const bottom = chat ? chat.scrollHeight - chat.scrollTop - chat.offsetHeight : 0;
        textarea.style.height = '1px';
        textarea.style.height = `${textarea.scrollHeight}px`;
        if (chat && !navigator.userAgent.toLowerCase().includes('firefox')) {
            chat.scrollTop = chat.scrollHeight - chat.offsetHeight - bottom;
        }
    }, [snapshot.value]);

    useEffect(() => {
        const chat = document.getElementById('chat');
        if (!chat || !CSS.supports('field-sizing', 'content')) return;
        let lastHeight = chat.offsetHeight;
        const observer = new ResizeObserver(() => {
            const height = chat.offsetHeight;
            const delta = height - lastHeight;
            if (Math.abs(chat.scrollHeight - chat.scrollTop - height) > 1 && Math.abs(delta) > 1) {
                chat.scrollTop -= delta;
            }
            lastHeight = height;
        });
        observer.observe(chat);
        return () => observer.disconnect();
    }, []);

    const restoreInputFocus = () => {
        const active = document.activeElement;
        if (restoreFocus.current && (active === document.body || active?.closest('#send_but, #mes_stop'))) {
            composer.requestComposerFocus();
        }
    };
    const send = () => {
        const submission = composer.getComposerSnapshot();
        void submit(submission).catch(error => console.error('Composer submission failed', error));
        restoreInputFocus();
    };
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || snapshot.composing || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || !shouldSendOnEnter()) return;
        event.preventDefault();
        event.stopPropagation();
        send();
    };
    const selection = (textarea: HTMLTextAreaElement) => ({
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        selectionDirection: textarea.selectionDirection,
    });
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
                        <textarea id="send_textarea" name="text" data-i18n="[aria-label]Chat message;[no_connection_text]Not connected to API!;[connected_text]Type a message, or /? for help" aria-label="Chat message" aria-describedby="send_textarea_hint" placeholder="Not connected to API!" no_connection_text="Not connected to API!" connected_text="Type a message, or /? for help" autoComplete="off" enterKeyHint="send"
                            ref={textareaRef}
                            value={snapshot.value}
                            onChange={event => composer.setComposerValue(event.currentTarget.value, selection(event.currentTarget))}
                            onSelect={event => {
                                if (event.currentTarget.value === composer.getComposerSnapshot().value) composer.updateComposerInteraction(selection(event.currentTarget));
                            }}
                            onCompositionStart={() => composer.updateComposerInteraction({ composing: true })}
                            onCompositionEnd={event => {
                                composer.setComposerValue(event.currentTarget.value, selection(event.currentTarget));
                                composer.updateComposerInteraction({ composing: false });
                            }}
                            onFocus={() => {
                                restoreFocus.current = true;
                                composer.updateComposerInteraction({ focused: true });
                            }}
                            onBlur={event => {
                                restoreFocus.current = event.relatedTarget instanceof Element && Boolean(event.relatedTarget.closest('#send_but, #mes_stop'));
                                composer.updateComposerInteraction({ focused: false, composing: false });
                            }}
                            onKeyDown={onKeyDown}
                        ></textarea>
                        <small id="send_textarea_hint" className="send_textarea_hint" aria-live="polite">{translate('Type /? for commands. Send requires an API connection.')}</small>
                        <a id="composer_connect_link" className="send_textarea_hint" href="/settings">{translate('Open connection settings →')}</a>
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
                            onClick={() => { stop(); restoreInputFocus(); }}
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
                            onClick={send}
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
