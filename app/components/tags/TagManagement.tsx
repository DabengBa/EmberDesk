import { ContractButton } from '../contract/ContractButton';
import { translate, useTranslated } from '@/compat/i18n.js';
type TagManagementProps = {
    bogusFolders: boolean;
};

export function TagManagement({ bogusFolders }: TagManagementProps) {
    useTranslated('');
    return (
        <>
            <div className="title_restorable alignItemsBaseline">
                <h3 >{translate('Tag Management')}</h3>
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
                    <span >{translate('Sort mode:')}</span>
                    <select id="tag_sort_mode_select" className="flex1 text_pole" data-i18n="[aria-label]Sort mode" aria-label="Sort mode">
                        <option value="manual" >{translate('Manual (Drag & Drop)')}</option>
                        <option value="alphabetical" >{translate('Alphabetical (A-Z)')}</option>
                        <option value="by_entries" >{translate('Most Used (By Count)')}</option>
                    </select>
                </div>
                <small>
                    <span >{translate('Drag handle to reorder. Click name to rename. Click color to change display.')}</span><br />
                    {bogusFolders && <><span >{translate('Click on the folder icon to use this tag as a folder.')}</span><br /></>}
                </small>
            </div>
        </>
    );
}
