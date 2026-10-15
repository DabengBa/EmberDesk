import { ContractButton } from '../contract/ContractButton';
import * as stylex from '@stylexjs/stylex';

const optionStyles = stylex.create({ item: { justifyContent: 'flex-start', textAlign: 'start' } });

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
 *
 * `showBackToMain` projects branch-chat state (was jQuery .show()/.hide() from
 * showBranchChatButtons). The item stays mounted when hidden so delegated
 * trigger('click') paths keep working.
 */
export function OptionsMenu({ showBackToMain = false }: { showBackToMain?: boolean }) {
    return (
        <>
        <div className="options-content">
            <ContractButton className="displayNone" variant="ghost" xstyle={optionStyles.item} label="Close chat" icon={<i className="fa-lg fa-solid fa-times" aria-hidden="true" />} />

            <ContractButton id="option_back_to_main" variant="ghost" xstyle={optionStyles.item} label="Back to parent chat" icon={<i className="fa-lg fa-solid fa-left-long" aria-hidden="true" />} style={showBackToMain ? undefined : { display: 'none' }} />
            <hr />
            <ContractButton id="option_start_new_chat" variant="ghost" xstyle={optionStyles.item} label="Start new chat" icon={<i className="fa-lg fa-solid fa-comments" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_close_chat" variant="ghost" xstyle={optionStyles.item} label="Close chat" icon={<i className="fa-lg fa-solid fa-times" aria-hidden="true" />} />
            <ContractButton id="option_select_chat" variant="ghost" xstyle={optionStyles.item} label="Manage chat files" icon={<i className="fa-lg fa-solid fa-address-book" aria-hidden="true" />} tabIndex={0} />
            <hr />
            <ContractButton id="option_delete_mes" variant="ghost" xstyle={optionStyles.item} label="Delete messages" icon={<i className="fa-lg fa-solid fa-trash-can" aria-hidden="true" />} tabIndex={0} className="options-menu-danger" />
        </div>
        </>
    );
}
