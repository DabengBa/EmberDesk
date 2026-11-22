import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadTsModule } from './helpers/load-ts-module.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('React chat scroll lock keeps the strict five pixel boundary and cleans up its listener', () => {
    const source = read('app/components/main-chat/MainChatMessageListWorkspacePanel.tsx');
    const start = source.indexOf('    useLayoutEffect(() => {');
    const end = source.indexOf('    }, [commands]);', start) + '    }, [commands]);'.length;
    expect(start).toBeGreaterThan(-1);
    let handler, cleanup;
    const chat = { scrollHeight: 100, clientHeight: 50, scrollTop: 46,
        addEventListener: jest.fn((type, fn) => { handler = fn; }), removeEventListener: jest.fn() };
    const setScrollLock = jest.fn();
    runInNewContext(source.slice(start, end), {
        document: { getElementById: () => chat }, commands: { setScrollLock },
        useLayoutEffect: effect => { cleanup = effect(); }, Math,
    });
    handler();
    chat.scrollTop = 45; handler();
    expect(setScrollLock.mock.calls).toEqual([[false], [true]]);
    cleanup();
    expect(chat.removeEventListener).toHaveBeenCalledWith('scroll', handler);
});

test('React row selects via the shared controller and ignores inactive or busy selection', async () => {
    const { createBulkDeleteController } = await loadTsModule('app/lib/dialogue-service.ts');
    const controller = createBulkDeleteController();
    const script = read('public/script.js');
    const start = script.indexOf('selectBulkMessage: index => {');
    const end = script.indexOf('\n            },', start);
    expect(start).toBeGreaterThan(-1);
    const command = runInNewContext(`({${script.slice(start, end)}\n}}).selectBulkMessage`, {
        chat: [0, 1, 2, 3], bulkDeleteController: controller,
        t: (strings, ...values) => strings.reduce((result, part, i) => result + part + (values[i] ?? ''), ''),
    });
    const row = read('app/components/main-chat/MainChatMessageRow.tsx');
    const rowStart = row.indexOf('onClick={event => {', row.indexOf('data-main-chat-message-row-owner="react"'));
    const rowEnd = row.indexOf('\n            }}', rowStart);
    expect(rowStart).toBeGreaterThan(-1);
    const body = row.slice(rowStart + 'onClick={event => {'.length, rowEnd);
    const stopPropagation = jest.fn();
    const click = () => runInNewContext(`(event => {${body}\n})`, {
        bulk: controller.getSnapshot(), canSelectBulkMessage: true, numericMessageId: 1,
        commands: { selectBulkMessage: command },
    })({ stopPropagation });
    click(); expect(controller.getSnapshot().selected).toBeNull();
    controller.open('Choose'); click();
    expect(controller.getSnapshot()).toMatchObject({ selected: 1, summary: 'Delete 3 messages, from message 2 through the end of this chat.' });
    let resolve;
    const pending = controller.confirm('Deleting', () => new Promise(done => { resolve = done; }));
    click();
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    resolve(); await pending;
    expect(controller.getSnapshot()).toMatchObject({ active: false, selected: null });
});

test('composition waits for composer then all initial panels before runtime reveal', async () => {
    const source = read('app/components/workspace/workspace-entry.ts');
    const start = source.indexOf('        await mounts.mountChatComposer();');
    const end = source.indexOf('        await startWorkspaceRuntime(revealWorkspace);', start) + '        await startWorkspaceRuntime(revealWorkspace);'.length;
    expect(start).toBeGreaterThan(-1);
    const calls = []; let finishComposer, finishPanel;
    const composer = new Promise(resolve => { finishComposer = resolve; });
    const panel = new Promise(resolve => { finishPanel = resolve; });
    const mounts = Object.fromEntries(['mountCharacterPopup', 'mountRightNavPanel', 'mountSelectChatPopup', 'mountCharacterContextMenu', 'mountOptionsMenu', 'mountExportFormatPopup', 'mountDialogueDelMesControls'].map(name => [name, () => { calls.push(name); return panel; }]));
    mounts.mountChatComposer = () => { calls.push('composer'); return composer; };
    const startRuntime = jest.fn(() => calls.push('runtime'));
    const run = runInNewContext(`(async () => {${source.slice(start, end)}\n})`, { mounts, Promise, startWorkspaceRuntime: startRuntime, revealWorkspace: () => {} });
    const pending = run(); expect(calls).toEqual(['composer']);
    finishComposer(); await new Promise(resolve => setImmediate(resolve));
    expect(calls).toHaveLength(8); expect(startRuntime).not.toHaveBeenCalled();
    finishPanel(); await pending;
    expect(calls.at(-1)).toBe('runtime');
});
