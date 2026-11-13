import { describe, expect, test, jest } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';

describe('history panel controller', () => {
    test('export popup state coordinates toggling, positioning and focus restoration', async () => {
        const { createExportPopupController } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        const popup = createExportPopupController({
            position: trigger => calls.push(['position', trigger]),
            show: () => calls.push(['show']), hide: () => calls.push(['hide']),
            update: () => calls.push(['update']), focusFirst: () => calls.push(['first']),
            restoreFocus: trigger => calls.push(['restore', trigger]),
        });
        expect(popup.isOpen()).toBe(false);
        popup.toggle('first');
        expect(popup.isOpen()).toBe(true);
        popup.close(false);
        expect(popup.isOpen()).toBe(false);
        popup.toggle('second');
        popup.toggle('third');
        expect(popup.isOpen()).toBe(false);
        expect(calls).toEqual([
            ['position', 'first'], ['show'], ['update'], ['first'], ['hide'], ['update'],
            ['position', 'second'], ['show'], ['update'], ['first'],
            ['position', 'third'], ['hide'], ['update'], ['restore', 'third'],
        ]);
    });
    test('export popup dismisses only on Escape or outside pointer, with appropriate focus', async () => {
        const { createExportPopupDismissal } = await loadTsModule('app/lib/history-panel-service.ts');
        let open = false;
        const close = jest.fn();
        const dismissal = createExportPopupDismissal({ isOpen: () => open, close });
        expect(dismissal.key('Escape')).toBe(false);
        open = true;
        expect(dismissal.key('Enter')).toBe(false);
        expect(dismissal.pointer(true, false)).toBe(false);
        expect(dismissal.pointer(false, true)).toBe(false);
        expect(close).not.toHaveBeenCalled();
        expect(dismissal.pointer(false, false)).toBe(true);
        expect(close).toHaveBeenLastCalledWith(false);
        expect(dismissal.key('Escape')).toBe(true);
        expect(close).toHaveBeenLastCalledWith(true);
    });
    test('public history display ignores stale loads and passes highlights to the renderer', async () => {
        const { createHistoryDisplayCommand } = await loadTsModule('app/lib/history-panel-service.ts');
        let resolveOld;
        const renders = [], errors = [], queries = [];
        const display = createHistoryDisplayCommand({
            load: query => {
                queries.push(query);
                return query === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : query === 'bad' ? Promise.reject(new Error('offline')) : Promise.resolve([{ fileName: query }]);
            },
            render: async state => renders.push(state), error: error => errors.push(error.message),
        });
        const old = display('old', 'current', 'avatar', ['old']);
        await display('new', 'current', 'avatar', ['new']);
        resolveOld([{ fileName: 'old' }]);
        await old;
        expect(renders).toEqual([{ searchQuery: 'new', currentChat: 'current', avatarImg: 'avatar', highlightNames: ['new'], items: [{ fileName: 'new' }] }]);
        await display('bad', '', '', []);
        expect(errors).toEqual(['offline']);
        await display(undefined, '', '', []);
        expect(queries.at(-1)).toBeUndefined();
        expect(renders.at(-1).searchQuery).toBe('');
    });
    test('attachment merge preserves existing order and suppresses duplicates across incoming files', async () => {
        const { mergeAttachmentFiles } = await loadTsModule('app/lib/history-panel-service.ts');
        const existing = [{ id: 'a' }, { id: 'a' }, { id: 'b' }];
        const incoming = [{ id: 'b' }, { id: 'c' }, { id: 'c' }, { id: 'd' }];
        expect(mergeAttachmentFiles(existing, incoming, (a, b) => a.id === b.id).map(file => file.id)).toEqual(['a', 'a', 'b', 'c', 'd']);
        expect(existing.map(file => file.id)).toEqual(['a', 'a', 'b']);
    });
    test('committed selection follows rendered rows and clears when the list unmounts', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        const controller = createHistoryPanelController({ load: async () => [], focusSearch() {}, restoreFocus() {} });
        expect(controller.getRenderedSelection()).toBeNull();
        controller.commitRenderedSelection('chat A');
        expect(controller.getRenderedSelection()).toBe('chat A');
        controller.commitRenderedSelection(null);
        expect(controller.getRenderedSelection()).toBeNull();
        controller.commitRenderedSelection('chat B');
        controller.endSession();
        expect(controller.getRenderedSelection()).toBeNull();
    });
    test('rename validates, serializes and restores busy state', async () => {
        const { createHistoryRenameCommand } = await loadTsModule('app/lib/history-panel-service.ts');
        const events = [];
        let resolve;
        const rename = createHistoryRenameCommand('old', {
            invalid: () => events.push('invalid'), busy: value => events.push(`busy:${value}`),
            rename: name => { events.push(name); return new Promise(done => { resolve = done; }); },
            failed: () => events.push('failed'),
        });
        expect(await rename(true, '  ')).toBe(false);
        expect(await rename(true, 'old')).toBe(true);
        const pending = rename(true, ' new ');
        expect(await rename(false, '')).toBe(false);
        resolve(false);
        expect(await pending).toBe(false);
        expect(events).toEqual(['invalid', 'busy:true', 'new', 'failed', 'busy:false']);
    });
    test('deletion preserves confirmation, slash skip and delayed reopening', async () => {
        const { deleteHistoryChat } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        let delayed;
        const ports = { confirm: async () => { calls.push('confirm'); return true; }, close: () => calls.push('close'),
            showLoader: () => ({ hide: async () => calls.push('hide') }), remove: async file => calls.push(file),
            hideMenu: () => calls.push('menu'), reopen: () => calls.push('reopen'),
            schedule: callback => { delayed = callback; } };
        await deleteHistoryChat('chat', false, ports);
        expect(calls).toEqual(['confirm', 'close', 'chat.jsonl']);
        await delayed();
        expect(calls).toEqual(['confirm', 'close', 'chat.jsonl', 'reopen', 'menu', 'hide']);
        calls.length = 0;
        await deleteHistoryChat('chat', true, ports);
        expect(calls).toEqual(['close', 'chat.jsonl', 'menu', 'hide']);
        calls.length = 0;
        await deleteHistoryChat('chat', false, { ...ports, confirm: async () => false });
        expect(calls).toEqual([]);
        await expect(deleteHistoryChat('chat', true, { ...ports, remove: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
        expect(calls).toEqual(['close', 'hide']);
    });
    test('a failed deletion finishes loader cleanup before the caller can retry', async () => {
        const { deleteHistoryChat } = await loadTsModule('app/lib/history-panel-service.ts');
        let finishHide;
        let settled = false;
        const operation = deleteHistoryChat('chat', true, {
            confirm: async () => true, close() {}, showLoader: () => ({ hide: () => new Promise(resolve => { finishHide = resolve; }) }),
            remove: async () => { throw new Error('offline'); }, hideMenu() {}, reopen() {}, schedule() {},
        }).catch(() => { settled = true; });
        await Promise.resolve(); await Promise.resolve();
        expect(settled).toBe(false);
        finishHide();
        await operation;
        expect(settled).toBe(true);
    });
    test('a failed interactive deletion reopens history after the loader is gone', async () => {
        const { deleteHistoryChat } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        await expect(deleteHistoryChat('chat', false, {
            confirm: async () => true, close: () => calls.push('close'),
            showLoader: () => ({ hide: async () => calls.push('hide') }),
            remove: async () => { throw new Error('offline'); }, hideMenu() {}, reopen: () => calls.push('reopen'), schedule() {},
        })).rejects.toThrow('offline');
        expect(calls).toEqual(['close', 'hide', 'reopen']);
    });
    test('chat export reports result, failure and request errors with save-before-export', async () => {
        const { exportHistoryChat } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        const ports = { save: async () => calls.push('save'), request: async () => ({ ok: true, data: { message: 'ok', result: 'text' } }),
            wait: async () => calls.push('wait'), success: data => calls.push(data.message),
            failure: message => calls.push(`error:${message}`), download: (data, mime) => calls.push(`${data}:${mime}`), log: () => {} };
        await exportHistoryChat('txt', false, ports);
        expect(calls).toEqual(['save', 'wait', 'ok', 'text:text/plain']);
        calls.length = 0;
        await exportHistoryChat('jsonl', true, { ...ports, request: async () => ({ ok: false, data: { message: 'bad' } }) });
        expect(calls).toEqual(['wait', 'error:bad']);
        calls.length = 0;
        await exportHistoryChat('txt', true, { ...ports, request: async () => { throw new Error('offline'); } });
        expect(calls).toEqual(['wait', 'error:offline']);
    });
    test('menu actions preserve slash, send guards and cancelled confirmation', async () => {
        const { runHistoryMenuAction } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        let character = true, sending = true;
        const ports = { hasCharacter: () => character, isSending: () => sending, canRegenerate: () => false,
            history: async slash => calls.push(`history:${slash}`), confirmNew: async () => null,
            newChat: async () => calls.push('new'), newAssistant: async () => calls.push('assistant'),
            deleteMessages: () => calls.push('delete'), regenerate: () => calls.push('regenerate'),
            closeChat: async () => {}, memory: async () => {}, wireLog: async () => {}, backToMain: () => calls.push('back'), attachFile: () => calls.push('attach'), closeMenu: () => calls.push('close') };
        await runHistoryMenuAction('option_select_chat', true, ports);
        await runHistoryMenuAction('option_start_new_chat', false, ports);
        sending = false;
        await runHistoryMenuAction('option_start_new_chat', false, ports);
        character = false;
        await runHistoryMenuAction('option_start_new_chat', false, ports);
        expect(calls).toEqual(['history:true', 'close', 'close', 'assistant', 'close']);
        calls.length = 0;
        character = true;
        await runHistoryMenuAction('option_start_new_chat', false, { ...ports, confirmNew: async () => false });
        await runHistoryMenuAction('option_regenerate', false, ports);
        await runHistoryMenuAction('option_delete_mes', true, ports);
        expect(calls).toEqual(['new', 'close', 'close', 'delete', 'close']);
        calls.length = 0;
        await runHistoryMenuAction('option_back_to_main', false, ports);
        expect(calls).toEqual(['back', 'close']);
        calls.length = 0;
        await runHistoryMenuAction('attachFile', false, ports);
        expect(calls).toEqual(['attach', 'close']);
    });
    test('character export saves before requesting, downloads on success and handles failures', async () => {
        const { exportCharacter } = await loadTsModule('app/lib/history-panel-service.ts');
        const events = [];
        const ports = {
            close: () => events.push('close'),
            save: async () => events.push('save'),
            request: async format => { events.push(`request:${format}`); return { ok: true, data: 'blob' }; },
            download: async data => events.push(`download:${data}`),
            failure: error => events.push(error ? `error:${error.message}` : 'failed'),
        };
        await exportCharacter('', ports);
        expect(events).toEqual([]);
        await exportCharacter('json', ports);
        expect(events).toEqual(['close', 'save', 'request:json', 'download:blob']);
        events.length = 0;
        await exportCharacter('png', { ...ports, request: async () => ({ ok: false, data: null }) });
        expect(events).toEqual(['close', 'save', 'failed']);
        events.length = 0;
        await exportCharacter('json', { ...ports, save: async () => { throw new Error('save failed'); } });
        expect(events).toEqual(['close', 'error:save failed']);
    });
    test('imports supported files sequentially, skips invalid formats and refreshes once', async () => {
        const { importHistoryFiles } = await loadTsModule('app/lib/history-panel-service.ts');
        const calls = [];
        const names = await importHistoryFiles([{ name: 'one.JSONL' }, { name: 'bad.txt' }, { name: 'two.json' }], {
            invalid: file => calls.push(`invalid:${file.name}`),
            importFile: async (file, format) => { calls.push(`${file.name}:${format}`); return [file.name]; },
            complete: async imported => calls.push(`refresh:${imported.join(',')}`),
        });
        expect(names).toEqual(['one.JSONL', 'two.json']);
        expect(calls).toEqual(['one.JSONL:jsonl', 'invalid:bad.txt', 'two.json:json', 'refresh:one.JSONL,two.json']);
    });
    test('projects history records in timestamp order using the existing date ports without mutating the response', async () => {
        const { projectHistoryChats } = await loadTsModule('app/lib/history-panel-service.ts');
        const input = [
            { file_name: 'old', last_mes: 1, file_size: '2k', message_count: 3, preview_message: 'before' },
            { file_name: 'new', last_mes: 3 },
            { file_name: 'middle', last_mes: 2, message_count: '5' },
        ];
        const items = projectHistoryChats(input, (a, b) => Number(b) - Number(a), value => `date:${value}`);
        expect(items).toEqual([
            { fileName: 'new', fileSize: '', messageCount: 0, preview: '', dateLabel: 'date:3' },
            { fileName: 'middle', fileSize: '', messageCount: 5, preview: '', dateLabel: 'date:2' },
            { fileName: 'old', fileSize: '2k', messageCount: 3, preview: 'before', dateLabel: 'date:1' },
        ]);
        expect(input.map(item => item.file_name)).toEqual(['old', 'new', 'middle']);
    });
    test('display reports whether its response was committed, including stale and failed loads', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let release;
        const controller = createHistoryPanelController({
            load: query => query === 'old' ? new Promise(resolve => { release = resolve; }) : query === 'bad' ? Promise.reject(new Error('bad')) : Promise.resolve(['new']),
            focusSearch() {}, restoreFocus() {},
        });

        const old = controller.displayChats('old');
        expect(await controller.displayChats('new')).toBe(true);
        release(['old']);
        expect(await old).toBe(false);
        expect(await controller.displayChats('bad')).toBe(false);
        expect(controller.getSnapshot().error.message).toBe('bad');
    });
    test('search text updates immediately without starting a fetch', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let loads = 0;
        const controller = createHistoryPanelController({ load: async () => { loads++; return []; }, focusSearch() {}, restoreFocus() {} });
        controller.setSearchQuery('draft');
        expect(controller.getSnapshot().searchQuery).toBe('draft');
        expect(loads).toBe(0);
    });
    test('typing invalidates an in-flight load before the debounced search starts', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let release;
        const controller = createHistoryPanelController({
            load: () => new Promise(resolve => { release = resolve; }), focusSearch() {}, restoreFocus() {},
        });
        const pending = controller.displayChats('old');
        controller.setSearchQuery('new');
        expect(controller.getSnapshot()).toMatchObject({ searchQuery: 'new', loading: false });
        release(['stale']);
        expect(await pending).toBe(false);
        expect(controller.getSnapshot()).toMatchObject({ searchQuery: 'new', items: [] });
    });
    test('compatibility loads preserve the original query while normalizing displayed text', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        const load = jest.fn(async () => []);
        const controller = createHistoryPanelController({ load, focusSearch() {}, restoreFocus() {} });
        await controller.displayChats('', [], { rawQuery: undefined });
        expect(load).toHaveBeenLastCalledWith(undefined, []);
        expect(controller.getSnapshot().searchQuery).toBe('');
        await controller.displayChats('search', []);
        expect(load).toHaveBeenLastCalledWith('search', []);
    });
    test('rename and delete share busy protection, publish errors and release on close', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let finish;
        const failure = new Error('rename failed');
        const deleteChat = jest.fn();
        const controller = createHistoryPanelController({
            load: async () => [], focusSearch() {}, restoreFocus() {},
            renameChat: () => new Promise((_, reject) => { finish = () => reject(failure); }),
            deleteChat,
        });
        await controller.displayChats();
        const pending = controller.renameChat('A');
        await controller.deleteChat('A');
        expect(deleteChat).not.toHaveBeenCalled();
        finish();
        await pending;
        expect(controller.getSnapshot()).toMatchObject({ busy: false, error: failure });
        await controller.deleteChat('A');
        expect(deleteChat).toHaveBeenCalledWith('A');
    });

    test('projected rows update the active typed snapshot without resetting busy', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let finish;
        const controller = createHistoryPanelController({ load: async () => [], focusSearch() {}, restoreFocus() {}, openChat: () => new Promise(resolve => { finish = resolve; }) });
        controller.project(['a'], 'q');
        const pending = controller.openChat('a');
        controller.project(['b'], 'next');
        expect(controller.getSnapshot()).toMatchObject({ items: ['b'], searchQuery: 'next', busy: true });
        controller.endSession();
        finish();
        await pending;
        expect(controller.getSnapshot()).toMatchObject({ open: false, busy: false });
    });
    test('export saves before downloading and ignores a duplicate while pending', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let finishSave;
        const order = [];
        const controller = createHistoryPanelController({
            load: async () => [], focusSearch() {}, restoreFocus() {},
            saveChat: () => new Promise(resolve => { order.push('save'); finishSave = resolve; }),
            exportChat: async (name, format) => { order.push(`${name}:${format}`); },
        });
        const first = controller.exportChat('A', 'jsonl');
        await controller.exportChat('A', 'jsonl');
        expect(order).toEqual(['save']);
        expect(controller.getSnapshot().busy).toBe(true);
        finishSave();
        await first;
        expect(order).toEqual(['save', 'A:jsonl']);
        expect(controller.getSnapshot().busy).toBe(false);
    });

    test('failed open remains open, exposes error and releases busy', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        const failure = new Error('load failed');
        const controller = createHistoryPanelController({
            load: async () => [], focusSearch() {}, restoreFocus() {},
            openChat: async () => { throw failure; },
        });
        await controller.displayChats();
        await controller.openChat('A');
        expect(controller.getSnapshot()).toMatchObject({ open: true, busy: false, error: failure });
    });

    test('failed save prevents export and exposes the failure', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        const failure = new Error('save failed');
        const exportChat = jest.fn();
        const controller = createHistoryPanelController({
            load: async () => [], focusSearch() {}, restoreFocus() {},
            saveChat: async () => { throw failure; }, exportChat,
        });
        await controller.exportChat('A', 'txt');
        expect(exportChat).not.toHaveBeenCalled();
        expect(controller.getSnapshot()).toMatchObject({ busy: false, error: failure });
    });

    test('a pending open cannot close a newly reopened history', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let finish;
        const restoreFocus = jest.fn();
        const controller = createHistoryPanelController({
            load: async () => [], focusSearch() {}, restoreFocus,
            openChat: () => new Promise(resolve => { finish = resolve; }),
        });
        await controller.displayChats();
        const pending = controller.openChat('A');
        controller.closeSelectChatPopup();
        await controller.displayChats();
        finish();
        await pending;
        expect(controller.getSnapshot().open).toBe(true);
        expect(restoreFocus).toHaveBeenCalledTimes(1);
    });

    test('a search that resolves after closing cannot replace a reopened history', async () => {
        const { createHistoryPanelController } = await loadTsModule('app/lib/history-panel-service.ts');
        let resolveOld;
        const load = jest.fn()
            .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
            .mockResolvedValueOnce(['new']);
        const controller = createHistoryPanelController({ load, focusSearch: jest.fn(), restoreFocus: jest.fn() });
        const old = controller.displayChats('old');
        controller.closeSelectChatPopup();
        await controller.displayChats('new');
        resolveOld(['old']);
        await old;
        expect(controller.getSnapshot().items).toEqual(['new']);
    });
});
