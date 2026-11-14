import { useEffect } from 'react';
import type { MainChatCommands } from '../../compat/workspace-commands';
import type { MainChatSnapshot } from '../../stores/main-chat-store';
import { dispatchChatEditShortcut, isChatShortcutModalOpen } from '../../../public/scripts/chat-shortcut-edit-commands.js';

export function useMainChatHotkeys({ snapshot, commands }: { snapshot: MainChatSnapshot; commands?: MainChatCommands }) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const composer = document.getElementById('send_textarea');
            const composerAtStart = composer instanceof HTMLTextAreaElement
                && document.activeElement === composer
                && composer.selectionStart === 0 && composer.selectionEnd === 0;
            const modalOpen = isChatShortcutModalOpen(document);
            const handled = dispatchChatEditShortcut({ event, snapshot, commands, modalOpen, composerAtStart });
            if (handled && event.key === 'Enter' && composer instanceof HTMLTextAreaElement) composer.focus();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [snapshot, commands]);
}
