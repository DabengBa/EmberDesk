import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEventHandler, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { translate, useTranslated } from '../../compat/i18n.js';
import { tagSurfaceStyles as s } from '../../styles/tags.styles';
import {
    TAG_FOLDER_DEFAULT_VIEW,
    TAG_FOLDER_VIEWS,
    type TagColorField,
    type TagView,
} from './types';

const DEFAULT_TAG_BACKGROUND = 'rgba(0, 0, 0, 0.5)';

function defaultTagTextColor(): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBodyColor').trim();
    return value || '#ffffff';
}

function IconAction({ className, title, ariaLabel, onClick, onMouseDown, tabIndex, children }: {
    className: string;
    title: string;
    ariaLabel: string;
    onClick(): void;
    onMouseDown?: MouseEventHandler<HTMLDivElement>;
    tabIndex?: number;
    children?: ReactNode;
}) {
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        // Legacy tags.js keeps document-level delegates for these classes
        // (.tag_delete/.tag_as_folder/.tag_view_name). Stop before they run.
        event.stopPropagation();
        onClick();
    };
    return (
        <div
            className={`${className} ${stylex.props(s.focusable).className ?? ''}`}
            role="button"
            tabIndex={tabIndex ?? 0}
            title={title}
            aria-label={ariaLabel}
            onMouseDown={onMouseDown}
            onClick={event => {
                event.stopPropagation();
                onClick();
            }}
            onKeyDown={onKeyDown}

        >
            {children}
        </div>
    );
}

function TagColorPicker({ field, value, onChange }: {
    field: TagColorField;
    value: string;
    onChange(value: string): void;
}) {
    const pickerRef = useRef<HTMLElement | null>(null);
    const defaultColor = field === 'color' ? DEFAULT_TAG_BACKGROUND : defaultTagTextColor();
    const onChangeRef = useRef(onChange);
    const synchronizing = useRef(false);
    onChangeRef.current = onChange;

    useLayoutEffect(() => {
        const picker = pickerRef.current;
        const color = value || defaultColor;
        if (!picker || picker.getAttribute('color') === color) return;
        synchronizing.current = true;
        try {
            picker.setAttribute('color', color);
        } finally {
            synchronizing.current = false;
        }
    }, [value, defaultColor]);

    useEffect(() => {
        const picker = pickerRef.current;
        if (!picker) {
            return;
        }
        const handleChange = (event: Event) => {
            if (synchronizing.current) return;
            const rgba = (event as CustomEvent<{ rgba?: string }>).detail?.rgba ?? '';
            onChangeRef.current(rgba === defaultColor ? '' : rgba);
        };
        picker.addEventListener('change', handleChange);
        return () => picker.removeEventListener('change', handleChange);
    }, [defaultColor]);

    return (
        <>
            <toolcool-color-picker
                ref={pickerRef}
                className={field === 'color' ? 'tag-color' : 'tag-color2'}
                data-default-color={defaultColor}
            />
            {value ? (
                <IconAction
                    className="fas fa-link fa-xs link_icon right_menu_button"
                    title={translate('Link to theme color')}
                    ariaLabel={translate('Link to theme color')}
                    onMouseDown={event => {
                        // Keep the picker's focused field mounted until the
                        // reset click is delivered.
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onClick={() => onChange('')}
                />
            ) : null}
        </>
    );
}

export interface TagManagementRowProps {
    tag: TagView;
    disabled: boolean;
    dragging: boolean;
    onRename(id: string, name: string): boolean;
    onDelete(id: string): void;
    onCycleFolder(id: string): void;
    onToggleHidden(id: string): void;
    onColorChange(id: string, field: TagColorField, value: string): void;
    onMove(id: string, direction: -1 | 1): void;
    onDragStart(id: string): void;
    onDragEnd(): void;
    onDragOver(id: string): void;
    onDrop(id: string): void;
}

export function TagManagementRow({
    tag,
    disabled,
    dragging,
    onRename,
    onDelete,
    onCycleFolder,
    onToggleHidden,
    onColorChange,
    onMove,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
}: TagManagementRowProps) {
    useTranslated('');
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(tag.name);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const folder = TAG_FOLDER_VIEWS[tag.folder_type ?? ''] ?? TAG_FOLDER_DEFAULT_VIEW;
    const hidden = tag.is_hidden_on_character_card === true;
    const hideTooltip = hidden ? translate('Hide on character card') : translate('Show on character card');

    useEffect(() => {
        if (!editing) {
            setDraft(tag.name);
        }
    }, [editing, tag.name]);

    useEffect(() => {
        if (!editing) {
            return;
        }
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    const startEditing = () => {
        if (disabled) {
            return;
        }
        setDraft(tag.name);
        setEditing(true);
    };

    const commit = () => {
        const nextName = draft.trim();
        if (!nextName || nextName === tag.name) {
            setEditing(false);
            setDraft(tag.name);
            return;
        }
        if (onRename(tag.id, nextName)) {
            setEditing(false);
            return;
        }
        // Rename rejected (empty or duplicate): keep the editor open with the
        // previous value intact; the service reports the reason to the user.
        setDraft(tag.name);
        inputRef.current?.select();
    };

    return (
        <div
            className="tag_view_item"
            id={tag.id}
            data-tag-id={tag.id}
            aria-busy={disabled || undefined}
            style={dragging ? { opacity: 0.5 } : undefined}
            onDragOver={event => {
                event.preventDefault();
                onDragOver(tag.id);
            }}
            onDrop={event => {
                event.preventDefault();
                onDrop(tag.id);
            }}
        >
            <div
                className={`drag-handle ${stylex.props(s.focusable).className ?? ''}`}
                role="button"
                tabIndex={0}
                draggable={!disabled}
                title={translate('Drag to reorder tag')}
                aria-label={translate('Drag to reorder tag')}
                onDragStart={event => {
                    event.dataTransfer.effectAllowed = 'move';
                    // Firefox only starts a drag when some data is set.
                    event.dataTransfer.setData('text/plain', tag.id);
                    onDragStart(tag.id);
                }}
                onDragEnd={() => onDragEnd()}
                onKeyDown={event => {
                    if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        onMove(tag.id, -1);
                    } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        onMove(tag.id, 1);
                    }
                }}

            >
                ☰
            </div>
            <IconAction
                className={`tag_as_folder fa-solid right_menu_button ${folder.className}`}
                title={translate(folder.tooltip)}
                ariaLabel={translate(folder.tooltip)}
                onClick={() => onCycleFolder(tag.id)}
            >
                <span
                    className="tag_folder_indicator"
                    style={{ color: folder.color, fontSize: `calc(var(--mainFontSize) * ${folder.size})` }}
                >
                    {folder.icon}
                </span>
            </IconAction>
            <IconAction
                className={`right_menu_button fa-solid fa-fw eye-toggle ${hidden ? 'fa-eye-slash' : 'fa-eye'}`}
                title={hideTooltip}
                ariaLabel={hideTooltip}
                onClick={() => onToggleHidden(tag.id)}
            />
            <div className={`tag_view_color_picker ${stylex.props(s.pickerAnchor).className ?? ''}`} data-value="color">
                <TagColorPicker
                    field="color"
                    value={tag.color ?? ''}
                    onChange={value => onColorChange(tag.id, 'color', value)}
                />
            </div>
            <div className={`tag_view_color_picker ${stylex.props(s.pickerAnchor).className ?? ''}`} data-value="color2">
                <TagColorPicker
                    field="color2"
                    value={tag.color2 ?? ''}
                    onChange={value => onColorChange(tag.id, 'color2', value)}
                />
            </div>
            {editing ? (
                <input
                    ref={inputRef}
                    className={`tag_view_name text_pole ${stylex.props(s.nameInput).className ?? ''}`}
                    value={draft}
                    aria-label={translate('Tag name')}
                    style={{ backgroundColor: tag.color, color: tag.color2 }}

                    onChange={event => setDraft(event.target.value)}
                    onInput={event => event.stopPropagation()}
                    onBlur={event => {
                        event.stopPropagation();
                        commit();
                    }}
                    onKeyDown={event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setEditing(false);
                            setDraft(tag.name);
                        }
                    }}
                />
            ) : (
                <div
                    className={`tag_view_name ${stylex.props(s.focusable, s.name).className ?? ''}`}
                    role="button"
                    tabIndex={0}
                    title={translate('Click name to rename.')}
                    style={{ backgroundColor: tag.color, color: tag.color2 }}
                    onClick={event => {
                        event.stopPropagation();
                        startEditing();
                    }}
                    onBlur={event => event.stopPropagation()}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            startEditing();
                        }
                    }}

                >
                    {tag.name}
                </div>
            )}
            <div className={`tag_view_counter ${stylex.props(s.counter).className ?? ''}`}>
                <span className="tag_view_counter_value">{tag.count}</span>&nbsp;
                <span data-i18n="tag_entries">{translate('entries')}</span>
            </div>
            <IconAction
                className="tag_delete fa-solid fa-trash-can right_menu_button"
                title={translate('Delete tag')}
                ariaLabel={`${translate('Delete tag')}: ${tag.name}`}
                onClick={() => onDelete(tag.id)}
            />
        </div>
    );
}
