import { expect, test } from '@jest/globals';

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

test('runtime composition registers events and slash commands once', async () => {
    const { createWorldInfoRuntimeInitializer } = await import('../public/scripts/world-info-runtime.js');
    const handlers = new Map();
    let registrations = 0;
    let activations = new Map();
    const initialize = createWorldInfoRuntimeInitializer({
        eventSource: { on: (name, handler) => handlers.set(name, handler) },
        eventTypes: { CHAT_CHANGED: 'chat', WORLDINFO_FORCE_ACTIVATE: 'force' },
        getChatWorld: () => 'book', getWorldNames: () => ['book'],
        setChatWorldActive: () => {}, getSortedEntries: async () => [],
        getExternalActivations: () => activations, registerSlashCommands: () => registrations++,
    });
    initialize(); initialize();
    expect(registrations).toBe(1);
    expect(handlers.size).toBe(2);
    activations = new Map(); // the scan service replaces this map after consuming activations
    handlers.get('force')([{ world: 'book', uid: 1 }]);
    expect(activations.has('book.1')).toBe(true);
});
