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
 * The shell retains stable hosts; React buttons call the dialogue commands
 * and keep their IDs and result attributes for native consumers.
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

export interface DialogueDelMesRuntime {
    controller: ReturnType<typeof createBulkDeleteController>;
    dialogue: HTMLElement;
    composer: HTMLElement;
    deletingLabel(): string;
    deleteFrom(index: number): Promise<boolean>;
    requestComposerFocus(): void;
}

export function DialogueDelMesControls({ controller, dialogue, composer, deletingLabel, deleteFrom, requestComposerFocus }: DialogueDelMesRuntime) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const wasActive = useRef(false);
    useLayoutEffect(() => {
        if (!state.active) {
            if (wasActive.current) requestComposerFocus();
            wasActive.current = false;
            return;
        }

        wasActive.current = true;
        const composerDisplay = composer.style.display;
        const dialogueDisplay = dialogue.style.display;
        composer.style.display = 'none';
        dialogue.style.display = 'block';
        return () => {
            composer.style.display = composerDisplay;
            dialogue.style.display = dialogueDisplay;
        };
    }, [state.active, dialogue, composer, requestComposerFocus]);

    useLayoutEffect(() => {
        if (!state.busy) return;
        dialogue.setAttribute('aria-busy', 'true');
        return () => dialogue.removeAttribute('aria-busy');
    }, [state.busy, dialogue]);

    return (
        <>
            <p id="dialogue_del_mes_summary" role="status" aria-live="polite">{state.summary}</p>
            <ContractButton id="dialogue_del_mes_ok" className="menu_button" label="Delete" ariaLabel={state.ariaLabel} disabled={state.selected === null || state.busy} onClick={() => controller.confirm(deletingLabel(), deleteFrom)} />
            <ContractButton id="dialogue_del_mes_cancel" className="menu_button" label="Cancel" disabled={state.busy} onClick={controller.finish} />
        </>
    );
}
