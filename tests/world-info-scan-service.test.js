import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';
import { EventEmitter } from '../public/lib/eventemitter.js';

// Translation is a browser boundary, not part of the scanner under test.
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ translate: text => text }));

const state = await import('../public/scripts/world-info-state.js');
const { registerWorldInfoShellContext, clearWorldInfoShellContext } = await import('../public/scripts/world-info-shell-context.js');
const { worldInfoRepository } = await import('../public/scripts/world-info-repository.js');
const { WorldInfoBuffer, getSortedEntries, getWorldInfoPrompt } = await import('../public/scripts/world-info-service.js');

let shell;
let events;
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
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
    globalThis.localStorage = originalStorage;
    clearWorldInfoShellContext();
    jest.restoreAllMocks();
});

describe('World Info scan uses confirmed repository data without an editor', () => {
    test('request-scoped scan prompts activate entries without reading or modifying the global prompt map', async () => {
        state.setSelectedWorldInfo(['Book']);
        state.worldInfoCache.set('Book', { entries: { 1: entry(1, 10, { key: ['private-trigger'], content: 'scoped lore' }) } });
        const globalPrompts = { global: { value: 'unrelated', scan: true } };
        const requestPrompts = { scoped: { value: 'private-trigger', scan: true } };
        shell.getExtensionContext = () => ({ extensionPrompts: globalPrompts, tagMap: {} });
        shell.getExtensionPromptByName = async (name, promptMap = globalPrompts) => promptMap[name]?.value ?? '';
        const result = await getWorldInfoPrompt([], 4096, true, undefined, { promptMap: requestPrompts });
        expect(result.worldInfo).toContain('scoped lore');
        expect(globalPrompts).toEqual({ global: { value: 'unrelated', scan: true } });
    });

    test('nested asynchronous request listeners use separate contexts through the real scanner', async () => {
        globalThis.localStorage = { getItem: () => null };
        const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
        const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 1 }));
        const globalPrompts = {};
        const createContext = () => lifecycle.createPromptContext({
            globalPrompts: () => globalPrompts,
            set: (key, value, _position, _depth, scan, _role, _filter, target) => { target[key] = { value, scan }; },
        });
        shell.getExtensionContext = () => ({ extensionPrompts: globalPrompts, tagMap: {} });
        shell.getExtensionPromptByName = async (key, map = globalPrompts) => map[key]?.value ?? '';
        state.setSelectedWorldInfo(['Book']);
        state.worldInfoCache.set('Book', { entries: {
            1: entry(1, 20, { key: ['outer-trigger'], content: 'outer lore' }),
            2: entry(2, 10, { key: ['inner-trigger'], content: 'inner lore' }),
        } });
        const emitter = new EventEmitter();
        const outer = createContext();
        const inner = createContext();
        let innerResult;
        emitter.on('started', async (kind, { promptContext }) => {
            await Promise.resolve();
            promptContext.setWorldInfoScanPrompt(kind, `${kind}-trigger`, 1, 0, true);
            if (kind === 'outer') {
                await emitter.emit('started', 'inner', { promptContext: inner });
                innerResult = await getWorldInfoPrompt([], 4096, true, undefined, { promptMap: inner.scanPrompts() });
            }
        });
        await emitter.emit('started', 'outer', { promptContext: outer });
        const outerResult = await getWorldInfoPrompt([], 4096, true, undefined, { promptMap: outer.scanPrompts() });
        expect(innerResult.worldInfo).toBe('inner lore');
        expect(outerResult.worldInfo).toBe('outer lore');
        expect(globalPrompts).toEqual({});
    });

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

    test.each(['stop', 'chat switch'])('stale scan after %s does not consume new forced activations or publish activation', async () => {
        state.setSelectedWorldInfo(['Book']);
        state.worldInfoCache.set('Book', { entries: { 1: entry(1, 10) } });
        let owns = true;
        let release;
        let entered;
        const waiting = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { entered = resolve; });
        shell.eventSource.emit = async (type, ...args) => {
            events.push([type, ...args]);
            if (type === 'scan') { entered(); await waiting; }
        };
        const pending = getWorldInfoPrompt(['cat'], 4096, false, undefined, { ownsRun: () => owns });
        await started;
        owns = false;
        const newActivation = entry(2, 10, { world: 'Book', content: 'new chat forced' });
        WorldInfoBuffer.externalActivations.set('Book.2', newActivation);
        release();
        await pending;
        expect(WorldInfoBuffer.externalActivations.get('Book.2')).toBe(newActivation);
        expect(events.map(([type]) => type)).not.toContain('activated');
    });

    test('stale scan while book loading is pending does not publish loaded or consume new activations', async () => {
        state.setSelectedWorldInfo(['Book']);
        let owns = true;
        let release;
        let entered;
        const waiting = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { entered = resolve; });
        globalThis.fetch = jest.fn(async () => {
            entered();
            await waiting;
            return { ok: true, json: async () => ({ entries: { 1: entry(1, 10) } }) };
        });
        const pending = getWorldInfoPrompt(['cat'], 4096, false, undefined, { ownsRun: () => owns });
        await started;
        owns = false;
        const activation = entry(2, 10, { world: 'Book' });
        WorldInfoBuffer.externalActivations.set('Book.2', activation);
        release();
        await pending;
        expect(events).toEqual([]);
        expect(WorldInfoBuffer.externalActivations.get('Book.2')).toBe(activation);
    });

    test('typed generation story owner and real scanner share cancellation through the scan port', async () => {
        const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
        const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'chat', contextRevision: 1 }));
        state.setSelectedWorldInfo(['Book']);
        state.worldInfoCache.set('Book', { entries: { 1: entry(1, 10) } });
        let owns = true;
        let release;
        let entered;
        const waiting = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { entered = resolve; });
        shell.eventSource.emit = async type => {
            events.push([type]);
            if (type === 'scan') { entered(); await waiting; }
        };
        const ports = {
            ownsRun: () => owns, quiet: () => 'quiet-token', clearQuiet: jest.fn(),
            scan: (...args) => getWorldInfoPrompt(...args, { ownsRun: () => owns }),
            flush: jest.fn(), inject: jest.fn(), anchor: jest.fn(), render: jest.fn(), clearStory: jest.fn(),
        };
        const pending = lifecycle.assembleWorldInfoStory({ messages: ['cat'], quietPrompt: '', maxContext: 100, dryRun: false, skipWIAN: false, description: '', system: '', characterDepthPrompt: '', creatorNotes: '', scenario: '', character: '', user: '' }, ports);
        await started;
        owns = false;
        const activation = entry(2, 10, { world: 'Book' });
        WorldInfoBuffer.externalActivations.set('Book.2', activation);
        release();
        expect(await pending).toBeNull();
        expect(WorldInfoBuffer.externalActivations.get('Book.2')).toBe(activation);
        expect(events.map(([type]) => type)).not.toContain('activated');
        expect(ports.flush).not.toHaveBeenCalled();
        expect(ports.clearQuiet).toHaveBeenCalledWith('quiet-token');
    });
});
