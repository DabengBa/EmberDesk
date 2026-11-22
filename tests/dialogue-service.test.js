import { describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

describe('dialogue controller', () => {

    test('presentation cancels stale close cleanup when reopened', async () => {
        const { createDialoguePresentationController } = await loadTsModule('app/lib/dialogue-service.ts');
        const actions = [];
        const callbacks = [];
        const controller = createDialoguePresentationController({
            show: () => actions.push('show'), fadeIn: () => actions.push('in'),
            fadeOut: () => actions.push('out'), hide: kind => actions.push(`hide:${kind}`),
            schedule: callback => callbacks.push(callback),
        });
        const node = { node: true };
        controller.open(node);
        expect(controller.getSnapshot().content).toBe(node);
        controller.close('confirm');
        controller.open('next');
        callbacks[0]();
        expect(actions).toEqual(['show', 'in', 'out', 'show', 'in']);
        controller.close('cancel');
        callbacks[1]();
        expect(actions.at(-1)).toBe('hide:cancel');
    });
    test('bulk command serializes deletion and resets even on failure', async () => {
        const { createBulkDeleteController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createBulkDeleteController();
        controller.open('Choose');
        controller.select(3, 'Delete', 'Delete');
        let reject;
        const calls = [];
        const first = controller.confirm('Deleting', index => { calls.push(index); return new Promise((_, fail) => { reject = fail; }); });
        await controller.confirm('Deleting', index => { calls.push(index); });
        expect(calls).toEqual([3]);
        expect(controller.getSnapshot().busy).toBe(true);
        reject(new Error('failed'));
        await expect(first).rejects.toThrow('failed');
        expect(controller.getSnapshot()).toMatchObject({ active: false, selected: null, busy: false });
    });
    test('bulk selection mode is a shared observable lifetime', async () => {
        const { getWorkspaceBulkDeleteController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = getWorkspaceBulkDeleteController();
        expect(getWorkspaceBulkDeleteController()).toBe(controller);
        expect(controller.getSnapshot().active).toBe(false);
        controller.open('Choose');
        expect(controller.getSnapshot().active).toBe(true);
        controller.select(2, 'Delete', 'Delete');
        controller.finish();
        expect(controller.getSnapshot()).toMatchObject({ active: false, selected: null, busy: false });
    });
    test('completion after a chat switch does not close the new selection', async () => {
        const { createBulkDeleteController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createBulkDeleteController();
        controller.open('Choose');
        controller.select(1, 'Delete', 'Delete');
        let resolve;
        const confirmation = controller.confirm('Deleting', () => new Promise(done => { resolve = done; }));
        controller.finish();
        controller.open('Choose in the new chat');
        controller.select(3, 'Delete new', 'Delete new');
        resolve();
        await confirmation;
        expect(controller.getSnapshot()).toMatchObject({ active: true, selected: 3, busy: false });
    });
    test('input popup publishes its rows and edited input until it resolves', async () => {
        const { createDialogueController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createDialogueController();
        const result = controller.callPopup('input', 'initial', 4);
        expect(controller.getSnapshot()).toMatchObject({ open: true, input: 'initial', rows: 4 });
        controller.setInput('changed');
        expect(controller.getSnapshot().input).toBe('changed');
        controller.confirmDialoguePopup();
        expect(await result).toBe('changed');
    });
    test('bulk delete selection and busy state prevent duplicate confirmation and reset on finish', async () => {
        const { createBulkDeleteController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createBulkDeleteController();
        controller.open('Choose');
        const calls = [];
        await controller.confirm('Deleting', index => calls.push(index));
        expect(calls).toEqual([]);
        controller.select(4, 'Delete 3', 'Delete three');
        expect(controller.getSnapshot()).toEqual({ active: true, selected: 4, busy: false, summary: 'Delete 3', ariaLabel: 'Delete three' });
        let resolve;
        const pending = controller.confirm('Deleting', index => { calls.push(index); return new Promise(done => { resolve = done; }); });
        await controller.confirm('Deleting', index => calls.push(index));
        controller.select(2, 'Other', 'Other');
        expect(calls).toEqual([4]);
        expect(controller.getSnapshot()).toMatchObject({ selected: 4, busy: true });
        resolve();
        await pending;
        expect(controller.getSnapshot().selected).toBe(null);
        expect(controller.getSnapshot().busy).toBe(false);
    });
    test('input confirmation resolves its value and resets input', async () => {
        const { createDialogueController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createDialogueController();
        const result = controller.callPopup('input', 'first');
        controller.setInput('updated');
        controller.confirmDialoguePopup();
        expect(await result).toBe('updated');
        expect(controller.getSnapshot().input).toBe('');
    });

    test('cancel resolves false and clears popup type', async () => {
        const { createDialogueController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createDialogueController();
        const result = controller.callPopup('confirm');
        controller.cancelDialoguePopup();
        expect(await result).toBe(false);
        expect(controller.getSnapshot().type).toBe('');
    });

    test('a synchronous subscriber can confirm immediately when the popup opens', async () => {
        const { createDialogueController } = await loadTsModule('app/lib/dialogue-service.ts');
        const controller = createDialogueController();
        controller.subscribe(() => {
            if (controller.getSnapshot().open) controller.confirmDialoguePopup();
        });
        const result = controller.callPopup('confirm');
        expect(await Promise.race([result, Promise.resolve('unresolved')])).toBe(true);
    });
});
