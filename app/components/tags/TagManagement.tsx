type TagManagementProps = {
    bogusFolders: boolean;
};

export function TagManagement({ bogusFolders }: TagManagementProps) {
    return (
        <>
            <div className="title_restorable alignItemsBaseline">
                <h3 data-i18n="Tag Management">Tag Management</h3>
                <div className="flex-container alignItemsBaseline">
                    <div className="menu_button menu_button_icon tag_view_prune" data-i18n="[title]Remove unused tags" title="Remove unused tags">
                        <i className="fa-solid fa-scissors" />
                        <span data-i18n="Prune">Prune</span>
                    </div>
                    <div className="menu_button menu_button_icon tag_view_backup" data-i18n="[title]Save your tags to a file" title="Save your tags to a file">
                        <i className="fa-solid fa-file-export" />
                        <span data-i18n="Backup">Backup</span>
                    </div>
                    <div className="menu_button menu_button_icon tag_view_restore" data-i18n="[title]Restore tags from a file" title="Restore tags from a file">
                        <i className="fa-solid fa-file-import" />
                        <span data-i18n="Restore">Restore</span>
                    </div>
                    <div className="menu_button menu_button_icon tag_view_create" data-i18n="[title]Create a new tag" title="Create a new tag">
                        <i className="fa-solid fa-plus" />
                        <span data-i18n="Create">Create</span>
                    </div>
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
