export function PowerUserPanel() {
    return (
        <>
                <div id="user-settings-block-content" className="flex-container spaceEvenly">
                    <div name="UserSettingsThirdColumn" id="power-user-options-block" className="flex-container wide100p flex1">
                        <div id="power-user-option-checkboxes">
                            <div name="FrontendFramesToggle" className="inline-drawer wide100p flexFlowColumn">
                                <div className="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable" title="Render complete HTML documents inside message code blocks as live frames.">
                                    <b><span data-i18n="Frontend Frames">Frontend Frames</span></b>
                                    <div className="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
                                </div>
                                <div className="inline-drawer-content">
                                    <label className="checkbox_label" htmlFor="frontend_frames_enabled" title="Render complete HTML documents in message code blocks as live iframes. The frame runs same-origin scripts from the card, so only enable this for content you trust." data-i18n="[title]Render complete HTML documents in message code blocks as live iframes. The frame runs same-origin scripts from the card, so only enable this for content you trust.">
                                        <input id="frontend_frames_enabled" type="checkbox" />
                                        <small data-i18n="Enable frontend frames">Enable frontend frames</small>
                                    </label>
                                    <div title="How many floors, counting backwards from the newest message, may render frames. 0 means all floors. Hidden/system floors do not count when the ignore-hidden option is on." data-i18n="[title]How many floors, counting backwards from the newest message, may render frames. 0 means all floors.">
                                        <label htmlFor="frontend_frames_depth">
                                            <small data-i18n="Render depth (0 = all)">Render depth (0 = all)</small>
                                        </label>
                                        <input id="frontend_frames_depth" type="number" className="text_pole textarea_compact" min="0" step="1" />
                                    </div>
                                    <label className="checkbox_label" htmlFor="frontend_frames_depth_ignore_hidden" title="Skip hidden/system messages when counting render depth." data-i18n="[title]Skip hidden/system messages when counting render depth.">
                                        <input id="frontend_frames_depth_ignore_hidden" type="checkbox" />
                                        <small data-i18n="Ignore hidden floors in depth">Ignore hidden floors in depth</small>
                                    </label>
                                    <div title="When to collapse the source code block behind a toggle once a frame is rendered." data-i18n="[title]When to collapse the source code block behind a toggle once a frame is rendered.">
                                        <label htmlFor="frontend_frames_collapse_code_block">
                                            <small data-i18n="Collapse code blocks">Collapse code blocks</small>
                                        </label>
                                        <select id="frontend_frames_collapse_code_block">
                                            <option data-i18n="Frontend blocks only" value="frontend_only">Frontend blocks only</option>
                                            <option data-i18n="All code blocks" value="all">All code blocks</option>
                                            <option data-i18n="Never" value="none">Never</option>
                                        </select>
                                    </div>
                                    <label className="checkbox_label" htmlFor="frontend_frames_skip_highlight" title="Skip syntax highlighting for code blocks that render as frontend frames." data-i18n="[title]Skip syntax highlighting for code blocks that render as frontend frames.">
                                        <input id="frontend_frames_skip_highlight" type="checkbox" />
                                        <small data-i18n="Skip highlight on framed blocks">Skip highlight on framed blocks</small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="frontend_frames_use_blob_url" title="Debug: load frames via blob URLs instead of srcdoc." data-i18n="[title]Debug: load frames via blob URLs instead of srcdoc.">
                                        <input id="frontend_frames_use_blob_url" type="checkbox" />
                                        <small data-i18n="Use blob URLs (debug)">Use blob URLs (debug)</small>
                                    </label>
                                    <label className="checkbox_label" htmlFor="frontend_frames_allow_streaming" title="Render frames while a message is still streaming. Only documents in already-closed code fences mount." data-i18n="[title]Render frames while a message is still streaming. Only documents in already-closed code fences mount.">
                                        <input id="frontend_frames_allow_streaming" type="checkbox" />
                                        <small data-i18n="Render while streaming">Render while streaming</small>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        </>
    );
}
