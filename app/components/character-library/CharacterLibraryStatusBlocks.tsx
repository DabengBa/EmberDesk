interface EmptyBlockProps {
    text: string;
    message: string;
    showClearFilters?: boolean;
    onClearFilters?: () => void;
}

export function CharacterLibraryEmptyBlock({
    text,
    message,
    showClearFilters = false,
    onClearFilters,
}: EmptyBlockProps) {
    return (
        <div className="character_list_empty empty_block flex-container flexFlowColumn alignItemsCenter justifyCenter gap10p">
            <div className="empty_block_text">{text}</div>
            <div className="empty_block_message">{message}</div>
            {showClearFilters ? (
                <button type="button" className="menu_button clear_character_filters" onClick={onClearFilters}>
                    Clear filters
                </button>
            ) : null}
        </div>
    );
}

export function CharacterLibraryHiddenBlock({ hiddenCount }: { hiddenCount: number }) {
    const text = hiddenCount > 1
        ? `${hiddenCount} characters hidden.`
        : `${hiddenCount} character hidden.`;
    return (
        <div className="character_list_hidden hidden_block">
            {text}
        </div>
    );
}

export function CharacterLibraryBackBlock({ onBack }: { onBack?: () => void }) {
    return (
        <div
            className="bogus_folder_select bogus_folder_select_back flex-container wide100p alignitemsflexstart"
            id="BogusFolderBack"
            {...{ tagid: 'back' }}
            role="button"
            tabIndex={0}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onBack?.();
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onBack?.();
                }
            }}
        >
            <div className="avatar flex alignitemscenter textAlignCenter">
                <i className="bogus_folder_icon fa-solid fa-xl fa-right-from-bracket fa-flip-horizontal" />
            </div>
            <div className="bogus_folder_back_placeholder flex alignitemscenter textAlignCenter">
                Back
            </div>
        </div>
    );
}
