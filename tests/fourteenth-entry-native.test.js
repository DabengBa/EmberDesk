import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');

test('authoring mirror emits a bubbling native input while suppressing edit saves', () => {
    const start = source.indexOf('let authoringMirrorWriteDepth = 0;');
    const end = source.indexOf('function applyCharacterAuthoringSaveModel', start);
    expect(start).toBeGreaterThanOrEqual(0);
    class Event {
        constructor(type, options) { this.type = type; this.bubbles = options.bubbles; }
    }
    const observed = [];
    const input = { value: '', dispatchEvent: event => observed.push({ event, depth: getDepth(), value: input.value }) };
    const document = { querySelector: selector => selector === '#name' ? input : null };
    const [setValue, getDepth] = new Function('document', 'Event', `${source.slice(start, end)}; return [setAuthoringInputValue, () => authoringMirrorWriteDepth];`)(document, Event);
    setValue('#name', 'Alice');
    expect(observed).toEqual([{ event: expect.objectContaining({ type: 'input', bubbles: true }), depth: 1, value: 'Alice' }]);
    expect(getDepth()).toBe(0);
    expect(() => setValue('#missing', null)).not.toThrow();
    input.dispatchEvent = jest.fn(() => { throw new Error('listener failure'); });    expect(() => setValue('#name', '')).toThrow('listener failure');
    expect(getDepth()).toBe(0);
});

test('history highlight passes the native row to the shared motion owner', () => {
    const match = source.match(/highlightRow\(row\)\s*\{[^}]+\}/);
    expect(match).not.toBeNull();
    const highlight = jest.fn();
    const bridge = new Function('flashHighlight', 'debounce_timeout', `return { ${match[0]} };`)(highlight, { extended: 1500 });
    const row = { nodeType: 1 };
    bridge.highlightRow(row);
    expect(highlight).toHaveBeenCalledWith(row, 1500);
});

test('message IDs and last-message marker update on the native chat root', () => {
    const start = source.indexOf('export function updateViewMessageIds(');
    const end = source.indexOf('export function getFirstDisplayedMessageId(', start);
    const labels = [{ textContent: '' }, { textContent: '' }];
    const rows = labels.map(label => ({
        attributes: {}, classList: { remove: jest.fn(), add: jest.fn() },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        querySelectorAll: selector => selector === '.mesIDDisplay' ? [label] : [],
    }));
    const summary = { classList: { remove: jest.fn() } };
    const chat = { querySelectorAll: selector => selector === '.mes[mesid]' ? rows : [...rows, summary] };
    const update = jest.fn();
    const run = new Function('chatElement', 'getFirstDisplayedMessageId', 'updateEditArrowClasses', `${source.slice(start, end).replace('export ', '')}; return updateViewMessageIds;`)(chat, () => 10, update);
    run();
    expect(rows.map(row => row.attributes.mesid)).toEqual(['10', '11']);
    expect(labels.map(label => label.textContent)).toEqual(['#10', '#11']);
    expect(summary.classList.remove).toHaveBeenCalledWith('last_mes');
    expect(rows[1].classList.add).toHaveBeenCalledWith('last_mes');
    expect(update).toHaveBeenCalledTimes(1);
});

test('dialogue popup configures native controls and preserves React input ownership', async () => {
    const start = source.indexOf('export function callPopup(');
    const end = source.indexOf('export async function saveMetadata(', start);
    const nodes = Object.fromEntries(['dialogue_popup', 'dialogue_popup_cancel', 'dialogue_popup_ok', 'dialogue_popup_input', 'dialogue_popup_text', 'shadow_popup'].map(id => [id, {
        style: {}, dataset: {}, classList: { toggle: jest.fn() }, setAttribute: jest.fn(), focus: jest.fn(), querySelector: () => null,
    }]));
    nodes.dialogue_popup_input.dataset.reactDialogueInput = 'true';
    const controller = { callPopup: jest.fn(() => Promise.resolve('done')) };
    const presentation = { open: jest.fn() };
    const document = { getElementById: id => nodes[id] };
    const run = new Function('document', 'globalThis', 'dialogueController', 'transitionOpacity', 'animation_duration', 'animation_easing', 't', `let popup_type, dialogueCloseStop; ${source.slice(start, end).replace('export ', '')}; return callPopup;`)(document, { __emberDeskDialoguePresentation: presentation }, controller, jest.fn(), 0, 'linear', strings => strings[0]);
    await expect(run('hello', 'input', 'value', { wide: true, rows: 3 })).resolves.toBe('done');
    expect(nodes.dialogue_popup.classList.toggle).toHaveBeenCalledWith('wide_dialogue_popup', true);
    expect(nodes.dialogue_popup_input.setAttribute).not.toHaveBeenCalled();
    expect(presentation.open).toHaveBeenCalledWith('hello');
    expect(controller.callPopup).toHaveBeenCalledWith('input', 'value', 3);
});

test('temporary chat status updates hidden and aria state without jQuery', () => {
    const start = source.indexOf('function setTemporaryChatStatus(');
    const end = source.indexOf('function syncTemporaryChatStatus(', start);
    const status = { hidden: null, setAttribute: jest.fn() };
    const run = new Function('document', `${source.slice(start, end)}; return setTemporaryChatStatus;`)({ getElementById: () => status });
    run(true);
    expect(status.hidden).toBe(false);
    expect(status.setAttribute).toHaveBeenLastCalledWith('aria-hidden', 'false');
    run(false);
    expect(status.hidden).toBe(true);
    expect(status.setAttribute).toHaveBeenLastCalledWith('aria-hidden', 'true');
});

test('bulk delete displays legacy controls but leaves React-owned rows alone', () => {
    const start = source.indexOf('function openMessageDelete()');
    const end = source.indexOf('let chatMessageCommands;', start);
    const mark = { style: {} };
    const legacy = { matches: () => false, querySelector: () => mark };
    const react = { matches: () => true };
    const checkboxes = [legacy, react].map(row => ({ style: {}, closest: () => row }));
    const nodes = { dialogue_del_mes: { style: {} }, send_form: { style: {} } };
    const document = { getElementById: id => nodes[id], querySelectorAll: () => checkboxes };
    const open = jest.fn();
    const run = new Function('document', 'globalThis', 'closeMessageEditor', 't', `let is_send_press = false, is_delete_mode = false; ${source.slice(start, end)}; return openMessageDelete;`)(document, { __emberDeskBulkDeleteController: { open } }, jest.fn(), strings => strings[0]);
    run();
    expect(nodes.dialogue_del_mes.style.display).toBe('block');
    expect(nodes.send_form.style.display).toBe('none');
    expect(checkboxes[0].style.display).toBe('grid');
    expect(mark.style.display).toBe('none');
    expect(checkboxes[1].style.display).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(1);
});

test('generation preset synchronizes both paired controls, leaving absent values unchanged', () => {
    const start = source.indexOf('export function setGenerationParamsFromPreset(');
    const end = source.indexOf('function applyMessageEditText(', start);
    const inputs = Object.fromEntries(['amount_gen', 'amount_gen_counter', 'max_context', 'max_context_counter'].map(id => [id, { value: '' }]));
    const run = new Function('document', `let amount_gen, max_context; ${source.slice(start, end).replace('export ', '')}; return setGenerationParamsFromPreset;`)({ getElementById: id => inputs[id] });
    run({ genamt: 42 });
    expect(inputs.amount_gen.value).toBe(42);
    expect(inputs.amount_gen_counter.value).toBe(42);
    expect(inputs.max_context.value).toBe('');
    run({ max_length: 1024 });
    expect(inputs.max_context.value).toBe(1024);
    expect(inputs.max_context_counter.value).toBe(1024);
});

test('stop button emits generation end once when transitioning from visible', () => {
    const start = source.indexOf('function showStopButton()');
    const end = source.indexOf('/**', start);
    const button = { style: { display: 'none' } };
    const emit = jest.fn();
    const [show, hide] = new Function('document', 'getComputedStyle', 'eventSource', 'event_types', 'chat', `${source.slice(start, end)}; return [showStopButton, hideStopButton];`)({ getElementById: () => button }, el => ({ display: el.style.display }), { emit }, { GENERATION_ENDED: 'end' }, [1, 2]);
    show();
    expect(button.style.display).toBe('flex');
    hide();
    hide();
    expect(button.style.display).toBe('none');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('end', 2);
});

test('API selection displays openai controls and invokes existing setup in order', () => {
    const start = source.indexOf('export function changeMainAPI(');
    const end = source.indexOf('\n}', start) + 2;
    const nodes = Object.fromEntries(['openai_settings', 'openai_api-presets', 'range_block_openai'].map(id => [id, { style: {} }]));
    const calls = [];
    const callback = name => () => calls.push(name);
    const run = new Function('document', 'setOnlineStatus', 'validateDisabledSamplers', 'setupChatCompletionPromptManager', 'forceCharacterEditorTokenize', 'oai_settings', `let main_api; ${source.slice(start, end).replace('export ', '')}; return changeMainAPI;`)({ getElementById: id => nodes[id] }, callback('status'), callback('samplers'), callback('prompts'), callback('tokenize'), {});
    run('openai');
    expect(nodes.openai_settings.style.display).toBe('block');
    expect(nodes.range_block_openai.style.display).toBe('block');
    expect(nodes['openai_api-presets'].style.display).toBe('flex');
    expect(calls).toEqual(['status', 'samplers', 'prompts', 'tokenize']);
});

test('authoring mode and generation progress use native state', () => {
    const modeStart = source.indexOf('function getCurrentCharacterAuthoringMode()');
    const modeEnd = source.indexOf('// Session identity', modeStart);
    const progressStart = source.indexOf('export function setGenerationProgress(');
    const progressEnd = source.indexOf('export function cancelTtsPlay()', progressStart);
    const form = { getAttribute: () => 'editcharacter' };
    const textarea = { style: {} };
    const document = { getElementById: id => id === 'form_create' ? form : textarea };
    const [mode, progress] = new Function('document', `${source.slice(modeStart, modeEnd)} ${source.slice(progressStart, progressEnd).replace('export ', '')}; return [getCurrentCharacterAuthoringMode, setGenerationProgress];`)(document);
    expect(mode()).toBe('edit');
    progress(50);
    expect(textarea.style.background).toContain('50%');
    expect(textarea.style.transition).toBe('0.25s ease-in-out');
    progress(0);
    expect(textarea.style.background).toBe('');
    expect(textarea.style.transition).toBe('');
});

test('settings override popup keeps draft edits until affirmative confirmation', async () => {
    const start = source.indexOf('export async function setCharacterSettingsOverrides()');
    const end = source.indexOf('/**', start);
    const fields = { '.chat_scenario': {}, '.chat_system_prompt': {}, '.remove_scenario_override': {} };
    for (const field of Object.values(fields)) field.addEventListener = (type, handler) => { field[type] = handler; };
    const root = { querySelector: selector => fields[selector] };
    const wrapper = { set innerHTML(value) { this.html = value; }, content: root };
    const metadata = { scenario: 'old', system_prompt: 'prompt', mes_example: '' };
    const popup = jest.fn(async content => {
        expect(content).toBe(root);
        fields['.chat_scenario'].value = 'new';
        fields['.chat_scenario'].input();
        expect(metadata.scenario).toBe('old');
        return 0;
    });
    const run = new Function('document', 'renderTemplateAsync', 'chat_metadata', 'callGenericPopup', 'POPUP_TYPE', 'POPUP_RESULT', 't', 'Popup', 'saveMetadata', `let this_chid = 0, characters = [{}]; ${source.slice(start, end).replace('export ', '')}; return setCharacterSettingsOverrides;`)({ createElement: () => wrapper }, async () => '<div></div>', metadata, popup, { TEXT: 1 }, { AFFIRMATIVE: 1 }, strings => strings[0], {}, jest.fn());
    await run();
    expect(metadata.scenario).toBe('old');
    expect(popup).toHaveBeenCalledTimes(1);
});

test('send form restore display is initialized without a jQuery collection', () => {
    const line = source.split('\n').find(value => value.includes('var css_send_form_display ='));
    const display = new Function(`${line}; return css_send_form_display;`)();
    expect(display).toBe('');
});

test('background application updates native background image', () => {
    const start = source.indexOf('export function applyActiveBackground()');
    const end = source.indexOf('export function loadBackgroundSettings(', start);
    const background = { style: {} };
    const run = new Function('document', 'resolveActiveBackgroundUrl', 'chat_metadata', 'background_settings', `${source.slice(start, end).replace('export ', '')}; return applyActiveBackground;`)({ getElementById: () => background }, () => 'url("safe.png")', {}, {});
    run();
    expect(background.style.backgroundImage).toBe('url("safe.png")');
});

test('debounced save activates the native character save control', () => {
    const line = source.split('\n').find(value => value.startsWith('export const saveCharacterDebounced ='));
    const click = jest.fn();
    const run = new Function('document', 'debounce', 'DEFAULT_SAVE_EDIT_TIMEOUT', `${line.replace('export ', '')}; return saveCharacterDebounced;`)({ getElementById: () => ({ click }) }, fn => fn, 0);
    run();
    expect(click).toHaveBeenCalledTimes(1);
});

test('performance search uses visible native input and clears busy state', async () => {
    const start = source.indexOf('async function measureCharacterSearchForPerf(');
    const end = source.indexOf('\n}', start) + 2;
    const hidden = { getClientRects: () => [] };
    const visible = { getClientRects: () => [1], setAttribute: jest.fn() };
    const status = { hidden: true };
    const list = { querySelectorAll: () => [1, 2] };
    let listener;
    const run = new Function('document', 'eventSource', 'event_types', 'entitiesFilter', 'FILTER_TYPES', 'printCharacters', 'performance', `${source.slice(start, end)}; return measureCharacterSearchForPerf;`)({ querySelector: () => list, querySelectorAll: () => [hidden, visible], getElementById: () => status }, { on: (_, fn) => { listener = fn; }, removeListener: jest.fn() }, { CHARACTER_PAGE_LOADED: 'loaded' }, { setFilterData: jest.fn() }, { SEARCH: 'search' }, async () => listener(), { now: () => 1 });
    const result = await run('alice');
    expect(visible.value).toBe('alice');
    expect(visible.setAttribute).toHaveBeenLastCalledWith('aria-busy', 'false');
    expect(status.hidden).toBe(true);
    expect(result.payload.renderedCharacterCount).toBe(2);
});

test('export popup controller shows and hides native popup without altering focus ownership', () => {
    const start = source.indexOf('let exportPopupController = null;');
    const end = source.indexOf('function updateCharacterExportPopupPosition()', start);
    const popup = { style: {} };
    const optionsMenuModuleRef = { createExportPopupController: ports => ports };
    const run = new Function('document', 'optionsMenuModuleRef', 'updateCharacterExportPopupPosition', `${source.slice(start, end)}; return getExportPopupController;`)({ getElementById: () => popup }, optionsMenuModuleRef, jest.fn());
    const controller = run();
    controller.hide();
    expect(popup.style.display).toBe('none');
    controller.show();
    expect(popup.style.display).toBe('block');
});

test('history search focus selects native input after the existing delay', () => {
    const start = source.indexOf('    // UX convenience: Focus the search field');
    const end = source.indexOf('    addChatBackupsBrowser();', start);
    const input = { click: jest.fn(), focus: jest.fn(), select: jest.fn() };
    let delay;
    new Function('document', 'setTimeout', source.slice(start, end))({ getElementById: () => input }, (fn, ms) => { delay = ms; fn(); });
    expect(delay).toBe(200);
    expect(input.click).toHaveBeenCalledTimes(1);
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(input.select).toHaveBeenCalledTimes(1);
});

test('authoring bridge reads title and token summaries from native shell nodes', () => {
    const start = source.indexOf('function getCharacterAuthoringReactBridgeState(');
    const end = source.indexOf('/**', start);
    const nodes = { 'character_popup-button-h3': { textContent: '  Legacy title  ' }, result_info_total_tokens: { textContent: ' 42 ' }, result_info_permanent_tokens: { textContent: ' 5 ' } };
    const draft = { name: '', avatar: '', unsupportedFields: [] };
    const run = new Function('document', 'createCharacterAuthoringDraftFromCreateState', 'getCharacterAuthoringDirtyFields', 'getCharacterManagementDropdownActions', 'getAuthoringAuxWorldNames', `let create_save = {}, world_names = [], power_user = {}; function getCurrentCharacterAuthoringMode(){return 'create';} function getCurrentCharacterAuthoringSource(){return null;} ${source.slice(start, end)}; return getCharacterAuthoringReactBridgeState;`)({ getElementById: id => nodes[id] }, () => draft, () => [], () => [], () => []);
    const state = run();
    expect(state.title).toBe('Legacy title');
    expect(state.tokenSummary).toEqual({ total: '42', permanent: '5' });
});

test('cropped avatar updates native preview and submits the real form before cache refresh', async () => {
    const start = source.indexOf('async function read_avatar_load(');
    const end = source.indexOf('\n}\n\n/**', start) + 2;
    const preview = { src: '', setAttribute(name, value) { this[name] = value; } }, form = {};
    const received = [];
    class Popup { constructor() { this.cropData = { x: 1 }; } async show() { return 'data:image/png;base64,AA'; } }
    class FormData { constructor(element) { received.push(element); } get() { return 'avatar.png'; } }
    const run = new Function('document', 'Popup', 'POPUP_TYPE', 'getBase64Async', 'createOrEditCharacter', 'FormData', 'getThumbnailUrl', 'fetch', 'HTMLImageElement', `let selected_button = 'edit', menu_type = 'edit', create_save = {}, crop_data; ${source.slice(start, end)}; return read_avatar_load;`)({ getElementById: id => id === 'form_create' ? form : preview, querySelectorAll: () => [] }, Popup, { CROP: 5 }, async () => 'data', jest.fn(), FormData, () => '/thumb', jest.fn(), class {});
    await run({ files: [{}] });
    expect(preview.src).toBe('data:image/png;base64,AA');
    expect(received).toEqual([form]);
});

test('replace current chat reflects selected persisted chat in native field', async () => {
    const start = source.indexOf('export async function replaceCurrentChat()');
    const end = source.indexOf('\n}\n', start) + 2;
    const field = { value: '' }, getChat = jest.fn(), save = jest.fn();
    const character = { avatar: 'a.png', chat: '' };
    const run = new Function('document', 'clearChat', 'fetch', 'getRequestHeaders', 'sortMoments', 'timestampToMoment', 'saveCharacterDebounced', 'getChat', `let chat_metadata, characters = [${JSON.stringify(character)}], this_chid = 0; ${source.slice(start, end).replace('export ', '')}; return replaceCurrentChat;`)({ getElementById: () => field }, jest.fn(), async () => ({ ok: true, json: async () => [{ file_name: 'saved.jsonl' }] }), () => ({}), jest.fn(), jest.fn(), save, getChat);
    await run();
    expect(field.value).toBe('saved');
    expect(save).toHaveBeenCalledTimes(1);
    expect(getChat).toHaveBeenCalledTimes(1);
});

test('closing a chat clears the direct character heading and emits chat change', async () => {
    const start = source.indexOf('export async function closeCurrentChat()');
    const end = source.indexOf('\n}\n', start) + 2;
    const heading = { textContent: 'old' };
    const emit = jest.fn();
    const run = new Function('document', 'waitUntilCondition', 'debounce_timeout', 'clearChat', 'setCharacterId', 'setCharacterName', 'setActiveCharacter', 'select_rm_characters', 'eventSource', 'event_types', 'getCurrentChatId', `let is_send_press = false, isChatSaving = false, this_edit_mes_id, chat_metadata, selected_button; ${source.slice(start, end).replace('export ', '')}; return closeCurrentChat;`)({ querySelectorAll: () => [heading] }, async () => {}, { extended: 1 }, async () => {}, jest.fn(), jest.fn(), jest.fn(), jest.fn(), { emit }, { CHAT_CHANGED: 'change' }, () => null);
    expect(await run()).toBe(true);
    expect(heading.textContent).toBe('');
    expect(emit).toHaveBeenCalledWith('change', null);
});

test('character import normalizes the native file type and sends matching multipart field', async () => {
    const start = source.indexOf('async function importCharacter(');
    const end = source.indexOf('async function importFromURL(', start);
    const input = { value: '' };
    const fields = [];
    class FormData { append(...args) { fields.push(args); } }
    const run = new Function('document', 'FormData', 'fetch', 'getRequestHeaders', 'toastr', 't', `let is_send_press = false, characters = [], name1 = 'User'; ${source.slice(start, end)}; return importCharacter;`)({ getElementById: () => input }, FormData, async () => ({ ok: true, json: async () => ({}) }), () => ({}), {}, strings => strings[0]);
    await run({ name: 'CARD.JSON' });
    expect(input.value).toBe('json');
    expect(fields).toContainEqual(['file_type', 'json']);
});

test('removing the last message uses the native row and resolves after motion', async () => {
    const start = source.indexOf('function removeLastMessage()');
    const end = source.indexOf('\n}\n', start) + 2;
    const row = { matches: selector => selector === '.mes', remove: jest.fn() };
    const motion = jest.fn((element, options) => { options.complete(); options.settled(); });
    const run = new Function('chatElement', 'transitionOpacity', 'animation_duration', `${source.slice(start, end)}; return removeLastMessage;`)({ children: [{ matches: () => false }, row] }, motion, 10);
    await run();
    expect(motion).toHaveBeenCalledWith(row, expect.objectContaining({ opacity: 0, duration: 10 }));
    expect(row.remove).toHaveBeenCalledTimes(1);
});

test('dialogue fallback opens native input and renders supplied markup', async () => {
    const helperStart = source.indexOf('function replaceDialogueContent(');
    const end = source.indexOf('export async function saveMetadata(', helperStart);
    const nodes = Object.fromEntries(['dialogue_popup', 'dialogue_popup_cancel', 'dialogue_popup_ok', 'dialogue_popup_input', 'dialogue_popup_text', 'shadow_popup'].map(id => [id, {
        style: {}, dataset: {}, classList: { toggle: jest.fn() }, setAttribute: jest.fn(), focus: jest.fn(), querySelector: () => null, replaceChildren: jest.fn(), insertAdjacentHTML: jest.fn(),
    }]));
    const controller = { callPopup: jest.fn(async () => true) };
    const run = new Function('document', 'globalThis', 'dialogueController', 'transitionOpacity', 'animation_duration', 'animation_easing', 't', 'Node', `let popup_type, dialogueCloseStop; ${source.slice(helperStart, end).replace('export ', '')}; return callPopup;`)({ getElementById: id => nodes[id] }, {}, controller, jest.fn(), 0, 'linear', strings => strings[0], class {});
    await run('<b>hello</b>', 'input', 'alice', { rows: 2 });
    expect(nodes.dialogue_popup_input.value).toBe('alice');
    expect(nodes.dialogue_popup_input.focus).toHaveBeenCalledTimes(1);
    expect(nodes.dialogue_popup_input.setAttribute).toHaveBeenCalledWith('rows', 2);
    expect(nodes.dialogue_popup_text.insertAdjacentHTML).toHaveBeenCalledWith('beforeend', '<b>hello</b>');
    expect(nodes.shadow_popup.style.display).toBe('block');
});
