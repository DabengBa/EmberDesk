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
						<div className="qr--setListAdd menu_button menu_button_icon fa-solid fa-plus" id="qr--global-setListAdd" title="Add quick reply set"></div>
					</div>
				</div>
				<div id="qr--global-setList" className="qr--setList"></div>
			</div>

			<hr />

			<div id="qr--chat">
				<div className="qr--head">
					<div className="qr--title" data-i18n="Chat Quick Reply Sets">Chat Quick Reply Sets</div>
					<div className="qr--actions">
						<div className="qr--setListAdd menu_button menu_button_icon fa-solid fa-plus" id="qr--chat-setListAdd" title="Add quick reply set"></div>
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
						<div className="qr--setListAdd menu_button menu_button_icon fa-solid fa-plus" id="qr--character-setListAdd" title="Add quick reply set"></div>
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
						<div className="qr--add menu_button menu_button_icon fa-solid fa-pencil" id="qr--set-rename" title="Rename quick reply set"></div>
						<div className="qr--add menu_button menu_button_icon fa-solid fa-plus" id="qr--set-new" title="Create new quick reply set"></div>
						<div className="qr--add menu_button menu_button_icon fa-solid fa-file-import" id="qr--set-import" title="Import quick reply set"></div>
						<input type="file" id="qr--set-importFile" accept=".json" hidden />
						<div className="qr--add menu_button menu_button_icon fa-solid fa-file-export" id="qr--set-export" title="Export quick reply set"></div>
                        <div className="qr-add menu_button menu_button_icon fa-solid fa-paste" id="qr--set-duplicate" title="Duplicate quick reply set"></div>
						<div className="qr--del menu_button menu_button_icon fa-solid fa-trash redWarningBG" id="qr--set-delete" title="Delete quick reply set"></div>
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
						<div className="menu_button" id="qr--colorClear">Clear</div>
						<span data-i18n="Color">Color</span>
					</div>
					<label className="flex-container" id="qr--onlyBorderColorContainer">
						<input type="checkbox" id="qr--onlyBorderColor" /> <span data-i18n="Only apply color as accent">Only apply color as accent</span>
					</label>
				</div>
				<div id="qr--set-qrList" className="qr--qrList"></div>
				<div className="qr--set-qrListActions">
					<div className="qr--add menu_button menu_button_icon fa-solid fa-plus" id="qr--set-add" title="Add quick reply"></div>
					<div className="qr--paste menu_button menu_button_icon fa-solid fa-paste" id="qr--set-paste" title="Paste quick reply from clipboard"></div>
					<div className="qr--import menu_button menu_button_icon fa-solid fa-file-import" id="qr--set-importQr" title="Import quick reply from file"></div>
				</div>
			</div>
		</div>
	</div>
</div>
    );
}
