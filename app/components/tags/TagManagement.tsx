import { ContractButton } from '../contract/ContractButton';
type TagManagementProps = {
    bogusFolders: boolean;
};

export function TagManagement({ bogusFolders }: TagManagementProps) {
    return (
        <>
            <div className="title_restorable alignItemsBaseline">
                <h3 data-i18n="Tag Management">Tag Management</h3>
                <div className="flex-container alignItemsBaseline">
                    <ContractButton className="menu_button menu_button_icon tag_view_prune" label="Prune" nativeTitle title="Remove unused tags" icon={<i className="fa-solid fa-scissors" aria-hidden="true" />} />
                    <ContractButton className="menu_button menu_button_icon tag_view_backup" label="Backup" nativeTitle title="Save your tags to a file" icon={<i className="fa-solid fa-file-export" aria-hidden="true" />} />
                    <ContractButton className="menu_button menu_button_icon tag_view_restore" label="Restore" nativeTitle title="Restore tags from a file" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                    <ContractButton className="menu_button menu_button_icon tag_view_create" label="Create" nativeTitle title="Create a new tag" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
                    <input type="file" id="tag_view_restore_input" hidden accept=".json" />
                </div>
            </div>
            <div className="justifyLeft m-b-1">
                <div className="flex-container alignItemsBaseline">
                    <span data-i18n="Sort mode">Sort mode:</span>
                    <select id="tag_sort_mode_select" className="flex1 text_pole">
                        <option value="manual" data-i18n="Manual (Drag & Drop)">Manual (Drag & Drop)</option>
                        <option value="alphabetical" data-i18n="Alphabetical (A-Z)">Alphabetical (A-Z)</option>
                        <option value="by_entries" data-i18n="Most Used (By Count)">Most Used (By Count)</option>
                    </select>
                </div>
                <small>
                    <span data-i18n="Drag handle to reorder. Click name to rename. Click color to change display.">Drag handle to reorder. Click name to rename. Click color to change display.</span><br />
                    {bogusFolders && <><span data-i18n="Click on the folder icon to use this tag as a folder.">Click on the folder icon to use this tag as a folder.</span><br /></>}
                </small>
            </div>
        </>
    );
}
