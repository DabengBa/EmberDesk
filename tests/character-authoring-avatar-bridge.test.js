import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function cropHarness(show, mode = 'create') {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function processCharacterAvatarFile(');
    const end = source.indexOf('\n}\n\n/**', start) + 2;
    expect(start).toBeGreaterThanOrEqual(0);
    const save = jest.fn(async () => true);
    const preview = { setAttribute: jest.fn() };
    const fetch = jest.fn(async () => {});
    class Popup { cropData = { x: 12 }; show = show; }
    const runtime = runInNewContext(`let characterWorldDraftIdentity = {}, create_save = {}, chat = {};
        ${source.slice(start, end)};
        function getCharacterCardTarget() { return { avatar: 'existing.png', chat: 'chat', session: chat }; }
        ({run: processCharacterAvatarFile, draft: create_save, switchSession() { characterWorldDraftIdentity = {}; }, switchChat() { chat = {}; }});`, {
        Popup, POPUP_TYPE: { CROP: 1 }, getBase64Async: async () => 'data', createOrEditCharacter: save,
        getCurrentCharacterAuthoringMode: () => mode, getCurrentCharacterAuthoringSource: () => ({ avatar: 'existing.png' }),
        getThumbnailUrl: () => '/thumbnail/existing.png', fetch, console,
        document: { getElementById: () => preview, querySelectorAll: () => [] },
    });
    return { ...runtime, save, preview, fetch };
}

test('crop cancellation keeps the previously confirmed upload for the next save', async () => {
    const runtime = cropHarness(async () => null);
    const confirmed = { file: { name: 'confirmed.png' }, crop: { x: 1 }, preview: 'data:confirmed' };
    runtime.draft.avatar = confirmed;
    expect(await runtime.run({ name: 'cancelled.png' })).toBeUndefined();
    expect(runtime.draft.avatar).toBe(confirmed);
    expect(runtime.preview.setAttribute).not.toHaveBeenCalled();
    expect(runtime.save).not.toHaveBeenCalled();
});

test('confirmed creation upload carries its file, crop, and preview together', async () => {
    const runtime = cropHarness(async () => 'data:cropped');
    const file = { name: 'portrait.png' };
    expect(await runtime.run(file)).toBe('data:cropped');
    expect(runtime.draft.avatar).toEqual({ file, crop: { x: 12 }, preview: 'data:cropped' });
    expect(runtime.save).not.toHaveBeenCalled();
});

test.each(['switchSession', 'switchChat'])('a crop that resolves after %s cannot reach the edit save', async change => {
    let resolve;
    let ready;
    const shown = new Promise(done => { ready = done; });
    const runtime = cropHarness(() => new Promise(done => { resolve = done; ready(); }), 'edit');
    const pending = runtime.run({ name: 'portrait.png' });
    await shown;
    runtime[change]();
    resolve('data:cropped');
    expect(await pending).toBeUndefined();
    expect(runtime.save).not.toHaveBeenCalled();
    expect(runtime.draft.avatar).toBeUndefined();
});

test('edit saves the confirmed upload explicitly and discards a stale completion preview', async () => {
    const runtime = cropHarness(async () => 'data:cropped', 'edit');
    runtime.save.mockImplementation(async () => { runtime.switchSession(); return true; });
    const file = { name: 'portrait.png' };
    expect(await runtime.run(file)).toBeUndefined();
    expect(runtime.save).toHaveBeenCalledWith(undefined, { file, crop: { x: 12 }, preview: 'data:cropped' });
    expect(runtime.fetch).toHaveBeenCalledWith('/characters/existing.png', { method: 'GET', cache: 'reload' });
    expect(runtime.draft.avatar).toBeUndefined();
});
