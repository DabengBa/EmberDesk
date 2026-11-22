import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');

test('shell handler source has no jQuery or synthetic-event trust substitution', () => {
    const effects = readFileSync(new URL('../public/scripts/message-dom-effects.js', import.meta.url), 'utf8');
    expect(effects).not.toMatch(/\$\s*\(|\bjQuery\b|\bisTrigger\b|\bisTrusted\b/);
});

test('textarea autofit preserves native chat scroll while updating height', () => {
    const source = readFileSync(new URL('../public/scripts/message-dom-effects.js', import.meta.url), 'utf8');
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


test('character authoring inputs update create state and respect edit mirror writes natively', () => {
    const script = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = script.indexOf('const authoringMirrorFields =');
    const end = script.indexOf('function toggleCharacterFormFavorite', start);
    expect(start).toBeGreaterThanOrEqual(0);
    let spoiler = {};
    const document = { getElementById: () => spoiler };
    const draft = {};
    const save = jest.fn();
    const { input, edit } = new Function('document', 'create_save', 'saveCharacterDebounced', 'formatCreatorNotes', `
        let menu_type = 'create', authoringMirrorWriteDepth = 0;
        const characters = [], this_chid = 0;
        ${script.slice(start, end)}
        return { input: handleAuthoringMirrorInput, edit(depth) { menu_type = 'edit'; authoringMirrorWriteDepth = depth; } };`)(document, draft, save, notes => notes);
    input('depth_prompt_depth', '17');
    input('creator_notes_textarea', 'notes');
    expect(draft).toEqual({ depth_prompt_depth: 17, creator_notes: 'notes' });
    expect(spoiler.innerHTML).toBe('notes');
    edit(1);
    input('depth_prompt_depth', '18');
    expect(save).not.toHaveBeenCalled();
    edit(0);
    input('depth_prompt_depth', '19');
    expect(save).toHaveBeenCalledTimes(1);
    spoiler = null;
    expect(() => input('creator_notes_textarea', 'updated notes')).not.toThrow();
});

function createAvatarPanelToggle(panel, getComputedStyle) {
    const component = readFileSync(new URL('../app/components/right-nav/RightNavPanel.tsx', import.meta.url), 'utf8');
    const start = component.indexOf('    function toggleAvatarPanel()');
    const end = component.indexOf("    useTranslated('');", start);
    expect(component).toContain('onClick={toggleAvatarPanel} id="hideCharPanelAvatarButton"');
    return new Function('avatarPanel', 'avatarMotion', 'getComputedStyle', 'globalThis', component.slice(start, end) + 'return toggleAvatarPanel;')({ current: panel }, { current: { hidden: false, overflow: '' } }, getComputedStyle, {});
}

test('avatar panel toggle animates closed and can be reopened without jQuery', async () => {
    const animation = { finished: Promise.resolve(), cancel: jest.fn() };
    const panel = { style: { display: '', overflow: '' }, scrollHeight: 48, animate: jest.fn(() => animation) };
    const getComputedStyle = element => ({ display: element.style.display === 'none' ? 'none' : 'block' });
    const click = createAvatarPanelToggle(panel, getComputedStyle);
    click();
    expect(panel.animate).toHaveBeenCalled();
    await animation.finished;
    await Promise.resolve();
    expect(panel.style.display).toBe('none');
    click();
    expect(panel.style.display).not.toBe('none');
});

test('rapid avatar panel toggles restore the original overflow after cancellation', async () => {
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
    const getComputedStyle = element => ({ display: element.style.display === 'none' ? 'none' : 'block' });
    const click = createAvatarPanelToggle(panel, getComputedStyle);
    click();
    click();
    finishes[1]();
    await Promise.resolve();
    expect(panel.style.overflow).toBe('visible');
    expect(panel.style.display).not.toBe('none');
});
