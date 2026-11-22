import { describe, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

describe('React history dialog presentation', () => {
    test('opens and focuses search, handles Escape and native close, and cleans up', async () => {
        const { createSelectChatPresentation } = await loadTsModule('app/components/select-chat/select-chat-presentation.ts');
        const calls = [];
        const dialog = new EventTarget();
        dialog.open = false;
        dialog.showModal = () => { calls.push('show'); dialog.open = true; };
        dialog.close = () => { calls.push('close'); dialog.open = false; dialog.dispatchEvent(new Event('close')); };
        const search = { focus: () => calls.push('focus'), select: () => calls.push('select') };
        const onClosed = jest.fn(() => calls.push('closed'));
        const presentation = createSelectChatPresentation(dialog, () => search, onClosed);

        presentation.open();
        presentation.open();
        expect(calls).toEqual(['show', 'focus', 'select', 'focus', 'select']);
        presentation.focusSearch();
        expect(calls.at(-1)).toBe('focus');
        const escape = new Event('keydown');
        Object.defineProperty(escape, 'key', { value: 'Escape' });
        const stop = jest.spyOn(escape, 'stopPropagation');
        dialog.dispatchEvent(escape);
        expect(stop).toHaveBeenCalledTimes(1);
        presentation.close();
        expect(calls.slice(-2)).toEqual(['close', 'closed']);
        dialog.dispatchEvent(new Event('close'));
        expect(onClosed).toHaveBeenCalledTimes(2);
        presentation.dispose();
        dialog.dispatchEvent(new Event('close'));
        expect(onClosed).toHaveBeenCalledTimes(2);
    });
});
