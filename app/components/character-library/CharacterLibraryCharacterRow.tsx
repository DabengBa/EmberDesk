import { useEffect, useRef } from 'react';
import {
    buildCharacterRowClassName,
    buildCharacterRowDomId,
    selectVisibleCharacterTags,
    type CharacterLibraryCharacterRowModel,
} from '@/lib/character-library-row-helpers';

interface CharacterLibraryCharacterRowProps {
    model: CharacterLibraryCharacterRowModel;
    selected?: boolean;
    bulkMode?: boolean;
    onSelect?: (id: string | number) => void;
    onBulkToggle?: (id: string | number, checked: boolean) => void;
}

export function CharacterLibraryCharacterRow({
    model,
    selected = false,
    bulkMode = false,
    onSelect,
    onBulkToggle,
}: CharacterLibraryCharacterRowProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const { visible, skipped } = selectVisibleCharacterTags(model.tags ?? [], {
        tagsDisplayLimit: model.tagsDisplayLimit ?? 50,
    });
    const className = [
        buildCharacterRowClassName({ isFav: model.isFav, isActive: model.isActive }),
        selected ? 'character_selected' : '',
    ].filter(Boolean).join(' ');

    useEffect(() => {
        const node = rootRef.current;
        if (!node) {
            return;
        }
        // Preserve the legacy attribute name used by extension-adjacent selectors.
        node.setAttribute('chid', String(model.id));
    }, [model.id]);

    return (
        <div
            ref={rootRef}
            className={className}
            data-chid={String(model.id)}
            id={buildCharacterRowDomId(model.id)}
            role="button"
            tabIndex={0}
            aria-selected={bulkMode ? selected : undefined}
            onClick={(event) => {
                if (bulkMode) {
                    event.preventDefault();
                    event.stopPropagation();
                    onBulkToggle?.(model.id, !selected);
                }
                // Non-bulk clicks bubble to the established document .character_select handler.
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (bulkMode) {
                        onBulkToggle?.(model.id, !selected);
                    } else {
                        onSelect?.(model.id);
                    }
                }
            }}
        >
            {bulkMode ? (
                <input
                    type="checkbox"
                    className="bulk_select_checkbox"
                    aria-label="Select character for bulk edit"
                    checked={selected}
                    onChange={(event) => {
                        event.stopPropagation();
                        onBulkToggle?.(model.id, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                />
            ) : null}
            <div className="avatar" title={`[Character] ${model.name}\nFile: ${model.avatar}`}>
                <img src={model.avatarUrl} alt={model.name} loading="lazy" decoding="async" />
                <i className="ch_fav_icon fa-solid fa-star" aria-hidden="true" />
            </div>
            <div className="flex-container wide100pLess70px character_select_container">
                <div className="wide100p character_name_block">
                    <small className="entity_type_badge character_type_badge" data-i18n="Character">Character</small>
                    <span className="ch_name" title={`[Character] ${model.name}`}>{model.name}</span>
                    <small className="ch_additional_info ch_add_placeholder">+++</small>
                    {model.isAssistant ? (
                        <small className="ch_assistant" title="This character will be used as a welcome page assistant." data-i18n="[title]This character will be used as a welcome page assistant.">
                            <i className="fa-solid fa-sm fa-user-graduate" />
                        </small>
                    ) : null}
                    {model.auxFieldValue
                        ? <small className="ch_additional_info character_version">{model.auxFieldValue}</small>
                        : <small className="ch_additional_info character_version" style={{ display: 'none' }} />}
                    {model.showAvatarUrl
                        ? <small className="ch_additional_info ch_avatar_url">{model.avatar}</small>
                        : null}
                </div>
                <input className="ch_fav" value={String(model.isFav)} hidden readOnly />
                <div className="ch_description" style={model.description ? undefined : { display: 'none' }}>
                    {model.description || ''}
                </div>
                <div className="tags tags_inline">
                    {visible.map(tag => (
                        <span className="tag" id={`character-card-tag-${tag.id}`} key={tag.id}>
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
