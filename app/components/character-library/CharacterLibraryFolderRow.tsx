interface CharacterLibraryFolderRowProps {
    id: string | number;
    name: string;
    count: number;
    hiddenCount?: number;
    iconClass?: string;
    color?: string;
    color2?: string;
    isUseless?: boolean;
    onOpen?: (id: string | number) => void;
}

export function CharacterLibraryFolderRow({
    id,
    name,
    count,
    hiddenCount = 0,
    iconClass = 'fa-folder',
    color,
    color2,
    isUseless = false,
    onOpen,
}: CharacterLibraryFolderRowProps) {
    const counter = `${count} ${count !== 1 ? 'characters' : 'character'}`;
    const className = `bogus_folder_select entity_block flex-container wide100p alignitemsflexstart${isUseless ? ' useless' : ''}`;

    return (
        <div
            className={className}
            id={`BogusFolder${id}`}
            // setAttribute for legacy tagid below
            data-tagid={String(id)}
            role="button"
            tabIndex={0}
            ref={(node) => {
                if (node) {
                    node.setAttribute('tagid', String(id));
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen?.(id);
                }
            }}
        >
            <div
                className="avatar flex alignitemscenter textAlignCenter"
                title={`[Folder] ${name}`}
                style={{
                    backgroundColor: color,
                    color: color2,
                }}
            >
                <i className={`bogus_folder_icon fa-solid fa-xl ${iconClass}`} />
            </div>
            <div className="flex-container wide100pLess70px character_select_container">
                <div className="wide100p character_name_block">
                    <span className="ch_name" title={`[Folder] ${name}`}>{name}</span>
                    <small className="ch_additional_info bogus_folder_counter">{counter}</small>
                </div>
                <small className="character_name_block_sub_line bogus_folder_hidden_counter">
                    {hiddenCount > 0 ? `${hiddenCount} hidden` : ''}
                </small>
                <div className="bogus_folder_avatars_block avatars_inline avatars_inline_small tags tags_inline" />
            </div>
        </div>
    );
}
