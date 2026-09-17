export function LogprobsViewerPanel() {
    return (
        <>
            <div className="logprobs_panel_header">
                <div className="logprobs_panel_header">
                    <b data-i18n="Token Probabilities">Token Probabilities</b>
                </div>
                <div className="logprobs_panel_controls">
                    <div id="logprobsViewerheader" className="logprobs_panel_control_button drag-grabber">
                        <i className="custom-drawer-icon fa-solid fa-grip" />
                    </div>
                    <div id="logprobsMaximizeToggle" className="logprobs_panel_control_button inline-drawer-maximize fa-solid">
                        <i className="inline-drawer-icon fa-solid fa-window-maximize" />
                    </div>
                    <div id="logprovsViewerBlockToggle" className="logprobs_panel_control_button inline-drawer-toggle">
                        <i className="inline-drawer-icon fa-solid fa-circle-chevron-up up" />
                    </div>
                    <div id="logprobsViewerClose" className="logprobs_panel_control_button inline-drawer-icon fa-solid fa-circle-xmark "></div>
                </div>
            </div>
            <div className="logprobs_panel_content inline-drawer-content flex-container flexFlowColumn">
                <small className="flex-container alignItemsCenter justifySpaceBetween flexNoWrap">
                    <b data-i18n="Select a token to see alternatives considered by the AI.">Select a token to see alternatives considered by the AI.</b>
                    <button id="logprobsReroll" className="menu_button margin0" title="Reroll with the entire prefix" data-i18n="[title]Reroll with the entire prefix">
                        <span className="fa-solid fa-redo logprobs_reroll"></span>
                    </button>
                </small>
                <hr />
                <div id="logprobs_generation_output"></div>
                <div id="logprobs_selected_top_logprobs" className="logprobs_candidate_list"></div>
            </div>
        </>
    );
}
