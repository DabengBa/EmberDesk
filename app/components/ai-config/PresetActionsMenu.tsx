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
export function PresetSaveButton({ bridge, onSave, disabled }: { bridge: PromptPanelBridge; onSave: () => void; disabled: boolean }) {
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
            onClick={onSave}
            disabled={disabled}
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
 * React owns the actions and menu state; the CSS contract stays intact.
 */
export function PresetActionsMenu({ busy, onRename, onRestore, onDelete, onImport, onExport }: { busy: boolean; onRename: () => void; onRestore: () => void; onDelete: () => void; onImport: (file: File) => void; onExport: () => void }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

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
            <input ref={fileRef} id="openai_preset_import_file" type="file" accept=".json,.settings" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImport(file); }} />
            <button
                type="button"
                className="preset-menu-trigger margin0 menu_button menu_button_icon"
                title="More preset actions"
                data-i18n="[title]More preset actions;[aria-label]More preset actions"
                aria-label="More preset actions"
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={busy}
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
                <ContractButton onClick={onRename} className="preset-popup-menu-item" variant="ghost" label="Rename" nativeTitle title="Rename current preset" icon={<i className="fa-fw fa-solid fa-pencil" aria-hidden="true" />} />
                <ContractButton onClick={onRestore} className="preset-popup-menu-item" variant="ghost" label="Restore" icon={<i className="fa-fw fa-solid fa-rotate-left" aria-hidden="true" />} />
                <hr />
                <ContractButton onClick={() => fileRef.current?.click()} id="import_oai_preset" className="preset-popup-menu-item" variant="ghost" label="Import" icon={<i className="fa-fw fa-solid fa-file-import" aria-hidden="true" />} />
                <ContractButton onClick={onExport} id="export_oai_preset" className="preset-popup-menu-item" variant="ghost" label="Export" icon={<i className="fa-fw fa-solid fa-file-export" aria-hidden="true" />} />
                <hr />
                <ContractButton onClick={onDelete} id="delete_oai_preset" className="preset-popup-menu-item preset-menu-danger" variant="ghost" label="Delete" icon={<i className="fa-fw fa-solid fa-trash-can" aria-hidden="true" />} />
            </div>
        </div>
    );
}
