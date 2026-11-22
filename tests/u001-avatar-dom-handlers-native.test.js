import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');

test('bulk message selection has no legacy row delegate', () => {
    expect(source).not.toContain("delegate('click', '.mes', function () {");
    expect(source).not.toContain("$(document).on('click', '.mes', function () {");
    expect(source).not.toContain('selectLegacyRange');
});

test('native avatar delegate opens and closes after animation', () => {
    const source = readFileSync(new URL('../public/scripts/message-dom-effects.js', import.meta.url), 'utf8');
    const start = source.indexOf("    document.addEventListener('click', event => {\n        const target = event.target instanceof Element");
    const end = source.lastIndexOf("\n}");
    expect(start).toBeGreaterThanOrEqual(0);
    let listener;
    const previews = [];
    const transitions = [];
    const handlers = {};
    const previewImage = { setAttribute: jest.fn(), addEventListener: (name, fn) => { handlers[name] = fn; } };
    const close = { addEventListener: (name, fn) => { handlers[name] = fn; }, focus: jest.fn() };
    const preview = {
        style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name.toLowerCase()] = value; },
        getAttribute(name) { return this.attributes[name.toLowerCase()] ?? null; },
        querySelector(selector) { return selector === 'img' ? previewImage : close; },
        addEventListener(name, fn) { handlers[name] = fn; },
        remove() { previews.splice(previews.indexOf(this), 1); },
    };
    const document = {
        addEventListener: (_name, fn) => { listener = fn; },
        querySelectorAll: () => previews.slice(),
        querySelector: () => ({ cloneNode: () => preview }),
        body: { append: item => previews.push(item) },
    };
    class Element {}
    const image = { getAttribute: name => name === 'src' ? '/thumbnail?file=char.png' : 'Character' };
    const row = { getAttribute: name => name === 'is_user' ? 'false' : 'false' };
    const opener = Object.assign(new Element(), { closest: selector => selector === '.mes' ? row : opener, querySelector: () => image, focus: jest.fn() });
    const transition = (_element, options) => { transitions.push(options); };
    new Function('document', 'Element', 'getCharacters', 'getDuration', 'isDataURL', 'transitionOpacity', 't', source.slice(start, end))(document, Element, () => [{ avatar: 'char.png' }], () => 150, () => false, transition, () => 'Avatar preview');
    listener({ target: opener });
    expect(previews).toEqual([preview]);
    expect(previewImage.setAttribute).toHaveBeenCalledWith('src', '/characters/char.png');
    expect(close.focus).toHaveBeenCalled();
    expect(transitions[0]).toMatchObject({ opacity: 1, duration: 150 });
    const key = { key: 'Escape', preventDefault: jest.fn(), stopPropagation: jest.fn() };
    handlers.keydown(key);
    expect(key.preventDefault).toHaveBeenCalled();
    expect(key.stopPropagation).toHaveBeenCalled();
    expect(transitions[1]).toMatchObject({ opacity: 0, duration: 150 });
    expect(previews).toHaveLength(1);
    transitions[1].complete();
    expect(previews).toHaveLength(0);
    expect(opener.focus).toHaveBeenCalled();
    const drag = { preventDefault: jest.fn(), stopPropagation: jest.fn() };
    handlers.dragstart(drag);
    expect(drag.preventDefault).toHaveBeenCalled();
    expect(drag.stopPropagation).toHaveBeenCalled();
});
