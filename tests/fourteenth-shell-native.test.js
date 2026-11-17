import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/dom-handlers.js', import.meta.url), 'utf8');

test('shell handler source has no jQuery or synthetic-event trust substitution', () => {
    expect(source).not.toMatch(/\$\s*\(|\bjQuery\b|\bisTrigger\b|\bisTrusted\b/);
});

test('dynamically added folder reacts to primary nested clicks without jQuery', () => {
    const start = source.indexOf("    $(document).on('click', '.bogus_folder_select'");
    const nativeStart = source.indexOf("    document.addEventListener('click', function onBogusFolderSelect");
    const from = nativeStart >= 0 ? nativeStart : start;
    const end = source.indexOf('    const cssAutofit', from);
    expect(from).toBeGreaterThanOrEqual(0);
    const listeners = [];
    const document = { addEventListener: (_type, handler) => listeners.push(handler) };
    class Element {}
    const folder = { getAttribute: name => name === 'tagid' ? '42' : null };
    const child = Object.assign(new Element(), { closest: selector => selector === '.bogus_folder_select' ? folder : null });
    const choose = jest.fn();
    new Function('document', 'Element', 'chooseBogusFolder', source.slice(from, end))(document, Element, choose);
    expect(listeners).toHaveLength(1);
    listeners[0]({ target: child, button: 1 });
    expect(choose).not.toHaveBeenCalled();
    listeners[0]({ target: child, button: 0 });
    expect(choose).toHaveBeenCalledWith(null, '42');
});

test('textarea autofit preserves native chat scroll while updating height', () => {
    const start = source.indexOf('        function autoFitEditTextArea(e) {');
    const end = source.indexOf('        const autoFitEditTextAreaDebounced', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const chat = { scrollTop: 31 };
    const style = {};
    Object.defineProperty(style, 'height', { set() { chat.scrollTop = 0; }, configurable: true });
    const textarea = { style, scrollHeight: 46 };
    const document = { getElementById: id => id === 'chat' ? chat : null };
    const resize = new Function('document', 'state', `${source.slice(start, end)}; return autoFitEditTextArea;`)(document, {});
    resize(textarea);
    expect(chat.scrollTop).toBe(31);
});

test('navigation buttons select the character and clear search through native events', () => {
    const start = source.indexOf('    //menu buttons setup');
    const end = source.indexOf("    document.addEventListener('click', async function onCharacterSelect", start);
    expect(start).toBeGreaterThanOrEqual(0);
    class Input { constructor() { this.value = 'Alice'; this.events = []; } dispatchEvent(event) { this.events.push(event); } }
    const inputs = new Map();
    for (const id of ['rm_button_characters', 'rm_button_back', 'rm_button_create', 'rm_button_selected_ch']) {
        inputs.set(id, { addEventListener: (_type, handler) => { inputs.get(id).click = handler; } });
    }
    const search = new Input();
    inputs.set('character_search_bar', search);
    const document = { getElementById: id => inputs.get(id) };
    const state = { this_chid: 0, characters: [{}] };
    const select = jest.fn();
    class Event { constructor(type, options) { this.type = type; this.bubbles = options.bubbles; } }
    new Function('document', 'state', 'select_rm_characters', 'select_rm_create', 'queueReactCharacterAuthoringRemount', 'select_selected_character', 'HTMLInputElement', 'Event', source.slice(start, end))(
        document, state, jest.fn(), jest.fn(), jest.fn(), select, Input, Event,
    );
    inputs.get('rm_button_selected_ch').click();
    expect(select).toHaveBeenCalledWith(0);
    expect(state.selected_button).toBe('character_edit');
    expect(search.value).toBe('');
    expect(search.events[0]).toMatchObject({ type: 'input', bubbles: true });
});

test('character authoring inputs update create state and respect edit mirror writes natively', () => {
    const start = source.indexOf("    $('#character_name_pole').on('input'");
    const nativeStart = source.indexOf("    document.getElementById('character_name_pole')?.addEventListener('input'");
    const from = nativeStart >= 0 ? nativeStart : start;
    const end = source.indexOf("    document.getElementById('favorite_button')", from);
    expect(from).toBeGreaterThanOrEqual(0);
    const elements = new Map();
    function get(id) {
        if (!elements.has(id)) elements.set(id, { value: '', handlers: [], addEventListener: (_type, handler) => elements.get(id).handlers.push(handler) });


        return elements.get(id);
    }
    let hasSpoiler = true;
    const document = { getElementById: id => id === 'creator_notes_spoiler' && !hasSpoiler ? null : get(id), querySelector: selector => get(selector.slice(1)) };
    const state = { menu_type: 'create', create_save: {}, characters: [] };
    const save = jest.fn();
    let mirror = false;
    new Function('document', 'state', 'shell', 'saveCharacterDebounced', 'formatCreatorNotes', source.slice(from, end))(
        document, state, () => ({ isAuthoringMirrorWrite: () => mirror }), save, notes => notes,
    );
    get('depth_prompt_depth').value = '17';
    get('depth_prompt_depth').handlers[0]();
    expect(state.create_save.depth_prompt_depth).toBe(17);
    get('creator_notes_textarea').value = 'notes';
    get('creator_notes_textarea').handlers.forEach(handler => handler());
    expect(state.create_save.creator_notes).toBe('notes');
    expect(get('creator_notes_spoiler').innerHTML).toBe('notes');
    state.menu_type = 'edit';
    mirror = true;
    get('depth_prompt_depth').handlers[0]();
    expect(save).not.toHaveBeenCalled();
    mirror = false;
    get('depth_prompt_depth').handlers[0]();
    expect(save).toHaveBeenCalledTimes(1);
    hasSpoiler = false;
    expect(() => get('creator_notes_textarea').handlers.forEach(handler => handler())).not.toThrow();
});

test('avatar panel toggle animates closed and can be reopened without jQuery', async () => {
    const oldStart = source.indexOf("    $('#hideCharPanelAvatarButton').on('click'");
    const nativeStart = source.indexOf('    let avatarPanelAnimation;');
    const start = nativeStart >= 0 ? nativeStart : oldStart;
    const end = source.indexOf('    // Compatibility fallback click path.', start);
    expect(start).toBeGreaterThanOrEqual(0);
    let click;
    const animation = { finished: Promise.resolve(), cancel: jest.fn() };
    const panel = { style: { display: '', overflow: '' }, scrollHeight: 48, animate: jest.fn(() => animation) };
    const button = { addEventListener: (_type, handler) => { click = handler; } };
    const document = { getElementById: id => id === 'hideCharPanelAvatarButton' ? button : panel };
    const getComputedStyle = element => ({ display: element.style.display === 'none' ? 'none' : 'block' });
    new Function('document', 'getComputedStyle', 'globalThis', source.slice(start, end))(document, getComputedStyle, {});
    click();
    expect(panel.animate).toHaveBeenCalled();
    await animation.finished;
    await Promise.resolve();
    expect(panel.style.display).toBe('none');
    click();
    expect(panel.style.display).not.toBe('none');
});

test('rapid avatar panel toggles restore the original overflow after cancellation', async () => {
    const start = source.indexOf('    let avatarPanelAnimation;');
    const end = source.indexOf('    // Compatibility fallback click path.', start);
    let click;
    const finishes = [];
    const panel = {
        style: { display: '', overflow: 'visible' }, scrollHeight: 48,
        animate: () => {
            let finish;
            const animation = { finished: new Promise(resolve => { finish = resolve; }), cancel: jest.fn() };
            finishes.push(finish);
            return animation;
        },
    };
    const document = { getElementById: id => id === 'hideCharPanelAvatarButton' ? { addEventListener: (_type, handler) => { click = handler; } } : panel };
    const getComputedStyle = element => ({ display: element.style.display === 'none' ? 'none' : 'block' });
    new Function('document', 'getComputedStyle', 'globalThis', source.slice(start, end))(document, getComputedStyle, {});
    click();
    click();
    finishes[1]();
    await Promise.resolve();
    expect(panel.style.overflow).toBe('visible');
    expect(panel.style.display).not.toBe('none');
});
