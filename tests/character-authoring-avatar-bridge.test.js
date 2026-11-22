import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('authoring file command forwards the file to the existing crop processor', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('processAvatarFile: async file => {');
    const end = source.indexOf('\n            },', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const input = new (class HTMLInputElement {})();
    const file = { name: 'portrait.png' };
    class DataTransfer { constructor() { this.files = []; this.items = { add: value => this.files.push(value) }; } }
    const read_avatar_load = jest.fn(async () => 'data:image/png;base64,cropped');
    const command = runInNewContext(`({${source.slice(start, end)}\n}}).processAvatarFile`, {
        document: { getElementById: () => input }, HTMLInputElement: input.constructor, DataTransfer, read_avatar_load,
    });
    expect(await command(file)).toBe('data:image/png;base64,cropped');
    expect(input.files).toEqual([file]);
    expect(read_avatar_load).toHaveBeenCalledWith(input);
});

test('crop cancellation leaves the draft processing without a preview or save', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function read_avatar_load(');
    const end = source.indexOf('\n}\n\n/**', start) + 2;
    const save = jest.fn();
    class Popup { async show() { return null; } }
    const run = runInNewContext(`let selected_button = 'create', menu_type = 'create', create_save = {}, crop_data; ${source.slice(start, end)}; read_avatar_load;`, {
        Popup, POPUP_TYPE: { CROP: 1 }, getBase64Async: async () => 'data', createOrEditCharacter: save,
    });
    expect(await run({ files: [{ name: 'portrait.png' }] })).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
});

test('create mode retains the selected file and crop while returning the cropped preview', async () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function read_avatar_load(');
    const end = source.indexOf('\n}\n\n/**', start) + 2;
    const preview = { setAttribute: jest.fn() }, save = jest.fn();
    class Popup { constructor() { this.cropData = { x: 12 }; } async show() { return 'data:cropped'; } }
    const context = { Popup, POPUP_TYPE: { CROP: 1 }, getBase64Async: async () => 'data',
        createOrEditCharacter: save, document: { getElementById: () => preview } };
    const run = runInNewContext(`let selected_button = 'create', menu_type = 'create', create_save = {}, crop_data; ${source.slice(start, end)}; ({read_avatar_load, state: () => ({create_save, crop_data})});`, context);
    const files = [{ name: 'portrait.png' }];
    expect(await run.read_avatar_load({ files })).toBe('data:cropped');
    expect(run.state().create_save.avatar).toBe(files);
    expect(run.state().crop_data.x).toBe(12);
    expect(preview.setAttribute).toHaveBeenCalledWith('src', 'data:cropped');
    expect(save).not.toHaveBeenCalled();
});
