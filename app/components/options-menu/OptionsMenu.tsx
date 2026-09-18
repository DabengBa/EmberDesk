/**
 * Options popup markup (React-owned inside #options). The shell keeps
 * display:none and is positioned by the lazy optionsPopper; item clicks are
 * dispatched by a document-delegated handler in dom-handlers.js so jQuery
 * .trigger('click', customData) compatibility is preserved for slash commands
 * and extensions. option_close_chat is intentionally duplicated in the legacy
 * markup — both elements are preserved.
 */
export function OptionsMenu() {
    return (
        <>
        <div className="options-content">
            <a id="option_close_chat" className="displayNone">
                <i className="fa-lg fa-solid fa-times" />
                <span data-i18n="Close chat">Close chat</span>
            </a>
            <a id="option_settings" className="displayNone">
                <i className="fa-lg fa-solid fa-cog" />
                <span data-i18n="Toggle Panels">Toggle Panels</span>
            </a>
            <a id="option_toggle_AN" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-note-sticky" />
                <span data-i18n="Author's Note">Author's Note</span>
            </a>
            <a id="option_toggle_CFG" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-scale-balanced" />
                <span data-i18n="CFG Scale">CFG Scale</span>
            </a>
            <a id="option_toggle_logprobs" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-pie-chart" />
                <span data-i18n="Token Probabilities">Token Probabilities</span>
            </a>
            <a id="option_back_to_main">
                <i className="fa-lg fa-solid fa-left-long" />
                <span data-i18n="Back to parent chat">Back to parent chat</span>
            </a>
            <a id="option_new_bookmark">
                <i className="fa-lg fa-solid fa-flag" />
                <span data-i18n="Save checkpoint">Save checkpoint</span>
            </a>
            <hr />
            <a id="option_start_new_chat" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-comments" />
                <span data-i18n="Start new chat">Start new chat</span>
            </a>
            <a id="option_close_chat">
                <i className="fa-lg fa-solid fa-times" />
                <span data-i18n="Close chat">Close chat</span>
            </a>
            <a id="option_select_chat" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-address-book" />
                <span data-i18n="Manage chat files">Manage chat files</span>
            </a>
            <hr />
            <a id="option_delete_mes" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-trash-can" />
                <span data-i18n="Delete messages">Delete messages</span>
            </a>
            <a id="option_regenerate" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-repeat" />
                <span data-i18n="Regenerate">Regenerate</span>
            </a>
            <a id="option_impersonate" title="Ask AI to write your message for you" data-i18n="[title]Ask AI to write your message for you" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-user-secret" />
                <span data-i18n="Impersonate">Impersonate</span>
            </a>
            <a id="option_continue" title="Continue the last message" data-i18n="[title]Continue the last message" role="button" tabIndex={0}>
                <i className="fa-lg fa-solid fa-arrow-right" />
                <span data-i18n="Continue">Continue</span>
            </a>
        </div>
        </>
    );
}
