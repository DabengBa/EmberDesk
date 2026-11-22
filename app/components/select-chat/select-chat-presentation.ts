/** Installed by the React popup for the retained native dialog shell. */
export function createSelectChatPresentation(dialog: HTMLDialogElement, getSearch: () => HTMLInputElement | null, onClosed: () => void) {
    const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') event.stopPropagation();
    };
    dialog.addEventListener('keydown', keydown);
    dialog.addEventListener('close', onClosed);
    return {
        open() {
            if (!dialog.open) dialog.showModal();
            const search = getSearch();
            search?.focus();
            search?.select();
        },
        close() { if (dialog.open) dialog.close(); },
        focusSearch() { if (dialog.open) getSearch()?.focus(); },
        dispose() {
            dialog.removeEventListener('keydown', keydown);
            dialog.removeEventListener('close', onClosed);
        },
    };
}
