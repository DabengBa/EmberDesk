import type { MainChatCommands } from '../../compat/workspace-commands';
import type { MainChatMessageRecord } from '../../stores/main-chat-store';

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
    const retryGeneration = () => {
        if (canAddressMessage) {
            void commands?.triggerVisibleGeneration({ kind: 'retryGeneration', messageId: numericMessageId });
        }
    };
    const startEditing = () => {
        if (canAddressMessage) {
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

    return (
        <div className="mes_buttons" style={{ display: message.editing ? 'none' : undefined }}>
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
                title="Message Actions"
                className="mes_button extraMesButtonsHint fa-solid fa-ellipsis"
                role="button"
                aria-label="Message Actions"
                tabIndex={0}
                aria-expanded={message.actionsExpanded}
                style={{ display: message.actionsExpanded ? 'none' : undefined }}
                onClick={event => {
                    event.stopPropagation();
                    if (canAddressMessage) {
                        void commands?.toggleMessageActionsShell({ kind: 'open', messageId: numericMessageId });
                    }
                }}
                onKeyDown={event => {
                    if ((event.key === 'Enter' || event.key === ' ') && canAddressMessage) {
                        event.preventDefault();
                        event.stopPropagation();
                        void commands?.toggleMessageActionsShell({ kind: 'open', messageId: numericMessageId });
                    }
                }}
            />
            <div
                className={message.actionsExpanded ? 'extraMesButtons visible' : 'extraMesButtons'}
                style={{ display: message.actionsExpanded ? 'flex' : undefined }}
            >
                <div className="mes_button mes_translate fa-solid fa-language" role="button" aria-label="Translate message" tabIndex={0} />
                <div className="mes_button sd_message_gen fa-solid fa-paintbrush" role="button" aria-label="Generate Image" tabIndex={0} />
                <div className="mes_button mes_narrate fa-solid fa-bullhorn" role="button" aria-label="Narrate" tabIndex={0} />
                <div className="mes_button mes_prompt fa-solid fa-square-poll-horizontal" role="button" aria-label="Prompt" tabIndex={0} />
                <div className="mes_button mes_hide fa-solid fa-eye" role="button" aria-label="Exclude message from prompts" tabIndex={0} />
                <div className="mes_button mes_unhide fa-solid fa-eye-slash" role="button" aria-label="Include message in prompts" tabIndex={0} />
                <div className="mes_button mes_media_gallery fa-solid fa-photo-film" role="button" aria-label="Toggle media display style" tabIndex={0} />
                <div className="mes_button mes_media_list fa-solid fa-table-cells-large" role="button" aria-label="Toggle media display style" tabIndex={0} />
                <div className="mes_button mes_embed fa-solid fa-paperclip" role="button" aria-label="Embed file or image" tabIndex={0} />
                <div className="mes_button mes_swipe_picker fa-solid fa-bookmark" role="button" aria-label="Jump to swipe history" tabIndex={0} />
                <div className="mes_button mes_create_bookmark fa-regular fa-flag-checkered" role="button" aria-label="Create checkpoint" tabIndex={0} />
                <div className="mes_button mes_create_branch fa-regular fa-code-branch" role="button" aria-label="Create branch" tabIndex={0} />
                <div
                    className="mes_button mes_copy fa-solid fa-copy"
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
                />
                <div
                    className="mes_button mes_edit_delete fa-solid fa-trash-can"
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
                />
            </div>
            <div className="mes_button mes_bookmark fa-solid fa-flag" role="button" aria-label="Open checkpoint chat" tabIndex={0} />
            <div
                className="mes_button mes_edit fa-solid fa-pencil"
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
        bookmark_link: message.bookmarkLink,
        title: message.title || undefined,
    };
    const hasReasoning = render.reasoningHtml !== '' || message.reasoningEditing;
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
            {...roleAttributes}
            className={normalizeClassNames(message, isLast)}
            data-main-chat-message-row-owner="react"
            data-main-chat-message-row={message.id}
            data-main-chat-message-row-state={message.state}
        >
            <div className="for_checkbox" />
            <input type="checkbox" className="del_checkbox" />
            <div className="mesAvatarWrapper">
                <div className="avatar">
                    <img src={message.avatarUrl || 'img/No-Image-Placeholder.svg'} alt={message.name} />
                </div>
                <div className="mesIDDisplay">#{message.id}</div>
                <div className="mes_timer" />
                {message.tokenCount !== null ? (
                    <div className="tokenCounterDisplay">{message.tokenCount}t</div>
                ) : null}
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
                        <div className="flex-container alignItemsBaseline">
                            <span className="name_text">{message.name}</span>
                            <i className="mes_ghost fa-solid fa-ghost" aria-hidden="true" />
                            <small className="timestamp" title={message.timestampTitle}>{message.timestamp}</small>
                        </div>
                    </div>
                    <MessageActionShell message={message} commands={commands} />
                        <div className="mes_edit_buttons" style={{ display: message.editing ? 'inline-flex' : undefined }}>
                            <div
                                className="mes_edit_done menu_button fa-solid fa-check"
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
                                role="button"
                                aria-label="Cancel"
                                tabIndex={0}
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
                            <div className="mes_reasoning_header flex-container">
                                <span className="mes_reasoning_header_title">Thought for some time</span>
                                <div className="mes_reasoning_arrow fa-solid fa-chevron-up" />
                            </div>
                        </div>
                        <div className="mes_reasoning_actions flex-container">
                            <div
                                className="mes_reasoning_edit_done menu_button edit_button fa-solid fa-check"
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
                        className="edit_textarea mdHotkeys"
                        value={message.editText}
                        onChange={event => {
                            void commands?.updateMessageEdit(numericMessageId, event.target.value);
                        }}
                    />
                ) : (
                    <div className="mes_text" dangerouslySetInnerHTML={{ __html: render.messageHtml }} />
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
                        <span>重新生成</span>
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
                <div className="swipes-counter" hidden={message.swipeCounterHidden}>
                    {message.swipeCount > 0
                        ? `${message.swipeIndex + 1}\u200b/\u200b${message.swipeCount}`
                        : ''}
                </div>
            </div>
        </div>
    );
}
