import { describe, expect, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

describe('dialogue controller', () => {
    test('legacy selection resets all rows and selects indices from the chosen row through the end', async () => {
        const { selectLegacyDeleteRange } = await loadTsModule('app/lib/dialogue-service.ts');
        const events = [];
        selectLegacyDeleteRange(2, 5, {
            clear: () => events.push('clear'),
            markClicked: () => events.push('clicked'),
            select: index => events.push(index),
            announce: index => events.push(`announce:${index}`),
        });
        expect(events).toEqual(['clear', 'clicked', 'announce:2', 2, 3, 4]);
    });
    test('bulk deletion orders mutation, save, event, refresh and cleanup', async () => {
        const { runBulkDeleteEffects } = await loadTsModule('app/lib/dialogue-service.ts');
        const chat = [1, 2, 3, 4];
        const metadata = { tainted: false };
        const events = [];
        const ports = {
            chat, metadata, prepare: () => events.push('prepare'), isReactOwner: () => true,
            getIdentity: () => { events.push('identity'); return 'chat-a'; },
            removeLegacyRows: () => events.push('legacy-remove'), truncateUi: index => events.push(`truncate:${index}`),
            save: async () => { events.push(`save:${chat.length}:${metadata.tainted}`); },
            scrollLegacy: () => events.push('legacy-scroll'), emitDeleted: async index => { events.push(`emit:${index}`); },
            refreshReact: async identity => { events.push(`refresh:${identity}`); },
            markLegacyLast: () => events.push('legacy-last'), invalidSelection: () => events.push('invalid'),
            cleanup: () => events.push('cleanup'),
        };
        await runBulkDeleteEffects(2, ports);
        expect(events).toEqual(['prepare', 'identity', 'truncate:2', 'save:2:true', 'emit:2', 'refresh:chat-a', 'cleanup']);
        events.length = 0;
        ports.save = async () => { events.push('save-failed'); throw new Error('save failed'); };
        await expect(runBulkDeleteEffects(1, ports)).rejects.toThrow('save failed');
        expect(events).toEqual(['prepare', 'identity', 'truncate:1', 'save-failed', 'cleanup']);
        events.length = 0;
        ports.isReactOwner = () => false;
        ports.save = async () => { events.push(`save:${chat.length}`); };
        await runBulkDeleteEffects(0, ports);
        expect(events).toEqual(['prepare', 'legacy-remove', 'save:0', 'legacy-scroll', 'emit:0', 'legacy-last', 'cleanup']);
        events.length = 0;
        await runBulkDeleteEffects(-1, ports);
        expect(events).toEqual(['prepare', 'invalid', 'cleanup']);
    });
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
        expect(controller.begin('Deleting')).toBe(false);
        controller.select(4, 'Delete 3', 'Delete three');
        expect(controller.getSnapshot()).toEqual({ active: true, selected: 4, busy: false, summary: 'Delete 3', ariaLabel: 'Delete three' });
        expect(controller.begin('Deleting')).toBe(true);
        expect(controller.begin('Deleting')).toBe(false);
        controller.finish();
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
