import { expect, jest, test } from '@jest/globals';

globalThis.$ = jest.fn(() => ({ children: () => ({ each: jest.fn() }) }));
jest.unstable_mockModule('../public/lib.js', () => ({ DOMPurify: {} }));

jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/filters.js', () => ({ FILTER_TYPES: {}, FILTER_STATES: {}, DEFAULT_FILTER_STATE: '', isFilterState: jest.fn(), FilterHelper: class {} }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ download: jest.fn(), parseJsonFile: jest.fn(), uuidv4: () => 'id', equalsIgnoreCaseAndAccents: (a, b) => a.toLowerCase() === b.toLowerCase(), includesIgnoreCaseAndAccents: jest.fn(), removeFromArray: jest.fn(), getFreeName: jest.fn(), findChar: jest.fn(), escapeHtml: x => x }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ power_user: { tag_sort_mode: 'manual' } }));
jest.unstable_mockModule('../public/scripts/popup.js', () => ({ POPUP_RESULT: {}, POPUP_TYPE: {}, Popup: {}, callGenericPopup: jest.fn() }));
jest.unstable_mockModule('../public/scripts/keyboard.js', () => ({ INTERACTABLE_CONTROL_CLASS: '' }));
jest.unstable_mockModule('../public/scripts/templates.js', () => ({ renderTemplateAsync: jest.fn() }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: parts => parts.join(''), translate: x => x }));
jest.unstable_mockModule('../public/scripts/util/AccountStorage.js', () => ({ accountStorage: {} }));
jest.unstable_mockModule('../public/scripts/workspace-panels-react-bridge.js', () => ({ loadWorkspacePanelsModule: jest.fn() }));

const { registerCharacterTagsShellContext } = await import('../public/scripts/character-tags-shell-context.js');
const tags = await import('../public/scripts/tags.js');

test('bulk editor uses live character owner and persists only valid captured avatar keys', () => {
    let characters = [{ avatar: 'a.png' }, { avatar: 'b.png' }];
    const save = jest.fn(), refresh = jest.fn();
    registerCharacterTagsShellContext({ state: { get characters() { return characters; } }, saveSettingsDebounced: save, printCharactersDebounced: refresh });
    tags.loadTagsSettings({ tags: [{ id: 't', name: 'Tag' }], tag_map: {} });
    const runtime = tags.createBulkTagEditorRuntime(['a.png', 'b.png']);
    characters = [{ avatar: 'b.png' }, { avatar: 'c.png' }];
    runtime.commands.addTag('t');
    expect(tags.tag_map).toEqual({ 'b.png': ['t'] });
    expect(save).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
});
