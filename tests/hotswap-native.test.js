import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Component-level proof with actual production functions. DOM and persistence
// boundaries are isolated; the delegate test uses a controlled native event.
class Node {
    constructor(tag = 'div') { this.tag = tag; this.nodeType = 1; this.attributes = {}; this.children = []; this.parent = null; this.innerHTML = ''; this.classes = new Set(); this.classList = { add: name => this.classes.add(name), toggle: (name, force) => (force ?? !this.classes.has(name)) ? this.classes.add(name) : this.classes.delete(name), contains: name => this.classes.has(name) }; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(selector === child.tag || selector.startsWith('.') && child.classes.has(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    cloneNode(deep) { const node = new Node(this.tag); node.attributes = { ...this.attributes }; node.classes = new Set(this.classes); if (deep) this.children.forEach(child => node.append(child.cloneNode(true))); return node; }
}

function extract(path, start, end, context) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const first = source.indexOf(start), last = source.indexOf(end, first);
    if (first < 0 || last < 0) throw new Error(`source section missing: ${path}`);
    return runInNewContext(`(${source.slice(first, last).replace('export ', '')})`, context);
}

function setup(entities) {
    const container = new Node(); container.setAttribute('no_favs', 'no favourites');
    const avatar = new Node(); avatar.classes.add('avatar'); avatar.append(new Node('img'));
    const favorite = new Node('input'); favorite.classes.add('ch_fav'); avatar.append(favorite);
    const document = { querySelectorAll: selector => selector === '#right-nav-panel .hotswap' ? [container] : selector === '#inline_avatar_template .avatar' ? [avatar] : [] };
    const context = { document, default_avatar: 'img/ai4.png', INTERACTABLE_CONTROL_CLASS: 'interactable',
        getThumbnailUrl: (type, file) => `${type}:${file}`, getEntitiesList: () => entities,
        DOMPurify: { sanitize: value => `clean:${value}` } };
    context.buildAvatarList = jest.fn(extract('public/script.js', 'export function buildAvatarList(', '\n/**', context));
    const refresh = extract('public/scripts/RossAscends-mods.js', 'export async function favsToHotswap()', '\n//changes input bar', context);
    return { refresh, context, container, avatar };
}

test('real favourite caller uses the shared renderer without jQuery for multiple characters and preserves selection metadata', async () => {
    const s = setup([{ id: 3, type: 'character', item: { fav: true, name: 'Alice', avatar: 'a.png' } },
        { id: 9, type: 'character', item: { fav: 'true', name: 'Bob', avatar: 'none' } },
        { id: 2, type: 'character', item: { fav: false, name: 'Hidden' } }]);
    await s.refresh();
    expect(s.context.buildAvatarList).toHaveBeenCalledTimes(1);
    expect(s.container.children.map(node => node.getAttribute('data-chid'))).toEqual(['3', '9']);
    expect(s.container.children.map(node => node.querySelectorAll('img')[0].getAttribute('src'))).toEqual(['avatar:a.png', 'img/ai4.png']);
    expect(s.container.children.every(node => node.classList.contains('character_select') && node.classList.contains('interactable'))).toBe(true);
    expect(s.container.children[1].getAttribute('title')).toBe('[Character] Bob\nFile: none');
    s.context.getEntitiesList = () => [];
    await s.refresh();
    expect(s.container.innerHTML).toContain('clean:no favourites');
});

test('actual tag folder consumer passes native targets to the shared avatar renderer', () => {
    const s = setup([]), template = new Node();
    for (const name of ['avatar', 'ch_name', 'bogus_folder_hidden_counter', 'bogus_folder_counter', 'bogus_folder_icon', 'bogus_folder_avatars_block']) {
        const node = new Node(); node.classes.add(name); template.append(node);
    }
    const tagContext = { $: () => { throw Error('folder must not use jQuery'); }, FOLDER_TEMPLATE: template, TAG_FOLDER_TYPES: { open: { class: 'open', fa_icon: 'icon' } },
        requireCharacterTagsShellContext: () => ({ buildAvatarList: s.context.buildAvatarList }), applyTagColors: () => {}, t: parts => parts.join('') };
    const getTagBlock = extract('public/scripts/tags.js', 'function getTagBlock(', '\n/**', tagContext);
    const result = getTagBlock({ folder_type: 'open', name: 'Folder', id: 'f' }, [{ id: 2, type: 'character', item: { name: 'Two', fav: true } }]);
    const folder = result.querySelector('.bogus_folder_avatars_block');
    expect(result).not.toBe(template);
    expect(result.getAttribute('tagid')).toBe('f');
    expect(s.context.buildAvatarList.mock.calls[0][0]).toEqual([folder]);
    expect(folder.children[0].getAttribute('data-chid')).toBe('2');
});

test('shared renderer accepts native targets and preserves favourite and append options', () => {
    const s = setup([]), first = new Node(), second = new Node();
    first.append(new Node('old'));
    const entities = [{ id: 1, type: 'character', item: { name: 'One', fav: true } }, { id: 2, type: 'tag', item: { name: 'Two', fav: false } }];
    s.context.buildAvatarList([first, second], entities, { empty: false, interactable: true });
    expect(first.children).toHaveLength(3);
    expect(second.children).toHaveLength(2);
    expect(first.children[1].classList.contains('is_fav')).toBe(true);
    expect(first.children[2].classList.contains('character_select')).toBe(false);
    expect(first.children[1].querySelectorAll('.ch_fav')[0].value).toBe('true');
});

test('real entity builder and favourite caller preserve order and the 25-character limit', async () => {
    const s = setup([]);
    Object.assign(s.context, { characters: Array.from({ length: 28 }, (_, i) => ({ name: `Character ${i}`, fav: true })), tags: [],
        isBogusFolder: () => false, compareTagsForSort: () => 0, sortEntitiesList: items => items.reverse(),
        entitiesFilter: { clearFuzzySearchCaches: jest.fn() } });
    s.context.characterToEntity = extract('public/script.js', 'export function characterToEntity(', '\n/**', s.context);
    s.context.getEntitiesList = extract('public/script.js', 'export function getEntitiesList(', '\nexport async function getOneCharacter', s.context);
    await s.refresh();
    expect(s.container.children).toHaveLength(25);
    expect(s.container.children.map(node => node.getAttribute('data-chid'))).toEqual(Array.from({ length: 25 }, (_, i) => String(27 - i)));
    expect(s.context.entitiesFilter.clearFuzzySearchCaches).toHaveBeenCalledTimes(1);
});

test('rendered character routes through the actual delegated selection handler', async () => {
    const s = setup([{ id: 7, type: 'character', item: { fav: true, name: 'Seven' } }]);
    await s.refresh();
    const source = readFileSync(new URL('../public/scripts/dom-handlers.js', import.meta.url), 'utf8');
    const start = source.indexOf("document.addEventListener('click', async function onCharacterSelect(");
    const end = source.indexOf('\n    });', start) + '\n    });'.length;
    const selectCharacterById = jest.fn(async () => {});
    let handler;
    s.context.document.addEventListener = (_event, callback) => { handler = callback; };
    Node.prototype.closest = function (selector) { return selector === '.character_select' && this.classes.has('character_select') ? this : null; };
    runInNewContext(source.slice(start, end), { Element: Node, document: s.context.document, selectCharacterById });
    await handler({ target: s.container.children[0], button: 0 });
    expect(selectCharacterById).toHaveBeenCalledWith(7);
    const ross = readFileSync(new URL('../public/scripts/RossAscends-mods.js', import.meta.url), 'utf8');
    const secondStart = ross.indexOf("document.addEventListener('click', function onCharacterSelectSave(");
    const secondEnd = ross.indexOf('\n    });', secondStart) + '\n    });'.length;
    const setActiveCharacter = jest.fn(), saveSettingsDebounced = jest.fn();
    runInNewContext(ross.slice(secondStart, secondEnd), { Element: Node, document: s.context.document, setActiveCharacter, saveSettingsDebounced });
    handler({ target: s.container.children[0], button: 0 });
    expect(setActiveCharacter).toHaveBeenCalledWith('7');
    expect(saveSettingsDebounced).toHaveBeenCalledTimes(1);
});
