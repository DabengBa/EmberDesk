import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ContractButton } from '../contract/ContractButton';
import type { PromptPanelBridge } from '../prompt-panel/PromptPanel';
import { translate, useTranslated } from '@/compat/i18n.js';

/**
 * Save-preset button with built-in dirty awareness. Reads the shared
 * prompt-panel bridge (`presetDirty` = isOpenAIPresetDirty) so it updates
 * whenever the bridge emits after settings or preset events. The button
 * stays clickable even when clean — saving a clean state is a harmless
 * baseline refresh used by tests and users who want to force-write the
 * preset file.
 */
export function PresetSaveButton({ bridge }: { bridge: PromptPanelBridge }) {
    useTranslated('');
    const dirty = useSyncExternalStore(
        listener => bridge.subscribe(listener),
        () => bridge.getState().presetDirty,
        () => bridge.getState().presetDirty,
    );
    return (
        <button
            type="button"
            id="update_oai_preset"
            className={dirty ? 'menu_button preset-save-button is-dirty' : 'menu_button preset-save-button'}
            title={dirty
                            ? translate('The current configuration has unsaved changes; click to write them into the selected preset')
                            : translate('Save the current configuration into the selected preset')}
            aria-label={dirty ? translate('Save changes to preset') : translate('Save to preset')}
        >
            <i className="fa-solid fa-floppy-disk" aria-hidden="true" /> {dirty ? translate('Save changes') : translate('Save')}
        </button>
    );
}

/**
 * Preset actions overflow menu (⋮) for the AI Config panel. The primary
 * Save / New actions live as visible buttons in the preset section row;
 * this menu keeps the lower-frequency Rename / Import / Export / Delete.
 *
 * React owns ONLY open/close: items stay permanently mounted and toggle via
 * the `.show` contract class because their action handlers are direct-bound
 * by ID in openai.js initOpenAI (re-rendering detached nodes would drop them).
 * The trigger keeps .preset-menu-trigger and the menu keeps
 * .preset-popup-menu/.preset-popup-menu-item so the style contract is intact.
 * Delete stays last and danger-marked. Programmatic $('#id').trigger('click')
 * keeps working while the menu is closed because the items never unmount.
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
                onClick={close}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        close();
                        rootRef.current?.querySelector<HTMLElement>('.preset-menu-trigger')?.focus();
                    }
                }}
            >
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
