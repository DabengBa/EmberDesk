import { expect, jest, test } from '@jest/globals';
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

test('editor composition owns one session and synchronizes live world lists', async () => {
    const { createWorldInfoEditorComposition } = await import('../public/scripts/world-info-editor-composition.js');
    let worldNames = ['one'];
    let active = ['one'];
    const observed = [];
    let count = 0;
    const getSession = createWorldInfoEditorComposition({
        getWorldNames: () => worldNames, getSelectedWorldInfo: () => active,
        createSession: options => {
            count++;
            observed.push(options);
            return {
                setWorldNames: names => observed.push(['names', names]),
                setSelectedWorldInfo: names => observed.push(['active', names]),
            };
        },
    });
    const first = getSession();
    worldNames = ['two']; active = ['two'];
    expect(getSession()).toBe(first);
    expect(count).toBe(1);
    expect(observed.slice(-2)).toEqual([['names', ['two']], ['active', ['two']]]);
});

test('runtime composition registers events once without a command subsystem', async () => {
    const { createWorldInfoRuntimeInitializer } = await import('../public/scripts/world-info-runtime.js');
    const handlers = new Map();
    let activations = new Map();
    const active = [];
    const initialize = createWorldInfoRuntimeInitializer({
        eventSource: { on: (name, handler) => handlers.set(name, handler) },
        eventTypes: { CHAT_CHANGED: 'chat', WORLDINFO_FORCE_ACTIVATE: 'force' },
        getChatWorld: () => 'book', getWorldNames: () => ['book'],
        setChatWorldActive: value => active.push(value), getSortedEntries: async () => [],
        getExternalActivations: () => activations,
    });
    initialize(); initialize();
    expect(handlers.size).toBe(2);
    await handlers.get('chat')();
    expect(active).toEqual([true]);
    activations = new Map(); // the scan service replaces this map after consuming activations
    handlers.get('force')([{ world: 'book', uid: 1 }]);
    expect(activations.has('book.1')).toBe(true);
});

test('reference UI forwards explicit names to the existing global command without reading DOM', async () => {
    const { createWorldInfoReferenceUi } = await import('../public/scripts/world-info-reference-ui.js');
    const setGlobal = jest.fn(names => names);
    const ui = createWorldInfoReferenceUi({ setWorldInfoGlobalActiveNames: setGlobal });
    expect(ui.onWorldInfoChange(['book', 'missing'])).toEqual(['book', 'missing']);
    expect(setGlobal).toHaveBeenCalledTimes(1);
    expect(setGlobal).toHaveBeenCalledWith(['book', 'missing']);
});
