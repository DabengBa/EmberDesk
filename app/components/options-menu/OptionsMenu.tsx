import { ContractButton } from '../contract/ContractButton';

/**
 * Options popup markup (React-owned inside #options). The shell keeps
 * display:none and is positioned by the lazy optionsPopper; item clicks are
 * dispatched by a document-delegated handler in dom-handlers.js so jQuery
 * .trigger('click', customData) compatibility is preserved for slash commands
 * and extensions. option_close_chat is intentionally duplicated in the legacy
 * markup — both elements are preserved.
 *
 * Items are Astryx ghost buttons: real <button> semantics (implicit role,
 * native Enter/Space) while keeping ids/classes for the delegated binding.
 * `.options-content` row styling is tag-agnostic (:is(a,button)).
 */
export function OptionsMenu() {
    return (
        <>
        <div className="options-content">
            <ContractButton id="option_close_chat" className="displayNone" variant="ghost" label="Close chat" icon={<i className="fa-lg fa-solid fa-times" aria-hidden="true" />} />

            <ContractButton id="option_toggle_AN" variant="ghost" label="Author's Note" icon={<i className="fa-lg fa-solid fa-note-sticky" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_toggle_CFG" variant="ghost" label="CFG Scale" icon={<i className="fa-lg fa-solid fa-scale-balanced" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_toggle_logprobs" variant="ghost" label="Token Probabilities" icon={<i className="fa-lg fa-solid fa-pie-chart" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_back_to_main" variant="ghost" label="Back to parent chat" icon={<i className="fa-lg fa-solid fa-left-long" aria-hidden="true" />} />
            <hr />
            <ContractButton id="option_start_new_chat" variant="ghost" label="Start new chat" icon={<i className="fa-lg fa-solid fa-comments" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_close_chat" variant="ghost" label="Close chat" icon={<i className="fa-lg fa-solid fa-times" aria-hidden="true" />} />
            <ContractButton id="option_select_chat" variant="ghost" label="Manage chat files" icon={<i className="fa-lg fa-solid fa-address-book" aria-hidden="true" />} tabIndex={0} />
            <hr />
            <ContractButton id="option_delete_mes" variant="ghost" label="Delete messages" icon={<i className="fa-lg fa-solid fa-trash-can" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_regenerate" variant="ghost" label="Regenerate" icon={<i className="fa-lg fa-solid fa-repeat" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_impersonate" variant="ghost" label="Impersonate" title="Ask AI to write your message for you" nativeTitle icon={<i className="fa-lg fa-solid fa-user-secret" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_continue" variant="ghost" label="Continue" title="Continue the last message" nativeTitle icon={<i className="fa-lg fa-solid fa-arrow-right" aria-hidden="true" />} tabIndex={0} />
        </div>
        </>
    );
}
