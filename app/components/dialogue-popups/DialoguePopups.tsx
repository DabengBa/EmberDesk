import { ContractButton } from '../contract/ContractButton';

/**
 * Confirmation-popup controls (React-owned inside #dialogue_popup_controls).
 * #dialogue_popup/#dialogue_popup_holder/#dialogue_popup_text/
 * #dialogue_popup_input stay legacy markup — callers mutate them via jQuery
 * (.html(), .val(), class/display toggles). dom-handlers.js binds
 * #dialogue_popup_ok / #dialogue_popup_cancel by ID after mount, so the
 * IDs/classes/data-result contract stays on the rendered <button>.
 */
export function DialoguePopupControls() {
    return (
        <>
            <ContractButton
                id="dialogue_popup_ok"
                className="menu_button"
                label="Delete"
                labelClassName="dialogue-popup-btn-label"
                data-result="1"
            />
            <ContractButton id="dialogue_popup_cancel" className="menu_button" label="Cancel" data-result="0" />
        </>
    );
}

/**
 * Delete-messages confirmation buttons (React-owned inside #dialogue_del_mes).
 * The container itself stays legacy — chat-ops-service/dom-handlers toggle its
 * display and bind the buttons by ID.
 */
export function DialogueDelMesControls() {
    return (
        <>
            <ContractButton id="dialogue_del_mes_ok" className="menu_button" label="Delete" />
            <ContractButton id="dialogue_del_mes_cancel" className="menu_button" label="Cancel" />
        </>
    );
}
