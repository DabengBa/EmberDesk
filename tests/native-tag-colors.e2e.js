import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const source = fs.readFileSync(new URL('../public/scripts/tags.js', import.meta.url), 'utf8');
const jquery = fs.readFileSync(new URL('../public/lib/jquery-3.5.1.min.js', import.meta.url), 'utf8');
const jqueryUI = fs.readFileSync(new URL('../public/lib/jquery-ui.min.js', import.meta.url), 'utf8');

function productionFunction(start, end) {
    const from = source.indexOf(`function ${start}(`);
    const to = source.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`Could not locate production function ${start}`);
    return source.slice(from, to).trim();
}

const folderFunction = productionFunction('getTagBlock', '\n/**');
const tagFunction = productionFunction('appendTagToList', '\nfunction onTagFilterClick(');
const colorsFunction = source.includes('function applyTagColors(') ? productionFunction('applyTagColors', '\n/**') : null;

test.beforeEach(async ({ page }) => {
    await page.setContent('<div id="list"></div>');
    await page.addScriptTag({ content: jquery });
    await page.addScriptTag({ content: jqueryUI });
    await page.evaluate(({ folderFunction, tagFunction, colorsFunction }) => {
        if (colorsFunction) window.applyTagColors = (0, eval)(`(${colorsFunction})`);
        window.getTagBlock = (0, eval)(`(${folderFunction})`);
        window.appendTagToList = (0, eval)(`(${tagFunction})`);
        window.TAG_FOLDER_TYPES = { folder: { class: 'folder', fa_icon: 'icon' } };
        window.t = strings => strings[0];
        window.requireCharacterTagsShellContext = () => ({ buildAvatarList: () => {} });
        window.hookCalls = [];
        for (const property of ['backgroundColor', 'color']) {
            const original = window.jQuery.cssHooks[property].set;
            window.jQuery.cssHooks[property].set = function (element, value) {
                window.hookCalls.push({ property, value });
                return original.apply(this, arguments);
            };
        }
    }, { folderFunction, tagFunction, colorsFunction });
});

async function render(page, tag) {
    return page.evaluate(tag => {
        const $ = window.jQuery;
        $('#list').empty();
        window.hookCalls.length = 0;
        window.FOLDER_TEMPLATE = $('<div><div class="avatar" style="background-color: blue; color: green"></div><div class="avatar" style="background-color: blue; color: green"></div><div class="ch_name"></div><div class="bogus_folder_hidden_counter"></div><div class="bogus_folder_counter"></div><div class="bogus_folder_icon"></div><div class="bogus_folder_avatars_block"></div></div>');
        window.TAG_TEMPLATE = $('<div class="tag" style="background-color: blue; color: green"><span class="tag_name"></span><button class="tag_remove"></button></div>');
        const input = { id: 'tag-id', name: 'Example', folder_type: 'folder', ...tag };
        const folder = window.getTagBlock(input, []);
        window.appendTagToList($('#list'), input);
        const styles = element => ({ background: element.style.backgroundColor, color: element.style.color });
        return {
            hooks: window.hookCalls,
            avatars: folder.find('.avatar').toArray().map(styles),
            title: folder.find('.avatar').toArray().map(element => element.title),
            tags: $('#list .tag').toArray().map(element => ({ ...styles(element), id: element.id, text: $(element).find('.tag_name').text() })),
        };
    }, tag);
}

test('production tag color writes do not invoke jQuery UI hooks', async ({ page }) => {
    const result = await render(page, { color: 'rgba(51, 102, 153, 0.5)', color2: 'transparent' });
    expect(result.hooks).toEqual([]);
});

for (const [name, tag, background, color] of [
    ['missing', {}, 'blue', 'green'],
    ['null', { color: null, color2: null }, 'blue', 'green'],
    ['empty', { color: '', color2: '' }, '', ''],
    ['background only', { color: 'red' }, 'red', 'green'],
    ['foreground only', { color2: 'red' }, 'blue', 'red'],
    ['transparent', { color: 'transparent', color2: 'transparent' }, 'transparent', 'transparent'],
    ['RGBA', { color: 'rgba(51, 102, 153, 0.5)', color2: 'rgba(3, 4, 5, 0.4)' }, 'rgba(51, 102, 153, 0.5)', 'rgba(3, 4, 5, 0.4)'],
    ['color-mix', { color: 'color-mix(in srgb, red 50%, blue)', color2: 'color-mix(in srgb, white 50%, black)' }, 'color-mix(in srgb, red, blue)', 'color-mix(in srgb, white, black)'],
]) {
    test(`preserves target styles and tag content for ${name}`, async ({ page }) => {
        const result = await render(page, tag);
        expect(result.avatars).toEqual([{ background, color }, { background, color }]);
        expect(result.title).toEqual(['[Folder] Example', '[Folder] Example']);
        expect(result.tags).toEqual([{ background, color, id: 'tag-id', text: 'Example' }]);
    });
}
