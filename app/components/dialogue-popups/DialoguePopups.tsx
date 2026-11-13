import { ContractButton } from '../contract/ContractButton';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { createBulkDeleteController, createDialogueController, createDialoguePresentationController } from '../../lib/dialogue-service';

export function DialoguePopupContent({ controller, renderContent }: { controller: ReturnType<typeof createDialoguePresentationController>; renderContent: (content: unknown) => void }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    useLayoutEffect(() => {
        if (state.revision) renderContent(state.content);
    }, [state, renderContent]);
    return null;
}

export function DialoguePopupInput({ controller }: { controller: ReturnType<typeof createDialogueController> }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const input = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        if (state.open && state.type === 'input') input.current?.focus();
    }, [state.open, state.type]);
    return <textarea ref={input} id="dialogue_popup_input" className="text_pole" data-react-dialogue-input="true" rows={state.rows} value={state.input} style={{ display: state.type === 'input' ? undefined : 'none' }} onChange={event => controller.setInput(event.currentTarget.value)} />;
}

/**
 * Confirmation-popup controls (React-owned inside #dialogue_popup_controls).
 * #dialogue_popup/#dialogue_popup_holder/#dialogue_popup_text/
 * #dialogue_popup_input stay legacy markup — callers mutate them via jQuery
 * (.html(), .val(), class/display toggles). dom-handlers.js binds
 * #dialogue_popup_ok / #dialogue_popup_cancel by ID after mount, so the
 * IDs/classes/data-result contract stays on the rendered <button>.
 */
export function DialoguePopupControls({ commands }: { commands?: { confirmDialoguePopup(): void; cancelDialoguePopup(): void } } = {}) {
    return (
        <>
            <ContractButton
                id="dialogue_popup_ok"
                className="menu_button"
                label="Delete"
                labelClassName="dialogue-popup-btn-label"
                data-result="1"
                onClick={commands?.confirmDialoguePopup}
            />
            <ContractButton id="dialogue_popup_cancel" className="menu_button" label="Cancel" data-result="0" onClick={commands?.cancelDialoguePopup} />
        </>
    );
}

/**
 * Delete-messages confirmation buttons (React-owned inside #dialogue_del_mes).
 * The container itself stays legacy — chat-ops-service/dom-handlers toggle its
 * display and bind the buttons by ID.
 */
export function DialogueDelMesControls({ controller, commands }: { controller: ReturnType<typeof createBulkDeleteController>; commands: { confirm(): void; cancel(): void } }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    return (
        <>
            <p id="dialogue_del_mes_summary" role="status" aria-live="polite">{state.summary}</p>
            <ContractButton id="dialogue_del_mes_ok" className="menu_button" label="Delete" ariaLabel={state.ariaLabel} disabled={state.selected === null || state.busy} onClick={commands.confirm} />
            <ContractButton id="dialogue_del_mes_cancel" className="menu_button" label="Cancel" disabled={state.busy} onClick={commands.cancel} />
        </>
    );
}
