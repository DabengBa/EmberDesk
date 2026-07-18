import {
    selectVisibleCharacterTags,
    type CharacterLibraryTagModel,
} from '@/lib/character-library-row-helpers';

interface CharacterLibraryGroupRowProps {
    id: string | number;
    name: string;
    memberNames?: string[];
    memberCount?: number;
    isFav?: boolean;
    avatarHtml?: string | null;
    tags?: CharacterLibraryTagModel[];
    onSelect?: (id: string | number) => void;
}

export function CharacterLibraryGroupRow({
    id,
    name,
    memberNames = [],
    memberCount,
    isFav = false,
    avatarHtml,
    tags = [],
    onSelect,
}: CharacterLibraryGroupRowProps) {
    const count = memberCount ?? memberNames.length;
    const counter = `${count} ${count !== 1 ? 'characters' : 'character'}`;
    const className = `group_select entity_block flex-container wide100p alignitemsflexstart${isFav ? ' is_fav' : ''}`;
    const { visible, skipped } = selectVisibleCharacterTags(tags, {
        shouldPrintTag: tag => Boolean(tag.forceVisible),
    });

    return (
        <div
            className={className}
            data-grid={String(id)}
            role="button"
            tabIndex={0}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect?.(id);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect?.(id);
                }
            }}
        >
            {avatarHtml
                ? <div className="avatar" dangerouslySetInnerHTML={{ __html: avatarHtml }} />
                : (
                    <div className="avatar">
                        <img src="img/No-Image-Placeholder.svg" alt="" />
                    </div>
                )}
            <div className="flex-container wide100pLess70px gap5px group_select_container">
                <div className="wide100p group_name_block character_name_block">
                    <small className="entity_type_badge group_type_badge" data-i18n="Group">Group</small>
                    <div className="ch_name" title={`[Group] ${name}`}>{name}</div>
                    <small className="ch_additional_info group_select_counter">{counter}</small>
                </div>
                <small className="character_name_block_sub_line" data-i18n="in this group">in this group</small>
                <i className="group_fav_icon fa-solid fa-star" style={{ display: 'none' }} />
                <input className="ch_fav" value={String(isFav)} hidden readOnly />
                <div className="group_select_block_list ch_description">{memberNames.join(', ')}</div>
                <div className="tags tags_inline">
                    {visible.map(tag => (
                        <span className="tag" id={tag.id} key={tag.id}>
                            <span className="tag_name">{tag.name}</span>
                        </span>
                    ))}
                    {skipped > 0 ? (
                        <span className="tag tag_placeholder">
                            <span className="tag_name">+{skipped}</span>
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
