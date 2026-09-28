import { useEffect, useRef, useState } from 'react';
import { ContractButton } from '../contract/ContractButton';

/**
 * Overflow ⋮ menu for preset-manager action rows (sysprompt, reasoning, …).
 *
 * All actions ride the shared document-delegated handlers in
 * preset-manager.js via data-preset-manager-* attributes — the component only
 * owns open/close (the .show contract class) plus Esc/outside-click/autofocus,
 * matching the U-4 PresetActionsMenu language. Items stay mounted so the
 * delegated handlers and any programmatic trigger('click') keep working while
 * the menu is closed.
 *
 * The apiId selects which preset-manager namespace the row drives; noun is
 * the translated entity label used in tooltips ("prompt" / "template").
 * The hidden data-preset-manager-file input must stay OUTSIDE this component
 * (it is the trigger target for the delegated import handler).
 */
export function PresetManagerActionsMenu({ apiId, noun }: { apiId: string; noun: string }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                rootRef.current?.querySelector<HTMLElement>('.preset-menu-trigger')?.focus();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        rootRef.current?.querySelector<HTMLElement>('.preset-popup-menu-item')?.focus();
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="preset-actions-menu">
            <button
                type="button"
                className="preset-menu-trigger margin0 menu_button menu_button_icon"
                title="More preset actions"
                data-i18n="[title]More preset actions;[aria-label]More preset actions"
                aria-label="More preset actions"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                <i className="fa-fw fa-solid fa-ellipsis-vertical" aria-hidden="true" />
            </button>
            <div
                className={open ? 'preset-popup-menu show' : 'preset-popup-menu'}
                role="menu"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        setOpen(false);
                        rootRef.current?.querySelector<HTMLElement>('.preset-menu-trigger')?.focus();
                    }
                }}
            >
                <ContractButton data-preset-manager-update={apiId} className="preset-popup-menu-item" variant="ghost" label="Update" nativeTitle title={`Update current ${noun}`} icon={<i className="fa-fw fa-solid fa-save" aria-hidden="true" />} />
                <ContractButton data-preset-manager-new={apiId} className="preset-popup-menu-item" variant="ghost" label="Save As" nativeTitle title={`Save ${noun} as`} icon={<i className="fa-fw fa-solid fa-file-circle-plus" aria-hidden="true" />} />
                <ContractButton data-preset-manager-rename={apiId} className="preset-popup-menu-item" variant="ghost" label="Rename" nativeTitle title={`Rename current ${noun}`} icon={<i className="fa-fw fa-solid fa-pencil" aria-hidden="true" />} />
                <hr />
                <ContractButton data-preset-manager-import={apiId} className="preset-popup-menu-item" variant="ghost" label="Import" nativeTitle title={`Import ${noun}`} icon={<i className="fa-fw fa-solid fa-file-import" aria-hidden="true" />} />
                <ContractButton data-preset-manager-export={apiId} className="preset-popup-menu-item" variant="ghost" label="Export" nativeTitle title={`Export ${noun}`} icon={<i className="fa-fw fa-solid fa-file-export" aria-hidden="true" />} />
                <ContractButton data-preset-manager-restore={apiId} className="preset-popup-menu-item" variant="ghost" label="Restore" nativeTitle title={`Restore current ${noun}`} icon={<i className="fa-fw fa-solid fa-recycle" aria-hidden="true" />} />
                <hr />
                <ContractButton data-preset-manager-delete={apiId} className="preset-popup-menu-item preset-menu-danger" variant="ghost" label="Delete" nativeTitle title={`Delete ${noun}`} icon={<i className="fa-fw fa-solid fa-trash-can" aria-hidden="true" />} />
            </div>
        </div>
    );
}
