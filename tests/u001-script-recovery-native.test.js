import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const start = source.indexOf('function clearGenerationAutoRecoveryStatus(');
const end = source.indexOf('export function scrollOnMediaLoad(', start);
const code = source.slice(start, end).replace('export async function redisplayChat', 'async function redisplayChat');

function harness(react = false) {
    const events = [];
    const rows = [];
    function makeElement(tag = 'div') {
        return {
            tag, attributes: {}, children: [], textContent: '', className: '',
            setAttribute(name, value) { this.attributes[name] = value; },
            append(...nodes) { this.children.push(...nodes); },
        };
    }
    function row(id) {
        const parts = {};
        const result = { id: String(id), classes: new Set(['last_mes']), parts,
            classList: { remove: value => result.classes.delete(value), add: value => result.classes.add(value) },
            remove() { rows.splice(rows.indexOf(result), 1); },
            getAttribute(name) { return name === 'mesid' ? this.id : null; },
            matches(selector) { return selector === '.mes'; },
            get nextElementSibling() { return rows[rows.indexOf(this) + 1] ?? null; },
            querySelectorAll(selector) { return selector.split(', ').flatMap(part => parts[part] ?? []); },
        };
        const text = { innerHTML: 'old', after(node) {
            const key = `.${node.className}`; const target = parts[key] ??= []; target.push(node);
            node.remove = () => target.splice(target.indexOf(node), 1);
        } };
        parts['.mes_text'] = [text];
        parts['.mes_reasoning'] = [{ innerHTML: 'reasoning' }];
        rows.push(result); return result;
    }
    const root = {
        querySelectorAll(selector) { const match = selector.match(/^\.mes\[mesid="(.*)"\]$/); return match ? rows.filter(r => r.id === match[1]) : selector === '.mes' ? [...rows] : []; },
        append(...nodes) { rows.push(...nodes); events.push('append'); },
    };
    const document = { createElement: makeElement };
    const state = { chat: [{ mes: 'old', extra: { reasoning: 'old' } }], rows, root, row, events };
    const env = { document, chatRoot: root, chatElement: { find: () => { throw Error('recovery must not traverse jQuery'); } }, chat: state.chat,
        isReactMainChatOwner: () => react, setMainChatMessageUiState: (...args) => events.push(['ui', ...args]),
        clearMainChatMessageUiState: (...args) => events.push(['clear-ui', ...args]),
        mountReactMainChatMessageListPanel: () => events.push('mount'), scheduleMainChatMessageListPanelRefresh: () => events.push('refresh'),
        updateMessageElement: (message, opts) => { events.push(['render', opts.messageId, opts.messageElement]); return opts.messageElement ?? { nodeType: 1, classList: { add() {} }, id: String(opts.messageId) }; },
        replaceGenerationRecoveryMessage: async (id, options) => { options.render({ mes: 'new' }, id); events.push('replaced'); },
        SCROLL_BEHAVIOR: { ADJUST: 'adjust' }, performance: { now: () => 0 }, lodash: { range: (a, b) => Array.from({ length: b - a }, (_, i) => a + i) },
        applyCharacterTagsToMessageDivs: () => events.push('tags'), applyStylePins: () => events.push('pins'), updateEditArrowClasses: () => events.push('arrows'),
        t: strings => strings[0], console: { info() {} },
    };
    const functions = new Function(...Object.keys(env), `${code}; return { clearGenerationAutoRecoveryStatus, showGenerationAutoRecoveryStatus, clearGenerationAttemptMessage, replaceAssistantRecoveryMessage, showGenerationFailureRecovery, redisplayChat };`)(...Object.values(env));
    return { ...state, ...functions };
}

test('recovery clears model state and refreshes the React projection', async () => {
    const h = harness(); const r = h.row(0);
    h.clearGenerationAttemptMessage(0);
    expect(h.chat[0].mes).toBe(''); expect(h.chat[0].extra.reasoning).toBeUndefined();
    expect(r.parts['.mes_text'][0].innerHTML).toBe('old'); expect(r.parts['.mes_reasoning'][0].innerHTML).toBe('reasoning');
    expect(h.events).toContainEqual(['clear-ui', 0]);
    await h.replaceAssistantRecoveryMessage(0, {});
    expect(h.events).toContain('refresh');
    expect(h.events.indexOf('refresh')).toBeLessThan(h.events.indexOf('replaced'));
});

test('recovery status and failure notice update React UI state', () => {
    const h = harness();
    h.showGenerationAutoRecoveryStatus(0, 'retry', 'fallback');
    expect(h.events).toContainEqual(['ui', 0, { recoveryStatus: 'retry', recoveryStage: 'fallback', failureNoticeVisible: false }]);
    h.clearGenerationAutoRecoveryStatus(0);
    expect(h.events).toContainEqual(['ui', 0, { recoveryStatus: null, recoveryStage: null, failureNoticeVisible: false }]);
    h.showGenerationFailureRecovery(0);
    expect(h.events).toContainEqual(['ui', 0, { recoveryStatus: null, recoveryStage: null, failureNoticeVisible: true }]);
});

test('redisplay schedules the React projection without mutating existing rows', async () => {
    const h = harness(); const first = h.row(0); h.row(1); h.row(2);
    await h.redisplayChat({ targetChat: [{}, {}, {}], startIndex: 1 });
    expect(h.rows.map(item => item.id)).toEqual(['0', '1', '2']);
    expect(first.classes.has('last_mes')).toBe(true);
    expect(h.events).toContain('mount');
});

test('React recovery and redisplay retain projection ownership', async () => {
    const h = harness(true); h.row(0);
    h.showGenerationFailureRecovery(0); await h.replaceAssistantRecoveryMessage(0, {}); await h.redisplayChat({ targetChat: [] });
    expect(h.events).toContain('refresh'); expect(h.events).toContain('mount');
    expect(h.events.some(event => Array.isArray(event) && event[0] === 'render')).toBe(false);
    expect(h.rows).toHaveLength(1);
});

test('message shell receives a native chat root while DOM handlers retain their collection', () => {
    const root = { name: 'root' }, legacy = { jquery: '3.5.1' };
    expect(source).not.toContain('get messageTemplate()');
    function getter(contextName) {
        const start = source.indexOf(`${contextName}({`);
        const snippet = source.slice(start, source.indexOf('});', start));
        return snippet.match(/get chatElement\(\) \{ return (\w+); \}/)?.[1];
    }
    const resolveGetter = name => ({ chatRoot: root, chatElement: legacy }[getter(name)]);
    expect(resolveGetter('registerMessageShellContext')).toBe(root);
    expect(resolveGetter('registerChatOpsShellContext')).toBe(root);
    expect(resolveGetter('registerGenerationShellContext')).toBe(root);
    expect(resolveGetter('registerDomHandlersShellContext')).toBe(legacy);
});

test('media-load scrolling observes native media and ignores stale generations', () => {
    const start = source.indexOf('export function scrollOnMediaLoad(');
    const end = source.indexOf('/**\n * Cancels the debounced chat save', start);
    const mediaCode = source.slice(start, end).replace('export ', '');
    class Image { constructor() { this.complete = false; this.listeners = {}; } addEventListener(type, handler) { this.listeners[type] = handler; } }
    class Media {} Media.HAVE_CURRENT_DATA = 2;
    const image = new Image(); const root = { querySelectorAll: () => [image] }; const scroll = jest.fn();
    const load = new Function('chatRoot', 'chatElement', 'HTMLImageElement', 'HTMLMediaElement', 'scrollChatToBottom', `let mainChatMessageRenderGeneration = 2; ${mediaCode}; return scrollOnMediaLoad;`)(root, { find: () => { throw Error('media scrolling must not use jQuery'); } }, Image, Media, scroll);
    load(1); expect(Object.keys(image.listeners)).toHaveLength(0);
    load(2); expect(scroll).not.toHaveBeenCalled(); image.listeners.load();
    expect(scroll).toHaveBeenCalledWith({ waitForFrame: true });
});
