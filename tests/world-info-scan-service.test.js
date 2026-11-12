import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

// Translation is a browser boundary, not part of the scanner under test.
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

const state = await import('../public/scripts/world-info-state.js');
const { registerWorldInfoShellContext, clearWorldInfoShellContext } = await import('../public/scripts/world-info-shell-context.js');
const { worldInfoRepository } = await import('../public/scripts/world-info-repository.js');
const { WorldInfoBuffer, getSortedEntries, getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');

let shell;
let events;
const originalFetch = globalThis.fetch;
const entry = (uid, order, fields = {}) => ({ uid, order, content: `entry-${uid}`, key: ['cat'], position: 0, ...fields });

beforeEach(() => {
    state.worldInfoCache.clear();
    state.setSelectedWorldInfo([]);
    state.setWorldInfo({});
    WorldInfoBuffer.externalActivations = new Map();
    events = [];
    shell = {
        getRequestHeaders: () => ({}),
        getCurrentCharacterId: () => 0,
        getCharacters: () => [],
        getChatMetadata: () => ({}),
        getCharaFilename: () => 'Character',
        getTagKeyForEntity: () => null,
        getExtensionContext: () => ({ extensionPrompts: {}, tagMap: {} }),
        getExtensionPromptByName: async () => '',
        substituteParams: value => value,
        getRegexedString: jest.fn(value => value),
        regexPlacement: { WORLD_INFO: 5 },
        extensionPromptRoles: { SYSTEM: 0 },
        eventTypes: {
            WORLDINFO_ENTRIES_LOADED: 'loaded', WORLDINFO_SCAN_DONE: 'scan',
            WORLD_INFO_ACTIVATED: 'activated', WORLDINFO_UPDATED: 'updated',
        },
        eventSource: { emit: async (type, ...args) => { events.push([type, ...args]); } },
    };
    registerWorldInfoShellContext(shell);
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    clearWorldInfoShellContext();
    jest.restoreAllMocks();
});

describe('World Info scan uses confirmed repository data without an editor', () => {
    test('deduplicates global/character/chat books and awaits loaded listeners before sorting', async () => {
        state.setSelectedWorldInfo(['Global']);
        state.setWorldInfo({ charLore: [{ name: 'Character', extraBooks: ['Global', 'Chat', 'Extra'] }] });
        shell.getCharacters = () => [{ name: 'Character', data: { extensions: { world: 'CharacterBook' } } }];
        shell.getChatMetadata = () => ({ world_info: 'Chat' });
        for (const [name, uid, order] of [['Global', 1, 20], ['CharacterBook', 2, 10], ['Chat', 3, 1], ['Extra', 4, 30]]) {
            state.worldInfoCache.set(name, { entries: { [uid]: entry(uid, order) } });
        }
        shell.eventSource.emit = async (type, payload) => {
            events.push(type);
            if (type === 'loaded') {
                await Promise.resolve();
                expect(payload.characterLore.map(item => item.world)).toEqual(['CharacterBook', 'Extra']);
                payload.globalLore[0].order = 40;
            }
        };
        const entries = await getSortedEntries();
        expect(entries.map(item => item.world)).toEqual(['Chat', 'Global', 'Extra', 'CharacterBook']);
        expect(events).toEqual(['loaded']);
        expect(state.worldInfoCache.get('Global').entries[1].order).toBe(20);
    });

    test('preserves regex, case and whole-word matching and ignores retired secondary/recursion fields', () => {
        const buffer = new WorldInfoBuffer(['Cat catapult'], {});
        expect(buffer.matchKeys('Cat catapult', 'cat', {})).toBe(true);
        expect(buffer.matchKeys('catapult', 'cat', {})).toBe(false);
        expect(buffer.matchKeys('catapult', 'cat', { matchWholeWords: false })).toBe(true);
        expect(buffer.matchKeys('Cat', 'cat', { caseSensitive: true })).toBe(false);
        expect(buffer.matchKeys('Cat', '/^cat$/i', { caseSensitive: true })).toBe(true);
        expect(buffer.matchKeys('cat', '/cat/g', {})).toBe(true);
        expect(buffer.matchKeys('cat', '/cat/g', {})).toBe(true);
    });

    test('preserves regex placement/depth, awaits scan and activated events, and consumes force activation once', async () => {
        state.setSelectedWorldInfo(['Book']);
        const forced = entry(2, 30, { key: ['not-matched'], content: 'forced', world: 'Book', decorators: [] });
        state.worldInfoCache.set('Book', { entries: {
            1: entry(1, 20, { content: 'top', keysecondary: ['missing'], selective: true, sticky: 4 }),
            2: forced,
            3: entry(3, 10, { position: 4, depth: 7, content: 'depth' }),
        } });
        WorldInfoBuffer.externalActivations.set('Book.2', forced);
        shell.eventSource.emit = async (type, ...args) => {
            await Promise.resolve();
            events.push([type, ...args]);
            if (type === 'scan') args[0].activated.entries.get('Book.1').content = 'listener-top';
        };
        const prompt = await getWorldInfoPrompt(['cat'], 4096, false);
        expect(prompt.worldInfo).toContain('listener-top');
        expect(prompt.worldInfo).toContain('forced');
        expect(prompt.worldInfoDepth).toEqual([{ depth: 7, role: 0, entries: ['depth'] }]);
        expect(shell.getRegexedString).toHaveBeenCalledWith('depth', 5, { depth: 7, isMarkdown: false, isPrompt: true });
        expect(shell.getRegexedString).toHaveBeenCalledWith('listener-top', 5, { depth: null, isMarkdown: false, isPrompt: true });
        expect(events.map(event => event[0])).toEqual(['loaded', 'scan', 'activated']);
        expect(WorldInfoBuffer.externalActivations.size).toBe(0);
        events.length = 0;
        const next = await getWorldInfoPrompt(['cat'], 4096, true);
        expect(next.worldInfo).not.toContain('forced');
        expect(events.map(event => event[0])).toEqual(['loaded', 'scan']);
    });

    test('failed persistence cannot publish draft data to scans; successful retry becomes visible', async () => {
        state.setSelectedWorldInfo(['Book']);
        const old = { entries: { 1: entry(1, 10, { content: 'confirmed' }) } };
        const draft = { entries: { 1: entry(1, 10, { content: 'draft' }) } };
        state.worldInfoCache.set('Book', old);
        globalThis.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce({ ok: true });
        await expect(worldInfoRepository.save('Book', draft)).rejects.toThrow('HTTP 500');
        expect((await getWorldInfoPrompt(['cat'], 4096, true)).worldInfo).toBe('confirmed');
        expect(events.some(event => event[0] === 'updated')).toBe(false);
        await worldInfoRepository.save('Book', draft);
        expect((await getWorldInfoPrompt(['cat'], 4096, true)).worldInfo).toBe('draft');
        expect(events.filter(event => event[0] === 'updated')).toHaveLength(1);
    });
});
