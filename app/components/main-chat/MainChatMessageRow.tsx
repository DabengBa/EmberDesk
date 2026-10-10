import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { MainChatCommands } from '../../compat/workspace-commands';
import type { MainChatMessageRecord } from '../../stores/main-chat-store';
import { translate } from '../../compat/i18n.js';
import { useFrontendFrames } from '../../compat/frontend-frames';

const EMPTY_RENDER = {
    messageHtml: '',
    reasoningHtml: '',
    mediaHtml: '',
    fileHtml: '',
    biasHtml: '',
};

function normalizeClassNames(message: MainChatMessageRecord, isLast: boolean) {
    return [
        'mes',
        ...message.rootClassNames.filter(className => className !== 'mes'),
        ...(message.role === 'user' ? ['is_user'] : []),
        ...(message.lastInContext ? ['lastInContext'] : []),
        ...(message.swipesVisible ? ['swipes_visible'] : []),
        ...(message.lastSwipe ? ['last_swipe'] : []),
        ...(isLast ? ['last_mes'] : []),
    ].join(' ');
}

/**
 * Inserts a legacy `.icon-svg` model icon into a DOM host and upgrades it via
 * the shared `SVGInject` global (set by public/lib.js). The injected <svg>
 * replaces the <img> node, so the element is managed imperatively and kept
 * outside React's child list — matching insertSVGIcon() in message-service.js.
 */
function useModelIcon(
    hostRef: RefObject<HTMLElement | null>,
    api: string | null,
    title: string,
    className: string,
    anchorSelector?: string,
) {
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !api) {
            return;
        }
        const image = document.createElement('img');
        image.className = `icon-svg ${className}`;
        image.src = `/img/${api}.svg`;
        image.title = title;
        image.alt = '';
        const anchor = anchorSelector ? host.querySelector(anchorSelector) : null;
        host.insertBefore(image, anchor);
        void (globalThis as { SVGInject?: (element: Element) => Promise<void> }).SVGInject?.(image);
        return () => {
            host.querySelectorAll(`.icon-svg.${className}`).forEach(node => node.remove());
        };
    }, [hostRef, api, title, className, anchorSelector]);
}

function MessageActionShell({
    message,
    commands,
}: {
    message: MainChatMessageRecord;
    commands?: MainChatCommands;
}) {
    const messageId = message.id;
    const numericMessageId = Number(messageId);
    const canAddressMessage = Number.isInteger(numericMessageId) && numericMessageId >= 0;
    const hintRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const retryGeneration = () => {
        if (canAddressMessage) {
            void commands?.triggerVisibleGeneration({ kind: 'retryGeneration', messageId: numericMessageId });
        }
    };
    const startEditing = () => {
        if (canAddressMessage) {
            void commands?.toggleMessageActionsShell({ kind: 'close' });
            void commands?.startMessageEdit(numericMessageId);
        }
    };
    const copyMessage = () => {
        if (canAddressMessage) {
            void commands?.copyMessage(numericMessageId);
        }
    };
    const deleteMessage = () => {
        if (canAddressMessage) {
            void commands?.deleteMessage(numericMessageId);
        }
    };
    const closeActionsMenu = () => {
        void commands?.toggleMessageActionsShell({ kind: 'close' });
    };
    const openActionsMenu = () => {
        if (canAddressMessage) {
            void commands?.toggleMessageActionsShell({ kind: 'open', messageId: numericMessageId });
        }
    };

    useEffect(() => {
        if (!message.actionsExpanded) {
            return;
        }
        const menu = menuRef.current;
        if (!menu) {
            return;
        }
        const firstVisible = Array.from(menu.querySelectorAll<HTMLElement>('.mes_button'))
            .find(element => element.offsetParent !== null);
        firstVisible?.focus();
    }, [message.actionsExpanded]);

    // Legacy welcome.css hid action buttons on assistant welcome messages via
    // `#chat .mes[type="assistant_message"] .mes_button`. Preserve it structurally.
    const assistantMessage = message.extraType === 'assistant_message';

    return (
        <div
            className="mes_buttons"
            style={{ display: message.editing || assistantMessage ? 'none' : undefined }}
            onKeyDown={event => {
                if (event.key === 'Escape' && message.actionsExpanded) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeActionsMenu();
                    hintRef.current?.focus();
                }
            }}
        >
            {message.failureRetryVisible ? (
                <div
                    className="mes_button generation_failure_retry fa-solid fa-rotate-right"
                    role="button"
                    tabIndex={0}
                    title="Retry generation"
                    aria-label="Retry generation"
                    onClick={retryGeneration}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            retryGeneration();
                        }
                    }}
                />
            ) : null}
            <div
                ref={hintRef}
                title="Message Actions"
                className="mes_button extraMesButtonsHint fa-solid fa-ellipsis"
                data-i18n="[title]Message Actions;[aria-label]Message Actions"
                role="button"
                aria-label="Message Actions"
                aria-haspopup="true"
                tabIndex={0}
                aria-expanded={message.actionsExpanded}
                onClick={event => {
                    event.stopPropagation();
                    openActionsMenu();
                }}
                onKeyDown={event => {
                    if ((event.key === 'Enter' || event.key === ' ') && canAddressMessage) {
                        event.preventDefault();
                        event.stopPropagation();
                        openActionsMenu();
                    }
                }}
            />
            <div
                ref={menuRef}
                className={message.actionsExpanded ? 'extraMesButtons visible' : 'extraMesButtons'}
                style={{ display: message.actionsExpanded ? 'flex' : undefined }}
                onClick={event => {
                    if ((event.target as HTMLElement | null)?.closest?.('.mes_button')) {
                        closeActionsMenu();
                    }
                }}
            >
                <span className="mes_menu_group mes_menu_group_ext">
                    <div title="Translate message" className="mes_button mes_translate fa-solid fa-language" data-i18n="[title]Translate message;[aria-label]Translate message" role="button" aria-label="Translate message" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Translate message')}</span>
                    </div>
                    <div title="Generate Image" className="mes_button sd_message_gen fa-solid fa-paintbrush" data-i18n="[title]Generate Image;[aria-label]Generate Image" role="button" aria-label="Generate Image" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Generate Image')}</span>
                    </div>
                    <div title="Narrate" className="mes_button mes_narrate fa-solid fa-bullhorn" data-i18n="[title]Narrate;[aria-label]Narrate" role="button" aria-label="Narrate" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Narrate')}</span>
                    </div>
                </span>
                <span className="mes_menu_group">
                    <div title="Prompt" className="mes_button mes_prompt fa-solid fa-square-poll-horizontal" data-i18n="[title]Prompt;[aria-label]Prompt" role="button" aria-label="Prompt" tabIndex={0} style={{ display: message.promptButtonVisible ? undefined : 'none' }}>
                        <span className="mes_menu_label">{translate('Prompt')}</span>
                    </div>
                    <div title="Jump to swipe history" className="mes_button mes_swipe_picker fa-solid fa-bookmark" data-i18n="[title]Jump to swipe history;[aria-label]Jump to swipe history" role="button" aria-label="Jump to swipe history" tabIndex={0} style={{ display: message.swipePickerEnabled ? undefined : 'none' }}>
                        <span className="mes_menu_label">{translate('Jump to swipe history')}</span>
                    </div>
                    <div title="Create branch" className="mes_button mes_create_branch fa-regular fa-code-branch" data-i18n="[title]Create Branch;[aria-label]Create branch" role="button" aria-label="Create branch" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Create branch')}</span>
                    </div>
                </span>
                <span className="mes_menu_group">
                    <div title="Toggle media display style" className="mes_button mes_media_gallery fa-solid fa-photo-film" data-i18n="[title]Toggle media display style;[aria-label]Toggle media display style" role="button" aria-label="Toggle media display style" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Gallery view')}</span>
                    </div>
                    <div title="Toggle media display style" className="mes_button mes_media_list fa-solid fa-table-cells-large" data-i18n="[title]Toggle media display style;[aria-label]Toggle media display style" role="button" aria-label="Toggle media display style" tabIndex={0}>
                        <span className="mes_menu_label">{translate('List view')}</span>
                    </div>
                    <div title="Embed file or image" className="mes_button mes_embed fa-solid fa-paperclip" data-i18n="[title]Embed file or image;[aria-label]Embed file or image" role="button" aria-label="Embed file or image" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Embed file or image')}</span>
                    </div>
                    <div title="Exclude message from prompts" className="mes_button mes_hide fa-solid fa-eye" data-i18n="[title]Exclude message from prompts;[aria-label]Exclude message from prompts" role="button" aria-label="Exclude message from prompts" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Exclude message from prompts')}</span>
                    </div>
                    <div title="Include message in prompts" className="mes_button mes_unhide fa-solid fa-eye-slash" data-i18n="[title]Include message in prompts;[aria-label]Include message in prompts" role="button" aria-label="Include message in prompts" tabIndex={0}>
                        <span className="mes_menu_label">{translate('Include message in prompts')}</span>
                    </div>
                </span>
                <span className="mes_menu_group">
                    <div
                        className="mes_button mes_copy fa-solid fa-copy"
                        title="Copy"
                        data-i18n="[title]Copy;[aria-label]Copy"
                        role="button"
                        aria-label="Copy"
                        tabIndex={0}
                        onPointerUp={event => event.stopPropagation()}
                        onClick={event => {
                            event.stopPropagation();
                            copyMessage();
                        }}
                        onKeyDown={event => {
                            if ((event.key === 'Enter' || event.key === ' ') && canAddressMessage) {
                                event.preventDefault();
                                event.stopPropagation();
                                copyMessage();
                            }
                        }}
                    >
                        <span className="mes_menu_label">{translate('Copy')}</span>
                    </div>
                    <div
                        className="mes_button mes_edit_delete fa-solid fa-trash-can"
                        title="Delete this message"
                        data-i18n="[title]Delete this message;[aria-label]Delete this message"
                        role="button"
                        aria-label="Delete this message"
                        tabIndex={0}
                        onClick={event => {
                            event.stopPropagation();
                            deleteMessage();
                        }}
                        onKeyDown={event => {
                            if ((event.key === 'Enter' || event.key === ' ') && canAddressMessage) {
                                event.preventDefault();
                                event.stopPropagation();
                                deleteMessage();
                            }
                        }}
                    >
                        <span className="mes_menu_label">{translate('Delete this message')}</span>
                    </div>
                </span>
            </div>
            <div
                className="mes_button mes_edit fa-solid fa-pencil"
                title="Edit"
                data-i18n="[title]Edit;[aria-label]Edit"
                role="button"
                aria-label="Edit"
                tabIndex={0}
                onClick={event => {
                    event.stopPropagation();
                    startEditing();
                }}
                onKeyDown={event => {
                    if ((event.key === 'Enter' || event.key === ' ') && canAddressMessage) {
                        event.preventDefault();
                        event.stopPropagation();
                        startEditing();
                    }
                }}
            />
        </div>
    );
}

export function MainChatMessageRow({
    message,
    commands,
    isLast = false,
}: {
    message: MainChatMessageRecord;
    commands?: MainChatCommands;
    isLast?: boolean;
}) {
    const render = { ...EMPTY_RENDER, ...message.render };
    const numericMessageId = Number(message.id);
    const canAddressMessage = Number.isInteger(numericMessageId) && numericMessageId >= 0;
    const roleAttributes = {
        mesid: message.id,
        ch_name: message.name,
        is_user: message.role === 'user' ? 'true' : 'false',
        is_system: message.role === 'system' ? 'true' : 'false',
        title: message.title || undefined,
        type: message.extraType || undefined,
    };
    const hasReasoning = render.reasoningHtml !== '' || message.reasoningEditing;
    const metaStripRef = useRef<HTMLDivElement>(null);
    const reasoningHeaderRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    useFrontendFrames(rowRef, message);
    const [avatarFailed, setAvatarFailed] = useState(false);
    useEffect(() => {
        setAvatarFailed(false);
    }, [message.avatarUrl]);
    useModelIcon(metaStripRef, message.modelIconApi, message.modelIconTitle, 'timestamp-icon');
    useModelIcon(reasoningHeaderRef, message.modelIconApi, message.modelIconTitle, 'thinking-icon', '.mes_reasoning_header_title');
    const setReasoningOpen = (open: boolean) => {
        if (canAddressMessage && hasReasoning) {
            void commands?.setMessageReasoningOpen(numericMessageId, open);
        }
    };
    const startReasoningEdit = () => {
        if (canAddressMessage) {
            void commands?.startMessageReasoningEdit(numericMessageId);
        }
    };
    const copyReasoning = () => {
        if (canAddressMessage) {
            void commands?.copyMessageReasoning(numericMessageId);
        }
    };
    const commitReasoningEdit = () => {
        if (canAddressMessage) {
            void commands?.commitMessageReasoningEdit(numericMessageId);
        }
    };
    const cancelReasoningEdit = () => {
        if (canAddressMessage) {
            void commands?.cancelMessageReasoningEdit(numericMessageId);
        }
    };
    const deleteReasoning = () => {
        if (canAddressMessage) {
            void commands?.deleteMessageReasoning(numericMessageId);
        }
    };

    return (
        <div
            ref={rowRef}
            {...roleAttributes}
            className={normalizeClassNames(message, isLast)}
            data-main-chat-message-row-owner="react"
            data-main-chat-message-row={message.id}
            data-main-chat-message-row-state={message.state}
            data-reasoning-state={message.reasoningState ?? undefined}
            data-media-display={message.mediaDisplay ?? undefined}
            onClickCapture={event => {
                if (message.actionsExpanded
                    && !(event.target as HTMLElement | null)?.closest?.('.extraMesButtons, .extraMesButtonsHint')) {
                    void commands?.toggleMessageActionsShell({ kind: 'close' });
                }
            }}
        >
            <div className="for_checkbox" />
            <input type="checkbox" className="del_checkbox" />
            <div className="mesAvatarWrapper">
                <div className="avatar">
                    {avatarFailed ? (
                        <div className="missing-avatar fa-solid fa-user-slash" />
                    ) : (
                        <img
                            src={message.avatarUrl || 'img/No-Image-Placeholder.svg'}
                            alt={message.name}
                            onError={() => setAvatarFailed(true)}
                        />
                    )}
                </div>
                <div className="mes_timer" title={message.timerTitle || undefined}>{message.timer}</div>
            </div>
            <div
                className="swipe_left fa-solid fa-chevron-left"
                role="button"
                aria-label="Previous swipe"
                tabIndex={0}
                onClick={() => {
                    if (canAddressMessage) {
                        void commands?.triggerVisibleGeneration({ kind: 'swipeLeft', messageId: numericMessageId });
                    }
                }}
            />
            <div className="mes_block">
                <div className="ch_name flex-container justifySpaceBetween">
                    <div className="flex-container flex1 alignitemscenter">
                        <div className="flex-container alignItemsBaseline" ref={metaStripRef}>
                            <span className="name_text">{message.name}</span>
                            <i className="mes_ghost fa-solid fa-ghost" title="This message is invisible for the AI" data-i18n="[title]This message is invisible for the AI" aria-hidden="true" />
                            <small className="timestamp" title={message.timestampTitle}>{message.timestamp}</small>
                        </div>
                    </div>
                    <MessageActionShell message={message} commands={commands} />
                        <div className="mes_edit_buttons" style={{ display: message.editing ? 'inline-flex' : undefined }}>
                            <div
                                className="mes_edit_done menu_button fa-solid fa-check"
                                title="Confirm"
                                data-i18n="[title]Confirm;[aria-label]Confirm"
                                role="button"
                                aria-label="Confirm"
                                tabIndex={0}
                                onClick={event => {
                                    event.stopPropagation();
                                    void commands?.commitMessageEdit(numericMessageId);
                                }}
                            />
                            <div
                                className="mes_edit_copy menu_button fa-solid fa-copy"
                                title="Copy this message"
                                data-i18n="[title]Copy this message;[aria-label]Copy this message"
                                role="button"
                                aria-label="Copy this message"
                                tabIndex={0}
                                onClick={event => {
                                    event.stopPropagation();
                                    if (canAddressMessage) {
                                        void commands?.duplicateMessage(numericMessageId);
                                    }
                                }}
                            />
                            <div
                                className="mes_edit_add_reasoning menu_button fa-solid fa-lightbulb"
                                title="Add a reasoning block"
                                data-i18n="[title]Add a reasoning block;[aria-label]Add a reasoning block"
                                role="button"
                                aria-label="Add a reasoning block"
                                tabIndex={0}
                                onClick={event => {
                                    event.stopPropagation();
                                    startReasoningEdit();
                                }}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        startReasoningEdit();
                                    }
                                }}
                            />
                            <div
                                className="mes_edit_delete menu_button fa-solid fa-trash-can"
                                title="Delete this message"
                                data-i18n="[title]Delete this message;[aria-label]Delete this message"
                                role="button"
                                aria-label="Delete this message"
                                tabIndex={0}
                                onClick={event => {
                                    event.stopPropagation();
                                    if (canAddressMessage) {
                                        void commands?.deleteMessage(numericMessageId);
                                    }
                                }}
                            />
                            <div
                                className="mes_edit_up menu_button fa-solid fa-chevron-up"
                                title="Move message up"
                                data-i18n="[title]Move message up;[aria-label]Move message up"
                                role="button"
                                aria-label="Move message up"
                                tabIndex={0}
                                onClick={event => {
                                    event.stopPropagation();
                                    if (canAddressMessage) {
                                        void commands?.moveMessage(numericMessageId, 'up');
                                    }
                                }}
                            />
                            <div
                                className="mes_edit_down menu_button fa-solid fa-chevron-down"
                                title="Move message down"
                                data-i18n="[title]Move message down;[aria-label]Move message down"
                                role="button"
                                aria-label="Move message down"
                                tabIndex={0}
                                onClick={event => {
                                    event.stopPropagation();
                                    if (canAddressMessage) {
                                        void commands?.moveMessage(numericMessageId, 'down');
                                    }
                                }}
                            />
                            <div
                                className="mes_edit_cancel menu_button fa-solid fa-xmark"
                                title="Cancel"
                                data-i18n="[title]Cancel;[aria-label]Cancel"
                                role="button"
                                aria-label="Cancel"
                                tabIndex={0}
                                data-action="cancel-edit"
                                onClick={event => {
                                    event.stopPropagation();
                                    void commands?.cancelMessageEdit(numericMessageId);
                                }}
                            />
                        </div>
                </div>
                <details
                    className="mes_reasoning_details"
                    open={message.reasoningOpen}
                    data-state={message.reasoningState ?? undefined}
                    data-type={message.reasoningType ?? undefined}
                    onClick={event => event.stopPropagation()}
                >
                    <summary
                        className="mes_reasoning_summary flex-container"
                        onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setReasoningOpen(!message.reasoningOpen);
                        }}
                    >
                        <div className="mes_reasoning_header_block flex-container">
                            <div className="mes_reasoning_header flex-container" ref={reasoningHeaderRef}>
                                <span className="mes_reasoning_header_title" data-i18n="Thought for some time">Thought for some time</span>
                                <div className="mes_reasoning_arrow fa-solid fa-chevron-up" />
                            </div>
                        </div>
                        <div className="mes_reasoning_actions flex-container">
                            <div
                                className="mes_reasoning_edit_done menu_button edit_button fa-solid fa-check"
                                title="Confirm"
                                data-i18n="[title]Confirm Edit;[aria-label]Confirm Edit"
                                role="button"
                                aria-label="Confirm Edit"
                                tabIndex={0}
                                onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    commitReasoningEdit();
                                }}
                            />
                            <div
                                className="mes_reasoning_delete menu_button edit_button fa-solid fa-trash-can"
                                title="Remove reasoning"
                                data-i18n="[title]Remove reasoning;[aria-label]Remove reasoning"
                                role="button"
                                aria-label="Remove reasoning"
                                tabIndex={0}
                                onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    deleteReasoning();
                                }}
                            />
                            <div
                                className="mes_reasoning_edit_cancel menu_button edit_button fa-solid fa-xmark"
                                title="Cancel edit"
                                data-i18n="[title]Cancel edit;[aria-label]Cancel edit"
                                role="button"
                                aria-label="Cancel edit"
                                tabIndex={0}
                                onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    cancelReasoningEdit();
                                }}
                            />
                            <div
                                className="mes_reasoning_close_all mes_button fa-solid fa-minimize"
                                title="Collapse all reasoning blocks"
                                data-i18n="[title]Collapse all reasoning blocks;[aria-label]Collapse all reasoning blocks"
                                role="button"
                                aria-label="Collapse all reasoning blocks"
                                tabIndex={0}
                                onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void commands?.collapseAllMessageReasoning();
                                }}
                            />
                            <div
                                className="mes_reasoning_copy mes_button fa-solid fa-copy"
                                title="Copy reasoning"
                                data-i18n="[title]Copy reasoning;[aria-label]Copy reasoning"
                                role="button"
                                aria-label="Copy reasoning"
                                tabIndex={0}
                                onPointerUp={event => event.stopPropagation()}
                                onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    copyReasoning();
                                }}
                            />
                            <div
                                className="mes_reasoning_edit mes_button fa-solid fa-pencil"
                                title="Edit reasoning"
                                data-i18n="[title]Edit reasoning;[aria-label]Edit reasoning"
                                role="button"
                                aria-label="Edit reasoning"
                                tabIndex={0}
                                onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    startReasoningEdit();
                                }}
                            />
                        </div>
                    </summary>
                    {message.reasoningEditing ? (
                        <textarea
                            className="reasoning_edit_textarea"
                            value={message.reasoningEditText}
                            onChange={event => {
                                event.stopPropagation();
                                if (canAddressMessage) {
                                    void commands?.updateMessageReasoningEdit(numericMessageId, event.target.value);
                                }
                            }}
                        />
                    ) : (
                        <div
                            className="mes_reasoning"
                            dangerouslySetInnerHTML={{ __html: render.reasoningHtml }}
                        />
                    )}
                </details>
                {message.editing ? (
                    <textarea
                        id="curEditTextarea"
                        className="edit_textarea"
                        value={message.editText}
                        onChange={event => {
                            void commands?.updateMessageEdit(numericMessageId, event.target.value);
                        }}
                    />
                ) : (
                    <div
                        className={message.inlineMediaText ? 'mes_text inline_media' : 'mes_text'}
                        dangerouslySetInnerHTML={{ __html: render.messageHtml }}
                    />
                )}
                {message.recoveryStatus ? (
                    <div
                        className="generation_auto_recovery_status"
                        role="status"
                        aria-live="polite"
                        data-recovery-stage={message.recoveryStage ?? 'primary'}
                    >
                        <i className="fa-solid fa-circle-notch" aria-hidden="true" />
                        <span>{message.recoveryStatus}</span>
                    </div>
                ) : null}
                {message.failureNoticeVisible ? (
                    <div
                        className="generation_failure_notice"
                        role="status"
                        data-i18n="Generation failed. You can retry this response or keep chatting."
                    >
                        Generation failed. You can retry this response or keep chatting.
                    </div>
                ) : null}
                {message.emptyReplyRegenerateVisible ? (
                    <div
                        className="empty_reply_regenerate"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            if (canAddressMessage) {
                                void commands?.triggerVisibleGeneration({ kind: 'retryGeneration', messageId: numericMessageId });
                            }
                        }}
                        onKeyDown={event => {
                            if ((event.key === 'Enter' || event.key === ' ') && canAddressMessage) {
                                event.preventDefault();
                                void commands?.triggerVisibleGeneration({ kind: 'retryGeneration', messageId: numericMessageId });
                            }
                        }}
                    >
                        <i className="fa-solid fa-arrow-rotate-right" aria-hidden="true" />
                        <span data-i18n="Regenerate">{translate('Regenerate')}</span>
                    </div>
                ) : null}
                <div className="mes_media_wrapper" dangerouslySetInnerHTML={{ __html: render.mediaHtml }} />
                <div className="mes_file_wrapper" dangerouslySetInnerHTML={{ __html: render.fileHtml }} />
                <div className="mes_bias" dangerouslySetInnerHTML={{ __html: render.biasHtml }} />
            </div>
            <div className="flex-container swipeRightBlock flexFlowColumn flexNoGap">
                <div
                    className="swipe_right fa-solid fa-chevron-right"
                    role="button"
                    aria-label="Next swipe"
                    tabIndex={0}
                    onClick={() => {
                        if (canAddressMessage) {
                            void commands?.triggerVisibleGeneration({ kind: 'swipeRight', messageId: numericMessageId });
                        }
                    }}
                />
                <div
                    className={message.swipePickerEnabled ? 'swipes-counter swipe-picker-enabled interactable' : 'swipes-counter'}
                    hidden={message.swipeCounterHidden}
                    role={message.swipePickerEnabled ? 'button' : undefined}
                    title={message.swipePickerEnabled
                        ? (message.swipePickerCanJump ? translate('Click to jump to a swipe') : translate('Click to view swipe history'))
                        : undefined}
                    tabIndex={message.swipePickerEnabled ? 0 : undefined}
                >
                    {message.swipeCount > 0
                        ? `${message.swipeIndex + 1}\u200b/\u200b${message.swipeCount}`
                        : ''}
                </div>
            </div>
        </div>
    );
}
