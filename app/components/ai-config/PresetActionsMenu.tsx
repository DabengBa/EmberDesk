import { useEffect, useRef, useState } from 'react';
import { ContractButton } from '../contract/ContractButton';

/**
 * Preset actions overflow menu (⋮) for the AI Config panel.
 *
 * React owns ONLY open/close: items stay permanently mounted and toggle via
 * the `.show` contract class because their action handlers are direct-bound
 * by ID in openai.js initOpenAI (re-rendering detached nodes would drop them).
 * The trigger keeps .preset-menu-trigger and the menu keeps
 * .preset-popup-menu/.preset-popup-menu-item so the style contract is intact.
 *
 * Menu content folds the former always-visible icon row (Save / Save As /
 * Rename) in with the popup actions (Import / Export / Delete), delete last
 * and danger-marked — same grouping language as the U-1..U-3 floating menus.
 * Programmatic $('#id').trigger('click') keeps working while the menu is
 * closed because the items never unmount.
 */
export function PresetActionsMenu() {
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
        // Focus the first menu item for keyboard users.
        rootRef.current?.querySelector<HTMLElement>('.preset-popup-menu-item')?.focus();
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <div ref={rootRef} className="preset-actions-menu">
            <input id="openai_preset_import_file" type="file" accept=".json,.settings" hidden />
            <button
                type="button"
                className="preset-menu-trigger margin0 menu_button menu_button_icon"
                title="More preset actions"
                data-i18n="[title]More preset actions"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                <i className="fa-fw fa-solid fa-ellipsis-vertical" aria-hidden="true" />
            </button>
            <div className={open ? 'preset-popup-menu show' : 'preset-popup-menu'} role="menu" onClick={close}>
                <ContractButton id="update_oai_preset" className="preset-popup-menu-item" variant="ghost" label="Save" nativeTitle title="Update current preset" icon={<i className="fa-fw fa-solid fa-save" aria-hidden="true" />} />
                <ContractButton id="new_oai_preset" className="preset-popup-menu-item" variant="ghost" label="Save As" nativeTitle title="Save preset as" icon={<i className="fa-fw fa-solid fa-file-circle-plus" aria-hidden="true" />} />
                <ContractButton data-preset-manager-rename="openai" className="preset-popup-menu-item" variant="ghost" label="Rename" nativeTitle title="Rename current preset" icon={<i className="fa-fw fa-solid fa-pencil" aria-hidden="true" />} />
                <hr />
                <ContractButton id="import_oai_preset" className="preset-popup-menu-item" variant="ghost" label="Import" icon={<i className="fa-fw fa-solid fa-file-import" aria-hidden="true" />} />
                <ContractButton id="export_oai_preset" className="preset-popup-menu-item" variant="ghost" label="Export" icon={<i className="fa-fw fa-solid fa-file-export" aria-hidden="true" />} />
                <hr />
                <ContractButton id="delete_oai_preset" className="preset-popup-menu-item preset-menu-danger" variant="ghost" label="Delete" icon={<i className="fa-fw fa-solid fa-trash-can" aria-hidden="true" />} />
            </div>
        </div>
    );
}
