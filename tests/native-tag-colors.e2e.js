import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const source = fs.readFileSync(new URL('../public/scripts/tags.js', import.meta.url), 'utf8');


function productionFunction(start, end) {
    const from = source.indexOf(`function ${start}(`);
    const to = source.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`Could not locate production function ${start}`);
    return source.slice(from, to).trim();
}

const folderFunction = productionFunction('getTagBlock', '\n/**');
const tagFunction = productionFunction('appendTagToList', '\nfunction onTagFilterClick(');
const resolveFunction = productionFunction('resolveTagListElements', '\nfunction createTagMapFromList(');
const colorsFunction = source.includes('function applyTagColors(') ? productionFunction('applyTagColors', '\n/**') : null;

test.beforeEach(async ({ page }) => {
    await page.setContent('<div id="list"></div>');
    await page.evaluate(({ folderFunction, tagFunction, colorsFunction, resolveFunction }) => {
        for (const name of ['$', 'jQuery']) Object.defineProperty(window, name, { configurable: true, get() { throw new Error(`Unexpected ${name} access`); } });
        if (colorsFunction) window.applyTagColors = (0, eval)(`(${colorsFunction})`);
        window.getTagBlock = (0, eval)(`(${folderFunction})`);
        window.appendTagToList = (0, eval)(`(${tagFunction})`);
        window.resolveTagListElements = (0, eval)(`(${resolveFunction})`);
        window.TAG_FOLDER_TYPES = { folder: { class: 'folder', fa_icon: 'icon' } };
        window.t = strings => strings[0];
        window.requireCharacterTagsShellContext = () => ({ buildAvatarList: () => {} });
    }, { folderFunction, tagFunction, colorsFunction, resolveFunction });
});

async function render(page, tag) {
    return page.evaluate(tag => {
        document.getElementById('list').replaceChildren();

        const folderTemplate = document.createElement('div');
        folderTemplate.innerHTML = '<div class="avatar" style="background-color: blue; color: green"></div><div class="avatar" style="background-color: blue; color: green"></div><div class="ch_name"></div><div class="bogus_folder_hidden_counter"></div><div class="bogus_folder_counter"></div><div class="bogus_folder_icon"></div><div class="bogus_folder_avatars_block"></div>';
        window.FOLDER_TEMPLATE = folderTemplate;
        const tagTemplate = document.createElement('div');
        tagTemplate.innerHTML = '<div class="tag" style="background-color: blue; color: green"><span class="tag_name"></span><button class="tag_remove"></button></div>';
        window.TAG_TEMPLATE = tagTemplate.firstElementChild;
        const input = { id: 'tag-id', name: 'Example', folder_type: 'folder', ...tag };
        const folder = window.getTagBlock(input, []);
        window.appendTagToList(document.getElementById('list'), input);
        const styles = element => ({ background: element.style.backgroundColor, color: element.style.color });
        return {

            avatars: Array.from(folder.querySelectorAll('.avatar')).map(styles),
            title: Array.from(folder.querySelectorAll('.avatar')).map(element => element.title),
            tags: Array.from(document.querySelectorAll('#list .tag')).map(element => ({ ...styles(element), id: element.id, text: element.querySelector('.tag_name').textContent })),
        };
    }, tag);
}

test('production tag color writes render native styles without jQuery', async ({ page }) => {
    const result = await render(page, { color: 'rgba(51, 102, 153, 0.5)', color2: 'transparent' });
    expect(result.avatars).toEqual(Array(2).fill({ background: 'rgba(51, 102, 153, 0.5)', color: 'transparent' }));
    expect(result.tags).toEqual([{ background: 'rgba(51, 102, 153, 0.5)', color: 'transparent', id: 'tag-id', text: 'Example' }]);
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
