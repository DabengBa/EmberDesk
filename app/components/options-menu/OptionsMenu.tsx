import { ContractButton } from '../contract/ContractButton';
import * as stylex from '@stylexjs/stylex';
import { useLayoutEffect, type RefObject } from 'react';
import type { createPopper } from '@popperjs/core';
import { cancelOpacity, transitionOpacity } from '../../../public/scripts/chat-ui-motion.js';
import { createOptionsMenuController } from '../../lib/history-panel-service';

const optionStyles = stylex.create({ item: { justifyContent: 'flex-start', textAlign: 'start' } });

export type OptionsMenuRuntime = {
    button: HTMLElement;
    menu: HTMLElement;
    createPopper: typeof createPopper;
    getMotion(): { duration: number; easing: string };
    onOpen(): void;
};

export function OptionsMenu({ showBackToMain = false, canRegenerate = false, canContinue = false, onCommand, runtime, closeRef }: {
    showBackToMain?: boolean;
    canRegenerate?: boolean;
    canContinue?: boolean;
    onCommand?: (id: string) => void;
    runtime?: OptionsMenuRuntime;
    closeRef: RefObject<(() => void) | null>;
}) {
    useLayoutEffect(() => {
        if (!runtime) return;
        const { button, menu } = runtime;
        let popper: ReturnType<typeof createPopper> | undefined;
        const controller = createOptionsMenuController({
            show() {
                button.setAttribute('aria-expanded', 'true');
                if (getComputedStyle(menu).display === 'none') {
                    menu.style.opacity = '0';
                    menu.style.display = 'block';
                }
                transitionOpacity(menu, { ...runtime.getMotion(), opacity: 1 });
                popper ??= runtime.createPopper(button, menu, { placement: 'top-start' });
                void popper.update();
                runtime.onOpen();
            },
            hide() {
                button.setAttribute('aria-expanded', 'false');
                transitionOpacity(menu, { ...runtime.getMotion(), opacity: 0, complete: () => { menu.style.display = 'none'; } });
                void popper?.update();
            },
            focus: () => button.focus(),
        });
        const detach = controller.attach(button, button.ownerDocument, () => menu.matches(':hover, :focus-within') || button.matches(':hover, :focus'));
        closeRef.current = controller.close;
        return () => {
            closeRef.current = null;
            detach();
            cancelOpacity(menu);
            popper?.destroy();
            menu.style.display = 'none';
            button.setAttribute('aria-expanded', 'false');
        };
    }, [runtime, closeRef]);

    return (
        <>
        <div className="options-content" onClick={event => {
            if (!onCommand || !(event.target instanceof Element)) return;
            const id = event.target.closest('button[id]')?.id;
            if (!id || !['option_start_new_chat', 'option_close_chat', 'option_select_chat', 'option_regenerate', 'option_continue', 'option_chat_memory', 'option_wire_log', 'option_delete_mes', 'option_back_to_main', 'attachFile'].includes(id)) return;
            event.stopPropagation();
            onCommand(id);
        }}>
            <ContractButton className="displayNone" variant="ghost" xstyle={optionStyles.item} label="Close chat" icon={<i className="fa-lg fa-solid fa-times" aria-hidden="true" />} />

            <ContractButton id="option_back_to_main" variant="ghost" xstyle={optionStyles.item} label="Back to parent chat" icon={<i className="fa-lg fa-solid fa-left-long" aria-hidden="true" />} style={showBackToMain ? undefined : { display: 'none' }} />
            <hr />
            <ContractButton id="option_start_new_chat" variant="ghost" xstyle={optionStyles.item} label="Start new chat" icon={<i className="fa-lg fa-solid fa-comments" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_close_chat" variant="ghost" xstyle={optionStyles.item} label="Close chat" icon={<i className="fa-lg fa-solid fa-times" aria-hidden="true" />} />
            <ContractButton id="option_select_chat" variant="ghost" xstyle={optionStyles.item} label="Manage chat files" icon={<i className="fa-lg fa-solid fa-address-book" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_regenerate" variant="ghost" xstyle={optionStyles.item} label="Regenerate reply" icon={<i className="fa-lg fa-solid fa-rotate-right" aria-hidden="true" />} tabIndex={0} disabled={!canRegenerate} />
            <ContractButton id="option_continue" variant="ghost" xstyle={optionStyles.item} label="Continue reply" icon={<i className="fa-lg fa-solid fa-forward" aria-hidden="true" />} tabIndex={0} disabled={!canContinue} />
            <ContractButton id="option_chat_memory" variant="ghost" xstyle={optionStyles.item} label="Chat memory" icon={<i className="fa-lg fa-solid fa-brain" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="option_wire_log" variant="ghost" xstyle={optionStyles.item} label="Wire Log" icon={<i className="fa-lg fa-solid fa-diagram-project" aria-hidden="true" />} tabIndex={0} />
            <ContractButton id="attachFile" variant="ghost" xstyle={optionStyles.item} label="Attach a File" icon={<i className="fa-lg fa-solid fa-paperclip" aria-hidden="true" />} tabIndex={0} />
            <hr />
            <ContractButton id="option_delete_mes" variant="ghost" xstyle={optionStyles.item} label="Delete messages" icon={<i className="fa-lg fa-solid fa-trash-can" aria-hidden="true" />} tabIndex={0} className="options-menu-danger" />
        </div>
        </>
    );
}
