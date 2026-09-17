/**
 * Quick Reply modal editor markup (React-owned shell). QuickReply.js keeps
 * behavior ownership: it binds listeners to the preserved qr--* IDs after the
 * synchronous mount, and clones the qr--ctxItem template for context rows.
 */
export function QuickReplyEditorPanel() {
    return (
<div id="qr--modalEditor">
	<div id="qr--main">
		<h3 data-i18n="Labels and Message">Labels and Message</h3>
		<div className="qr--labels">
			<label className="qr--fit">
				<span className="qr--labelText" data-i18n="Label">Icon</span>
				<small className="qr--labelHint">{"\u00a0"}</small>
				<div className="menu_button fa-fw" id="qr--modal-icon" title="Click to change icon"></div>
			</label>
			<div className="label">
				<span className="qr--labelText" data-i18n="Label">Label</span>
				<small className="qr--labelHint" data-i18n="(label of the button, if no icon is chosen) ">(label of the button, if no icon is chosen)</small>
				<div className="qr--inputGroup">
					<label className="checkbox_label" title="Show label even if an icon is assigned">
						<input type="checkbox" id="qr--modal-showLabel" />
						Show
					</label>
					<input type="text" className="text_pole" id="qr--modal-label" />
					<div className="menu_button fa-fw fa-solid fa-chevron-down" id="qr--modal-switcher" title="Switch to another QR"></div>
				</div>
			</div>
			<label>
				<span className="qr--labelText" data-i18n="Title">Title</span>
				<small className="qr--labelHint" data-i18n="(tooltip, leave empty to show message or /command)">(tooltip, leave empty to show message or /command)</small>
				<input type="text" className="text_pole" id="qr--modal-title" />
			</label>
		</div>
		<div className="qr--modal-messageContainer">
			<label htmlFor="qr--modal-message" data-i18n="Message / Command:">
				Message / Command:
			</label>
			<div className="qr--modal-editorSettings">
				<label className="checkbox_label">
					<input type="checkbox" id="qr--modal-wrap" />
					<span data-i18n="Word wrap">Word wrap</span>
				</label>
				<label className="checkbox_label">
					<span data-i18n="Tab size:">Tab size:</span>
					<input type="number" min="1" max="9" id="qr--modal-tabSize" className="text_pole" />
				</label>
				<label className="checkbox_label">
					<input type="checkbox" id="qr--modal-executeShortcut" />
					<span data-i18n="Ctrl+Enter to execute">Ctrl+Enter to execute</span>
				</label>
				<label className="checkbox_label">
					<input type="checkbox" id="qr--modal-syntax" />
					<span>Syntax highlight</span>
				</label>
				<small>Ctrl+Alt+Click (or F9) to set / remove breakpoints</small>
				<small>Ctrl+<span id="qr--modal-commentKey"></span> to toggle block comments</small>
			</div>
			<div id="qr--modal-messageHolder">
				<pre id="qr--modal-messageSyntax"><code id="qr--modal-messageSyntaxInner" className="hljs language-stscript"></code></pre>
				<textarea id="qr--modal-message" spellCheck={false}></textarea>
			</div>
		</div>
	</div>



	<div id="qr--resizeHandle"></div>



	<div id="qr--qrOptions">
		<h3 data-i18n="Context Menu">Context Menu</h3>
		<div id="qr--ctxEditor">
			<template id="qr--ctxItem">
				<div className="qr--ctxItem" data-order="0">
					<div className="drag-handle ui-sortable-handle">☰</div>
					<select className="qr--set"></select>
					<label className="qr--isChainedLabel checkbox_label" title="When enabled, the current Quick Reply will be sent together with (before) the clicked QR from the context menu.">
						<span data-i18n="Chaining:">Chaining:</span>
						<input type="checkbox" className="qr--isChained" />
					</label>
					<div className="qr--delete menu_button menu_button_icon fa-solid fa-trash-can" title="Remove entry"></div>
				</div>
			</template>
		</div>
		<div className="qr--ctxEditorActions">
			<span id="qr--ctxAdd" className="menu_button menu_button_icon fa-solid fa-plus" title="Add quick reply set to context menu"></span>
		</div>


		<h3 data-i18n="Auto-Execute">Auto-Execute</h3>
		<div id="qr--autoExec" className="flex-container flexFlowColumn">
			<label className="checkbox_label" title="Prevent this quick reply from triggering other auto-executed quick replies while auto-executing (i.e., prevent recursive auto-execution)">
				<input type="checkbox" id="qr--preventAutoExecute"  />
				<span><i className="fa-solid fa-fw fa-plane-slash" /><span data-i18n="Don't trigger auto-execute">Don't trigger auto-execute</span></span>
			</label>
			<label className="checkbox_label">
				<input type="checkbox" id="qr--isHidden"  />
				<span><i className="fa-solid fa-fw fa-eye-slash" /><span data-i18n="Invisible (auto-execute only)">Invisible (auto-execute only)</span></span>
			</label>
			<label className="checkbox_label">
				<input type="checkbox" id="qr--executeOnStartup"  />
				<span><i className="fa-solid fa-fw fa-rocket" /><span data-i18n="Execute on startup">Execute on startup</span></span>
			</label>
			<label className="checkbox_label">
				<input type="checkbox" id="qr--executeOnUser"  />
				<span><i className="fa-solid fa-fw fa-user" /><span data-i18n="Execute on user message">Execute on user message</span></span>
			</label>
			<label className="checkbox_label">
				<input type="checkbox" id="qr--executeOnAi"  />
				<span><i className="fa-solid fa-fw fa-robot" /><span data-i18n="Execute on AI message">Execute on AI message</span></span>
			</label>
			<label className="checkbox_label">
				<input type="checkbox" id="qr--executeOnChatChange"  />
				<span><i className="fa-solid fa-fw fa-message" /><span data-i18n="Execute on chat change">Execute on chat change</span></span>
			</label>
            <label className="checkbox_label">
                <input type="checkbox" id="qr--executeOnNewChat" />
                <span><i className="fa-solid fa-fw fa-comments" /><span data-i18n="Execute on new chat">Execute on new chat</span></span>
            </label>
            <label className="checkbox_label">
    			<input type="checkbox" id="qr--executeBeforeGeneration"  />
    			<span><i className="fa-solid fa-fw fa-paper-plane" /><span data-i18n="Execute before message generation">Execute before message generation</span></span>
   			</label>
            <div className="flex-container alignItemsBaseline flexFlowColumn flexNoGap" title="Activate this quick reply when a World Info entry with the same Automation ID is triggered.">
                <small data-i18n="Automation ID:">Automation ID</small>
                <input type="text" id="qr--automationId" className="text_pole flex1" placeholder="( None )" />
            </div>
		</div>


		<h3 data-i18n="Testing">Testing</h3>
		<div id="qr--modal-executeButtons">
			<div id="qr--modal-execute" className="qr--modal-executeButton menu_button" title="Execute the quick reply now">
				<i className="fa-solid fa-play" />
				<span data-i18n="Execute">Execute</span>
			</div>
			<div id="qr--modal-pause" className="qr--modal-executeButton menu_button" title="Pause / continue execution">
				<span className="qr--modal-executeComboIcon">
					<i className="fa-solid fa-play" />
					<i className="fa-solid fa-pause" />
				</span>
			</div>
			<div id="qr--modal-stop" className="qr--modal-executeButton menu_button" title="Abort execution">
				<i className="fa-solid fa-stop" />
			</div>
		</div>
		<div id="qr--modal-executeProgress"></div>
		<div id="qr--modal-executeErrors"></div>
		<div id="qr--modal-executeResult"></div>

		<div id="qr--modal-debugButtons">
			<div title="Resume" id="qr--modal-resume" className="qr--modal-debugButton menu_button"></div>
			<div title="Step Over" id="qr--modal-step" className="qr--modal-debugButton menu_button"></div>
			<div title="Step Into" id="qr--modal-stepInto" className="qr--modal-debugButton menu_button"></div>
			<div title="Step Out" id="qr--modal-stepOut" className="qr--modal-debugButton menu_button"></div>
			<div title="Minimize" id="qr--modal-minimize" className="qr--modal-debugButton menu_button fa-solid fa-minimize"></div>
			<div title="Maximize" id="qr--modal-maximize" className="qr--modal-debugButton menu_button fa-solid fa-maximize"></div>
		</div>
		<textarea rows={1} id="qr--modal-send_textarea" placeholder="Chat input for use with {{input}}" title="Chat input for use with {{input}}"></textarea>
		<div id="qr--modal-debugState"></div>
	</div>
</div>
    );
}
