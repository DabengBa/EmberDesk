import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
/**
 * Quick Reply settings panel markup (React-owned shell). SettingsUi.js binds
 * to the preserved qr--* IDs after the synchronous mount.
 */
export function QuickReplySettingsPanel() {
    return (
<div id="qr--settings">
	<div className="inline-drawer">
		<div className="inline-drawer-toggle inline-drawer-header">
			<strong data-i18n="Quick Reply">Quick Reply</strong>
			<div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
		</div>
		<div className="inline-drawer-content">
			<label className="flex-container">
				<input type="checkbox" id="qr--isEnabled" /><span data-i18n="Enable Quick Replies">Enable Quick Replies</span>
			</label>
			<label className="flex-container">
				<input type="checkbox" id="qr--isCombined" /><span data-i18n="Combine Quick Replies">Combine Quick Replies</span>
			</label>
            <label className="flex-container">
                <input type="checkbox" id="qr--showPopoutButton" /><span data-i18n="Show Popout Button">Show Popout Button (on Desktop)</span>
            </label>

			<hr />

			<div id="qr--global">
				<div className="qr--head">
					<div className="qr--title" data-i18n="Global Quick Reply Sets">Global Quick Reply Sets</div>
					<div className="qr--actions">
						<ContractIconButton id="qr--global-setListAdd" className="qr--setListAdd menu_button menu_button_icon" label="Add quick reply set" nativeTitle title="Add quick reply set" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
					</div>
				</div>
				<div id="qr--global-setList" className="qr--setList"></div>
			</div>

			<hr />

			<div id="qr--chat">
				<div className="qr--head">
					<div className="qr--title" data-i18n="Chat Quick Reply Sets">Chat Quick Reply Sets</div>
					<div className="qr--actions">
						<ContractIconButton id="qr--chat-setListAdd" className="qr--setListAdd menu_button menu_button_icon" label="Add quick reply set" nativeTitle title="Add quick reply set" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
					</div>
				</div>
				<div id="qr--chat-setList" className="qr--setList"></div>
			</div>

			<hr />

			<div id="qr--character">
				<div className="qr--head">
					<div className="qr--title" data-i18n="Character Quick Reply Sets">Character Quick Reply Sets</div>
					<small data-i18n="(Private)">(Private)</small>
					<div className="qr--actions">
						<ContractIconButton id="qr--character-setListAdd" className="qr--setListAdd menu_button menu_button_icon" label="Add quick reply set" nativeTitle title="Add quick reply set" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
					</div>
				</div>
				<div id="qr--character-setList" className="qr--setList"></div>
			</div>

			<hr />

			<div id="qr--editor">
				<div className="qr--head">
					<div className="qr--title" data-i18n="Edit Quick Replies">Edit Quick Replies</div>
					<div className="qr--actions">
						<select id="qr--set" className="text_pole"></select>
						<ContractIconButton id="qr--set-rename" className="qr--add menu_button menu_button_icon" label="Rename quick reply set" nativeTitle title="Rename quick reply set" icon={<i className="fa-solid fa-pencil" aria-hidden="true" />} />
						<ContractIconButton id="qr--set-new" className="qr--add menu_button menu_button_icon" label="Create new quick reply set" nativeTitle title="Create new quick reply set" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
						<ContractIconButton id="qr--set-import" className="qr--add menu_button menu_button_icon" label="Import quick reply set" nativeTitle title="Import quick reply set" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
						<input type="file" id="qr--set-importFile" accept=".json" hidden />
						<ContractIconButton id="qr--set-export" className="qr--add menu_button menu_button_icon" label="Export quick reply set" nativeTitle title="Export quick reply set" icon={<i className="fa-solid fa-file-export" aria-hidden="true" />} />
                        <ContractIconButton id="qr--set-duplicate" className="qr-add menu_button menu_button_icon" label="Duplicate quick reply set" nativeTitle title="Duplicate quick reply set" icon={<i className="fa-solid fa-paste" aria-hidden="true" />} />
						<ContractIconButton id="qr--set-delete" className="qr--del menu_button menu_button_icon redWarningBG" label="Delete quick reply set" nativeTitle title="Delete quick reply set" icon={<i className="fa-solid fa-trash" aria-hidden="true" />} />
					</div>
				</div>
				<div id="qr--set-settings">
					<label className="flex-container">
						<input type="checkbox" id="qr--disableSend" /> <span data-i18n="Disable Send (Insert Into Input Field)">Disable send (insert into input field)</span>
					</label>
					<label className="flex-container">
						<input type="checkbox" id="qr--placeBeforeInput" /> <span data-i18n="Place Quick Reply Before Input">Place quick reply before input</span>
					</label>
					<label className="flex-container" id="qr--injectInputContainer">
						<input type="checkbox" id="qr--injectInput" /> <span><span data-i18n="Inject user input automatically">Inject user input automatically</span> <small><span data-i18n="(if disabled, use ">(if disabled, use</span><code>{'{{'}input{'}}'}</code> <span data-i18n="macro for manual injection)">macro for manual injection)</span></small></span>
					</label>
					<div className="flex-container alignItemsCenter">
						<toolcool-color-picker id="qr--color"></toolcool-color-picker>
						<ContractButton id="qr--colorClear" className="menu_button" label="Clear" />
						<span data-i18n="Color">Color</span>
					</div>
					<label className="flex-container" id="qr--onlyBorderColorContainer">
						<input type="checkbox" id="qr--onlyBorderColor" /> <span data-i18n="Only apply color as accent">Only apply color as accent</span>
					</label>
				</div>
				<div id="qr--set-qrList" className="qr--qrList"></div>
				<div className="qr--set-qrListActions">
					<ContractIconButton id="qr--set-add" className="qr--add menu_button menu_button_icon" label="Add quick reply" nativeTitle title="Add quick reply" icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
					<ContractIconButton id="qr--set-paste" className="qr--paste menu_button menu_button_icon" label="Paste quick reply from clipboard" nativeTitle title="Paste quick reply from clipboard" icon={<i className="fa-solid fa-paste" aria-hidden="true" />} />
					<ContractIconButton id="qr--set-importQr" className="qr--import menu_button menu_button_icon" label="Import quick reply from file" nativeTitle title="Import quick reply from file" icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
				</div>
			</div>
		</div>
	</div>
</div>
    );
}
